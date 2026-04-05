"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth";
import { CharacterAvatar, PLAY_CHARACTERS, getCharacterLabel } from "./playData";
import type { PlayCharacterId, PlayRoomState, PlayVector2 } from "./types";
import { usePlayRoom } from "./usePlayRoom";

const normalizeRoomCode = (value: string | null) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) ?? null;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatHandle = (handle: string) => (handle.startsWith("@") ? handle : `@${handle}`);

const getPlayerById = (roomState: PlayRoomState, userId: string | null | undefined) =>
  roomState.players.find((player) => player.userId === userId) ?? null;

const StatusBanner = ({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) => (
  <div className="mx-auto mb-4 flex w-full max-w-3xl items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 shadow-sm">
    <span>{error}</span>
    <button
      type="button"
      className="font-semibold text-rose-500 transition hover:text-rose-700"
      onClick={onDismiss}
      aria-label="Dismiss play room error"
    >
      Close
    </button>
  </div>
);

const EntryCard = ({
  inviteRoomCode,
  isAuthenticated,
  isConnected,
  isBusy,
  onPrimaryAction,
}: {
  inviteRoomCode: string | null;
  isAuthenticated: boolean;
  isConnected: boolean;
  isBusy: boolean;
  onPrimaryAction: () => void;
}) => {
  const heading = inviteRoomCode ? `Join Room ${inviteRoomCode}` : "Start a Room";
  const description = inviteRoomCode
    ? "Open the room link, join the lobby, then move into character select together."
    : "Create a lightweight multiplayer room and move straight into the new lobby flow.";
  const buttonLabel = inviteRoomCode ? "Join Room" : "Create Room";

  return (
    <div className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-5xl items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[28px] border border-black/10 bg-white p-8 shadow-[0_30px_80px_rgba(17,17,17,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-black/45">
          Quadblitz Play
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-black">
          {heading}
        </h1>
        <p className="mt-3 text-sm leading-6 text-black/60">{description}</p>
        <div className="mt-8 rounded-2xl border border-dashed border-black/12 bg-black/[0.02] px-4 py-3 text-xs uppercase tracking-[0.18em] text-black/45">
          {isAuthenticated
            ? isConnected
              ? "Realtime connected"
              : "Connecting to room service"
            : "Sign in required"}
        </div>
        <Button
          className="mt-6 w-full justify-center rounded-2xl bg-black px-5 py-3.5 text-sm font-semibold text-white shadow-none hover:translate-y-0 hover:bg-black/90"
          requiresAuth
          authMode={inviteRoomCode ? "login" : "signup"}
          disabled={isBusy}
          onClick={onPrimaryAction}
        >
          {isBusy ? "Working..." : buttonLabel}
        </Button>
      </div>
    </div>
  );
};

const RoomShell = ({
  title,
  subtitle,
  roomCode,
  children,
  onLeave,
}: {
  title: string;
  subtitle: string;
  roomCode: string;
  children: ReactNode;
  onLeave: () => void;
}) => (
  <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-8">
    <div className="flex flex-col gap-4 rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_24px_80px_rgba(17,17,17,0.06)] sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-black/45">
          Room {roomCode}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-black">
          {title}
        </h1>
        <p className="mt-2 text-sm text-black/60">{subtitle}</p>
      </div>
      <Button
        variant="outline"
        className="rounded-2xl border-black/10 px-4 py-2.5 text-black hover:border-black/20"
        onClick={onLeave}
      >
        Leave Room
      </Button>
    </div>
    {children}
  </div>
);

const LobbyPanel = ({
  roomState,
  copied,
  onCopyInvite,
}: {
  roomState: PlayRoomState;
  copied: boolean;
  onCopyInvite: () => void;
}) => {
  const playersNeeded = Math.max(0, roomState.minPlayersToStart - roomState.players.length);
  const host = roomState.players.find((player) => player.userId === roomState.hostUserId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_16px_48px_rgba(17,17,17,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
          Lobby
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-black">
          {playersNeeded > 0
            ? `Waiting for ${playersNeeded} more player${playersNeeded === 1 ? "" : "s"}`
            : "Moving into character select"}
        </h2>
        <p className="mt-2 text-sm text-black/60">
          {host ? `${host.name} is hosting.` : "A host is assigned automatically."} Share the
          invite link so at least two players can enter.
        </p>
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-black/10 bg-black/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
              Invite code
            </div>
            <div className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[0.18em] text-black">
              {roomState.roomCode}
            </div>
          </div>
          <Button
            className="rounded-2xl bg-black px-4 py-2.5 text-white shadow-none hover:translate-y-0 hover:bg-black/90"
            onClick={onCopyInvite}
          >
            {copied ? "Invite Copied" : "Copy Invite Link"}
          </Button>
        </div>
      </section>
      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_16px_48px_rgba(17,17,17,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
          Players
        </p>
        <div className="mt-4 space-y-3">
          {roomState.players.map((player) => (
            <div
              key={player.userId}
              className="flex items-center justify-between rounded-2xl border border-black/8 bg-black/[0.02] px-4 py-3"
            >
              <div>
                <div className="text-sm font-semibold text-black">
                  {player.name} {player.isHost ? "• Host" : ""}
                </div>
                <div className="mt-1 text-xs text-black/50">{formatHandle(player.handle)}</div>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/40">
                Waiting
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const CharacterSelectPanel = ({
  roomState,
  currentUserId,
  isLocking,
  onLockCharacter,
}: {
  roomState: PlayRoomState;
  currentUserId: string | null | undefined;
  isLocking: boolean;
  onLockCharacter: (characterId: PlayCharacterId) => void;
}) => {
  const me = getPlayerById(roomState, currentUserId);
  const everyoneLocked = roomState.players.every((player) => Boolean(player.selectedCharacter));

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_16px_48px_rgba(17,17,17,0.06)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
              Character Select
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-black">
              {me?.selectedCharacter
                ? `Locked in as ${getCharacterLabel(me.selectedCharacter)}`
                : "Pick one character"}
            </h2>
          </div>
          <div className="text-sm text-black/55">
            {everyoneLocked
              ? "All players are locked in."
              : "Selections are unique and lock immediately."}
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PLAY_CHARACTERS.map((character) => {
            const lockedBy = roomState.players.find(
              (player) => player.selectedCharacter === character.id
            );
            const isMine = lockedBy?.userId === currentUserId;
            const isTaken = Boolean(lockedBy && !isMine);
            const isLocked = Boolean(me?.selectedCharacter);
            return (
              <button
                key={character.id}
                type="button"
                disabled={isTaken || isLocked || isLocking}
                onClick={() => onLockCharacter(character.id)}
                className={`group flex flex-col items-center rounded-[24px] border px-4 py-5 text-center transition ${
                  isMine
                    ? "border-black bg-black text-white shadow-[0_16px_40px_rgba(17,17,17,0.16)]"
                    : "border-black/10 bg-white text-black hover:-translate-y-0.5 hover:border-black/20"
                } ${isTaken || isLocked ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <CharacterAvatar
                  characterId={character.id}
                  size={92}
                  className={isMine ? "drop-shadow-[0_8px_18px_rgba(255,255,255,0.18)]" : ""}
                />
                <div className="mt-3 text-sm font-semibold">{character.label}</div>
                <div className={`mt-1 text-xs ${isMine ? "text-white/70" : "text-black/50"}`}>
                  {isMine
                    ? "Locked In"
                    : isTaken
                      ? `Taken by ${lockedBy?.name ?? "another player"}`
                      : character.detail}
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_16px_48px_rgba(17,17,17,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
          Team Status
        </p>
        <div className="mt-4 space-y-3">
          {roomState.players.map((player) => (
            <div
              key={player.userId}
              className="rounded-2xl border border-black/8 bg-black/[0.02] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-black">{player.name}</div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/45">
                  {player.selectedCharacter ? "Ready" : "Choosing"}
                </div>
              </div>
              <div className="mt-2 text-xs text-black/55">
                {player.selectedCharacter
                  ? getCharacterLabel(player.selectedCharacter)
                  : "No character locked yet"}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

const TaskEnvelope = ({ task }: { task: PlayRoomState["selectedTask"] }) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!task) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute right-4 top-4 z-20 w-[min(92vw,340px)]">
      <button
        type="button"
        className="pointer-events-auto relative ml-auto block w-full rounded-[28px] border border-black/10 bg-white/96 px-5 py-5 text-left shadow-[0_24px_60px_rgba(17,17,17,0.18)] backdrop-blur"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-black/45">
              Envelope
            </div>
            <div className="mt-1 text-lg font-semibold text-black">
              {isOpen ? "Task revealed" : "Open your task"}
            </div>
          </div>
          <div className="relative h-14 w-20 rounded-2xl border-2 border-black bg-white">
            <div className="absolute inset-x-0 top-0 h-1/2 border-b-2 border-black" />
            <div className="absolute left-0 right-0 top-[10px] mx-auto h-8 w-12 -rotate-45 border-l-2 border-t-2 border-black" />
            <div className="absolute left-0 right-0 top-[10px] mx-auto h-8 w-12 rotate-45 border-r-2 border-t-2 border-black" />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ${
            isOpen ? "max-h-[420px] pt-5 opacity-100" : "max-h-0 pt-0 opacity-0"
          }`}
        >
          <div className="rounded-[22px] border border-black/10 bg-[#FFF9E9] px-4 py-4 shadow-[0_14px_36px_rgba(17,17,17,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
              {task.category}
            </div>
            <p className="mt-3 text-sm leading-6 text-black">{task.text}</p>
            {task.hasPlaceholderSlot ? (
              <div className="mt-4 rounded-2xl border border-dashed border-black/20 bg-white/75 px-4 py-6 text-center text-xs uppercase tracking-[0.22em] text-black/45">
                {task.placeholderLabel ?? "Placeholder slot"}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
};

const SharedRoomPanel = ({
  roomState,
  currentUserId,
  onMove,
  onReady,
}: {
  roomState: PlayRoomState;
  currentUserId: string | null | undefined;
  onMove: (directionX: number, directionY: number, deltaMs: number) => void;
  onReady: () => void;
}) => {
  const me = getPlayerById(roomState, currentUserId);
  const [localPosition, setLocalPosition] = useState<PlayVector2>(me?.position ?? { x: 0, y: 0 });
  const keyStateRef = useRef({ up: false, down: false, left: false, right: false });
  const roomRef = useRef(roomState);
  const localPositionRef = useRef<PlayVector2>(me?.position ?? { x: 0, y: 0 });
  const lastPositionRef = useRef<PlayVector2>(me?.position ?? { x: 0, y: 0 });

  useEffect(() => {
    roomRef.current = roomState;
  }, [roomState]);

  useEffect(() => {
    localPositionRef.current = localPosition;
  }, [localPosition]);

  useEffect(() => {
    if (!me) {
      return;
    }
    const changedEnough =
      Math.abs(me.position.x - lastPositionRef.current.x) > 14 ||
      Math.abs(me.position.y - lastPositionRef.current.y) > 14;
    if (changedEnough || roomState.phase === "task_reveal") {
      localPositionRef.current = me.position;
      lastPositionRef.current = me.position;
    }
  }, [me, roomState.phase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") {
        keyStateRef.current.up = true;
      }
      if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") {
        keyStateRef.current.down = true;
      }
      if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") {
        keyStateRef.current.left = true;
      }
      if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") {
        keyStateRef.current.right = true;
      }
      if ((event.key === "e" || event.key === "E") && me && !me.isReadyAtPedestal) {
        const pedestal = roomRef.current.room.pedestal;
        const distance = Math.hypot(
          localPositionRef.current.x - pedestal.x,
          localPositionRef.current.y - pedestal.y
        );
        if (distance <= pedestal.interactionRadius) {
          onReady();
        }
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "w" || event.key === "W" || event.key === "ArrowUp") {
        keyStateRef.current.up = false;
      }
      if (event.key === "s" || event.key === "S" || event.key === "ArrowDown") {
        keyStateRef.current.down = false;
      }
      if (event.key === "a" || event.key === "A" || event.key === "ArrowLeft") {
        keyStateRef.current.left = false;
      }
      if (event.key === "d" || event.key === "D" || event.key === "ArrowRight") {
        keyStateRef.current.right = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [me, onReady]);

  useEffect(() => {
    if (!me) {
      return;
    }

    let frame = 0;
    let lastTick = performance.now();
    let lastEmitAt = performance.now();

    const loop = (now: number) => {
      const elapsed = now - lastTick;
      lastTick = now;
      const inputX = (keyStateRef.current.right ? 1 : 0) - (keyStateRef.current.left ? 1 : 0);
      const inputY = (keyStateRef.current.down ? 1 : 0) - (keyStateRef.current.up ? 1 : 0);
      if (inputX !== 0 || inputY !== 0) {
        const magnitude = Math.hypot(inputX, inputY) || 1;
        const speed = 260;
        const widthHalf = roomRef.current.room.width / 2;
        const heightHalf = roomRef.current.room.height / 2;
        const nextX =
          localPositionRef.current.x + ((inputX / magnitude) * speed * elapsed) / 1000;
        const nextY =
          localPositionRef.current.y + ((inputY / magnitude) * speed * elapsed) / 1000;
        const optimisticPosition = {
          x: clamp(nextX, -widthHalf + 56, widthHalf - 56),
          y: clamp(nextY, -heightHalf + 56, heightHalf - 56),
        };
        localPositionRef.current = optimisticPosition;
        setLocalPosition(optimisticPosition);
        lastPositionRef.current = optimisticPosition;
        if (now - lastEmitAt >= 40) {
          onMove(inputX / magnitude, inputY / magnitude, elapsed);
          lastEmitAt = now;
        }
      }
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [me, onMove]);

  const pedestal = roomState.room.pedestal;
  const readyCount = roomState.players.filter((player) => player.isReadyAtPedestal).length;
  const isNearPedestal =
    me &&
    Math.hypot(localPosition.x - pedestal.x, localPosition.y - pedestal.y) <= pedestal.interactionRadius;

  return (
    <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
      <section className="relative overflow-hidden rounded-[32px] border border-black/10 bg-white p-4 shadow-[0_20px_60px_rgba(17,17,17,0.08)]">
        <TaskEnvelope
          key={roomState.selectedTask?.id ?? "closed"}
          task={roomState.phase === "task_reveal" ? roomState.selectedTask : null}
        />
        <div
          className="relative overflow-hidden rounded-[28px] border border-black/10 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(239,241,244,0.92)_55%,_rgba(225,229,234,1))]"
          style={{ aspectRatio: `${roomState.room.width} / ${roomState.room.height}` }}
        >
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                "linear-gradient(rgba(17,17,17,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(17,17,17,0.05) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
          <div
            className="absolute h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/10 bg-white shadow-[0_14px_30px_rgba(17,17,17,0.12)]"
            style={{
              left: "50%",
              top: "50%",
            }}
          >
            <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-black bg-[#39D353]" />
          </div>
          <div
            className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 translate-y-20 flex-col items-center gap-2"
          >
            <button
              type="button"
              disabled={!isNearPedestal || Boolean(me?.isReadyAtPedestal)}
              onClick={onReady}
              className={`rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] transition ${
                isNearPedestal && !me?.isReadyAtPedestal
                  ? "border-black bg-[#39D353] text-black"
                  : "border-black/10 bg-white/85 text-black/45"
              }`}
            >
              {me?.isReadyAtPedestal ? "Ready Locked" : "Press Ready"}
            </button>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/45">
              Walk in and press E or click
            </div>
          </div>
          {roomState.players.map((player) => {
            const useOptimisticPosition =
              player.userId === currentUserId &&
              me &&
              (Math.abs(localPosition.x - player.position.x) > 6 ||
                Math.abs(localPosition.y - player.position.y) > 6);
            const displayPosition = useOptimisticPosition ? localPosition : player.position;
            const left = ((displayPosition.x + roomState.room.width / 2) / roomState.room.width) * 100;
            const top = ((displayPosition.y + roomState.room.height / 2) / roomState.room.height) * 100;
            return (
              <div
                key={player.userId}
                className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                {player.selectedCharacter ? (
                  <CharacterAvatar
                    characterId={player.selectedCharacter}
                    size={80}
                    className={player.userId === currentUserId ? "scale-105" : ""}
                  />
                ) : null}
                <div className="mt-1 rounded-full border border-black/10 bg-white/92 px-3 py-1 text-[11px] font-semibold text-black shadow-sm">
                  {player.name}
                  {player.isReadyAtPedestal ? " • Ready" : ""}
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_16px_48px_rgba(17,17,17,0.06)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
          Room State
        </p>
        <div className="mt-4 rounded-2xl border border-black/8 bg-black/[0.02] px-4 py-4">
          <div className="text-sm font-semibold text-black">
            {roomState.phase === "task_reveal" ? "Envelope unlocked" : "Pedestal ready check"}
          </div>
          <div className="mt-2 text-sm text-black/55">
            {readyCount}/{roomState.players.length} player{roomState.players.length === 1 ? "" : "s"} ready.
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {roomState.players.map((player) => (
            <div
              key={player.userId}
              className="rounded-2xl border border-black/8 bg-black/[0.02] px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-black">{player.name}</div>
                  <div className="mt-1 text-xs text-black/55">
                    {getCharacterLabel(player.selectedCharacter)}
                  </div>
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-black/45">
                  {player.isReadyAtPedestal ? "Ready" : "Moving"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export const PlayRoomExperience = () => {
  const searchParams = useSearchParams();
  const [inviteRoomCodeOverride, setInviteRoomCodeOverride] = useState<string | null | undefined>();
  const inviteRoomCode =
    inviteRoomCodeOverride === undefined
      ? normalizeRoomCode(searchParams.get("room"))
      : inviteRoomCodeOverride;
  const { isAuthenticated, token, user } = useAuth();
  const {
    roomState,
    error,
    busyAction,
    isConnected,
    createRoom,
    joinRoom,
    leaveRoom,
    lockCharacter,
    movePlayer,
    readyUp,
    clearError,
  } = usePlayRoom({
    inviteRoomCode,
    isAuthenticated,
    token,
  });
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (roomState?.roomCode) {
      const nextUrl = `/play?room=${roomState.roomCode}`;
      if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
        window.history.replaceState({}, "", nextUrl);
      }
      return;
    }
    if (!inviteRoomCode && window.location.search) {
      window.history.replaceState({}, "", "/play");
    }
  }, [inviteRoomCode, roomState?.roomCode]);

  const handlePrimaryAction = () => {
    if (inviteRoomCode) {
      joinRoom(inviteRoomCode);
      return;
    }
    createRoom();
  };

  const handleCopyInvite = async () => {
    if (typeof window === "undefined" || !roomState?.roomCode || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(`${window.location.origin}/play?room=${roomState.roomCode}`);
    setCopied(true);
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopied(false);
    }, 1800);
  };

  const handleLeaveRoom = () => {
    setInviteRoomCodeOverride(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/play");
    }
    leaveRoom();
  };

  let content: ReactNode = (
    <EntryCard
      inviteRoomCode={inviteRoomCode}
      isAuthenticated={isAuthenticated}
      isConnected={isConnected}
      isBusy={busyAction === "create" || busyAction === "join"}
      onPrimaryAction={handlePrimaryAction}
    />
  );

  if (roomState?.phase === "lobby") {
    content = (
      <RoomShell
        title="Lobby"
        subtitle="Share the room code, wait for another player, then everyone moves forward automatically."
        roomCode={roomState.roomCode}
        onLeave={handleLeaveRoom}
      >
        <LobbyPanel roomState={roomState} copied={copied} onCopyInvite={handleCopyInvite} />
      </RoomShell>
    );
  }

  if (roomState?.phase === "character_select") {
    content = (
      <RoomShell
        title="Character Select"
        subtitle="Each player locks one simple white character. When everyone is in, the room opens."
        roomCode={roomState.roomCode}
        onLeave={handleLeaveRoom}
      >
        <CharacterSelectPanel
          roomState={roomState}
          currentUserId={user?.id}
          isLocking={busyAction === "select"}
          onLockCharacter={lockCharacter}
        />
      </RoomShell>
    );
  }

  if (roomState && (roomState.phase === "shared_room" || roomState.phase === "task_reveal")) {
    content = (
      <RoomShell
        title="Shared Room"
        subtitle="Move with WASD, walk to the center pedestal, and ready up together."
        roomCode={roomState.roomCode}
        onLeave={handleLeaveRoom}
      >
        <SharedRoomPanel
          roomState={roomState}
          currentUserId={user?.id}
          onMove={movePlayer}
          onReady={readyUp}
        />
      </RoomShell>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 z-0 bg-white" />
      <div className="relative z-10 mx-auto w-full max-w-7xl px-0 pb-10 pt-24 sm:pt-28">
        {error ? <StatusBanner error={error} onDismiss={clearError} /> : null}
        {content}
      </div>
    </div>
  );
};
