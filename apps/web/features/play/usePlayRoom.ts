"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectSocket, disconnectSocket, socket } from "@/lib/socket";
import type { PlayCharacterId, PlayRoomState } from "./types";

type BusyAction = "create" | "join" | "leave" | "select" | "ready" | null;

type UsePlayRoomParams = {
  inviteRoomCode: string | null;
  isAuthenticated: boolean;
  token: string | null;
};

export const usePlayRoom = ({
  inviteRoomCode,
  isAuthenticated,
  token,
}: UsePlayRoomParams) => {
  const [roomState, setRoomState] = useState<PlayRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const inviteRoomRef = useRef<string | null>(inviteRoomCode);

  useEffect(() => {
    inviteRoomRef.current = inviteRoomCode;
  }, [inviteRoomCode]);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      disconnectSocket();
      return;
    }

    connectSocket(token);

    const loadInitialState = () => {
      setIsConnected(true);
      if (inviteRoomRef.current) {
        socket.emit("playroom:join", { roomCode: inviteRoomRef.current });
        return;
      }
      socket.emit("playroom:state");
    };

    const handleConnect = () => {
      loadInitialState();
    };
    const handleDisconnect = () => {
      setIsConnected(false);
    };
    const handleState = (payload?: { state?: PlayRoomState | null }) => {
      setBusyAction(null);
      setError(null);
      setRoomState(payload?.state ?? null);
    };
    const handleError = (payload?: { error?: string }) => {
      setBusyAction(null);
      setError(payload?.error ?? "Unable to sync the play room.");
    };
    const handleConnectError = () => {
      setIsConnected(false);
      setBusyAction(null);
      setError("Unable to connect to the realtime room service.");
    };

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);
    socket.on("playroom:state", handleState);
    socket.on("playroom:error", handleError);

    if (socket.connected) {
      loadInitialState();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("playroom:state", handleState);
      socket.off("playroom:error", handleError);
      disconnectSocket();
    };
  }, [isAuthenticated, token]);

  const emitWhenConnected = useCallback(
    (emit: () => void) => {
      if (!isAuthenticated || !token) {
        return;
      }
      connectSocket(token);
      if (socket.connected) {
        emit();
        return;
      }
      socket.once("connect", emit);
    },
    [isAuthenticated, token]
  );

  const createRoom = useCallback(() => {
    setError(null);
    setBusyAction("create");
    emitWhenConnected(() => {
      socket.emit("playroom:create");
    });
  }, [emitWhenConnected]);

  const joinRoom = useCallback(
    (roomCode: string) => {
      setError(null);
      setBusyAction("join");
      emitWhenConnected(() => {
        socket.emit("playroom:join", { roomCode });
      });
    },
    [emitWhenConnected]
  );

  const leaveRoom = useCallback(() => {
    setError(null);
    setBusyAction("leave");
    emitWhenConnected(() => {
      socket.emit("playroom:leave");
    });
  }, [emitWhenConnected]);

  const lockCharacter = useCallback(
    (characterId: PlayCharacterId) => {
      setError(null);
      setBusyAction("select");
      emitWhenConnected(() => {
        socket.emit("playroom:select-character", { characterId });
      });
    },
    [emitWhenConnected]
  );

  const movePlayer = useCallback(
    (directionX: number, directionY: number, deltaMs: number) => {
      if (!socket.connected) {
        return;
      }
      socket.emit("playroom:move", {
        directionX,
        directionY,
        deltaMs,
      });
    },
    []
  );

  const readyUp = useCallback(() => {
    setError(null);
    setBusyAction("ready");
    emitWhenConnected(() => {
      socket.emit("playroom:ready");
    });
  }, [emitWhenConnected]);

  return {
    roomState: isAuthenticated ? roomState : null,
    error: isAuthenticated ? error : null,
    busyAction: isAuthenticated ? busyAction : null,
    isConnected: isAuthenticated ? isConnected : false,
    createRoom,
    joinRoom,
    leaveRoom,
    lockCharacter,
    movePlayer,
    readyUp,
    clearError: () => setError(null),
  };
};
