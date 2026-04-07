import { randomUUID } from "crypto";
import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { getUserFromToken } from "./authService";

let io: Server | null = null;
const userSocketMap = new Map<string, string>();

type EventChatMessage = {
  id: string;
  eventId: number;
  message: string;
  createdAt: string;
  sender: { id: string; name: string; handle?: string | null };
};

const MAX_EVENT_CHAT_MESSAGES = 50;
const eventChatHistory = new Map<number, EventChatMessage[]>();

const addEventChatMessage = (eventId: number, message: EventChatMessage) => {
  const current = eventChatHistory.get(eventId) ?? [];
  const next = [...current, message].slice(-MAX_EVENT_CHAT_MESSAGES);
  eventChatHistory.set(eventId, next);
  return next;
};

const getEventChatHistory = (eventId: number) =>
  eventChatHistory.get(eventId) ?? [];

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

    const existingSocketId = userSocketMap.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingSocket = io?.sockets.sockets.get(existingSocketId);
      existingSocket?.disconnect(true);
    }

    userSocketMap.set(userId, socket.id);
    socket.join("location-updates");
    console.info(`[socket] user ${userId} connected`);

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
    });
  });

  return io;
};

export const getSocketServer = () => io;

export const isUserOnline = (userId: string) => userSocketMap.has(userId);
