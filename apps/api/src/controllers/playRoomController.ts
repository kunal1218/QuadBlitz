import type { Request, Response } from "express";
import { AuthError, getUserFromToken } from "../services/authService";
import {
  PlayRoomError,
  fetchPlayRoomSummariesForUser,
} from "../services/playroomService";

const getToken = (req: Request) => {
  const header = req.header("authorization");
  if (!header) {
    return null;
  }

  const [type, token] = header.split(" ");
  if (type?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
};

const requireUser = async (req: Request) => {
  const token = getToken(req);
  if (!token) {
    throw new AuthError("Missing session token", 401);
  }

  const user = await getUserFromToken(token);
  if (!user) {
    throw new AuthError("Invalid session", 401);
  }

  return user;
};

const handleError = (res: Response, error: unknown) => {
  if (error instanceof AuthError || error instanceof PlayRoomError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error("Play room error:", error);
  res.status(500).json({ error: "Unable to process play room request" });
};

export const getPlayRooms = async (req: Request, res: Response) => {
  try {
    const user = await requireUser(req);
    const rooms = await fetchPlayRoomSummariesForUser(user.id);
    res.json({ rooms });
  } catch (error) {
    handleError(res, error);
  }
};
