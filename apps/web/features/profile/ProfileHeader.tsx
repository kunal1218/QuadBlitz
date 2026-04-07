"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Tag } from "@/components/Tag";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import { deriveCollegeFromEmail } from "@/lib/college";
import { profile } from "./mock";

type MovementMode = "relative" | "absolute";

type ProfileHeaderProps = {
  isEditing?: boolean;
  movementMode?: MovementMode;
  onEditToggle?: () => void;
  onSaveLayout?: () => void;
  onCancelLayout?: () => void;
  onMovementModeChange?: (mode: MovementMode) => void;
  layoutError?: string | null;
};

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

const toggleBaseClasses =
  "rounded-full px-3 py-1 text-xs font-semibold transition";

export const ProfileHeader = ({
  isEditing = false,
  movementMode = "relative",
  onEditToggle,
  onSaveLayout,
  onCancelLayout,
  onMovementModeChange,
  layoutError,
}: ProfileHeaderProps) => {
  const { user, token, openAuthModal, refreshUser } = useAuth();
  const [isGrantingCoins, setGrantingCoins] = useState(false);
  const [coinGrantMessage, setCoinGrantMessage] = useState<string | null>(null);
  const [coinGrantAmount, setCoinGrantAmount] = useState(100);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const displayName = user?.name ?? profile.name;
  const displayHandle = user?.handle ?? profile.handle;
  const displayCollege =
    user?.collegeName ?? (user?.email ? deriveCollegeFromEmail(user.email) : null);
  const showGrantCoins = Boolean(user?.isAdmin);

  useEffect(() => {
    if (!user?.id) {
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

      const index = entries.findIndex((entry) => entry.id === user.id);
      setLeaderboardRank(index >= 0 ? index + 1 : null);
    };

    loadLeaderboard().catch(() => {
      if (!isActive) return;
      setLeaderboardRank(null);
    });

    return () => {
      isActive = false;
    };
  }, [token, user?.id]);

  const handleGrantCoins = async () => {
    if (!user?.id) {
      return;
    }
    if (!token) {
      openAuthModal("login");
      return;
    }
    setGrantingCoins(true);
    setCoinGrantMessage(null);
    try {
      await apiPost(
        `/admin/users/${encodeURIComponent(user.id)}/coins`,
        { amount: coinGrantAmount },
        token
      );
      await refreshUser();
      setCoinGrantMessage(`Added ${coinGrantAmount.toLocaleString()} coins.`);
    } catch (error) {
      setCoinGrantMessage(
        error instanceof Error ? error.message : "Unable to grant coins."
      );
    } finally {
      setGrantingCoins(false);
    }
  };

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute -right-16 -top-12 h-32 w-32 rounded-full bg-accent/20 blur-2xl" />
      <div className="absolute -bottom-10 left-16 h-24 w-24 rounded-full bg-accent-2/20 blur-2xl" />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Avatar
            name={displayName}
            avatarUrl={user?.avatarUrl}
            size={72}
            className="text-2xl"
          />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-display text-2xl font-semibold text-ink">
                {displayName}
              </p>
              {leaderboardRank && (
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                  Leaderboard #{leaderboardRank}
                </span>
              )}
            </div>
            <p className="text-sm text-muted">
              {displayHandle}
              {displayCollege && (
                <span className="text-muted">
                  <span className="px-2" aria-hidden="true">
                    ·
                  </span>
                  {displayCollege}
                </span>
              )}
            </p>
            <p className="mt-2 text-sm text-ink/80">{profile.bio}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {profile.badges.map((badge) => (
                <Tag key={badge} tone="sun">
                  {badge}
                </Tag>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-start gap-3 md:items-end">
          {showGrantCoins && (
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
          {isEditing ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-full border border-card-border/70 bg-white/80 p-1">
                <button
                  type="button"
                  className={`${toggleBaseClasses} ${
                    movementMode === "relative"
                      ? "bg-accent/15 text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                  onClick={() => onMovementModeChange?.("relative")}
                >
                  Relative
                </button>
                <button
                  type="button"
                  className={`${toggleBaseClasses} ${
                    movementMode === "absolute"
                      ? "bg-accent/15 text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                  onClick={() => onMovementModeChange?.("absolute")}
                >
                  Absolute
                </button>
              </div>
              <Button variant="profile" requiresAuth={false} onClick={onSaveLayout}>
                Save layout
              </Button>
              <Button variant="outline" requiresAuth={false} onClick={onCancelLayout}>
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button variant="profile" onClick={onEditToggle}>
                Customize
              </Button>
              <Button variant="profile">Share vibe</Button>
            </>
          )}
          {coinGrantMessage && (
            <p className="text-xs font-semibold text-emerald-600">
              {coinGrantMessage}
            </p>
          )}
        </div>
      </div>
      {isEditing && layoutError && (
        <p className="mt-4 text-xs font-semibold text-accent">{layoutError}</p>
      )}
    </Card>
  );
};
