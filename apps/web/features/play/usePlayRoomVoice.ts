"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "@/lib/socket";
import type { PlayRoomState } from "./types";

type VoiceSignal =
  | {
      kind: "offer" | "answer";
      description: RTCSessionDescriptionInit;
    }
  | {
      kind: "ice";
      candidate: RTCIceCandidateInit;
    };

type VoiceStatus = "idle" | "requesting" | "ready" | "unsupported" | "denied";
export type PlayRoomVoiceMode = "push_to_talk" | "voice_stream";

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
const DISCONNECTED_PEER_CLOSE_DELAY_MS = 1500;

export const usePlayRoomVoice = ({
  roomState,
  currentUserId,
  pushToTalkActive,
  voiceMode,
  micMuted,
}: {
  roomState: PlayRoomState | null;
  currentUserId: string | null | undefined;
  pushToTalkActive: boolean;
  voiceMode: PlayRoomVoiceMode;
  micMuted: boolean;
}) => {
  const [voiceStatusState, setVoiceStatusState] = useState<Exclude<VoiceStatus, "idle">>(
    "requesting"
  );
  const [voiceErrorState, setVoiceErrorState] = useState<string | null>(null);
  const [voiceReadyTick, setVoiceReadyTick] = useState(0);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const disconnectCleanupTimersRef = useRef<Map<string, number>>(new Map());

  const isVoicePhase = Boolean(
    currentUserId &&
      roomState &&
      (roomState.phase === "shared_room" || roomState.phase === "task_reveal")
  );
  const roomCode = isVoicePhase ? roomState?.roomCode ?? null : null;
  const remoteUserIds = useMemo(
    () =>
      isVoicePhase && currentUserId && roomState
        ? roomState.players
            .filter((player) => player.isPresent)
            .map((player) => player.userId)
            .filter((userId) => userId !== currentUserId)
            .sort()
        : [],
    [currentUserId, isVoicePhase, roomState]
  );
  const isMicLive =
    isVoicePhase &&
    voiceStatusState === "ready" &&
    !micMuted &&
    (voiceMode === "voice_stream" || pushToTalkActive);

  const removeAudioElement = useCallback((remoteUserId: string) => {
    const audio = audioElementsRef.current.get(remoteUserId);
    if (!audio) {
      return;
    }
    audio.pause();
    audio.srcObject = null;
    audio.remove();
    audioElementsRef.current.delete(remoteUserId);
  }, []);

  const clearDisconnectCleanupTimer = useCallback((remoteUserId: string) => {
    const timer = disconnectCleanupTimersRef.current.get(remoteUserId);
    if (typeof timer === "number") {
      window.clearTimeout(timer);
      disconnectCleanupTimersRef.current.delete(remoteUserId);
    }
  }, []);

  const closePeerConnection = useCallback(
    (remoteUserId: string) => {
      clearDisconnectCleanupTimer(remoteUserId);
      const connection = peerConnectionsRef.current.get(remoteUserId);
      if (connection) {
        connection.ontrack = null;
        connection.onicecandidate = null;
        connection.onconnectionstatechange = null;
        connection.oniceconnectionstatechange = null;
        connection.close();
        peerConnectionsRef.current.delete(remoteUserId);
      }
      removeAudioElement(remoteUserId);
    },
    [clearDisconnectCleanupTimer, removeAudioElement]
  );

  const closeAllConnections = useCallback(() => {
    Array.from(disconnectCleanupTimersRef.current.keys()).forEach((remoteUserId) => {
      clearDisconnectCleanupTimer(remoteUserId);
    });
    Array.from(peerConnectionsRef.current.keys()).forEach((remoteUserId) => {
      closePeerConnection(remoteUserId);
    });
  }, [clearDisconnectCleanupTimer, closePeerConnection]);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    localStreamRef.current = null;
  }, []);

  const attachRemoteStream = useCallback((remoteUserId: string, stream: MediaStream) => {
    let audio = audioElementsRef.current.get(remoteUserId);
    if (!audio) {
      audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.dataset.playroomVoice = remoteUserId;
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioElementsRef.current.set(remoteUserId, audio);
    }
    audio.srcObject = stream;
    void audio.play().catch(() => {
      // Autoplay can fail before the user interacts with the page.
    });
  }, []);

  const createConnection = useCallback(
    (remoteUserId: string) => {
      const existing = peerConnectionsRef.current.get(remoteUserId);
      if (existing) {
        return existing;
      }

      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const localStream = localStreamRef.current;
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          connection.addTrack(track, localStream);
        });
      }

      connection.onicecandidate = (event) => {
        if (!event.candidate || !roomCode) {
          return;
        }
        socket.emit("playroom:voice:signal", {
          targetUserId: remoteUserId,
          signal: {
            kind: "ice",
            candidate: event.candidate.toJSON(),
          },
        });
      };

      connection.ontrack = (event) => {
        const stream =
          event.streams[0] ??
          new MediaStream(event.track ? [event.track] : []);
        attachRemoteStream(remoteUserId, stream);
      };

      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "connected") {
          clearDisconnectCleanupTimer(remoteUserId);
          return;
        }
        if (connection.connectionState === "disconnected") {
          clearDisconnectCleanupTimer(remoteUserId);
          const timer = window.setTimeout(() => {
            closePeerConnection(remoteUserId);
          }, DISCONNECTED_PEER_CLOSE_DELAY_MS);
          disconnectCleanupTimersRef.current.set(remoteUserId, timer);
          return;
        }
        if (
          connection.connectionState === "failed" ||
          connection.connectionState === "closed"
        ) {
          closePeerConnection(remoteUserId);
        }
      };

      connection.oniceconnectionstatechange = () => {
        if (connection.iceConnectionState === "connected" || connection.iceConnectionState === "completed") {
          clearDisconnectCleanupTimer(remoteUserId);
          return;
        }
        if (connection.iceConnectionState === "disconnected") {
          clearDisconnectCleanupTimer(remoteUserId);
          const timer = window.setTimeout(() => {
            closePeerConnection(remoteUserId);
          }, DISCONNECTED_PEER_CLOSE_DELAY_MS);
          disconnectCleanupTimersRef.current.set(remoteUserId, timer);
          return;
        }
        if (
          connection.iceConnectionState === "failed" ||
          connection.iceConnectionState === "closed"
        ) {
          closePeerConnection(remoteUserId);
        }
      };

      peerConnectionsRef.current.set(remoteUserId, connection);
      return connection;
    },
    [attachRemoteStream, clearDisconnectCleanupTimer, closePeerConnection, roomCode]
  );

  const sendOffer = useCallback(
    async (remoteUserId: string) => {
      if (!roomCode) {
        return;
      }
      const connection = createConnection(remoteUserId);
      if (connection.signalingState !== "stable") {
        return;
      }
      const offer = await connection.createOffer({
        offerToReceiveAudio: true,
      });
      await connection.setLocalDescription(offer);
      socket.emit("playroom:voice:signal", {
        targetUserId: remoteUserId,
        signal: {
          kind: "offer",
          description: connection.localDescription?.toJSON() ?? offer,
        },
      });
    },
    [createConnection, roomCode]
  );

  const ensureLocalStream = useCallback(async () => {
    if (!isVoicePhase) {
      return null;
    }

    if (typeof window === "undefined") {
      return null;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceStatusState("unsupported");
      setVoiceErrorState("Voice chat is not supported in this browser.");
      return null;
    }

    if (localStreamRef.current) {
      return localStreamRef.current;
    }

    setVoiceStatusState("requesting");
    setVoiceErrorState(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      localStreamRef.current = stream;
      setVoiceStatusState("ready");
      setVoiceReadyTick((current) => current + 1);
      return stream;
    } catch {
      setVoiceStatusState("denied");
      setVoiceErrorState("Microphone access was blocked.");
      return null;
    }
  }, [isVoicePhase]);

  useEffect(() => {
    if (!isVoicePhase || !currentUserId || !roomCode) {
      closeAllConnections();
      stopLocalStream();
      return;
    }

    const initializeTimer = window.setTimeout(() => {
      void ensureLocalStream();
    }, 0);

    return () => {
      window.clearTimeout(initializeTimer);
      closeAllConnections();
      stopLocalStream();
    };
  }, [
    closeAllConnections,
    currentUserId,
    ensureLocalStream,
    isVoicePhase,
    roomCode,
    stopLocalStream,
  ]);

  useEffect(() => {
    const localStream = localStreamRef.current;
    if (!localStream || !isVoicePhase) {
      return;
    }

    localStream.getAudioTracks().forEach((track) => {
      track.enabled = isMicLive;
    });
  }, [isMicLive, isVoicePhase]);

  useEffect(() => {
    if (!isVoicePhase || !currentUserId || !roomCode || !localStreamRef.current) {
      return;
    }

    const remoteSet = new Set(remoteUserIds);
    Array.from(peerConnectionsRef.current.keys()).forEach((remoteUserId) => {
      if (!remoteSet.has(remoteUserId)) {
        closePeerConnection(remoteUserId);
      }
    });

    remoteUserIds.forEach((remoteUserId) => {
      const existingConnection = peerConnectionsRef.current.get(remoteUserId);
      if (existingConnection) {
        const isStaleConnection =
          existingConnection.connectionState === "disconnected" ||
          existingConnection.connectionState === "failed" ||
          existingConnection.connectionState === "closed" ||
          existingConnection.iceConnectionState === "disconnected" ||
          existingConnection.iceConnectionState === "failed" ||
          existingConnection.iceConnectionState === "closed";
        if (!isStaleConnection) {
          return;
        }
        closePeerConnection(remoteUserId);
      }
      if (currentUserId < remoteUserId) {
        void sendOffer(remoteUserId).catch(() => {
          closePeerConnection(remoteUserId);
        });
      }
    });
  }, [
    closePeerConnection,
    currentUserId,
    isVoicePhase,
    remoteUserIds,
    roomCode,
    sendOffer,
    voiceReadyTick,
  ]);

  useEffect(() => {
    if (!isVoicePhase || !currentUserId || !roomCode) {
      return;
    }

    const handleSignal = async (payload?: {
      roomCode?: string;
      fromUserId?: string;
      signal?: VoiceSignal;
    }) => {
      if (
        payload?.roomCode !== roomCode ||
        !payload.fromUserId ||
        payload.fromUserId === currentUserId ||
        !payload.signal
      ) {
        return;
      }

      const stream = localStreamRef.current ?? (await ensureLocalStream());
      if (!stream) {
        return;
      }

      const connection = createConnection(payload.fromUserId);
      const signal = payload.signal;

      try {
        if (signal.kind === "offer") {
          await connection.setRemoteDescription(
            new RTCSessionDescription(signal.description)
          );
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          socket.emit("playroom:voice:signal", {
            targetUserId: payload.fromUserId,
            signal: {
              kind: "answer",
              description: connection.localDescription?.toJSON() ?? answer,
            },
          });
          return;
        }

        if (signal.kind === "answer") {
          await connection.setRemoteDescription(
            new RTCSessionDescription(signal.description)
          );
          return;
        }

        if (signal.kind === "ice") {
          await connection.addIceCandidate(new RTCIceCandidate(signal.candidate));
        }
      } catch {
        closePeerConnection(payload.fromUserId);
      }
    };

    socket.on("playroom:voice:signal", handleSignal);
    return () => {
      socket.off("playroom:voice:signal", handleSignal);
    };
  }, [
    closePeerConnection,
    createConnection,
    currentUserId,
    ensureLocalStream,
    isVoicePhase,
    roomCode,
  ]);

  const voiceStatus: VoiceStatus = isVoicePhase ? voiceStatusState : "idle";
  const voiceError = isVoicePhase ? voiceErrorState : null;

  return {
    voiceStatus,
    voiceError,
    isMicLive,
  };
};
