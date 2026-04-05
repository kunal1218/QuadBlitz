"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RequestCard as RequestCardType } from "@lockedin/shared";
import {
  RequestCard,
  RequestComposer,
  RequestFilters,
  type ProximityFilter,
  type RecencyFilter,
  type RequestComposerPayload,
  type SortOption,
  type UrgencyFilter,
} from "@/features/requests";
import { useAuth } from "@/features/auth";
import { apiDelete, apiGet, apiPost } from "@/lib/api";

const recencyToHours: Record<Exclude<RecencyFilter, "all">, number> = {
  "1h": 1,
  "24h": 24,
  "168h": 168,
};

const normalizeTag = (value: string) => value.trim().toLowerCase();

export default function RequestsPage() {
  const { token, isAuthenticated, openAuthModal, user } = useAuth();
  const [requests, setRequests] = useState<RequestCardType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recency, setRecency] = useState<RecencyFilter>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recency");
  const [proximity, setProximity] = useState<ProximityFilter>("all");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isPosting, setIsPosting] = useState(false);
  const [helpingIds, setHelpingIds] = useState<Set<string>>(new Set());
  const [helpedIds, setHelpedIds] = useState<Set<string>>(new Set());
  const [likingIds, setLikingIds] = useState<Set<string>>(new Set());
  const likeInFlightRef = useRef<Set<string>>(new Set());
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [autoPruneActive, setAutoPruneActive] = useState(false);

  const hasActiveRequest = useMemo(
    () => Boolean(user?.id && requests.some((request) => request.creator.id === user.id)),
    [requests, user?.id]
  );

  const availableCategories = useMemo(
    () =>
      Array.from(
        new Set(
          requests.flatMap((request) =>
            request.tags.map((tag) => tag.trim()).filter(Boolean)
          )
        )
      ).sort((a, b) => a.localeCompare(b)),
    [requests]
  );

  useEffect(() => {
    if (
      selectedCategory &&
      !availableCategories.some(
        (category) => normalizeTag(category) === normalizeTag(selectedCategory)
      )
    ) {
      setSelectedCategory(null);
    }
  }, [availableCategories, selectedCategory]);

  const sortedRequests = useMemo(() => {
    const filteredByUrgency =
      urgencyFilter === "all"
        ? requests
        : requests.filter((req) => (req.urgency ?? "low") === urgencyFilter);

    const filteredByProximity =
      proximity === "all"
        ? filteredByUrgency
        : filteredByUrgency.filter((req) =>
            proximity === "remote" ? req.isRemote : !req.isRemote
          );

    const filtered =
      selectedCategory === null
        ? filteredByProximity
        : filteredByProximity.filter((req) =>
            req.tags.some(
              (tag) => normalizeTag(tag) === normalizeTag(selectedCategory)
            )
          );

    const byRecency = (a: RequestCardType, b: RequestCardType) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const byLikes = (a: RequestCardType, b: RequestCardType) => {
      if (b.likeCount !== a.likeCount) {
        return b.likeCount - a.likeCount;
      }
      return byRecency(a, b);
    };

    const urgencyRank = (value?: string | null) => {
      const normalized = (value ?? "low").toLowerCase();
      if (normalized === "high") {
        return 3;
      }
      if (normalized === "medium") {
        return 2;
      }
      return 1;
    };

    const byUrgency = (a: RequestCardType, b: RequestCardType) => {
      const diff = urgencyRank(b.urgency) - urgencyRank(a.urgency);
      if (diff !== 0) {
        return diff;
      }
      return byRecency(a, b);
    };

    const sorter =
      sortBy === "likes" ? byLikes : sortBy === "urgency" ? byUrgency : byRecency;

    return [...filtered].sort(sorter);
  }, [proximity, requests, selectedCategory, sortBy, urgencyFilter]);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set("order", "newest");
    if (recency !== "all") {
      params.set("sinceHours", recencyToHours[recency].toString());
    }

    try {
      const response = await apiGet<
        | { requests: RequestCardType[]; meta?: { autoPruneActive?: boolean } }
        | RequestCardType[]
      >(`/requests?${params.toString()}`, token ?? undefined);
      const next = Array.isArray(response) ? response : response?.requests ?? [];
      setRequests(next);
      setHelpedIds(new Set(next.filter((item) => item.helpedByUser).map((item) => item.id)));
      setAutoPruneActive(
        !Array.isArray(response) && Boolean(response?.meta?.autoPruneActive)
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load requests."
      );
      setAutoPruneActive(false);
    } finally {
      setIsLoading(false);
    }
  }, [recency, token]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleCreateRequest = async (payload: RequestComposerPayload) => {
    if (!token) {
      openAuthModal("login");
      return;
    }

    setIsPosting(true);
    setError(null);
    try {
      const requestBody = {
        ...payload,
        location: payload.isRemote
          ? "Remote"
          : payload.city && payload.city.trim()
            ? payload.city.trim()
            : "Unknown",
      };
      const response = await apiPost<{ request: RequestCardType }>(
        "/requests",
        requestBody,
        token
      );
      setRequests((prev) => [response.request, ...prev]);
      setComposerOpen(false);
    } catch (postError) {
      setError(
        postError instanceof Error
          ? postError.message
          : "Unable to post your request."
      );
    } finally {
      setIsPosting(false);
    }
  };

  const handleHelp = async (request: RequestCardType) => {
    if (!token) {
      openAuthModal("signup");
      return;
    }

    setError(null);
    const isAlreadyHelped = helpedIds.has(request.id);
    setHelpingIds((prev) => new Set(prev).add(request.id));

    try {
      if (isAlreadyHelped) {
        await apiDelete(`/requests/${encodeURIComponent(request.id)}/help`, token);
        setHelpedIds((prev) => {
          const next = new Set(prev);
          next.delete(request.id);
          return next;
        });
        setRequests((prev) =>
          prev.map((item) =>
            item.id === request.id ? { ...item, helpedByUser: false } : item
          )
        );
      } else {
        await apiPost(`/requests/${encodeURIComponent(request.id)}/help`, {}, token);
        setHelpedIds((prev) => new Set(prev).add(request.id));
        setRequests((prev) =>
          prev.map((item) =>
            item.id === request.id ? { ...item, helpedByUser: true } : item
          )
        );
      }
    } catch (helpError) {
      setError(
        helpError instanceof Error
          ? helpError.message
          : "Unable to send help offer."
      );
    } finally {
      setHelpingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
    }
  };

  const handleLike = async (request: RequestCardType) => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    if (likeInFlightRef.current.has(request.id)) {
      return;
    }

    likeInFlightRef.current.add(request.id);

    const previousLiked = request.likedByUser;
    const previousLikeCount = request.likeCount;
    const optimisticLiked = !previousLiked;
    const optimisticLikeCount = Math.max(
      0,
      previousLikeCount + (optimisticLiked ? 1 : -1)
    );

    setError(null);
    setLikingIds((prev) => new Set(prev).add(request.id));
    setRequests((prev) =>
      prev.map((item) =>
        item.id === request.id
          ? { ...item, likeCount: optimisticLikeCount, likedByUser: optimisticLiked }
          : item
      )
    );

    try {
      const response = await apiPost<{ likeCount: number; liked: boolean }>(
        `/requests/${encodeURIComponent(request.id)}/like`,
        {},
        token
      );
      setRequests((prev) =>
        prev.map((item) => {
          if (item.id !== request.id) {
            return item;
          }
          if (item.likedByUser === response.liked) {
            return item;
          }
          return {
            ...item,
            likedByUser: response.liked,
            likeCount: Math.max(0, item.likeCount + (response.liked ? 1 : -1)),
          };
        })
      );
    } catch (likeError) {
      setRequests((prev) =>
        prev.map((item) =>
          item.id === request.id
            ? { ...item, likeCount: previousLikeCount, likedByUser: previousLiked }
            : item
        )
      );
      setError(
        likeError instanceof Error
          ? likeError.message
          : "Unable to update likes."
      );
    } finally {
      setLikingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.id);
        return next;
      });
      likeInFlightRef.current.delete(request.id);
    }
  };

  const handleDelete = async (request: RequestCardType) => {
    if (!token) {
      openAuthModal("login");
      return;
    }

    const confirmed = window.confirm("Delete this request? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setError(null);
    try {
      await apiDelete(`/requests/${encodeURIComponent(request.id)}`, token);
      setRequests((prev) => prev.filter((item) => item.id !== request.id));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete request."
      );
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(219,231,255,0.85),transparent_32%),linear-gradient(180deg,#f8fbff_0%,#f1f6ff_100%)]">
      <div className="mx-auto max-w-[1280px] px-5 pb-20 pt-6 sm:px-8 lg:px-10">
        <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-[98px] lg:h-fit">
            <RequestFilters
              recency={recency}
              onRecencyChange={setRecency}
              urgency={urgencyFilter}
              onUrgencyChange={setUrgencyFilter}
              sortBy={sortBy}
              onSortChange={setSortBy}
              proximity={proximity}
              onProximityChange={setProximity}
              categories={availableCategories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          </div>

          <section className="space-y-6">
            <div className="rounded-[38px] border border-[#d9e4fb] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(243,247,255,0.96)_52%,rgba(255,255,255,0.98)_100%)] px-6 py-7 shadow-[0_30px_75px_rgba(39,78,162,0.1)] sm:px-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-[680px]">
                  <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#7d8dac]">
                    Campus Help Board
                  </p>
                  <h1 className="mt-3 text-[42px] font-[800] leading-[0.98] tracking-[-0.08em] text-[#161d29] sm:text-[52px]">
                    Requests
                  </h1>
                  <p className="mt-4 max-w-[620px] text-[15px] leading-[1.85] text-[#5d6980] sm:text-[16px]">
                    Ask for help, offer a hand, or spin up a spontaneous mission
                    around campus in the new requests feed.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <span className="rounded-full border border-[#dbe5fb] bg-white px-4 py-[10px] text-[12px] font-semibold text-[#526079]">
                      {requests.length} active request{requests.length === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full border border-[#dbe5fb] bg-white px-4 py-[10px] text-[12px] font-semibold text-[#526079]">
                      {availableCategories.length} categor
                      {availableCategories.length === 1 ? "y" : "ies"}
                    </span>
                    <span className="rounded-full border border-[#dbe5fb] bg-white px-4 py-[10px] text-[12px] font-semibold text-[#526079]">
                      Sorted by {sortBy}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-3">
                  <button
                    type="button"
                    className="rounded-full bg-[#1456f4] px-6 py-[14px] text-[13px] font-semibold text-white shadow-[0_18px_36px_rgba(20,86,244,0.26)] transition hover:bg-[#0f4ddd]"
                    onClick={() => {
                      if (!isAuthenticated) {
                        openAuthModal("signup");
                        return;
                      }
                      if (hasActiveRequest) {
                        setError(
                          "You already have an active request. Delete it to post another."
                        );
                        return;
                      }
                      setComposerOpen(true);
                    }}
                  >
                    Post a request
                  </button>
                  <p className="max-w-[240px] text-[12px] leading-[1.7] text-[#7a879d]">
                    One live request per person keeps the board clean and easy to act
                    on.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="rounded-[28px] border border-[#ffd7e2] bg-[#fff2f6] px-5 py-4 text-[14px] font-medium text-[#cc3e67] shadow-[0_18px_45px_rgba(204,62,103,0.08)]">
                {error}
              </div>
            )}

            {autoPruneActive && (
              <div className="rounded-[28px] border border-[#f6e6c6] bg-[#fff9eb] px-5 py-4 text-[14px] font-medium text-[#9f6b00] shadow-[0_18px_45px_rgba(159,107,0,0.08)]">
                High volume mode is on. Requests older than two weeks may be removed
                automatically.
              </div>
            )}

            {isLoading ? (
              <div className="rounded-[34px] border border-[#d9e4fb] bg-white/90 px-6 py-10 text-[15px] font-medium text-[#6d7890] shadow-[0_28px_70px_rgba(39,78,162,0.08)]">
                Loading requests...
              </div>
            ) : sortedRequests.length === 0 ? (
              <div className="rounded-[34px] border border-[#d9e4fb] bg-white/95 px-6 py-12 shadow-[0_28px_70px_rgba(39,78,162,0.08)] sm:px-8">
                <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#7d8dac]">
                  No matching posts
                </p>
                <h2 className="mt-3 text-[30px] font-[800] tracking-[-0.06em] text-[#1a212f]">
                  The board is clear right now.
                </h2>
                <p className="mt-4 max-w-[540px] text-[15px] leading-[1.8] text-[#5d6980]">
                  Try widening the filters or post the first request so other people
                  can jump in.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedRequests.map((request) => (
                  <RequestCard
                    key={request.id}
                    request={request}
                    onHelp={handleHelp}
                    isHelping={helpingIds.has(request.id)}
                    hasHelped={helpedIds.has(request.id)}
                    isOwnRequest={request.creator.id === user?.id}
                    onLike={handleLike}
                    isLiking={likingIds.has(request.id)}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {isComposerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto px-4 py-10 sm:py-16">
            <div
              className="absolute inset-0 bg-[rgba(17,24,39,0.34)] backdrop-blur-md"
              onClick={() => setComposerOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-3xl">
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  className="rounded-full border border-[#dbe5fb] bg-white/95 px-4 py-[11px] text-[12px] font-semibold text-[#5f6d83] shadow-[0_18px_40px_rgba(35,72,152,0.12)] transition hover:border-[#c8d8fb] hover:text-[#1456f4]"
                  onClick={() => setComposerOpen(false)}
                >
                  Close
                </button>
              </div>
              <RequestComposer
                onSubmit={handleCreateRequest}
                isSaving={isPosting}
                disabled={!isAuthenticated}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
