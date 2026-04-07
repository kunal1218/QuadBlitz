"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  JSX,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  SVGProps,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Outfit } from "next/font/google";
import { Avatar } from "@/components/Avatar";
import { GroupsNavIcon } from "@/components/GroupsNavIcon";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import { deriveCollegeFromDomain, deriveCollegeFromEmail } from "@/lib/college";
import { formatHeaderPoints } from "@/lib/points";
import { ProfileAnswersProvider, useProfileAnswers } from "./ProfileAnswersContext";
import { ProfileQuestionnaireModal } from "./ProfileQuestionnaireModal";
import { profile as fallbackProfile } from "./mock";

type HeaderIconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

type FriendUser = {
  id: string;
  name: string;
  handle: string;
};

type FriendRequest = {
  id: string;
  createdAt: string;
  requester: FriendUser;
  recipient: FriendUser;
};

type FriendSummary = {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: FriendUser[];
};

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

type MovementMode = "relative" | "absolute";

type BlockTemplate = {
  id: string;
  columns: {
    default: number;
    compact: number;
  };
  layout: {
    default: { x: number; y: number };
    compact: { x: number; y: number };
  };
};

type BlockPosition = {
  x: number;
  y: number;
};

type LayoutMode = "default" | "compact";

type BlockSizes = Record<string, number>;

type PromptCardProps = {
  icon: JSX.Element;
  title: string;
  answer?: string;
  chips?: string[];
  actionLabel: string;
  onAction: () => void;
};

type PromptCardData = Omit<PromptCardProps, "onAction">;

type OverviewCardProps = {
  displayName: string;
  displayHandle: string;
  avatarUrl?: string | null;
  collegeAcronym: string;
  displayBio: string;
  isEditing: boolean;
  movementMode: MovementMode;
  onEditToggle: () => void;
  onMovementModeChange: (mode: MovementMode) => void;
  onSaveLayout: () => void;
  onCancelLayout: () => void;
  onShare: () => void;
  onLogout: () => void;
  shareLabel: string;
  logoutLabel: string;
  layoutError?: string | null;
};

type EcosystemCardProps = {
  stats: Array<{
    label: string;
    value: number;
    icon: JSX.Element;
  }>;
};

type BadgesCardProps = {
  badges: string[];
};

type UniversityIdCardProps = {
  displayName: string;
  collegeLabel: string;
  displayHandle: string;
  memberId: string;
  leaderboardRank: number | null;
};

type ConfirmLogoutModalProps = {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const GRID_COLUMNS = 12;
const GRID_GAP = 20;
const GRID_SNAP = 1;
const layoutStorageKey = (userId: string) => `lockedin_profile_layout:${userId}`;
const LOCKED_BLOCK_IDS = ["profile-header"] as const;

const shellCardClasses =
  "rounded-[30px] border border-[#e7edf6] bg-white/94 shadow-[0_24px_60px_rgba(24,35,61,0.08)]";

const toggleBaseClasses =
  "rounded-full px-3 py-1 text-xs font-semibold transition";

const isInteractiveElement = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest("button, a, input, textarea, select, [data-drag-ignore]")
  );
};

const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const BLOCK_TEMPLATES: BlockTemplate[] = [
  {
    id: "profile-header",
    columns: { default: 12, compact: 12 },
    layout: {
      default: { x: 0, y: 0 },
      compact: { x: 0, y: 0 },
    },
  },
  {
    id: "ecosystem",
    columns: { default: 3, compact: 12 },
    layout: {
      default: { x: 0, y: 3 },
      compact: { x: 0, y: 3 },
    },
  },
  {
    id: "university-id",
    columns: { default: 9, compact: 12 },
    layout: {
      default: { x: 3, y: 3 },
      compact: { x: 0, y: 7 },
    },
  },
  {
    id: "badges",
    columns: { default: 3, compact: 12 },
    layout: {
      default: { x: 0, y: 7 },
      compact: { x: 0, y: 14 },
    },
  },
  {
    id: "prompts-heading",
    columns: { default: 12, compact: 12 },
    layout: {
      default: { x: 0, y: 10 },
      compact: { x: 0, y: 18 },
    },
  },
  {
    id: "prompt-memory",
    columns: { default: 4, compact: 12 },
    layout: {
      default: { x: 0, y: 11 },
      compact: { x: 0, y: 19 },
    },
  },
  {
    id: "prompt-career",
    columns: { default: 4, compact: 12 },
    layout: {
      default: { x: 4, y: 11 },
      compact: { x: 0, y: 24 },
    },
  },
  {
    id: "prompt-madlib",
    columns: { default: 4, compact: 12 },
    layout: {
      default: { x: 8, y: 11 },
      compact: { x: 0, y: 29 },
    },
  },
];

const buildDefaultPositions = (mode: LayoutMode) => {
  const positions: Record<string, BlockPosition> = {};
  BLOCK_TEMPLATES.forEach((block) => {
    const layout = mode === "compact" ? block.layout.compact : block.layout.default;
    positions[block.id] = { x: layout.x, y: layout.y };
  });
  return positions;
};

const normalizeLockedPositions = (
  positions: Record<string, BlockPosition>,
  defaults: Record<string, BlockPosition>
) => {
  const nextPositions = { ...positions };

  LOCKED_BLOCK_IDS.forEach((blockId) => {
    const defaultPosition = defaults[blockId];
    if (!defaultPosition) {
      return;
    }

    nextPositions[blockId] = {
      x: defaultPosition.x,
      y: defaultPosition.y,
    };
  });

  return nextPositions;
};

const loadLeaderboardRank = async (token: string | null, userId: string) => {
  const attempts: Array<{ path: string; token?: string }> = token
    ? [
        { path: "/leaderboard?limit=250", token },
        { path: "/leaderboard/public?limit=250" },
      ]
    : [
        { path: "/leaderboard/public?limit=250" },
        { path: "/leaderboard?limit=250" },
      ];

  for (const attempt of attempts) {
    try {
      const payload = await apiGet<{ entries: LeaderboardEntry[] }>(
        attempt.path,
        attempt.token
      );
      const entries = payload.entries ?? [];
      const index = entries.findIndex((entry) => entry.id === userId);
      if (index >= 0) {
        return index + 1;
      }
    } catch {
      // Try the next path.
    }
  }

  return null;
};

const toCollegeAcronym = (value: string) => {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "CAMP";
  }

  const compact = parts.join("");
  if (compact.length <= 4) {
    return compact.toUpperCase();
  }

  return parts
    .slice(0, 4)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

const buildMemberId = (seed: string) => {
  const checksum = Array.from(seed).reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  const serial = ((checksum * 97) % 9000) + 1000;
  return `#${new Date().getFullYear()}-${serial}`;
};

const HomeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.9 7.12 8 2.86l5.1 4.26v5.14a.8.8 0 0 1-.8.8H9.44V9.4H6.56v3.66H3.7a.8.8 0 0 1-.8-.8V7.12Z"
      fill="currentColor"
    />
  </svg>
);

const ChallengeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M8.77 1.92 4.52 8.22h2.9l-1.02 5.87 5.05-6.83H8.58l.19-5.34Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

const ChatNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.23 3.22h9.54a.8.8 0 0 1 .8.8v6.03a.8.8 0 0 1-.8.8H7.41L4.68 12.9v-2.05H3.23a.8.8 0 0 1-.8-.8V4.02a.8.8 0 0 1 .8-.8Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

const MapsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.5 4.35 6.42 2.8l3.17 1.06 3.91-1.55v9.34l-3.91 1.55-3.17-1.06-3.92 1.55V4.35Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path d="M6.42 2.8v9.34M9.58 3.86v9.34" stroke="currentColor" strokeWidth="1.65" />
  </svg>
);

const MarketNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.3 6.1h9.4v5.4a.8.8 0 0 1-.8.8H4.1a.8.8 0 0 1-.8-.8V6.1Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path
      d="M5.04 6.1V4.87a2.96 2.96 0 0 1 5.92 0V6.1M3.25 6.1l1.33-2.36M12.75 6.1l-1.33-2.36"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BellNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" {...props}>
    <path
      d="M9 2.8a3.1 3.1 0 0 0-3.1 3.1v1.35c0 .72-.22 1.42-.64 2l-1.13 1.58h9.76l-1.13-1.58a3.48 3.48 0 0 1-.64-2V5.9A3.1 3.1 0 0 0 9 2.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.2 12.4a1.8 1.8 0 0 0 3.6 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const PeopleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="8.2" cy="9.1" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="15.95" cy="8.55" r="1.95" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M4.7 17.6c.52-2.2 2.2-3.5 4.72-3.5 2.56 0 4.25 1.3 4.77 3.5M13.95 13.95c1.56.17 2.66.86 3.33 2.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const SparkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="m12 3 1.62 4.38L18 9l-4.38 1.62L12 15l-1.62-4.38L6 9l4.38-1.62L12 3Z"
      fill="currentColor"
    />
    <path d="m18.4 15.2.72 1.95 1.94.71-1.94.72-.72 1.94-.72-1.94-1.94-.72 1.94-.71.72-1.95Z" fill="currentColor" />
    <path d="m5.5 15.4.52 1.4 1.4.52-1.4.52-.52 1.4-.52-1.4-1.4-.52 1.4-.52.52-1.4Z" fill="currentColor" />
  </svg>
);

const ShieldIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 3.8 5.2 6.7v5.25c0 4.1 2.57 7.08 6.8 8.65 4.23-1.57 6.8-4.55 6.8-8.65V6.7L12 3.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="m9.1 12.45 1.9 1.9 3.9-4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MemoryIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 4.25 13.7 8l4.05.4-3.06 2.74.86 4.01L12 13.16l-3.55 1.99.86-4.01L6.25 8.4 10.3 8 12 4.25Z"
      fill="currentColor"
    />
  </svg>
);

const CareerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M8.2 8.1V6.95A2.95 2.95 0 0 1 11.15 4h1.7A2.95 2.95 0 0 1 15.8 6.95V8.1M5 8.1h14v8.75a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8.1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M10.25 12.2h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const PencilIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="m5.45 16.95 8.7-8.7 2.9 2.9-8.7 8.7-3.75.85.85-3.75ZM14.95 7.45l1.2-1.2a2 2 0 1 1 2.82 2.82l-1.2 1.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShareIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="18.25" cy="5.75" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="6" cy="12" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="18.25" cy="18.25" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <path d="m8.05 10.95 7.95-4.1M8.05 13.05l7.95 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const LogoutIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M10.1 5.2H7.7a1.8 1.8 0 0 0-1.8 1.8v10a1.8 1.8 0 0 0 1.8 1.8h2.4"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M13.1 8.1 17 12l-3.9 3.9M10.6 12H17"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const SiteIcon = () => (
  <svg
    viewBox="0 0 40 40"
    aria-hidden="true"
    className="h-[34px] w-[34px] shrink-0"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="20" cy="20" r="19" fill="#1456f4" />
    <circle cx="20" cy="20" r="5.2" fill="white" />
    <circle cx="20" cy="9.4" r="3.15" fill="white" />
    <circle cx="29.2" cy="14.7" r="3.15" fill="white" />
    <circle cx="29.2" cy="25.3" r="3.15" fill="white" />
    <circle cx="20" cy="30.6" r="3.15" fill="white" />
    <circle cx="10.8" cy="25.3" r="3.15" fill="white" />
    <circle cx="10.8" cy="14.7" r="3.15" fill="white" />
    <path
      d="M20 14.6v-2.2M24.6 17.3l2.05-1.18M24.6 22.7l2.05 1.18M20 25.4v2.2M15.4 22.7l-2.05 1.18M15.4 17.3l-2.05-1.18"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.96"
    />
  </svg>
);

const HeaderWordmark = () => (
  <span className="inline-flex items-center gap-[10px]">
    <SiteIcon />
  <span className="text-[21px] font-extrabold tracking-[-0.045em] text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]">
      QuadBlitz
    </span>
  </span>
);

const ConfirmLogoutModal = ({
  isOpen,
  onCancel,
  onConfirm,
}: ConfirmLogoutModalProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center px-4">
      <button
        type="button"
        aria-label="Close logout confirmation"
        className="absolute inset-0 bg-black/30"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-sm rounded-[28px] border border-[#e7ecf5] bg-white p-6 shadow-[0_28px_80px_rgba(18,36,81,0.18)]">
        <p className="text-[22px] font-[700] tracking-[-0.05em] text-[#20242d]">
          Are you sure?
        </p>
        <p className="mt-3 text-sm leading-[1.55] text-[#5f697b]">
          Logging out will end your current session on this device.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-full border border-[#dce3ef] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d]"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-full bg-[#1456f4] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_12px_24px_rgba(20,86,244,0.2)] transition hover:bg-[#0f49e2]"
            onClick={onConfirm}
          >
            Yes, log out
          </button>
        </div>
      </div>
    </div>
  );
};

const SiteGlyph = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className="h-10 w-10">
    <circle cx="20" cy="20" r="19" fill="#1456f4" />
    <circle cx="20" cy="20" r="5.2" fill="white" />
    <circle cx="20" cy="9.4" r="3.15" fill="white" />
    <circle cx="29.2" cy="14.7" r="3.15" fill="white" />
    <circle cx="29.2" cy="25.3" r="3.15" fill="white" />
    <circle cx="20" cy="30.6" r="3.15" fill="white" />
    <circle cx="10.8" cy="25.3" r="3.15" fill="white" />
    <circle cx="10.8" cy="14.7" r="3.15" fill="white" />
    <path
      d="M20 14.6v-2.2M24.6 17.3l2.05-1.18M24.6 22.7l2.05 1.18M20 25.4v2.2M15.4 22.7l-2.05 1.18M15.4 17.3l-2.05-1.18"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.96"
    />
  </svg>
);

const RequestsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M4.2 2.75h7.6a1.05 1.05 0 0 1 1.05 1.05v8.4a1.05 1.05 0 0 1-1.05 1.05H4.2a1.05 1.05 0 0 1-1.05-1.05V3.8A1.05 1.05 0 0 1 4.2 2.75Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
    <path
      d="M5.15 5.25h5.7M5.15 8h5.7M5.15 10.75h3.45"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
    />
  </svg>
);

const headerNavItems: Array<{
  href: string;
  label: string;
  icon: HeaderIconComponent;
}> = [
  { href: "/", label: "HOME", icon: HomeNavIcon },
  { href: "/friends", label: "CHAT", icon: ChatNavIcon },
  { href: "/map", label: "MAPS", icon: MapsNavIcon },
  { href: "/requests", label: "REQUESTS", icon: RequestsNavIcon },
  { href: "/challenges", label: "CHALLENGES", icon: ChallengeNavIcon },
  { href: "/clubs", label: "GROUPS", icon: GroupsNavIcon },
  { href: "/marketplace", label: "MARKET", icon: MarketNavIcon },
];

const PromptCard = ({
  icon,
  title,
  answer,
  chips,
  actionLabel,
  onAction,
}: PromptCardProps) => {
  const hasChips = Boolean(chips && chips.length > 0);

  return (
    <article className={`${shellCardClasses} flex min-h-[280px] flex-col p-5`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf3ff] text-[#1456f4]">
        {icon}
      </div>
      <h3 className="mt-5 max-w-[220px] text-[18px] font-[700] leading-[1.16] tracking-[-0.05em] text-[#20242d]">
        {title}
      </h3>
      <div className="mt-4 flex-1">
        {hasChips ? (
          <div className="flex flex-wrap gap-2">
            {chips?.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-[#fdebf7] px-3 py-1 text-[11px] font-semibold lowercase tracking-[-0.01em] text-[#cc5d9f]"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : answer?.trim() ? (
          <p className="max-w-[260px] text-[13px] leading-[1.7] text-[#5f697b]">
            “{answer.trim()}”
          </p>
        ) : (
          <p className="max-w-[260px] text-[13px] leading-[1.7] text-[#96a0b0]">
            Add an answer so your profile feels more like you.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAction}
        data-drag-ignore
        className="mt-6 inline-flex h-10 items-center justify-center self-start rounded-full border border-[#e4e9f2] bg-white px-5 text-[11px] font-semibold tracking-[-0.01em] text-[#5b6577] transition hover:border-[#d7deea] hover:text-[#20242d]"
      >
        {actionLabel}
      </button>
    </article>
  );
};

const ProfileOverviewCard = ({
  displayName,
  displayHandle,
  avatarUrl,
  collegeAcronym,
  displayBio,
  isEditing,
  movementMode,
  onEditToggle,
  onMovementModeChange,
  onSaveLayout,
  onCancelLayout,
  onShare,
  onLogout,
  shareLabel,
  logoutLabel,
  layoutError,
}: OverviewCardProps) => {
  return (
    <section className={`${shellCardClasses} px-5 py-5 sm:px-6 sm:py-6`}>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <Avatar
              name={displayName}
              avatarUrl={avatarUrl}
              size={86}
              className="border-[3px] border-white text-[32px] text-[#202531] shadow-[0_16px_34px_rgba(24,35,61,0.14)]"
            />
            <span className="absolute bottom-[6px] right-[6px] flex h-4 w-4 items-center justify-center rounded-full border-[3px] border-white bg-[#1456f4]" />
          </div>

          <div className="min-w-0">
            <h1 className="truncate text-[34px] font-[800] leading-[1.06] tracking-[-0.07em] text-[#20242d] sm:text-[40px]">
              {displayName}
            </h1>
            <p className="mt-2 text-[13px] font-medium text-[#7a8394]">
              {displayHandle}{" "}
              <span className="px-1.5 text-[#bcc4d1]">•</span>
              {collegeAcronym}
            </p>
            <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[#616c7e]">
              {displayBio}
            </p>
            {layoutError && (
              <p className="mt-3 text-[12px] font-semibold text-[#d14f4f]">
                {layoutError}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start">
          {isEditing ? (
            <>
              <div
                data-drag-ignore
                className="flex items-center rounded-full border border-[#e4e9f2] bg-white p-1 shadow-[0_10px_24px_rgba(24,35,61,0.06)]"
              >
                <button
                  type="button"
                  data-drag-ignore
                  className={`${toggleBaseClasses} ${
                    movementMode === "relative"
                      ? "bg-[#edf3ff] text-[#1456f4]"
                      : "text-[#667183] hover:text-[#20242d]"
                  }`}
                  onClick={() => onMovementModeChange("relative")}
                >
                  Relative
                </button>
                <button
                  type="button"
                  data-drag-ignore
                  className={`${toggleBaseClasses} ${
                    movementMode === "absolute"
                      ? "bg-[#edf3ff] text-[#1456f4]"
                      : "text-[#667183] hover:text-[#20242d]"
                  }`}
                  onClick={() => onMovementModeChange("absolute")}
                >
                  Absolute
                </button>
              </div>
              <button
                type="button"
                data-drag-ignore
                onClick={onSaveLayout}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#1456f4] px-5 text-[12px] font-semibold text-white shadow-[0_14px_28px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
              >
                Save Layout
              </button>
              <button
                type="button"
                data-drag-ignore
                onClick={onCancelLayout}
                className="inline-flex h-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white px-5 text-[12px] font-semibold text-[#596274] transition hover:border-[#d6dce8] hover:text-[#20242d]"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              data-drag-ignore
              onClick={onEditToggle}
              aria-label="Edit profile"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white text-[#5e6778] transition hover:border-[#d6dce8] hover:text-[#20242d]"
            >
              <PencilIcon className="h-[18px] w-[18px]" />
            </button>
          )}
          <button
            type="button"
            data-drag-ignore
            onClick={onShare}
            aria-label={shareLabel}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white text-[#5e6778] transition hover:border-[#d6dce8] hover:text-[#20242d]"
          >
            <ShareIcon className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            data-drag-ignore
            onClick={onLogout}
            aria-label={logoutLabel}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white text-[#20242d] transition hover:border-[#d6dce8] hover:text-[#20242d]"
          >
            <LogoutIcon className="h-[19px] w-[19px]" />
          </button>
        </div>
      </div>
    </section>
  );
};

const EcosystemCard = ({ stats }: EcosystemCardProps) => {
  return (
    <section className={`${shellCardClasses} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
        My Ecosystem
      </p>
      <div className="mt-4 divide-y divide-[#edf1f6]">
        {stats.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 py-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eef3ff] text-[#1456f4]">
                {item.icon}
              </span>
              <span className="text-[13px] font-medium text-[#434b5a]">
                {item.label}
              </span>
            </div>
            <span className="text-[18px] font-[800] tracking-[-0.05em] text-[#20242d]">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};

const BadgesCard = ({ badges }: BadgesCardProps) => {
  return (
    <section className={`${shellCardClasses} p-4`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
        Badges
      </p>
      <div className="mt-4 space-y-3">
        {badges.map((badge) => (
          <div
            key={badge}
            className="flex items-center gap-3 rounded-[18px] bg-[#f7f9fc] px-3 py-3"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#edf3ff] text-[#1456f4]">
              <ShieldIcon className="h-4 w-4" />
            </span>
            <p className="text-[13px] font-medium leading-[1.45] text-[#434b5a]">
              {badge}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

const UniversityIdCard = ({
  displayName,
  collegeLabel,
  displayHandle,
  memberId,
  leaderboardRank,
}: UniversityIdCardProps) => {
  return (
    <section className="overflow-hidden rounded-[34px] border border-[#376ef7]/20 bg-[linear-gradient(135deg,#2a63f5_0%,#5f84f7_100%)] p-6 text-white shadow-[0_26px_60px_rgba(20,86,244,0.22)] sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_210px] lg:items-center">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/84">
            Official University ID
          </p>
          <div className="mt-6 grid gap-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                Student Name
              </p>
              <h2 className="mt-2 text-[34px] font-[800] leading-[0.94] tracking-[-0.06em] text-white sm:text-[40px]">
                {displayName}
              </h2>
            </div>

            <div className="grid gap-4 text-[14px] sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                  Affiliation
                </p>
                <p className="mt-1 font-medium text-white">{collegeLabel}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                  Member ID
                </p>
                <p className="mt-1 font-medium text-white">{memberId}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                  Handle
                </p>
                <p className="mt-1 font-medium text-white">{displayHandle}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                  Global Rank
                </p>
                <p className="mt-1 font-medium text-white">
                  {leaderboardRank ? `#${leaderboardRank}` : "No rank"}
                </p>
              </div>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/16 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
              <span className="h-2 w-2 rounded-full bg-[#57e69a]" />
              NFC Tap Ready
            </div>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[210px]">
          <div className="rounded-[30px] bg-white px-5 py-6 text-center text-[#20242d] shadow-[0_22px_45px_rgba(22,34,72,0.18)]">
            <div className="mx-auto flex h-[164px] w-[122px] items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,#30404c_0%,#202936_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
              <div className="flex h-[106px] w-[76px] flex-col items-center justify-center rounded-[12px] bg-white shadow-[0_16px_28px_rgba(17,27,57,0.12)]">
                <SiteGlyph />
                <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5d6777]">
                  Verified
                </p>
              </div>
            </div>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#20242d]">
              Scan to Verify
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

const ProfileLayoutInner = () => {
  const router = useRouter();
  const { user, token, isAuthenticated, openAuthModal, logout } = useAuth();
  const { answers, isLoaded } = useProfileAnswers();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const [positions, setPositions] = useState<Record<string, BlockPosition>>(() =>
    buildDefaultPositions("default")
  );
  const [savedPositions, setSavedPositions] = useState<Record<string, BlockPosition>>(
    () => buildDefaultPositions("default")
  );
  const [blockHeights, setBlockHeights] = useState<BlockSizes>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode>("relative");
  const [isAnswerEditorOpen, setAnswerEditorOpen] = useState(false);
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
  const [friendsSummary, setFriendsSummary] = useState<FriendSummary | null>(null);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [shareLabel, setShareLabel] = useState("Share");
  const [unreadCount, setUnreadCount] = useState(0);

  const gridGap = containerWidth > 0 && containerWidth < 640 ? 12 : GRID_GAP;
  const gridUnit = useMemo(() => {
    if (containerWidth <= 0) {
      return 0;
    }
    return Math.max(0, (containerWidth - gridGap * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  }, [containerWidth, gridGap]);
  const gridStep = useMemo(() => gridUnit + gridGap, [gridGap, gridUnit]);
  const isCompact = containerWidth > 0 && containerWidth < 768;
  const layoutMode: LayoutMode = isCompact ? "compact" : "default";
  const defaultPositions = useMemo(
    () => buildDefaultPositions(layoutMode),
    [layoutMode]
  );

  const getBlockWidth = useCallback(
    (block: BlockTemplate) => {
      const columns = isCompact ? block.columns.compact : block.columns.default;
      return columns * gridUnit + (columns - 1) * gridGap;
    },
    [gridGap, gridUnit, isCompact]
  );

  const getRect = useCallback(
    (id: string, position?: BlockPosition) => {
      const block = BLOCK_TEMPLATES.find((item) => item.id === id);
      const width = block ? getBlockWidth(block) : 0;
      const height = blockHeights[id] ?? gridStep * 2;
      const pos = position ?? positions[id] ?? { x: 0, y: 0 };

      return {
        x: pos.x * gridStep,
        y: pos.y * gridStep,
        width,
        height,
      };
    },
    [blockHeights, getBlockWidth, gridStep, positions]
  );

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let isActive = true;

    const loadLayout = async () => {
      let remotePositions: Record<string, BlockPosition> | null = null;

      if (token) {
        try {
          const response = await apiGet<{
            layout?: { positions: Record<string, BlockPosition>; mode: LayoutMode };
          }>(`/profile/layout?mode=${layoutMode}`, token);

          if (response.layout?.positions) {
            remotePositions = normalizeLockedPositions(
              response.layout.positions,
              defaultPositions
            );
          }
        } catch {
          remotePositions = null;
        }
      }

      let localPositions: Record<string, BlockPosition> | null = null;
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(layoutStorageKey(user.id))
          : null;

      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            positions?: Record<string, BlockPosition>;
            mode?: LayoutMode;
          };
          if (parsed?.positions && parsed.mode === layoutMode) {
            localPositions = normalizeLockedPositions(
              parsed.positions,
              defaultPositions
            );
          }
        } catch {
          // Ignore malformed stored layouts.
        }
      }

      const chosenPositions = localPositions ?? remotePositions ?? {};
      const merged = normalizeLockedPositions(
        {
          ...defaultPositions,
          ...chosenPositions,
        },
        defaultPositions
      );

      const shouldSync =
        token &&
        localPositions &&
        (!remotePositions ||
          JSON.stringify(remotePositions) !== JSON.stringify(localPositions));

      if (shouldSync) {
        apiPost(
          "/profile/layout",
          { positions: localPositions, mode: layoutMode },
          token
        ).catch(() => {
          // Ignore migration failures; local layout still works.
        });
      }

      if (!isActive) {
        return;
      }

      setPositions(merged);
      setSavedPositions(merged);
    };

    void loadLayout();

    return () => {
      isActive = false;
    };
  }, [defaultPositions, layoutMode, token, user?.id]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    let isActive = true;

    const loadData = async () => {
      const [summaryResult, rankResult] = await Promise.allSettled([
        apiGet<FriendSummary>("/friends/summary", token),
        loadLeaderboardRank(token, user.id),
      ]);

      if (!isActive) {
        return;
      }

      setFriendsSummary(
        summaryResult.status === "fulfilled" ? summaryResult.value : null
      );
      setLeaderboardRank(
        rankResult.status === "fulfilled" ? rankResult.value : null
      );
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [token, user?.id]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadCount = async () => {
      try {
        const payload = await apiGet<{ count: number }>(
          "/notifications/unread-count",
          token
        );
        if (isActive) {
          setUnreadCount(payload.count ?? 0);
        }
      } catch {
        if (isActive) {
          setUnreadCount(0);
        }
      }
    };

    void loadCount();
    const interval = window.setInterval(loadCount, 15000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [token]);

  const handleOpenEditor = useCallback(() => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    setAnswerEditorOpen(true);
  }, [isAuthenticated, openAuthModal]);

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareLabel("Copied");
      window.setTimeout(() => setShareLabel("Share"), 1800);
    } catch {
      setShareLabel("Share");
    }
  }, []);

  const handleLogoutConfirm = useCallback(() => {
    setLogoutModalOpen(false);
    logout();
    router.push("/");
  }, [logout, router]);

  const setContainerNode = useCallback((node: HTMLDivElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    containerRef.current = node;

    if (!node) {
      return;
    }

    setContainerWidth(node.offsetWidth);
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? node.offsetWidth;
      setContainerWidth(nextWidth);
    });
    observer.observe(node);
    resizeObserverRef.current = observer;
  }, []);

  const handleSave = () => {
    const collisions = BLOCK_TEMPLATES.some((block) => {
      const rect = getRect(block.id, positions[block.id]);
      return BLOCK_TEMPLATES.some((other) => {
        if (block.id === other.id) {
          return false;
        }
        const otherRect = getRect(other.id, positions[other.id]);
        return rectsOverlap(rect, otherRect);
      });
    });

    if (collisions) {
      setLayoutError("Resolve overlaps before saving the layout.");
      return;
    }

    const nextSavedPositions = normalizeLockedPositions(positions, defaultPositions);

    setLayoutError(null);
    setPositions(nextSavedPositions);
    setSavedPositions(nextSavedPositions);

    if (user?.id && typeof window !== "undefined") {
      window.localStorage.setItem(
        layoutStorageKey(user.id),
        JSON.stringify({
          positions: nextSavedPositions,
          mode: layoutMode,
        })
      );
    }

    if (user?.id && token) {
      void apiPost(
        "/profile/layout",
        { positions: nextSavedPositions, mode: layoutMode },
        token
      ).catch(() => {
        // Keep local layout even if the save fails.
      });
    }

    setIsEditing(false);
  };

  const handleCancel = useCallback(() => {
    setLayoutError(null);
    setPositions(normalizeLockedPositions(savedPositions, defaultPositions));
    setIsEditing(false);
  }, [defaultPositions, savedPositions]);

  const canvasHeight = useMemo(() => {
    const bottoms = BLOCK_TEMPLATES.map((block) => {
      const rect = getRect(block.id, positions[block.id]);
      return rect.y + rect.height;
    });
    return Math.max(...bottoms, 200) + gridStep;
  }, [getRect, gridStep, positions]);

  const handlePointerDown = (
    id: string,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    if (!isEditing || !containerRef.current) {
      return;
    }
    if (LOCKED_BLOCK_IDS.includes(id as (typeof LOCKED_BLOCK_IDS)[number])) {
      return;
    }
    if (event.button !== 0 || isInteractiveElement(event.target)) {
      return;
    }

    const currentPosition = positions[id] ?? { x: 0, y: 0 };
    const snappedPosition =
      movementMode === "relative"
        ? {
            x: Math.round(currentPosition.x / GRID_SNAP) * GRID_SNAP,
            y: Math.round(currentPosition.y / GRID_SNAP) * GRID_SNAP,
          }
        : currentPosition;

    if (
      movementMode === "relative" &&
      (snappedPosition.x !== currentPosition.x ||
        snappedPosition.y !== currentPosition.y)
    ) {
      setPositions((prev) => ({
        ...prev,
        [id]: snappedPosition,
      }));
    }

    const rect = getRect(id, snappedPosition);
    dragOffsetRef.current = {
      x: event.clientX - (containerRef.current.getBoundingClientRect().left + rect.x),
      y: event.clientY - (containerRef.current.getBoundingClientRect().top + rect.y),
    };
    setDraggingId(id);
  };

  useEffect(() => {
    if (!draggingId || !containerRef.current) {
      return;
    }

    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) {
        return;
      }
      const containerRect = containerRef.current.getBoundingClientRect();
      const block = BLOCK_TEMPLATES.find((item) => item.id === draggingId);
      if (!block) {
        return;
      }
      const width = getBlockWidth(block);

      let nextX =
        (event.clientX - containerRect.left - dragOffsetRef.current.x) / gridStep;
      let nextY =
        (event.clientY - containerRect.top - dragOffsetRef.current.y) / gridStep;

      if (movementMode === "relative") {
        nextX = Math.round(nextX / GRID_SNAP) * GRID_SNAP;
        nextY = Math.round(nextY / GRID_SNAP) * GRID_SNAP;
      }

      const maxX = Math.max(0, (containerRect.width - width) / gridStep);
      nextX = Math.min(Math.max(0, nextX), maxX);
      nextY = Math.max(0, nextY);

      setPositions((prev) => ({
        ...prev,
        [draggingId]: { x: nextX, y: nextY },
      }));
      setLayoutError(null);
    };

    const handleUp = () => {
      setDraggingId(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [draggingId, getBlockWidth, gridStep, movementMode]);

  const displayName = user?.name ?? fallbackProfile.name;
  const displayHandle = user?.handle ?? fallbackProfile.handle;
  const profileName = user?.name ?? "Profile";
  const profilePoints = formatHeaderPoints(user?.coins ?? 0);
  const collegeLabel =
    user?.collegeName ??
    deriveCollegeFromDomain(user?.collegeDomain ?? "") ??
    deriveCollegeFromEmail(user?.email ?? "") ??
    "Campus";
  const collegeAcronym = toCollegeAcronym(collegeLabel);
  const displayBio = fallbackProfile.bio;
  const memberId = buildMemberId(user?.id ?? displayHandle);
  const promptCount = [
    answers?.career?.trim(),
    answers?.memory?.trim(),
    answers?.madlib.when?.trim() &&
      answers?.madlib.focus?.trim() &&
      answers?.madlib.action?.trim()
      ? "madlib"
      : "",
  ].filter(Boolean).length;

  const displayBadges = useMemo(() => {
    const values = [...fallbackProfile.badges];
    values.unshift(`${collegeAcronym} Member`);
    if (leaderboardRank) {
      values.push(`Leaderboard #${leaderboardRank}`);
    }
    return Array.from(new Set(values)).slice(0, 4);
  }, [collegeAcronym, leaderboardRank]);

  const ecosystemStats = useMemo(
    () => [
      {
        label: "Friends",
        value: friendsSummary?.friends.length ?? 0,
        icon: <PeopleIcon className="h-4 w-4" />,
      },
      {
        label: "Prompts",
        value: promptCount,
        icon: <SparkIcon className="h-4 w-4" />,
      },
      {
        label: "Badges",
        value: displayBadges.length,
        icon: <ShieldIcon className="h-4 w-4" />,
      },
    ],
    [displayBadges.length, friendsSummary?.friends.length, promptCount]
  );

  const madlibChips = useMemo(
    () =>
      [
        answers?.madlib.when?.trim(),
        answers?.madlib.focus?.trim(),
        answers?.madlib.action?.trim(),
      ].filter(Boolean) as string[],
    [answers?.madlib.action, answers?.madlib.focus, answers?.madlib.when]
  );

  const promptCards: Record<string, PromptCardData> = {
    "prompt-memory": {
      title: "What's your favorite memory?",
      answer: answers?.memory,
      chips: undefined,
      icon: <MemoryIcon className="h-[18px] w-[18px]" />,
      actionLabel: answers?.memory?.trim() ? "Reply" : "Add your answer",
    },
    "prompt-career": {
      title: "If you're guaranteed success, what career would you choose?",
      answer: answers?.career,
      chips: undefined,
      icon: <CareerIcon className="h-[18px] w-[18px]" />,
      actionLabel: answers?.career?.trim() ? "Edit response" : "Add your answer",
    },
    "prompt-madlib": {
      title: "Whenever I'm _______, my _______ stop and _______.",
      answer: undefined,
      chips: madlibChips,
      icon: <PencilIcon className="h-[18px] w-[18px]" />,
      actionLabel: madlibChips.length > 0 ? "Edit response" : "Add your answer",
    },
  };

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case "profile-header":
        return (
          <ProfileOverviewCard
            displayName={displayName}
            displayHandle={displayHandle}
            avatarUrl={user?.avatarUrl ?? null}
            collegeAcronym={collegeAcronym}
            displayBio={displayBio}
            isEditing={isEditing}
            movementMode={movementMode}
            onEditToggle={() => {
              setLayoutError(null);
              setIsEditing(true);
            }}
            onMovementModeChange={setMovementMode}
            onSaveLayout={handleSave}
            onCancelLayout={handleCancel}
            onShare={handleShare}
            onLogout={() => setLogoutModalOpen(true)}
            shareLabel={shareLabel}
            logoutLabel="Log out"
            layoutError={layoutError}
          />
        );
      case "ecosystem":
        return <EcosystemCard stats={ecosystemStats} />;
      case "badges":
        return <BadgesCard badges={displayBadges} />;
      case "university-id":
        return (
          <UniversityIdCard
            displayName={displayName}
            collegeLabel={collegeLabel}
            displayHandle={displayHandle}
            memberId={memberId}
            leaderboardRank={leaderboardRank}
          />
        );
      case "prompts-heading":
        return (
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="text-[30px] font-[800] tracking-[-0.065em] text-[#20242d]">
                Identity Prompts
              </h2>
              {!isLoaded && (
                <p className="mt-2 text-[14px] text-[#8c95a6]">Loading your answers...</p>
              )}
            </div>
            <button
              type="button"
              onClick={handleOpenEditor}
              data-drag-ignore
              className="text-[11px] font-semibold tracking-[0.02em] text-[#1456f4] transition hover:text-[#0f49e2]"
            >
              Customize Prompts
            </button>
          </div>
        );
      case "prompt-memory":
      case "prompt-career":
      case "prompt-madlib": {
        const card = promptCards[blockId];
        return (
          <PromptCard
            icon={card.icon}
            title={card.title}
            answer={card.answer}
            chips={card.chips}
            actionLabel={card.actionLabel}
            onAction={handleOpenEditor}
          />
        );
      }
      default:
        return null;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
        <header className="sticky top-0 isolate z-[120] pointer-events-auto border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl">
          <div className="flex w-full items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
            <div className="flex items-center gap-[54px]">
              <Link href="/" className="inline-flex items-center leading-none">
                <HeaderWordmark />
              </Link>
              <nav className="hidden items-center gap-[44px] lg:flex">
                {headerNavItems.map(({ href, icon: Icon, label }) => (
                  <Link
                    key={label}
                    href={href}
                    className="inline-flex items-center gap-[9px] text-[14px] font-semibold tracking-[-0.01em] text-[#4b5059] transition hover:text-[#1456f4]"
                  >
                    <Icon className="h-[16px] w-[16px] text-[#4f5560]" />
                    <span>{label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[980px] px-4 pb-16 pt-6">
          <div className={`${shellCardClasses} px-8 py-12 text-center`}>
            <h1 className="text-[34px] font-[800] tracking-[-0.065em] text-[#20242d]">
              Your Profile
            </h1>
            <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.7] text-[#667183]">
              Sign in to customize your card, move sections around, and update your prompts.
            </p>
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_16px_32px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
            >
              Log In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
      <header className="sticky top-0 isolate z-[120] pointer-events-auto border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
          <div className="flex items-center gap-[54px]">
            <Link href="/" className="inline-flex items-center leading-none">
              <HeaderWordmark />
            </Link>
            <nav className="hidden items-center gap-[44px] lg:flex">
              {headerNavItems.map(({ href, icon: Icon, label }) => (
                <Link
                  key={label}
                  href={href}
                  className="inline-flex items-center gap-[9px] text-[14px] font-semibold tracking-[-0.01em] text-[#4b5059] transition hover:text-[#1456f4]"
                >
                  <Icon className="h-[16px] w-[16px] text-[#4f5560]" />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-5">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#252a34] transition hover:bg-[#f4f7fb]"
            >
              <BellNavIcon className="h-[20px] w-[20px]" />
              {token && unreadCount > 0 && (
                <span className="absolute right-[9px] top-[6px] h-[4px] w-[4px] rounded-full bg-[#ff4c4c]" />
              )}
            </Link>

            <Link
              href="/profile"
              className="flex items-center gap-3 border-l border-[#eceff5] pl-6"
            >
              <div className="text-right leading-none">
                <p className="text-[14px] font-bold tracking-[-0.04em] text-[#20242d]">
                  {profileName}
                </p>
                <p className="mt-[3px] text-[10.5px] font-medium uppercase tracking-[-0.01em] text-[#666d7b]">
                  {profilePoints}
                </p>
              </div>
              <Avatar
                name={profileName}
                avatarUrl={user?.avatarUrl}
                size={42}
                className="border border-[#dde4ef] text-[#202531] shadow-[0_10px_20px_rgba(26,39,73,0.08)]"
              />
            </Link>
          </div>
        </div>
      </header>

      <div className="relative z-0 mx-auto max-w-[1180px] px-4 pb-16 pt-6">
        <div
          ref={setContainerNode}
          className="relative z-0"
          style={{ height: canvasHeight || "auto" }}
        >
          {isEditing && movementMode === "relative" && gridStep > 0 && (
            <div
              className="pointer-events-none absolute inset-0 rounded-[32px] opacity-70"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(20,86,244,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(20,86,244,0.08) 1px, transparent 1px)",
                backgroundSize: `${gridStep}px ${gridStep}px`,
              }}
            />
          )}

          {BLOCK_TEMPLATES.map((block) => {
            const isLockedBlock = LOCKED_BLOCK_IDS.includes(
              block.id as (typeof LOCKED_BLOCK_IDS)[number]
            );
            const pos = isLockedBlock
              ? defaultPositions[block.id] ?? { x: 0, y: 0 }
              : positions[block.id] ?? { x: 0, y: 0 };
            const width = getBlockWidth(block);
            const height = blockHeights[block.id] ?? "auto";
            const style = {
              left: pos.x * gridStep,
              top: pos.y * gridStep,
              width,
              height,
            } as const;

            return (
              <div
                key={block.id}
                className={`absolute pointer-events-auto transition ${
                  isEditing && !isLockedBlock ? "cursor-grab select-none" : ""
                } ${
                  draggingId === block.id
                    ? "z-40"
                    : block.id === "profile-header"
                      ? "z-30"
                      : "z-10"
                }`}
                style={style}
                onPointerDown={
                  isEditing && !isLockedBlock
                    ? (event) => handlePointerDown(block.id, event)
                    : undefined
                }
              >
                <BlockSizer
                  blockId={block.id}
                  onResize={(nextHeight) =>
                    setBlockHeights((prev) => {
                      const currentHeight = prev[block.id];
                      if (
                        typeof currentHeight === "number" &&
                        Math.abs(currentHeight - nextHeight) < 0.5
                      ) {
                        return prev;
                      }

                      return {
                        ...prev,
                        [block.id]: nextHeight,
                      };
                    })
                  }
                >
                  {renderBlock(block.id)}
                </BlockSizer>
              </div>
            );
          })}
        </div>
      </div>

      <ProfileQuestionnaireModal
        isOpen={isAnswerEditorOpen}
        onClose={() => setAnswerEditorOpen(false)}
      />
      <ConfirmLogoutModal
        isOpen={isLogoutModalOpen}
        onCancel={() => setLogoutModalOpen(false)}
        onConfirm={handleLogoutConfirm}
      />
    </div>
  );
};

const BlockSizer = ({
  blockId,
  onResize,
  children,
}: {
  blockId: string;
  onResize: (height: number) => void;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const resizeHandlerRef = useRef(onResize);
  const lastHeightRef = useRef<number | null>(null);

  useEffect(() => {
    resizeHandlerRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const element = ref.current;
    const update = () => {
      const nextHeight = element.getBoundingClientRect().height;
      if (
        lastHeightRef.current !== null &&
        Math.abs(lastHeightRef.current - nextHeight) < 0.5
      ) {
        return;
      }

      lastHeightRef.current = nextHeight;
      resizeHandlerRef.current(nextHeight);
    };

    lastHeightRef.current = null;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [blockId]);

  return <div ref={ref}>{children}</div>;
};

export const ProfileLayout = () => {
  return (
    <ProfileAnswersProvider>
      <ProfileLayoutInner />
    </ProfileAnswersProvider>
  );
};
