import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createClub, getClub, getClubs, joinClub, leaveClub } from "../../api/actions";
import { formatError, isAuthError } from "../../lib/errors";
import type { SessionProps } from "../../types/session";

type ClubCategory = "social" | "study" | "build" | "sports" | "creative" | "wellness";
type ClubJoinPolicy = "open" | "application";
type ClubApplicationStatus = "pending" | "approved" | "denied" | null;
type ClubRecencyFilter = "all" | "24h" | "168h";
type ClubCategoryFilter = "all" | ClubCategory;
type ClubSortOption = "recency" | "members" | "distance";
type ClubProximityFilter = "all" | "nearby" | "remote";

type GroupSummary = {
  id: string;
  title: string;
  description: string;
  category: ClubCategory;
  location: string;
  city: string | null;
  isRemote: boolean;
  joinPolicy: ClubJoinPolicy;
  imageUrl: string | null;
  isOfficial: boolean;
  createdAt: string;
  memberCount: number;
  joinedByUser: boolean;
  applicationStatus: ClubApplicationStatus;
  distanceKm: number | null;
  creator: {
    id: string;
    name: string;
    handle: string;
  };
};

type LeaderProfile = {
  id: string;
  name: string;
  role: string;
  summary: string;
};

type GroupEvent = {
  id: string;
  title: string;
  startsAt: Date;
  location: string;
  details: string;
};

const RECENCY_TO_HOURS: Record<Exclude<ClubRecencyFilter, "all">, number> = {
  "24h": 24,
  "168h": 168,
};

const groupCategories: ClubCategory[] = [
  "social",
  "study",
  "build",
  "sports",
  "creative",
  "wellness",
];

const categoryOptions: Array<{ label: string; value: ClubCategory }> = [
  { label: "Social", value: "social" },
  { label: "Study", value: "study" },
  { label: "Build", value: "build" },
  { label: "Sports", value: "sports" },
  { label: "Creative", value: "creative" },
  { label: "Wellness", value: "wellness" },
];

const recencyOptions: Array<{ label: string; value: ClubRecencyFilter }> = [
  { label: "All time", value: "all" },
  { label: "Today", value: "24h" },
  { label: "This week", value: "168h" },
];

const proximityOptions: Array<{ label: string; value: ClubProximityFilter }> = [
  { label: "All", value: "all" },
  { label: "Nearby", value: "nearby" },
  { label: "Remote", value: "remote" },
];

const sortOptions: Array<{ label: string; value: ClubSortOption }> = [
  { label: "Most members", value: "members" },
  { label: "Newest", value: "recency" },
  { label: "Closest", value: "distance" },
];

const MOBILE_VERIFIED_FALLBACK: GroupSummary = {
  id: "mobile-official-chess-clug",
  title: "Chess Clug",
  description: "Official campus chess community for weekly meetups, casual games, and skill sprints.",
  category: "study",
  location: "Memorial Union",
  city: "Campus",
  isRemote: false,
  joinPolicy: "application",
  imageUrl: null,
  isOfficial: true,
  createdAt: new Date("2026-03-01T12:00:00.000Z").toISOString(),
  memberCount: 12,
  joinedByUser: false,
  applicationStatus: null,
  distanceKm: 0.4,
  creator: {
    id: "mobile-official-owner",
    name: "Kunal Singh",
    handle: "@kunal",
  },
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "G";

const getCategoryLabel = (category: ClubCategory) =>
  categoryOptions.find((option) => option.value === category)?.label ?? category;

const formatRelativeTime = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "just now";
  }

  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatEventDate = (value: Date) =>
  value
    .toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
    .toUpperCase();

const formatEventMeta = (value: Date) =>
  value.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatCompactEventDate = (value: Date) =>
  value.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

const getEstablishedYear = (value: string) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.getFullYear() : new Date().getFullYear();
};

const getLocationLabel = (group: GroupSummary) => {
  if (group.isRemote) {
    return "Remote";
  }
  return group.city ? `${group.city} • ${group.location}` : group.location;
};

const getDistanceLabel = (group: GroupSummary) =>
  Number.isFinite(group.distanceKm ?? Number.NaN) && !group.isRemote
    ? `${(group.distanceKm as number).toFixed(1)} km away`
    : null;

const getMembershipLabel = (group: GroupSummary) => {
  if (group.joinedByUser) {
    return "Joined";
  }
  if (group.joinPolicy === "application" && group.applicationStatus === "pending") {
    return "Pending";
  }
  if (group.joinPolicy === "application" && group.applicationStatus === "denied") {
    return "Reapply";
  }
  return group.joinPolicy === "application" ? "Apply" : "Join";
};

const parseGroup = (value: unknown): GroupSummary | null => {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string"
  ) {
    return null;
  }

  const creator = isObject(value.creator) ? value.creator : {};
  const categoryRaw = typeof value.category === "string" ? value.category.toLowerCase() : "social";
  const category = (groupCategories.includes(categoryRaw as ClubCategory)
    ? categoryRaw
    : "social") as ClubCategory;
  const joinPolicy: ClubJoinPolicy = value.joinPolicy === "application" ? "application" : "open";
  const applicationStatus =
    value.applicationStatus === "pending" ||
    value.applicationStatus === "approved" ||
    value.applicationStatus === "denied"
      ? value.applicationStatus
      : null;
  const city = typeof value.city === "string" && value.city.trim().length > 0 ? value.city : null;
  const isRemote = Boolean(value.isRemote);
  const location =
    typeof value.location === "string" && value.location.trim().length > 0
      ? value.location
      : isRemote
        ? "Remote"
        : city ?? "Campus";
  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim().length > 0
      ? value.createdAt
      : new Date().toISOString();
  const imageUrl =
    typeof value.imageUrl === "string" && value.imageUrl.trim().length > 0 ? value.imageUrl : null;

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    category,
    location,
    city,
    isRemote,
    joinPolicy,
    imageUrl,
    isOfficial: Boolean(value.isOfficial),
    createdAt,
    memberCount: toNumber(value.memberCount, 0),
    joinedByUser: Boolean(value.joinedByUser),
    applicationStatus,
    distanceKm: value.distanceKm == null ? null : toNumber(value.distanceKm, Number.NaN),
    creator: {
      id: typeof creator.id === "string" ? creator.id : "",
      name: typeof creator.name === "string" ? creator.name : "Unknown",
      handle: typeof creator.handle === "string" ? creator.handle : "@unknown",
    },
  };
};

const parseGroups = (payload: unknown): GroupSummary[] => {
  const list = Array.isArray(payload)
    ? payload
    : isObject(payload) && Array.isArray(payload.clubs)
      ? payload.clubs
      : [];

  return list.map(parseGroup).filter((item): item is GroupSummary => item !== null);
};

const parseSingleGroup = (payload: unknown): GroupSummary | null => {
  if (isObject(payload) && "club" in payload) {
    return parseGroup(payload.club);
  }
  return parseGroup(payload);
};

const nextWeekdayAt = (reference: Date, weekday: number, hour: number, minute: number) => {
  const result = new Date(reference);
  result.setSeconds(0, 0);
  const offset = (weekday - result.getDay() + 7) % 7;
  result.setDate(result.getDate() + offset);
  result.setHours(hour, minute, 0, 0);
  if (result.getTime() <= reference.getTime()) {
    result.setDate(result.getDate() + 7);
  }
  return result;
};

const buildUpcomingEvents = (group: GroupSummary): GroupEvent[] => {
  const now = new Date();
  const baseLocation = group.isRemote
    ? "Remote • Link shared in group chat"
    : `${group.location}${group.city ? `, ${group.city}` : ""}`;

  return [
    {
      id: `${group.id}-weekly`,
      title: `${group.title} Weekly Meetup`,
      startsAt: nextWeekdayAt(now, 1, 18, 30),
      location: baseLocation,
      details: "Open circle for members, guests, and first-time visitors.",
    },
    {
      id: `${group.id}-sprint`,
      title: `${group.title} Skill Sprint`,
      startsAt: nextWeekdayAt(now, 4, 17, 0),
      location: baseLocation,
      details: "Hands-on workshop led by the current leadership team.",
    },
    {
      id: `${group.id}-hangout`,
      title: `${group.title} Weekend Hangout`,
      startsAt: nextWeekdayAt(now, 6, 11, 0),
      location: group.isRemote ? "Remote lounge" : `${group.city ?? "Campus"} commons`,
      details: "Low-pressure social time for regulars and new members.",
    },
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
};

const buildLeadership = (group: GroupSummary): LeaderProfile[] => [
  {
    id: `${group.id}-owner`,
    name: group.creator.name,
    role: "President",
    summary: `Guiding ${group.title.toLowerCase()} with a clear vision for culture, cadence, and momentum.`,
  },
  {
    id: `${group.id}-ops`,
    name: group.memberCount > 2 ? "Open Seat 1" : "Open Seat 1",
    role: "Vice President",
    summary: "Coordinating the weekly rhythm of events, member onboarding, and communication.",
  },
  {
    id: `${group.id}-treasury`,
    name: group.memberCount > 3 ? "Open Seat 2" : "Open Seat 2",
    role: "Treasurer",
    summary: "Keeping the organization sustainable while supporting programming and growth.",
  },
  {
    id: `${group.id}-outreach`,
    name: group.memberCount > 4 ? "Open Seat 3" : "Open Seat 3",
    role: "Outreach Head",
    summary: "Expanding the group's reach through partnerships, campus visibility, and recruiting.",
  },
];

const buildMemberTokens = (group: GroupSummary) => {
  const tokens = [
    getInitials(group.creator.name).slice(0, 1),
    getInitials(group.title).slice(0, 1),
    getCategoryLabel(group.category).slice(0, 1).toUpperCase(),
  ];
  const extraCount = Math.max(0, group.memberCount - tokens.length);
  return { tokens, extraCount };
};

const updateGroupList = (groups: GroupSummary[], nextGroup: GroupSummary) => {
  const existingIndex = groups.findIndex((item) => item.id === nextGroup.id);
  if (existingIndex === -1) {
    return [nextGroup, ...groups];
  }
  return groups.map((item) => (item.id === nextGroup.id ? nextGroup : item));
};

export const GroupsTab = ({ token, user, onAuthExpired }: SessionProps) => {
  const insets = useSafeAreaInsets();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<GroupSummary | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [joiningIds, setJoiningIds] = useState<Set<string>>(new Set());

  const [query, setQuery] = useState("");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [recency, setRecency] = useState<ClubRecencyFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<ClubCategoryFilter>("all");
  const [proximity, setProximity] = useState<ClubProximityFilter>("all");
  const [sortBy, setSortBy] = useState<ClubSortOption>("members");

  const [composerOpen, setComposerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ClubCategory>("social");
  const [city, setCity] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [isRemote, setIsRemote] = useState(false);
  const [joinPolicy, setJoinPolicy] = useState<ClubJoinPolicy>("open");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setScreenError(null);
    try {
      const payload = await getClubs(token);
      setGroups(parseGroups(payload));
    } catch (loadError) {
      if (isAuthError(loadError)) {
        onAuthExpired();
        return;
      }
      setScreenError(formatError(loadError));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [onAuthExpired, token]);

  const loadSelectedGroup = useCallback(
    async (groupId: string) => {
      setDetailLoading(true);
      setScreenError(null);
      try {
        const payload = await getClub(groupId, token);
        const parsed = parseSingleGroup(payload);
        if (parsed) {
          setSelectedGroup(parsed);
          setGroups((prev) => updateGroupList(prev, parsed));
        }
      } catch (loadError) {
        if (isAuthError(loadError)) {
          onAuthExpired();
          return;
        }
        setScreenError(formatError(loadError));
      } finally {
        setDetailLoading(false);
      }
    },
    [onAuthExpired, token]
  );

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (!selectedGroupId) {
      setSelectedGroup(null);
      return;
    }
    void loadSelectedGroup(selectedGroupId);
  }, [loadSelectedGroup, selectedGroupId]);

  const resetComposer = useCallback(() => {
    setTitle("");
    setDescription("");
    setCategory("social");
    setCity("");
    setImageUrl("");
    setIsRemote(false);
    setJoinPolicy("open");
    setComposerError(null);
    setCreating(false);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    resetComposer();
  }, [resetComposer]);

  const visibleGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const now = Date.now();
    const filteredByQuery = normalizedQuery
      ? groups.filter((group) =>
          `${group.title} ${group.description} ${group.location} ${group.city ?? ""}`
            .toLowerCase()
            .includes(normalizedQuery)
        )
      : groups;

    const byRecency =
      recency === "all"
        ? filteredByQuery
        : filteredByQuery.filter((group) => {
            const createdAt = Date.parse(group.createdAt);
            if (!Number.isFinite(createdAt)) {
              return true;
            }
            return now - createdAt <= RECENCY_TO_HOURS[recency] * 60 * 60 * 1000;
          });

    const byCategory =
      categoryFilter === "all"
        ? byRecency
        : byRecency.filter((group) => group.category === categoryFilter);

    const byProximity =
      proximity === "all"
        ? byCategory
        : byCategory.filter((group) => (proximity === "remote" ? group.isRemote : !group.isRemote));

    const byRecencySort = (a: GroupSummary, b: GroupSummary) =>
      Date.parse(b.createdAt) - Date.parse(a.createdAt);
    const byMembersSort = (a: GroupSummary, b: GroupSummary) =>
      b.memberCount !== a.memberCount ? b.memberCount - a.memberCount : byRecencySort(a, b);
    const byDistanceSort = (a: GroupSummary, b: GroupSummary) => {
      const distanceA = Number.isFinite(a.distanceKm ?? Number.NaN)
        ? (a.distanceKm as number)
        : Number.POSITIVE_INFINITY;
      const distanceB = Number.isFinite(b.distanceKm ?? Number.NaN)
        ? (b.distanceKm as number)
        : Number.POSITIVE_INFINITY;
      return distanceA !== distanceB ? distanceA - distanceB : byRecencySort(a, b);
    };

    const sorter =
      sortBy === "members" ? byMembersSort : sortBy === "distance" ? byDistanceSort : byRecencySort;
    return [...byProximity].sort(sorter);
  }, [categoryFilter, groups, proximity, query, recency, sortBy]);

  const trendingGroups = useMemo(() => visibleGroups.slice(0, 4), [visibleGroups]);

  const verifiedGroups = useMemo(
    () => visibleGroups.filter((group) => group.isOfficial),
    [visibleGroups]
  );

  const effectiveVerifiedGroups = useMemo(
    () => (verifiedGroups.length > 0 ? verifiedGroups : [MOBILE_VERIFIED_FALLBACK]),
    [verifiedGroups]
  );

  const studentGroups = useMemo(() => visibleGroups, [visibleGroups]);

  const detailLeadership = useMemo(
    () => (selectedGroup ? buildLeadership(selectedGroup) : []),
    [selectedGroup]
  );
  const detailEvents = useMemo(
    () => (selectedGroup ? buildUpcomingEvents(selectedGroup) : []),
    [selectedGroup]
  );

  const applyUpdatedGroup = useCallback((nextGroup: GroupSummary) => {
    setGroups((prev) => updateGroupList(prev, nextGroup));
    setSelectedGroup((prev) => (prev?.id === nextGroup.id ? nextGroup : prev));
  }, []);

  const handleOpenGroup = useCallback((group: GroupSummary) => {
    setSelectedGroupId(group.id);
    setSelectedGroup(group);
    setScreenError(null);
  }, []);

  const handleBackToGroups = useCallback(() => {
    setSelectedGroupId(null);
    setSelectedGroup(null);
    setScreenError(null);
  }, []);

  const handleMembershipToggle = useCallback(
    async (group: GroupSummary) => {
      const isPending =
        group.joinPolicy === "application" &&
        group.applicationStatus === "pending" &&
        !group.joinedByUser;
      if (isPending) {
        return;
      }

      setJoiningIds((prev) => new Set(prev).add(group.id));
      setScreenError(null);
      try {
        if (group.joinedByUser) {
          await leaveClub(group.id, token);
        } else {
          await joinClub(group.id, token);
        }

        const payload = await getClub(group.id, token);
        const parsed = parseSingleGroup(payload);
        if (parsed) {
          applyUpdatedGroup(parsed);
        }
      } catch (membershipError) {
        if (isAuthError(membershipError)) {
          onAuthExpired();
          return;
        }
        setScreenError(formatError(membershipError));
      } finally {
        setJoiningIds((prev) => {
          const next = new Set(prev);
          next.delete(group.id);
          return next;
        });
      }
    },
    [applyUpdatedGroup, onAuthExpired, token]
  );

  const handleCreateGroup = useCallback(async () => {
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    const normalizedCity = city.trim();
    const normalizedImageUrl = imageUrl.trim();

    if (!normalizedTitle || !normalizedDescription || (!isRemote && !normalizedCity)) {
      setComposerError("Add a group name, description, and a city or mark it remote.");
      return;
    }

    setCreating(true);
    setComposerError(null);

    try {
      const response = await createClub(
        {
          title: normalizedTitle,
          description: normalizedDescription,
          category,
          city: isRemote ? null : normalizedCity,
          location: isRemote ? "Remote" : normalizedCity,
          isRemote,
          joinPolicy,
          imageUrl: normalizedImageUrl || undefined,
        },
        token
      );

      const created = parseSingleGroup(response);
      if (created) {
        applyUpdatedGroup(created);
        setSelectedGroupId(created.id);
        setSelectedGroup(created);
      } else {
        await loadGroups();
      }
      closeComposer();
    } catch (submitError) {
      if (isAuthError(submitError)) {
        onAuthExpired();
        return;
      }
      setComposerError(formatError(submitError));
    } finally {
      setCreating(false);
    }
  }, [
    applyUpdatedGroup,
    category,
    city,
    closeComposer,
    description,
    imageUrl,
    isRemote,
    joinPolicy,
    loadGroups,
    onAuthExpired,
    title,
    token,
  ]);

  const renderAvatarStack = (group: GroupSummary) => {
    const { tokens, extraCount } = buildMemberTokens(group);
    return (
      <View style={groupStyles.avatarStack}>
        {tokens.map((tokenValue, index) => (
          <View
            key={`${group.id}-token-${tokenValue}-${index}`}
            style={[
              groupStyles.avatarBubble,
              index === 1 ? groupStyles.avatarBubbleAlt : null,
              index === 2 ? groupStyles.avatarBubbleAlt2 : null,
              { marginLeft: index === 0 ? 0 : -10 },
            ]}
          >
            <Text style={groupStyles.avatarBubbleText}>{tokenValue}</Text>
          </View>
        ))}
        {extraCount > 0 ? (
          <View style={[groupStyles.avatarBubble, groupStyles.avatarBubbleExtra, { marginLeft: -10 }]}>
            <Text style={groupStyles.avatarBubbleExtraText}>+{extraCount}</Text>
          </View>
        ) : null}
      </View>
    );
  };

  if (selectedGroup) {
    const membershipLabel = getMembershipLabel(selectedGroup);
    const isOwnGroup = selectedGroup.creator.id === user.id;
    const isPending =
      selectedGroup.joinPolicy === "application" &&
      selectedGroup.applicationStatus === "pending" &&
      !selectedGroup.joinedByUser;
    const nextMoveEvents = detailEvents.slice(0, 3);
    const recentLogs = detailEvents.slice(0, 2);

    return (
      <ScrollView
        style={groupStyles.screen}
        contentContainerStyle={[
          groupStyles.detailContainer,
          { paddingTop: 12, paddingBottom: insets.bottom + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={groupStyles.detailTopBar}>
          <Pressable style={groupStyles.backButton} onPress={handleBackToGroups}>
            <Ionicons name="chevron-back" size={18} color="#1f2937" />
          </Pressable>
          <Text style={groupStyles.detailTopLabel}>Group</Text>
          <View style={groupStyles.backButtonSpacer} />
        </View>

        {screenError ? (
          <View style={groupStyles.errorBanner}>
            <Text style={groupStyles.errorBannerText}>{screenError}</Text>
          </View>
        ) : null}

        {detailLoading ? <ActivityIndicator color="#2563eb" /> : null}

        <View style={groupStyles.detailHero}>
          <View style={groupStyles.detailHeroContent}>
            <View style={groupStyles.eyebrowPill}>
              <Text style={groupStyles.eyebrowPillText}>
                ESTABLISHED {getEstablishedYear(selectedGroup.createdAt)}
              </Text>
            </View>
            <Text style={groupStyles.detailTitle}>{selectedGroup.title}</Text>
            <Text style={groupStyles.detailSubtitle}>{selectedGroup.description}</Text>

            <View style={groupStyles.detailActionsRow}>
              {renderAvatarStack(selectedGroup)}
              {!isOwnGroup ? (
                <Pressable
                  style={[
                    groupStyles.primaryOutlineButton,
                    selectedGroup.joinedByUser ? groupStyles.leaveButton : null,
                  ]}
                  disabled={joiningIds.has(selectedGroup.id) || isPending}
                  onPress={() => {
                    void handleMembershipToggle(selectedGroup);
                  }}
                >
                  <Text
                    style={[
                      groupStyles.primaryOutlineButtonText,
                      selectedGroup.joinedByUser ? groupStyles.leaveButtonText : null,
                    ]}
                  >
                    {joiningIds.has(selectedGroup.id)
                      ? "..."
                      : selectedGroup.joinedByUser
                        ? "Leave Club"
                        : membershipLabel}
                  </Text>
                </Pressable>
              ) : (
                <View style={groupStyles.ownerPill}>
                  <Text style={groupStyles.ownerPillText}>Owner</Text>
                </View>
              )}
            </View>
          </View>

          <View style={groupStyles.heroVisualCard}>
            {selectedGroup.imageUrl ? (
              <Image
                source={{ uri: selectedGroup.imageUrl }}
                style={groupStyles.heroVisualImage}
                resizeMode="cover"
              />
            ) : (
              <View style={groupStyles.heroVisualInnerBadge}>
                <Text style={groupStyles.heroVisualInnerBadgeText}>
                  {getInitials(selectedGroup.title)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <Text style={groupStyles.sectionEyebrow}>THE MISSION</Text>
        <View style={groupStyles.missionCard}>
          <Text style={groupStyles.missionHeading}>
            The best communities are built on consistency, warmth, and shared momentum.
          </Text>
          <Text style={groupStyles.missionBody}>
            {selectedGroup.description} Based in {selectedGroup.city ?? selectedGroup.location}, this{" "}
            {getCategoryLabel(selectedGroup.category).toLowerCase()} community brings together{" "}
            {Math.max(selectedGroup.memberCount, 1)}+ members around a shared standard for growth.
          </Text>
          <View style={groupStyles.statsRow}>
            <View style={groupStyles.statBlock}>
              <Text style={groupStyles.statValue}>{Math.max(selectedGroup.memberCount, 1)}+</Text>
              <Text style={groupStyles.statLabel}>Active Members</Text>
            </View>
            <View style={groupStyles.statDivider} />
            <View style={groupStyles.statBlock}>
              <Text style={groupStyles.statValue}>{getEstablishedYear(selectedGroup.createdAt)}</Text>
              <Text style={groupStyles.statLabel}>Established</Text>
            </View>
          </View>
        </View>

        <View style={groupStyles.sectionHeaderRow}>
          <View>
            <Text style={groupStyles.sectionEyebrow}>LEADERSHIP</Text>
            <Text style={groupStyles.sectionTitle}>The Council</Text>
          </View>
          <Text style={groupStyles.sectionLink}>View Full Directory</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={groupStyles.leadershipRow}
        >
          {detailLeadership.map((leader) => (
            <View key={leader.id} style={groupStyles.leaderCard}>
              <View style={groupStyles.leaderAvatar}>
                <Text style={groupStyles.leaderAvatarText}>{getInitials(leader.name).slice(0, 1)}</Text>
              </View>
              <Text style={groupStyles.leaderName}>{leader.name}</Text>
              <Text style={groupStyles.leaderRole}>{leader.role}</Text>
              <Text style={groupStyles.leaderSummary}>{leader.summary}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={groupStyles.logsHeaderRow}>
          <Text style={groupStyles.logsTitle}>Recent Logs</Text>
          <Text style={groupStyles.sectionLink}>View All Posts</Text>
        </View>

        {recentLogs.map((event) => (
          <View key={event.id} style={groupStyles.logCard}>
            <View style={groupStyles.logVisual}>
              {selectedGroup.imageUrl ? (
                <Image source={{ uri: selectedGroup.imageUrl }} style={groupStyles.logVisualImage} />
              ) : (
                <View style={groupStyles.logVisualFallback} />
              )}
            </View>
            <View style={groupStyles.logContent}>
              <Text style={groupStyles.logMeta}>{formatEventDate(event.startsAt)} • EVENT</Text>
              <Text style={groupStyles.logTitle}>{event.title}</Text>
              <Text style={groupStyles.logBody}>{event.details}</Text>
            </View>
          </View>
        ))}

        <View style={groupStyles.nextMovesCard}>
          <Text style={groupStyles.sectionEyebrow}>NEXT MOVES</Text>
          <View style={groupStyles.nextMovesList}>
            {nextMoveEvents.map((event) => (
              <View key={event.id} style={groupStyles.nextMoveItem}>
                <View style={groupStyles.nextMoveDate}>
                  <Text style={groupStyles.nextMoveDateMonth}>
                    {formatCompactEventDate(event.startsAt).split(" ")[0]}
                  </Text>
                  <Text style={groupStyles.nextMoveDateDay}>
                    {formatCompactEventDate(event.startsAt).split(" ")[1]}
                  </Text>
                </View>
                <View style={groupStyles.nextMoveContent}>
                  <Text style={groupStyles.nextMoveTitle}>{event.title}</Text>
                  <Text style={groupStyles.nextMoveMeta}>{formatEventMeta(event.startsAt)}</Text>
                  <Text style={groupStyles.nextMoveMeta}>{event.location}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={groupStyles.syncButtonShell}>
            <Text style={groupStyles.syncButtonLabel}>Sync Calendar</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <View style={groupStyles.screen}>
      <ScrollView
        contentContainerStyle={[
          groupStyles.container,
          { paddingTop: 12, paddingBottom: insets.bottom + 120 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={groupStyles.heroHeader}>
          <Text style={groupStyles.heroEyebrow}>CAMPUS LIFE</Text>
          <Text style={groupStyles.heroTitle}>Explore Communities</Text>
          <Text style={groupStyles.heroSubtitle}>
            Connect with like-minded students and shape your university legacy.
          </Text>
        </View>

        <View style={groupStyles.searchRow}>
          <View style={groupStyles.searchBar}>
            <Ionicons name="search" size={18} color="#8b94a7" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search groups..."
              placeholderTextColor="#a0a8b7"
              style={groupStyles.searchInput}
            />
          </View>
          <Pressable style={groupStyles.filterButton} onPress={() => setFilterModalOpen(true)}>
            <Ionicons name="options-outline" size={20} color="#556070" />
          </Pressable>
        </View>

        {screenError ? (
          <View style={groupStyles.errorBanner}>
            <Text style={groupStyles.errorBannerText}>{screenError}</Text>
          </View>
        ) : null}

        <View style={groupStyles.sectionHeader}>
          <Text style={groupStyles.sectionTitle}>Trending Clubs</Text>
          <Pressable onPress={() => void loadGroups()}>
            <Text style={groupStyles.sectionLink}>{loading ? "Refreshing..." : "Refresh"}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#2563eb" />
        ) : trendingGroups.length === 0 ? (
          <View style={groupStyles.emptyCard}>
            <Text style={groupStyles.emptyCardText}>No groups match those filters yet.</Text>
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={groupStyles.trendingRow}
          >
            {trendingGroups.map((group) => (
              <Pressable
                key={group.id}
                style={groupStyles.trendingCard}
                onPress={() => handleOpenGroup(group)}
              >
                {group.imageUrl ? (
                  <Image source={{ uri: group.imageUrl }} style={groupStyles.trendingBackgroundImage} />
                ) : null}
                <View style={groupStyles.trendingOverlay} />
                <View style={groupStyles.trendingTopRow}>
                  <View style={groupStyles.categoryBadge}>
                    <Text style={groupStyles.categoryBadgeText}>COMMUNITY</Text>
                  </View>
                  <Text style={groupStyles.trendingMembersLabel}>{group.memberCount} members</Text>
                </View>
                <View style={groupStyles.trendingBottom}>
                  <Text style={groupStyles.trendingLocation}>{group.city ?? group.location}</Text>
                  <Text style={groupStyles.trendingTitle}>{group.title}</Text>
                  <Text style={groupStyles.trendingDescription} numberOfLines={2}>
                    {group.description}
                  </Text>
                  <View style={groupStyles.trendingAction}>
                    <Text style={groupStyles.trendingActionText}>Meet the Crew</Text>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Text style={groupStyles.sectionTitle}>Verified University Orgs</Text>
        <View style={groupStyles.verifiedGrid}>
          {effectiveVerifiedGroups.map((group) => (
            <Pressable
              key={group.id}
              style={groupStyles.verifiedCard}
              onPress={() => handleOpenGroup(group)}
            >
              <View style={groupStyles.verifiedCardTop}>
                <View style={groupStyles.verifiedIcon}>
                  <Ionicons name="school-outline" size={18} color="#5b8cff" />
                </View>
                <View style={groupStyles.officialPill}>
                  <Text style={groupStyles.officialPillText}>OFFICIAL</Text>
                </View>
              </View>

              <Text style={groupStyles.verifiedTitle}>{group.title}</Text>
              <Text style={groupStyles.verifiedBody} numberOfLines={2}>
                {group.description}
              </Text>

              <View style={groupStyles.verifiedFooter}>
                {renderAvatarStack(group)}
                <View style={groupStyles.openButton}>
                  <Text style={groupStyles.openButtonText}>Open</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>

        <Text style={groupStyles.sectionTitle}>Student Organizations</Text>
        <View style={groupStyles.organizationList}>
          {studentGroups.map((group) => {
            const isPending =
              group.joinPolicy === "application" &&
              group.applicationStatus === "pending" &&
              !group.joinedByUser;
            const isOwnGroup = group.creator.id === user.id;
            const membershipLabel = getMembershipLabel(group);

            return (
              <View key={group.id} style={groupStyles.organizationCard}>
                <Pressable
                  style={groupStyles.organizationContent}
                  onPress={() => handleOpenGroup(group)}
                >
                  <View style={groupStyles.organizationIcon}>
                    {group.imageUrl ? (
                      <Image source={{ uri: group.imageUrl }} style={groupStyles.organizationIconImage} />
                    ) : (
                      <Ionicons name="school-outline" size={18} color="#5b8cff" />
                    )}
                  </View>

                  <View style={groupStyles.organizationTextWrap}>
                    <Text style={groupStyles.organizationTitle}>{group.title}</Text>
                    <Text style={groupStyles.organizationMeta}>
                      {group.memberCount} members • {getLocationLabel(group)}
                    </Text>
                  </View>
                </Pressable>

                <View style={groupStyles.organizationActions}>
                  <Text style={groupStyles.organizationSecondaryMeta}>
                    {getDistanceLabel(group) ?? formatRelativeTime(group.createdAt)}
                  </Text>
                  {isOwnGroup ? (
                    <View style={[groupStyles.openButton, groupStyles.ownerButton]}>
                      <Text style={[groupStyles.openButtonText, groupStyles.ownerButtonText]}>Owner</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={[groupStyles.openButton, isPending ? groupStyles.pendingButton : null]}
                      disabled={joiningIds.has(group.id) || isPending}
                      onPress={() => {
                        void handleMembershipToggle(group);
                      }}
                    >
                      <Text
                        style={[
                          groupStyles.openButtonText,
                          isPending ? groupStyles.pendingButtonText : null,
                        ]}
                      >
                        {joiningIds.has(group.id) ? "..." : membershipLabel}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <Pressable
        style={[groupStyles.fab, { bottom: insets.bottom + 88 }]}
        onPress={() => setComposerOpen(true)}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </Pressable>

      <Modal visible={filterModalOpen} transparent animationType="fade" onRequestClose={() => setFilterModalOpen(false)}>
        <View style={groupStyles.modalOverlay}>
          <Pressable style={groupStyles.modalBackdrop} onPress={() => setFilterModalOpen(false)} />
          <View style={[groupStyles.filterSheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={groupStyles.modalTitle}>Filter Groups</Text>

            <Text style={groupStyles.modalLabel}>Recency</Text>
            <View style={groupStyles.modalChipRow}>
              {recencyOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[groupStyles.modalChip, recency === option.value ? groupStyles.modalChipActive : null]}
                  onPress={() => setRecency(option.value)}
                >
                  <Text
                    style={[
                      groupStyles.modalChipText,
                      recency === option.value ? groupStyles.modalChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={groupStyles.modalLabel}>Category</Text>
            <View style={groupStyles.modalChipRow}>
              <Pressable
                style={[groupStyles.modalChip, categoryFilter === "all" ? groupStyles.modalChipActive : null]}
                onPress={() => setCategoryFilter("all")}
              >
                <Text
                  style={[
                    groupStyles.modalChipText,
                    categoryFilter === "all" ? groupStyles.modalChipTextActive : null,
                  ]}
                >
                  All
                </Text>
              </Pressable>
              {categoryOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    groupStyles.modalChip,
                    categoryFilter === option.value ? groupStyles.modalChipActive : null,
                  ]}
                  onPress={() => setCategoryFilter(option.value)}
                >
                  <Text
                    style={[
                      groupStyles.modalChipText,
                      categoryFilter === option.value ? groupStyles.modalChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={groupStyles.modalLabel}>Location</Text>
            <View style={groupStyles.modalChipRow}>
              {proximityOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[groupStyles.modalChip, proximity === option.value ? groupStyles.modalChipActive : null]}
                  onPress={() => setProximity(option.value)}
                >
                  <Text
                    style={[
                      groupStyles.modalChipText,
                      proximity === option.value ? groupStyles.modalChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={groupStyles.modalLabel}>Sort By</Text>
            <View style={groupStyles.modalChipRow}>
              {sortOptions.map((option) => (
                <Pressable
                  key={option.value}
                  style={[groupStyles.modalChip, sortBy === option.value ? groupStyles.modalChipActive : null]}
                  onPress={() => setSortBy(option.value)}
                >
                  <Text
                    style={[
                      groupStyles.modalChipText,
                      sortBy === option.value ? groupStyles.modalChipTextActive : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={groupStyles.modalDoneButton} onPress={() => setFilterModalOpen(false)}>
              <Text style={groupStyles.modalDoneButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={closeComposer}>
        <View style={groupStyles.modalOverlay}>
          <Pressable style={groupStyles.modalBackdrop} onPress={closeComposer} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={groupStyles.composerShell}
          >
            <View style={[groupStyles.composerSheet, { paddingBottom: insets.bottom + 18 }]}>
              <View style={groupStyles.composerHeader}>
                <View>
                  <Text style={groupStyles.modalTitle}>Create Group</Text>
                  <Text style={groupStyles.composerSubtitle}>
                    Start a new community and open the door for people to join.
                  </Text>
                </View>
                <Pressable style={groupStyles.closeButton} onPress={closeComposer}>
                  <Text style={groupStyles.closeButtonLabel}>×</Text>
                </Pressable>
              </View>

              {composerError ? (
                <View style={groupStyles.inlineError}>
                  <Text style={groupStyles.inlineErrorText}>{composerError}</Text>
                </View>
              ) : null}

              <ScrollView
                style={groupStyles.composerScroll}
                contentContainerStyle={groupStyles.composerScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={groupStyles.fieldGroup}>
                  <Text style={groupStyles.fieldLabel}>Group name</Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="Late-night chess group"
                    placeholderTextColor="#9ca3af"
                    style={groupStyles.fieldInput}
                  />
                </View>

                <View style={groupStyles.fieldGroup}>
                  <Text style={groupStyles.fieldLabel}>Description</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="What this group does and how often people meet."
                    placeholderTextColor="#9ca3af"
                    style={[groupStyles.fieldInput, groupStyles.fieldTextarea]}
                    multiline
                  />
                </View>

                <View style={groupStyles.fieldGroup}>
                  <Text style={groupStyles.fieldLabel}>Category</Text>
                  <View style={groupStyles.modalChipRow}>
                    {categoryOptions.map((option) => (
                      <Pressable
                        key={option.value}
                        style={[
                          groupStyles.modalChip,
                          category === option.value ? groupStyles.modalChipActive : null,
                        ]}
                        onPress={() => setCategory(option.value)}
                      >
                        <Text
                          style={[
                            groupStyles.modalChipText,
                            category === option.value ? groupStyles.modalChipTextActive : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={groupStyles.fieldGroup}>
                  <Text style={groupStyles.fieldLabel}>Join access</Text>
                  <View style={groupStyles.modalChipRow}>
                    {(["open", "application"] as const).map((option) => (
                      <Pressable
                        key={option}
                        style={[
                          groupStyles.modalChip,
                          joinPolicy === option ? groupStyles.modalChipActive : null,
                        ]}
                        onPress={() => setJoinPolicy(option)}
                      >
                        <Text
                          style={[
                            groupStyles.modalChipText,
                            joinPolicy === option ? groupStyles.modalChipTextActive : null,
                          ]}
                        >
                          {option === "open" ? "Open to all" : "Requires approval"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={groupStyles.fieldGroup}>
                  <View style={groupStyles.toggleRow}>
                    <Text style={groupStyles.fieldLabel}>Remote group</Text>
                    <Pressable
                      style={[groupStyles.togglePill, isRemote ? groupStyles.togglePillActive : null]}
                      onPress={() => setIsRemote((prev) => !prev)}
                    >
                      <View style={[groupStyles.toggleDot, isRemote ? groupStyles.toggleDotActive : null]} />
                    </Pressable>
                  </View>
                </View>

                {!isRemote ? (
                  <View style={groupStyles.fieldGroup}>
                    <Text style={groupStyles.fieldLabel}>City</Text>
                    <TextInput
                      value={city}
                      onChangeText={setCity}
                      placeholder="Where the group meets"
                      placeholderTextColor="#9ca3af"
                      style={groupStyles.fieldInput}
                    />
                  </View>
                ) : null}

                <View style={groupStyles.fieldGroup}>
                  <Text style={groupStyles.fieldLabel}>Image URL (optional)</Text>
                  <TextInput
                    value={imageUrl}
                    onChangeText={setImageUrl}
                    placeholder="https://..."
                    placeholderTextColor="#9ca3af"
                    style={groupStyles.fieldInput}
                    autoCapitalize="none"
                  />
                </View>
              </ScrollView>

              <View style={groupStyles.modalFooterRow}>
                <Pressable style={groupStyles.secondaryButton} onPress={closeComposer} disabled={creating}>
                  <Text style={groupStyles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={groupStyles.primaryButton}
                  onPress={() => void handleCreateGroup()}
                  disabled={creating}
                >
                  <Text style={groupStyles.primaryButtonText}>
                    {creating ? "Creating..." : "Create Group"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
};

const groupStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f8fc",
  },
  container: {
    paddingHorizontal: 18,
    gap: 22,
  },
  heroHeader: {
    gap: 10,
    paddingTop: 4,
  },
  heroEyebrow: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
  },
  heroTitle: {
    color: "#2b3442",
    fontSize: 48,
    lineHeight: 50,
    fontWeight: "800",
    letterSpacing: -1.8,
  },
  heroSubtitle: {
    color: "#6c7686",
    fontSize: 18,
    lineHeight: 28,
    maxWidth: 320,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  searchBar: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e4e8f0",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#c9d2e3",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  searchInput: {
    flex: 1,
    color: "#1f2937",
    fontSize: 16,
    paddingVertical: 0,
  },
  filterButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#e4e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#c9d2e3",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 5,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 10,
  },
  logsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  sectionTitle: {
    color: "#2d3644",
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  logsTitle: {
    color: "#2d3644",
    fontSize: 40,
    lineHeight: 42,
    fontWeight: "800",
    letterSpacing: -1.4,
  },
  sectionLink: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  trendingRow: {
    gap: 16,
    paddingRight: 18,
  },
  trendingCard: {
    width: 294,
    minHeight: 388,
    borderRadius: 36,
    backgroundColor: "#0f172a",
    overflow: "hidden",
    padding: 18,
    justifyContent: "space-between",
  },
  trendingBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
  },
  trendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 17, 31, 0.74)",
  },
  trendingTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    zIndex: 1,
  },
  categoryBadge: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#2f63ff",
  },
  categoryBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  trendingMembersLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    fontWeight: "600",
  },
  trendingBottom: {
    gap: 10,
    zIndex: 1,
  },
  trendingLocation: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  trendingTitle: {
    color: "#ffffff",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -1,
  },
  trendingDescription: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 15,
    lineHeight: 22,
  },
  trendingAction: {
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    alignItems: "center",
  },
  trendingActionText: {
    color: "#273142",
    fontSize: 16,
    fontWeight: "700",
  },
  verifiedGrid: {
    gap: 16,
  },
  verifiedCard: {
    borderRadius: 32,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e9f2",
    padding: 18,
    gap: 18,
    shadowColor: "#d7dfef",
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  verifiedCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  verifiedIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
  },
  officialPill: {
    borderRadius: 999,
    backgroundColor: "#e7e0ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  officialPillText: {
    color: "#4c52d0",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
  },
  verifiedTitle: {
    color: "#2c3543",
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    letterSpacing: -1,
  },
  verifiedBody: {
    color: "#758095",
    fontSize: 16,
    lineHeight: 24,
  },
  verifiedFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  organizationList: {
    gap: 14,
  },
  organizationCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "#e5e9f2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  organizationContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  organizationIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#eef4ff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  organizationIconImage: {
    width: "100%",
    height: "100%",
  },
  organizationTextWrap: {
    flex: 1,
    gap: 4,
  },
  organizationTitle: {
    color: "#2d3644",
    fontSize: 18,
    fontWeight: "800",
  },
  organizationMeta: {
    color: "#758095",
    fontSize: 13,
    lineHeight: 18,
  },
  organizationActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  organizationSecondaryMeta: {
    color: "#8b94a7",
    fontSize: 12,
  },
  openButton: {
    minWidth: 94,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  openButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  ownerButton: {
    backgroundColor: "#eef4ff",
  },
  ownerButtonText: {
    color: "#2563eb",
  },
  pendingButton: {
    backgroundColor: "#fef3c7",
  },
  pendingButtonText: {
    color: "#9a6700",
  },
  avatarStack: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatarBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#bde1ff",
    borderWidth: 2,
    borderColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarBubbleAlt: {
    backgroundColor: "#b7f3d8",
  },
  avatarBubbleAlt2: {
    backgroundColor: "#d6f5e9",
  },
  avatarBubbleExtra: {
    backgroundColor: "#edf1f7",
  },
  avatarBubbleText: {
    color: "#1f2937",
    fontSize: 15,
    fontWeight: "700",
  },
  avatarBubbleExtraText: {
    color: "#6b7280",
    fontSize: 14,
    fontWeight: "700",
  },
  emptyCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#e5e9f2",
    backgroundColor: "#ffffff",
    paddingHorizontal: 18,
    paddingVertical: 22,
    alignItems: "center",
  },
  emptyCardText: {
    color: "#758095",
    fontSize: 15,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.34)",
  },
  filterSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#fbfaf7",
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  modalTitle: {
    color: "#253040",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  modalLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  modalChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  modalChip: {
    borderRadius: 999,
    backgroundColor: "#edf1f7",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalChipActive: {
    backgroundColor: "#2563eb",
  },
  modalChipText: {
    color: "#556070",
    fontSize: 13,
    fontWeight: "700",
  },
  modalChipTextActive: {
    color: "#ffffff",
  },
  modalDoneButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  modalDoneButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  composerShell: {
    justifyContent: "flex-end",
  },
  composerSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: "#fbfaf7",
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  composerHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  composerSubtitle: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonLabel: {
    color: "#4b5563",
    fontSize: 24,
    lineHeight: 24,
  },
  inlineError: {
    borderRadius: 18,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inlineErrorText: {
    color: "#be123c",
    fontSize: 13,
    fontWeight: "600",
  },
  composerScroll: {
    flexGrow: 0,
  },
  composerScrollContent: {
    gap: 16,
    paddingBottom: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  fieldInput: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#111827",
    fontSize: 15,
  },
  fieldTextarea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  togglePill: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#dbe2ef",
    paddingHorizontal: 4,
    justifyContent: "center",
  },
  togglePillActive: {
    backgroundColor: "#2563eb",
  },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  toggleDotActive: {
    alignSelf: "flex-end",
  },
  modalFooterRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#556070",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  errorBanner: {
    borderRadius: 20,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorBannerText: {
    color: "#be123c",
    fontSize: 13,
    fontWeight: "600",
  },
  detailContainer: {
    paddingHorizontal: 18,
    gap: 22,
    backgroundColor: "#f7f8fc",
  },
  detailTopBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e9f2",
    alignItems: "center",
    justifyContent: "center",
  },
  detailTopLabel: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  backButtonSpacer: {
    width: 42,
  },
  detailHero: {
    gap: 22,
  },
  detailHeroContent: {
    gap: 14,
  },
  eyebrowPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#eef4ff",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  eyebrowPillText: {
    color: "#2563eb",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.4,
  },
  detailTitle: {
    color: "#2d3644",
    fontSize: 46,
    lineHeight: 48,
    fontWeight: "800",
    letterSpacing: -1.8,
  },
  detailSubtitle: {
    color: "#758095",
    fontSize: 17,
    lineHeight: 26,
  },
  detailActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  primaryOutlineButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  primaryOutlineButtonText: {
    color: "#556070",
    fontSize: 15,
    fontWeight: "700",
  },
  leaveButton: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  leaveButtonText: {
    color: "#ffffff",
  },
  ownerPill: {
    borderRadius: 999,
    backgroundColor: "#eef4ff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  ownerPillText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "700",
  },
  heroVisualCard: {
    height: 270,
    borderRadius: 38,
    backgroundColor: "#111a2f",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    transform: [{ rotate: "2deg" }],
  },
  heroVisualImage: {
    width: "100%",
    height: "100%",
  },
  heroVisualInnerBadge: {
    width: 112,
    height: 112,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroVisualInnerBadgeText: {
    color: "#ffffff",
    fontSize: 38,
    fontWeight: "800",
  },
  sectionEyebrow: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 3,
  },
  missionCard: {
    borderRadius: 32,
    backgroundColor: "#edf4ff",
    padding: 20,
    gap: 20,
  },
  missionHeading: {
    color: "#2d3644",
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  missionBody: {
    color: "#6c7686",
    fontSize: 17,
    lineHeight: 30,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingTop: 4,
  },
  statBlock: {
    flex: 1,
    gap: 4,
  },
  statValue: {
    color: "#2d3644",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
  },
  statLabel: {
    color: "#7c8799",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
  },
  statDivider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#d6dfef",
  },
  leadershipRow: {
    gap: 14,
    paddingRight: 18,
  },
  leaderCard: {
    width: 244,
    borderRadius: 28,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e9f2",
    padding: 18,
    gap: 16,
  },
  leaderAvatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: "#bde1ff",
    alignItems: "center",
    justifyContent: "center",
  },
  leaderAvatarText: {
    color: "#1f2937",
    fontSize: 34,
    fontWeight: "800",
  },
  leaderName: {
    color: "#2d3644",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  leaderRole: {
    color: "#2563eb",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 2.4,
    textTransform: "uppercase",
  },
  leaderSummary: {
    color: "#6c7686",
    fontSize: 16,
    lineHeight: 28,
  },
  logCard: {
    borderRadius: 32,
    borderWidth: 1,
    borderColor: "#e5e9f2",
    backgroundColor: "#ffffff",
    padding: 14,
    gap: 14,
  },
  logVisual: {
    height: 132,
    borderRadius: 26,
    overflow: "hidden",
    backgroundColor: "#111a2f",
  },
  logVisualImage: {
    width: "100%",
    height: "100%",
  },
  logVisualFallback: {
    flex: 1,
    backgroundColor: "#17233c",
  },
  logContent: {
    gap: 8,
  },
  logMeta: {
    color: "#8b94a7",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2.2,
    textTransform: "uppercase",
  },
  logTitle: {
    color: "#2d3644",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  logBody: {
    color: "#6c7686",
    fontSize: 16,
    lineHeight: 24,
  },
  nextMovesCard: {
    borderRadius: 32,
    backgroundColor: "#edf4ff",
    padding: 18,
    gap: 16,
  },
  nextMovesList: {
    gap: 14,
  },
  nextMoveItem: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    padding: 14,
    flexDirection: "row",
    gap: 14,
  },
  nextMoveDate: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: "#f8fafc",
    alignItems: "center",
    justifyContent: "center",
  },
  nextMoveDateMonth: {
    color: "#98a2b3",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },
  nextMoveDateDay: {
    color: "#2d3644",
    fontSize: 20,
    fontWeight: "800",
  },
  nextMoveContent: {
    flex: 1,
    gap: 4,
  },
  nextMoveTitle: {
    color: "#2d3644",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
  },
  nextMoveMeta: {
    color: "#6c7686",
    fontSize: 14,
    lineHeight: 20,
  },
  syncButtonShell: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#b7ccff",
    backgroundColor: "#ffffff",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  syncButtonLabel: {
    color: "#2d3644",
    fontSize: 16,
    fontWeight: "700",
  },
});
