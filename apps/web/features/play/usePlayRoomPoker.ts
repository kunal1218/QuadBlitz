"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connectSocket, socket } from "@/lib/socket";
import type { PokerClientState } from "./types";

type PokerBusyAction = "action" | "leave" | "rebuy" | "show" | null;

type UsePlayRoomPokerParams = {
  isAuthenticated: boolean;
  token: string | null;
};

const DEFAULT_REBUY_AMOUNT = 100;

export const usePlayRoomPoker = ({
  isAuthenticated,
  token,
}: UsePlayRoomPokerParams) => {
  const [pokerState, setPokerState] = useState<PokerClientState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<PokerBusyAction>(null);
  const [timerNow, setTimerNow] = useState(0);
  const serverTimeOffsetRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    connectSocket(token);

    const loadState = () => {
      socket.emit("poker:state");
    };

    const handleConnect = () => {
      loadState();
    };

    const handleState = (payload?: { state?: PokerClientState | null }) => {
      const nextState = payload?.state ?? null;
      if (nextState?.serverTime) {
        const serverMs = Date.parse(nextState.serverTime);
        if (Number.isFinite(serverMs)) {
          serverTimeOffsetRef.current = Date.now() - serverMs;
        }
      }
      setBusyAction(null);
      setError(null);
      setPokerState(nextState);
    };

    const handleError = (payload?: { error?: string }) => {
      setBusyAction(null);
      setError(payload?.error ?? "Unable to sync the poker table.");
    };

    socket.on("connect", handleConnect);
    socket.on("poker:state", handleState);
    socket.on("poker:error", handleError);

    if (socket.connected) {
      loadState();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("poker:state", handleState);
      socket.off("poker:error", handleError);
    };
  }, [isAuthenticated, token]);

  useEffect(() => {
    if (!isAuthenticated || !token || !pokerState) {
      return;
    }

    const sendHeartbeat = () => {
      if (!socket.connected) {
        return;
      }
      socket.emit("game:heartbeat", { game: "poker" });
    };

    sendHeartbeat();
    const interval = window.setInterval(sendHeartbeat, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [isAuthenticated, pokerState, token]);

  useEffect(() => {
    if (!pokerState?.turnStartedAt || pokerState.status !== "in_hand") {
      return;
    }
    const interval = window.setInterval(() => {
      setTimerNow(Date.now() - serverTimeOffsetRef.current);
    }, 200);
    return () => {
      window.clearInterval(interval);
    };
  }, [pokerState?.status, pokerState?.turnStartedAt]);

  let turnTimeLeft: number | null = null;
  let turnProgress = 1;
  if (
    pokerState?.turnStartedAt &&
    pokerState.currentPlayerIndex !== null &&
    pokerState.status === "in_hand"
  ) {
    const duration = pokerState.turnDurationSeconds ?? 20;
    const startedMs = Date.parse(pokerState.turnStartedAt);
    if (Number.isFinite(startedMs)) {
      const elapsed = Math.max(0, timerNow - startedMs);
      const remainingSeconds = Math.max(0, duration - elapsed / 1000);
      turnTimeLeft = Math.ceil(remainingSeconds);
      turnProgress = Math.max(0, Math.min(1, remainingSeconds / duration));
    } else {
      turnTimeLeft = duration;
    }
  }

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

  const act = useCallback(
    (action: "fold" | "check" | "call" | "bet" | "raise", amount?: number) => {
      setError(null);
      setBusyAction("action");
      emitWhenConnected(() => {
        socket.emit("poker:action", { action, amount });
      });
    },
    [emitWhenConnected]
  );

  const leaveTable = useCallback(() => {
    setError(null);
    setBusyAction("leave");
    emitWhenConnected(() => {
      socket.emit("poker:leave");
    });
  }, [emitWhenConnected]);

  const rebuy = useCallback(
    (amount = DEFAULT_REBUY_AMOUNT) => {
      setError(null);
      setBusyAction("rebuy");
      emitWhenConnected(() => {
        socket.emit("poker:rebuy", { amount });
      });
    },
    [emitWhenConnected]
  );

  const showCards = useCallback(() => {
    setError(null);
    setBusyAction("show");
    emitWhenConnected(() => {
      socket.emit("poker:show");
    });
  }, [emitWhenConnected]);

  return {
    pokerState: isAuthenticated ? pokerState : null,
    pokerError: isAuthenticated ? error : null,
    pokerBusyAction: isAuthenticated ? busyAction : null,
    turnTimeLeft,
    turnProgress,
    act,
    leaveTable,
    rebuy,
    showCards,
    clearPokerError: () => setError(null),
  };
};
