"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Globe,
  Gamepad2,
  Heart,
  Landmark,
  MapPin,
  Palette,
  Plus,
  Rocket,
  Search,
  SlidersHorizontal,
  Wifi,
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

const modalSectionLabelClasses =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8b93a0]";

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

const getLocationLabel = (club: Club) => {
  if (club.isRemote) {
    return "Remote";
  }

  if (club.city) {
    return `${club.city} campus`;
  }

  return club.location;
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
  const [draftRecency, setDraftRecency] = useState<ClubRecencyFilter>("all");
  const [draftCategory, setDraftCategory] = useState<ClubCategoryFilter>("all");
  const [draftProximity, setDraftProximity] =
    useState<ClubProximityFilter>("all");
  const [draftSortBy, setDraftSortBy] = useState<ClubSortOption>("members");
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set());
  const [trendingIndex, setTrendingIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousHtmlBackground = document.documentElement.style.background;
    const previousHtmlBackgroundColor =
      document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.background;
    const previousBodyBackgroundColor = document.body.style.backgroundColor;

    document.documentElement.style.background = "#ffffff";
    document.documentElement.style.backgroundColor = "#ffffff";
    document.body.style.background = "#ffffff";
    document.body.style.backgroundColor = "#ffffff";

    return () => {
      document.documentElement.style.background = previousHtmlBackground;
      document.documentElement.style.backgroundColor =
        previousHtmlBackgroundColor;
      document.body.style.background = previousBodyBackground;
      document.body.style.backgroundColor = previousBodyBackgroundColor;
    };
  }, []);

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

  const hasSearchQuery = normalizedSearchQuery.length > 0;

  const hasAppliedFilters =
    recency !== "all" ||
    category !== "all" ||
    proximity !== "all" ||
    sortBy !== "members";

  const hasActiveFilters = hasSearchQuery || hasAppliedFilters;

  const openFilterModal = () => {
    setDraftRecency(recency);
    setDraftCategory(category);
    setDraftProximity(proximity);
    setDraftSortBy(sortBy);
    setFilterOpen(true);
  };

  const closeFilterModal = () => {
    setFilterOpen(false);
  };

  const handleApplyFilters = () => {
    setRecency(draftRecency);
    setCategory(draftCategory);
    setProximity(draftProximity);
    setSortBy(draftSortBy);
    setFilterOpen(false);
  };

  const handleResetDraftFilters = () => {
    setDraftRecency("all");
    setDraftCategory("all");
    setDraftProximity("all");
    setDraftSortBy("members");
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setRecency("all");
    setCategory("all");
    setProximity("all");
    setSortBy("members");
    handleResetDraftFilters();
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
    <div className="min-h-[calc(100vh-81px)] bg-white text-[#1d2530]">
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
                  isFilterOpen || hasAppliedFilters
                    ? "border-[#dbe5ff] bg-[#1456f4] text-white shadow-[0_14px_28px_rgba(20,86,244,0.18)]"
                    : "border-[#e5e8ee] bg-white text-[#515a68] shadow-[0_12px_30px_rgba(30,40,60,0.05)]"
                }`}
                onClick={openFilterModal}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
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
          <section className="mt-14 space-y-5">
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
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((item) => (
                  <SectionSkeleton key={item} />
                ))}
              </div>
            ) : (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {visibleTrendingClubs.map((club) => {
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
                          Featured
                        </span>
                      </div>

                      <h3 className="mt-7 font-display text-[1.8rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[#2e3640]">
                        {club.title}
                      </h3>
                      <p className="mt-4 text-[14px] leading-6 text-[#68717d]">
                        {club.description}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[#727c88]">
                        <span>{formatMembersLabel(club.memberCount)}</span>
                        <span className="h-1 w-1 rounded-full bg-[#cbd2dd]" />
                        <span>{getLocationLabel(club)}</span>
                      </div>

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
        )}
      </div>

      {isFilterOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[85] flex items-center justify-center px-4 py-8">
            <div
              className="absolute inset-0 bg-[rgba(245,247,251,0.45)] backdrop-blur-[8px]"
              onClick={closeFilterModal}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Filter Feed"
              className="relative z-10 w-full max-w-[370px] rounded-[30px] border border-white/80 bg-white px-5 py-4 shadow-[0_30px_90px_rgba(21,29,44,0.16)] sm:px-6 sm:py-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-[1.75rem] font-semibold tracking-[-0.05em] text-[#2f363d]">
                    Filter Feed
                  </h2>
                  <p className="mt-1 text-[12px] leading-5 text-[#8b93a0]">
                    Refine your community discovery
                  </p>
                </div>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-[#6f7782] transition hover:bg-[#f4f7fb]"
                  onClick={closeFilterModal}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 space-y-6">
                <div className="space-y-3">
                  <p className={modalSectionLabelClasses}>Recency</p>
                  <div className="flex flex-wrap gap-2">
                    {recencyOptions.map((option) => (
                      <FilterChip
                        key={option.value}
                        isActive={draftRecency === option.value}
                        onClick={() => setDraftRecency(option.value)}
                      >
                        {option.label}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className={modalSectionLabelClasses}>Category</p>
                  <div className="flex flex-wrap gap-2">
                    {categoryOptions.map((option) => (
                      <FilterChip
                        key={option.value}
                        isActive={draftCategory === option.value}
                        onClick={() => setDraftCategory(option.value)}
                      >
                        {option.label}
                      </FilterChip>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className={modalSectionLabelClasses}>Proximity</p>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Everywhere", value: "all" as const, icon: Globe },
                      { label: "Nearby", value: "nearby" as const, icon: MapPin },
                      { label: "Remote", value: "remote" as const, icon: Wifi },
                    ].map(({ label, value, icon: Icon }) => {
                      const isActive = draftProximity === value;

                      return (
                        <button
                          key={value}
                          type="button"
                          className={`flex min-h-[66px] flex-col items-center justify-center rounded-[18px] border px-2 py-3 text-[11px] font-semibold transition ${
                            isActive
                              ? "border-[#3f6fff] bg-[#eef4ff] text-[#1456f4] shadow-[inset_0_0_0_1px_rgba(20,86,244,0.18)]"
                              : "border-transparent bg-[#f3f4f6] text-[#5a6270] hover:bg-[#eceef2]"
                          }`}
                          onClick={() => setDraftProximity(value)}
                        >
                          <Icon className="mb-1.5 h-4 w-4" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className={modalSectionLabelClasses}>Sort By</p>
                  <div className="space-y-2">
                    {sortOptions.map((option) => {
                      const isActive = draftSortBy === option.value;

                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`flex w-full items-center justify-between rounded-full border px-4 py-3 text-[12px] font-semibold transition ${
                            isActive
                              ? "border-[#cfe0ff] bg-[#eef4ff] text-[#1456f4]"
                              : "border-[#edf0f4] bg-[#f8f9fb] text-[#5b6471] hover:bg-white"
                          }`}
                          onClick={() => setDraftSortBy(option.value)}
                        >
                          <span>{option.label}</span>
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                              isActive
                                ? "border-[#1456f4]"
                                : "border-[#c9d0da] bg-white"
                            }`}
                          >
                            {isActive && (
                              <span className="h-2 w-2 rounded-full bg-[#1456f4]" />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-7 flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-[#e4e8ef] bg-white text-[13px] font-semibold text-[#4f5763] transition hover:border-[#d7dde7]"
                  onClick={handleResetDraftFilters}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="inline-flex h-12 flex-[1.55] items-center justify-center rounded-full bg-[#1456f4] px-5 text-[13px] font-semibold text-white shadow-[0_16px_30px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
                  onClick={handleApplyFilters}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

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
