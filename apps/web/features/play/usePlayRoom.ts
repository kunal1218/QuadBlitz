"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectSocket, disconnectSocket, socket } from "@/lib/socket";
import type {
  PlayCharacterId,
  PlayRoomChatMessage,
  PlayRoomPositionsState,
  PlayRoomState,
} from "./types";

type BusyAction = "create" | "join" | "leave" | "select" | "ready" | "submit" | null;
type ExtendedBusyAction = BusyAction | "poker_propose" | "poker_vote";

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
  const [chatMessages, setChatMessages] = useState<PlayRoomChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<ExtendedBusyAction>(null);
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
      const nextState = payload?.state ?? null;
      setBusyAction(null);
      setError(null);
      setRoomState(nextState);
      setChatMessages((current) => {
        if (!nextState?.roomCode) {
          return [];
        }
        const now = Date.now();
        return current.filter(
          (message) =>
            message.roomCode === nextState.roomCode &&
            new Date(message.expiresAt).getTime() > now
        );
      });
    };
    const handlePositions = (payload?: { positions?: PlayRoomPositionsState | null }) => {
      const positions = payload?.positions;
      if (!positions) {
        return;
      }
      setRoomState((current) => {
        if (!current || current.roomCode !== positions.roomCode) {
          return current;
        }
        return {
          ...current,
          players: current.players.map((player) => {
            const snapshot = positions.players.find((entry) => entry.userId === player.userId);
            if (!snapshot) {
              return player;
            }
            return {
              ...player,
              position: snapshot.position,
            };
          }),
        };
      });
    };
    const handleError = (payload?: { error?: string }) => {
      setBusyAction(null);
      setError(payload?.error ?? "Unable to sync the play room.");
    };
    const handleChat = (payload?: { message?: PlayRoomChatMessage | null }) => {
      const message = payload?.message;
      if (!message) {
        return;
      }
      setChatMessages((current) => {
        const next = current
          .filter(
            (entry) =>
              entry.id !== message.id &&
              !(
                entry.roomCode === message.roomCode &&
                entry.userId === message.userId
              )
          )
          .concat(message);
        return next.filter((entry) => new Date(entry.expiresAt).getTime() > Date.now());
      });
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
    socket.on("playroom:positions", handlePositions);
    socket.on("playroom:chat", handleChat);
    socket.on("playroom:error", handleError);

    if (socket.connected) {
      loadInitialState();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.off("playroom:state", handleState);
      socket.off("playroom:positions", handlePositions);
      socket.off("playroom:chat", handleChat);
      socket.off("playroom:error", handleError);
      disconnectSocket();
    };
  }, [isAuthenticated, token]);

  useEffect(() => {
    const pruneExpiredMessages = () => {
      const now = Date.now();
      setChatMessages((current) =>
        current.filter((message) => new Date(message.expiresAt).getTime() > now)
      );
    };

    pruneExpiredMessages();
    const interval = window.setInterval(pruneExpiredMessages, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

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

  const createRoom = useCallback(
    (roomName?: string) => {
      setError(null);
      setBusyAction("create");
      emitWhenConnected(() => {
        socket.emit("playroom:create", { roomName });
      });
    },
    [emitWhenConnected]
  );

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
    (positionX: number, positionY: number) => {
      if (!socket.connected) {
        return;
      }
      socket.emit("playroom:move", {
        positionX,
        positionY,
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

  const submitTask = useCallback(
    (submission: string) => {
      setError(null);
      setBusyAction("submit");
      emitWhenConnected(() => {
        socket.emit("playroom:submit-task", { submission });
      });
    },
    [emitWhenConnected]
  );

  const sendChatMessage = useCallback(
    (text: string) => {
      const nextText = text.trim().slice(0, 200);
      if (!nextText) {
        return;
      }
      emitWhenConnected(() => {
        socket.emit("playroom:chat", { text: nextText });
      });
    },
    [emitWhenConnected]
  );

  const proposePokerArcade = useCallback(() => {
    setError(null);
    setBusyAction("poker_propose");
    emitWhenConnected(() => {
      socket.emit("playroom:poker:propose");
    });
  }, [emitWhenConnected]);

  const respondPokerArcade = useCallback(
    (accept: boolean) => {
      setError(null);
      setBusyAction("poker_vote");
      emitWhenConnected(() => {
        socket.emit("playroom:poker:respond", { accept });
      });
    },
    [emitWhenConnected]
  );

  const interactNpc = useCallback(
    (npcType: "judge" | "arcade") => {
      setError(null);
      emitWhenConnected(() => {
        socket.emit("playroom:npc:interact", { npcType });
      });
    },
    [emitWhenConnected]
  );

  return {
    roomState: isAuthenticated ? roomState : null,
    chatMessages: isAuthenticated ? chatMessages : [],
    error: isAuthenticated ? error : null,
    busyAction: isAuthenticated ? busyAction : null,
    isConnected: isAuthenticated ? isConnected : false,
    createRoom,
    joinRoom,
    leaveRoom,
    lockCharacter,
    movePlayer,
    readyUp,
    submitTask,
    sendChatMessage,
    interactNpc,
    proposePokerArcade,
    respondPokerArcade,
    clearError: () => setError(null),
  };
};
