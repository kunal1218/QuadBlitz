import { Ionicons } from "@expo/vector-icons";
import type { DailyChallenge, FeedPost, PollOption } from "@lockedin/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type DimensionValue,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getDailyChallenge,
  getFeed,
  toggleFeedLike,
  voteOnFeedPollOption,
} from "../../api/actions";
import { formatError, isAuthError } from "../../lib/errors";
import type { SessionProps } from "../../types/session";

type AudienceFilter = "global" | "local";
type SortFilter = "top" | "fresh";

type PulseCard = {
  id: string;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  tint: string;
};

const fallbackChallenge: DailyChallenge = {
  id: "challenge-1",
  title: "Snap a photo with the Founder's Statue",
  description: "Find the bronze heart of campus and share your moment.",
  endsAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
  participants: 500,
};

const fallbackPosts: FeedPost[] = [
  {
    id: "fallback-1",
    type: "update",
    content:
      "Finally finished the prototype for the Blitz Bot! Who's ready for the Engineering Expo tomorrow?",
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
    likeCount: 1200,
    commentCount: 84,
    author: {
      id: "maya",
      name: "Maya Chen",
      handle: "mayachen",
      collegeName: "Engineering",
    },
  },
  {
    id: "fallback-2",
    type: "update",
    content:
      "The lighting at the Founder's Square right now is absolutely ethereal. Perfect for today's challenge!",
    createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    likeCount: 452,
    commentCount: 12,
    author: {
      id: "jordan",
      name: "Jordan Smith",
      handle: "jordansmith",
      collegeName: "Arts & Media",
    },
  },
];

const pulseCards: PulseCard[] = [
  {
    id: "hottest",
    title: "Hottest Topics",
    subtitle: "What campus is talking about",
    icon: "briefcase",
    accent: "#1263ff",
    tint: "#eef4ff",
  },
  {
    id: "founders",
    title: "Top Founders",
    subtitle: "Fast-moving builders nearby",
    icon: "camera",
    accent: "#5f6ad9",
    tint: "#f1f2ff",
  },
  {
    id: "events",
    title: "Global Events",
    subtitle: "Big things happening tonight",
    icon: "people",
    accent: "#b13d87",
    tint: "#fff0f8",
  },
];

const visualPalettes = [
  {
    background: "#102a5b",
    panel: "#143c7d",
    shape: "#85f0ff",
    glow: "rgba(133, 240, 255, 0.25)",
  },
  {
    background: "#213f65",
    panel: "#33557f",
    shape: "#ffa97f",
    glow: "rgba(255, 169, 127, 0.22)",
  },
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseChallenge = (value: unknown): DailyChallenge | null => {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.endsAt !== "string" ||
    typeof value.participants !== "number"
  ) {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    endsAt: value.endsAt,
    participants: value.participants,
  };
};

const formatRelativeTime = (timestamp: string) => {
  const diff = Date.now() - Date.parse(timestamp);
  const minutes = Math.max(1, Math.floor(diff / 60000));
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

const formatCompactCount = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return String(value);
};

const getInitials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const getChallengePoints = (participants: number) => Math.max(100, participants);

const ChallengeHero = ({
  challenge,
  loading,
}: {
  challenge: DailyChallenge;
  loading: boolean;
}) => (
  <View style={feedStyles.heroCard}>
    <View style={feedStyles.heroGlow} />
    <View style={feedStyles.heroStatue} />
    <View style={feedStyles.heroBadge}>
      <Ionicons name="star" size={12} color="#ffffff" />
      <Text style={feedStyles.heroBadgeText}>+{getChallengePoints(challenge.participants)} PTS</Text>
    </View>

    <Text style={feedStyles.heroTitle}>{challenge.title}</Text>
    <Text style={feedStyles.heroDescription}>
      Daily Challenge: {challenge.description}
    </Text>

    <Pressable
      onPress={() => Alert.alert("Submit proof", "Hooking up photo submission is next on the mobile flow.")}
      style={feedStyles.heroButton}
    >
      <Text style={feedStyles.heroButtonLabel}>
        {loading ? "Loading..." : "Submit Proof"}
      </Text>
    </Pressable>
  </View>
);

const PulseSection = () => (
  <View style={feedStyles.sectionBlock}>
    <View style={feedStyles.sectionHeader}>
      <Text style={feedStyles.sectionTitle}>Campus Pulse</Text>
      <Pressable>
        <Text style={feedStyles.sectionLink}>View all</Text>
      </Pressable>
    </View>

    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={feedStyles.pulseRow}
    >
      {pulseCards.map((card) => (
        <Pressable key={card.id} style={[feedStyles.pulseCard, { backgroundColor: card.tint }]}>
          <View style={[feedStyles.pulseIconWrap, { backgroundColor: card.accent }]}>
            <Ionicons name={card.icon} size={15} color="#ffffff" />
          </View>
          <Text style={feedStyles.pulseTitle}>{card.title}</Text>
          <Text style={feedStyles.pulseSubtitle}>{card.subtitle}</Text>
        </Pressable>
      ))}
    </ScrollView>
  </View>
);

const PostVisual = ({ index }: { index: number }) => {
  const palette = visualPalettes[index % visualPalettes.length];
  const isEven = index % 2 === 0;

  return (
    <View style={[feedStyles.postVisual, { backgroundColor: palette.background }]}>
      <View style={[feedStyles.postVisualGlow, { backgroundColor: palette.glow }]} />
      {isEven ? (
        <>
          <View style={[feedStyles.radarRingLarge, { borderColor: "rgba(133, 240, 255, 0.25)" }]} />
          <View style={[feedStyles.radarRingMedium, { borderColor: "rgba(133, 240, 255, 0.35)" }]} />
          <View style={[feedStyles.radarRingSmall, { borderColor: palette.shape }]} />
          <View style={[feedStyles.radarCenter, { backgroundColor: palette.shape }]} />
          <View style={feedStyles.radarLineVertical} />
          <View style={feedStyles.radarLineHorizontal} />
        </>
      ) : (
        <>
          <View style={[feedStyles.posterBackdrop, { backgroundColor: palette.panel }]} />
          <View style={[feedStyles.posterColumn, { backgroundColor: palette.shape }]} />
          <Text style={feedStyles.posterTitle}>CAMPUS LIFE</Text>
        </>
      )}
    </View>
  );
};

const PollOptions = ({
  options,
  onVote,
}: {
  options: PollOption[];
  onVote: (optionId: string) => void;
}) => {
  const totalVotes = options.reduce((sum, option) => sum + option.votes, 0);

  return (
    <View style={feedStyles.pollList}>
      {options.map((option) => {
        const fill = totalVotes > 0 ? ((option.votes / totalVotes) * 100).toFixed(2) : "0";
        const fillWidth = `${fill}%` as DimensionValue;
        return (
          <Pressable key={option.id} onPress={() => onVote(option.id)} style={feedStyles.pollOption}>
            <View style={[feedStyles.pollFill, { width: fillWidth }]} />
            <Text style={feedStyles.pollLabel}>{option.label}</Text>
            <Text style={feedStyles.pollVotes}>{option.votes}</Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const FeedCard = ({
  index,
  post,
  onLike,
  onVote,
}: {
  index: number;
  post: FeedPost;
  onLike: () => void;
  onVote: (optionId: string) => void;
}) => {
  const department = post.author.collegeName?.toUpperCase() ?? "STUDENT";

  return (
    <View style={feedStyles.feedCard}>
      <View style={feedStyles.feedCardHeader}>
        <View style={feedStyles.feedAuthorRow}>
          {post.author.avatarUrl ? (
            <Image source={{ uri: post.author.avatarUrl }} style={feedStyles.feedAvatar} />
          ) : (
            <View style={feedStyles.feedAvatarFallback}>
              <Text style={feedStyles.feedAvatarInitials}>{getInitials(post.author.name)}</Text>
            </View>
          )}
          <View style={feedStyles.feedAuthorMeta}>
            <Text style={feedStyles.feedAuthorName}>{post.author.name}</Text>
            <Text style={feedStyles.feedAuthorSubline}>
              {department} · {formatRelativeTime(post.createdAt)}
            </Text>
          </View>
        </View>
        <Pressable hitSlop={10}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#525866" />
        </Pressable>
      </View>

      <Text style={feedStyles.feedBody}>{post.content}</Text>

      {post.pollOptions?.length ? (
        <PollOptions options={post.pollOptions} onVote={onVote} />
      ) : (
        <PostVisual index={index} />
      )}

      <View style={feedStyles.feedActions}>
        <Pressable onPress={onLike} style={feedStyles.feedAction}>
          <Ionicons
            name={post.likedByUser ? "heart" : "heart-outline"}
            size={18}
            color={post.likedByUser ? "#1263ff" : "#5c6474"}
          />
          <Text style={feedStyles.feedActionText}>{formatCompactCount(post.likeCount)}</Text>
        </Pressable>
        <Pressable style={feedStyles.feedAction}>
          <Ionicons name="chatbubble" size={17} color="#5c6474" />
          <Text style={feedStyles.feedActionText}>{formatCompactCount(post.commentCount ?? 0)}</Text>
        </Pressable>
        <Pressable style={[feedStyles.feedAction, feedStyles.feedActionShare]}>
          <Ionicons name="share-social-outline" size={18} color="#5c6474" />
        </Pressable>
      </View>
    </View>
  );
};

type FeedTabProps = SessionProps & {
  onOpenChat?: () => void;
};

export const FeedTab = ({ token, user, onAuthExpired, onOpenChat }: FeedTabProps) => {
  const insets = useSafeAreaInsets();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [challenge, setChallenge] = useState<DailyChallenge>(fallbackChallenge);
  const [loading, setLoading] = useState(true);
  const [challengeLoading, setChallengeLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audience, setAudience] = useState<AudienceFilter>("global");
  const [sort, setSort] = useState<SortFilter>("top");

  const loadFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextPosts = await getFeed(sort === "top" ? "top" : "fresh", token);
      setPosts(nextPosts);
    } catch (loadError) {
      if (isAuthError(loadError)) {
        onAuthExpired();
        return;
      }
      setError(formatError(loadError));
    } finally {
      setLoading(false);
    }
  }, [onAuthExpired, sort, token]);

  const loadChallenge = useCallback(async () => {
    setChallengeLoading(true);
    try {
      const payload = await getDailyChallenge(token);
      setChallenge(parseChallenge(payload) ?? fallbackChallenge);
    } catch {
      setChallenge(fallbackChallenge);
    } finally {
      setChallengeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const displayedPosts = useMemo(() => {
    const base = posts.length > 0 ? posts : fallbackPosts;
    if (audience === "local") {
      return base.slice(0, Math.max(1, Math.min(2, base.length)));
    }
    return base;
  }, [audience, posts]);

  const handleLike = useCallback(
    async (postId: string) => {
      const previous = posts;
      setPosts((current) =>
        current.map((post) =>
          post.id === postId
            ? {
                ...post,
                likedByUser: !post.likedByUser,
                likeCount: Math.max(0, post.likeCount + (post.likedByUser ? -1 : 1)),
              }
            : post
        )
      );

      try {
        const result = await toggleFeedLike(postId, token);
        setPosts((current) =>
          current.map((post) =>
            post.id === postId
              ? { ...post, likeCount: result.likeCount, likedByUser: result.liked }
              : post
          )
        );
      } catch (likeError) {
        if (isAuthError(likeError)) {
          onAuthExpired();
          return;
        }
        setPosts(previous);
      }
    },
    [onAuthExpired, posts, token]
  );

  const handlePollVote = useCallback(
    async (postId: string, optionId: string) => {
      try {
        const options = await voteOnFeedPollOption(postId, optionId, token);
        setPosts((current) =>
          current.map((post) => (post.id === postId ? { ...post, pollOptions: options } : post))
        );
      } catch (voteError) {
        if (isAuthError(voteError)) {
          onAuthExpired();
        }
      }
    },
    [onAuthExpired, token]
  );

  return (
    <View style={feedStyles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          feedStyles.content,
          { paddingBottom: insets.bottom + 132 },
        ]}
      >
        <View style={feedStyles.topBar}>
          <View style={feedStyles.headerAvatar}>
            <Text style={feedStyles.headerAvatarText}>{getInitials(user.name)}</Text>
          </View>
          <Text style={feedStyles.brand}>QUADBLITZ</Text>
          <View style={feedStyles.headerActions}>
            <Pressable style={feedStyles.headerIconButton}>
              <Ionicons name="notifications" size={18} color="#7d8ba3" />
            </Pressable>
            <Pressable style={feedStyles.headerIconButton} onPress={onOpenChat}>
              <Ionicons name="chatbubble-ellipses-outline" size={18} color="#7d8ba3" />
            </Pressable>
          </View>
        </View>

        <ChallengeHero challenge={challenge} loading={challengeLoading} />
        <PulseSection />

        <View style={feedStyles.segmentOuter}>
          {(["global", "local"] as const).map((value) => {
            const active = audience === value;
            return (
              <Pressable
                key={value}
                onPress={() => setAudience(value)}
                style={[feedStyles.segmentButton, active ? feedStyles.segmentButtonActive : null]}
              >
                <Text
                  style={[feedStyles.segmentText, active ? feedStyles.segmentTextActive : null]}
                >
                  {value === "global" ? "Global" : "Local"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={feedStyles.filterRow}>
          {(["top", "fresh"] as const).map((value) => {
            const active = sort === value;
            return (
              <Pressable
                key={value}
                onPress={() => setSort(value)}
                style={feedStyles.filterButton}
              >
                <Text
                  style={[feedStyles.filterText, active ? feedStyles.filterTextActive : null]}
                >
                  {value === "top" ? "Trending" : "Recent"}
                </Text>
                {active ? <View style={feedStyles.filterUnderline} /> : null}
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={feedStyles.errorText}>{error}</Text> : null}

        {loading && posts.length === 0 ? (
          <View style={feedStyles.loaderWrap}>
            <ActivityIndicator color="#1263ff" size="large" />
          </View>
        ) : null}

        <View style={feedStyles.feedList}>
          {displayedPosts.map((post, index) => (
            <FeedCard
              key={post.id}
              index={index}
              post={post}
              onLike={() => void handleLike(post.id)}
              onVote={(optionId) => void handlePollVote(post.id, optionId)}
            />
          ))}
        </View>
      </ScrollView>

      <Pressable
        onPress={() => Alert.alert("Create post", "The quick post composer is the next mobile interaction to wire up.")}
        style={[feedStyles.fab, { bottom: insets.bottom + 88 }]}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </Pressable>
    </View>
  );
};

const feedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 12,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 4,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#142c4c",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#f5d5b2",
  },
  headerAvatarText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  brand: {
    color: "#1263ff",
    fontSize: 28,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 34,
    backgroundColor: "#1263ff",
    paddingHorizontal: 26,
    paddingTop: 34,
    paddingBottom: 28,
    minHeight: 346,
  },
  heroGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(53, 202, 255, 0.18)",
    bottom: -50,
    left: -20,
  },
  heroStatue: {
    position: "absolute",
    right: 22,
    top: 32,
    width: 120,
    height: 210,
    borderRadius: 60,
    backgroundColor: "rgba(255,255,255,0.10)",
    transform: [{ rotate: "4deg" }],
  },
  heroBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.18)",
    marginBottom: 26,
  },
  heroBadgeText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  heroTitle: {
    width: "76%",
    color: "#ffffff",
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "900",
    marginBottom: 14,
  },
  heroDescription: {
    width: "86%",
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  heroButton: {
    alignSelf: "stretch",
    backgroundColor: "#ffffff",
    paddingVertical: 17,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  heroButtonLabel: {
    color: "#124eff",
    fontSize: 16,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sectionBlock: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: "#111111",
    fontSize: 20,
    fontWeight: "700",
  },
  sectionLink: {
    color: "#1263ff",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  pulseRow: {
    gap: 14,
    paddingRight: 14,
  },
  pulseCard: {
    width: 116,
    height: 136,
    borderRadius: 26,
    padding: 14,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  pulseIconWrap: {
    position: "absolute",
    left: 14,
    top: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  pulseTitle: {
    color: "#17181c",
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    lineHeight: 18,
  },
  pulseSubtitle: {
    marginTop: 4,
    color: "#6b7280",
    fontSize: 11,
    lineHeight: 15,
  },
  segmentOuter: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f1f3",
    borderRadius: 999,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 999,
  },
  segmentButtonActive: {
    backgroundColor: "#ffffff",
  },
  segmentText: {
    color: "#535862",
    fontSize: 16,
    fontWeight: "500",
  },
  segmentTextActive: {
    color: "#1263ff",
    fontWeight: "700",
  },
  filterRow: {
    flexDirection: "row",
    gap: 20,
  },
  filterButton: {
    gap: 8,
  },
  filterText: {
    color: "#262a33",
    fontSize: 13,
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  filterTextActive: {
    color: "#1263ff",
    fontWeight: "700",
  },
  filterUnderline: {
    height: 2,
    width: "100%",
    borderRadius: 999,
    backgroundColor: "#1263ff",
  },
  errorText: {
    color: "#b91c1c",
    fontSize: 13,
    fontWeight: "600",
  },
  loaderWrap: {
    paddingVertical: 24,
    alignItems: "center",
  },
  feedList: {
    gap: 18,
  },
  feedCard: {
    backgroundColor: "#ffffff",
    borderRadius: 34,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  feedCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  feedAuthorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  feedAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
  },
  feedAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#f97a56",
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatarInitials: {
    color: "#ffffff",
    fontWeight: "800",
    fontSize: 14,
  },
  feedAuthorMeta: {
    flex: 1,
  },
  feedAuthorName: {
    color: "#10131a",
    fontSize: 18,
    fontWeight: "700",
  },
  feedAuthorSubline: {
    color: "#737a88",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginTop: 2,
  },
  feedBody: {
    color: "#383d47",
    fontSize: 16,
    lineHeight: 25,
    marginBottom: 16,
  },
  postVisual: {
    position: "relative",
    height: 195,
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 14,
  },
  postVisualGlow: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    top: 18,
    left: 84,
  },
  radarRingLarge: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 1,
    alignSelf: "center",
    top: 2,
  },
  radarRingMedium: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 1,
    alignSelf: "center",
    top: 33,
  },
  radarRingSmall: {
    position: "absolute",
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2,
    alignSelf: "center",
    top: 70,
  },
  radarCenter: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    alignSelf: "center",
    top: 89,
  },
  radarLineVertical: {
    position: "absolute",
    width: 1,
    height: "100%",
    backgroundColor: "rgba(133, 240, 255, 0.25)",
    alignSelf: "center",
  },
  radarLineHorizontal: {
    position: "absolute",
    height: 1,
    width: "100%",
    backgroundColor: "rgba(133, 240, 255, 0.25)",
    top: "50%",
  },
  posterBackdrop: {
    position: "absolute",
    inset: 0,
  },
  posterColumn: {
    position: "absolute",
    width: 62,
    height: 132,
    borderRadius: 31,
    top: 0,
    alignSelf: "center",
  },
  posterTitle: {
    position: "absolute",
    bottom: 16,
    alignSelf: "center",
    color: "rgba(208, 235, 255, 0.6)",
    fontSize: 24,
    letterSpacing: 1.4,
    fontWeight: "300",
  },
  pollList: {
    gap: 10,
    marginBottom: 14,
  },
  pollOption: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 16,
    backgroundColor: "#f4f7fb",
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  pollFill: {
    position: "absolute",
    inset: 0,
    backgroundColor: "#dfeaff",
  },
  pollLabel: {
    color: "#18202f",
    fontSize: 14,
    fontWeight: "600",
    zIndex: 1,
  },
  pollVotes: {
    color: "#1263ff",
    fontSize: 13,
    fontWeight: "800",
    zIndex: 1,
  },
  feedActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  feedAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginRight: 20,
  },
  feedActionShare: {
    marginLeft: "auto",
    marginRight: 0,
  },
  feedActionText: {
    color: "#4b5563",
    fontSize: 14,
    fontWeight: "500",
  },
  fab: {
    position: "absolute",
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#1263ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1263ff",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
});
