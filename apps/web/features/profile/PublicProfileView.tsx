"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, SVGProps } from "react";
import { Outfit } from "next/font/google";
import { useParams, usePathname } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { MarketplaceHeader } from "@/features/marketplace/MarketplaceHeader";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { deriveCollegeFromDomain } from "@/lib/college";
import { profile as fallbackProfile } from "./mock";

type MadlibAnswers = {
  when: string;
  focus: string;
  action: string;
};

type ProfileAnswers = {
  career: string;
  madlib: MadlibAnswers;
  memory: string;
};

type PublicProfilePayload = {
  user: {
    id: string;
    name: string;
    handle: string;
    avatarUrl?: string | null;
    collegeName?: string | null;
    collegeDomain?: string | null;
  };
  answers: ProfileAnswers | null;
  layout?: {
    mode: LayoutMode;
    positions: Record<string, BlockPosition>;
  } | null;
  stats?: {
    friendsCount: number;
  } | null;
  ban?: {
    isActive: boolean;
    until: string | null;
    isIndefinite: boolean;
  };
};

type RelationshipStatus =
  | "none"
  | "incoming"
  | "outgoing"
  | "friends"
  | "blocked"
  | "blocked_by";

type LayoutMode = "default" | "compact";

type BanDuration = "day" | "week" | "month" | "forever";

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

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

type PromptCardProps = {
  icon: ReactNode;
  title: string;
  answer?: string;
  chips?: string[];
  footerLabel?: string;
};

type EcosystemCardProps = {
  stats: Array<{
    label: string;
    value: number;
    icon: ReactNode;
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

const GRID_COLUMNS = 12;
const GRID_GAP = 20;

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

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const shellCardClasses =
  "rounded-[30px] border border-[#e7edf6] bg-white/94 shadow-[0_24px_60px_rgba(24,35,61,0.08)]";

const primaryButtonClasses =
  "inline-flex h-11 items-center justify-center rounded-full bg-[#1456f4] px-5 text-[12px] font-semibold text-white shadow-[0_14px_28px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2] disabled:cursor-not-allowed disabled:opacity-60";

const secondaryButtonClasses =
  "inline-flex h-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white px-5 text-[12px] font-semibold text-[#596274] transition hover:border-[#d6dce8] hover:text-[#20242d] disabled:cursor-not-allowed disabled:opacity-60";

const disabledButtonClasses =
  "inline-flex h-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-[#f7f9fc] px-5 text-[12px] font-semibold text-[#8a93a3]";

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

const PromptCard = ({
  icon,
  title,
  answer,
  chips,
  footerLabel,
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
            No answer shared yet.
          </p>
        )}
      </div>
      {footerLabel ? (
        <div className="mt-6 inline-flex h-10 items-center justify-center self-start rounded-full border border-[#e4e9f2] bg-white px-5 text-[11px] font-semibold tracking-[-0.01em] text-[#5b6577]">
          {footerLabel}
        </div>
      ) : null}
    </article>
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

const PublicHeaderCard = ({
  children,
}: {
  children: ReactNode;
}) => (
  <section className={`${shellCardClasses} px-5 py-5 sm:px-6 sm:py-6`}>
    {children}
  </section>
);

export const PublicProfileView = ({ handle }: { handle: string }) => {
  const { user: viewer, token, isAuthenticated, openAuthModal, refreshUser } = useAuth();
  const [profile, setProfile] = useState<PublicProfilePayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [relationship, setRelationship] = useState<RelationshipStatus>("none");
  const [isRelationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const [banDuration, setBanDuration] = useState<BanDuration>("week");
  const [banStatus, setBanStatus] = useState<PublicProfilePayload["ban"] | null>(null);
  const [isBanLoading, setBanLoading] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);
  const [isGrantingCoins, setGrantingCoins] = useState(false);
  const [coinGrantError, setCoinGrantError] = useState<string | null>(null);
  const [coinGrantSuccess, setCoinGrantSuccess] = useState<string | null>(null);
  const [coinGrantAmount, setCoinGrantAmount] = useState(100);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const params = useParams();
  const pathname = usePathname();
  const rawHandle = typeof handle === "string" ? handle : "";

  const paramHandle = useMemo(() => {
    const value = params?.handle;
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      return value[0] ?? "";
    }
    return "";
  }, [params]);

  const pathHandle = useMemo(() => {
    if (!pathname) {
      return "";
    }

    const marker = "/profile/";
    const index = pathname.indexOf(marker);
    if (index === -1) {
      return "";
    }

    const segment = pathname.slice(index + marker.length).split("/")[0] ?? "";
    if (!segment) {
      return "";
    }

    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }, [pathname]);

  useEffect(() => {
    if (!profile?.user?.id) {
      setLeaderboardRank(null);
      return;
    }

    let isActive = true;

    const loadEntries = async (path: string, authToken?: string) => {
      const payload = await apiGet<{ entries: LeaderboardEntry[] }>(path, authToken);
      return payload.entries ?? [];
    };

    const loadLeaderboard = async () => {
      const attempts: Array<{ path: string; token?: string }> = token
        ? [
            { path: "/leaderboard", token },
            { path: "/leaderboard/public" },
          ]
        : [{ path: "/leaderboard/public" }, { path: "/leaderboard" }];

      let entries: LeaderboardEntry[] | null = null;
      let lastError: unknown = null;

      for (const attempt of attempts) {
        try {
          entries = await loadEntries(attempt.path, attempt.token);
          break;
        } catch (error) {
          lastError = error;
        }
      }

      if (!entries) {
        throw lastError ?? new Error("Unable to load leaderboard.");
      }

      if (!isActive) {
        return;
      }

      const index = entries.findIndex((entry) => entry.id === profile.user.id);
      setLeaderboardRank(index >= 0 ? index + 1 : null);
    };

    loadLeaderboard().catch(() => {
      if (!isActive) return;
      setLeaderboardRank(null);
    });

    return () => {
      isActive = false;
    };
  }, [profile?.user?.id, token]);

  const sanitizedHandle = (rawHandle || paramHandle || pathHandle)
    .trim()
    .replace(/^@/, "")
    .trim();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [gridUnit, setGridUnit] = useState(0);
  const [gridGap, setGridGap] = useState(GRID_GAP);
  const [positions, setPositions] = useState<Record<string, BlockPosition>>(() =>
    buildDefaultPositions("default")
  );
  const [blockHeights, setBlockHeights] = useState<Record<string, number>>({});

  const gridStep = useMemo(() => gridUnit + gridGap, [gridUnit, gridGap]);
  const isCompact = (() => {
    if (!containerRef.current) {
      return false;
    }
    return containerRef.current.offsetWidth < 768;
  })();
  const layoutMode: LayoutMode = isCompact ? "compact" : "default";
  const defaultPositions = useMemo(
    () => buildDefaultPositions(layoutMode),
    [layoutMode]
  );

  const updateGridUnit = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const width = containerRef.current.offsetWidth;
    const nextGap = width < 640 ? 12 : GRID_GAP;
    const nextUnit = (width - nextGap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    setGridGap(nextGap);
    setGridUnit(Math.max(0, nextUnit));
  }, []);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    updateGridUnit();
    const observer = new ResizeObserver(() => updateGridUnit());
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [profile?.user?.id, updateGridUnit]);

  const getBlockWidth = useCallback(
    (block: BlockTemplate) => {
      const columns = isCompact ? block.columns.compact : block.columns.default;
      return columns * gridUnit + (columns - 1) * gridGap;
    },
    [gridGap, gridUnit, isCompact]
  );

  useEffect(() => {
    let isActive = true;

    const loadProfile = async () => {
      if (!sanitizedHandle) {
        setProfile(null);
        setError(null);
        setIsLoading(true);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiGet<PublicProfilePayload>(
          `/profile/public/${encodeURIComponent(sanitizedHandle)}?mode=${layoutMode}`,
          token ?? undefined
        );

        if (!isActive) {
          return;
        }

        setProfile(response);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this profile."
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [layoutMode, sanitizedHandle, token]);

  useEffect(() => {
    setBanStatus(profile?.ban ?? null);
  }, [profile?.ban]);

  useEffect(() => {
    if (!token || !profile?.user?.handle) {
      return;
    }

    if (viewer?.id && profile?.user?.id && viewer.id === profile.user.id) {
      return;
    }

    let isActive = true;
    setRelationshipLoading(true);
    setRelationshipError(null);

    apiGet<{ status: RelationshipStatus }>(
      `/friends/relationship/${encodeURIComponent(profile.user.handle)}`,
      token
    )
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setRelationship(payload.status);
      })
      .catch((relError) => {
        if (!isActive) {
          return;
        }
        setRelationshipError(
          relError instanceof Error
            ? relError.message
            : "Unable to load relationship."
        );
      })
      .finally(() => {
        if (isActive) {
          setRelationshipLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [profile?.user?.handle, profile?.user?.id, token, viewer?.id]);

  useEffect(() => {
    const layout = profile?.layout;
    const merged =
      layout?.positions
        ? { ...defaultPositions, ...layout.positions }
        : defaultPositions;
    setPositions(merged);
  }, [defaultPositions, layoutMode, profile?.layout]);

  const canvasHeight = useMemo(() => {
    const bottoms = BLOCK_TEMPLATES.map((block) => {
      const pos = positions[block.id] ?? { x: 0, y: 0 };
      const height = blockHeights[block.id] ?? gridStep * 2;
      const rectBottom = pos.y * gridStep + height;
      return rectBottom;
    });

    if (bottoms.length === 0) {
      return 0;
    }

    return Math.max(...bottoms, 200) + gridStep;
  }, [blockHeights, gridStep, positions]);

  const formattedBanUntil = useMemo(() => {
    if (!banStatus?.isActive) {
      return null;
    }
    if (banStatus.isIndefinite) {
      return "Banned indefinitely";
    }
    if (!banStatus.until) {
      return "Banned";
    }
    const date = new Date(banStatus.until);
    if (Number.isNaN(date.getTime())) {
      return "Banned";
    }
    return `Banned until ${date.toLocaleDateString()}`;
  }, [banStatus?.isActive, banStatus?.isIndefinite, banStatus?.until]);

  if (isLoading) {
    return (
      <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
        <MarketplaceHeader activeHref={null} />
        <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6">
          <div className={`${shellCardClasses} px-8 py-12 text-center text-[15px] text-[#667183]`}>
            Loading profile...
          </div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
        <MarketplaceHeader activeHref={null} />
        <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6">
          <div className="rounded-[30px] border border-[#f3d7d7] bg-[#fff8f8] px-8 py-10 text-center text-[15px] font-semibold text-[#b14444] shadow-[0_18px_40px_rgba(20,29,47,0.05)]">
            {error ?? "Profile not found."}
          </div>
        </div>
      </div>
    );
  }

  const { user, answers } = profile;
  const displayName = user.name;
  const displayHandle = user.handle;
  const collegeLabel =
    user.collegeName ??
    deriveCollegeFromDomain(user.collegeDomain ?? "") ??
    "Campus";
  const collegeAcronym = toCollegeAcronym(collegeLabel);
  const displayBio = fallbackProfile.bio;
  const memberId = buildMemberId(user.id ?? displayHandle);
  const promptCount = [
    answers?.career?.trim(),
    answers?.memory?.trim(),
    answers?.madlib.when?.trim() &&
      answers?.madlib.focus?.trim() &&
      answers?.madlib.action?.trim()
      ? "madlib"
      : "",
  ].filter(Boolean).length;
  const displayBadges = Array.from(
    new Set([
      `${collegeAcronym} Member`,
      ...fallbackProfile.badges,
      ...(leaderboardRank ? [`Leaderboard #${leaderboardRank}`] : []),
    ])
  ).slice(0, 4);
  const madlibChips = [
    answers?.madlib.when?.trim(),
    answers?.madlib.focus?.trim(),
    answers?.madlib.action?.trim(),
  ].filter(Boolean) as string[];
  const ecosystemStats = [
    {
      label: "Friends",
      value: profile.stats?.friendsCount ?? 0,
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
  ];
  const isSelf = viewer?.id === user.id;
  const showAdminTools = Boolean(viewer?.isAdmin);
  const showBanControls = Boolean(viewer?.isAdmin && !isSelf);

  const runRelationshipAction = async (
    action: () => Promise<void>,
    nextStatus: RelationshipStatus
  ) => {
    setRelationshipError(null);
    setRelationshipLoading(true);
    try {
      await action();
      setRelationship(nextStatus);
    } catch (relError) {
      setRelationshipError(
        relError instanceof Error
          ? relError.message
          : "Unable to update connection."
      );
    } finally {
      setRelationshipLoading(false);
    }
  };

  const handleConnect = () => {
    if (!isAuthenticated) {
      openAuthModal("signup");
      return;
    }
    if (!token) {
      return;
    }
    runRelationshipAction(
      () =>
        apiPost(
          "/friends/requests",
          { handle: user.handle },
          token
        ).then(() => undefined),
      "outgoing"
    );
  };

  const handleAccept = () => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    runRelationshipAction(
      () =>
        apiPost(
          `/friends/requests/accept/${encodeURIComponent(user.handle)}`,
          {},
          token
        ).then(() => undefined),
      "friends"
    );
  };

  const handleDecline = () => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    runRelationshipAction(
      () =>
        apiDelete(
          `/friends/requests/with/${encodeURIComponent(user.handle)}`,
          token
        ).then(() => undefined),
      "none"
    );
  };

  const handleRemoveFriend = () => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    runRelationshipAction(
      () =>
        apiDelete(`/friends/${encodeURIComponent(user.handle)}`, token).then(
          () => undefined
        ),
      "none"
    );
  };

  const handleBlock = () => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    runRelationshipAction(
      () =>
        apiPost(
          `/friends/block/${encodeURIComponent(user.handle)}`,
          {},
          token
        ).then(() => undefined),
      "blocked"
    );
  };

  const handleUnblock = () => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    runRelationshipAction(
      () =>
        apiDelete(`/friends/block/${encodeURIComponent(user.handle)}`, token).then(
          () => undefined
        ),
      "none"
    );
  };

  const handleBanToggle = async () => {
    if (!showBanControls) {
      return;
    }
    if (!token) {
      openAuthModal("login");
      return;
    }
    setBanError(null);
    setBanLoading(true);
    try {
      const duration = banStatus?.isActive ? "unban" : banDuration;
      const response = await apiPost<{ ban: PublicProfilePayload["ban"] }>(
        `/admin/users/${encodeURIComponent(user.id)}/ban`,
        { duration },
        token
      );
      setBanStatus(response.ban ?? null);
    } catch (banUpdateError) {
      setBanError(
        banUpdateError instanceof Error
          ? banUpdateError.message
          : "Unable to update ban."
      );
    } finally {
      setBanLoading(false);
    }
  };

  const handleGrantCoins = async () => {
    if (!showAdminTools) {
      return;
    }
    if (!token) {
      openAuthModal("login");
      return;
    }
    setGrantingCoins(true);
    setCoinGrantError(null);
    setCoinGrantSuccess(null);
    try {
      await apiPost(
        `/admin/users/${encodeURIComponent(user.id)}/coins`,
        { amount: coinGrantAmount },
        token
      );
      if (viewer?.id === user.id) {
        await refreshUser();
      }
      setCoinGrantSuccess(`Added ${coinGrantAmount.toLocaleString()} coins.`);
    } catch (coinError) {
      setCoinGrantError(
        coinError instanceof Error
          ? coinError.message
          : "Unable to grant coins."
      );
    } finally {
      setGrantingCoins(false);
    }
  };

  const renderHeader = () => (
    <PublicHeaderCard>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <Avatar
              name={displayName}
              avatarUrl={user.avatarUrl}
              size={86}
              className="border-[3px] border-white text-[32px] text-[#202531] shadow-[0_16px_34px_rgba(24,35,61,0.14)]"
            />
            <span className="absolute bottom-[6px] right-[6px] flex h-4 w-4 items-center justify-center rounded-full border-[3px] border-white bg-[#1456f4]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[34px] font-[800] leading-[1.06] tracking-[-0.07em] text-[#20242d] sm:text-[40px]">
                {displayName}
              </h1>
              {leaderboardRank && (
                <span className="rounded-full bg-[#fff3df] px-3 py-1 text-[11px] font-semibold text-[#c6721a]">
                  Leaderboard #{leaderboardRank}
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] font-medium text-[#7a8394]">
              {displayHandle}
              <span className="px-1.5 text-[#bcc4d1]">•</span>
              {collegeAcronym}
            </p>
            <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[#616c7e]">
              {displayBio}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start">
          {showAdminTools && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#667183]">
                Grant coins
              </span>
              <select
                className="rounded-full border border-[#e4e9f2] bg-white px-3 py-2 text-[12px] font-semibold text-[#596274] shadow-[0_10px_24px_rgba(24,35,61,0.06)] transition hover:border-[#d6dce8] focus:outline-none focus:ring-2 focus:ring-[#1456f4]/20"
                value={coinGrantAmount}
                onChange={(event) => setCoinGrantAmount(Number(event.target.value))}
                disabled={isGrantingCoins}
              >
                <option value={100}>+100</option>
                <option value={1000}>+1,000</option>
                <option value={10000}>+10,000</option>
                <option value={100000}>+100,000</option>
              </select>
              <button
                type="button"
                onClick={handleGrantCoins}
                disabled={isGrantingCoins}
                className={secondaryButtonClasses}
              >
                Grant
              </button>
            </div>
          )}
          {!isSelf && showBanControls && (
            <div className="flex flex-wrap items-center gap-2">
              {!banStatus?.isActive && (
                <select
                  className="rounded-full border border-[#e4e9f2] bg-white px-3 py-2 text-[12px] font-semibold text-[#596274] shadow-[0_10px_24px_rgba(24,35,61,0.06)] transition hover:border-[#d6dce8] focus:outline-none focus:ring-2 focus:ring-[#1456f4]/20"
                  value={banDuration}
                  onChange={(event) =>
                    setBanDuration(event.target.value as BanDuration)
                  }
                  disabled={isBanLoading}
                >
                  <option value="day">Ban 1 day</option>
                  <option value="week">Ban 1 week</option>
                  <option value="month">Ban 1 month</option>
                  <option value="forever">Ban forever</option>
                </select>
              )}
              <button
                type="button"
                onClick={handleBanToggle}
                disabled={isBanLoading}
                className={banStatus?.isActive ? secondaryButtonClasses : primaryButtonClasses}
              >
                {banStatus?.isActive ? "Unban" : "Ban"}
              </button>
              {formattedBanUntil && (
                <span className="rounded-full bg-[#fff0f0] px-3 py-2 text-[11px] font-semibold text-[#cf4b49]">
                  {formattedBanUntil}
                </span>
              )}
            </div>
          )}
          {!isSelf &&
            (relationship === "blocked" ? (
              <button
                type="button"
                onClick={handleUnblock}
                disabled={isRelationshipLoading}
                className={secondaryButtonClasses}
              >
                Unblock
              </button>
            ) : relationship === "blocked_by" ? (
              <span className={disabledButtonClasses}>
                Blocked
              </span>
            ) : relationship === "friends" ? (
              <>
                <button
                  type="button"
                  onClick={handleRemoveFriend}
                  disabled={isRelationshipLoading}
                  className={secondaryButtonClasses}
                >
                  Remove friend
                </button>
                <button
                  type="button"
                  onClick={handleBlock}
                  disabled={isRelationshipLoading}
                  className={secondaryButtonClasses}
                >
                  Block
                </button>
              </>
            ) : relationship === "incoming" ? (
              <>
                <button
                  type="button"
                  onClick={handleAccept}
                  disabled={isRelationshipLoading}
                  className={primaryButtonClasses}
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isRelationshipLoading}
                  className={secondaryButtonClasses}
                >
                  Decline
                </button>
              </>
            ) : relationship === "outgoing" ? (
              <>
                <span className={disabledButtonClasses}>
                  Pending
                </span>
                <button
                  type="button"
                  onClick={handleDecline}
                  disabled={isRelationshipLoading}
                  className={secondaryButtonClasses}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={isRelationshipLoading}
                  className={primaryButtonClasses}
                >
                  Connect
                </button>
                <button
                  type="button"
                  onClick={handleBlock}
                  disabled={isRelationshipLoading}
                  className={secondaryButtonClasses}
                >
                  Block
                </button>
              </>
            ))}
        </div>
      </div>
      {relationshipError && (
        <p className="mt-4 text-[12px] font-semibold text-[#d14f4f]">
          {relationshipError}
        </p>
      )}
      {banError && (
        <p className="mt-2 text-[12px] font-semibold text-[#d14f4f]">{banError}</p>
      )}
      {coinGrantError && (
        <p className="mt-2 text-[12px] font-semibold text-[#d14f4f]">{coinGrantError}</p>
      )}
      {coinGrantSuccess && (
        <p className="mt-2 text-[12px] font-semibold text-[#23835b]">
          {coinGrantSuccess}
        </p>
      )}
    </PublicHeaderCard>
  );

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case "profile-header":
        return renderHeader();
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
              <p className="mt-2 text-[14px] text-[#8c95a6]">
                Shared answers from this profile.
              </p>
            </div>
          </div>
        );
      case "prompt-memory":
        return (
          <PromptCard
            icon={<MemoryIcon className="h-[18px] w-[18px]" />}
            title="What's your favorite memory?"
            answer={answers?.memory}
            footerLabel={answers?.memory?.trim() ? "Shared response" : "No answer yet"}
          />
        );
      case "prompt-career":
        return (
          <PromptCard
            icon={<CareerIcon className="h-[18px] w-[18px]" />}
            title="If you're guaranteed success, what career would you choose?"
            answer={answers?.career}
            footerLabel={answers?.career?.trim() ? "Shared response" : "No answer yet"}
          />
        );
      case "prompt-madlib":
        return (
          <PromptCard
            icon={<PencilIcon className="h-[18px] w-[18px]" />}
            title="Whenever I'm _______, my _______ stop and _______."
            chips={madlibChips}
            footerLabel={madlibChips.length > 0 ? "Shared response" : "No answer yet"}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
      <MarketplaceHeader activeHref={null} />
      <div className="relative z-0 mx-auto max-w-[1180px] px-4 pb-16 pt-6">
        <div
          ref={containerRef}
          className="relative z-0 pointer-events-none"
          style={{ height: canvasHeight }}
        >
          {BLOCK_TEMPLATES.map((block) => {
            const pos = positions[block.id] ?? { x: 0, y: 0 };
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
                className="absolute pointer-events-auto"
                style={style}
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
