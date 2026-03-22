"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useAuth } from "@/features/auth";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { deriveCollegeFromDomain } from "@/lib/college";
import { ProfileQuestionCard } from "./ProfileQuestionCard";
import { ProfileCrewCard, ProfileCurrentlyCard } from "./ProfileSidePanel";

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
  const isCompact = useMemo(() => {
    if (!containerRef.current) {
      return false;
    }
    return containerRef.current.offsetWidth < 768;
  }, [gridUnit]);
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
  }, [profile?.ban?.isActive, profile?.ban?.isIndefinite, profile?.ban?.until]);

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
  }, [profile?.user?.handle, token, viewer?.handle]);

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
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-2">
        <Card className="py-10 text-center text-sm text-muted">
          Loading profile...
        </Card>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-5xl px-4 pb-16 pt-2">
        <Card className="border border-accent/30 bg-accent/10 py-6 text-center text-sm font-semibold text-accent">
          {error ?? "Profile not found."}
        </Card>
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
    <Card className="relative overflow-hidden">
      <div className="absolute -right-16 -top-12 h-32 w-32 rounded-full bg-accent/20 blur-2xl" />
      <div className="absolute -bottom-10 left-16 h-24 w-24 rounded-full bg-accent-2/20 blur-2xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <Avatar name={user.name} size={72} className="text-2xl" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-2xl font-semibold text-ink">
              {user.name}
            </p>
            {leaderboardRank && (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                Leaderboard #{leaderboardRank}
              </span>
            )}
          </div>
          <p className="text-sm text-muted">
            {user.handle}
            {collegeLabel && (
              <span className="text-muted">
                <span className="px-2" aria-hidden="true">
                  ·
                </span>
                {collegeLabel}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showAdminTools && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
                Grant coins
              </span>
              <select
                className="rounded-full border border-card-border/70 bg-white/90 px-3 py-1 text-xs font-semibold text-ink/70 shadow-sm transition hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
                value={coinGrantAmount}
                onChange={(event) => setCoinGrantAmount(Number(event.target.value))}
                disabled={isGrantingCoins}
              >
                <option value={100}>+100</option>
                <option value={1000}>+1,000</option>
                <option value={10000}>+10,000</option>
                <option value={100000}>+100,000</option>
              </select>
              <Button
                variant="outline"
                requiresAuth={true}
                onClick={handleGrantCoins}
                disabled={isGrantingCoins}
              >
                Grant
              </Button>
            </div>
          )}
          {!isSelf && showBanControls && (
            <div className="flex flex-wrap items-center gap-2">
              {!banStatus?.isActive && (
                <select
                  className="rounded-full border border-card-border/70 bg-white/90 px-3 py-1 text-xs font-semibold text-ink/70 shadow-sm transition hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/30"
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
              <Button
                variant={banStatus?.isActive ? "outline" : "primary"}
                requiresAuth={true}
                onClick={handleBanToggle}
                disabled={isBanLoading}
              >
                {banStatus?.isActive ? "Unban" : "Ban"}
              </Button>
              {formattedBanUntil && (
                <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">
                  {formattedBanUntil}
                </span>
              )}
            </div>
          )}
          {!isSelf &&
            (relationship === "blocked" ? (
              <Button
                variant="outline"
                requiresAuth={true}
                onClick={handleUnblock}
                disabled={isRelationshipLoading}
              >
                Unblock
              </Button>
            ) : relationship === "blocked_by" ? (
              <Button variant="outline" requiresAuth={false} disabled={true}>
                Blocked
              </Button>
            ) : relationship === "friends" ? (
              <>
                <Button
                  variant="outline"
                  requiresAuth={true}
                  onClick={handleRemoveFriend}
                  disabled={isRelationshipLoading}
                >
                  Remove friend
                </Button>
                <Button
                  variant="outline"
                  requiresAuth={true}
                  onClick={handleBlock}
                  disabled={isRelationshipLoading}
                >
                  Block
                </Button>
              </>
            ) : relationship === "incoming" ? (
              <>
                <Button
                  requiresAuth={true}
                  onClick={handleAccept}
                  disabled={isRelationshipLoading}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  requiresAuth={true}
                  onClick={handleDecline}
                  disabled={isRelationshipLoading}
                >
                  Decline
                </Button>
              </>
            ) : relationship === "outgoing" ? (
              <>
                <Button variant="outline" requiresAuth={false} disabled={true}>
                  Pending
                </Button>
                <Button
                  variant="outline"
                  requiresAuth={true}
                  onClick={handleDecline}
                  disabled={isRelationshipLoading}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button
                  requiresAuth={true}
                  onClick={handleConnect}
                  disabled={isRelationshipLoading}
                >
                  Connect
                </Button>
                <Button
                  variant="outline"
                  requiresAuth={true}
                  onClick={handleBlock}
                  disabled={isRelationshipLoading}
                >
                  Block
                </Button>
              </>
            ))}
        </div>
      </div>
      {relationshipError && (
        <p className="mt-3 text-xs font-semibold text-accent">
          {relationshipError}
        </p>
      )}
      {banError && (
        <p className="mt-2 text-xs font-semibold text-rose-600">{banError}</p>
      )}
      {coinGrantError && (
        <p className="mt-2 text-xs font-semibold text-rose-600">{coinGrantError}</p>
      )}
      {coinGrantSuccess && (
        <p className="mt-2 text-xs font-semibold text-emerald-600">
          {coinGrantSuccess}
        </p>
      )}
    </Card>
  );

  const renderBlock = (blockId: string) => {
    switch (blockId) {
      case "profile-header":
        return renderHeader();
      case "question-career":
        return (
          <ProfileQuestionCard
            title="If you're guaranteed success, what career would you choose?"
            answer={answers?.career}
          />
        );
      case "question-madlib":
        return (
          <ProfileQuestionCard
            title="Whenever I'm ____, my ____ stop and ____."
            answer={madlibAnswer}
          />
        );
      case "question-memory":
        return (
          <ProfileQuestionCard
            title="What's your favorite memory?"
            answer={answers?.memory}
          />
        );
      case "currently":
        return <ProfileCurrentlyCard />;
      case "crew":
        return <ProfileCrewCard />;
      default:
        return null;
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-2">
      <div
        ref={containerRef}
        className="relative pointer-events-none"
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
