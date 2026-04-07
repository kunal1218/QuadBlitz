"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/features/auth";
import { apiGet } from "@/lib/api";
import { Card } from "@/components/Card";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

const toHandleSlug = (handle: string) => handle.replace(/^@/, "").trim();

export default function LeaderboardPage() {
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setEntries([]);
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    const load = async () => {
      try {
        const payload = await apiGet<{ entries: LeaderboardEntry[] }>(
          "/leaderboard",
          token
        );
        if (isActive) {
          setEntries(payload.entries ?? []);
        }
      } catch (err) {
        if (!isActive) return;
        setError(
          err instanceof Error ? err.message : "Unable to load leaderboard."
        );
      }
    };

    load()
      .catch((err) => {
        if (!isActive) return;
        setError(err instanceof Error ? err.message : "Unable to load leaderboard.");
      })
      .finally(() => {
        if (!isActive) return;
        setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-2 sm:pb-20 lg:pb-24">
      <div className="flex flex-col items-start gap-2">
        <h1 className="font-display text-2xl font-semibold text-ink">Leaderboard</h1>
        <p className="text-sm text-muted">
          Whoever has the most coins at the end of every month wins a prize!
        </p>
      </div>

      <Card className="mt-6">
        {!isAuthenticated ? (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted">
              Log in to see the latest leaderboard.
            </p>
            <Button onClick={() => openAuthModal("login")}>Log in</Button>
          </div>
        ) : isLoading ? (
          <p className="text-sm text-muted">Loading leaderboard...</p>
        ) : error ? (
          <p className="text-sm text-rose-500">{error}</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted">No coins earned yet this month.</p>
        ) : (
          <div className="divide-y divide-card-border/60">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-4 py-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-ink">
                    {index + 1}
                  </div>
                  <button
                    type="button"
                    className="rounded-full"
                    onClick={() => {
                      const handleSlug = toHandleSlug(entry.handle ?? "");
                      const profileIdentifier = handleSlug || entry.id;
                      if (!profileIdentifier) {
                        return;
                      }
                      if (user?.id === entry.id) {
                        router.push("/profile");
                        return;
                      }
                      router.push(`/profile/${encodeURIComponent(profileIdentifier)}`);
                    }}
                    aria-label={`View ${entry.name} profile`}
                    data-profile-link
                  >
                    <Avatar name={entry.name} size={36} />
                  </button>
                  <div>
                    <p className="text-sm font-semibold text-ink">{entry.name}</p>
                    <p className="text-xs text-muted">{entry.handle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <span role="img" aria-label="points">
                    🪙
                  </span>
                  <span>{entry.coins}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
