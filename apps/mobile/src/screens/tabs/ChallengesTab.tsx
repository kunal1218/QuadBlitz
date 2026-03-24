import { Ionicons } from "@expo/vector-icons";
import type { DailyChallenge } from "@lockedin/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getDailyChallenge } from "../../api/actions";
import { formatError, isAuthError } from "../../lib/errors";
import type { SessionProps } from "../../types/session";

type ChallengeCardModel = {
  id: string;
  category: string;
  points: number;
  title: string;
  palette: {
    background: string;
    accent: string;
    glow: string;
  };
  art: "statue" | "library";
};

type Blitzer = {
  rank: string;
  name: string;
  label: string;
  points: string;
  highlighted?: boolean;
};

const featuredMission = {
  title: "The Coffee Sprint",
  description:
    'Order from 4 different campus cafes before 10 AM to unlock the "Caffeine Legend" badge.',
  points: 750,
};

const topBlitzers: Blitzer[] = [
  { rank: "01", name: "Marcus Chen", label: "Engineering", points: "12,840" },
  { rank: "02", name: "Elena Rodriguez", label: "Fine Arts", points: "11,920" },
  { rank: "124", name: "You", label: "Top 5% this week", points: "2,450", highlighted: true },
];

const fallbackChallenge: DailyChallenge = {
  id: "challenge-1",
  title: "Snap a photo with the Founder's Statue",
  description: "Find the bronze heart of campus and share your moment.",
  endsAt: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
  participants: 500,
};

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

const getInitials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

const ChallengeArt = ({ type }: { type: "statue" | "library" }) => {
  if (type === "library") {
    return (
      <View style={challengeStyles.libraryScene}>
        {Array.from({ length: 10 }).map((_, column) => (
          <View key={String(column)} style={challengeStyles.libraryColumn}>
            {Array.from({ length: 6 }).map((__, shelf) => (
              <View key={`${column}-${shelf}`} style={challengeStyles.libraryShelfRow}>
                {Array.from({ length: 5 }).map((___, book) => (
                  <View
                    key={`${column}-${shelf}-${book}`}
                    style={[
                      challengeStyles.book,
                      {
                        backgroundColor:
                          book % 3 === 0
                            ? "#d7c1a1"
                            : book % 3 === 1
                            ? "#9c6f4a"
                            : "#77553c",
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={challengeStyles.statueScene}>
      <View style={challengeStyles.statueGlow} />
      <View style={challengeStyles.statuePedestal} />
      <View style={challengeStyles.statueBody} />
      <View style={challengeStyles.statueHead} />
      <View style={challengeStyles.statueArmLeft} />
      <View style={challengeStyles.statueArmRight} />
    </View>
  );
};

const DailyChallengeCard = ({ challenge }: { challenge: ChallengeCardModel }) => (
  <Pressable style={[challengeStyles.dailyCard, { backgroundColor: challenge.palette.background }]}>
    <View style={[challengeStyles.dailyGlow, { backgroundColor: challenge.palette.glow }]} />
    <ChallengeArt type={challenge.art} />
    <View style={challengeStyles.dailyMetaRow}>
      <View style={challengeStyles.dailyBadge}>
        <Text style={challengeStyles.dailyBadgeText}>{challenge.category}</Text>
      </View>
      <Text style={challengeStyles.dailyPoints}>+{challenge.points}pts</Text>
    </View>
    <Text style={challengeStyles.dailyTitle}>{challenge.title}</Text>
  </Pressable>
);

export const ChallengesTab = ({ token, user, onAuthExpired }: SessionProps) => {
  const [challenge, setChallenge] = useState<DailyChallenge>(fallbackChallenge);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChallenge = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await getDailyChallenge(token);
      setChallenge(parseChallenge(payload) ?? fallbackChallenge);
    } catch (loadError) {
      if (isAuthError(loadError)) {
        onAuthExpired();
        return;
      }
      setError(formatError(loadError));
      setChallenge(fallbackChallenge);
    } finally {
      setLoading(false);
    }
  }, [onAuthExpired, token]);

  useEffect(() => {
    void loadChallenge();
  }, [loadChallenge]);

  const dailyCards = useMemo<ChallengeCardModel[]>(
    () => [
      {
        id: challenge.id,
        category: "Photo Hunt",
        points: Math.max(500, challenge.participants),
        title: challenge.title,
        palette: {
          background: "#0f1623",
          accent: "#2563ff",
          glow: "rgba(55, 187, 255, 0.18)",
        },
        art: "statue",
      },
      {
        id: "discovery",
        category: "Discovery",
        points: 250,
        title: "Visit 3 different libraries today",
        palette: {
          background: "#3f2f25",
          accent: "#4d5fdb",
          glow: "rgba(255, 214, 170, 0.15)",
        },
        art: "library",
      },
    ],
    [challenge]
  );

  const progressPercent = 85;
  const progressFill = `${progressPercent}%` as const;

  return (
    <ScrollView
      style={challengeStyles.screen}
      contentContainerStyle={challengeStyles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={challengeStyles.topBar}>
        <View style={challengeStyles.brandWrap}>
          <View style={challengeStyles.avatar}>
            <Text style={challengeStyles.avatarText}>{getInitials(user.name)}</Text>
          </View>
          <Text style={challengeStyles.brandText}>Campus Hub</Text>
        </View>
        <View style={challengeStyles.pointsPill}>
          <Ionicons name="star" size={13} color="#2164ff" />
          <Text style={challengeStyles.pointsText}>{(user.coins ?? 2450).toLocaleString()} pts</Text>
        </View>
      </View>

      <View style={challengeStyles.headerRow}>
        <Text style={challengeStyles.headerTitle}>Daily Challenges</Text>
        <Text style={challengeStyles.headerCount}>2 LEFT</Text>
      </View>

      {loading ? (
        <View style={challengeStyles.loadingWrap}>
          <ActivityIndicator color="#2164ff" size="large" />
        </View>
      ) : null}

      {error ? <Text style={challengeStyles.errorText}>{error}</Text> : null}

      <View style={challengeStyles.dailyList}>
        {dailyCards.map((card) => (
          <DailyChallengeCard key={card.id} challenge={card} />
        ))}
      </View>

      <View style={challengeStyles.featuredHeader}>
        <Ionicons name="megaphone" size={16} color="#2164ff" />
        <Text style={challengeStyles.featuredHeaderText}>Featured Mission</Text>
      </View>

      <View style={challengeStyles.featuredCard}>
        <View style={challengeStyles.featuredArt}>
          <View style={challengeStyles.cafeArch} />
          <View style={challengeStyles.cafeCounter} />
          <View style={challengeStyles.cafeLamp} />
          <View style={challengeStyles.cafePersonLeft} />
          <View style={challengeStyles.cafePersonCenter} />
          <View style={challengeStyles.cafePersonRight} />
          <View style={challengeStyles.featuredPointsPill}>
            <Text style={challengeStyles.featuredPointsText}>+{featuredMission.points} PTS</Text>
          </View>
        </View>

        <Text style={challengeStyles.featuredTitle}>{featuredMission.title}</Text>
        <Text style={challengeStyles.featuredDescription}>{featuredMission.description}</Text>

        <Pressable
          onPress={() =>
            Alert.alert("Mission accepted", "I can wire this to a real mission acceptance flow next.")
          }
          style={challengeStyles.acceptButton}
        >
          <Text style={challengeStyles.acceptButtonText}>Accept Mission</Text>
        </Pressable>
      </View>

      <View style={challengeStyles.sectionRow}>
        <Text style={challengeStyles.sectionTitle}>Top Blitzers</Text>
        <Pressable>
          <Text style={challengeStyles.sectionLink}>View Global</Text>
        </Pressable>
      </View>

      <View style={challengeStyles.leaderboard}>
        {topBlitzers.map((entry) => (
          <View
            key={entry.rank}
            style={[
              challengeStyles.leaderRow,
              entry.highlighted ? challengeStyles.leaderRowHighlighted : null,
            ]}
          >
            <Text
              style={[
                challengeStyles.rankText,
                entry.highlighted ? challengeStyles.rankTextHighlighted : null,
              ]}
            >
              {entry.rank}
            </Text>
            <View style={challengeStyles.leaderAvatar}>
              <Text style={challengeStyles.leaderAvatarText}>{getInitials(entry.name)}</Text>
            </View>
            <View style={challengeStyles.leaderMeta}>
              <Text
                style={[
                  challengeStyles.leaderName,
                  entry.highlighted ? challengeStyles.leaderNameHighlighted : null,
                ]}
              >
                {entry.name}
              </Text>
              <Text
                style={[
                  challengeStyles.leaderLabel,
                  entry.highlighted ? challengeStyles.leaderLabelHighlighted : null,
                ]}
              >
                {entry.label}
              </Text>
            </View>
            <Text
              style={[
                challengeStyles.leaderPoints,
                entry.highlighted ? challengeStyles.leaderPointsHighlighted : null,
              ]}
            >
              {entry.points}
            </Text>
          </View>
        ))}
      </View>

      <Text style={challengeStyles.sectionTitle}>Personal Progress</Text>
      <View style={challengeStyles.progressCard}>
        <View style={challengeStyles.progressHeader}>
          <View>
            <Text style={challengeStyles.progressLabel}>Current Tier</Text>
            <Text style={challengeStyles.progressTier}>Elite Quad</Text>
          </View>
          <Text style={challengeStyles.progressPercent}>{progressPercent}%</Text>
        </View>
        <View style={challengeStyles.progressTrack}>
          <View style={[challengeStyles.progressFill, { width: progressFill }]} />
        </View>
        <Text style={challengeStyles.progressNote}>
          Only <Text style={challengeStyles.progressNoteAccent}>1,500 PTS</Text> until you reach the next tier!
        </Text>
      </View>
    </ScrollView>
  );
};

const challengeStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f7f7f8",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 132,
    gap: 18,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#17385f",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  brandText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2164ff",
  },
  pointsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#ffffff",
  },
  pointsText: {
    color: "#2164ff",
    fontSize: 15,
    fontWeight: "700",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: "800",
    color: "#151515",
  },
  headerCount: {
    color: "#2164ff",
    fontSize: 15,
    fontWeight: "800",
  },
  loadingWrap: {
    paddingVertical: 12,
    alignItems: "center",
  },
  errorText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#b91c1c",
  },
  dailyList: {
    gap: 18,
  },
  dailyCard: {
    minHeight: 194,
    borderRadius: 34,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 20,
  },
  dailyGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    alignSelf: "center",
    top: -36,
  },
  dailyMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  dailyBadge: {
    backgroundColor: "#2563ff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  dailyBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  dailyPoints: {
    color: "#c4d6ff",
    fontSize: 13,
    fontWeight: "800",
  },
  dailyTitle: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
    width: "78%",
  },
  statueScene: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  statueGlow: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: "rgba(76, 184, 196, 0.20)",
  },
  statuePedestal: {
    position: "absolute",
    bottom: 28,
    width: 82,
    height: 14,
    backgroundColor: "#44311f",
    borderRadius: 6,
  },
  statueBody: {
    position: "absolute",
    bottom: 42,
    width: 66,
    height: 112,
    borderRadius: 26,
    backgroundColor: "#c0b59c",
  },
  statueHead: {
    position: "absolute",
    bottom: 146,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#d1c7ac",
  },
  statueArmLeft: {
    position: "absolute",
    bottom: 96,
    left: "39%",
    width: 14,
    height: 70,
    borderRadius: 8,
    backgroundColor: "#c0b59c",
    transform: [{ rotate: "18deg" }],
  },
  statueArmRight: {
    position: "absolute",
    bottom: 96,
    right: "39%",
    width: 14,
    height: 70,
    borderRadius: 8,
    backgroundColor: "#c0b59c",
    transform: [{ rotate: "-18deg" }],
  },
  libraryScene: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingTop: 18,
    paddingBottom: 36,
    gap: 4,
  },
  libraryColumn: {
    flex: 1,
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 3,
    paddingVertical: 6,
  },
  libraryShelfRow: {
    height: 18,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  book: {
    width: 4,
    height: 16,
    borderRadius: 2,
  },
  featuredHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  featuredHeaderText: {
    color: "#161616",
    fontSize: 16,
    fontWeight: "700",
  },
  featuredCard: {
    backgroundColor: "#ffffff",
    borderRadius: 34,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  featuredArt: {
    height: 162,
    borderRadius: 30,
    backgroundColor: "#fff8e9",
    overflow: "hidden",
    position: "relative",
    marginBottom: 16,
  },
  cafeArch: {
    position: "absolute",
    top: -52,
    alignSelf: "center",
    width: 180,
    height: 120,
    borderRadius: 90,
    borderWidth: 14,
    borderColor: "#2c4a76",
  },
  cafeCounter: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 54,
    backgroundColor: "#86501e",
    borderTopWidth: 5,
    borderTopColor: "#573010",
  },
  cafeLamp: {
    position: "absolute",
    top: 12,
    left: 72,
    width: 18,
    height: 26,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: "#d6a85e",
  },
  cafePersonLeft: {
    position: "absolute",
    left: 34,
    bottom: 36,
    width: 14,
    height: 38,
    borderRadius: 7,
    backgroundColor: "#2b5f9a",
  },
  cafePersonCenter: {
    position: "absolute",
    left: 56,
    bottom: 36,
    width: 16,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#f4b18b",
  },
  cafePersonRight: {
    position: "absolute",
    left: 82,
    bottom: 36,
    width: 16,
    height: 42,
    borderRadius: 8,
    backgroundColor: "#67a5a4",
  },
  featuredPointsPill: {
    position: "absolute",
    right: 12,
    top: 12,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  featuredPointsText: {
    color: "#2164ff",
    fontSize: 14,
    fontWeight: "800",
  },
  featuredTitle: {
    color: "#141414",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  featuredDescription: {
    color: "#6e7382",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 18,
  },
  acceptButton: {
    backgroundColor: "#2b6ff4",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  acceptButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  sectionTitle: {
    color: "#121212",
    fontSize: 18,
    fontWeight: "700",
  },
  sectionLink: {
    color: "#2164ff",
    fontSize: 14,
    fontWeight: "700",
  },
  leaderboard: {
    gap: 10,
  },
  leaderRow: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  leaderRowHighlighted: {
    backgroundColor: "#2164ff",
  },
  rankText: {
    width: 34,
    color: "#531d56",
    fontSize: 16,
    fontWeight: "800",
    fontStyle: "italic",
  },
  rankTextHighlighted: {
    color: "#d7e5ff",
  },
  leaderAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#16385d",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  leaderAvatarText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "800",
  },
  leaderMeta: {
    flex: 1,
  },
  leaderName: {
    color: "#141414",
    fontSize: 16,
    fontWeight: "700",
  },
  leaderNameHighlighted: {
    color: "#ffffff",
  },
  leaderLabel: {
    color: "#8a8f9b",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  leaderLabelHighlighted: {
    color: "#d7e5ff",
  },
  leaderPoints: {
    color: "#2164ff",
    fontSize: 16,
    fontWeight: "800",
  },
  leaderPointsHighlighted: {
    color: "#ffffff",
  },
  progressCard: {
    backgroundColor: "#ffffff",
    borderRadius: 34,
    paddingHorizontal: 26,
    paddingVertical: 22,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  progressLabel: {
    color: "#2164ff",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  progressTier: {
    color: "#141414",
    fontSize: 20,
    fontWeight: "800",
  },
  progressPercent: {
    color: "#141414",
    fontSize: 20,
    fontWeight: "800",
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "#e3e6ec",
    overflow: "hidden",
    marginBottom: 16,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#5e8fff",
  },
  progressNote: {
    color: "#5f6574",
    fontSize: 16,
    lineHeight: 22,
  },
  progressNoteAccent: {
    color: "#2164ff",
    fontWeight: "800",
  },
});
