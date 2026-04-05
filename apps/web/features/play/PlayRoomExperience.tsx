"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PlayRoomListEntry } from "@lockedin/shared";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth";
import { formatRelativeTime } from "@/lib/time";
import {
  ArcadeMachineAvatar,
  CharacterAvatar,
  JudgeAvatar,
  PLAY_CHARACTERS,
  getCharacterLabel,
} from "./playData";
import type {
  PlayCharacterId,
  PlayRoomChatMessage,
  PlayJudgeVerdict,
  PlayRoomState,
  PlayTaskPayload,
  PlayVector2,
} from "./types";
import { PlayPokerOverlay } from "./PlayPokerOverlay";
import { usePlayRoom } from "./usePlayRoom";
import { usePlayRoomList } from "./usePlayRoomList";
import { usePlayRoomPoker } from "./usePlayRoomPoker";
import { usePlayRoomVoice, type PlayRoomVoiceMode } from "./usePlayRoomVoice";

const PLAY_VOICE_SETTINGS_STORAGE_KEY = "quadblitz_play_voice_settings";

const normalizeRoomCode = (value: string | null) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) ?? null;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatHandle = (handle: string) => (handle.startsWith("@") ? handle : `@${handle}`);

const getPlayerById = (roomState: PlayRoomState, userId: string | null | undefined) =>
  roomState.players.find((player) => player.userId === userId) ?? null;

const getPresentPlayers = (roomState: PlayRoomState) =>
  roomState.players.filter((player) => player.isPresent);

const createPositionMap = (players: PlayRoomState["players"]) =>
  Object.fromEntries(players.map((player) => [player.userId, { ...player.position }]));

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const getCurrentWeekdayLabel = () =>
  new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date());

const formatPhaseLabel = (phase: PlayRoomListEntry["phase"]) => {
  switch (phase) {
    case "character_select":
      return "Character Select";
    case "shared_room":
      return "Shared Room";
    case "task_reveal":
      return "Task Reveal";
    default:
      return "Lobby";
  }
};

const ROOM_MEMBER_STACK_COLORS = ["#d8e5ff", "#dff0ff", "#efe7ff"];

const RoomMemberStack = ({ count }: { count: number }) => {
  const visibleCount = Math.min(3, Math.max(count, 0));
  const hiddenCount = Math.max(0, count - visibleCount);

  return (
    <div className="flex items-center">
      <div className="flex items-center">
        {Array.from({ length: visibleCount }).map((_, index) => (
          <span
            key={`${count}-${index}`}
            className={`h-7 w-7 rounded-full border-2 border-white ${
              index === 0 ? "" : "-ml-2.5"
            }`}
            style={{ backgroundColor: ROOM_MEMBER_STACK_COLORS[index], opacity: 0.88 }}
          />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <span className="-ml-1 inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-[#edf1fb] bg-white/84 px-1.5 text-[10px] font-semibold text-[#98a5bf]">
          +{hiddenCount}
        </span>
      ) : null}
    </div>
  );
};

const PlayPromoCard = ({
  title,
  description,
  cta,
  tone = "blue",
}: {
  title: string;
  description: string;
  cta: string;
  tone?: "blue" | "light";
}) => (
  <div
    className={`rounded-[34px] border px-8 py-8 shadow-[0_20px_56px_rgba(30,55,120,0.1)] ${
      tone === "blue"
        ? "border-transparent bg-[linear-gradient(145deg,#1e56f3_0%,#2a67fb_55%,#407afc_100%)] text-white"
        : "border-[#edf1fb] bg-white/95 text-[#18233a]"
    }`}
  >
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-full ${
        tone === "blue" ? "bg-white/14 text-white" : "bg-[#edf2ff] text-[#2b64f6]"
      }`}
    >
      <span className="text-lg font-semibold">{tone === "blue" ? "+2%" : "i"}</span>
    </div>
    <h3 className="mt-8 font-[family-name:var(--font-display)] text-[2rem] font-semibold tracking-[-0.05em]">
      {title}
    </h3>
    <p
      className={`mt-4 text-[1rem] leading-8 ${
        tone === "blue" ? "text-white/82" : "text-[#75809a]"
      }`}
    >
      {description}
    </p>
    <div
      className={`mt-8 text-sm font-semibold uppercase tracking-[0.18em] ${
        tone === "blue" ? "text-white" : "text-[#2b64f6]"
      }`}
    >
      {cta}
    </div>
  </div>
);

const GearIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M12 8.75a3.25 3.25 0 1 0 0 6.5 3.25 3.25 0 0 0 0-6.5Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="m19.4 15.05-.18.31a1.86 1.86 0 0 0 0 1.87l.03.05a2.25 2.25 0 1 1-3.9 2.25l-.06-.1a1.87 1.87 0 0 0-1.61-.93h-.36a1.87 1.87 0 0 0-1.61.93l-.06.1a2.25 2.25 0 1 1-3.9-2.25l.03-.05a1.86 1.86 0 0 0 0-1.87l-.18-.31a1.87 1.87 0 0 0-1.62-.94h-.12a2.25 2.25 0 1 1 0-4.5h.12c.67 0 1.29-.36 1.62-.94l.18-.31a1.86 1.86 0 0 0 0-1.87l-.03-.05a2.25 2.25 0 1 1 3.9-2.25l.06.1c.33.58.94.93 1.61.93h.36c.67 0 1.28-.35 1.61-.93l.06-.1a2.25 2.25 0 1 1 3.9 2.25l-.03.05a1.86 1.86 0 0 0 0 1.87l.18.31c.33.58.95.94 1.62.94h.12a2.25 2.25 0 1 1 0 4.5h-.12c-.67 0-1.29.36-1.62.94Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
    />
  </svg>
);

const MicIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V7a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M6.5 11.75a5.5 5.5 0 1 0 11 0M12 17.25V21M9.5 21h5"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

const MicOffIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
    <path
      d="M15.5 9.75V7a3.5 3.5 0 1 0-6.74-1.33M8.5 8.5V12a3.49 3.49 0 0 0 5.63 2.77"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
    <path
      d="M6.5 11.75a5.52 5.52 0 0 0 8.05 4.9M12 17.25V21M9.5 21h5M4 4l16 16"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  </svg>
);

const formatVoiceStatusLabel = (voiceStatus: "idle" | "requesting" | "ready" | "unsupported" | "denied") => {
  switch (voiceStatus) {
    case "requesting":
      return "Connecting microphone";
    case "ready":
      return "Microphone ready";
    case "unsupported":
      return "Voice unavailable";
    case "denied":
      return "Microphone blocked";
    default:
      return "Voice inactive";
  }
};

const formatRoomTitle = (hasRooms: boolean) =>
  hasRooms ? "Create Another Room" : "Create Your First Room";

const readStoredVoiceSettings = (): {
  voiceMode: PlayRoomVoiceMode;
  micMuted: boolean;
} | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(PLAY_VOICE_SETTINGS_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as {
      voiceMode?: PlayRoomVoiceMode;
      micMuted?: boolean;
    };
    return {
      voiceMode:
        parsed.voiceMode === "voice_stream" ? "voice_stream" : "push_to_talk",
      micMuted: Boolean(parsed.micMuted),
    };
  } catch {
    return null;
  }
};

const formatRoomDescription = (hasRooms: boolean) =>
  hasRooms
    ? "Start a new room for a different friend group while keeping your existing rooms alive."
    : "Start a persistent room for your group, then keep coming back to the same shared space over time.";

const StatusBanner = ({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) => (
  <div className="mx-auto mb-4 flex w-full max-w-3xl items-start justify-between gap-4 rounded-[24px] border border-[#ffd3d3] bg-[linear-gradient(180deg,#fff6f6_0%,#fff1f1_100%)] px-5 py-4 text-sm text-[#a43f3f] shadow-[0_18px_40px_rgba(223,76,76,0.08)]">
    <span>{error}</span>
    <button
      type="button"
      className="font-semibold text-[#dc5b5b] transition hover:text-[#b53f3f]"
      onClick={onDismiss}
      aria-label="Dismiss play room error"
    >
      Close
    </button>
  </div>
);

const RoomCreateCard = ({
  statusLabel,
  hasRooms,
  isAuthenticated,
  isBusy,
  roomName,
  onRoomNameChange,
  onCreate,
  compact = false,
}: {
  statusLabel: string;
  hasRooms: boolean;
  isAuthenticated: boolean;
  isBusy: boolean;
  roomName: string;
  onRoomNameChange: (value: string) => void;
  onCreate: () => void;
  compact?: boolean;
}) => (
  <div
    className={`rounded-[36px] border border-[#e7eefc] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(250,252,255,0.98)_100%)] p-10 shadow-[0_28px_80px_rgba(30,55,120,0.1)] ${
      compact ? "" : "w-full max-w-[420px]"
    }`}
  >
    <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#2b64f6]">
      Quadblitz Play
    </p>
    <h1 className="mt-5 max-w-[10ch] font-[family-name:var(--font-display)] text-[clamp(2.15rem,2.7vw,3.5rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-[#18233a]">
      {formatRoomTitle(hasRooms)}
    </h1>
    <p className="mt-6 max-w-[23rem] text-[0.98rem] leading-8 text-[#75809a]">
      {formatRoomDescription(hasRooms)}
    </p>
    <label className="mt-6 block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8b97ae]">
        Room Name
      </span>
      <input
        type="text"
        value={roomName}
        onChange={(event) => onRoomNameChange(event.target.value.slice(0, 48))}
        placeholder="Weekend Crew"
        maxLength={48}
        className="mt-4 w-full rounded-full border border-[#eef2fb] bg-[#f7f9fe] px-7 py-5 text-[1rem] font-medium text-[#1f2430] outline-none transition placeholder:text-[#c2c9d8] focus:border-[#d5def8] focus:bg-white focus:ring-4 focus:ring-[#f2f5ff]"
      />
    </label>

    <div className="mt-7 flex items-center justify-between rounded-full border border-[#eef2fb] bg-[#f8faff] px-7 py-5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#97a2b8]">
        {statusLabel}
      </span>
      <span
        className={`h-2.5 w-2.5 rounded-full ${
          isAuthenticated && statusLabel.toLowerCase().includes("connected")
            ? "bg-[#86d5a0]"
            : "bg-[#cfd6e4]"
        }`}
      />
    </div>

    <Button
      className="mt-8 w-full justify-center rounded-full bg-[#ff7b52] px-6 py-4.5 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_18px_34px_rgba(255,123,82,0.24)] transition hover:translate-y-[-1px] hover:bg-[#ff6c3c]"
      requiresAuth
      authMode="signup"
      disabled={isBusy}
      onClick={onCreate}
    >
      {isBusy ? "Working..." : isAuthenticated ? "Create Room" : "Sign In To Create"}
    </Button>
  </div>
);

const JoinInviteCard = ({
  inviteRoomCode,
  isAuthenticated,
  isConnected,
  isBusy,
  onJoin,
}: {
  inviteRoomCode: string;
  isAuthenticated: boolean;
  isConnected: boolean;
  isBusy: boolean;
  onJoin: () => void;
}) => (
  <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-5xl items-center justify-center px-4 py-6">
    <div className="w-full max-w-md rounded-[32px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-8 shadow-[0_26px_70px_rgba(20,86,244,0.12)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#5d73b3]">
        Shared Room Invite
      </p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-[#1f2430]">
        Join Room {inviteRoomCode}
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#687287]">
        Open the room link, join even if the room already started, and continue where the group left off.
      </p>
      <div className="mt-8 rounded-[22px] border border-[#dbe5ff] bg-[#f5f8ff] px-4 py-3 text-xs uppercase tracking-[0.18em] text-[#5970af]">
        {isAuthenticated
          ? isConnected
            ? "Realtime connected"
            : "Connecting to room service"
          : "Sign in required"}
      </div>
      <Button
        className="mt-6 w-full justify-center rounded-full bg-[#1756f5] px-5 py-3.5 text-sm font-semibold uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(23,86,245,0.22)] hover:translate-y-0 hover:bg-[#0f49e2]"
        requiresAuth
        authMode="login"
        disabled={isBusy}
        onClick={onJoin}
      >
        {isBusy ? "Working..." : "Join Room"}
      </Button>
    </div>
  </div>
);

const RoomHistoryPanel = ({
  rooms,
  isLoading,
  isAuthenticated,
  isConnected,
  isBusy,
  roomName,
  copiedRoomCode,
  onRoomNameChange,
  onCreate,
  onCopyRoomLink,
  onOpenRoom,
}: {
  rooms: PlayRoomListEntry[];
  isLoading: boolean;
  isAuthenticated: boolean;
  isConnected: boolean;
  isBusy: boolean;
  roomName: string;
  copiedRoomCode: string | null;
  onRoomNameChange: (value: string) => void;
  onCreate: () => void;
  onCopyRoomLink: (roomCode: string) => void;
  onOpenRoom: (roomCode: string) => void;
}) => (
  <div className="mx-auto flex min-h-[calc(100dvh-9rem)] max-w-[1340px] flex-col gap-8 px-6 py-5">
    <div className="grid gap-8 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
        <RoomCreateCard
          statusLabel={
            isAuthenticated
              ? isConnected
                ? "Realtime Connected"
                : "Connecting To Room Service"
              : "Sign In Required"
          }
          hasRooms={rooms.length > 0}
          isAuthenticated={isAuthenticated}
          isBusy={isBusy}
          roomName={roomName}
          onRoomNameChange={onRoomNameChange}
          onCreate={onCreate}
          compact
        />
        <PlayPromoCard
          title="Room Streak Bonus"
          description="Keep a room alive and it gains a 2% weekly score bonus for every week it survives."
          cta="See scoring  ->"
          tone="blue"
        />
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-[#2b64f6]">
              Your Long-Term Rooms
            </p>
            <h2 className="mt-4 max-w-[12ch] font-[family-name:var(--font-display)] text-[clamp(2.75rem,3.9vw,4.2rem)] font-semibold leading-[0.94] tracking-[-0.07em] text-[#18233a]">
              Pick up where your group left off
            </h2>
          </div>
          <div className="rounded-full border border-[#f0f4fc] bg-white/72 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#adb7c9]">
            Sorted by last entered
          </div>
        </div>

        {isLoading ? (
          <div className="rounded-[38px] border border-[#edf1fb] bg-white/95 px-8 py-10 text-base text-[#75809a] shadow-[0_24px_70px_rgba(30,55,120,0.08)]">
            Loading your rooms...
          </div>
        ) : rooms.length === 0 ? (
          <div className="rounded-[38px] border border-[#edf1fb] bg-white/95 p-8 shadow-[0_24px_70px_rgba(30,55,120,0.08)]">
            <div className="max-w-2xl">
              <div className="rounded-full border border-[#eef2fb] bg-[#f7f9fe] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#7f8ba4]">
                No room history yet
              </div>
              <h3 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-[-0.06em] text-[#18233a]">
                Create one room and it will live here from now on
              </h3>
              <p className="mt-4 max-w-xl text-[1.02rem] leading-8 text-[#75809a]">
                Returning rooms keep their name, member roster, score, and recent activity so your group can jump back in later.
              </p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              <div className="rounded-[28px] border border-[#eff3fb] bg-[#fbfcff] px-6 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9aa6bc]">
                  Last entered
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#d2d8e4]">
                  --
                </div>
              </div>
              <div className="rounded-[28px] border border-[#eff3fb] bg-[#fbfcff] px-6 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#9aa6bc]">
                  Last activity
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#d2d8e4]">
                  --
                </div>
              </div>
              <div className="rounded-[28px] border border-dashed border-[#d9e4ff] bg-[#f7faff] px-6 py-5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#2b64f6]">
                  Re-enter
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#b6c5eb]">
                  Waiting for your first room
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {rooms.map((room) => (
              <div
                key={room.roomCode}
                className="w-full rounded-[40px] border border-[#edf2fb] bg-white/95 p-8 text-left shadow-[0_24px_64px_rgba(30,55,120,0.07)] transition hover:-translate-y-0.5 hover:border-[#dde7fb] hover:shadow-[0_28px_74px_rgba(30,55,120,0.1)]"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-[#e6edff] bg-[#edf3ff] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2b64f6]">
                    {formatPhaseLabel(room.phase)}
                  </span>
                  {room.hasNewActivity ? (
                    <span className="rounded-full border border-[#dbeedc] bg-[#edf9ee] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2c9a4a]">
                      {room.newActivityCount} new update{room.newActivityCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                  {room.isHost ? (
                    <span className="rounded-full border border-[#ebeff8] bg-[#f7f9fe] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7f8ba4]">
                      Host
                    </span>
                  ) : null}
                </div>

                <div className="mt-7 flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[clamp(2.3rem,4vw,4.1rem)] font-[family-name:var(--font-display)] font-semibold leading-[0.95] tracking-[-0.07em] text-[#18233a]">
                      {room.roomName}
                    </h3>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-[0.98rem] text-[#8590a6]">
                      <span className="font-medium text-[#79859b]">Room {room.roomCode}</span>
                      <span className="text-[#dde3ef]">•</span>
                      <RoomMemberStack count={room.memberCount} />
                      <span className="text-[#7f8aa0]">
                        {room.memberCount} member{room.memberCount === 1 ? "" : "s"}
                      </span>
                      <span className="text-[#dde3ef]">•</span>
                      <span className="font-medium text-[#7fd193]">
                        {room.presentCount} active now
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 rounded-[32px] border border-[#f1f4fb] bg-[#f8faff] px-8 py-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a7b2c5]">
                      Total score
                    </div>
                    <div className="mt-3 font-[family-name:var(--font-display)] text-[3.25rem] font-semibold leading-none tracking-[-0.08em] text-[#2b64f6]">
                      {room.totalScore.toFixed(2)}
                    </div>
                    <div className="mt-3 text-sm text-[#99a4b8]">
                      Week {room.weeksAlive} alive
                    </div>
                  </div>
                </div>

                <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1fr_260px_260px]">
                  <div className="rounded-[28px] border border-[#f3f5fb] bg-white/72 px-6 py-5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#aab4c6]">
                      Last entered
                    </div>
                    <div className="mt-2 text-[1.55rem] font-semibold tracking-[-0.05em] text-[#243047]">
                      {room.lastEnteredAt ? formatRelativeTime(room.lastEnteredAt) : "Never"}
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-[#f3f5fb] bg-white/72 px-6 py-5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#aab4c6]">
                      Last activity
                    </div>
                    <div className="mt-2 text-[1.55rem] font-semibold tracking-[-0.05em] text-[#243047]">
                      {formatRelativeTime(room.lastActivityAt)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCopyRoomLink(room.roomCode)}
                    className="cursor-pointer rounded-[28px] border border-[#edf2fb] bg-white/78 px-6 py-5 text-left transition hover:border-[#d9e2f5] hover:bg-white"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#a6b1c5]">
                      Link
                    </div>
                    <div className="mt-2">
                      <span className="text-[1.25rem] font-semibold tracking-[-0.04em] text-[#4d6398]">
                        {copiedRoomCode === room.roomCode ? "Link copied" : "Copy link"}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenRoom(room.roomCode)}
                    className="cursor-pointer rounded-[28px] border border-[#18233a] bg-[#18233a] px-6 py-5 text-left shadow-[0_16px_36px_rgba(24,35,58,0.16)] transition hover:-translate-y-0.5 hover:bg-[#111a2e] hover:shadow-[0_20px_40px_rgba(24,35,58,0.2)]"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/62">
                      Room
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-4">
                      <span className="text-[2.05rem] font-semibold tracking-[-0.06em] text-white">
                        Open room
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <PlayPromoCard
            title="Performance Analytics"
            description="See which rooms are active, how often your group returns, and how recent task completions are affecting score."
            cta="View report"
            tone="light"
          />
          <PlayPromoCard
            title="Weekly Room League"
            description="Daily tasks add 1 point, weekly tasks add 7 points, and persistent rooms compound their bonus over time."
            cta="Review formula"
            tone="light"
          />
        </div>
      </div>
    </div>
  </div>
);

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
    <div className="flex flex-col gap-4 rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-6 shadow-[0_24px_72px_rgba(20,86,244,0.1)] sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#5d73b3]">
          Room {roomCode}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-[#1f2430]">
          {title}
        </h1>
        <p className="mt-2 text-sm text-[#687287]">{subtitle}</p>
      </div>
      <Button
        variant="outline"
        className="rounded-full border-[#d0ddff] bg-white px-5 py-3 text-[#1456f4] shadow-none hover:border-[#b8cbff] hover:bg-[#f5f8ff]"
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
  const presentPlayers = getPresentPlayers(roomState);
  const playersNeeded = Math.max(0, roomState.minPlayersToStart - presentPlayers.length);
  const host = roomState.players.find((player) => player.userId === roomState.hostUserId) ?? null;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-6 shadow-[0_18px_56px_rgba(20,86,244,0.1)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
          Lobby
        </p>
        <h2 className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[#1f2430]">
          {playersNeeded > 0
            ? `Waiting for ${playersNeeded} more player${playersNeeded === 1 ? "" : "s"}`
            : "Moving into character select"}
        </h2>
        <p className="mt-2 text-sm text-[#687287]">
          {host ? `${host.name} is hosting.` : "A host is assigned automatically."} Share the
          invite link so at least two players can enter. Room memberships persist, so offline
          members can come back later.
        </p>
        <div className="mt-6 flex flex-col gap-3 rounded-[24px] border border-[#dbe5ff] bg-[#edf3ff] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
              Invite code
            </div>
            <div className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[0.18em] text-[#1456f4]">
              {roomState.roomCode}
            </div>
          </div>
          <Button
            className="rounded-full bg-[#1756f5] px-5 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-white shadow-[0_14px_28px_rgba(23,86,245,0.2)] hover:translate-y-0 hover:bg-[#0f49e2]"
            onClick={onCopyInvite}
          >
            {copied ? "Invite Copied" : "Copy Invite Link"}
          </Button>
        </div>
      </section>
      <section className="rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-6 shadow-[0_18px_56px_rgba(20,86,244,0.1)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
          Players
        </p>
        <div className="mt-4 space-y-3">
          {roomState.players.map((player) => (
            <div
              key={player.userId}
              className="flex items-center justify-between rounded-[22px] border border-[#dbe5ff] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(20,86,244,0.06)]"
            >
              <div>
                <div className="text-sm font-semibold text-[#1f2430]">
                  {player.name} {player.isHost ? "• Host" : ""}
                </div>
                <div className="mt-1 text-xs text-[#7c869a]">{formatHandle(player.handle)}</div>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5d73b3]">
                {player.isPresent ? "In Room" : "Away"}
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
  const presentPlayers = getPresentPlayers(roomState);
  const everyoneLocked =
    presentPlayers.length >= roomState.minPlayersToStart &&
    presentPlayers.every((player) => Boolean(player.selectedCharacter));

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
      <section className="rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-6 shadow-[0_18px_56px_rgba(20,86,244,0.1)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
              Character Select
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#1f2430]">
              {me?.selectedCharacter
                ? `Locked in as ${getCharacterLabel(me.selectedCharacter)}`
                : "Pick one character"}
            </h2>
          </div>
          <div className="text-sm text-[#687287]">
            {everyoneLocked
              ? "All players are locked in."
              : "Active players can each lock one character. Character styles can repeat."}
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PLAY_CHARACTERS.map((character) => {
            const isLocked = Boolean(me?.selectedCharacter);
            const isMine = me?.selectedCharacter === character.id;
            const lockedCount = presentPlayers.filter(
              (player) => player.selectedCharacter === character.id
            ).length;
            return (
              <button
                key={character.id}
                type="button"
                disabled={isLocked || isLocking}
                onClick={() => onLockCharacter(character.id)}
                className={`group flex flex-col items-center rounded-[24px] border px-4 py-5 text-center transition ${
                  isMine
                    ? "border-[#1456f4] bg-[#1456f4] text-white shadow-[0_18px_36px_rgba(20,86,244,0.24)]"
                    : "border-[#dbe5ff] bg-white text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.06)] hover:-translate-y-0.5 hover:border-[#b8cbff] hover:bg-[#f9fbff]"
                } ${isLocked ? "cursor-not-allowed opacity-70" : ""}`}
              >
                <CharacterAvatar
                  characterId={character.id}
                  size={92}
                  className={isMine ? "drop-shadow-[0_8px_18px_rgba(255,255,255,0.18)]" : ""}
                />
                <div className="mt-3 text-sm font-semibold">{character.label}</div>
                <div className={`mt-1 text-xs ${isMine ? "text-white/78" : "text-[#7c869a]"}`}>
                  {isMine
                    ? "Locked In"
                    : lockedCount > 0
                      ? `${lockedCount} active player${lockedCount === 1 ? "" : "s"} picked this`
                      : character.detail}
                </div>
              </button>
            );
          })}
        </div>
      </section>
      <section className="rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-6 shadow-[0_18px_56px_rgba(20,86,244,0.1)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
          Team Status
        </p>
        <div className="mt-4 space-y-3">
          {roomState.players.map((player) => (
            <div
              key={player.userId}
              className="rounded-[22px] border border-[#dbe5ff] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(20,86,244,0.06)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-[#1f2430]">{player.name}</div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5d73b3]">
                  {player.isPresent
                    ? player.selectedCharacter
                      ? "Ready"
                      : "Choosing"
                    : "Away"}
                </div>
              </div>
              <div className="mt-2 text-xs text-[#7c869a]">
                {player.selectedCharacter
                  ? getCharacterLabel(player.selectedCharacter)
                  : player.isPresent
                    ? "No character locked yet"
                    : "Not currently in the room"}
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
        className="pointer-events-auto relative ml-auto block w-full rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] px-5 py-5 text-left shadow-[0_24px_60px_rgba(20,86,244,0.16)] backdrop-blur"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#5d73b3]">
              Envelope
            </div>
            <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#1f2430]">
              {isOpen ? "Task revealed" : "Open your task"}
            </div>
          </div>
          <div className="relative h-14 w-20 rounded-2xl border-2 border-[#1456f4] bg-white">
            <div className="absolute inset-x-0 top-0 h-1/2 border-b-2 border-[#1456f4]" />
            <div className="absolute left-0 right-0 top-[10px] mx-auto h-8 w-12 -rotate-45 border-l-2 border-t-2 border-[#1456f4]" />
            <div className="absolute left-0 right-0 top-[10px] mx-auto h-8 w-12 rotate-45 border-r-2 border-t-2 border-[#1456f4]" />
          </div>
        </div>
        <div
          className={`overflow-hidden transition-all duration-300 ${
            isOpen ? "max-h-[420px] pt-5 opacity-100" : "max-h-0 pt-0 opacity-0"
          }`}
        >
          <div className="rounded-[24px] border border-[#dbe5ff] bg-[#f5f8ff] px-4 py-4 shadow-[0_14px_36px_rgba(20,86,244,0.08)]">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
              {task.category}
            </div>
            <p className="mt-3 text-sm leading-6 text-[#1f2430]">{task.text}</p>
            {task.hasPlaceholderSlot ? (
              <div className="mt-4 rounded-[22px] border border-dashed border-[#bfd0ff] bg-white px-4 py-6 text-center text-xs uppercase tracking-[0.22em] text-[#5d73b3]">
                {task.placeholderLabel ?? "Placeholder slot"}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    </div>
  );
};

const JudgeSubmissionModal = ({
  task,
  draft,
  verdict,
  isSubmitting,
  onDraftChange,
  onClose,
  onSubmit,
}: {
  task: PlayTaskPayload | null;
  draft: string;
  verdict: PlayJudgeVerdict | null;
  isSubmitting: boolean;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) => {
  if (!task) {
    return null;
  }

  const verdictTone =
    verdict?.decision === "pass"
      ? {
          border: "border-[#bfe8c6]",
          background: "bg-[#effdf2]",
          accent: "text-[#24673a]",
        }
      : {
          border: "border-[#ffd4d4]",
          background: "bg-[#fff3f3]",
          accent: "text-[#b45151]",
        };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(240,246,255,0.72)] px-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-6 shadow-[0_28px_90px_rgba(20,86,244,0.18)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
              Judge Submission
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#1f2430]">
              Submit to the judge
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dbe5ff] bg-white text-xl text-[#5d73b3] transition hover:border-[#bfd0ff] hover:bg-[#f8fbff]"
            aria-label="Close judge submission"
          >
            ×
          </button>
        </div>

        <div className="mt-5 rounded-[24px] border border-[#dbe5ff] bg-[#eef4ff] px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3]">
            Current task
          </div>
          <p className="mt-2 text-sm leading-6 text-[#1f2430]">{task.text}</p>
        </div>

        <label className="mt-5 block">
          <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3]">
            What did you do?
          </span>
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder="Describe what you made, said, recorded, built, or link what you submitted."
            className="mt-2 min-h-[150px] w-full rounded-[24px] border border-[#dbe5ff] bg-white px-4 py-4 text-sm leading-6 text-[#1f2430] outline-none transition placeholder:text-[#95a0b7] focus:border-[#9fbbff] focus:ring-4 focus:ring-[#dfe8ff]"
            maxLength={1500}
          />
        </label>

        <div className="mt-3 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7c869a]">
          {draft.trim().length}/1500
        </div>

        {verdict ? (
          <div className={`mt-5 rounded-[24px] border px-4 py-4 ${verdictTone.border} ${verdictTone.background}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className={`text-[11px] font-semibold uppercase tracking-[0.24em] ${verdictTone.accent}`}>
                  Judge verdict
                </div>
                <div className="mt-1 text-lg font-semibold tracking-[-0.03em] text-[#1f2430]">
                  {verdict.summary}
                </div>
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${verdictTone.accent} ${verdictTone.background}`}>
                {verdict.decision === "pass" ? "Pass" : "Fail"}
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#445066]">{verdict.feedback}</p>
          </div>
        ) : null}

        <div className="mt-6 flex justify-end">
          <Button
            className="rounded-full bg-[#1756f5] px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_14px_28px_rgba(23,86,245,0.22)] hover:translate-y-0 hover:bg-[#0f49e2]"
            disabled={!draft.trim() || isSubmitting}
            onClick={onSubmit}
          >
            {isSubmitting ? "Judge Reviewing..." : "Submit to Judge"}
          </Button>
        </div>
      </div>
    </div>
  );
};

const VoiceSettingsModal = ({
  voiceMode,
  micMuted,
  voiceStatus,
  voiceError,
  onSelectMode,
  onToggleMute,
  onClose,
}: {
  voiceMode: PlayRoomVoiceMode;
  micMuted: boolean;
  voiceStatus: "idle" | "requesting" | "ready" | "unsupported" | "denied";
  voiceError: string | null;
  onSelectMode: (mode: PlayRoomVoiceMode) => void;
  onToggleMute: () => void;
  onClose: () => void;
}) => (
  <div className="absolute inset-0 z-40">
    <button
      type="button"
      aria-label="Close voice settings"
      onClick={onClose}
      className="absolute inset-0 bg-[rgba(240,246,255,0.36)] backdrop-blur-[2px]"
    />
    <div className="absolute bottom-24 right-5 z-10 w-[min(92vw,360px)] rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(246,249,255,0.98)_100%)] p-5 shadow-[0_28px_72px_rgba(20,86,244,0.18)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#5d73b3]">
            Voice Settings
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[#1f2430]">
            Choose how you want to talk
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#dbe5ff] bg-white text-xl text-[#5d73b3] transition hover:border-[#bfd0ff] hover:bg-[#f8fbff]"
          aria-label="Close voice settings"
        >
          ×
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        {(
          [
            {
              mode: "push_to_talk" as const,
              title: "Push To Talk",
              description: "Hold T while you want your mic live.",
            },
            {
              mode: "voice_stream" as const,
              title: "Voice Stream",
              description: "Keep your mic live until you mute it.",
            },
          ] satisfies Array<{
            mode: PlayRoomVoiceMode;
            title: string;
            description: string;
          }>
        ).map((option) => {
          const isSelected = voiceMode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              onClick={() => onSelectMode(option.mode)}
              className={`rounded-[24px] border px-4 py-4 text-left transition ${
                isSelected
                  ? "border-[#b9ceff] bg-[#eef4ff] shadow-[0_16px_32px_rgba(20,86,244,0.1)]"
                  : "border-[#dbe5ff] bg-white/92 hover:border-[#c7d6ff] hover:bg-[#f8fbff]"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#1f2430]">{option.title}</div>
                  <div className="mt-1 text-sm leading-6 text-[#6d7890]">
                    {option.description}
                  </div>
                </div>
                <span
                  className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    isSelected
                      ? "border-[#2b64f6] bg-[#2b64f6] text-white"
                      : "border-[#dbe5ff] bg-white text-[#8a97b3]"
                  }`}
                >
                  {isSelected ? "On" : "Off"}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-5 rounded-[24px] border border-[#dbe5ff] bg-white/88 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#5d73b3]">
              Microphone
            </div>
            <div className="mt-2 text-sm font-medium text-[#1f2430]">
              {formatVoiceStatusLabel(voiceStatus)}
            </div>
          </div>
          {voiceMode === "voice_stream" ? (
            <button
              type="button"
              onClick={onToggleMute}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                micMuted
                  ? "border border-[#ffd4d4] bg-[#fff3f3] text-[#b45151] hover:bg-[#ffeded]"
                  : "border border-[#bfe8c6] bg-[#effdf2] text-[#24673a] hover:bg-[#e7f9eb]"
              }`}
            >
              {micMuted ? <MicOffIcon className="h-4 w-4" /> : <MicIcon className="h-4 w-4" />}
              {micMuted ? "Muted" : "Live"}
            </button>
          ) : null}
        </div>
        {voiceError ? (
          <div className="mt-3 rounded-[18px] border border-[#ffd4d4] bg-[#fff3f3] px-3 py-3 text-xs font-medium leading-5 text-[#b45151]">
            {voiceError}
          </div>
        ) : null}
      </div>
    </div>
  </div>
);

const PokerArcadeVoteCard = ({
  roomState,
  currentUserId,
  isBusy,
  onAccept,
  onDecline,
}: {
  roomState: PlayRoomState;
  currentUserId: string | null | undefined;
  isBusy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) => {
  const vote = roomState.pokerArcade;
  if (vote.status !== "voting") {
    return null;
  }

  const presentPlayers = getPresentPlayers(roomState);
  const requester =
    roomState.players.find((player) => player.userId === vote.requestedByUserId) ?? null;
  const hasAccepted = currentUserId ? vote.acceptedUserIds.includes(currentUserId) : false;
  const waitingOn = Math.max(0, presentPlayers.length - vote.acceptedUserIds.length);
  const isRequester = vote.requestedByUserId === currentUserId;

  return (
    <div className="absolute inset-x-0 top-6 z-30 flex justify-center px-4">
      <div className="w-full max-w-md rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(245,248,255,0.96)_100%)] p-5 shadow-[0_24px_60px_rgba(20,86,244,0.16)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
          Arcade Machine
        </p>
        <h3 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#1f2430]">
          {isRequester
            ? "Poker vote started"
            : `${requester?.name ?? "A player"} wants to play poker`}
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#687287]">
          Private table, room players only, automatic 100-coin buy-in.
        </p>
        <div className="mt-4 rounded-[22px] border border-[#dbe5ff] bg-[#eef4ff] px-4 py-4 text-sm text-[#445066]">
          {hasAccepted
            ? waitingOn > 0
              ? `Waiting on ${waitingOn} more player${waitingOn === 1 ? "" : "s"} to accept.`
              : "Launching poker table."
            : "Accept to move the room into poker."}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!hasAccepted ? (
            <Button
              className="rounded-full bg-[#1756f5] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_14px_28px_rgba(23,86,245,0.22)] hover:translate-y-0 hover:bg-[#0f49e2]"
              disabled={isBusy}
              onClick={onAccept}
            >
              {isBusy ? "Working..." : "Join Poker"}
            </Button>
          ) : null}
          <button
            type="button"
            onClick={onDecline}
            disabled={isBusy}
            className="rounded-full border border-[#dbe5ff] bg-white px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)] disabled:opacity-60"
          >
            {isRequester ? "Cancel Vote" : hasAccepted ? "Back Out" : "Not Now"}
          </button>
        </div>
      </div>
    </div>
  );
};

const SharedRoomPanel = ({
  roomState,
  chatMessages,
  currentUserId,
  isInviteCopied,
  onMove,
  onReady,
  onSubmitTask,
  onSendChatMessage,
  onInteractNpc,
  onProposePokerArcade,
  onRespondPokerArcade,
  onCopyInvite,
  isSubmittingTask,
  isPokerVoting,
  pokerOverlayOpen,
  onLeave,
}: {
  roomState: PlayRoomState;
  chatMessages: PlayRoomChatMessage[];
  currentUserId: string | null | undefined;
  isInviteCopied: boolean;
  onMove: (positionX: number, positionY: number) => void;
  onReady: () => void;
  onSubmitTask: (submission: string) => void;
  onSendChatMessage: (text: string) => void;
  onInteractNpc: (npcType: "judge" | "arcade", position?: { x: number; y: number }) => void;
  onProposePokerArcade: () => void;
  onRespondPokerArcade: (accept: boolean) => void;
  onCopyInvite: () => void;
  isSubmittingTask: boolean;
  isPokerVoting: boolean;
  pokerOverlayOpen: boolean;
  onLeave: () => void;
}) => {
  const presentPlayers = getPresentPlayers(roomState);
  const me = getPlayerById(roomState, currentUserId);
  const [showRoomState, setShowRoomState] = useState(false);
  const [isJudgeModalOpen, setIsJudgeModalOpen] = useState(false);
  const [submissionDraft, setSubmissionDraft] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [voiceMode, setVoiceMode] = useState<PlayRoomVoiceMode>("push_to_talk");
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVoiceSettingsOpen, setIsVoiceSettingsOpen] = useState(false);
  const [isJudgeWalking, setIsJudgeWalking] = useState(false);
  const [weekdayLabel] = useState(() => getCurrentWeekdayLabel());
  const [renderPositions, setRenderPositions] = useState<Record<string, PlayVector2>>(() =>
    createPositionMap(presentPlayers)
  );
  const [movingPlayerIds, setMovingPlayerIds] = useState<Record<string, boolean>>({});
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const keyStateRef = useRef({ up: false, down: false, left: false, right: false });
  const roomRef = useRef(roomState);
  const judgeWalkTimerRef = useRef<number | null>(null);
  const hasLoadedVoiceSettingsRef = useRef(false);
  const previousNpcExitRef = useRef(pokerOverlayOpen);
  const serverPositionsRef = useRef<Record<string, PlayVector2>>(createPositionMap(presentPlayers));
  const visualPositionsRef = useRef<Record<string, PlayVector2>>(createPositionMap(presentPlayers));
  const { voiceError, voiceStatus, isMicLive } = usePlayRoomVoice({
    roomState,
    currentUserId,
    pushToTalkActive: voiceMode === "push_to_talk" ? isPushToTalkActive : false,
    voiceMode,
    micMuted: isMicMuted,
  });
  const wallHeight = roomState.room.wall?.height ?? roomState.room.height * 0.22;
  const wallBoundaryY =
    roomState.room.wall?.boundaryY ?? -roomState.room.height / 2 + wallHeight;
  const playerMinY = roomState.room.wall?.playerMinY ?? wallBoundaryY + 48;
  const wallHeightPercent = (wallHeight / roomState.room.height) * 100;
  const wallBoundaryPercent =
    ((wallBoundaryY + roomState.room.height / 2) / roomState.room.height) * 100;
  const boardTopPercent = Math.max(5.5, wallHeightPercent * 0.4);
  const npcEventExitActive = pokerOverlayOpen || roomState.pokerArcade.status === "voting";
  const syncCurrentPlayerPosition = useCallback(() => {
    if (!me) {
      return;
    }
    const currentPosition =
      visualPositionsRef.current[me.userId] ?? renderPositions[me.userId] ?? me.position;
    onMove(currentPosition.x, currentPosition.y);
  }, [me, onMove, renderPositions]);
  const getCurrentPlayerPosition = useCallback(() => {
    if (!me) {
      return null;
    }
    return visualPositionsRef.current[me.userId] ?? renderPositions[me.userId] ?? me.position;
  }, [me, renderPositions]);
  const pedestal = roomState.room.pedestal;
  const judge = roomState.room.judge;
  const arcade = roomState.room.arcade;
  const judgeCarrier = judge.carriedByUserId
    ? getPlayerById(roomState, judge.carriedByUserId)
    : null;
  const arcadeCarrier = arcade.carriedByUserId
    ? getPlayerById(roomState, arcade.carriedByUserId)
    : null;
  const readyCount = presentPlayers.filter((player) => player.isReadyAtPedestal).length;
  const myVisualPosition = me ? renderPositions[me.userId] ?? me.position : null;
  const hasReadied = Boolean(me?.isReadyAtPedestal);
  const myVerdict = me?.taskSubmission?.verdict ?? null;
  const isNearPedestal =
    myVisualPosition &&
    Math.hypot(myVisualPosition.x - pedestal.x, myVisualPosition.y - pedestal.y) <=
      pedestal.interactionRadius;
  const isNearJudge =
    myVisualPosition &&
    Math.hypot(myVisualPosition.x - judge.x, myVisualPosition.y - judge.y) <=
      judge.interactionRadius;
  const isNearArcade =
    myVisualPosition &&
    Math.hypot(myVisualPosition.x - arcade.x, myVisualPosition.y - arcade.y) <=
      arcade.interactionRadius;
  const isCarryingJudge = judge.carriedByUserId === currentUserId;
  const isCarryingArcade = arcade.carriedByUserId === currentUserId;
  const judgeLeft = ((judge.x + roomState.room.width / 2) / roomState.room.width) * 100;
  const judgeTop = ((judge.y + roomState.room.height / 2) / roomState.room.height) * 100;
  const arcadeLeft = ((arcade.x + roomState.room.width / 2) / roomState.room.width) * 100;
  const arcadeTop = ((arcade.y + roomState.room.height / 2) / roomState.room.height) * 100;
  const judgeCarrierPosition =
    judgeCarrier ? renderPositions[judgeCarrier.userId] ?? judgeCarrier.position : null;
  const arcadeCarrierPosition =
    arcadeCarrier ? renderPositions[arcadeCarrier.userId] ?? arcadeCarrier.position : null;
  const judgeRenderLeft = judgeCarrierPosition
    ? `${((judgeCarrierPosition.x + roomState.room.width / 2) / roomState.room.width) * 100}%`
    : npcEventExitActive
      ? "-12%"
      : `${judgeLeft}%`;
  const judgeRenderTop = judgeCarrierPosition
    ? `${((judgeCarrierPosition.y + roomState.room.height / 2) / roomState.room.height) * 100}%`
    : `${judgeTop}%`;
  const arcadeRenderLeft = arcadeCarrierPosition
    ? `${((arcadeCarrierPosition.x + roomState.room.width / 2) / roomState.room.width) * 100}%`
    : npcEventExitActive
      ? "-12%"
      : `${arcadeLeft}%`;
  const arcadeRenderTop = arcadeCarrierPosition
    ? `${((arcadeCarrierPosition.y + roomState.room.height / 2) / roomState.room.height) * 100}%`
    : `${arcadeTop}%`;
  const canSubmitToJudge =
    roomState.phase === "task_reveal" &&
    !pokerOverlayOpen &&
    judge.visible &&
    !judge.carriedByUserId &&
    Boolean(roomState.selectedTask) &&
    Boolean(isNearJudge);
  const canUseArcade =
    !pokerOverlayOpen &&
    arcade.visible &&
    !arcade.carriedByUserId &&
    roomState.pokerArcade.status === "idle" &&
    Boolean(isNearArcade);
  const hasActivePokerTable = Boolean(roomState.pokerArcade.activeTableId);
  const isJudgeModalVisible =
    isJudgeModalOpen &&
    roomState.phase === "task_reveal" &&
    Boolean(roomState.selectedTask);

  useEffect(() => {
    roomRef.current = roomState;
    serverPositionsRef.current = createPositionMap(presentPlayers);
    const nextVisual = { ...visualPositionsRef.current };
    const activeIds = new Set(presentPlayers.map((player) => player.userId));
    Object.keys(nextVisual).forEach((userId) => {
      if (!activeIds.has(userId)) {
        delete nextVisual[userId];
      }
    });
    presentPlayers.forEach((player) => {
      if (!nextVisual[player.userId]) {
        nextVisual[player.userId] = { ...player.position };
      }
    });
    visualPositionsRef.current = nextVisual;
  }, [presentPlayers, roomState]);

  useEffect(() => {
    if (!isChatting) {
      return;
    }

    chatInputRef.current?.focus();
  }, [isChatting]);

  useEffect(() => {
    const storedSettings = readStoredVoiceSettings();
    const loadTimer = window.setTimeout(() => {
      if (storedSettings) {
        setVoiceMode(storedSettings.voiceMode);
        setIsMicMuted(storedSettings.micMuted);
      }

      hasLoadedVoiceSettingsRef.current = true;
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !hasLoadedVoiceSettingsRef.current) {
      return;
    }

    window.localStorage.setItem(
      PLAY_VOICE_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        voiceMode,
        micMuted: isMicMuted,
      })
    );
  }, [isMicMuted, voiceMode]);

  useEffect(() => {
    if (previousNpcExitRef.current === npcEventExitActive) {
      return;
    }

    previousNpcExitRef.current = npcEventExitActive;
    if (judgeWalkTimerRef.current) {
      window.clearTimeout(judgeWalkTimerRef.current);
    }

    const animationFrame = window.requestAnimationFrame(() => {
      setIsJudgeWalking(true);
      judgeWalkTimerRef.current = window.setTimeout(() => {
        setIsJudgeWalking(false);
        judgeWalkTimerRef.current = null;
      }, 950);
    });

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [npcEventExitActive]);

  useEffect(() => {
    return () => {
      if (judgeWalkTimerRef.current) {
        window.clearTimeout(judgeWalkTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        setShowRoomState(true);
      }
      if (event.key === "t" || event.key === "T") {
        if (
          voiceMode === "push_to_talk" &&
          !isChatting &&
          !isJudgeModalOpen &&
          !isVoiceSettingsOpen &&
          !pokerOverlayOpen
        ) {
          setIsPushToTalkActive(true);
        }
      }
      if (event.key === "e" || event.key === "E") {
        if (
          !event.repeat &&
          !isChatting &&
          !isJudgeModalOpen &&
          !isVoiceSettingsOpen &&
          !pokerOverlayOpen
        ) {
          const interactionPosition = getCurrentPlayerPosition();
          if (isCarryingJudge) {
            onInteractNpc("judge", interactionPosition ?? undefined);
          } else if (isCarryingArcade) {
            onInteractNpc("arcade", interactionPosition ?? undefined);
          } else if (judge.visible && !judge.carriedByUserId && isNearJudge) {
            onInteractNpc("judge", interactionPosition ?? undefined);
          } else if (arcade.visible && !arcade.carriedByUserId && isNearArcade) {
            onInteractNpc("arcade", interactionPosition ?? undefined);
          }
        }
      }
      if (pokerOverlayOpen || isVoiceSettingsOpen) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (isChatting) {
          const nextMessage = chatDraft.trim();
          if (nextMessage) {
            syncCurrentPlayerPosition();
            onSendChatMessage(nextMessage);
          }
          setChatDraft("");
          setIsChatting(false);
          return;
        }
        keyStateRef.current = { up: false, down: false, left: false, right: false };
        syncCurrentPlayerPosition();
        setIsChatting(true);
        return;
      }
      if (isChatting) {
        return;
      }
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
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        event.preventDefault();
        setShowRoomState(false);
      }
      if (event.key === "t" || event.key === "T") {
        if (voiceMode === "push_to_talk") {
          setIsPushToTalkActive(false);
        }
      }
      if (isChatting || isVoiceSettingsOpen) {
        return;
      }
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
    const handleBlur = () => {
      keyStateRef.current = { up: false, down: false, left: false, right: false };
      setShowRoomState(false);
      setIsPushToTalkActive(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [
    chatDraft,
    isChatting,
    isJudgeModalOpen,
    isVoiceSettingsOpen,
    me,
    onReady,
    onSendChatMessage,
    onInteractNpc,
    pokerOverlayOpen,
    isCarryingArcade,
    isCarryingJudge,
    getCurrentPlayerPosition,
    isNearArcade,
    isNearJudge,
    judge,
    arcade,
    voiceMode,
    syncCurrentPlayerPosition,
  ]);

  useEffect(() => {
    let frame = 0;
    let lastTick = performance.now();
    let lastEmitAt = performance.now();

    const loop = (now: number) => {
      const elapsed = now - lastTick;
      lastTick = now;
      const smoothing = 1 - Math.exp(-elapsed / 90);
      const nextPositions = { ...visualPositionsRef.current };
      const nextMoving: Record<string, boolean> = {};
      const serverPositions = serverPositionsRef.current;
      const activeIds = new Set(
        roomRef.current.players.filter((player) => player.isPresent).map((player) => player.userId)
      );
      Object.keys(nextPositions).forEach((userId) => {
        if (!activeIds.has(userId)) {
          delete nextPositions[userId];
        }
      });

      roomRef.current.players
        .filter((player) => player.isPresent)
        .forEach((player) => {
          const currentPosition = nextPositions[player.userId] ?? player.position;
          const serverPosition = serverPositions[player.userId] ?? player.position;
          if (player.userId === me?.userId) {
            if (isChatting || isVoiceSettingsOpen || pokerOverlayOpen) {
              nextPositions[player.userId] = currentPosition;
              nextMoving[player.userId] = false;
              return;
            }
            const inputX =
              (keyStateRef.current.right ? 1 : 0) - (keyStateRef.current.left ? 1 : 0);
            const inputY =
              (keyStateRef.current.down ? 1 : 0) - (keyStateRef.current.up ? 1 : 0);
            if (inputX !== 0 || inputY !== 0) {
              const magnitude = Math.hypot(inputX, inputY) || 1;
              const speed = 260;
              const widthHalf = roomRef.current.room.width / 2;
              const heightHalf = roomRef.current.room.height / 2;
              const optimisticPosition = {
                x: clamp(
                  currentPosition.x + ((inputX / magnitude) * speed * elapsed) / 1000,
                  -widthHalf + 56,
                  widthHalf - 56
                ),
                y: clamp(
                  currentPosition.y + ((inputY / magnitude) * speed * elapsed) / 1000,
                  playerMinY,
                  heightHalf - 56
                ),
              };
              nextPositions[player.userId] = optimisticPosition;
              nextMoving[player.userId] = true;
              if (now - lastEmitAt >= 70) {
                onMove(optimisticPosition.x, optimisticPosition.y);
                lastEmitAt = now;
              }
              return;
            }
            nextPositions[player.userId] = {
              x: lerp(currentPosition.x, serverPosition.x, smoothing * 0.72),
              y: lerp(currentPosition.y, serverPosition.y, smoothing * 0.72),
            };
            nextMoving[player.userId] =
              Math.hypot(
                serverPosition.x - currentPosition.x,
                serverPosition.y - currentPosition.y
              ) > 0.9;
            return;
          }
          nextPositions[player.userId] = {
            x: lerp(currentPosition.x, serverPosition.x, smoothing),
            y: lerp(currentPosition.y, serverPosition.y, smoothing),
          };
          nextMoving[player.userId] =
            Math.hypot(serverPosition.x - currentPosition.x, serverPosition.y - currentPosition.y) >
            0.9;
        });

      visualPositionsRef.current = nextPositions;
      setRenderPositions(nextPositions);
      setMovingPlayerIds(nextMoving);
      frame = window.requestAnimationFrame(loop);
    };

    frame = window.requestAnimationFrame(loop);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isChatting, isVoiceSettingsOpen, me, onMove, playerMinY, pokerOverlayOpen]);

  const handleJudgeClick = () => {
    if (!canSubmitToJudge) {
      return;
    }
    setIsJudgeModalOpen(true);
  };

  const handleJudgeSubmit = () => {
    if (!submissionDraft.trim()) {
      return;
    }
    onSubmitTask(submissionDraft);
  };

  const handleArcadeClick = () => {
    if (!canUseArcade) {
      return;
    }
    onProposePokerArcade();
  };

  const handleVoiceModeSelect = (nextMode: PlayRoomVoiceMode) => {
    setVoiceMode(nextMode);
    setIsPushToTalkActive(false);
  };

  return (
    <section className="relative h-full min-h-0 w-full overflow-hidden bg-white">
      <style jsx>{`
        @keyframes play-room-rock {
          0% {
            transform: rotate(-25deg);
          }
          50% {
            transform: rotate(25deg);
          }
          100% {
            transform: rotate(-25deg);
          }
        }

        .chalk-text {
          color: #7b93bd;
          letter-spacing: 0.12em;
          text-shadow:
            0 1px 0 rgba(255, 255, 255, 0.7),
            0 0 8px rgba(123, 147, 189, 0.28),
            0 0 1px rgba(83, 100, 134, 0.45);
        }
      `}</style>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.98),_rgba(239,245,255,0.98)_34%,_rgba(232,239,250,1)_100%)]" />
      <div
        className="absolute inset-x-0 top-0 bg-[radial-gradient(circle_at_20%_0%,rgba(20,86,244,0.11),transparent_58%),radial-gradient(circle_at_85%_8%,rgba(20,86,244,0.08),transparent_48%),linear-gradient(180deg,rgba(228,236,249,0.92)_0%,rgba(218,228,244,0.9)_100%)]"
        style={{ height: `${wallHeightPercent}%` }}
      />
      <div
        className="absolute inset-x-0 z-[1] h-px bg-[linear-gradient(90deg,rgba(146,170,224,0),rgba(146,170,224,0.95),rgba(146,170,224,0))] shadow-[0_1px_0_rgba(255,255,255,0.75)]"
        style={{ top: `${wallBoundaryPercent}%` }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "linear-gradient(rgba(20,86,244,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(20,86,244,0.05) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      <TaskEnvelope
        key={roomState.selectedTask?.id ?? "closed"}
        task={
          roomState.phase === "task_reveal" && !pokerOverlayOpen
            ? roomState.selectedTask
            : null
        }
      />

      {isJudgeModalVisible ? (
        <JudgeSubmissionModal
          task={roomState.selectedTask}
          draft={submissionDraft}
          verdict={myVerdict}
          isSubmitting={isSubmittingTask}
          onDraftChange={setSubmissionDraft}
          onClose={() => setIsJudgeModalOpen(false)}
          onSubmit={handleJudgeSubmit}
        />
      ) : null}

      {isVoiceSettingsOpen ? (
        <VoiceSettingsModal
          voiceMode={voiceMode}
          micMuted={isMicMuted}
          voiceStatus={voiceStatus}
          voiceError={voiceError}
          onSelectMode={handleVoiceModeSelect}
          onToggleMute={() => setIsMicMuted((current) => !current)}
          onClose={() => setIsVoiceSettingsOpen(false)}
        />
      ) : null}

      <PokerArcadeVoteCard
        roomState={roomState}
        currentUserId={currentUserId}
        isBusy={isPokerVoting}
        onAccept={() => onRespondPokerArcade(true)}
        onDecline={() => onRespondPokerArcade(false)}
      />

      {!pokerOverlayOpen ? (
        <div className="absolute left-5 top-5 z-20 flex items-center gap-2">
          <div className="rounded-full border border-[#dbe5ff] bg-white/94 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3] shadow-[0_12px_30px_rgba(20,86,244,0.1)] backdrop-blur">
            {roomState.roomName} • {roomState.roomCode}
          </div>
          <button
            type="button"
            onClick={onCopyInvite}
            className="rounded-full border border-[#dbe5ff] bg-white/94 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#2b64f6] shadow-[0_12px_30px_rgba(20,86,244,0.1)] backdrop-blur transition hover:border-[#cbd9ff] hover:bg-[#f8fbff]"
          >
            {isInviteCopied ? "Link Copied" : "Copy Join Link"}
          </button>
        </div>
      ) : null}

      <div
        className="absolute left-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ top: `${boardTopPercent}%` }}
      >
        <div className="rounded-[28px] border border-[#dce5f7] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,251,255,0.98)_100%)] px-8 py-4 shadow-[0_18px_36px_rgba(36,69,124,0.12)]">
          <div className="text-center text-[10px] font-semibold uppercase tracking-[0.34em] text-[#93a5cc]">
            Today
          </div>
          <div className="chalk-text mt-2 text-center font-[family-name:var(--font-display)] text-2xl font-semibold uppercase tracking-[0.18em]">
            {weekdayLabel}
          </div>
        </div>
      </div>

      {showRoomState ? (
        <section className="absolute left-5 top-20 z-20 w-[min(360px,calc(100vw-2.5rem))] rounded-[30px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(245,248,255,0.96)_100%)] p-5 shadow-[0_24px_60px_rgba(20,86,244,0.16)] backdrop-blur">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3]">
            Room State
          </p>
          <div className="mt-4 rounded-[22px] border border-[#dbe5ff] bg-[#eef4ff] px-4 py-4">
            <div className="text-sm font-semibold text-[#1f2430]">
              {roomState.phase === "task_reveal" ? "Envelope unlocked" : "Pedestal ready check"}
            </div>
            <div className="mt-2 text-sm text-[#687287]">
              {readyCount}/{presentPlayers.length} active player{presentPlayers.length === 1 ? "" : "s"} ready.
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {roomState.players.map((player) => (
              <div
                key={player.userId}
                className="rounded-[22px] border border-[#dbe5ff] bg-white px-4 py-3 shadow-[0_8px_20px_rgba(20,86,244,0.05)]"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-[#1f2430]">{player.name}</div>
                    <div className="mt-1 text-xs text-[#7c869a]">
                      {player.selectedCharacter
                        ? getCharacterLabel(player.selectedCharacter)
                        : "No character selected"}
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5d73b3]">
                    {!player.isPresent
                      ? "Away"
                      : player.isReadyAtPedestal
                        ? "Ready"
                        : "Moving"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!pokerOverlayOpen ? (
        <div className="absolute left-1/2 top-1/2 z-0 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#dbe5ff] bg-[radial-gradient(circle_at_top,#ffffff_0%,#f5f8ff_100%)] shadow-[0_20px_48px_rgba(20,86,244,0.12)]">
          <button
            type="button"
            aria-label={hasReadied ? "Ready button pressed" : "Ready button"}
            disabled={!isNearPedestal || hasReadied}
            onClick={onReady}
            className={`absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 transition-colors ${
              hasReadied ? "bg-[#39D353] border-[#1d3b14]" : "bg-[#F04C4C] border-[#7a1e1e]"
            } ${isNearPedestal && !hasReadied ? "cursor-pointer shadow-[0_0_0_8px_rgba(255,255,255,0.28)]" : "cursor-default"} disabled:cursor-default`}
          />
        </div>
      ) : null}

      {judge.visible || judgeCarrierPosition ? (
        <div
          className="absolute z-10 flex flex-col items-center"
          style={{
            left: judgeRenderLeft,
            top: judgeRenderTop,
            transform: judgeCarrierPosition
              ? "translate(-50%, calc(-100% - 28px)) rotate(180deg)"
              : "translate(-50%, -50%)",
            transition:
              "left 920ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms ease-out, opacity 220ms ease-out",
            opacity: npcEventExitActive && !judgeCarrierPosition ? 0 : 1,
          }}
        >
          <div
            style={
              isJudgeWalking
                ? {
                    animation: "play-room-rock 0.46s ease-in-out infinite",
                    transformOrigin: "50% 88%",
                  }
                : undefined
            }
          >
            <button
              type="button"
              onClick={handleJudgeClick}
              disabled={!canSubmitToJudge}
              className={`group transition ${
                canSubmitToJudge ? "hover:-translate-y-0.5" : "opacity-92"
              }`}
            >
              <JudgeAvatar
                size={124}
                className={canSubmitToJudge ? "drop-shadow-[0_10px_18px_rgba(20,86,244,0.14)]" : "opacity-90"}
              />
            </button>
          </div>
          {!judgeCarrierPosition ? (
            <div className="mt-2 inline-flex w-fit self-center rounded-full border border-[#dbe5ff] bg-white/94 px-3 py-1 text-[11px] font-semibold text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
              Judge
            </div>
          ) : null}
        </div>
      ) : null}

      {arcade.visible || arcadeCarrierPosition ? (
        <div
          className="absolute z-10 flex flex-col items-center"
          style={{
            left: arcadeRenderLeft,
            top: arcadeRenderTop,
            transform: arcadeCarrierPosition
              ? "translate(-50%, calc(-100% - 26px)) rotate(180deg)"
              : "translate(-50%, -50%)",
            transition:
              "left 920ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms ease-out, opacity 220ms ease-out",
            opacity: npcEventExitActive && !arcadeCarrierPosition ? 0 : 1,
          }}
        >
          <div
            style={
              isJudgeWalking
                ? {
                    animation: "play-room-rock 0.46s ease-in-out infinite",
                    transformOrigin: "50% 88%",
                  }
                : undefined
            }
          >
            <button
              type="button"
              onClick={handleArcadeClick}
              disabled={!canUseArcade || isPokerVoting}
              className={`group transition ${canUseArcade ? "hover:-translate-y-0.5" : "opacity-92"} disabled:opacity-70`}
            >
              <ArcadeMachineAvatar
                size={126}
                className={canUseArcade ? "drop-shadow-[0_10px_18px_rgba(20,86,244,0.14)]" : "opacity-92"}
              />
            </button>
          </div>
          {!arcadeCarrierPosition ? (
            <>
              <div className="mt-2 rounded-full border border-[#dbe5ff] bg-white/94 px-3 py-1 text-[11px] font-semibold text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
                Poker Arcade
              </div>
              {roomState.pokerArcade.status === "idle" ? (
                <div className="mt-2 rounded-full border border-[#dbe5ff] bg-white/88 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
                  {hasActivePokerTable
                    ? canUseArcade
                      ? "Click to join poker"
                      : "Walk up to join poker"
                    : canUseArcade
                      ? "Click to start poker"
                      : "Walk up to play poker"}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {!pokerOverlayOpen
        ? presentPlayers.map((player) => {
            const displayPosition = renderPositions[player.userId] ?? player.position;
            const left =
              ((displayPosition.x + roomState.room.width / 2) / roomState.room.width) * 100;
            const top =
              ((displayPosition.y + roomState.room.height / 2) / roomState.room.height) * 100;
            const activeChatMessage = chatMessages.find(
              (message) => message.userId === player.userId
            );
            return (
              <div
                key={player.userId}
                className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
                style={{ left: `${left}%`, top: `${top}%` }}
              >
                <div className="relative">
                  {activeChatMessage ? (
                    <div className="absolute left-[calc(100%+12px)] top-1 z-20 max-w-[220px]">
                      <div className="relative rounded-[22px] border border-[#cfe0ff] bg-white/98 px-3 py-2 text-xs font-medium leading-5 text-[#1f2430] shadow-[0_14px_30px_rgba(20,86,244,0.12)]">
                        {activeChatMessage.text}
                        <div className="absolute left-[-8px] top-4 h-4 w-4 rotate-45 border-b border-l border-[#cfe0ff] bg-white/98" />
                      </div>
                    </div>
                  ) : null}
                  {player.selectedCharacter ? (
                    <div
                      style={
                        movingPlayerIds[player.userId]
                          ? {
                              animation: "play-room-rock 0.46s ease-in-out infinite",
                              transformOrigin: "50% 88%",
                            }
                          : undefined
                      }
                    >
                      <CharacterAvatar
                        characterId={player.selectedCharacter}
                        size={96}
                        className={player.userId === currentUserId ? "scale-105" : ""}
                      />
                    </div>
                  ) : null}
                </div>
                <div className="mt-1 rounded-full border border-[#dbe5ff] bg-white/94 px-3 py-1 text-[11px] font-semibold text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
                  {player.name}
                  {player.isReadyAtPedestal ? " • Ready" : ""}
                </div>
              </div>
            );
          })
        : null}

      <button
        type="button"
        onClick={onLeave}
        className="absolute bottom-5 left-5 z-20 flex items-center gap-3 rounded-full border border-[#dbe5ff] bg-white/96 px-3 py-3 text-sm font-semibold text-[#1f2430] shadow-[0_18px_36px_rgba(20,86,244,0.12)] backdrop-blur transition hover:border-[#bfd0ff] hover:bg-[#f9fbff]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#ffd7d7] bg-[#fff1f1] text-xl leading-none text-[#d14c4c]">
          ×
        </span>
        <span className="pr-2">Leave Room</span>
      </button>

      <div className="absolute bottom-5 right-5 z-20 flex flex-col items-end gap-2">
        {voiceError && !isVoiceSettingsOpen ? (
          <div className="max-w-[280px] rounded-[20px] border border-[#ffd4d4] bg-[#fff3f3]/96 px-4 py-3 text-right text-xs font-medium leading-5 text-[#b45151] shadow-[0_12px_28px_rgba(223,76,76,0.08)] backdrop-blur">
            {voiceError}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {voiceMode === "voice_stream" ? (
            <button
              type="button"
              onClick={() => setIsMicMuted((current) => !current)}
              aria-label={isMicMuted ? "Unmute microphone" : "Mute microphone"}
              className={`flex h-12 w-12 items-center justify-center rounded-full border shadow-[0_18px_36px_rgba(20,86,244,0.12)] backdrop-blur transition hover:-translate-y-0.5 ${
                isMicMuted
                  ? "border-[#ffd4d4] bg-[#fff3f3]/96 text-[#b45151] hover:bg-[#ffeded]"
                  : isMicLive
                    ? "border-[#bfe8c6] bg-[#effdf2]/96 text-[#24673a] hover:bg-[#e8f9ec]"
                    : "border-[#dbe5ff] bg-white/96 text-[#5d73b3] hover:bg-[#f8fbff]"
              }`}
            >
              {isMicMuted ? (
                <MicOffIcon className="h-5 w-5" />
              ) : (
                <MicIcon className="h-5 w-5" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setIsVoiceSettingsOpen(true)}
            aria-label="Open voice settings"
            className="flex h-12 w-12 items-center justify-center rounded-full border border-[#dbe5ff] bg-white/96 text-[#5d73b3] shadow-[0_18px_36px_rgba(20,86,244,0.12)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[#c6d6ff] hover:bg-[#f8fbff]"
          >
            <GearIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {isChatting && !pokerOverlayOpen ? (
        <div className="absolute bottom-5 left-1/2 z-20 w-[min(92vw,480px)] -translate-x-1/2">
          <div className="rounded-full border border-[#bfd0ff] bg-white/96 px-3 py-3 shadow-[0_18px_38px_rgba(20,86,244,0.14)] backdrop-blur">
            <input
              ref={chatInputRef}
              type="text"
              value={chatDraft}
              onChange={(event) => setChatDraft(event.target.value.slice(0, 200))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const nextMessage = chatDraft.trim();
                  if (nextMessage) {
                    onSendChatMessage(nextMessage);
                  }
                  setChatDraft("");
                  setIsChatting(false);
                  return;
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setChatDraft("");
                  setIsChatting(false);
                }
              }}
              placeholder="Say something to the room..."
              maxLength={200}
              className="w-full bg-transparent px-3 text-sm font-medium text-[#1f2430] outline-none placeholder:text-[#92a0bb]"
            />
          </div>
        </div>
      ) : null}

    </section>
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
    chatMessages,
    error,
    busyAction,
    isConnected,
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
    clearError,
  } = usePlayRoom({
    inviteRoomCode,
    isAuthenticated,
    token,
  });
  const {
    pokerState,
    pokerError,
    pokerBusyAction,
    turnTimeLeft,
    turnProgress,
    act,
    leaveTable,
    rebuy,
    showCards,
  } = usePlayRoomPoker({
    isAuthenticated,
    token,
  });
  const roomListEnabled = Boolean(isAuthenticated && !roomState && !inviteRoomCode);
  const {
    rooms,
    isLoading: isRoomListLoading,
    error: roomListError,
    refresh: refreshRoomList,
    clearError: clearRoomListError,
  } = usePlayRoomList({
    isAuthenticated,
    token,
    enabled: roomListEnabled,
  });
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [copiedRoomCode, setCopiedRoomCode] = useState<string | null>(null);
  const [headerHeight, setHeaderHeight] = useState(74);
  const copyTimerRef = useRef<number | null>(null);
  const previousActiveRoomCodeRef = useRef<string | null>(roomState?.roomCode ?? null);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateHeaderHeight = () => {
      const header = document.querySelector<HTMLElement>("[data-site-header='true']");
      setHeaderHeight(Math.round(header?.getBoundingClientRect().height ?? 74));
    };

    updateHeaderHeight();
    window.addEventListener("resize", updateHeaderHeight);

    return () => {
      window.removeEventListener("resize", updateHeaderHeight);
    };
  }, []);

  useEffect(() => {
    const previousRoomCode = previousActiveRoomCodeRef.current;
    const currentRoomCode = roomState?.roomCode ?? null;

    if (previousRoomCode && !currentRoomCode && roomListEnabled) {
      void refreshRoomList();
    }

    previousActiveRoomCodeRef.current = currentRoomCode;
  }, [refreshRoomList, roomListEnabled, roomState?.roomCode]);

  const handleCreateRoom = () => {
    clearRoomListError();
    setInviteRoomCodeOverride(null);
    setRoomNameDraft("");
    createRoom(roomNameDraft);
  };

  const handleJoinInviteRoom = () => {
    if (!inviteRoomCode) {
      return;
    }
    clearRoomListError();
    joinRoom(inviteRoomCode);
  };

  const handleOpenRoom = (roomCode: string) => {
    clearRoomListError();
    joinRoom(roomCode);
  };

  const handleCopyInvite = async (roomCode: string) => {
    if (typeof window === "undefined" || !roomCode || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(`${window.location.origin}/play?room=${roomCode}`);
    setCopiedRoomCode(roomCode);
    if (copyTimerRef.current) {
      window.clearTimeout(copyTimerRef.current);
    }
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedRoomCode(null);
    }, 1800);
  };

  const handleLeaveRoom = () => {
    setInviteRoomCodeOverride(null);
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/play");
    }
    leaveRoom();
  };

  const combinedError = error ?? roomListError;

  let content: ReactNode = inviteRoomCode ? (
    <JoinInviteCard
      inviteRoomCode={inviteRoomCode}
      isAuthenticated={isAuthenticated}
      isConnected={isConnected}
      isBusy={busyAction === "create" || busyAction === "join"}
      onJoin={handleJoinInviteRoom}
    />
  ) : (
    <RoomHistoryPanel
      rooms={rooms}
      isLoading={isRoomListLoading}
      isAuthenticated={isAuthenticated}
      isConnected={isConnected}
      isBusy={busyAction === "create" || busyAction === "join"}
      roomName={roomNameDraft}
      copiedRoomCode={copiedRoomCode}
      onRoomNameChange={setRoomNameDraft}
      onCreate={handleCreateRoom}
      onCopyRoomLink={handleCopyInvite}
      onOpenRoom={handleOpenRoom}
    />
  );

  if (roomState?.phase === "lobby") {
    content = (
      <RoomShell
        title={roomState.roomName}
        subtitle="Lobby. Share the room code, let returning members re-enter, and once two active players are in the room everyone moves forward automatically."
        roomCode={roomState.roomCode}
        onLeave={handleLeaveRoom}
      >
        <LobbyPanel
          roomState={roomState}
          copied={copiedRoomCode === roomState.roomCode}
          onCopyInvite={() => handleCopyInvite(roomState.roomCode)}
        />
      </RoomShell>
    );
  }

  if (roomState?.phase === "character_select") {
    content = (
      <RoomShell
        title={roomState.roomName}
        subtitle="Character select. Active players each lock one simple white character, then the shared room opens."
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
      <>
        <SharedRoomPanel
          roomState={roomState}
          chatMessages={chatMessages}
          currentUserId={user?.id}
          isInviteCopied={copiedRoomCode === roomState.roomCode}
          onMove={movePlayer}
          onReady={readyUp}
          onSubmitTask={submitTask}
          onSendChatMessage={sendChatMessage}
          onInteractNpc={interactNpc}
          onProposePokerArcade={proposePokerArcade}
          onRespondPokerArcade={respondPokerArcade}
          onCopyInvite={() => handleCopyInvite(roomState.roomCode)}
          isSubmittingTask={busyAction === "submit"}
          isPokerVoting={busyAction === "poker_propose" || busyAction === "poker_vote"}
          pokerOverlayOpen={Boolean(pokerState)}
          onLeave={handleLeaveRoom}
        />
        {pokerState ? (
          <PlayPokerOverlay
            roomState={roomState}
            pokerState={pokerState}
            currentUserId={user?.id}
            pokerError={pokerError}
            pokerBusyAction={pokerBusyAction}
            turnTimeLeft={turnTimeLeft}
            turnProgress={turnProgress}
            onAct={act}
            onLeave={leaveTable}
            onRebuy={rebuy}
            onShowCards={showCards}
          />
        ) : null}
      </>
    );
  }

  const isSharedRoomPhase = Boolean(
    roomState && (roomState.phase === "shared_room" || roomState.phase === "task_reveal")
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousHtmlHeight = html.style.height;
    const previousBodyHeight = body.style.height;

    if (isSharedRoomPhase) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      html.style.overflow = "hidden";
      body.style.overflow = "hidden";
      html.style.height = "100%";
      body.style.height = "100%";
    }

    return () => {
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      html.style.height = previousHtmlHeight;
      body.style.height = previousBodyHeight;
    };
  }, [isSharedRoomPhase]);

  return (
    <div
      className={`relative ${isSharedRoomPhase ? "overflow-hidden" : "min-h-screen"}`}
      style={isSharedRoomPhase ? { height: `calc(100dvh - ${headerHeight}px)` } : undefined}
    >
      <div
        className={`pointer-events-none fixed inset-0 z-0 ${
          isSharedRoomPhase
            ? "bg-white"
            : "bg-[radial-gradient(circle_at_top,#f8fbff_0%,#ffffff_55%,#fdfdff_100%)]"
        }`}
      />
      <div
        className={`relative z-10 ${
          isSharedRoomPhase
            ? "h-full w-full overflow-hidden"
            : "mx-auto w-full max-w-7xl px-0 pb-10 pt-4 sm:pt-6"
        }`}
      >
        {combinedError ? (
          <div className={isSharedRoomPhase ? "absolute left-1/2 top-4 z-30 w-[min(92vw,720px)] -translate-x-1/2" : ""}>
            <StatusBanner
              error={combinedError}
              onDismiss={() => {
                clearError();
                clearRoomListError();
              }}
            />
          </div>
        ) : null}
        {content}
      </div>
    </div>
  );
};
