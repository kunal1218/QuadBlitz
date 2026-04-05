import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import type { PlayRoomListEntry } from "@lockedin/shared";
import { db } from "../db";
import { ensureUsersTable } from "./authService";
import {
  judgePlayTaskSubmission,
  normalizePlayJudgeVerdict,
  type PlayJudgeVerdict,
} from "./geminiJudgeService";
import { joinPrivatePokerTable, startPrivatePokerTable } from "./pokerService";

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

export type PlayRoomPokerArcadeState = {
  status: "idle" | "voting";
  requestedByUserId: string | null;
  requestedAt: string | null;
  acceptedUserIds: string[];
  buyIn: number | null;
  activeTableId: string | null;
};

type Vector2 = {
  x: number;
  y: number;
};

type PlayRoomNpc = Vector2 & {
  interactionRadius: number;
  visible: boolean;
  carriedByUserId: string | null;
};

type PlayRoomPlayer = {
  userId: string;
  name: string;
  handle: string;
  joinedAt: string;
  lastEnteredAt: string | null;
  lastLeftAt: string | null;
  isHost: boolean;
  isPresent: boolean;
  selectedCharacter: PlayCharacterId | null;
  selectedAt: string | null;
  position: Vector2;
  isReadyAtPedestal: boolean;
  taskSubmissionText: string | null;
  taskSubmittedAt: string | null;
  taskJudgeVerdict: PlayJudgeVerdict | null;
};

type PlayRoom = {
  roomId: string;
  roomCode: string;
  roomName: string;
  hostUserId: string;
  phase: PlayRoomPhase;
  createdAt: string;
  updatedAt: string;
  aliveSince: string;
  lastActivityAt: string;
  totalScore: number;
  players: PlayRoomPlayer[];
  judge: PlayRoomNpc;
  arcade: PlayRoomNpc;
  selectedTask: PlayTaskPayload | null;
  pokerArcade: PlayRoomPokerArcadeState;
};

type SaveRoomOptions = {
  activity?:
    | {
        type: string;
        summary: string;
        userId?: string | null;
        metadata?: Record<string, unknown>;
      }
    | null;
  persistStrategy?: "immediate" | "deferred";
};

type PlayRoomRow = {
  id: string;
  room_code: string;
  room_name: string;
  host_user_id: string;
  phase: string;
  state_json: unknown;
  created_at: string | Date;
  updated_at: string | Date;
  alive_since: string | Date;
  last_activity_at: string | Date;
  total_score: string | number;
};

type PlayRoomMembershipRow = {
  room_code: string;
  last_entered_at: string | Date | null;
  last_left_at: string | Date | null;
  last_activity_at: string | Date;
  created_at: string | Date;
  alive_since: string | Date;
  total_score: string | number;
  host_user_id: string;
  new_activity_count: string | number;
};

export type PlayRoomClientState = {
  roomId: string;
  roomCode: string;
  roomName: string;
  hostUserId: string;
  phase: PlayRoomPhase;
  minPlayersToStart: number;
  maxPlayers: number;
  createdAt: string;
  updatedAt: string;
  aliveSince: string;
  lastActivityAt: string;
  totalScore: number;
  weeksAlive: number;
  memberCount: number;
  presentCount: number;
  room: {
    width: number;
    height: number;
    wall: {
      height: number;
      boundaryY: number;
      playerMinY: number;
    };
    pedestal: {
      x: number;
      y: number;
      interactionRadius: number;
    };
    judge: {
      x: number;
      y: number;
      interactionRadius: number;
      visible: boolean;
      carriedByUserId: string | null;
    };
    arcade: {
      x: number;
      y: number;
      interactionRadius: number;
      visible: boolean;
      carriedByUserId: string | null;
    };
  };
  players: Array<{
    userId: string;
    name: string;
    handle: string;
    joinedAt: string;
    lastEnteredAt: string | null;
    lastLeftAt: string | null;
    isHost: boolean;
    isPresent: boolean;
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
  pokerArcade: PlayRoomPokerArcadeState;
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
const WALL_HEIGHT = Math.round(ROOM_HEIGHT * 0.22);
const WALL_BOUNDARY_Y = -ROOM_HEIGHT / 2 + WALL_HEIGHT;
const PLAYER_MIN_Y = -118;
const MIN_PLAYERS_TO_START = 2;
const MAX_PLAYERS = 15;
const ROOM_CODE_LENGTH = 5;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PLAYROOM_PRIVATE_POKER_BUYIN = 100;
const ROOM_NAME_MAX_LENGTH = 48;
const DEFERRED_ROOM_PERSIST_MS = 1200;
const PLAYROOM_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
const PLAYROOM_INACTIVITY_DAYS = 7;
const PEDESTAL = {
  x: 0,
  y: 0,
  interactionRadius: 104,
};
const JUDGE = {
  x: 0,
  y: PLAYER_MIN_Y,
  interactionRadius: 104,
};
const ARCADE = {
  x: -Math.round(ROOM_WIDTH * 0.34),
  y: 84,
  interactionRadius: 104,
};
const CHARACTER_ROTATION: PlayCharacterId[] = [
  "rook",
  "penguin",
  "businessman",
  "dog",
  "mug",
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
const pendingRoomPersistTimers = new Map<string, ReturnType<typeof setTimeout>>();
let playRoomTablesPromise: Promise<void> | null = null;
let maintenancePromise: Promise<void> | null = null;
let maintenanceInterval: ReturnType<typeof setInterval> | null = null;
let lastMaintenanceAt = 0;

const normalizeHandle = (handle?: string | null) =>
  handle ? handle.replace(/^@/, "") : "";

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const collapseWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const toIsoString = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const asNumber = (value: string | number | null | undefined) =>
  typeof value === "number" ? value : Number(value ?? 0);

const roundScore = (value: number) => Number(value.toFixed(2));

const formatUtcDate = (value: Date) => value.toISOString().slice(0, 10);

const getUtcDayStart = (value: Date) =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const getUtcWeekStart = (value: Date) => {
  const dayStart = getUtcDayStart(value);
  const currentDay = dayStart.getUTCDay();
  const distanceFromMonday = (currentDay + 6) % 7;
  dayStart.setUTCDate(dayStart.getUTCDate() - distanceFromMonday);
  return dayStart;
};

const addUtcDays = (value: Date, days: number) => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const getWeeksAliveForWeek = (aliveSinceIso: string, weekStart: Date) => {
  const aliveWeekStart = getUtcWeekStart(new Date(aliveSinceIso));
  const diffMs = Math.max(0, weekStart.getTime() - aliveWeekStart.getTime());
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
};

const getWeeksAliveNow = (aliveSinceIso: string) =>
  getWeeksAliveForWeek(aliveSinceIso, getUtcWeekStart(new Date()));

const normalizeRoomName = (value: string | null | undefined, roomCode: string) => {
  const trimmed = collapseWhitespace(value ?? "").slice(0, ROOM_NAME_MAX_LENGTH);
  return trimmed || `Room ${roomCode}`;
};

const cloneTask = (task: PlayTaskPayload) => ({ ...task });
const cloneJudgeVerdict = (verdict: unknown) => normalizePlayJudgeVerdict(verdict);
const emptyPokerArcadeState = (): PlayRoomPokerArcadeState => ({
  status: "idle",
  requestedByUserId: null,
  requestedAt: null,
  acceptedUserIds: [],
  buyIn: null,
  activeTableId: null,
});
const clonePokerArcadeState = (
  state?: PlayRoomPokerArcadeState | null
): PlayRoomPokerArcadeState => ({
  status: state?.status === "voting" ? "voting" : "idle",
  requestedByUserId: state?.requestedByUserId ?? null,
  requestedAt: state?.requestedAt ?? null,
  acceptedUserIds: Array.isArray(state?.acceptedUserIds) ? [...state.acceptedUserIds] : [],
  buyIn: typeof state?.buyIn === "number" ? state.buyIn : null,
  activeTableId: typeof state?.activeTableId === "string" ? state.activeTableId : null,
});
const emptyTaskSubmission = () => ({
  taskSubmissionText: null,
  taskSubmittedAt: null,
  taskJudgeVerdict: null as PlayJudgeVerdict | null,
});

const createSpawnPoints = (): Vector2[] => {
  const xSlots = [-320, -160, 0, 160, 320];
  const ySlots = [-40, 82, 184];
  return ySlots.flatMap((y) => xSlots.map((x) => ({ x, y })));
};

const SPAWN_POINTS = createSpawnPoints();

const getFallbackCharacter = (index: number): PlayCharacterId =>
  CHARACTER_ROTATION[index % CHARACTER_ROTATION.length] ?? "rook";

const getPresentPlayers = (room: PlayRoom) =>
  room.players.filter((player) => player.isPresent);

const cloneNpc = (npc: PlayRoomNpc): PlayRoomNpc => ({
  x: npc.x,
  y: npc.y,
  interactionRadius: npc.interactionRadius,
  visible: npc.visible,
  carriedByUserId: npc.carriedByUserId,
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
  judge: cloneNpc(room.judge),
  arcade: cloneNpc(room.arcade),
  selectedTask: room.selectedTask ? cloneTask(room.selectedTask) : null,
  pokerArcade: clonePokerArcadeState(room.pokerArcade),
});

const normalizeRoom = (
  room: PlayRoom,
  options: {
    fromPersistence?: boolean;
  } = {}
): PlayRoom => {
  const normalizedPlayers = room.players
    .slice(0, MAX_PLAYERS)
    .map((player, index) => ({
      userId: player.userId,
      name: player.name?.trim() || "Player",
      handle: normalizeHandle(player.handle) || "player",
      joinedAt: toIsoString(player.joinedAt) ?? new Date().toISOString(),
      lastEnteredAt: toIsoString(player.lastEnteredAt),
      lastLeftAt: toIsoString(player.lastLeftAt),
      isHost: index === 0 ? true : player.userId === room.hostUserId,
      isPresent: options.fromPersistence ? false : Boolean(player.isPresent),
      selectedCharacter: player.selectedCharacter ?? null,
      selectedAt: toIsoString(player.selectedAt),
      position: {
        x: clamp(
          player.position?.x ?? 0,
          -ROOM_WIDTH / 2 + PLAYER_MARGIN,
          ROOM_WIDTH / 2 - PLAYER_MARGIN
        ),
        y: clamp(
          player.position?.y ?? 0,
          PLAYER_MIN_Y,
          ROOM_HEIGHT / 2 - PLAYER_MARGIN
        ),
      },
      isReadyAtPedestal: Boolean(player.isReadyAtPedestal),
      taskSubmissionText:
        typeof player.taskSubmissionText === "string" ? player.taskSubmissionText : null,
      taskSubmittedAt: toIsoString(player.taskSubmittedAt),
      taskJudgeVerdict:
        player.taskJudgeVerdict && typeof player.taskJudgeVerdict === "object"
          ? cloneJudgeVerdict(player.taskJudgeVerdict)
          : null,
    }));

  const hostUserId =
    normalizedPlayers.find((player) => player.userId === room.hostUserId)?.userId ??
    normalizedPlayers[0]?.userId ??
    room.hostUserId;
  const normalizedPlayerIds = new Set(normalizedPlayers.map((player) => player.userId));
  const normalizedPresentPlayerIds = new Set(
    normalizedPlayers.filter((player) => player.isPresent).map((player) => player.userId)
  );
  const rawPokerArcade = clonePokerArcadeState(room.pokerArcade);
  const pokerArcade =
    rawPokerArcade.status === "voting" &&
    rawPokerArcade.requestedByUserId &&
    normalizedPlayerIds.has(rawPokerArcade.requestedByUserId)
      ? {
          status: "voting" as const,
          requestedByUserId: rawPokerArcade.requestedByUserId,
          requestedAt: rawPokerArcade.requestedAt ?? new Date().toISOString(),
          acceptedUserIds: Array.from(
            new Set(
              rawPokerArcade.acceptedUserIds.filter((userId) =>
                normalizedPlayerIds.has(userId)
              )
            )
          ),
          buyIn:
            typeof rawPokerArcade.buyIn === "number" && rawPokerArcade.buyIn > 0
              ? Math.floor(rawPokerArcade.buyIn)
              : PLAYROOM_PRIVATE_POKER_BUYIN,
          activeTableId: rawPokerArcade.activeTableId,
        }
      : {
          ...emptyPokerArcadeState(),
          activeTableId: rawPokerArcade.activeTableId,
        };
  const normalizeNpc = (candidate: Partial<PlayRoomNpc> | null | undefined, fallback: PlayRoomNpc) => {
    const candidateX = typeof candidate?.x === "number" ? candidate.x : fallback.x;
    const candidateY = typeof candidate?.y === "number" ? candidate.y : fallback.y;

    return {
      x: clamp(candidateX, -ROOM_WIDTH / 2 + PLAYER_MARGIN, ROOM_WIDTH / 2 - PLAYER_MARGIN),
      y: clamp(candidateY, PLAYER_MIN_Y, ROOM_HEIGHT / 2 - PLAYER_MARGIN),
    interactionRadius:
      typeof candidate?.interactionRadius === "number" && candidate.interactionRadius > 0
        ? candidate.interactionRadius
        : fallback.interactionRadius,
    visible: candidate?.visible ?? true,
    carriedByUserId:
      typeof candidate?.carriedByUserId === "string" &&
      normalizedPresentPlayerIds.has(candidate.carriedByUserId)
        ? candidate.carriedByUserId
        : null,
    };
  };

  return {
    roomId: room.roomId,
    roomCode: room.roomCode.trim().toUpperCase(),
    roomName: normalizeRoomName(room.roomName, room.roomCode),
    hostUserId,
    phase: room.phase ?? "lobby",
    createdAt: toIsoString(room.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoString(room.updatedAt) ?? new Date().toISOString(),
    aliveSince: toIsoString(room.aliveSince) ?? new Date().toISOString(),
    lastActivityAt: toIsoString(room.lastActivityAt) ?? new Date().toISOString(),
    totalScore: roundScore(asNumber(room.totalScore)),
    players: normalizedPlayers.map((player) => ({
      ...player,
      isHost: player.userId === hostUserId,
    })),
    judge: normalizeNpc((room as PlayRoom & { judge?: PlayRoomNpc }).judge, {
      ...JUDGE,
      visible: true,
      carriedByUserId: null,
    }),
    arcade: normalizeNpc((room as PlayRoom & { arcade?: PlayRoomNpc }).arcade, {
      ...ARCADE,
      visible: true,
      carriedByUserId: null,
    }),
    selectedTask: room.selectedTask ? cloneTask(room.selectedTask) : null,
    pokerArcade,
  };
};

const serializeRoomState = (room: PlayRoom): PlayRoomClientState => ({
  roomId: room.roomId,
  roomCode: room.roomCode,
  roomName: room.roomName,
  hostUserId: room.hostUserId,
  phase: room.phase,
  minPlayersToStart: MIN_PLAYERS_TO_START,
  maxPlayers: MAX_PLAYERS,
  createdAt: room.createdAt,
  updatedAt: room.updatedAt,
  aliveSince: room.aliveSince,
  lastActivityAt: room.lastActivityAt,
  totalScore: room.totalScore,
  weeksAlive: getWeeksAliveNow(room.aliveSince),
  memberCount: room.players.length,
  presentCount: getPresentPlayers(room).length,
  room: {
    width: ROOM_WIDTH,
    height: ROOM_HEIGHT,
    wall: {
      height: WALL_HEIGHT,
      boundaryY: WALL_BOUNDARY_Y,
      playerMinY: PLAYER_MIN_Y,
    },
    pedestal: {
      ...PEDESTAL,
    },
    judge: {
      ...cloneNpc(room.judge),
    },
    arcade: {
      ...cloneNpc(room.arcade),
    },
  },
  players: room.players.map((player) => ({
    userId: player.userId,
    name: player.name,
    handle: player.handle,
    joinedAt: player.joinedAt,
    lastEnteredAt: player.lastEnteredAt,
    lastLeftAt: player.lastLeftAt,
    isHost: player.isHost,
    isPresent: player.isPresent,
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
  pokerArcade: clonePokerArcadeState(room.pokerArcade),
});

const serializeRoomPositions = (room: PlayRoom): PlayRoomPositionsState => ({
  roomCode: room.roomCode,
  players: room.players
    .filter((player) => player.isPresent)
    .map((player) => ({
      userId: player.userId,
      position: { ...player.position },
    })),
});

const toJsonString = (value: unknown) => JSON.stringify(value ?? {});

const parsePersistedRoom = (row: PlayRoomRow): PlayRoom => {
  const rawState =
    row.state_json && typeof row.state_json === "object"
      ? (row.state_json as Record<string, unknown>)
      : {};
  const persisted = {
    ...(rawState as Partial<PlayRoom>),
    roomId: row.id,
    roomCode: row.room_code,
    roomName:
      typeof rawState.roomName === "string" && rawState.roomName.trim()
        ? rawState.roomName
        : row.room_name,
    hostUserId: row.host_user_id,
    phase:
      typeof rawState.phase === "string"
        ? (rawState.phase as PlayRoomPhase)
        : (row.phase as PlayRoomPhase),
    createdAt: toIsoString(rawState.createdAt as string | Date | undefined) ?? toIsoString(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIsoString(rawState.updatedAt as string | Date | undefined) ?? toIsoString(row.updated_at) ?? new Date().toISOString(),
    aliveSince: toIsoString(rawState.aliveSince as string | Date | undefined) ?? toIsoString(row.alive_since) ?? new Date().toISOString(),
    lastActivityAt:
      toIsoString(rawState.lastActivityAt as string | Date | undefined) ??
      toIsoString(row.last_activity_at) ??
      new Date().toISOString(),
    totalScore:
      typeof rawState.totalScore === "number"
        ? rawState.totalScore
        : asNumber(row.total_score),
  } as PlayRoom;

  return normalizeRoom(persisted, { fromPersistence: true });
};

const getPlayerIndex = (room: PlayRoom, userId: string) =>
  room.players.findIndex((player) => player.userId === userId);

const getPlayer = (room: PlayRoom, userId: string) =>
  room.players.find((player) => player.userId === userId) ?? null;

const getRoomCodesForActiveUser = (userId: string) => memoryPlayerRooms.get(userId) ?? null;

const setPlayerRoomCode = (userId: string, roomCode: string) => {
  memoryPlayerRooms.set(userId, roomCode);
};

const clearPlayerRoomCode = (userId: string) => {
  memoryPlayerRooms.delete(userId);
};

const buildMembershipUpsertValues = (room: PlayRoom) =>
  room.players.map((player) => [
    room.roomId,
    player.userId,
    player.joinedAt,
    player.lastEnteredAt,
    player.lastLeftAt,
  ]);

const pickTask = () => {
  const task = TASK_POOL[Math.floor(Math.random() * TASK_POOL.length)];
  return task ? cloneTask(task) : null;
};

const applySharedRoomSpawnPoints = (room: PlayRoom, userIds?: string[]) => {
  const targetIds = userIds ? new Set(userIds) : null;
  const presentPlayerIds = room.players
    .filter((player) => player.isPresent)
    .map((player) => player.userId);
  const spawnIndexByUserId = new Map(
    presentPlayerIds.map((userId, index) => [userId, index])
  );
  room.players = room.players.map((player) => {
    if (!player.isPresent) {
      return player;
    }
    if (targetIds && !targetIds.has(player.userId)) {
      return player;
    }
    const spawnIndex = spawnIndexByUserId.get(player.userId) ?? 0;
    const spawn =
      SPAWN_POINTS[spawnIndex] ??
      SPAWN_POINTS[SPAWN_POINTS.length - 1] ?? { x: 0, y: 0 };
    return {
      ...player,
      position: { ...spawn },
      isReadyAtPedestal: false,
      ...emptyTaskSubmission(),
    };
  });
};

const synchronizeRoomPhase = (room: PlayRoom) => {
  if (room.players.length === 0) {
    return room;
  }

  if (!room.players.some((player) => player.userId === room.hostUserId)) {
    room.hostUserId = room.players[0]!.userId;
  }

  room.players = room.players.map((player, index) => ({
    ...player,
    isHost: player.userId === room.hostUserId,
    selectedCharacter:
      (room.phase === "shared_room" || room.phase === "task_reveal") &&
      player.isPresent &&
      !player.selectedCharacter
        ? getFallbackCharacter(index)
        : player.selectedCharacter,
  }));

  const presentPlayers = getPresentPlayers(room);

  if (room.phase === "lobby" && presentPlayers.length >= MIN_PLAYERS_TO_START) {
    room.phase = "character_select";
    room.selectedTask = null;
    room.pokerArcade = emptyPokerArcadeState();
    room.players = room.players.map((player) => ({
      ...player,
      isReadyAtPedestal: false,
      ...emptyTaskSubmission(),
    }));
    return room;
  }

  if (room.phase === "character_select" && presentPlayers.length < MIN_PLAYERS_TO_START) {
    room.phase = "lobby";
    room.selectedTask = null;
    room.pokerArcade = emptyPokerArcadeState();
    room.players = room.players.map((player) => ({
      ...player,
      isReadyAtPedestal: false,
      ...emptyTaskSubmission(),
    }));
    return room;
  }

  if (
    room.phase === "character_select" &&
    presentPlayers.length >= MIN_PLAYERS_TO_START &&
    presentPlayers.every((player) => Boolean(player.selectedCharacter))
  ) {
    room.phase = "shared_room";
    room.selectedTask = null;
    room.pokerArcade = emptyPokerArcadeState();
    applySharedRoomSpawnPoints(room);
    return room;
  }

  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    room.pokerArcade = emptyPokerArcadeState();
    return room;
  }

  if (
    room.pokerArcade.status === "voting" &&
    (!room.pokerArcade.requestedByUserId ||
      !presentPlayers.some(
        (player) => player.userId === room.pokerArcade.requestedByUserId
      ))
  ) {
    room.pokerArcade = emptyPokerArcadeState();
  } else if (room.pokerArcade.status === "voting") {
    const activeIds = new Set(presentPlayers.map((player) => player.userId));
    room.pokerArcade.acceptedUserIds = Array.from(
      new Set(room.pokerArcade.acceptedUserIds.filter((userId) => activeIds.has(userId)))
    );
  }

  if (
    room.phase === "shared_room" &&
    presentPlayers.length >= MIN_PLAYERS_TO_START &&
    !room.selectedTask &&
    presentPlayers.every((player) => player.isReadyAtPedestal)
  ) {
    room.phase = "task_reveal";
    room.selectedTask = pickTask();
    return room;
  }

  if (
    room.phase === "task_reveal" &&
    room.selectedTask &&
    presentPlayers.length > 0 &&
    presentPlayers.every((player) => Boolean(player.taskJudgeVerdict))
  ) {
    room.phase = "shared_room";
    room.selectedTask = null;
    room.players = room.players.map((player) => ({
      ...player,
      isReadyAtPedestal: false,
      ...emptyTaskSubmission(),
    }));
    return room;
  }

  return room;
};

const ensurePlayRoomTables = async () => {
  if (!playRoomTablesPromise) {
    playRoomTablesPromise = (async () => {
      await ensureUsersTable();

      await db.query(`
        CREATE TABLE IF NOT EXISTS play_rooms (
          id uuid PRIMARY KEY,
          room_code text NOT NULL UNIQUE,
          room_name text NOT NULL,
          host_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          phase text NOT NULL,
          state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
          total_score numeric(12,2) NOT NULL DEFAULT 0,
          alive_since timestamptz NOT NULL DEFAULT now(),
          last_activity_at timestamptz NOT NULL DEFAULT now(),
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await db.query(`
        ALTER TABLE play_rooms
        ADD COLUMN IF NOT EXISTS room_name text,
        ADD COLUMN IF NOT EXISTS state_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS total_score numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS alive_since timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();
      `);

      await db.query(`
        UPDATE play_rooms
        SET room_name = COALESCE(NULLIF(trim(room_name), ''), 'Room ' || room_code)
        WHERE room_name IS NULL OR trim(room_name) = '';
      `);

      await db.query(`
        ALTER TABLE play_rooms
        ALTER COLUMN room_name SET NOT NULL;
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS play_rooms_last_activity_idx
          ON play_rooms (last_activity_at DESC);
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS play_room_memberships (
          room_id uuid NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          joined_at timestamptz NOT NULL DEFAULT now(),
          last_entered_at timestamptz,
          last_left_at timestamptz,
          PRIMARY KEY (room_id, user_id)
        );
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS play_room_memberships_user_idx
          ON play_room_memberships (user_id, last_entered_at DESC);
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS play_room_activities (
          id uuid PRIMARY KEY,
          room_id uuid NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
          user_id uuid REFERENCES users(id) ON DELETE SET NULL,
          activity_type text NOT NULL,
          summary text NOT NULL,
          metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS play_room_activities_room_created_idx
          ON play_room_activities (room_id, created_at DESC);
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS play_room_task_completions (
          id uuid PRIMARY KEY,
          room_id uuid NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          task_id text NOT NULL,
          task_category text NOT NULL,
          completed_at timestamptz NOT NULL,
          completion_day date NOT NULL,
          completion_week_start date NOT NULL
        );
      `);

      await db.query(`
        CREATE INDEX IF NOT EXISTS play_room_task_completions_room_week_idx
          ON play_room_task_completions (room_id, completion_week_start);
      `);

      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS play_room_daily_completions_unique_idx
          ON play_room_task_completions (room_id, user_id, completion_day)
          WHERE task_category = 'daily';
      `);

      await db.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS play_room_weekly_completions_unique_idx
          ON play_room_task_completions (room_id, user_id, completion_week_start)
          WHERE task_category = 'weekly';
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS play_room_weekly_scores (
          room_id uuid NOT NULL REFERENCES play_rooms(id) ON DELETE CASCADE,
          week_start date NOT NULL,
          week_end date NOT NULL,
          member_count integer NOT NULL,
          daily_completion_count integer NOT NULL,
          weekly_completion_count integer NOT NULL,
          base_points numeric(12,2) NOT NULL,
          longevity_multiplier numeric(8,4) NOT NULL,
          awarded_points numeric(12,2) NOT NULL,
          weeks_alive integer NOT NULL,
          scored_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (room_id, week_start)
        );
      `);
    })().catch((error) => {
      playRoomTablesPromise = null;
      throw error;
    });
  }

  await playRoomTablesPromise;
};

const writeRoomMemberships = async (client: PoolClient, room: PlayRoom) => {
  const values = buildMembershipUpsertValues(room);
  for (const [roomId, userId, joinedAt, lastEnteredAt, lastLeftAt] of values) {
    await client.query(
      `INSERT INTO play_room_memberships (
         room_id,
         user_id,
         joined_at,
         last_entered_at,
         last_left_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (room_id, user_id)
       DO UPDATE SET
         joined_at = LEAST(play_room_memberships.joined_at, EXCLUDED.joined_at),
         last_entered_at = COALESCE(EXCLUDED.last_entered_at, play_room_memberships.last_entered_at),
         last_left_at = COALESCE(EXCLUDED.last_left_at, play_room_memberships.last_left_at)`,
      [roomId, userId, joinedAt, lastEnteredAt, lastLeftAt]
    );
  }
};

const persistRoomToDatabase = async (
  room: PlayRoom,
  activity?: SaveRoomOptions["activity"]
) => {
  await ensurePlayRoomTables();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO play_rooms (
         id,
         room_code,
         room_name,
         host_user_id,
         phase,
         state_json,
         total_score,
         alive_since,
         last_activity_at,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
       ON CONFLICT (id)
       DO UPDATE SET
         room_code = EXCLUDED.room_code,
         room_name = EXCLUDED.room_name,
         host_user_id = EXCLUDED.host_user_id,
         phase = EXCLUDED.phase,
         state_json = EXCLUDED.state_json,
         total_score = EXCLUDED.total_score,
         alive_since = EXCLUDED.alive_since,
         last_activity_at = EXCLUDED.last_activity_at,
         updated_at = EXCLUDED.updated_at`,
      [
        room.roomId,
        room.roomCode,
        room.roomName,
        room.hostUserId,
        room.phase,
        toJsonString(room),
        room.totalScore,
        room.aliveSince,
        room.lastActivityAt,
        room.createdAt,
        room.updatedAt,
      ]
    );

    await writeRoomMemberships(client, room);

    if (activity) {
      await client.query(
        `INSERT INTO play_room_activities (
           id,
           room_id,
           user_id,
           activity_type,
           summary,
           metadata_json
         )
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          randomUUID(),
          room.roomId,
          activity.userId ?? null,
          activity.type,
          activity.summary,
          toJsonString(activity.metadata ?? {}),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const clearPendingRoomPersist = (roomCode: string) => {
  const timer = pendingRoomPersistTimers.get(roomCode);
  if (timer) {
    clearTimeout(timer);
    pendingRoomPersistTimers.delete(roomCode);
  }
};

const persistRoomImmediately = async (
  normalized: PlayRoom,
  activity?: SaveRoomOptions["activity"]
) => {
  clearPendingRoomPersist(normalized.roomCode);
  memoryRooms.set(normalized.roomCode, cloneRoom(normalized));
  await persistRoomToDatabase(normalized, activity);
  return normalized;
};

const flushDeferredRoomPersist = async (roomCode: string) => {
  pendingRoomPersistTimers.delete(roomCode);
  const cached = memoryRooms.get(roomCode);
  if (!cached) {
    return;
  }
  await persistRoomToDatabase(normalizeRoom(cached));
};

const queueDeferredRoomPersist = (roomCode: string) => {
  if (pendingRoomPersistTimers.has(roomCode)) {
    return;
  }

  const timer = setTimeout(() => {
    void flushDeferredRoomPersist(roomCode).catch((error) => {
      console.warn("[playroom] failed to flush deferred room snapshot", error);
    });
  }, DEFERRED_ROOM_PERSIST_MS);

  pendingRoomPersistTimers.set(roomCode, timer);
};

const saveRoom = async (room: PlayRoom, options: SaveRoomOptions = {}) => {
  const now = new Date().toISOString();
  const normalized = normalizeRoom({
    ...room,
    updatedAt: now,
    lastActivityAt: options.activity ? now : room.lastActivityAt,
  });

  if (options.persistStrategy === "deferred") {
    memoryRooms.set(normalized.roomCode, cloneRoom(normalized));
    queueDeferredRoomPersist(normalized.roomCode);
    return normalized;
  }

  return persistRoomImmediately(normalized, options.activity ?? null);
};

const removeRoom = async (roomCode: string) => {
  clearPendingRoomPersist(roomCode);
  memoryRooms.delete(roomCode);
  await ensurePlayRoomTables();
  await db.query(`DELETE FROM play_rooms WHERE room_code = $1`, [roomCode]);
};

const readRoomCodes = async () => {
  await ensurePlayRoomTables();
  const result = await db.query(`SELECT room_code FROM play_rooms`);
  return (result.rows as Array<{ room_code: string }>).map((row) =>
    row.room_code.toUpperCase()
  );
};

const loadRoom = async (roomCode: string): Promise<PlayRoom | null> => {
  const normalizedCode = roomCode.trim().toUpperCase();
  const cached = memoryRooms.get(normalizedCode);
  if (cached) {
    return cloneRoom(normalizeRoom(cached));
  }

  await ensurePlayRoomTables();
  const result = await db.query(
    `SELECT *
     FROM play_rooms
     WHERE room_code = $1`,
    [normalizedCode]
  );
  const row = result.rows[0] as PlayRoomRow | undefined;
  if (!row) {
    return null;
  }

  const room = parsePersistedRoom(row);
  memoryRooms.set(room.roomCode, cloneRoom(room));
  return cloneRoom(room);
};

const saveOrDeleteRoom = async (room: PlayRoom | null, options: SaveRoomOptions = {}) => {
  if (!room || room.players.length === 0) {
    if (room?.roomCode) {
      await removeRoom(room.roomCode);
    }
    return null;
  }

  synchronizeRoomPhase(room);
  return saveRoom(room, options);
};

const generateRoomCode = async () => {
  const activeCodes = new Set((await readRoomCodes()).map((code) => code.toUpperCase()));
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
  isPresent?: boolean;
  selectedCharacter?: PlayCharacterId | null;
}): PlayRoomPlayer => {
  const now = new Date().toISOString();
  return {
    userId: params.userId,
    name: params.name.trim() || "Player",
    handle: normalizeHandle(params.handle) || "player",
    joinedAt: now,
    lastEnteredAt: params.isPresent ? now : null,
    lastLeftAt: null,
    isHost: Boolean(params.isHost),
    isPresent: Boolean(params.isPresent),
    selectedCharacter: params.selectedCharacter ?? null,
    selectedAt: params.selectedCharacter ? now : null,
    position: { x: 0, y: 0 },
    isReadyAtPedestal: false,
    ...emptyTaskSubmission(),
  };
};

const createNpc = (fallback: typeof JUDGE | typeof ARCADE): PlayRoomNpc => ({
  ...fallback,
  visible: true,
  carriedByUserId: null,
});

const dropNpcCarriedByUser = (room: PlayRoom, userId: string, position: Vector2) => {
  [room.judge, room.arcade].forEach((npc) => {
    if (npc.carriedByUserId === userId) {
      npc.carriedByUserId = null;
      npc.visible = true;
      npc.x = position.x;
      npc.y = position.y;
    }
  });
};

const leaveExistingRoomIfNeeded = async (userId: string) => {
  const previousRoomCode = getRoomCodesForActiveUser(userId);
  if (!previousRoomCode) {
    return {
      previousRoomCode: null as string | null,
      updatedRoomCodes: [] as string[],
    };
  }

  const previousRoom = await loadRoom(previousRoomCode);
  clearPlayerRoomCode(userId);
  if (!previousRoom) {
    return {
      previousRoomCode,
      updatedRoomCodes: [],
    };
  }

  const player = getPlayer(previousRoom, userId);
  if (player) {
    dropNpcCarriedByUser(previousRoom, userId, player.position);
    player.isPresent = false;
    player.lastLeftAt = new Date().toISOString();
    player.isReadyAtPedestal = false;
  }

  const updatedPreviousRoom = await saveOrDeleteRoom(previousRoom);
  return {
    previousRoomCode,
    updatedRoomCodes: updatedPreviousRoom ? [updatedPreviousRoom.roomCode] : [],
  };
};

const ensureProgressedRoomCharacter = (room: PlayRoom, player: PlayRoomPlayer) => {
  if (
    (room.phase === "shared_room" || room.phase === "task_reveal") &&
    !player.selectedCharacter
  ) {
    const index = Math.max(0, getPlayerIndex(room, player.userId));
    player.selectedCharacter = getFallbackCharacter(index);
    player.selectedAt = player.selectedAt ?? new Date().toISOString();
  }
};

const finalizePlayRoomWeeklyScores = async () => {
  await ensurePlayRoomTables();
  const currentWeekStart = getUtcWeekStart(new Date());
  const roomResult = await db.query(`SELECT id, room_code, alive_since FROM play_rooms`);

  for (const room of roomResult.rows as Array<{
    id: string;
    room_code: string;
    alive_since: string | Date;
  }>) {
    const latestScoreResult = await db.query(
      `SELECT MAX(week_start) AS week_start
       FROM play_room_weekly_scores
       WHERE room_id = $1`,
      [room.id]
    );

    const latestScoreRow = latestScoreResult.rows[0] as
      | { week_start: string | Date | null }
      | undefined;
    let nextWeekStart = latestScoreRow?.week_start
      ? addUtcDays(new Date(latestScoreRow.week_start), 7)
      : getUtcWeekStart(new Date(room.alive_since));

    while (nextWeekStart.getTime() < currentWeekStart.getTime()) {
      const weekStart = formatUtcDate(nextWeekStart);
      const weekEnd = formatUtcDate(addUtcDays(nextWeekStart, 7));
      const memberCountResult = await db.query(
        `SELECT COUNT(*)::text AS count
         FROM play_room_memberships
         WHERE room_id = $1`,
        [room.id]
      );
      const completionResult = await db.query(
        `SELECT task_category, COUNT(*)::text AS count
         FROM play_room_task_completions
         WHERE room_id = $1
           AND completion_week_start = $2
         GROUP BY task_category`,
        [room.id, weekStart]
      );

      const dailyCompletionCount = asNumber(
        (completionResult.rows as Array<{ task_category: string; count: string }>).find(
          (entry) => entry.task_category === "daily"
        )?.count
      );
      const weeklyCompletionCount = asNumber(
        (completionResult.rows as Array<{ task_category: string; count: string }>).find(
          (entry) => entry.task_category === "weekly"
        )?.count
      );
      const memberCount = asNumber(
        (memberCountResult.rows[0] as { count: string } | undefined)?.count
      );
      const basePoints = roundScore(dailyCompletionCount + weeklyCompletionCount * 7);
      const weeksAlive = getWeeksAliveForWeek(
        toIsoString(room.alive_since) ?? new Date().toISOString(),
        nextWeekStart
      );
      // Weeks alive is 1-based. The first scored week earns a 2% bonus, so week 4 earns 8%.
      const longevityMultiplier = roundScore(1 + weeksAlive * 0.02);
      const awardedPoints = roundScore(basePoints * longevityMultiplier);

      const client = await db.connect();
      try {
        await client.query("BEGIN");
        const insertResult = await client.query<{ awarded_points: string }>(
          `INSERT INTO play_room_weekly_scores (
             room_id,
             week_start,
             week_end,
             member_count,
             daily_completion_count,
             weekly_completion_count,
             base_points,
             longevity_multiplier,
             awarded_points,
             weeks_alive
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (room_id, week_start) DO NOTHING
           RETURNING awarded_points`,
          [
            room.id,
            weekStart,
            weekEnd,
            memberCount,
            dailyCompletionCount,
            weeklyCompletionCount,
            basePoints,
            longevityMultiplier,
            awardedPoints,
            weeksAlive,
          ]
        );

        if ((insertResult.rowCount ?? 0) > 0) {
          await client.query(
            `UPDATE play_rooms
             SET total_score = total_score + $2,
                 updated_at = now()
             WHERE id = $1`,
            [room.id, awardedPoints]
          );
          memoryRooms.delete(room.room_code.toUpperCase());
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }

      nextWeekStart = addUtcDays(nextWeekStart, 7);
    }
  }
};

const deleteInactivePlayRooms = async () => {
  await ensurePlayRoomTables();
  const result = await db.query(
    `DELETE FROM play_rooms
     WHERE last_activity_at < now() - interval '${PLAYROOM_INACTIVITY_DAYS} days'
     RETURNING room_code`
  );

  (result.rows as Array<{ room_code: string }>).forEach((row) => {
    clearPendingRoomPersist(row.room_code.toUpperCase());
    memoryRooms.delete(row.room_code.toUpperCase());
    Array.from(memoryPlayerRooms.entries()).forEach(([userId, roomCode]) => {
      if (roomCode.toUpperCase() === row.room_code.toUpperCase()) {
        memoryPlayerRooms.delete(userId);
      }
    });
  });
};

const flushPendingRoomPersists = async () => {
  const roomCodes = Array.from(pendingRoomPersistTimers.keys());
  await Promise.all(
    roomCodes.map(async (roomCode) => {
      clearPendingRoomPersist(roomCode);
      await flushDeferredRoomPersist(roomCode);
    })
  );
};

export const runPlayRoomMaintenance = async (force = false) => {
  const now = Date.now();
  if (!force && now - lastMaintenanceAt < PLAYROOM_MAINTENANCE_INTERVAL_MS / 2) {
    return;
  }
  if (maintenancePromise) {
    await maintenancePromise;
    return;
  }

  maintenancePromise = (async () => {
    await flushPendingRoomPersists();
    await finalizePlayRoomWeeklyScores();
    await deleteInactivePlayRooms();
    lastMaintenanceAt = Date.now();
  })().finally(() => {
    maintenancePromise = null;
  });

  await maintenancePromise;
};

export const initializePlayRoomMaintenance = () => {
  if (maintenanceInterval) {
    return;
  }

  void runPlayRoomMaintenance(true).catch((error) => {
    console.warn("[playroom] initial maintenance failed", error);
  });

  maintenanceInterval = setInterval(() => {
    void runPlayRoomMaintenance().catch((error) => {
      console.warn("[playroom] maintenance failed", error);
    });
  }, PLAYROOM_MAINTENANCE_INTERVAL_MS);
};

const createRoomListEntry = (
  room: PlayRoom,
  membership: PlayRoomMembershipRow,
  userId: string
): PlayRoomListEntry => {
  const newActivityCount = asNumber(membership.new_activity_count);
  return {
    roomCode: room.roomCode,
    roomName: room.roomName,
    phase: room.phase,
    memberCount: room.players.length,
    presentCount: getPresentPlayers(room).length,
    totalScore: room.totalScore,
    weeksAlive: getWeeksAliveNow(room.aliveSince),
    createdAt: toIsoString(membership.created_at) ?? room.createdAt,
    lastEnteredAt: toIsoString(membership.last_entered_at),
    lastLeftAt: toIsoString(membership.last_left_at),
    lastActivityAt: toIsoString(membership.last_activity_at) ?? room.lastActivityAt,
    hasNewActivity: newActivityCount > 0,
    newActivityCount,
    isHost: membership.host_user_id === userId,
  };
};

export const fetchPlayRoomSummariesForUser = async (
  userId: string
): Promise<PlayRoomListEntry[]> => {
  await runPlayRoomMaintenance();
  await ensurePlayRoomTables();

  const result = await db.query(
    `SELECT rooms.room_code,
            memberships.last_entered_at,
            memberships.last_left_at,
            rooms.last_activity_at,
            rooms.created_at,
            rooms.alive_since,
            rooms.total_score,
            rooms.host_user_id,
            COALESCE((
              SELECT COUNT(*)::text
              FROM play_room_activities activities
              WHERE activities.room_id = rooms.id
                AND activities.created_at > COALESCE(
                  memberships.last_left_at,
                  memberships.last_entered_at,
                  memberships.joined_at
                )
            ), '0') AS new_activity_count
     FROM play_room_memberships memberships
     JOIN play_rooms rooms ON rooms.id = memberships.room_id
     WHERE memberships.user_id = $1
     ORDER BY memberships.last_entered_at DESC NULLS LAST, rooms.last_activity_at DESC`,
    [userId]
  );

  const rooms = await Promise.all(
    (result.rows as PlayRoomMembershipRow[]).map(async (membership) => {
      const room = await loadRoom(membership.room_code);
      if (!room) {
        return null;
      }
      return createRoomListEntry(room, membership, userId);
    })
  );

  return rooms.filter((entry): entry is PlayRoomListEntry => Boolean(entry));
};

export const createPlayRoom = async (params: {
  userId: string;
  name: string;
  handle: string;
  roomName?: string | null;
}) => {
  await runPlayRoomMaintenance();
  const cleanedUp = await leaveExistingRoomIfNeeded(params.userId);
  const roomCode = await generateRoomCode();
  const now = new Date().toISOString();
  const room = await saveRoom(
    {
      roomId: randomUUID(),
      roomCode,
      roomName: normalizeRoomName(params.roomName, roomCode),
      hostUserId: params.userId,
      phase: "lobby",
      createdAt: now,
      updatedAt: now,
      aliveSince: now,
      lastActivityAt: now,
      totalScore: 0,
      players: [createPlayer({ ...params, isHost: true, isPresent: true })],
      judge: createNpc(JUDGE),
      arcade: createNpc(ARCADE),
      selectedTask: null,
      pokerArcade: emptyPokerArcadeState(),
    },
    {
      activity: {
        type: "room_created",
        summary: `${params.name.trim() || "A player"} created the room.`,
        userId: params.userId,
      },
    }
  );

  setPlayerRoomCode(params.userId, room.roomCode);
  return {
    roomCode: room.roomCode,
    updatedRoomCodes: Array.from(
      new Set([...cleanedUp.updatedRoomCodes, room.roomCode])
    ),
  };
};

export const joinPlayRoom = async (params: {
  userId: string;
  name: string;
  handle: string;
  roomCode: string;
}) => {
  await runPlayRoomMaintenance();
  const requestedRoomCode = params.roomCode.trim().toUpperCase();
  if (!requestedRoomCode) {
    throw new PlayRoomError("Room code is required.");
  }

  const currentRoomCode = getRoomCodesForActiveUser(params.userId);
  const cleanedUp =
    currentRoomCode && currentRoomCode.toUpperCase() === requestedRoomCode
      ? { previousRoomCode: currentRoomCode, updatedRoomCodes: [] as string[] }
      : await leaveExistingRoomIfNeeded(params.userId);

  const room = await loadRoom(requestedRoomCode);
  if (!room) {
    throw new PlayRoomError("That room could not be found.", 404);
  }

  const existingPlayerIndex = getPlayerIndex(room, params.userId);
  const now = new Date().toISOString();
  let activitySummary = `${params.name.trim() || "A player"} entered the room.`;

  if (existingPlayerIndex >= 0) {
    room.players[existingPlayerIndex] = {
      ...room.players[existingPlayerIndex]!,
      name: params.name.trim() || room.players[existingPlayerIndex]!.name,
      handle:
        normalizeHandle(params.handle) || room.players[existingPlayerIndex]!.handle,
      isPresent: true,
      lastEnteredAt: now,
    };
    ensureProgressedRoomCharacter(room, room.players[existingPlayerIndex]!);
    if (room.phase === "shared_room" || room.phase === "task_reveal") {
      applySharedRoomSpawnPoints(room, [params.userId]);
    }
    activitySummary = `${room.players[existingPlayerIndex]!.name} re-entered the room.`;
  } else {
    if (room.players.length >= MAX_PLAYERS) {
      throw new PlayRoomError("That room is already full.");
    }
    room.players.push(createPlayer({ ...params, isPresent: true }));
    const joinedPlayer = room.players[room.players.length - 1];
    if (joinedPlayer) {
      ensureProgressedRoomCharacter(room, joinedPlayer);
    }
    if (room.phase === "shared_room" || room.phase === "task_reveal") {
      applySharedRoomSpawnPoints(room, [params.userId]);
    }
    activitySummary = `${params.name.trim() || "A player"} joined the room.`;
  }

  const savedRoom = await saveOrDeleteRoom(room, {
    activity: {
      type: existingPlayerIndex >= 0 ? "room_reentered" : "room_joined",
      summary: activitySummary,
      userId: params.userId,
    },
  });
  if (!savedRoom) {
    throw new PlayRoomError("Unable to join that room.");
  }

  setPlayerRoomCode(params.userId, savedRoom.roomCode);
  return {
    roomCode: savedRoom.roomCode,
    updatedRoomCodes: Array.from(
      new Set([...cleanedUp.updatedRoomCodes, savedRoom.roomCode])
    ),
  };
};

export const leavePlayRoom = async (userId: string) => {
  const roomCode = getRoomCodesForActiveUser(userId);
  if (!roomCode) {
    return { updatedRoomCodes: [] as string[] };
  }

  clearPlayerRoomCode(userId);
  const room = await loadRoom(roomCode);
  if (!room) {
    return { updatedRoomCodes: [] as string[] };
  }

  const player = getPlayer(room, userId);
  if (player) {
    dropNpcCarriedByUser(room, userId, player.position);
    player.isPresent = false;
    player.lastLeftAt = new Date().toISOString();
    player.isReadyAtPedestal = false;
  }

  const updatedRoom = await saveOrDeleteRoom(room);
  return {
    updatedRoomCodes: updatedRoom ? [updatedRoom.roomCode] : [roomCode],
  };
};

export const forceRemovePlayRoomUser = async (userId: string) => leavePlayRoom(userId);

export const getPlayRoomStateForUser = async (userId: string) => {
  const roomCode = getRoomCodesForActiveUser(userId);
  if (!roomCode) {
    return { roomCode: null, state: null as PlayRoomClientState | null };
  }

  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(userId);
    return { roomCode: null, state: null as PlayRoomClientState | null };
  }

  const player = getPlayer(room, userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(userId);
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

export const clearPlayRoomPokerTable = async (tableId: string) => {
  await ensurePlayRoomTables();
  const result = await db.query(
    `SELECT room_code
     FROM play_rooms
     WHERE state_json -> 'pokerArcade' ->> 'activeTableId' = $1`,
    [tableId]
  );

  const updatedRoomCodes: string[] = [];
  for (const row of result.rows as Array<{ room_code: string }>) {
    const room = await loadRoom(row.room_code);
    if (!room || room.pokerArcade.activeTableId !== tableId) {
      continue;
    }
    room.pokerArcade = emptyPokerArcadeState();
    const savedRoom = await saveOrDeleteRoom(room);
    if (savedRoom) {
      updatedRoomCodes.push(savedRoom.roomCode);
    }
  }

  return updatedRoomCodes;
};

export const lockPlayRoomCharacter = async (params: {
  userId: string;
  characterId: PlayCharacterId;
}) => {
  const roomCode = getRoomCodesForActiveUser(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "character_select") {
    throw new PlayRoomError("Character selection is not active.");
  }
  const player = getPlayer(room, params.userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }
  if (player.selectedCharacter) {
    throw new PlayRoomError("Your character is already locked in.");
  }

  player.selectedCharacter = params.characterId;
  player.selectedAt = new Date().toISOString();
  const savedRoom = await saveOrDeleteRoom(room, {
    activity: {
      type: "character_locked",
      summary: `${player.name} locked a character.`,
      userId: params.userId,
      metadata: {
        characterId: params.characterId,
      },
    },
  });
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
  const roomCode = getRoomCodesForActiveUser(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("The shared room is not active.");
  }
  const player = getPlayer(room, params.userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(params.userId);
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
      PLAYER_MIN_Y,
      ROOM_HEIGHT / 2 - PLAYER_MARGIN
    ),
  };
  const savedRoom = await saveOrDeleteRoom(room, {
    persistStrategy: "deferred",
  });
  if (!savedRoom) {
    throw new PlayRoomError("Unable to move player.");
  }
  return {
    roomCode: savedRoom.roomCode,
    positions: serializeRoomPositions(savedRoom),
  };
};

export const interactPlayRoomNpc = async (params: {
  userId: string;
  npcType: "judge" | "arcade";
  positionX?: number;
  positionY?: number;
}) => {
  const roomCode = getRoomCodesForActiveUser(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("NPCs can only be moved in the shared room.");
  }

  const player = getPlayer(room, params.userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }

  const nextPositionX =
    typeof params.positionX === "number" ? params.positionX : player.position.x;
  const nextPositionY =
    typeof params.positionY === "number" ? params.positionY : player.position.y;
  player.position = {
    x: clamp(nextPositionX, -ROOM_WIDTH / 2 + PLAYER_MARGIN, ROOM_WIDTH / 2 - PLAYER_MARGIN),
    y: clamp(nextPositionY, PLAYER_MIN_Y, ROOM_HEIGHT / 2 - PLAYER_MARGIN),
  };

  const npc = params.npcType === "judge" ? room.judge : room.arcade;
  if (npc.carriedByUserId === params.userId) {
    npc.carriedByUserId = null;
    npc.visible = true;
    npc.x = player.position.x;
    npc.y = player.position.y;
  } else {
    if (!npc.visible) {
      throw new PlayRoomError("That NPC is not available right now.");
    }
    if (npc.carriedByUserId) {
      throw new PlayRoomError("Someone else is already carrying that NPC.");
    }
    const distance = Math.hypot(player.position.x - npc.x, player.position.y - npc.y);
    if (distance > npc.interactionRadius) {
      throw new PlayRoomError("Walk closer before picking that up.");
    }
    npc.carriedByUserId = params.userId;
  }

  const savedRoom = await saveOrDeleteRoom(room, {
    activity: {
      type: npc.carriedByUserId === params.userId ? "npc_picked_up" : "npc_dropped",
      summary:
        npc.carriedByUserId === params.userId
          ? `${player.name} picked up the ${params.npcType}.`
          : `${player.name} dropped the ${params.npcType}.`,
      userId: params.userId,
      metadata: { npcType: params.npcType },
    },
  });
  if (!savedRoom) {
    throw new PlayRoomError("Unable to move that NPC.");
  }

  return { roomCode: savedRoom.roomCode };
};

export const readyPlayRoomPlayer = async (userId: string) => {
  const roomCode = getRoomCodesForActiveUser(userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("The ready button is not active yet.");
  }
  const player = getPlayer(room, userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(userId);
    throw new PlayRoomError("You are not in that room.");
  }

  const distance = Math.hypot(
    player.position.x - PEDESTAL.x,
    player.position.y - PEDESTAL.y
  );
  if (distance > PEDESTAL.interactionRadius) {
    throw new PlayRoomError("Move closer to the pedestal to press ready.");
  }

  const hadSelectedTask = Boolean(room.selectedTask);
  player.isReadyAtPedestal = true;
  const savedRoom = await saveOrDeleteRoom(room, {
    activity: {
      type: hadSelectedTask ? "ready_reaffirmed" : "ready_pressed",
      summary: `${player.name} pressed ready.`,
      userId,
    },
  });
  if (!savedRoom) {
    throw new PlayRoomError("Unable to mark ready.");
  }

  return { roomCode: savedRoom.roomCode };
};

export const proposePlayRoomPoker = async (userId: string) => {
  const roomCode = getRoomCodesForActiveUser(userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("Poker can only be started from the shared room.");
  }
  const player = getPlayer(room, userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(userId);
    throw new PlayRoomError("You are not in that room.");
  }
  const distance = Math.hypot(
    player.position.x - room.arcade.x,
    player.position.y - room.arcade.y
  );
  if (!room.arcade.visible || room.arcade.carriedByUserId || distance > room.arcade.interactionRadius) {
    throw new PlayRoomError("Walk up to the arcade machine to start poker.");
  }

  if (room.pokerArcade.activeTableId) {
    try {
      const pokerResult = await joinPrivatePokerTable({
        tableId: room.pokerArcade.activeTableId,
        userId,
        name: player.name,
        handle: player.handle,
        amount: PLAYROOM_PRIVATE_POKER_BUYIN,
        suppressJoinLog: true,
      });
      const savedRoom = await saveOrDeleteRoom(room, {
        activity: {
          type: "poker_joined",
          summary: `${player.name} joined the room's poker table.`,
          userId,
        },
      });
      if (!savedRoom) {
        throw new PlayRoomError("Unable to sync the room after joining poker.");
      }
      return { roomCode: savedRoom.roomCode, pokerTableId: pokerResult.tableId };
    } catch (error) {
      if (!(error instanceof PlayRoomError) && error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("not found")) {
          room.pokerArcade.activeTableId = null;
        } else {
          throw new PlayRoomError(error.message);
        }
      } else {
        throw error;
      }
    }
  }

  if (room.pokerArcade.status === "voting") {
    throw new PlayRoomError("A poker request is already waiting for votes.");
  }

  room.judge.carriedByUserId = null;
  room.arcade.carriedByUserId = null;
  room.pokerArcade = {
    status: "voting",
    requestedByUserId: userId,
    requestedAt: new Date().toISOString(),
    acceptedUserIds: [userId],
    buyIn: PLAYROOM_PRIVATE_POKER_BUYIN,
    activeTableId: null,
  };

  const savedRoom = await saveOrDeleteRoom(room, {
    activity: {
      type: "poker_vote_started",
      summary: `${player.name} started a poker vote.`,
      userId,
    },
  });
  if (!savedRoom) {
    throw new PlayRoomError("Unable to open the poker arcade.");
  }

  return { roomCode: savedRoom.roomCode, pokerTableId: null as string | null };
};

export const respondPlayRoomPoker = async (params: {
  userId: string;
  accept: boolean;
}) => {
  const roomCode = getRoomCodesForActiveUser(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }
  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    throw new PlayRoomError("Poker voting is not active.");
  }
  if (room.pokerArcade.status !== "voting") {
    throw new PlayRoomError("There is no poker request to respond to.");
  }
  const player = getPlayer(room, params.userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }

  if (!params.accept) {
    room.pokerArcade = emptyPokerArcadeState();
    const savedRoom = await saveOrDeleteRoom(room, {
      activity: {
        type: "poker_vote_declined",
        summary: `${player.name} declined the poker vote.`,
        userId: params.userId,
      },
    });
    if (!savedRoom) {
      throw new PlayRoomError("Unable to clear the poker vote.");
    }
    return { roomCode: savedRoom.roomCode, pokerTableId: null as string | null };
  }

  room.pokerArcade.acceptedUserIds = Array.from(
    new Set([...room.pokerArcade.acceptedUserIds, params.userId])
  );

  if (room.pokerArcade.acceptedUserIds.length < getPresentPlayers(room).length) {
    const savedRoom = await saveOrDeleteRoom(room, {
      activity: {
        type: "poker_vote_accepted",
        summary: `${player.name} accepted the poker vote.`,
        userId: params.userId,
      },
    });
    if (!savedRoom) {
      throw new PlayRoomError("Unable to record the poker vote.");
    }
    return { roomCode: savedRoom.roomCode, pokerTableId: null as string | null };
  }

  try {
    const pokerResult = await startPrivatePokerTable({
      players: getPresentPlayers(room).map((participant) => ({
        userId: participant.userId,
        name: participant.name,
        handle: participant.handle,
      })),
      amount: room.pokerArcade.buyIn ?? PLAYROOM_PRIVATE_POKER_BUYIN,
    });
    room.pokerArcade = {
      ...emptyPokerArcadeState(),
      activeTableId: pokerResult.tableId,
    };
    const savedRoom = await saveOrDeleteRoom(room, {
      activity: {
        type: "poker_started",
        summary: "The room launched a poker table.",
        userId: params.userId,
      },
    });
    if (!savedRoom) {
      throw new PlayRoomError("Unable to sync the room after starting poker.");
    }
    return { roomCode: savedRoom.roomCode, pokerTableId: pokerResult.tableId };
  } catch (error) {
    room.pokerArcade = emptyPokerArcadeState();
    await saveOrDeleteRoom(room);
    throw new PlayRoomError(
      error instanceof Error ? error.message : "Unable to start the poker table."
    );
  }
};

const recordTaskCompletion = async (params: {
  roomId: string;
  userId: string;
  task: PlayTaskPayload;
  completedAt: string;
}) => {
  await ensurePlayRoomTables();
  const completedDate = new Date(params.completedAt);
  const completionDay = formatUtcDate(getUtcDayStart(completedDate));
  const completionWeekStart = formatUtcDate(getUtcWeekStart(completedDate));

  await db.query(
    `INSERT INTO play_room_task_completions (
       id,
       room_id,
       user_id,
       task_id,
       task_category,
       completed_at,
       completion_day,
       completion_week_start
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      params.roomId,
      params.userId,
      params.task.id,
      params.task.category,
      params.completedAt,
      completionDay,
      completionWeekStart,
    ]
  );
};

export const submitPlayRoomTask = async (params: {
  userId: string;
  submission: string;
}) => {
  const roomCode = getRoomCodesForActiveUser(params.userId);
  if (!roomCode) {
    throw new PlayRoomError("Join a room first.");
  }

  const submission = params.submission.trim().slice(0, 1500);
  if (!submission) {
    throw new PlayRoomError("Write a short submission for the judge.");
  }

  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("Room not found.", 404);
  }
  if (room.phase !== "task_reveal" || !room.selectedTask) {
    throw new PlayRoomError(
      "The judge only accepts submissions after the task is revealed."
    );
  }

  const player = getPlayer(room, params.userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are not in that room.");
  }

  const distance = Math.hypot(
    player.position.x - room.judge.x,
    player.position.y - room.judge.y
  );
  if (
    !room.judge.visible ||
    room.judge.carriedByUserId ||
    distance > room.judge.interactionRadius
  ) {
    throw new PlayRoomError("Walk up to the judge before submitting.");
  }

  const selectedTask = cloneTask(room.selectedTask);
  const verdict = await judgePlayTaskSubmission({
    taskCategory: selectedTask.category,
    taskText: selectedTask.text,
    playerName: player.name,
    characterLabel: player.selectedCharacter ?? "unselected",
    submission,
  });

  const freshRoom = (await loadRoom(roomCode)) ?? room;
  const freshPlayer = getPlayer(freshRoom, params.userId);
  if (!freshPlayer || !freshPlayer.isPresent) {
    clearPlayerRoomCode(params.userId);
    throw new PlayRoomError("You are no longer in that room.");
  }
  if (freshRoom.phase !== "task_reveal" || !freshRoom.selectedTask) {
    throw new PlayRoomError("The task phase changed before the judge responded.");
  }

  freshPlayer.taskSubmissionText = submission;
  freshPlayer.taskSubmittedAt = verdict.judgedAt;
  freshPlayer.taskJudgeVerdict = verdict;

  const savedRoom = await saveOrDeleteRoom(freshRoom, {
    activity: {
      type: verdict.decision === "pass" ? "task_passed" : "task_failed",
      summary:
        verdict.decision === "pass"
          ? `${freshPlayer.name} completed a ${selectedTask.category} task.`
          : `${freshPlayer.name} submitted a ${selectedTask.category} task.`,
      userId: params.userId,
      metadata: {
        taskId: selectedTask.id,
        taskCategory: selectedTask.category,
        decision: verdict.decision,
      },
    },
  });
  if (!savedRoom) {
    throw new PlayRoomError("Unable to save the judge verdict.");
  }

  if (verdict.decision === "pass") {
    await recordTaskCompletion({
      roomId: savedRoom.roomId,
      userId: params.userId,
      task: selectedTask,
      completedAt: verdict.judgedAt,
    });
  }

  return { roomCode: savedRoom.roomCode };
};

export const recordPlayRoomChatActivity = async (params: {
  userId: string;
  text: string;
}) => {
  const roomCode = getRoomCodesForActiveUser(params.userId);
  if (!roomCode) {
    return null;
  }

  const room = await loadRoom(roomCode);
  if (!room) {
    clearPlayerRoomCode(params.userId);
    return null;
  }

  if (room.phase !== "shared_room" && room.phase !== "task_reveal") {
    return null;
  }

  const player = getPlayer(room, params.userId);
  if (!player || !player.isPresent) {
    clearPlayerRoomCode(params.userId);
    return null;
  }

  const savedRoom = await saveRoom(room, {
    activity: {
      type: "chat_message",
      summary: `${player.name} sent a message.`,
      userId: params.userId,
      metadata: {
        preview: params.text.slice(0, 80),
      },
    },
  });

  return { roomCode: savedRoom.roomCode };
};
