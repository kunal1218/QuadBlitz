"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import type { EventWithDetails } from "@lockedin/shared";
import { rsvpToEvent } from "@/lib/api/events";
import { useAuth } from "@/features/auth";
import { connectSocket, socket } from "@/lib/socket";

const formatTime = (isoString: string) => {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatDistance = (distanceKm?: number | null) => {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) {
    return null;
  }
  return `${distanceKm.toFixed(1)} km away`;
};

const formatCategoryLabel = (category: EventWithDetails["category"]) =>
  `${category.replace(/-/g, " ")} event`;

const HERO_SHELL =
  "bg-[linear-gradient(180deg,#ffe0a8_0%,#fff1d1_50%,#ffffff_100%)]";

const CloseIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-[18px] w-[18px]">
    <path
      d="m5.5 5.5 9 9m0-9-9 9"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

const CalendarIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-[18px] w-[18px]">
    <path
      d="M5.2 4.45v2.1M14.8 4.45v2.1M4.1 7.15h11.8M5.1 5.3h9.8a1 1 0 0 1 1 1v8.3a1 1 0 0 1-1 1H5.1a1 1 0 0 1-1-1V6.3a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PinIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-[15px] w-[15px]">
    <path
      d="M10 16.55s4.2-4.1 4.2-7.66A4.2 4.2 0 0 0 5.8 8.9c0 3.56 4.2 7.66 4.2 7.66Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <circle cx="10" cy="8.9" r="1.4" fill="currentColor" />
  </svg>
);

const ChatIcon = () => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-[18px] w-[18px]">
    <path
      d="M4.05 4.5h11.9a.9.9 0 0 1 .9.9v7.1a.9.9 0 0 1-.9.9H8.85l-3.55 2.1v-2.1h-1.25a.9.9 0 0 1-.9-.9V5.4a.9.9 0 0 1 .9-.9Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

type EventDetailCardProps = {
  event: EventWithDetails;
  onClose: () => void;
  onRSVP: (status: "going" | "maybe" | "declined") => void;
  onDelete?: () => Promise<void> | void;
};

export const EventDetailCard = ({
  event,
  onClose,
  onRSVP,
  onDelete,
}: EventDetailCardProps) => {
  const router = useRouter();
  const { isAuthenticated, token, user, openAuthModal } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [userStatus, setUserStatus] = useState(event.user_status ?? null);
  const [currentView, setCurrentView] = useState<"details" | "chat">("details");
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      eventId: number;
      message: string;
      createdAt: string;
      sender: { id: string; name: string; handle?: string | null };
    }>
  >([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [modalHeight, setModalHeight] = useState<number | null>(null);

  const attendees = event.attendees ?? [];
  const isAtCapacity =
    event.max_attendees != null && event.attendee_count >= event.max_attendees;
  const distanceLabel = useMemo(() => formatDistance(event.distance_km), [event.distance_km]);
  const attendeePreview = showAllAttendees ? attendees : attendees.slice(0, 5);
  const aboutCopy =
    event.description?.trim() ||
    "Drop in, meet up, and see who else from campus is showing up.";
  const canDeleteEvent = Boolean(
    user &&
      (user.isAdmin || user.id === event.creator_id || user.id === event.creator.id)
  );

  useEffect(() => {
    setUserStatus(event.user_status ?? null);
  }, [event.id, event.user_status]);

  useEffect(() => {
    setCurrentView("details");
  }, [event.id]);

  useEffect(() => {
    setShowAllAttendees(false);
    setChatMessages([]);
    setChatDraft("");
    setChatError(null);
  }, [event.id]);

  useEffect(() => {
    if (currentView !== "chat") {
      return;
    }
    if (!token) {
      return;
    }
    connectSocket(token);
    const handleChat = (payload: {
      eventId?: number;
      message?: {
        id: string;
        eventId: number;
        message: string;
        createdAt: string;
        sender: { id: string; name: string; handle?: string | null };
      };
    }) => {
      if (!payload?.message || payload.eventId !== event.id) {
        return;
      }
      setChatMessages((prev) => [...prev, payload.message!]);
    };
    const handleHistory = (payload: {
      eventId?: number;
      messages?: Array<{
        id: string;
        eventId: number;
        message: string;
        createdAt: string;
        sender: { id: string; name: string; handle?: string | null };
      }>;
    }) => {
      if (payload?.eventId !== event.id) {
        return;
      }
      setChatMessages(payload.messages ?? []);
    };
    socket.on("event:chat", handleChat);
    socket.on("event:chat:history", handleHistory);
    socket.emit("event:chat:history", { eventId: event.id });

    return () => {
      socket.off("event:chat", handleChat);
      socket.off("event:chat:history", handleHistory);
    };
  }, [currentView, event.id, token]);

  useEffect(() => {
    if (currentView !== "chat") {
      return;
    }
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, currentView]);

  useEffect(() => {
    if (currentView !== "details") {
      return;
    }
    const node = modalRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      const nextHeight = node.getBoundingClientRect().height;
      if (Number.isFinite(nextHeight) && nextHeight > 0) {
        setModalHeight(nextHeight);
      }
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(() => measure());
    observer.observe(node);
    return () => observer.disconnect();
  }, [currentView, event.id]);

  const handleRSVP = async (status: "going" | "maybe" | "declined") => {
    setLoading(true);
    try {
      await rsvpToEvent(event.id, status);
      setUserStatus(status);
      onRSVP(status);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[map] RSVP failed", error);
      }
      window.alert("Failed to RSVP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChat = () => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    setCurrentView("chat");
  };

  const handleDeleteEvent = async () => {
    if (!canDeleteEvent || !onDelete || isDeleting) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this event? This action cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[map] delete event failed", error);
      }
      const message =
        error instanceof Error && error.message
          ? error.message
          : "Failed to delete event. Please try again.";
      window.alert(message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleChatSubmit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    const message = chatDraft.trim();
    if (!message) {
      return;
    }
    setIsSendingChat(true);
    setChatError(null);
    try {
      if (token) {
        connectSocket(token);
      }
      socket.emit("event:chat", { eventId: event.id, message });
      setChatDraft("");
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : "Unable to send message."
      );
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleHostClick = () => {
    const rawHandle = event.creator.handle ?? "";
    const handleSlug = rawHandle.replace(/^@/, "").trim();
    onClose();
    if (handleSlug) {
      router.push(`/profile/${encodeURIComponent(handleSlug)}`);
      return;
    }
    if (event.creator.id) {
      router.push(`/profile/${encodeURIComponent(event.creator.id)}`);
    }
  };

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={modalRef}
          style={
            currentView === "chat" && modalHeight
              ? { height: `${modalHeight}px` }
              : undefined
          }
          className={`relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-[32px] border border-[#edf1f6] bg-white shadow-[0_28px_70px_rgba(27,26,23,0.22)] animate-scale-in ${
            currentView === "chat" ? "max-h-[88vh]" : ""
          }`}
        >
          {currentView === "details" ? (
            <>
              <div className="shrink-0">
                <div className={`relative h-[168px] overflow-hidden px-5 pt-5 ${HERO_SHELL}`}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(255,255,255,0.42),transparent_34%),radial-gradient(circle_at_14%_26%,rgba(255,255,255,0.22),transparent_24%),radial-gradient(circle_at_84%_20%,rgba(255,255,255,0.18),transparent_26%)]" />
                  <button
                    type="button"
                    onClick={onClose}
                    className="relative z-10 ml-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/88 text-[#667086] shadow-[0_8px_18px_rgba(32,46,76,0.08)] transition hover:bg-white"
                    aria-label="Close"
                  >
                    <CloseIcon />
                  </button>

                  <div className="absolute bottom-4 left-5 right-5 z-10 flex items-center gap-2 text-[12px] text-[#6e7786]">
                    <span className="rounded-full bg-[#edf3ff] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#1456f4]">
                      {formatCategoryLabel(event.category)}
                    </span>
                    {distanceLabel && (
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        <PinIcon />
                        {distanceLabel}
                      </span>
                    )}
                  </div>
                </div>

                <div className="px-6 pb-4 pt-5">
                  <h2 className="text-[24px] font-[700] tracking-[-0.06em] text-[#252a34]">
                    {event.title}
                  </h2>

                  <div className="mt-2 inline-flex items-center gap-2 text-[14px] font-medium text-[#606a7d]">
                    <span className="text-[#1456f4]">
                      <CalendarIcon />
                    </span>
                    <span>{formatTime(event.start_time)}</span>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-[190px_minmax(0,1fr)]">
                    <button
                      type="button"
                      onClick={handleHostClick}
                      className="flex items-center gap-3 rounded-[22px] bg-[#f4f6fb] px-4 py-4 text-left transition hover:bg-[#eef2f8]"
                    >
                      {event.creator.profile_picture_url ? (
                        <img
                          src={event.creator.profile_picture_url}
                          alt={event.creator.name}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1456f4] text-sm font-semibold text-white">
                          {event.creator.name?.charAt(0).toUpperCase() ?? "?"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8a93a3]">
                          Hosted By
                        </p>
                        <p className="truncate text-[18px] font-semibold tracking-[-0.045em] text-[#252a34]">
                          {event.creator.name}
                        </p>
                        <p className="truncate text-[13px] font-medium text-[#1456f4]">
                          {event.creator.handle}
                        </p>
                      </div>
                    </button>

                    <div className="px-1 py-1">
                      <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#6e7786]">
                        About
                      </p>
                      <p className="mt-2 text-[14px] leading-[1.65] text-[#616c80]">
                        {aboutCopy}
                      </p>
                      {event.venue_name && (
                        <p className="mt-2 text-[12px] font-medium text-[#8891a2]">
                          At {event.venue_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[14px] font-semibold uppercase tracking-[0.08em] text-[#4a5260]">
                        {event.attendee_count} {event.attendee_count === 1 ? "person" : "people"} going
                      </p>
                      {attendees.length > 5 && (
                        <button
                          type="button"
                          onClick={() => setShowAllAttendees((current) => !current)}
                          className="text-[13px] font-semibold text-[#1456f4]"
                        >
                          {showAllAttendees ? "Collapse" : "View All"}
                        </button>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2.5">
                      {attendeePreview.length > 0 ? (
                        attendeePreview.map((attendee) => (
                          <div
                            key={attendee.id}
                            className="inline-flex items-center gap-2 rounded-full border border-[#edf1f6] bg-white px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.85)_inset]"
                          >
                            {attendee.profile_picture_url ? (
                              <img
                                src={attendee.profile_picture_url}
                                alt={attendee.name}
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f3d3b8] text-[10px] font-semibold text-[#303540]">
                                {attendee.name?.charAt(0).toUpperCase() ?? "?"}
                              </div>
                            )}
                            <span className="max-w-[112px] truncate text-[12px] font-medium text-[#2b303a]">
                              {attendee.name}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[13px] text-[#7a8393]">
                          Be the first person to join this event.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 rounded-[22px] bg-[#eef2f8] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dce7ff] text-[#1456f4]">
                          <ChatIcon />
                        </div>
                        <div>
                          <p className="text-[16px] font-semibold tracking-[-0.04em] text-[#252a34]">
                            Event Chat
                          </p>
                          <p className="text-[12px] font-medium text-[#7a8393]">
                            Chat is event-only
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleOpenChat}
                        className="rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-[#4b525f] shadow-[0_6px_16px_rgba(43,55,86,0.08)] transition hover:text-[#252a34]"
                      >
                        Open chat
                      </button>
                    </div>
                    {canDeleteEvent && onDelete && (
                      <div className="mt-3 flex justify-end">
                        <button
                          type="button"
                          onClick={handleDeleteEvent}
                          disabled={isDeleting}
                          className="text-[12px] font-semibold text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isDeleting ? "Deleting..." : "Delete event"}
                        </button>
                      </div>
                    )}
                  </div>

                  {isAtCapacity && (
                    <div className="mt-3 rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-700">
                      This event is at capacity ({event.max_attendees} attendees).
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-[#edf1f6] bg-white px-6 pb-5 pt-4">
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => handleRSVP("going")}
                    disabled={loading || (isAtCapacity && userStatus !== "going")}
                    className={`rounded-full px-4 py-[14px] text-[14px] font-semibold transition ${
                      userStatus === "going"
                        ? "bg-[#2f67f7] text-white shadow-[0_12px_24px_rgba(47,103,247,0.24)]"
                        : "bg-[#eef2f6] text-[#454c58] hover:bg-[#e7ecf3]"
                    }`}
                  >
                    I&#39;m down
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRSVP("maybe")}
                    disabled={loading}
                    className={`rounded-full px-4 py-[14px] text-[14px] font-semibold transition ${
                      userStatus === "maybe"
                        ? "bg-[#d8e3ff] text-[#1a4fe2]"
                        : "bg-[#eef2f6] text-[#454c58] hover:bg-[#e7ecf3]"
                    }`}
                  >
                    Maybe
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRSVP("declined")}
                    disabled={loading}
                    className={`rounded-full px-4 py-[14px] text-[14px] font-semibold transition ${
                      userStatus === "declined"
                        ? "bg-[#ffe2e1] text-[#cf4b49]"
                        : "bg-[#eef2f6] text-[#454c58] hover:bg-[#e7ecf3]"
                    }`}
                  >
                    Can&#39;t make it
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="sticky top-0 z-10 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-card-border/60 bg-white px-6 py-4">
                <button
                  type="button"
                  onClick={() => setCurrentView("details")}
                  className="text-sm font-semibold text-ink/70 transition hover:text-ink"
                >
                  ← Back
                </button>
                <div className="text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Event Chat
                  </p>
                  <p className="mt-1 text-sm font-semibold text-ink">{event.title}</p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-card-border/70 text-ink/60 transition hover:border-accent/40"
                  aria-label="Close chat"
                >
                  <span className="text-lg">×</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="space-y-2">
                  {chatMessages.length ? (
                    chatMessages.map((message) => {
                      const isMine = message.sender.id === user?.id;
                      return (
                        <div
                          key={message.id}
                          className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                              isMine ? "bg-accent text-white" : "bg-ink/5 text-ink"
                            }`}
                          >
                            <p className="font-semibold">{message.sender.name}</p>
                            <p className="mt-1">{message.message}</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-xs text-muted">No messages yet.</p>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <div className="sticky bottom-0 border-t border-card-border/60 bg-white px-6 py-4">
                <form className="flex gap-2" onSubmit={handleChatSubmit}>
                  <input
                    type="text"
                    value={chatDraft}
                    onChange={(event) => setChatDraft(event.target.value)}
                    placeholder="Send a message..."
                    className="flex-1 rounded-xl border border-card-border/70 bg-white px-3 py-2 text-xs text-ink outline-none focus:border-accent/60"
                  />
                  <button
                    type="submit"
                    disabled={isSendingChat}
                    className="rounded-xl bg-ink px-4 py-2 text-xs font-semibold text-white transition hover:bg-ink/90 disabled:opacity-70"
                  >
                    {isSendingChat ? "Sending" : "Send"}
                  </button>
                </form>
                {chatError && (
                  <p className="mt-2 text-xs font-semibold text-rose-500">
                    {chatError}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </>,
    document.body
  );
};
