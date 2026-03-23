"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Outfit } from "next/font/google";
import { useParams, usePathname } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { MarketplaceHeader } from "@/features/marketplace/MarketplaceHeader";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { deriveCollegeFromDomain } from "@/lib/college";

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
    id: "question-career",
    columns: { default: 4, compact: 12 },
    layout: {
      default: { x: 0, y: 3 },
      compact: { x: 0, y: 9 },
    },
  },
  {
    id: "question-madlib",
    columns: { default: 4, compact: 12 },
    layout: {
      default: { x: 4, y: 3 },
      compact: { x: 0, y: 14 },
    },
  },
  {
    id: "question-memory",
    columns: { default: 4, compact: 12 },
    layout: {
      default: { x: 8, y: 3 },
      compact: { x: 0, y: 19 },
    },
  },
  {
    id: "currently",
    columns: { default: 6, compact: 12 },
    layout: {
      default: { x: 0, y: 6 },
      compact: { x: 0, y: 24 },
    },
  },
  {
    id: "crew",
    columns: { default: 6, compact: 12 },
    layout: {
      default: { x: 6, y: 6 },
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

const buildMadlibAnswer = (answers: ProfileAnswers | null) => {
  if (!answers) {
    return "";
  }

  const { when, focus, action } = answers.madlib;
  if (!when || !focus || !action) {
    return "";
  }

  return `Whenever I'm ${when}, my ${focus} stop and ${action}.`;
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

const PublicPromptCard = ({
  eyebrow,
  eyebrowClasses,
  title,
  answer,
}: {
  eyebrow: string;
  eyebrowClasses: string;
  title: string;
  answer?: string;
}) => {
  const trimmedAnswer = answer?.trim();

  return (
    <article className={`${shellCardClasses} flex min-h-[250px] flex-col p-5`}>
      <span
        className={`inline-flex h-8 items-center self-start rounded-full px-3 text-[10px] font-semibold uppercase tracking-[0.16em] ${eyebrowClasses}`}
      >
        {eyebrow}
      </span>
      <h3 className="mt-5 max-w-[260px] text-[22px] font-[800] leading-[1.12] tracking-[-0.06em] text-[#20242d]">
        {title}
      </h3>
      <div className="mt-4 flex-1">
        <p
          className={`text-[14px] leading-[1.75] ${
            trimmedAnswer ? "text-[#616c7e]" : "text-[#96a0b0]"
          }`}
        >
          {trimmedAnswer || "No answer shared yet."}
        </p>
      </div>
    </article>
  );
};

const PublicCurrentlyCard = () => (
  <section className={`${shellCardClasses} p-5`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
      Currently
    </p>
    <p className="mt-3 text-[18px] font-[700] tracking-[-0.04em] text-[#20242d]">
      Heads down on a campus tools sprint.
    </p>
    <p className="mt-2 text-[14px] leading-[1.7] text-[#616c7e]">
      Open to spontaneous build sessions, campus walks, and ambitious side quests.
    </p>
    <div className="mt-5 flex flex-wrap gap-2">
      {["Co-founder chats", "Hackathons", "Coffee walks"].map((item) => (
        <span
          key={item}
          className="rounded-full bg-[#edf8f6] px-3 py-1 text-[11px] font-semibold tracking-[-0.01em] text-[#1c9d95]"
        >
          {item}
        </span>
      ))}
    </div>
  </section>
);

const PublicCrewCard = () => (
  <section className={`${shellCardClasses} p-5`}>
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
      Social Snapshot
    </p>
    <div className="mt-4 grid grid-cols-3 gap-3">
      {[
        { label: "friends", value: "24", tone: "bg-[#eef3ff] text-[#1456f4]" },
        { label: "collabs", value: "7", tone: "bg-[#fff1ea] text-[#d16b38]" },
        { label: "quests", value: "3", tone: "bg-[#fdebf7] text-[#cc5d9f]" },
      ].map((item) => (
        <div
          key={item.label}
          className="rounded-[22px] border border-[#edf1f6] bg-[#f8fafd] px-3 py-4 text-center"
        >
          <span
            className={`mx-auto inline-flex h-8 min-w-[32px] items-center justify-center rounded-full px-2 text-[14px] font-[800] tracking-[-0.04em] ${item.tone}`}
          >
            {item.value}
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#667183]">
            {item.label}
          </p>
        </div>
      ))}
    </div>
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
            { path: "/ranked/leaderboard", token },
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

  const madlibAnswer = useMemo(
    () => buildMadlibAnswer(profile?.answers ?? null),
    [profile?.answers]
  );
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
  const collegeLabel =
    user.collegeName ??
    deriveCollegeFromDomain(user.collegeDomain ?? "");
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
    <section className={`${shellCardClasses} px-5 py-5 sm:px-6 sm:py-6`}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex min-w-0 items-start gap-4 sm:gap-5">
          <div className="relative shrink-0">
            <Avatar
              name={user.name}
              avatarUrl={user.avatarUrl}
              size={86}
              className="border-[3px] border-white text-[32px] text-[#202531] shadow-[0_16px_34px_rgba(24,35,61,0.14)]"
            />
            <span className="absolute bottom-[6px] right-[6px] flex h-4 w-4 items-center justify-center rounded-full border-[3px] border-white bg-[#1456f4]" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-[34px] font-[800] leading-[0.96] tracking-[-0.07em] text-[#20242d] sm:text-[40px]">
                {user.name}
              </h1>
              {leaderboardRank && (
                <span className="rounded-full bg-[#fff3df] px-3 py-1 text-[11px] font-semibold text-[#c6721a]">
                  Leaderboard #{leaderboardRank}
                </span>
              )}
            </div>
            <p className="mt-2 text-[13px] font-medium text-[#7a8394]">
              {user.handle}
              {collegeLabel && (
                <>
                  <span className="px-1.5 text-[#bcc4d1]">•</span>
                  {collegeLabel}
                </>
              )}
            </p>
            <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[#616c7e]">
              Public profile card for campus connections, shared prompts, and mutual context.
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
    </section>
  );

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case "profile-header":
        return renderHeader();
      case "question-career":
        return (
          <PublicPromptCard
            eyebrow="Career Prompt"
            eyebrowClasses="bg-[#edf3ff] text-[#1456f4]"
            title="If you're guaranteed success, what career would you choose?"
            answer={answers?.career}
          />
        );
      case "question-madlib":
        return (
          <PublicPromptCard
            eyebrow="Madlib Prompt"
            eyebrowClasses="bg-[#fff1ea] text-[#d16b38]"
            title="Whenever I'm ____, my ____ stop and ____."
            answer={madlibAnswer}
          />
        );
      case "question-memory":
        return (
          <PublicPromptCard
            eyebrow="Memory Prompt"
            eyebrowClasses="bg-[#fdebf7] text-[#cc5d9f]"
            title="What's your favorite memory?"
            answer={answers?.memory}
          />
        );
      case "currently":
        return <PublicCurrentlyCard />;
      case "crew":
        return <PublicCrewCard />;
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
