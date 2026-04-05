"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth";
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
import { usePlayRoomPoker } from "./usePlayRoomPoker";
import { usePlayRoomVoice } from "./usePlayRoomVoice";

const normalizeRoomCode = (value: string | null) =>
  value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5) ?? null;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const formatHandle = (handle: string) => (handle.startsWith("@") ? handle : `@${handle}`);

const getPlayerById = (roomState: PlayRoomState, userId: string | null | undefined) =>
  roomState.players.find((player) => player.userId === userId) ?? null;

const createPositionMap = (players: PlayRoomState["players"]) =>
  Object.fromEntries(players.map((player) => [player.userId, { ...player.position }]));

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const getCurrentWeekdayLabel = () =>
  new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date());

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
    <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-5xl items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[32px] border border-[#dbe5ff] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(245,248,255,0.98)_100%)] p-8 shadow-[0_26px_70px_rgba(20,86,244,0.12)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-[#5d73b3]">
          Quadblitz Play
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.04em] text-[#1f2430]">
          {heading}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#687287]">{description}</p>
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
  const playersNeeded = Math.max(0, roomState.minPlayersToStart - roomState.players.length);
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
          invite link so at least two players can enter.
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
                    ? "border-[#1456f4] bg-[#1456f4] text-white shadow-[0_18px_36px_rgba(20,86,244,0.24)]"
                    : "border-[#dbe5ff] bg-white text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.06)] hover:-translate-y-0.5 hover:border-[#b8cbff] hover:bg-[#f9fbff]"
                } ${isTaken || isLocked ? "cursor-not-allowed opacity-70" : ""}`}
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
                    : isTaken
                      ? `Taken by ${lockedBy?.name ?? "another player"}`
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
                  {player.selectedCharacter ? "Ready" : "Choosing"}
                </div>
              </div>
              <div className="mt-2 text-xs text-[#7c869a]">
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

  const requester =
    roomState.players.find((player) => player.userId === vote.requestedByUserId) ?? null;
  const hasAccepted = currentUserId ? vote.acceptedUserIds.includes(currentUserId) : false;
  const waitingOn = Math.max(0, roomState.players.length - vote.acceptedUserIds.length);
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
  onMove,
  onReady,
  onSubmitTask,
  onSendChatMessage,
  onProposePokerArcade,
  onRespondPokerArcade,
  isSubmittingTask,
  isPokerVoting,
  pokerOverlayOpen,
  onLeave,
}: {
  roomState: PlayRoomState;
  chatMessages: PlayRoomChatMessage[];
  currentUserId: string | null | undefined;
  onMove: (positionX: number, positionY: number) => void;
  onReady: () => void;
  onSubmitTask: (submission: string) => void;
  onSendChatMessage: (text: string) => void;
  onProposePokerArcade: () => void;
  onRespondPokerArcade: (accept: boolean) => void;
  isSubmittingTask: boolean;
  isPokerVoting: boolean;
  pokerOverlayOpen: boolean;
  onLeave: () => void;
}) => {
  const me = getPlayerById(roomState, currentUserId);
  const [showRoomState, setShowRoomState] = useState(false);
  const [isJudgeModalOpen, setIsJudgeModalOpen] = useState(false);
  const [submissionDraft, setSubmissionDraft] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [isPushToTalkActive, setIsPushToTalkActive] = useState(false);
  const [weekdayLabel] = useState(() => getCurrentWeekdayLabel());
  const [renderPositions, setRenderPositions] = useState<Record<string, PlayVector2>>(() =>
    createPositionMap(roomState.players)
  );
  const [movingPlayerIds, setMovingPlayerIds] = useState<Record<string, boolean>>({});
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const keyStateRef = useRef({ up: false, down: false, left: false, right: false });
  const roomRef = useRef(roomState);
  const serverPositionsRef = useRef<Record<string, PlayVector2>>(createPositionMap(roomState.players));
  const visualPositionsRef = useRef<Record<string, PlayVector2>>(createPositionMap(roomState.players));
  const { voiceError, voiceStatus, isPushToTalkLive } = usePlayRoomVoice({
    roomState,
    currentUserId,
    pushToTalkActive: isPushToTalkActive,
  });
  const wallHeight = roomState.room.wall?.height ?? roomState.room.height * 0.22;
  const wallBoundaryY =
    roomState.room.wall?.boundaryY ?? -roomState.room.height / 2 + wallHeight;
  const playerMinY = roomState.room.wall?.playerMinY ?? wallBoundaryY + 48;
  const wallHeightPercent = (wallHeight / roomState.room.height) * 100;
  const wallBoundaryPercent =
    ((wallBoundaryY + roomState.room.height / 2) / roomState.room.height) * 100;
  const boardTopPercent = Math.max(5.5, wallHeightPercent * 0.4);

  useEffect(() => {
    roomRef.current = roomState;
    serverPositionsRef.current = createPositionMap(roomState.players);
    const nextVisual = { ...visualPositionsRef.current };
    const activeIds = new Set(roomState.players.map((player) => player.userId));
    Object.keys(nextVisual).forEach((userId) => {
      if (!activeIds.has(userId)) {
        delete nextVisual[userId];
      }
    });
    roomState.players.forEach((player) => {
      if (!nextVisual[player.userId]) {
        nextVisual[player.userId] = { ...player.position };
      }
    });
    visualPositionsRef.current = nextVisual;
  }, [roomState]);

  useEffect(() => {
    if (!isChatting) {
      return;
    }

    chatInputRef.current?.focus();
  }, [isChatting]);

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
        if (!isChatting && !isJudgeModalOpen && !pokerOverlayOpen) {
          setIsPushToTalkActive(true);
        }
      }
      if (pokerOverlayOpen) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (isChatting) {
          const nextMessage = chatDraft.trim();
          if (nextMessage) {
            onSendChatMessage(nextMessage);
          }
          setChatDraft("");
          setIsChatting(false);
          return;
        }
        keyStateRef.current = { up: false, down: false, left: false, right: false };
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
        setIsPushToTalkActive(false);
      }
      if (isChatting) {
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
  }, [chatDraft, isChatting, isJudgeModalOpen, me, onReady, onSendChatMessage, pokerOverlayOpen]);

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
      const activeIds = new Set(roomRef.current.players.map((player) => player.userId));
      Object.keys(nextPositions).forEach((userId) => {
        if (!activeIds.has(userId)) {
          delete nextPositions[userId];
        }
      });

      roomRef.current.players.forEach((player) => {
        const currentPosition = nextPositions[player.userId] ?? player.position;
        const serverPosition = serverPositions[player.userId] ?? player.position;
        if (player.userId === me?.userId) {
          if (isChatting || pokerOverlayOpen) {
            nextPositions[player.userId] = {
              x: lerp(currentPosition.x, serverPosition.x, smoothing * 0.72),
              y: lerp(currentPosition.y, serverPosition.y, smoothing * 0.72),
            };
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
            Math.hypot(serverPosition.x - currentPosition.x, serverPosition.y - currentPosition.y) >
            0.9;
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
  }, [isChatting, me, onMove, playerMinY, pokerOverlayOpen]);

  const pedestal = roomState.room.pedestal;
  const judge = roomState.room.judge;
  const arcade = roomState.room.arcade;
  const readyCount = roomState.players.filter((player) => player.isReadyAtPedestal).length;
  const myVisualPosition =
    me ? renderPositions[me.userId] ?? me.position : null;
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
  const judgeLeft = ((judge.x + roomState.room.width / 2) / roomState.room.width) * 100;
  const judgeTop = ((judge.y + roomState.room.height / 2) / roomState.room.height) * 100;
  const arcadeLeft = ((arcade.x + roomState.room.width / 2) / roomState.room.width) * 100;
  const arcadeTop = ((arcade.y + roomState.room.height / 2) / roomState.room.height) * 100;
  const canSubmitToJudge =
    roomState.phase === "task_reveal" &&
    Boolean(roomState.selectedTask) &&
    Boolean(isNearJudge);
  const canUseArcade =
    !pokerOverlayOpen &&
    roomState.pokerArcade.status === "idle" &&
    Boolean(isNearArcade);
  const isJudgeModalVisible =
    isJudgeModalOpen &&
    roomState.phase === "task_reveal" &&
    Boolean(roomState.selectedTask);

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
        task={roomState.phase === "task_reveal" ? roomState.selectedTask : null}
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

      <PokerArcadeVoteCard
        roomState={roomState}
        currentUserId={currentUserId}
        isBusy={isPokerVoting}
        onAccept={() => onRespondPokerArcade(true)}
        onDecline={() => onRespondPokerArcade(false)}
      />

      <div className="absolute left-5 top-5 z-20 rounded-full border border-[#dbe5ff] bg-white/94 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#5d73b3] shadow-[0_12px_30px_rgba(20,86,244,0.1)] backdrop-blur">
        Room {roomState.roomCode}
      </div>

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
              {readyCount}/{roomState.players.length} player{roomState.players.length === 1 ? "" : "s"} ready.
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
                      {getCharacterLabel(player.selectedCharacter)}
                    </div>
                  </div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#5d73b3]">
                    {player.isReadyAtPedestal ? "Ready" : "Moving"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="absolute left-5 top-20 z-20 flex flex-col items-start gap-2">
        <div
          className={`rounded-full border px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] shadow-[0_12px_28px_rgba(20,86,244,0.08)] backdrop-blur ${
            isPushToTalkLive
              ? "border-[#bfe8c6] bg-[#effdf2] text-[#24673a]"
              : "border-[#dbe5ff] bg-white/90 text-[#5d73b3]"
          }`}
        >
          {isPushToTalkLive
            ? "Mic Live"
            : voiceStatus === "requesting"
              ? "Connecting Mic"
              : "Hold T To Talk"}
        </div>
        {voiceError ? (
          <div className="max-w-[280px] rounded-[20px] border border-[#ffd4d4] bg-[#fff3f3] px-4 py-3 text-center text-xs font-medium leading-5 text-[#b45151] shadow-[0_12px_28px_rgba(223,76,76,0.08)]">
            {voiceError}
          </div>
        ) : null}
      </div>

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

      <div
        className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ left: `${judgeLeft}%`, top: `${judgeTop}%` }}
      >
        <button
          type="button"
          onClick={handleJudgeClick}
          disabled={!canSubmitToJudge}
          className={`group transition ${
            canSubmitToJudge
              ? "hover:-translate-y-0.5"
              : "opacity-92"
          }`}
        >
          <JudgeAvatar
            size={124}
            className={canSubmitToJudge ? "drop-shadow-[0_10px_18px_rgba(20,86,244,0.14)]" : "opacity-90"}
          />
        </button>
        <div className="mt-2 rounded-full border border-[#dbe5ff] bg-white/94 px-3 py-1 text-[11px] font-semibold text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
          Judge
        </div>
        {roomState.phase === "task_reveal" ? (
          <div className="mt-2 rounded-full border border-[#dbe5ff] bg-white/88 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
            {canSubmitToJudge ? "Click judge to submit" : "Walk up to submit"}
          </div>
        ) : null}
      </div>

      <div
        className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
        style={{ left: `${arcadeLeft}%`, top: `${arcadeTop}%` }}
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
        <div className="mt-2 rounded-full border border-[#dbe5ff] bg-white/94 px-3 py-1 text-[11px] font-semibold text-[#1f2430] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
          Poker Arcade
        </div>
        {roomState.pokerArcade.status === "idle" ? (
          <div className="mt-2 rounded-full border border-[#dbe5ff] bg-white/88 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#5d73b3] shadow-[0_10px_24px_rgba(20,86,244,0.08)]">
            {canUseArcade ? "Click to start poker" : "Walk up to play poker"}
          </div>
        ) : null}
      </div>

      {roomState.players.map((player) => {
        const displayPosition = renderPositions[player.userId] ?? player.position;
        const left = ((displayPosition.x + roomState.room.width / 2) / roomState.room.width) * 100;
        const top = ((displayPosition.y + roomState.room.height / 2) / roomState.room.height) * 100;
        const activeChatMessage = chatMessages.find((message) => message.userId === player.userId);
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
      })}

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
  const [copied, setCopied] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(74);
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
      <>
        <SharedRoomPanel
          roomState={roomState}
          chatMessages={chatMessages}
          currentUserId={user?.id}
          onMove={movePlayer}
          onReady={readyUp}
          onSubmitTask={submitTask}
          onSendChatMessage={sendChatMessage}
          onProposePokerArcade={proposePokerArcade}
          onRespondPokerArcade={respondPokerArcade}
          isSubmittingTask={busyAction === "submit"}
          isPokerVoting={busyAction === "poker_propose" || busyAction === "poker_vote"}
          pokerOverlayOpen={Boolean(pokerState)}
          onLeave={handleLeaveRoom}
        />
        {pokerState ? (
          <PlayPokerOverlay
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
      <div className="pointer-events-none fixed inset-0 z-0 bg-white" />
      <div
        className={`relative z-10 ${
          isSharedRoomPhase
            ? "h-full w-full overflow-hidden"
            : "mx-auto w-full max-w-7xl px-0 pb-10 pt-24 sm:pt-28"
        }`}
      >
        {error ? (
          <div className={isSharedRoomPhase ? "absolute left-1/2 top-4 z-30 w-[min(92vw,720px)] -translate-x-1/2" : ""}>
            <StatusBanner error={error} onDismiss={clearError} />
          </div>
        ) : null}
        {content}
      </div>
    </div>
  );
};
