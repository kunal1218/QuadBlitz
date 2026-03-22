"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { deriveCollegeFromDomain } from "@/lib/college";
import { formatRelativeTime } from "@/lib/time";

type NotificationActor = {
  id: string;
  name: string;
  handle: string;
};

type NotificationItem = {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  actor: NotificationActor | null;
  messageId: string | null;
  messagePreview: string | null;
  contextId: string | null;
};

type NotificationsResponse = {
  notifications: NotificationItem[];
};

type FriendUser = {
  id: string;
  name: string;
  handle: string;
  collegeName?: string | null;
  collegeDomain?: string | null;
};

type FriendRequest = {
  id: string;
  createdAt: string;
  requester: FriendUser;
  recipient: FriendUser;
};

type FriendSummary = {
  incoming: FriendRequest[];
};

type RelationshipStatus =
  | "none"
  | "incoming"
  | "outgoing"
  | "friends"
  | "blocked"
  | "blocked_by"
  | "unknown";

type NotificationFilter = "all" | "requests" | "groups" | "market";

type FeedItem =
  | {
      kind: "friend_request";
      id: string;
      createdAt: string;
      request: FriendRequest;
    }
  | {
      kind: "notification";
      id: string;
      createdAt: string;
      notification: NotificationItem;
    };

const getCollegeLabel = (user: FriendUser) => {
  return (
    user.collegeName ??
    deriveCollegeFromDomain(user.collegeDomain ?? "")
  );
};

const primaryActionClasses =
  "inline-flex items-center justify-center rounded-full bg-[#1456f4] px-4 py-[9px] text-[12px] font-semibold text-white shadow-[0_12px_24px_rgba(20,86,244,0.18)] transition hover:brightness-[1.03]";
const secondaryActionClasses =
  "inline-flex items-center justify-center rounded-full bg-[#edf1f6] px-4 py-[9px] text-[12px] font-semibold text-[#555d6b] transition hover:bg-[#e5eaf1]";
const ghostActionClasses =
  "inline-flex items-center justify-center rounded-full border border-[#e7edf6] bg-white px-4 py-[9px] text-[12px] font-semibold text-[#657085] transition hover:border-[#d9e2ee] hover:text-[#2a2f3a]";
const filterPillBase =
  "inline-flex items-center rounded-full px-[13px] py-[5px] text-[10px] font-semibold uppercase tracking-[0.12em] transition";

const BellBadgeIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className="h-[10px] w-[10px]">
    <path
      d="M9 2.8a3.1 3.1 0 0 0-3.1 3.1v1.35c0 .72-.22 1.42-.64 2l-1.13 1.58h9.76l-1.13-1.58a3.48 3.48 0 0 1-.64-2V5.9A3.1 3.1 0 0 0 9 2.8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.3 12.4a1.7 1.7 0 0 0 3.4 0"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const FriendBadgeIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className="h-[10px] w-[10px]">
    <circle cx="7" cy="7" r="2.1" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12.1" cy="6.4" r="1.8" stroke="currentColor" strokeWidth="1.6" />
    <path
      d="M4.5 13.5c.44-1.8 1.82-2.88 3.9-2.88 2.13 0 3.52 1.08 3.96 2.88M10.7 10.7c1.3.14 2.22.72 2.78 1.76"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  </svg>
);

const GroupBadgeIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className="h-[10px] w-[10px]">
    <path
      d="M5 5.2h8a.8.8 0 0 1 .8.8v6a.8.8 0 0 1-.8.8H5a.8.8 0 0 1-.8-.8V6a.8.8 0 0 1 .8-.8Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
    <path d="M6.9 8.9h4.2M6.9 10.8h2.8" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
  </svg>
);

const MarketBadgeIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className="h-[10px] w-[10px]">
    <path
      d="M4.2 6h9.6v5.4a.8.8 0 0 1-.8.8H5a.8.8 0 0 1-.8-.8V6Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
    <path
      d="M6 6V4.95a3 3 0 0 1 6 0V6"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
    />
  </svg>
);

const HelpBadgeIcon = () => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" className="h-[10px] w-[10px]">
    <path
      d="M6.2 9.1 8 10.8l3.8-3.6M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const getMarketContent = (preview: string | null) => {
  if (!preview) {
    return { topic: null, body: null };
  }
  const separatorIndex = preview.indexOf(":");
  if (separatorIndex === -1) {
    return { topic: null, body: preview };
  }
  return {
    topic: preview.slice(0, separatorIndex).trim(),
    body: preview.slice(separatorIndex + 1).trim() || null,
  };
};

const getFilterLabel = (filter: NotificationFilter) => {
  switch (filter) {
    case "requests":
      return "Requests";
    case "groups":
      return "Groups";
    case "market":
      return "Market";
    default:
      return "All";
  }
};

export default function NotificationsPage() {
  const { token, isAuthenticated, openAuthModal } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [relationshipByHandle, setRelationshipByHandle] = useState<
    Record<string, RelationshipStatus>
  >({});
  const [connectingHandles, setConnectingHandles] = useState<Set<string>>(
    new Set()
  );
  const [connectError, setConnectError] = useState<string | null>(null);
  const [clubDecisionError, setClubDecisionError] = useState<string | null>(null);
  const [clubDecisionLoading, setClubDecisionLoading] = useState<Set<string>>(
    new Set()
  );
  const [clubDecisionByNotification, setClubDecisionByNotification] = useState<
    Record<string, "approved" | "denied">
  >({});

  const refreshFriendRequests = useCallback(async () => {
    if (!token) {
      setFriendRequests([]);
      setIsLoadingRequests(false);
      setRequestsError(null);
      return;
    }
    setIsLoadingRequests(true);
    setRequestsError(null);
    try {
      const payload = await apiGet<FriendSummary>("/friends/summary", token);
      setFriendRequests(payload.incoming ?? []);
    } catch (loadError) {
      setRequestsError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load friend requests."
      );
    } finally {
      setIsLoadingRequests(false);
    }
  }, [token]);

  const handleAcceptRequest = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    await apiPost(`/friends/requests/accept/${encodeURIComponent(handle)}`, {}, token);
    await refreshFriendRequests();
  };

  const handleDeclineRequest = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    await apiDelete(`/friends/requests/with/${encodeURIComponent(handle)}`, token);
    await refreshFriendRequests();
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    apiGet<NotificationsResponse>("/notifications", token)
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setNotifications(payload.notifications);
        void apiPost("/notifications/read", {}, token).catch(() => {
          // Ignore read failures; list is still usable.
        });
      })
      .catch((loadError) => {
        if (!isActive) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load notifications."
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  useEffect(() => {
    refreshFriendRequests();
  }, [refreshFriendRequests]);

  useEffect(() => {
    if (!token) {
      setRelationshipByHandle({});
      return;
    }

    const handles = Array.from(
      new Set(
        notifications
          .filter((notification) => notification.type === "request_help")
          .map((notification) => notification.actor?.handle ?? "")
          .filter(Boolean)
          .map((handle) => handle.replace(/^@/, ""))
      )
    );

    if (handles.length === 0) {
      setRelationshipByHandle({});
      return;
    }

    let isActive = true;
    const loadStatuses = async () => {
      const entries = await Promise.all(
        handles.map(async (handle) => {
          try {
            const response = await apiGet<{ status: RelationshipStatus }>(
              `/friends/relationship/${encodeURIComponent(handle)}`,
              token
            );
            return [handle, response.status as RelationshipStatus] as const;
          } catch {
            return [handle, "unknown" as RelationshipStatus] as const;
          }
        })
      );
      if (!isActive) return;
      const next: Record<string, RelationshipStatus> = {};
      entries.forEach(([handle, status]) => {
        next[handle] = status;
      });
      setRelationshipByHandle(next);
    };

    void loadStatuses();

    return () => {
      isActive = false;
    };
  }, [notifications, token]);

  const handleConnect = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    const slug = handle.replace(/^@/, "");
    setConnectError(null);
    setConnectingHandles((prev) => new Set(prev).add(slug));
    try {
      await apiPost("/friends/requests", { handle }, token);
      setRelationshipByHandle((prev) => ({ ...prev, [slug]: "outgoing" }));
    } catch (connectErr) {
      setConnectError(
        connectErr instanceof Error
          ? connectErr.message
          : "Unable to send connect request."
      );
    } finally {
      setConnectingHandles((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }
  };

  const handleClubDecision = async (
    notificationId: string,
    clubId: string | null,
    applicantId: string | null,
    decision: "approve" | "deny"
  ) => {
    if (!token) {
      openAuthModal("login");
      return;
    }
    if (!clubId || !applicantId) {
      setClubDecisionError("Missing club or applicant details.");
      return;
    }
    setClubDecisionError(null);
    setClubDecisionLoading((prev) => new Set(prev).add(notificationId));
    try {
      await apiPost(
        `/clubs/${encodeURIComponent(clubId)}/applications/${encodeURIComponent(
          applicantId
        )}/${decision}`,
        {},
        token
      );
      setClubDecisionByNotification((prev) => ({
        ...prev,
        [notificationId]: decision === "approve" ? "approved" : "denied",
      }));
    } catch (decisionError) {
      setClubDecisionError(
        decisionError instanceof Error
          ? decisionError.message
          : "Unable to update that application."
      );
    } finally {
      setClubDecisionLoading((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const alerts = [error, requestsError, connectError, clubDecisionError].filter(
    Boolean
  ) as string[];

  const feedItems = useMemo<FeedItem[]>(() => {
    const requestItems: FeedItem[] = friendRequests.map((request) => ({
      kind: "friend_request",
      id: `friend-request:${request.id}`,
      createdAt: request.createdAt,
      request,
    }));

    const notificationItems: FeedItem[] = notifications.map((notification) => ({
      kind: "notification",
      id: `notification:${notification.id}`,
      createdAt: notification.createdAt,
      notification,
    }));

    return [...requestItems, ...notificationItems].sort((left, right) => {
      return (
        new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });
  }, [friendRequests, notifications]);

  const filterCounts = useMemo(() => {
    const counts: Record<NotificationFilter, number> = {
      all: feedItems.length,
      requests: 0,
      groups: 0,
      market: 0,
    };

    feedItems.forEach((item) => {
      if (item.kind === "friend_request") {
        counts.requests += 1;
        return;
      }

      if (item.notification.type === "request_help") {
        counts.requests += 1;
      } else if (item.notification.type === "club_application") {
        counts.groups += 1;
      } else if (item.notification.type === "marketplace_message") {
        counts.market += 1;
      }
    });

    return counts;
  }, [feedItems]);

  const filteredFeedItems = useMemo(() => {
    return feedItems.filter((item) => {
      if (activeFilter === "all") {
        return true;
      }
      if (item.kind === "friend_request") {
        return activeFilter === "requests";
      }
      if (activeFilter === "requests") {
        return item.notification.type === "request_help";
      }
      if (activeFilter === "groups") {
        return item.notification.type === "club_application";
      }
      if (activeFilter === "market") {
        return item.notification.type === "marketplace_message";
      }
      return true;
    });
  }, [activeFilter, feedItems]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-[760px] px-4 pb-16 pt-10">
        <div className="rounded-[30px] border border-[#e8edf6] bg-white px-8 py-10 text-center shadow-[0_18px_40px_rgba(24,35,61,0.06)]">
          <p className="text-[28px] font-[700] tracking-[-0.06em] text-[#20242d]">
            Notifications
          </p>
          <p className="mt-3 text-[14px] leading-[1.6] text-[#677284]">
            Sign in to see messages, requests, group activity, and marketplace updates.
          </p>
          <button
            type="button"
            className="mt-6 inline-flex rounded-full bg-[#1456f4] px-6 py-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-white shadow-[0_14px_28px_rgba(20,86,244,0.2)] transition hover:brightness-[1.03]"
            onClick={() => openAuthModal("login")}
          >
            Log in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[820px] px-4 pb-16 pt-8">
      <div>
        <div className="px-3">
          <h1 className="text-[30px] font-[700] tracking-[-0.06em] text-[#20242d]">
            Notifications
          </h1>
          <p className="mt-2 text-[14px] text-[#677284]">
            Keep up with messages, requests, group activity, and marketplace updates.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 px-3">
          {(["all", "requests", "groups", "market"] as NotificationFilter[]).map(
            (filter) => {
              const isActive = activeFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={`${filterPillBase} ${
                    isActive
                      ? "bg-[#1456f4] text-white shadow-[0_10px_20px_rgba(20,86,244,0.16)]"
                      : "bg-[#eef1f5] text-[#7b8494] hover:bg-[#e7ebf2]"
                  }`}
                >
                  {getFilterLabel(filter)}
                  {filterCounts[filter] > 0 ? ` · ${filterCounts[filter]}` : ""}
                </button>
              );
            }
          )}
        </div>

        {alerts.length > 0 && (
          <div className="mt-5 space-y-2 px-3">
            {alerts.map((alert, index) => (
              <div
                key={`${alert}-${index}`}
                className="rounded-[18px] border border-[#ffd9d7] bg-[#fff6f6] px-4 py-3 text-[13px] font-medium text-[#c95555]"
              >
                {alert}
              </div>
            ))}
          </div>
        )}

        {isLoading || isLoadingRequests ? (
          <div className="mt-6 px-3">
            <div className="rounded-[28px] border border-[#e8edf6] bg-white px-6 py-8 text-center text-[14px] text-[#667285] shadow-[0_18px_40px_rgba(24,35,61,0.05)]">
              Loading notifications...
            </div>
          </div>
        ) : filteredFeedItems.length === 0 ? (
          <div className="mt-6 px-3">
            <div className="rounded-[28px] border border-[#e8edf6] bg-white px-6 py-8 text-center text-[14px] text-[#667285] shadow-[0_18px_40px_rgba(24,35,61,0.05)]">
              {activeFilter === "all"
                ? "You’re all caught up."
                : `No ${getFilterLabel(activeFilter).toLowerCase()} notifications right now.`}
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {filteredFeedItems.map((item) => {
              if (item.kind === "friend_request") {
                const requester = item.request.requester;
                const collegeLabel = getCollegeLabel(requester);
                return (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-[28px] border border-[#ebeff6] bg-white px-5 py-5 shadow-[0_18px_40px_rgba(24,35,61,0.05)] before:absolute before:bottom-6 before:left-0 before:top-6 before:w-[3px] before:rounded-full before:bg-[#1456f4]"
                  >
                    <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                      <div className="relative">
                        <Avatar
                          name={requester.name}
                          size={44}
                          className="border border-[#e7edf5] bg-white text-[#202531]"
                        />
                        <span className="absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#7b61ff] text-white shadow-[0_6px_14px_rgba(123,97,255,0.3)]">
                          <FriendBadgeIcon />
                        </span>
                      </div>

                      <div className="min-w-0">
                        <p className="text-[15px] leading-[1.45] text-[#4b5463]">
                          <span className="font-[700] tracking-[-0.04em] text-[#262b35]">
                            {requester.name}
                          </span>{" "}
                          sent you a friend request
                        </p>
                        <p className="mt-1 text-[12px] text-[#8891a1]">
                          {collegeLabel ? `${collegeLabel} · ` : ""}
                          {formatRelativeTime(item.createdAt)}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={primaryActionClasses}
                            onClick={() => handleAcceptRequest(requester.handle)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            className={secondaryActionClasses}
                            onClick={() => handleDeclineRequest(requester.handle)}
                          >
                            Decline
                          </button>
                        </div>
                      </div>

                      <p className="text-[11px] font-medium text-[#9aa2b0] sm:text-right">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              }

              const notification = item.notification;
              const actorHandle = notification.actor?.handle ?? "";
              const actorSlug = actorHandle.replace(/^@/, "");
              const isUnread = !notification.readAt;
              const relationship = actorSlug
                ? relationshipByHandle[actorSlug] ?? "unknown"
                : "unknown";
              const canConnect =
                notification.type === "request_help" &&
                actorSlug &&
                !["friends", "outgoing", "incoming", "blocked", "blocked_by"].includes(
                  relationship
                );
              const statusLabel =
                relationship === "friends"
                  ? "Friends"
                  : relationship === "outgoing"
                    ? "Request sent"
                    : relationship === "incoming"
                      ? "They requested you"
                      : null;
              const clubDecision = clubDecisionByNotification[notification.id];
              const canDecideClub =
                notification.type === "club_application" &&
                !clubDecision &&
                Boolean(notification.contextId) &&
                Boolean(notification.actor?.id);
              const isDecidingClub = clubDecisionLoading.has(notification.id);
              const marketContent = getMarketContent(notification.messagePreview);

              const accentColor =
                notification.type === "marketplace_message"
                  ? "bg-[#ff9d66]"
                  : notification.type === "club_application"
                    ? "bg-[#8b5cf6]"
                    : notification.type === "request_help"
                      ? "bg-[#10b981]"
                      : "bg-[#1456f4]";

              const badgeIcon =
                notification.type === "marketplace_message" ? (
                  <MarketBadgeIcon />
                ) : notification.type === "club_application" ? (
                  <GroupBadgeIcon />
                ) : notification.type === "request_help" ? (
                  <HelpBadgeIcon />
                ) : (
                  <BellBadgeIcon />
                );

              const title =
                notification.type === "message"
                  ? `${notification.actor?.name ?? "Someone"} sent you a new message`
                  : notification.type === "marketplace_message"
                    ? `${notification.actor?.name ?? "Someone"} sent an inquiry${
                        marketContent.topic ? ` about ${marketContent.topic}` : ""
                      }`
                    : notification.type === "request_help"
                      ? `${notification.actor?.name ?? "Someone"} offered to help`
                      : `${notification.actor?.name ?? "Someone"} requested to join ${
                          notification.messagePreview || "your club"
                        }`;

              const preview =
                notification.type === "marketplace_message"
                  ? marketContent.body
                  : notification.messagePreview;

              return (
                <div
                  key={item.id}
                  className={`relative overflow-hidden rounded-[28px] border border-[#ebeff6] bg-white px-5 py-5 shadow-[0_18px_40px_rgba(24,35,61,0.05)] ${
                    isUnread ? "before:absolute before:bottom-6 before:left-0 before:top-6 before:w-[3px] before:rounded-full before:bg-[#1456f4]" : ""
                  }`}
                >
                  <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                    <div className="relative">
                      {notification.actor ? (
                        <Avatar
                          name={notification.actor.name}
                          size={44}
                          className="border border-[#e7edf5] bg-white text-[#202531]"
                        />
                      ) : (
                        <div className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-[#e7edf5] bg-white text-[#202531]">
                          <BellBadgeIcon />
                        </div>
                      )}
                      <span
                        className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full text-white shadow-[0_6px_14px_rgba(25,36,60,0.18)] ${accentColor}`}
                      >
                        {badgeIcon}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <p className="text-[15px] leading-[1.45] text-[#4b5463]">
                        <span className="font-[700] tracking-[-0.04em] text-[#262b35]">
                          {title.split(" ")[0] === (notification.actor?.name ?? "Someone").split(" ")[0]
                            ? notification.actor?.name ?? "Someone"
                            : notification.actor?.name ?? "Someone"}
                        </span>{" "}
                        {title.replace(`${notification.actor?.name ?? "Someone"} `, "")}
                      </p>

                      {preview && (
                        <div className="mt-2 rounded-full bg-[#f2f4f8] px-4 py-[10px] text-[12px] italic text-[#838d9d]">
                          “{preview}”
                        </div>
                      )}

                      {notification.type === "request_help" && (
                        <p className="mt-2 text-[12px] text-[#8891a1]">
                          Connect with them if you want to keep the conversation moving.
                        </p>
                      )}

                      {notification.type === "club_application" && clubDecision && (
                        <p className="mt-2 text-[12px] font-semibold text-[#7a8393]">
                          {clubDecision === "approved"
                            ? "Application approved."
                            : "Application denied."}
                        </p>
                      )}

                      <div className="mt-4 flex flex-wrap gap-2">
                        {notification.type === "message" && actorSlug && (
                          <Link
                            href={`/friends?handle=${encodeURIComponent(actorSlug)}`}
                            className={primaryActionClasses}
                          >
                            Reply now
                          </Link>
                        )}

                        {notification.type === "marketplace_message" &&
                          notification.contextId && (
                            <Link
                              href={`/marketplace/messages/${encodeURIComponent(notification.contextId)}`}
                              className={primaryActionClasses}
                            >
                              Reply now
                            </Link>
                          )}

                        {notification.type === "marketplace_message" &&
                          notification.contextId && (
                            <Link
                              href={`/marketplace/messages/${encodeURIComponent(notification.contextId)}`}
                              className={secondaryActionClasses}
                            >
                              View item
                            </Link>
                          )}

                        {notification.type === "request_help" && statusLabel && (
                          <span className={ghostActionClasses}>{statusLabel}</span>
                        )}

                        {notification.type === "request_help" && canConnect && (
                          <button
                            type="button"
                            className={primaryActionClasses}
                            onClick={() => handleConnect(actorHandle || actorSlug)}
                            disabled={connectingHandles.has(actorSlug)}
                          >
                            {connectingHandles.has(actorSlug) ? "Sending..." : "Connect"}
                          </button>
                        )}

                        {notification.type === "club_application" && canDecideClub && (
                          <>
                            <button
                              type="button"
                              className={primaryActionClasses}
                              onClick={() =>
                                handleClubDecision(
                                  notification.id,
                                  notification.contextId,
                                  notification.actor?.id ?? null,
                                  "approve"
                                )
                              }
                              disabled={isDecidingClub}
                            >
                              {isDecidingClub ? "Saving..." : "Approve member"}
                            </button>
                            <button
                              type="button"
                              className={secondaryActionClasses}
                              onClick={() =>
                                handleClubDecision(
                                  notification.id,
                                  notification.contextId,
                                  notification.actor?.id ?? null,
                                  "deny"
                                )
                              }
                              disabled={isDecidingClub}
                            >
                              Decline
                            </button>
                          </>
                        )}

                        {notification.type === "club_application" &&
                          notification.actor?.handle && (
                            <Link
                              href={`/profile/${encodeURIComponent(actorSlug)}`}
                              className={ghostActionClasses}
                            >
                              View profile
                            </Link>
                          )}
                      </div>
                    </div>

                    <div className="flex items-start gap-2 sm:flex-col sm:items-end">
                      {isUnread && (
                        <span className="rounded-full bg-[#edf3ff] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1456f4]">
                          New
                        </span>
                      )}
                      <p className="text-[11px] font-medium text-[#9aa2b0]">
                        {formatRelativeTime(notification.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
