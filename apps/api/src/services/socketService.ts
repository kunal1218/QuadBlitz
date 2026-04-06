import type { Server as HttpServer } from "http";
import { randomUUID } from "crypto";
import { Server, type Socket } from "socket.io";
import { getUserFromToken } from "./authService";
import {
  applyPokerAction,
  forceRemovePokerUser,
  getPokerStateForUser,
  getPokerStatesForTable,
  leavePokerTable,
  prunePokerTables,
  showPokerCards,
  touchPokerPlayer,
  type PokerAction,
  queuePokerPlayer,
  rebuyPoker,
} from "./pokerService";
import { leaveRankedGame } from "./rankedService";

let io: Server | null = null;
const userSocketMap = new Map<string, string>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const DISCONNECT_GRACE_MS = 15000;
const presenceTimers = new Map<
  string,
  {
    pokerAt?: number;
    convoAt?: number;
  }
>();
const PRESENCE_SWEEP_INTERVAL_MS = 5000;
let presenceSweepInterval: ReturnType<typeof setInterval> | null = null;
let isPresenceSweepRunning = false;

type EventChatMessage = {
  id: string;
  eventId: number;
  message: string;
  createdAt: string;
  sender: { id: string; name: string; handle?: string | null };
};

const MAX_EVENT_CHAT_MESSAGES = 50;
const eventChatHistory = new Map<number, EventChatMessage[]>();

type PokerChatMessage = {
  id: string;
  tableId: string;
  message: string;
  createdAt: string;
  sender: { id: string; name: string; handle?: string | null };
};

const MAX_POKER_CHAT_MESSAGES = 50;
const pokerChatHistory = new Map<string, PokerChatMessage[]>();

const addEventChatMessage = (eventId: number, message: EventChatMessage) => {
  const current = eventChatHistory.get(eventId) ?? [];
  const next = [...current, message].slice(-MAX_EVENT_CHAT_MESSAGES);
  eventChatHistory.set(eventId, next);
  return next;
};

const getEventChatHistory = (eventId: number) =>
  eventChatHistory.get(eventId) ?? [];

const addPokerChatMessage = (tableId: string, message: PokerChatMessage) => {
  const current = pokerChatHistory.get(tableId) ?? [];
  const next = [...current, message].slice(-MAX_POKER_CHAT_MESSAGES);
  pokerChatHistory.set(tableId, next);
  return next;
};

const getPokerChatHistory = (tableId: string) =>
  pokerChatHistory.get(tableId) ?? [];

const removePokerChatHistoryForTable = (tableId: string) => {
  pokerChatHistory.delete(tableId);
};

const removePokerChatMessagesForUser = (userId: string) => {
  pokerChatHistory.forEach((messages, tableId) => {
    const filtered = messages.filter((message) => message.sender.id !== userId);
    if (filtered.length !== messages.length) {
      pokerChatHistory.set(tableId, filtered);
    }
  });
};

const pokerRoomForTable = (tableId: string) => `poker:table:${tableId}`;

const emitPokerClosedForUsers = (
  userIds: readonly string[],
  endedTableIds: readonly string[]
) => {
  if (!io || !userIds.length) {
    return;
  }

  Array.from(new Set(userIds)).forEach((targetUserId) => {
    const socketId = userSocketMap.get(targetUserId);
    if (!socketId) {
      return;
    }
    const socket = io?.sockets.sockets.get(socketId);
    endedTableIds.forEach((tableId) => socket?.leave(pokerRoomForTable(tableId)));
    socket?.emit("poker:state", { state: null });
  });
};

const emitPokerStatesForTable = async (tableId: string) => {
  if (!io) {
    return;
  }
  const states = await getPokerStatesForTable(tableId);
  states.forEach(({ userId: targetUserId, state }) => {
    const socketId = userSocketMap.get(targetUserId);
    if (socketId) {
      io?.to(socketId).emit("poker:state", { state });
    }
  });
};

const clearEndedPokerTables = async (tableIds: readonly string[]) => {
  if (!tableIds.length) {
    return;
  }

  for (const tableId of Array.from(new Set(tableIds))) {
    removePokerChatHistoryForTable(tableId);
  }
};

const emitPokerErrorsForUsers = (userIds: readonly string[], message: string) => {
  if (!io) {
    return;
  }
  userIds.forEach((targetUserId) => {
    const socketId = userSocketMap.get(targetUserId);
    if (socketId) {
      io?.to(socketId).emit("poker:error", { error: message });
    }
  });
};

const updatePresence = (userId: string, game: "poker" | "convo") => {
  const current = presenceTimers.get(userId) ?? {};
  if (game === "poker") {
    current.pokerAt = Date.now();
  } else {
    current.convoAt = Date.now();
  }
  presenceTimers.set(userId, current);
};

const clearPresence = (userId: string, game: "poker" | "convo") => {
  const current = presenceTimers.get(userId);
  if (!current) {
    return;
  }
  if (game === "poker") {
    current.pokerAt = undefined;
  } else {
    current.convoAt = undefined;
  }
  if (!current.pokerAt && !current.convoAt) {
    presenceTimers.delete(userId);
  } else {
    presenceTimers.set(userId, current);
  }
};

const removePokerUser = async (userId: string) => {
  const result = await forceRemovePokerUser(userId);
  const endedTableIds = result.endedTableIds?.length ? result.endedTableIds : [];
  if (!endedTableIds.length) {
    removePokerChatMessagesForUser(userId);
  }
  emitPokerClosedForUsers(result.removedUserIds ?? [], endedTableIds);
  await clearEndedPokerTables(endedTableIds);
  const socketId = userSocketMap.get(userId);
  if (socketId && io) {
    const socket = io.sockets.sockets.get(socketId);
    const tableIds = [
      ...(result.updatedTableIds?.length ? result.updatedTableIds : []),
      ...endedTableIds,
    ];
    tableIds.forEach((tableId) => socket?.leave(pokerRoomForTable(tableId)));
    socket?.emit("poker:state", { state: null });
    if (result.queued) {
      socket?.emit("poker:queued", { queuePosition: result.queuePosition });
    }
  }
  const tableIds = result.updatedTableIds?.length ? result.updatedTableIds : [];
  if (tableIds.length) {
    await Promise.all(tableIds.map((tableId) => emitPokerStatesForTable(tableId)));
  }
  if (result.failedUserIds?.length) {
    emitPokerErrorsForUsers(result.failedUserIds, "Not enough coins for that buy-in.");
  }
};

const startPresenceSweep = () => {
  if (presenceSweepInterval) {
    return;
  }
  presenceSweepInterval = setInterval(async () => {
    if (isPresenceSweepRunning) {
      return;
    }
    isPresenceSweepRunning = true;
    const now = Date.now();
    const users = Array.from(presenceTimers.entries());
    for (const [userId, presence] of users) {
      if (presence.pokerAt && now - presence.pokerAt > DISCONNECT_GRACE_MS) {
        clearPresence(userId, "poker");
        try {
          await removePokerUser(userId);
        } catch (error) {
          console.warn("[socket] failed to remove poker player (presence)", error);
        }
      }
      if (presence.convoAt && now - presence.convoAt > DISCONNECT_GRACE_MS) {
        clearPresence(userId, "convo");
        try {
          await leaveRankedGame(userId);
        } catch (error) {
          console.warn("[socket] failed to remove ranked player (presence)", error);
        }
      }
    }
    try {
      const pruneResult = await prunePokerTables({
        inactivityMs: DISCONNECT_GRACE_MS,
        isUserActive: (userId) => {
          const presence = presenceTimers.get(userId);
          return Boolean(
            presence?.pokerAt && now - presence.pokerAt <= DISCONNECT_GRACE_MS
          );
        },
      });
      if (pruneResult.removedUserIds?.length) {
        pruneResult.removedUserIds.forEach((removedUserId) => {
          removePokerChatMessagesForUser(removedUserId);
        });
        emitPokerClosedForUsers(
          pruneResult.removedUserIds,
          pruneResult.endedTableIds ?? []
        );
      }
      await clearEndedPokerTables(pruneResult.endedTableIds ?? []);
      if (pruneResult.updatedTableIds?.length) {
        await Promise.all(
          pruneResult.updatedTableIds.map((tableId) => emitPokerStatesForTable(tableId))
        );
      }
      if (pruneResult.failedUserIds?.length) {
        emitPokerErrorsForUsers(
          pruneResult.failedUserIds,
          "Not enough coins for that buy-in."
        );
      }
    } catch (error) {
      console.warn("[socket] failed to prune poker tables", error);
    }
    isPresenceSweepRunning = false;
  }, PRESENCE_SWEEP_INTERVAL_MS);
};

const normalizeOrigin = (value: string) => value.replace(/\/$/, "");
const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://quadblitz.com",
  "https://www.quadblitz.com",
].map(normalizeOrigin);
const configuredOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((value) => normalizeOrigin(value.trim()))
  .filter(Boolean);
const allowedOriginSet = new Set([...defaultAllowedOrigins, ...configuredOrigins]);
const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  if (allowedOriginSet.has(normalized)) {
    return true;
  }
  if (normalized.endsWith(".vercel.app")) {
    return true;
  }
  if (normalized.startsWith("http://localhost") || normalized.startsWith("http://127.0.0.1")) {
    return true;
  }
  return false;
};

export const initializeSocketServer = (httpServer: HttpServer) => {
  if (io) {
    return io;
  }

  io = new Server(httpServer, {
    cors: {
      origin: (
        origin: string | undefined,
        callback: (error: Error | null, allow?: boolean) => void
      ) => {
        callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    },
  });

  io.use(async (socket: Socket, next: (error?: Error) => void) => {
    try {
      const token =
        (socket.handshake.auth as { token?: string } | undefined)?.token ?? "";
      if (!token) {
        return next(new Error("Unauthorized"));
      }

      const user = await getUserFromToken(token);
      if (!user) {
        return next(new Error("Unauthorized"));
      }

      socket.data.userId = user.id;
      socket.data.userProfile = {
        id: user.id,
        name: user.name,
        handle: user.handle,
      };
      return next();
    } catch (error) {
      console.warn("[socket] auth error", error);
      return next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const userId = socket.data.userId as string | undefined;
    const userProfile = socket.data.userProfile as
      | { id: string; name: string; handle: string }
      | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    const existingTimer = disconnectTimers.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimers.delete(userId);
    }

    const existingSocketId = userSocketMap.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingSocket = io?.sockets.sockets.get(existingSocketId);
      existingSocket?.disconnect(true);
    }

    userSocketMap.set(userId, socket.id);
    socket.join("location-updates");
    console.info(`[socket] user ${userId} connected`);

    const emitPokerError = (message: string) => {
      socket.emit("poker:error", { error: message });
    };
    const joinPokerTableRoom = async () => {
      const result = await getPokerStateForUser(userId);
      if (result.tableId) {
        socket.join(pokerRoomForTable(result.tableId));
      }
      socket.emit("poker:state", { state: result.state });
      if (result.queued) {
        socket.emit("poker:queued", { queuePosition: result.queuePosition });
      }
    };

    socket.on("poker:state", async () => {
      try {
        updatePresence(userId, "poker");
        await touchPokerPlayer(userId);
        await joinPokerTableRoom();
      } catch (error) {
        emitPokerError(
          error instanceof Error ? error.message : "Unable to load poker table."
        );
      }
    });

    socket.on("poker:queue", async (payload?: { amount?: number }) => {
      try {
        updatePresence(userId, "poker");
        await touchPokerPlayer(userId);
        if (!userProfile) {
          throw new Error("Missing user profile");
        }
        const result = await queuePokerPlayer({
          userId,
          name: userProfile.name,
          handle: userProfile.handle,
          amount: payload?.amount,
        });
        if (result.tableId) {
          socket.join(pokerRoomForTable(result.tableId));
        }
        emitPokerClosedForUsers(
          result.removedUserIds ?? [],
          result.endedTableIds ?? []
        );
        await clearEndedPokerTables(result.endedTableIds ?? []);
        if (result.queued) {
          socket.emit("poker:queued", { queuePosition: result.queuePosition });
        }
        const tableIds = result.updatedTableIds?.length
          ? result.updatedTableIds
          : result.tableId
            ? [result.tableId]
            : [];
        await Promise.all(tableIds.map((tableId) => emitPokerStatesForTable(tableId)));
      } catch (error) {
        emitPokerError(
          error instanceof Error ? error.message : "Unable to join poker table."
        );
      }
    });

    socket.on(
      "poker:action",
      async (payload?: { action?: string; amount?: number }) => {
        try {
          updatePresence(userId, "poker");
          await touchPokerPlayer(userId);
          const actionType =
            typeof payload?.action === "string"
              ? payload.action.toLowerCase()
              : "";
          if (!"fold check call bet raise".split(" ").includes(actionType)) {
            throw new Error("Invalid poker action.");
          }
          const normalizedAction = actionType as PokerAction["action"];
          const action: PokerAction =
            normalizedAction === "bet" || normalizedAction === "raise"
              ? { action: normalizedAction, amount: Number(payload?.amount ?? 0) }
              : { action: normalizedAction };
          const result = await applyPokerAction({ userId, action });
          emitPokerClosedForUsers(
            result.removedUserIds ?? [],
            result.endedTableIds ?? []
          );
          await clearEndedPokerTables(result.endedTableIds ?? []);
          const tableIds = result.updatedTableIds?.length
            ? result.updatedTableIds
            : [result.tableId];
          await Promise.all(tableIds.map((tableId) => emitPokerStatesForTable(tableId)));
          if (result.failedUserIds?.length) {
            emitPokerErrorsForUsers(
              result.failedUserIds,
              "Not enough coins for that buy-in."
            );
          }
        } catch (error) {
          emitPokerError(
            error instanceof Error ? error.message : "Unable to act in poker."
          );
        }
      }
    );

    socket.on("poker:rebuy", async (payload?: { amount?: number }) => {
      try {
        updatePresence(userId, "poker");
        await touchPokerPlayer(userId);
        const amount =
          typeof payload?.amount === "number"
            ? payload.amount
            : Number(payload?.amount);
        const result = await rebuyPoker({ userId, amount });
        await emitPokerStatesForTable(result.tableId);
      } catch (error) {
        emitPokerError(
          error instanceof Error ? error.message : "Unable to rebuy."
        );
      }
    });

    socket.on("poker:chat", async (payload?: { message?: string }) => {
      try {
        updatePresence(userId, "poker");
        await touchPokerPlayer(userId);
        const message = payload?.message?.trim() ?? "";
        if (!message) {
          return;
        }
        const result = await getPokerStateForUser(userId);
        if (!result.tableId || !userProfile) {
          return;
        }
        const chatMessage: PokerChatMessage = {
          id: randomUUID(),
          tableId: result.tableId,
          message: message.slice(0, 500),
          createdAt: new Date().toISOString(),
          sender: {
            id: userProfile.id,
            name: userProfile.name,
            handle: userProfile.handle,
          },
        };
        addPokerChatMessage(result.tableId, chatMessage);
        io?.to(pokerRoomForTable(result.tableId)).emit("poker:chat", {
          message: chatMessage,
        });
      } catch (error) {
        emitPokerError(
          error instanceof Error ? error.message : "Unable to send chat."
        );
      }
    });

    socket.on("poker:show", async () => {
      try {
        updatePresence(userId, "poker");
        await touchPokerPlayer(userId);
        const result = await showPokerCards(userId);
        const tableIds = result.updatedTableIds?.length
          ? result.updatedTableIds
          : [result.tableId];
        await Promise.all(tableIds.map((tableId) => emitPokerStatesForTable(tableId)));
      } catch (error) {
        emitPokerError(
          error instanceof Error ? error.message : "Unable to reveal cards."
        );
      }
    });

    socket.on("poker:chat:history", async () => {
      updatePresence(userId, "poker");
      await touchPokerPlayer(userId);
      const result = await getPokerStateForUser(userId);
      if (!result.tableId) {
        return;
      }
      socket.emit("poker:chat:history", {
        tableId: result.tableId,
        messages: getPokerChatHistory(result.tableId),
      });
    });

    socket.on("poker:leave", async () => {
      try {
        clearPresence(userId, "poker");
        const result = await leavePokerTable(userId);
        const endedTableIds = result.endedTableIds ?? [];
        if (!endedTableIds.length) {
          removePokerChatMessagesForUser(userId);
        }
        endedTableIds.forEach((tableId) => socket.leave(pokerRoomForTable(tableId)));
        socket.emit("poker:state", { state: null });
        emitPokerClosedForUsers(result.removedUserIds ?? [], endedTableIds);
        await clearEndedPokerTables(endedTableIds);
        if (result.queued) {
          socket.emit("poker:queued", { queuePosition: result.queuePosition });
        }
        const tableIds = result.updatedTableIds?.length
          ? result.updatedTableIds
          : [];
        await Promise.all(tableIds.map((tableId) => emitPokerStatesForTable(tableId)));
        if (result.failedUserIds?.length) {
          emitPokerErrorsForUsers(
            result.failedUserIds,
            "Not enough coins for that buy-in."
          );
        }
      } catch (error) {
        emitPokerError(
          error instanceof Error ? error.message : "Unable to leave the table."
        );
      }
    });

    socket.on("game:heartbeat", (payload?: { game?: string }) => {
      const game = payload?.game;
      if (game === "poker" || game === "convo") {
        updatePresence(userId, game);
      }
      if (game === "poker") {
        void touchPokerPlayer(userId);
      }
    });

    socket.on("join-event", (eventId: number | string) => {
      const parsed = Number(eventId);
      if (!Number.isFinite(parsed)) {
        return;
      }
      socket.join(`event-${parsed}`);
    });

    socket.on("leave-event", (eventId: number | string) => {
      const parsed = Number(eventId);
      if (!Number.isFinite(parsed)) {
        return;
      }
      socket.leave(`event-${parsed}`);
    });

    socket.on("join-event-room", (eventId: number | string) => {
      const parsed = Number(eventId);
      if (!Number.isFinite(parsed)) {
        return;
      }
      socket.join(`event-${parsed}`);
    });

    socket.on("leave-event-room", (eventId: number | string) => {
      const parsed = Number(eventId);
      if (!Number.isFinite(parsed)) {
        return;
      }
      socket.leave(`event-${parsed}`);
    });

    socket.on(
      "event:chat",
      (payload?: { eventId?: number | string; message?: string }) => {
        const parsedId = Number(payload?.eventId);
        const message = payload?.message?.trim() ?? "";
        if (!Number.isFinite(parsedId) || !message) {
          return;
        }
        if (!userProfile) {
          return;
        }
        const chatMessage: EventChatMessage = {
          id: randomUUID(),
          eventId: parsedId,
          message: message.slice(0, 500),
          createdAt: new Date().toISOString(),
          sender: {
            id: userProfile.id,
            name: userProfile.name,
            handle: userProfile.handle,
          },
        };
        addEventChatMessage(parsedId, chatMessage);
        io?.to(`event-${parsedId}`).emit("event:chat", {
          eventId: parsedId,
          message: chatMessage,
        });
      }
    );

    socket.on(
      "event:chat:history",
      (payload?: { eventId?: number | string }) => {
        const parsedId = Number(payload?.eventId);
        if (!Number.isFinite(parsedId)) {
          return;
        }
        socket.emit("event:chat:history", {
          eventId: parsedId,
          messages: getEventChatHistory(parsedId),
        });
      }
    );

    socket.on("disconnect", () => {
      if (userSocketMap.get(userId) === socket.id) {
        userSocketMap.delete(userId);
      }
      socket.leave("location-updates");
      console.info(`[socket] user ${userId} disconnected`);
      const priorTimer = disconnectTimers.get(userId);
      if (priorTimer) {
        clearTimeout(priorTimer);
      }
      const timer = setTimeout(async () => {
        disconnectTimers.delete(userId);
        if (userSocketMap.has(userId)) {
          return;
        }
        try {
          await removePokerUser(userId);
        } catch (error) {
          console.warn("[socket] failed to remove poker player", error);
        }
        try {
          await leaveRankedGame(userId);
        } catch (error) {
          console.warn("[socket] failed to remove ranked player", error);
        }
      }, DISCONNECT_GRACE_MS);
      disconnectTimers.set(userId, timer);
    });
  });

  startPresenceSweep();

  return io;
};

export const getSocketServer = () => io;

const hasFreshPresence = (value?: number) =>
  typeof value === "number" && Date.now() - value <= DISCONNECT_GRACE_MS;

export const isUserOnline = (userId: string) => {
  if (userSocketMap.has(userId)) {
    return true;
  }

  const presence = presenceTimers.get(userId);
  if (!presence) {
    return false;
  }

  return hasFreshPresence(presence.pokerAt) || hasFreshPresence(presence.convoAt);
};
