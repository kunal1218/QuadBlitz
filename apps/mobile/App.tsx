import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type AuthPayload, type AuthUser, getMe, login, signup } from "./src/api/actions";
import { AuthScreen } from "./src/screens/AuthScreen";
import { FeedTab } from "./src/screens/tabs/FeedTab";
import { ChallengesTab } from "./src/screens/tabs/ChallengesTab";
import { FriendsTab } from "./src/screens/tabs/FriendsTab";
import { GroupsTab } from "./src/screens/tabs/GroupsTab";
import { MarketplaceTab } from "./src/screens/tabs/MarketplaceTab";
import { MapTab } from "./src/screens/tabs/MapTab";
import { formatError } from "./src/lib/errors";
import { persistAuth, readStoredAuth } from "./src/lib/storage";
import { styles } from "./src/styles/ui";

type TabIconName = ComponentProps<typeof Ionicons>["name"];

const appTabs: ReadonlyArray<{
  id: "home" | "challenges" | "map" | "groups" | "marketplace";
  label: string;
  icon: TabIconName;
  iconActive: TabIconName;
}> = [
  { id: "home", label: "Home", icon: "home-outline", iconActive: "home" },
  { id: "challenges", label: "Challenges", icon: "trophy-outline", iconActive: "trophy" },
  { id: "map", label: "Maps", icon: "map-outline", iconActive: "map" },
  { id: "groups", label: "Groups", icon: "people-outline", iconActive: "people" },
  {
    id: "marketplace",
    label: "Market",
    icon: "storefront-outline",
    iconActive: "storefront",
  },
] as const;

type AppTab = (typeof appTabs)[number]["id"] | "chat";

export default function App() {
  const [auth, setAuth] = useState<AuthPayload | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [booting, setBooting] = useState(true);
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const bootstrap = useCallback(async () => {
    setBooting(true);
    setAuthError(null);

    try {
      const stored = await readStoredAuth();
      if (!stored?.token) {
        setAuth(null);
        return;
      }

      const payload = await getMe(stored.token);
      const nextAuth = {
        user: payload.user,
        token: stored.token,
      };
      setAuth(nextAuth);
      await persistAuth(nextAuth);
    } catch {
      setAuth(null);
      await persistAuth(null);
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const updateAuth = useCallback(async (payload: AuthPayload | null) => {
    setAuth(payload);
    await persistAuth(payload);
  }, []);

  const handleLogin = useCallback(
    async (params: { email: string; password: string }) => {
      setAuthPending(true);
      setAuthError(null);
      try {
        const payload = await login(params);
        await updateAuth(payload);
      } catch (error) {
        setAuthError(formatError(error));
        throw error;
      } finally {
        setAuthPending(false);
      }
    },
    [updateAuth]
  );

  const handleSignup = useCallback(
    async (params: {
      name: string;
      email: string;
      password: string;
      handle?: string;
    }) => {
      setAuthPending(true);
      setAuthError(null);
      try {
        const payload = await signup(params);
        await updateAuth(payload);
      } catch (error) {
        setAuthError(formatError(error));
        throw error;
      } finally {
        setAuthPending(false);
      }
    },
    [updateAuth]
  );

  const handleLogout = useCallback(async () => {
    await updateAuth(null);
    setActiveTab("home");
  }, [updateAuth]);

  const handleAuthExpired = useCallback(() => {
    setAuthError("Session expired. Please log in again.");
    void handleLogout();
  }, [handleLogout]);

  const activeSession = useMemo(() => {
    if (!auth?.token || !auth.user) {
      return null;
    }
    return {
      token: auth.token,
      user: auth.user,
    };
  }, [auth]);

  if (booting) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
        <StatusBar style="dark" />
        <View style={styles.loaderContainer}>
          <ActivityIndicator color="#2563eb" size="large" />
          <Text style={styles.mutedText}>Loading session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!activeSession) {
    return (
      <AuthScreen
        submitting={authPending}
        error={authError}
        onLogin={handleLogin}
        onSignup={handleSignup}
      />
    );
  }

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={activeTab === "map" ? ["left", "right"] : ["top", "left", "right"]}
    >
      <StatusBar style="dark" />
      <View
        style={[
          styles.body,
          activeTab !== "map" && activeTab !== "home" && activeTab !== "groups"
            ? styles.bodyWithBottomInset
            : null,
        ]}
      >
        {activeTab === "home" ? (
          <FeedTab
            token={activeSession.token}
            user={activeSession.user}
            onAuthExpired={handleAuthExpired}
            onOpenChat={() => setActiveTab("chat")}
          />
        ) : null}
        {activeTab === "challenges" ? (
          <ChallengesTab
            token={activeSession.token}
            user={activeSession.user}
            onAuthExpired={handleAuthExpired}
          />
        ) : null}
        {activeTab === "chat" ? (
          <FriendsTab
            token={activeSession.token}
            user={activeSession.user}
            onAuthExpired={handleAuthExpired}
          />
        ) : null}
        {activeTab === "marketplace" ? (
          <MarketplaceTab
            token={activeSession.token}
            user={activeSession.user}
            onAuthExpired={handleAuthExpired}
          />
        ) : null}
        {activeTab === "map" ? (
          <MapTab
            token={activeSession.token}
            user={activeSession.user}
            onAuthExpired={handleAuthExpired}
          />
        ) : null}
        {activeTab === "groups" ? (
          <GroupsTab
            token={activeSession.token}
            user={activeSession.user}
            onAuthExpired={handleAuthExpired}
          />
        ) : null}
      </View>

      <View style={styles.bottomNavOuter}>
        <View style={styles.bottomNav}>
          {appTabs.map((tab) => {
            const isActive = activeTab === tab.id;

            return (
              <Pressable
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                style={[styles.bottomTab, isActive ? styles.bottomTabActive : null]}
              >
                <View style={[styles.bottomTabIconWrap, isActive ? styles.bottomTabIconWrapActive : null]}>
                  <Ionicons
                    name={isActive ? tab.iconActive : tab.icon}
                    size={20}
                    color={isActive ? "#ffffff" : "#98a2b3"}
                  />
                </View>
                <Text style={[styles.bottomTabText, isActive ? styles.bottomTabTextActive : null]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
