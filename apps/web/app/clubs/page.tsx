"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Gamepad2,
  Heart,
  Landmark,
  Palette,
  Plus,
  Rocket,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import {
  ClubComposer,
  type Club,
  type ClubCategory,
  type ClubCategoryFilter,
  type ClubComposerPayload,
  type ClubProximityFilter,
  type ClubRecencyFilter,
  type ClubSortOption,
} from "@/features/clubs";

const recencyToHours: Record<Exclude<ClubRecencyFilter, "all">, number> = {
  "24h": 24,
  "168h": 168,
};

const recencyOptions: Array<{ label: string; value: ClubRecencyFilter }> = [
  { label: "Today", value: "24h" },
  { label: "This week", value: "168h" },
  { label: "All time", value: "all" },
];

const categoryOptions: Array<{ label: string; value: ClubCategoryFilter }> = [
  { label: "All", value: "all" },
  { label: "Social", value: "social" },
  { label: "Study", value: "study" },
  { label: "Build", value: "build" },
  { label: "Sports", value: "sports" },
  { label: "Creative", value: "creative" },
  { label: "Wellness", value: "wellness" },
];

const proximityOptions: Array<{ label: string; value: ClubProximityFilter }> = [
  { label: "Everywhere", value: "all" },
  { label: "Nearby", value: "nearby" },
  { label: "Remote", value: "remote" },
];

const sortOptions: Array<{ label: string; value: ClubSortOption }> = [
  { label: "Most members", value: "members" },
  { label: "Newest", value: "recency" },
  { label: "Closest", value: "distance" },
];

type CategoryTheme = {
  badge: string;
  icon: LucideIcon;
  cta: string;
  background: string;
  accent: string;
};

const categoryThemes: Record<ClubCategory, CategoryTheme> = {
  social: {
    badge: "COMMUNITY",
    icon: Landmark,
    cta: "Meet the Crew",
    background:
      "radial-gradient(circle at 30% 25%, rgba(86,164,255,0.32), transparent 32%), linear-gradient(135deg, #09111f 0%, #153048 46%, #0d2133 100%)",
    accent: "#62a8ff",
  },
  study: {
    badge: "ACADEMIC",
    icon: BookOpen,
    cta: "See Sessions",
    background:
      "radial-gradient(circle at 45% 30%, rgba(117,126,255,0.25), transparent 34%), linear-gradient(135deg, #11141f 0%, #1b2440 46%, #121827 100%)",
    accent: "#8f97ff",
  },
  build: {
    badge: "TRENDING",
    icon: Rocket,
    cta: "View Projects",
    background:
      "radial-gradient(circle at 42% 38%, rgba(37,226,255,0.32), transparent 26%), linear-gradient(135deg, #07131a 0%, #0d3342 42%, #071119 100%)",
    accent: "#2dd7ff",
  },
  sports: {
    badge: "COMPETITIVE",
    icon: Gamepad2,
    cta: "Join Now",
    background:
      "radial-gradient(circle at 52% 22%, rgba(255,83,83,0.2), transparent 24%), linear-gradient(135deg, #090d15 0%, #131a2b 45%, #090d15 100%)",
    accent: "#ff6a6a",
  },
  creative: {
    badge: "CREATIVE",
    icon: Palette,
    cta: "Explore Work",
    background:
      "radial-gradient(circle at 50% 24%, rgba(170,112,255,0.28), transparent 24%), linear-gradient(135deg, #10101a 0%, #251b3d 42%, #131321 100%)",
    accent: "#b58cff",
  },
  wellness: {
    badge: "WELLNESS",
    icon: Heart,
    cta: "Join the Circle",
    background:
      "radial-gradient(circle at 50% 18%, rgba(61,225,177,0.24), transparent 24%), linear-gradient(135deg, #0b1517 0%, #15302c 42%, #0a1214 100%)",
    accent: "#50d7b0",
  },
};

const filterChipBaseClasses =
  "inline-flex items-center rounded-full border px-3.5 py-2 text-[12px] font-semibold transition";

const compareRecency = (a: Club, b: Club) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

const compareMembers = (a: Club, b: Club) => {
  if (b.memberCount !== a.memberCount) {
    return b.memberCount - a.memberCount;
  }
  return compareRecency(a, b);
};

const compareDistance = (a: Club, b: Club) => {
  const distanceA = a.distanceKm ?? Number.POSITIVE_INFINITY;
  const distanceB = b.distanceKm ?? Number.POSITIVE_INFINITY;
  if (distanceA !== distanceB) {
    return distanceA - distanceB;
  }
  return compareRecency(a, b);
};

const formatCompactMembers = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  }
  return `${value}`;
};

const formatMembersLabel = (value: number) =>
  `${formatCompactMembers(value)} ${value === 1 ? "member" : "members"}`;

const normalizeSearchText = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const matchesSearch = (club: Club, query: string) => {
  if (!query) {
    return true;
  }

  const haystack = [
    club.title,
    club.description,
    club.category,
    club.city ?? "",
    club.location,
    club.creator.name,
    club.creator.handle,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
};

const getWrappedItems = <T,>(items: T[], count: number, startIndex: number) => {
  if (items.length === 0 || count <= 0) {
    return [];
  }

  if (items.length <= count) {
    return items;
  }

  const normalizedStart =
    ((startIndex % items.length) + items.length) % items.length;

  return Array.from({ length: count }, (_, index) => {
    const itemIndex = (normalizedStart + index) % items.length;
    return items[itemIndex];
  });
};

const getClubBackgroundStyle = (club: Club): CSSProperties => {
  const theme = categoryThemes[club.category];

  if (club.imageUrl?.trim()) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(4,8,16,0.12) 0%, rgba(4,8,16,0.2) 36%, rgba(4,8,16,0.92) 100%), url(${club.imageUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return {
    backgroundImage: theme.background,
  };
};

const getLocationLabel = (club: Club) => {
  if (club.isRemote) {
    return "Remote";
  }

  if (club.city) {
    return `${club.city} campus`;
  }

  return club.location;
};

const getRowMeta = (club: Club) => {
  const locationLabel = club.isRemote
    ? "Remote sessions"
    : club.city
      ? `${club.city} · ${club.location}`
      : club.location;

  return `${formatMembersLabel(club.memberCount)}  •  ${locationLabel}`;
};

const getSupportingNames = (club: Club) => {
  const firstWord = club.title.split(" ").find(Boolean) ?? club.title;
  const cityLabel = club.city ?? club.location;

  return [club.creator.name, firstWord, cityLabel];
};

const getJoinButtonLabel = ({
  club,
  isOwnClub,
  isJoining,
}: {
  club: Club;
  isOwnClub: boolean;
  isJoining: boolean;
}) => {
  if (isOwnClub) {
    return "Manage";
  }
  if (isJoining) {
    return "Working...";
  }
  if (club.joinedByUser) {
    return "Open";
  }
  if (club.joinPolicy === "application" && club.applicationStatus === "pending") {
    return "Requested";
  }
  if (club.joinPolicy === "application" && club.applicationStatus === "denied") {
    return "Reapply";
  }
  if (club.joinPolicy === "application") {
    return "Request to Join";
  }
  return "Join";
};

const getJoinButtonClasses = ({
  club,
  isOwnClub,
}: {
  club: Club;
  isOwnClub: boolean;
}) => {
  if (isOwnClub || club.joinedByUser) {
    return "bg-[#1456f4] text-white shadow-[0_14px_28px_rgba(20,86,244,0.22)] hover:bg-[#0f49e2]";
  }

  if (club.joinPolicy === "application" && club.applicationStatus === "pending") {
    return "bg-[#d7dade] text-[#4d5560]";
  }

  return "bg-[#d7dade] text-[#3e4650] hover:bg-[#ccd1d8]";
};

const FilterChip = ({
  isActive,
  onClick,
  children,
}: {
  isActive: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    className={`${filterChipBaseClasses} ${
      isActive
        ? "border-[#1456f4] bg-[#1456f4] text-white shadow-[0_12px_24px_rgba(20,86,244,0.18)]"
        : "border-[#e4e8ef] bg-[#f8f9fb] text-[#555f6d] hover:border-[#d7dde7] hover:bg-white"
    }`}
    onClick={onClick}
  >
    {children}
  </button>
);

const SectionSkeleton = ({ tall = false }: { tall?: boolean }) => (
  <div
    className={`animate-pulse rounded-[32px] border border-[#e7ebf1] bg-white/80 ${
      tall ? "min-h-[360px]" : "min-h-[212px]"
    }`}
  />
);

export default function ClubsPage() {
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recency, setRecency] = useState<ClubRecencyFilter>("all");
  const [category, setCategory] = useState<ClubCategoryFilter>("all");
  const [sortBy, setSortBy] = useState<ClubSortOption>("members");
  const [proximity, setProximity] = useState<ClubProximityFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set());
  const [showAllRows, setShowAllRows] = useState(false);
  const [trendingIndex, setTrendingIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadClubs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiGet<{ clubs: Club[] }>("/clubs", token ?? undefined);
      setClubs(response.clubs ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load groups."
      );
      setClubs([]);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadClubs();
  }, [loadClubs]);

  const handleCreateClub = useCallback(
    async (payload: ClubComposerPayload) => {
      if (!token) {
        openAuthModal("login");
        return;
      }

      setIsPosting(true);
      setError(null);

      try {
        const response = await apiPost<{ club: Club }>("/clubs", payload, token);
        if (response.club) {
          setClubs((prev) => [response.club, ...prev]);
        }
        setComposerOpen(false);
      } catch (postError) {
        setError(
          postError instanceof Error ? postError.message : "Unable to create group."
        );
      } finally {
        setIsPosting(false);
      }
    },
    [openAuthModal, token]
  );

  const handleOpenClub = useCallback(
    (club: Club) => {
      router.push(`/clubs/${encodeURIComponent(club.id)}`);
    },
    [router]
  );

  const handleJoin = useCallback(
    async (club: Club) => {
      if (!token) {
        openAuthModal("signup");
        return;
      }

      setError(null);

      if (
        club.joinPolicy === "application" &&
        club.applicationStatus === "pending"
      ) {
        return;
      }

      const isJoined = Boolean(club.joinedByUser);
      setJoiningIds((prev) => new Set(prev).add(club.id));

      try {
        if (isJoined) {
          const response = await apiPost<{ club: Club }>(
            `/clubs/${encodeURIComponent(club.id)}/leave`,
            {},
            token
          );

          if (response.club) {
            setClubs((prev) =>
              prev.map((item) => (item.id === club.id ? response.club : item))
            );
          }
        } else {
          const response = await apiPost<{ club: Club }>(
            `/clubs/${encodeURIComponent(club.id)}/join`,
            {},
            token
          );

          if (response.club) {
            setClubs((prev) =>
              prev.map((item) => (item.id === club.id ? response.club : item))
            );
          }
        }
      } catch (joinError) {
        setError(
          joinError instanceof Error ? joinError.message : "Unable to join group."
        );
      } finally {
        setJoiningIds((prev) => {
          const next = new Set(prev);
          next.delete(club.id);
          return next;
        });
      }
    },
    [openAuthModal, token]
  );

  const normalizedSearchQuery = useMemo(
    () => normalizeSearchText(searchQuery),
    [searchQuery]
  );

  const filteredClubs = useMemo(() => {
    const now = Date.now();

    const bySearch = clubs.filter((club) =>
      matchesSearch(club, normalizedSearchQuery)
    );

    const byRecency =
      recency === "all"
        ? bySearch
        : bySearch.filter((club) => {
            const createdAt = Date.parse(club.createdAt);
            if (!Number.isFinite(createdAt)) {
              return true;
            }
            return now - createdAt <= recencyToHours[recency] * 60 * 60 * 1000;
          });

    const byCategory =
      category === "all"
        ? byRecency
        : byRecency.filter((club) => club.category === category);

    const byProximity =
      proximity === "all"
        ? byCategory
        : byCategory.filter((club) =>
            proximity === "remote" ? club.isRemote : !club.isRemote
          );

    const sorter =
      sortBy === "members"
        ? compareMembers
        : sortBy === "distance"
          ? compareDistance
          : compareRecency;

    return [...byProximity].sort(sorter);
  }, [category, clubs, normalizedSearchQuery, proximity, recency, sortBy]);

  const trendingPool = useMemo(
    () => [...filteredClubs].sort(compareMembers).slice(0, 6),
    [filteredClubs]
  );

  const visibleTrendingClubs = useMemo(
    () =>
      getWrappedItems(
        trendingPool,
        Math.min(3, trendingPool.length),
        trendingIndex
      ),
    [trendingIndex, trendingPool]
  );

  const trendingIds = useMemo(
    () => new Set(trendingPool.map((club) => club.id)),
    [trendingPool]
  );

  const verifiedClubs = useMemo(() => {
    const remaining = [...filteredClubs]
      .sort(compareMembers)
      .filter((club) => !trendingIds.has(club.id));

    return (remaining.length > 0 ? remaining : filteredClubs).slice(0, 3);
  }, [filteredClubs, trendingIds]);

  const verifiedIds = useMemo(
    () => new Set(verifiedClubs.map((club) => club.id)),
    [verifiedClubs]
  );

  const studentOrgClubs = useMemo(() => {
    const remaining = filteredClubs.filter(
      (club) => !verifiedIds.has(club.id) && !trendingIds.has(club.id)
    );

    if (remaining.length > 0) {
      return remaining;
    }

    const fallback = filteredClubs.filter((club) => !trendingIds.has(club.id));
    return fallback.length > 0 ? fallback : filteredClubs;
  }, [filteredClubs, trendingIds, verifiedIds]);

  const visibleStudentOrgs = useMemo(
    () => (showAllRows ? studentOrgClubs : studentOrgClubs.slice(0, 3)),
    [showAllRows, studentOrgClubs]
  );

  const hasActiveFilters =
    normalizedSearchQuery.length > 0 ||
    recency !== "all" ||
    category !== "all" ||
    proximity !== "all" ||
    sortBy !== "members";

  const handleResetFilters = () => {
    setSearchQuery("");
    setRecency("all");
    setCategory("all");
    setProximity("all");
    setSortBy("members");
    setFilterOpen(false);
  };

  const handleCreateClick = () => {
    if (!isAuthenticated) {
      openAuthModal("signup");
      return;
    }
    setComposerOpen(true);
  };

  const handleDirectoryAction = async (club: Club) => {
    const isOwnClub = club.creator.id === user?.id;

    if (isOwnClub || club.joinedByUser) {
      handleOpenClub(club);
      return;
    }

    await handleJoin(club);
  };

  return (
    <div className="min-h-[calc(100vh-81px)] bg-canvas text-[#1d2530]">
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
          <div className="max-w-[560px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#1456f4]">
              Campus Life
            </p>
            <h1 className="mt-3 font-display text-[2.8rem] font-semibold leading-[0.95] tracking-[-0.08em] text-[#2f363d] sm:text-[4.2rem]">
              Explore Communities
            </h1>
            <p className="mt-5 max-w-[460px] text-[16px] leading-8 text-[#616975] sm:text-[18px]">
              Connect with like-minded students and shape your university legacy.
            </p>
          </div>

          <div className="w-full lg:justify-self-end">
            <div className="flex items-center gap-3">
              <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-full border border-[#e5e8ee] bg-white px-5 shadow-[0_12px_30px_rgba(30,40,60,0.05)]">
                <Search className="h-4 w-4 text-[#7b8491]" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search groups..."
                  className="w-full bg-transparent text-[14px] text-[#2c3440] placeholder:text-[#7f8792] focus:outline-none"
                />
              </label>
              <button
                type="button"
                aria-label="Toggle filters"
                className={`flex h-14 w-14 items-center justify-center rounded-full border transition ${
                  isFilterOpen || hasActiveFilters
                    ? "border-[#dbe5ff] bg-[#1456f4] text-white shadow-[0_14px_28px_rgba(20,86,244,0.18)]"
                    : "border-[#e5e8ee] bg-white text-[#515a68] shadow-[0_12px_30px_rgba(30,40,60,0.05)]"
                }`}
                onClick={() => setFilterOpen((prev) => !prev)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>

            {isFilterOpen && (
              <div className="mt-4 rounded-[30px] border border-[#e5e8ee] bg-white/95 p-5 shadow-[0_26px_60px_rgba(18,25,38,0.08)] backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b93a0]">
                      Filter feed
                    </p>
                    <p className="mt-1 text-[14px] text-[#4f5763]">
                      Refine communities by category, time, and access.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e8ee] text-[#717b88] transition hover:bg-[#f7f9fc]"
                    onClick={() => setFilterOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 space-y-5">
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b93a0]">
                      Recency
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {recencyOptions.map((option) => (
                        <FilterChip
                          key={option.value}
                          isActive={recency === option.value}
                          onClick={() => setRecency(option.value)}
                        >
                          {option.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b93a0]">
                      Category
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {categoryOptions.map((option) => (
                        <FilterChip
                          key={option.value}
                          isActive={category === option.value}
                          onClick={() => setCategory(option.value)}
                        >
                          {option.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b93a0]">
                      Proximity
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {proximityOptions.map((option) => (
                        <FilterChip
                          key={option.value}
                          isActive={proximity === option.value}
                          onClick={() => setProximity(option.value)}
                        >
                          {option.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8b93a0]">
                      Sort by
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {sortOptions.map((option) => (
                        <FilterChip
                          key={option.value}
                          isActive={sortBy === option.value}
                          onClick={() => setSortBy(option.value)}
                        >
                          {option.label}
                        </FilterChip>
                      ))}
                    </div>
                  </div>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    className="mt-5 text-[13px] font-semibold text-[#1456f4] transition hover:text-[#0f49e2]"
                    onClick={handleResetFilters}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="mt-8 rounded-[28px] border border-[#ffd9d9] bg-[#fff7f7] px-5 py-4 text-[14px] font-medium text-[#bf4545]">
            {error}
          </div>
        )}

        {!isLoading && filteredClubs.length === 0 ? (
          <section className="mt-10 rounded-[36px] border border-[#e6e9ef] bg-white px-6 py-12 text-center shadow-[0_24px_60px_rgba(22,30,45,0.06)] sm:px-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1456f4]">
              No communities
            </p>
            <h2 className="mt-3 font-display text-[2rem] font-semibold tracking-[-0.06em] text-[#2f363d]">
              Nothing matches those filters yet
            </h2>
            <p className="mx-auto mt-4 max-w-[520px] text-[15px] leading-7 text-[#646d79]">
              Reset the filters or start the first group so your campus directory
              does not stay empty.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[14px] font-semibold text-white shadow-[0_16px_28px_rgba(20,86,244,0.2)] transition hover:bg-[#0f49e2]"
                onClick={handleCreateClick}
              >
                Create a group
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[#dfe5ee] bg-white px-6 text-[14px] font-semibold text-[#4f5763] transition hover:border-[#d4dbe7]"
                  onClick={handleResetFilters}
                >
                  Clear filters
                </button>
              )}
            </div>
          </section>
        ) : (
          <div className="mt-14 space-y-16">
            <section className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-[1.8rem] font-semibold tracking-[-0.05em] text-[#303842]">
                    Trending Clubs
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous clubs"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e3e7ed] bg-white text-[#4c5562] shadow-[0_10px_24px_rgba(24,32,47,0.05)] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => setTrendingIndex((prev) => prev - 1)}
                    disabled={trendingPool.length <= 3}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next clubs"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-[#e3e7ed] bg-white text-[#4c5562] shadow-[0_10px_24px_rgba(24,32,47,0.05)] transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => setTrendingIndex((prev) => prev + 1)}
                    disabled={trendingPool.length <= 3}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="grid gap-5 lg:grid-cols-3">
                  {[0, 1, 2].map((item) => (
                    <SectionSkeleton key={item} tall />
                  ))}
                </div>
              ) : (
                <div className="grid gap-5 lg:grid-cols-3">
                  {visibleTrendingClubs.map((club) => {
                    const theme = categoryThemes[club.category];
                    const ThemeIcon = theme.icon;

                    return (
                      <article
                        key={club.id}
                        className="group relative min-h-[390px] overflow-hidden rounded-[34px] bg-[#08101b] p-5 text-white shadow-[0_30px_70px_rgba(14,19,30,0.2)]"
                        style={getClubBackgroundStyle(club)}
                      >
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,16,0.04)_0%,rgba(7,10,16,0.26)_34%,rgba(7,10,16,0.9)_100%)]" />
                        <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(255,255,255,0.04)_0%,transparent_100%)]" />
                        <div className="relative flex h-full flex-col justify-between">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-[#2457ff] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                                {theme.badge}
                              </span>
                              <span className="text-[12px] font-medium text-white/76">
                                {formatMembersLabel(club.memberCount)}
                              </span>
                            </div>
                            <div
                              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/8 backdrop-blur"
                              style={{ color: theme.accent }}
                            >
                              <ThemeIcon className="h-5 w-5" />
                            </div>
                          </div>

                          <div>
                            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-white/55">
                              {getLocationLabel(club)}
                            </p>
                            <h3 className="mt-3 font-display text-[2rem] font-semibold leading-[1.02] tracking-[-0.06em] text-white">
                              {club.title}
                            </h3>
                            <p className="mt-4 max-w-[90%] text-[14px] leading-6 text-white/76">
                              {club.description}
                            </p>
                            <button
                              type="button"
                              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-5 text-[14px] font-semibold text-[#212833] transition hover:translate-y-[-1px]"
                              onClick={() => handleOpenClub(club)}
                            >
                              {theme.cta}
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-5">
              <h2 className="font-display text-[1.8rem] font-semibold tracking-[-0.05em] text-[#303842]">
                Verified University Orgs
              </h2>

              {isLoading ? (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {[0, 1, 2].map((item) => (
                    <SectionSkeleton key={item} />
                  ))}
                </div>
              ) : (
                <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {verifiedClubs.map((club) => {
                    const theme = categoryThemes[club.category];
                    const ThemeIcon = theme.icon;
                    const isOwnClub = club.creator.id === user?.id;
                    const isJoining = joiningIds.has(club.id);
                    const buttonLabel = getJoinButtonLabel({
                      club,
                      isOwnClub,
                      isJoining,
                    });

                    return (
                      <article
                        key={club.id}
                        className="group cursor-pointer rounded-[32px] border border-[#e5e8ee] bg-white p-6 shadow-[0_22px_54px_rgba(19,28,41,0.05)] transition hover:-translate-y-0.5"
                        onClick={() => handleOpenClub(club)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleOpenClub(club);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div
                            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f6ff]"
                            style={{ color: theme.accent }}
                          >
                            <ThemeIcon className="h-6 w-6" />
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#d8d3ff] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#554cc7]">
                            <CheckCircle2 className="h-3 w-3" />
                            Official
                          </span>
                        </div>

                        <h3 className="mt-7 font-display text-[1.8rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[#2e3640]">
                          {club.title}
                        </h3>
                        <p className="mt-4 text-[14px] leading-6 text-[#68717d]">
                          {club.description}
                        </p>

                        <div className="mt-8 flex items-center justify-between gap-4">
                          <div className="flex items-center">
                            {getSupportingNames(club).map((name, index) => (
                              <div
                                key={`${club.id}-${name}`}
                                className={index === 0 ? "" : "-ml-2"}
                              >
                                <Avatar
                                  name={name}
                                  size={28}
                                  className="border-2 border-white text-[11px] shadow-[0_8px_18px_rgba(23,34,51,0.12)]"
                                />
                              </div>
                            ))}
                            <span className="-ml-2 inline-flex h-7 min-w-[34px] items-center justify-center rounded-full border-2 border-white bg-[#f2f3f5] px-2 text-[11px] font-semibold text-[#616a77]">
                              +{Math.max(1, club.memberCount - 3)}
                            </span>
                          </div>

                          <button
                            type="button"
                            className={`inline-flex h-12 items-center justify-center rounded-full px-5 text-[13px] font-semibold transition ${getJoinButtonClasses(
                              {
                                club,
                                isOwnClub,
                              }
                            )}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDirectoryAction(club);
                            }}
                            disabled={
                              isJoining ||
                              (club.joinPolicy === "application" &&
                                club.applicationStatus === "pending")
                            }
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-[1.8rem] font-semibold tracking-[-0.05em] text-[#303842]">
                  Student Organizations
                </h2>
                {studentOrgClubs.length > 3 && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#1456f4] transition hover:text-[#0f49e2]"
                    onClick={() => setShowAllRows((prev) => !prev)}
                  >
                    {showAllRows ? "Show less" : "View All"}
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>

              {isLoading ? (
                <div className="space-y-4">
                  {[0, 1, 2].map((item) => (
                    <div
                      key={item}
                      className="h-[92px] animate-pulse rounded-full border border-[#e7ebf1] bg-white/80"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {visibleStudentOrgs.map((club) => {
                    const theme = categoryThemes[club.category];
                    const ThemeIcon = theme.icon;
                    const isOwnClub = club.creator.id === user?.id;
                    const isJoining = joiningIds.has(club.id);
                    const buttonLabel = getJoinButtonLabel({
                      club,
                      isOwnClub,
                      isJoining,
                    });

                    return (
                      <article
                        key={club.id}
                        className="group flex cursor-pointer flex-col gap-4 rounded-[999px] border border-[#e5e8ee] bg-white px-5 py-4 shadow-[0_16px_40px_rgba(20,30,44,0.05)] transition hover:-translate-y-0.5 sm:flex-row sm:items-center sm:justify-between"
                        onClick={() => handleOpenClub(club)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleOpenClub(club);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <div
                            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#f3f6ff]"
                            style={{ color: theme.accent }}
                          >
                            <ThemeIcon className="h-5 w-5" />
                          </div>

                          <div className="min-w-0">
                            <h3 className="truncate font-display text-[1.4rem] font-semibold tracking-[-0.05em] text-[#2f3740]">
                              {club.title}
                            </h3>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#727c88]">
                              <span className="inline-flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                {formatMembersLabel(club.memberCount)}
                              </span>
                              <span className="hidden h-1 w-1 rounded-full bg-[#cbd2dd] sm:block" />
                              <span>{getLocationLabel(club)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 sm:pl-4">
                          <span className="hidden text-[12px] text-[#727c88] lg:inline">
                            {getRowMeta(club)}
                          </span>
                          <button
                            type="button"
                            className={`inline-flex h-12 min-w-[132px] items-center justify-center rounded-full px-5 text-[13px] font-semibold transition ${getJoinButtonClasses(
                              {
                                club,
                                isOwnClub,
                              }
                            )}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDirectoryAction(club);
                            }}
                            disabled={
                              isJoining ||
                              (club.joinPolicy === "application" &&
                                club.applicationStatus === "pending")
                            }
                          >
                            {buttonLabel}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      <button
        type="button"
        aria-label="Create a group"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#1456f4] text-white shadow-[0_22px_42px_rgba(20,86,244,0.3)] transition hover:scale-[1.03] hover:bg-[#0f49e2]"
        onClick={handleCreateClick}
      >
        <Plus className="h-6 w-6" />
      </button>

      {isComposerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-center justify-center px-4 py-8">
            <div
              className="absolute inset-0 bg-[#0f1523]/45 backdrop-blur-sm"
              onClick={() => setComposerOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-2xl">
              <div className="flex items-center justify-between rounded-t-[28px] border border-[#e5e8ee] bg-white px-5 py-4 md:px-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1456f4]">
                    Groups
                  </p>
                  <h2 className="mt-1 font-display text-[1.9rem] font-semibold tracking-[-0.05em] text-[#2f363d]">
                    Create a community
                  </h2>
                </div>
                <button
                  type="button"
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e8ee] text-[#6a7380] transition hover:bg-[#f7f9fc]"
                  onClick={() => setComposerOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="rounded-b-[28px] border border-t-0 border-[#e5e8ee] bg-white shadow-[0_40px_100px_rgba(15,21,35,0.18)]">
                <ClubComposer
                  onSubmit={handleCreateClub}
                  isSaving={isPosting}
                  disabled={!isAuthenticated}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
