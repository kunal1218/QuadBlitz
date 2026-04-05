import { randomUUID } from "crypto";
import { getRedis } from "../db/redis";
import {
  judgePlayTaskSubmission,
  type PlayJudgeVerdict,
} from "./geminiJudgeService";

export class PlayRoomError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PlayCharacterId =
  | "rook"
  | "penguin"
  | "businessman"
  | "dog"
  | "mug";

export type PlayRoomPhase =
  | "lobby"
  | "character_select"
  | "shared_room"
  | "task_reveal";

export type { PlayJudgeDecision, PlayJudgeVerdict } from "./geminiJudgeService";

export type PlayTaskCategory = "weekly" | "daily";

export type PlayTaskPayload = {
  id: string;
  category: PlayTaskCategory;
  text: string;
  hasPlaceholderSlot?: boolean;
  placeholderLabel?: string;
};

type Vector2 = {
  x: number;
  y: number;
};

type PlayRoomPlayer = {
  userId: string;
  name: string;
  handle: string;
  joinedAt: string;
  isHost: boolean;
  selectedCharacter: PlayCharacterId | null;
  selectedAt: string | null;
  position: Vector2;
  isReadyAtPedestal: boolean;
  taskSubmissionText: string | null;
  taskSubmittedAt: string | null;
  taskJudgeVerdict: PlayJudgeVerdict | null;
};

type PlayRoom = {
  roomCode: string;
  hostUserId: string;
  phase: PlayRoomPhase;
  createdAt: string;
  updatedAt: string;
  players: PlayRoomPlayer[];
  selectedTask: PlayTaskPayload | null;
};

export type PlayRoomClientState = {
  roomCode: string;
  hostUserId: string;
  phase: PlayRoomPhase;
  minPlayersToStart: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
  room: {
    width: number;
    height: number;
    pedestal: {
      x: number;
      y: number;
      interactionRadius: number;
    };
    judge: {
      x: number;
      y: number;
      interactionRadius: number;
    };
  };
  players: Array<{
    userId: string;
    name: string;
    handle: string;
    joinedAt: string;
    isHost: boolean;
    selectedCharacter: PlayCharacterId | null;
    selectedAt: string | null;
    position: Vector2;
    isReadyAtPedestal: boolean;
    taskSubmission: {
      submittedAt: string | null;
      verdict: PlayJudgeVerdict | null;
    };
  }>;
  selectedTask: PlayTaskPayload | null;
};

export type PlayRoomPositionsState = {
  roomCode: string;
  players: Array<{
    userId: string;
    position: Vector2;
  }>;
};

const ROOM_WIDTH = 920;
const ROOM_HEIGHT = 560;
const PLAYER_MARGIN = 56;
const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS = 5;
const ROOM_CODE_LENGTH = 5;
const SESSION_TTL_SECONDS = 60 * 60 * 6;
const PLAYROOMS_KEY = "playroom:rooms";
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PEDESTAL = {
  x: 0,
  y: 0,
  interactionRadius: 104,
};
const JUDGE = {
  x: 0,
  y: -208,
  interactionRadius: 104,
};
const SPAWN_POINTS: Vector2[] = [
  { x: -280, y: -150 },
  { x: 280, y: -150 },
  { x: -280, y: 150 },
  { x: 280, y: 150 },
  { x: 0, y: 190 },
];
const TASK_POOL: PlayTaskPayload[] = [
  {
    id: "weekly-minecraft-chair",
    category: "weekly",
    text: "Make a build in Minecraft. Alternatively, draw a chair.",
  },
  {
    id: "weekly-haiku-rap",
    category: "weekly",
    text: "Write a haiku or a short rap.",
  },
  {
    id: "weekly-show-and-tell",
    category: "weekly",
    text: "Show and tell: record yourself explaining something obscure or surprising.",
  },
  {
    id: "weekly-cook-meal",
    category: "weekly",
    text: "Cook a meal and take a picture.",
  },
  {
    id: "weekly-translate",
    category: "weekly",
    text: "Use Google Translate for something funny or unexpected.",
  },
  {
    id: "weekly-drawing-guessing",
    category: "weekly",
    text: "Play a simple drawing/guessing challenge inspired by party drawing games.",
  },
  {
    id: "weekly-spotify-transition",
    category: "weekly",
    text: "Give your best Spotify transition.",
  },
  {
    id: "weekly-small-talk",
    category: "weekly",
    text: "Initiate awkward small talk with person X.",
  },
  {
    id: "weekly-overshare",
    category: "weekly",
    text: "Share something nobody needed to know.",
  },
  {
    id: "weekly-order-item",
    category: "weekly",
    text: "Everyone orders each other a cheap novelty item.",
  },
  {
    id: "weekly-slides",
    category: "weekly",
    text: "Do a short slide presentation on topic X.",
  },
  {
    id: "daily-67",
    category: "daily",
    text: 'Type "67".',
  },
  {
    id: "daily-name-group",
    category: "daily",
    text: "Name this group.",
    hasPlaceholderSlot: true,
    placeholderLabel: "Placeholder image/content slot",
  },
];

const memoryRooms = new Map<string, PlayRoom>();
const memoryPlayerRooms = new Map<string, string>();
const memoryRoomIds = new Set<string>();

const normalizeHandle = (handle?: string | null) =>
  handle ? handle.replace(/^@/, "") : "";

const getRoomKey = (roomCode: string) => `playroom:room:${roomCode}`;
const getPlayerRoomKey = (userId: string) => `playroom:player:${userId}`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const cloneTask = (task: PlayTaskPayload) => ({ ...task });
const cloneJudgeVerdict = (verdict: PlayJudgeVerdict) => ({ ...verdict });
const emptyTaskSubmission = () => ({
  taskSubmissionText: null,
  taskSubmittedAt: null,
  taskJudgeVerdict: null as PlayJudgeVerdict | null,
});

const cloneRoom = (room: PlayRoom): PlayRoom => ({
  ...room,
  players: room.players.map((player) => ({
    ...player,
    position: { ...player.position },
    taskJudgeVerdict: player.taskJudgeVerdict
      ? cloneJudgeVerdict(player.taskJudgeVerdict)
      : null,
  })),
  selectedTask: room.selectedTask ? cloneTask(room.selectedTask) : null,
});

const normalizeRoom = (room: PlayRoom): PlayRoom => {
  const normalizedPlayers = room.players
    .slice(0, MAX_PLAYERS)
    .map((player, index) => ({
      userId: player.userId,
      name: player.name,
      handle: normalizeHandle(player.handle),
      joinedAt: player.joinedAt ?? new Date().toISOString(),
      isHost: index === 0 ? true : player.userId === room.hostUserId,
      selectedCharacter: player.selectedCharacter ?? null,
      selectedAt: player.selectedAt ?? null,
      position: {
        x: clamp(player.position?.x ?? 0, -ROOM_WIDTH / 2 + PLAYER_MARGIN, ROOM_WIDTH / 2 - PLAYER_MARGIN),
        y: clamp(
          player.position?.y ?? 0,
          -ROOM_HEIGHT / 2 + PLAYER_MARGIN,
          ROOM_HEIGHT / 2 - PLAYER_MARGIN
        ),
      },
      isReadyAtPedestal: Boolean(player.isReadyAtPedestal),
      taskSubmissionText:
        typeof player.taskSubmissionText === "string" ? player.taskSubmissionText : null,
      taskSubmittedAt:
        typeof player.taskSubmittedAt === "string" ? player.taskSubmittedAt : null,
      taskJudgeVerdict:
        player.taskJudgeVerdict && typeof player.taskJudgeVerdict === "object"
          ? cloneJudgeVerdict(player.taskJudgeVerdict)
          : null,
    }));
  const hostUserId =
    normalizedPlayers.find((player) => player.userId === room.hostUserId)?.userId ??
    normalizedPlayers[0]?.userId ??
    room.hostUserId;
  return {
    roomCode: room.roomCode,
    hostUserId,
    phase: room.phase ?? "lobby",
    createdAt: room.createdAt ?? new Date().toISOString(),
    updatedAt: room.updatedAt ?? new Date().toISOString(),
    players: normalizedPlayers.map((player) => ({
      ...player,
      isHost: player.userId === hostUserId,
    })),
    selectedTask: room.selectedTask ? cloneTask(room.selectedTask) : null,
  };
};

const serializeRoomState = (room: PlayRoom): PlayRoomClientState => ({
  roomCode: room.roomCode,
  hostUserId: room.hostUserId,
  phase: room.phase,
  minPlayersToStart: MIN_PLAYERS_TO_START,
  maxPlayers: MAX_PLAYERS,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
  room: {
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
    pedestal: {
      ...PEDESTAL,
    },
    judge: {
      ...JUDGE,
    },
  },
  players: room.players.map((player) => ({
    userId: player.userId,
    name: player.name,
    handle: player.handle,
    joinedAt: player.joinedAt,
    isHost: player.isHost,
    selectedCharacter: player.selectedCharacter,
    selectedAt: player.selectedAt,
    position: { ...player.position },
    isReadyAtPedestal: player.isReadyAtPedestal,
    taskSubmission: {
      submittedAt: player.taskSubmittedAt,
      verdict: player.taskJudgeVerdict ? cloneJudgeVerdict(player.taskJudgeVerdict) : null,
    },
  })),
  selectedTask: room.selectedTask ? cloneTask(room.selectedTask) : null,
});

const serializeRoomPositions = (room: PlayRoom): PlayRoomPositionsState => ({
  roomCode: room.roomCode,
  players: room.players.map((player) => ({
    userId: player.userId,
    position: { ...player.position },
  })),
});

const readRoomIds = async () => {
  const redis = await getRedis();
  if (redis) {
    return redis.sMembers(PLAYROOMS_KEY);
  }
  return Array.from(memoryRoomIds);
};

const saveRoom = async (room: PlayRoom) => {
  room.updatedAt = new Date().toISOString();
  const normalized = normalizeRoom(room);
  const redis = await getRedis();
  if (redis) {
    await redis.set(getRoomKey(normalized.roomCode), JSON.stringify(normalized), {
      EX: SESSION_TTL_SECONDS,
    });
    await redis.sAdd(PLAYROOMS_KEY, normalized.roomCode);
    return normalized;
  }
  memoryRooms.set(normalized.roomCode, cloneRoom(normalized));
  memoryRoomIds.add(normalized.roomCode);
  return normalized;
};

const removeRoomId = async (roomCode: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.sRem(PLAYROOMS_KEY, roomCode);
    return;
  }
  memoryRoomIds.delete(roomCode);
};

const removeRoom = async (roomCode: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.del(getRoomKey(roomCode));
    await redis.sRem(PLAYROOMS_KEY, roomCode);
    return;
  }
  memoryRooms.delete(roomCode);
  memoryRoomIds.delete(roomCode);
};

const loadRoom = async (roomCode: string): Promise<PlayRoom | null> => {
  const normalizedCode = roomCode.trim().toUpperCase();
  const redis = await getRedis();
  if (redis) {
    const raw = await redis.get(getRoomKey(normalizedCode));
    if (!raw) {
      await removeRoomId(normalizedCode);
      return null;
    }
    try {
      return normalizeRoom(JSON.parse(raw) as PlayRoom);
    } catch {
      await removeRoom(normalizedCode);
      return null;
    }
  }
  const room = memoryRooms.get(normalizedCode);
  return room ? cloneRoom(normalizeRoom(room)) : null;
};

const setPlayerRoomCode = async (userId: string, roomCode: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.set(getPlayerRoomKey(userId), roomCode, { EX: SESSION_TTL_SECONDS });
    return;
  }
  memoryPlayerRooms.set(userId, roomCode);
};

const clearPlayerRoomCode = async (userId: string) => {
  const redis = await getRedis();
  if (redis) {
    await redis.del(getPlayerRoomKey(userId));
    return;
  }
  memoryPlayerRooms.delete(userId);
};

const getPlayerRoomCode = async (userId: string): Promise<string | null> => {
  const redis = await getRedis();
  if (redis) {
    return redis.get(getPlayerRoomKey(userId));
  }
  return memoryPlayerRooms.get(userId) ?? null;
};

const getPlayerIndex = (room: PlayRoom, userId: string) =>
  room.players.findIndex((player) => player.userId === userId);

const getPlayer = (room: PlayRoom, userId: string) =>
  room.players.find((player) => player.userId === userId) ?? null;

const pickTask = () => {
  const task = TASK_POOL[Math.floor(Math.random() * TASK_POOL.length)];
  return task ? cloneTask(task) : null;
};

const applySharedRoomSpawnPoints = (room: PlayRoom) => {
  room.players = room.players.map((player, index) => ({
    ...player,
    position: { ...(SPAWN_POINTS[index] ?? SPAWN_POINTS[SPAWN_POINTS.length - 1] ?? { x: 0, y: 0 }) },
    isReadyAtPedestal: false,
    ...emptyTaskSubmission(),
  }));
};

const synchronizeRoomPhase = (room: PlayRoom) => {
  if (room.players.length === 0) {
    return room;
  }

  if (!room.players.some((player) => player.userId === room.hostUserId)) {
    room.hostUserId = room.players[0]!.userId;
  }

  room.players = room.players.map((player) => ({
    ...player,
    isHost: player.userId === room.hostUserId,
  }));

  if (room.phase === "lobby" && room.players.length >= MIN_PLAYERS_TO_START) {
    room.phase = "character_select";
    room.selectedTask = null;
    room.players = room.players.map((player) => ({
      ...player,
      selectedCharacter: null,
      selectedAt: null,
      isReadyAtPedestal: false,
      ...emptyTaskSubmission(),
    }));
    return room;
  }

  if (room.phase === "character_select" && room.players.length < MIN_PLAYERS_TO_START) {
    room.phase = "lobby";
    room.selectedTask = null;
    room.players = room.players.map((player) => ({
      ...player,
      selectedCharacter: null,
      selectedAt: null,
      isReadyAtPedestal: false,
      ...emptyTaskSubmission(),
    }));
    return room;
  }

  if (
    room.phase === "character_select" &&
    room.players.length >= MIN_PLAYERS_TO_START &&
    room.players.every((player) => Boolean(player.selectedCharacter))
  ) {
    room.phase = "shared_room";
    room.selectedTask = null;
    applySharedRoomSpawnPoints(room);
    return room;
  }

  if (
    (room.phase === "shared_room" || room.phase === "task_reveal") &&
    !room.selectedTask &&
    room.players.length > 0 &&
    room.players.every((player) => player.isReadyAtPedestal)
  ) {
    room.phase = "task_reveal";
    room.selectedTask = pickTask();
  }

  return room;
};

const saveOrDeleteRoom = async (room: PlayRoom | null) => {
  if (!room || room.players.length === 0) {
    if (room?.roomCode) {
      await removeRoom(room.roomCode);
    }
    return null;
  }
  synchronizeRoomPhase(room);
  return saveRoom(room);
};

const removePlayerFromRoom = async (room: PlayRoom, userId: string) => {
  room.players = room.players.filter((player) => player.userId !== userId);
  await clearPlayerRoomCode(userId);
  return saveOrDeleteRoom(room);
};

const leaveExistingRoomIfNeeded = async (userId: string) => {
  const previousRoomCode = await getPlayerRoomCode(userId);
  if (!previousRoomCode) {
    return { previousRoomCode: null as string | null, updatedRoomCodes: [] as string[] };
  }
  const previousRoom = await loadRoom(previousRoomCode);
  if (!previousRoom) {
    await clearPlayerRoomCode(userId);
    return { previousRoomCode, updatedRoomCodes: [] as string[] };
  }
  const updatedPreviousRoom = await removePlayerFromRoom(previousRoom, userId);
  return {
    previousRoomCode,
    updatedRoomCodes: updatedPreviousRoom ? [updatedPreviousRoom.roomCode] : previousRoomCode ? [previousRoomCode] : [],
  };
};

const generateRoomCode = async () => {
  const activeCodes = new Set((await readRoomIds()).map((code) => code.toUpperCase()));
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let nextCode = "";
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      nextCode += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)] ?? "A";
    }
    if (!activeCodes.has(nextCode)) {
      return nextCode;
    }
  }
  return randomUUID().slice(0, ROOM_CODE_LENGTH).toUpperCase();
};

const createPlayer = (params: {
  userId: string;
  name: string;
  handle: string;
  isHost?: boolean;
}): PlayRoomPlayer => ({
  userId: params.userId,
  name: params.name.trim() || "Player",
  handle: normalizeHandle(params.handle) || "player",
  joinedAt: new Date().toISOString(),
  isHost: Boolean(params.isHost),
  selectedCharacter: null,
  selectedAt: null,
  position: { x: 0, y: 0 },
  isReadyAtPedestal: false,
  ...emptyTaskSubmission(),
});

export const createPlayRoom = async (params: {
  userId: string;
  name: string;
  handle: string;
}) => {
  const cleanedUp = await leaveExistingRoomIfNeeded(params.userId);
  const roomCode = await generateRoomCode();
  const now = new Date().toISOString();
  const room = await saveRoom({
    roomCode,
    hostUserId: params.userId,
    phase: "lobby",
    createdAt: now,
    updatedAt: now,
    players: [createPlayer({ ...params, isHost: true })],
    selectedTask: null,
  });
  await setPlayerRoomCode(params.userId, room.roomCode);
  return {
    roomCode: room.roomCode,
    updatedRoomCodes: Array.from(new Set([...cleanedUp.updatedRoomCodes, room.roomCode])),
  };
};

export const joinPlayRoom = async (params: {
  userId: string;
  name: string;
  handle: string;
  roomCode: string;
}) => {
  const requestedRoomCode = params.roomCode.trim().toUpperCase();
  if (!requestedRoomCode) {
    throw new PlayRoomError("Room code is required.");
  }

  const currentRoomCode = await getPlayerRoomCode(params.userId);
  const cleanedUp =
    currentRoomCode && currentRoomCode.toUpperCase() === requestedRoomCode
      ? { previousRoomCode: currentRoomCode, updatedRoomCodes: [] as string[] }
      : await leaveExistingRoomIfNeeded(params.userId);
  const room = await loadRoom(requestedRoomCode);
  if (!room) {
    throw new PlayRoomError("That room could not be found.", 404);
  }
  if (
    room.phase !== "lobby" &&
    room.phase !== "character_select" &&
    getPlayerIndex(room, params.userId) === -1
  ) {
    throw new PlayRoomError("That room has already started.");
  }

  const existingPlayerIndex = getPlayerIndex(room, params.userId);
  if (existingPlayerIndex >= 0) {
    room.players[existingPlayerIndex] = {
      ...room.players[existingPlayerIndex]!,
      name: params.name.trim() || room.players[existingPlayerIndex]!.name,
      handle: normalizeHandle(params.handle) || room.players[existingPlayerIndex]!.handle,
    };
  } else {
    if (room.players.length >= MAX_PLAYERS) {
      throw new PlayRoomError("That room is already full.");
    }
    room.players.push(createPlayer(params));
  }

  const savedRoom = await saveOrDeleteRoom(room);
  if (!savedRoom) {
    throw new PlayRoomError("Unable to join that room.");
  }
  await setPlayerRoomCode(params.userId, savedRoom.roomCode);
  return {
    roomCode: savedRoom.roomCode,
    updatedRoomCodes: Array.from(new Set([...cleanedUp.updatedRoomCodes, savedRoom.roomCode])),
  };
};

export const leavePlayRoom = async (userId: string) => {
  const roomCode = await getPlayerRoomCode(userId);
  if (!roomCode) {
    return { updatedRoomCodes: [] as string[] };
  }
  const room = await loadRoom(roomCode);
  await clearPlayerRoomCode(userId);
  if (!room) {
    return { updatedRoomCodes: [] as string[] };
  }
  const updatedRoom = await removePlayerFromRoom(room, userId);
  return {
    updatedRoomCodes: updatedRoom ? [updatedRoom.roomCode] : [roomCode],
  };
};

export const forceRemovePlayRoomUser = async (userId: string) => leavePlayRoom(userId);

export const getPlayRoomStateForUser = async (userId: string) => {
  const roomCode = await getPlayerRoomCode(userId);
  if (!roomCode) {
    return { roomCode: null, state: null as PlayRoomClientState | null };
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    await clearPlayerRoomCode(userId);
    return { roomCode: null, state: null as PlayRoomClientState | null };
  }
  if (getPlayerIndex(room, userId) === -1) {
    await clearPlayerRoomCode(userId);
    return { roomCode: null, state: null as PlayRoomClientState | null };
  }
  return {
    roomCode: room.roomCode,
    state: serializeRoomState(room),
  };
};

export const getPlayRoomState = async (roomCode: string) => {
  const room = await loadRoom(roomCode);
  return room ? serializeRoomState(room) : null;
};

export const getPlayRoomPositions = async (roomCode: string) => {
  const room = await loadRoom(roomCode);
  return room ? serializeRoomPositions(room) : null;
};

export const lockPlayRoomCharacter = async (params: {
  userId: string;
  characterId: PlayCharacterId;
}) => {
  const roomCode = await getPlayerRoomCode(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "character_select") {
    throw new PlayRoomError("Character selection is not active.");
  }
  const player = getPlayer(room, params.userId);
  if (!player) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }
  if (player.selectedCharacter) {
    throw new PlayRoomError("Your character is already locked in.");
  }
  const takenBy = room.players.find(
    (candidate) =>
      candidate.userId !== params.userId &&
      candidate.selectedCharacter === params.characterId
  );
  if (takenBy) {
    throw new PlayRoomError(`${takenBy.name} already locked that character.`);
  }
  player.selectedCharacter = params.characterId;
  player.selectedAt = new Date().toISOString();
  const savedRoom = await saveOrDeleteRoom(room);
  if (!savedRoom) {
    throw new PlayRoomError("Unable to lock in your character.");
  }
  return { roomCode: savedRoom.roomCode };
};

export const movePlayRoomPlayer = async (params: {
  userId: string;
  positionX: number;
  positionY: number;
}) => {
  const roomCode = await getPlayerRoomCode(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("The shared room is not active.");
  }
  const player = getPlayer(room, params.userId);
  if (!player) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }
  player.position = {
    x: clamp(
      Number.isFinite(params.positionX) ? params.positionX : player.position.x,
      -ROOM_WIDTH / 2 + PLAYER_MARGIN,
      ROOM_WIDTH / 2 - PLAYER_MARGIN
    ),
    y: clamp(
      Number.isFinite(params.positionY) ? params.positionY : player.position.y,
      -ROOM_HEIGHT / 2 + PLAYER_MARGIN,
      ROOM_HEIGHT / 2 - PLAYER_MARGIN
    ),
  };
  const savedRoom = await saveOrDeleteRoom(room);
  if (!savedRoom) {
    throw new PlayRoomError("Unable to move player.");
  }
  return {
    roomCode: savedRoom.roomCode,
    positions: serializeRoomPositions(savedRoom),
  };
};

export const readyPlayRoomPlayer = async (userId: string) => {
  const roomCode = await getPlayerRoomCode(userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    await clearPlayerRoomCode(userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("The ready button is not active yet.");
  }
  const player = getPlayer(room, userId);
  if (!player) {
    await clearPlayerRoomCode(userId);
    throw new PlayRoomError("You are not in that room.");
  }
  const distance = Math.hypot(player.position.x - PEDESTAL.x, player.position.y - PEDESTAL.y);
  if (distance > PEDESTAL.interactionRadius) {
    throw new PlayRoomError("Move closer to the pedestal to press ready.");
  }
  player.isReadyAtPedestal = true;
  const savedRoom = await saveOrDeleteRoom(room);
  if (!savedRoom) {
    throw new PlayRoomError("Unable to mark ready.");
  }
  return { roomCode: savedRoom.roomCode };
};

export const submitPlayRoomTask = async (params: {
  userId: string;
  submission: string;
}) => {
  const roomCode = await getPlayerRoomCode(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }

  const submission = params.submission.trim().slice(0, 1500);
  if (!submission) {
    throw new PlayRoomError("Write a short submission for the judge.");
  }

  const room = await loadRoom(roomCode);
  if (!room) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "task_reveal" || !room.selectedTask) {
    throw new PlayRoomError("The judge only accepts submissions after the task is revealed.");
  }

  const player = getPlayer(room, params.userId);
  if (!player) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }

  const distance = Math.hypot(player.position.x - JUDGE.x, player.position.y - JUDGE.y);
  if (distance > JUDGE.interactionRadius) {
    throw new PlayRoomError("Walk up to the judge before submitting.");
  }

  const verdict = await judgePlayTaskSubmission({
    taskCategory: room.selectedTask.category,
    taskText: room.selectedTask.text,
    playerName: player.name,
    characterLabel: player.selectedCharacter ?? "unselected",
    submission,
  });

  const freshRoom = (await loadRoom(roomCode)) ?? room;
  const freshPlayer = getPlayer(freshRoom, params.userId);
  if (!freshPlayer) {
    await clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are no longer in that room.");
  }
  if (freshRoom.phase !== "task_reveal" || !freshRoom.selectedTask) {
    throw new PlayRoomError("The task phase changed before the judge responded.");
  }

  freshPlayer.taskSubmissionText = submission;
  freshPlayer.taskSubmittedAt = verdict.judgedAt;
  freshPlayer.taskJudgeVerdict = verdict;

  const savedRoom = await saveOrDeleteRoom(freshRoom);
  if (!savedRoom) {
    throw new PlayRoomError("Unable to save the judge verdict.");
  }

  return { roomCode: savedRoom.roomCode };
};
