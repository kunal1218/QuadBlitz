"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  MapPin,
  MessageSquare,
  Share2,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import type { Club } from "@/features/clubs";

const CHANNELS = [
  { id: "general", label: "General Chat", description: "Open conversation" },
  { id: "announcements", label: "Announcements", description: "Updates from hosts" },
] as const;

type ClubChannel = (typeof CHANNELS)[number]["id"];

type UpcomingClubEvent = {
  id: string;
  title: string;
  startsAt: Date;
  location: string;
  details: string;
};

type OfficerProfile = {
  id: string;
  name: string;
  subtitle: string;
};

type ClubChatMessage = {
  id: string;
  clubId: string;
  channel: ClubChannel;
  message: string;
  createdAt: string;
  sender: {
    id: string;
    name: string;
    handle?: string | null;
    isGuest?: boolean;
  };
};

type ClubLogEntry = {
  id: string;
  title: string;
  summary: string;
  meta: string;
  style: CSSProperties;
};

const CATEGORY_LABELS: Record<Club["category"], string> = {
  social: "Social / Recreational",
  study: "Study Sessions",
  build: "Build Projects",
  sports: "Competitive Play",
  creative: "Creative Practice",
  wellness: "Wellness",
};

const HERO_THEMES: Record<
  Club["category"],
  { background: string; accent: string; surface: string }
> = {
  social: {
    background:
      "radial-gradient(circle at 35% 28%, rgba(101,148,255,0.24), transparent 28%), linear-gradient(135deg, #111827 0%, #16263c 42%, #0c1727 100%)",
    accent: "#4a7aff",
    surface: "linear-gradient(135deg, #edf3ff 0%, #f6f8fc 100%)",
  },
  study: {
    background:
      "radial-gradient(circle at 52% 28%, rgba(128,146,255,0.22), transparent 26%), linear-gradient(135deg, #17181f 0%, #20273d 40%, #151923 100%)",
    accent: "#6c7dff",
    surface: "linear-gradient(135deg, #eef1ff 0%, #f6f7fc 100%)",
  },
  build: {
    background:
      "radial-gradient(circle at 50% 30%, rgba(44,215,255,0.22), transparent 28%), linear-gradient(135deg, #0d1218 0%, #143447 40%, #0b1017 100%)",
    accent: "#2ccfff",
    surface: "linear-gradient(135deg, #eefaff 0%, #f5f9fb 100%)",
  },
  sports: {
    background:
      "radial-gradient(circle at 52% 24%, rgba(255,107,107,0.2), transparent 24%), linear-gradient(135deg, #11131a 0%, #1c2333 40%, #0e1117 100%)",
    accent: "#ff6464",
    surface: "linear-gradient(135deg, #fff0f0 0%, #f8f9fc 100%)",
  },
  creative: {
    background:
      "radial-gradient(circle at 50% 20%, rgba(186,112,255,0.24), transparent 26%), linear-gradient(135deg, #15141d 0%, #2a1d3d 40%, #14141c 100%)",
    accent: "#ab79ff",
    surface: "linear-gradient(135deg, #f5efff 0%, #f8f9fc 100%)",
  },
  wellness: {
    background:
      "radial-gradient(circle at 52% 18%, rgba(73,208,168,0.24), transparent 25%), linear-gradient(135deg, #0f1517 0%, #17312d 42%, #0d1114 100%)",
    accent: "#49cfa8",
    surface: "linear-gradient(135deg, #ecfff8 0%, #f7f9fc 100%)",
  },
};

const MISSION_HEADLINES: Record<Club["category"], string> = {
  social: "The best communities are built on consistency, warmth, and shared momentum.",
  study: "Strategic thinking grows fastest when ambition meets a disciplined circle.",
  build: "The strongest builders move faster when ideas become team rituals.",
  sports: "Competition gets sharper when every member pushes the standard forward.",
  creative: "Creative practice becomes culture when inspiration has a home.",
  wellness: "A healthy campus starts when care becomes a collective habit.",
};

const LEADERSHIP_ROLES = [
  "President",
  "Vice President",
  "Treasurer",
  "Outreach Head",
] as const;

const guestNameKey = (clubId: string) => `lockedin_guest_name_${clubId}`;

const guestAdjectives = [
  "Sunny",
  "Brisk",
  "Amber",
  "Nova",
  "Indie",
  "Hushed",
  "Silver",
  "Velvet",
  "Neon",
  "Cosmic",
];

const guestNouns = [
  "Fox",
  "Comet",
  "Pine",
  "River",
  "Atlas",
  "Meadow",
  "Cedar",
  "Orbit",
  "Breeze",
  "Echo",
];

const generateGuestName = () => {
  const adjective =
    guestAdjectives[Math.floor(Math.random() * guestAdjectives.length)];
  const noun = guestNouns[Math.floor(Math.random() * guestNouns.length)];
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${adjective} ${noun} ${suffix}`;
};

const getOrCreateGuestName = (clubId: string) => {
  if (typeof window === "undefined") {
    return "Guest";
  }
  const key = guestNameKey(clubId);
  const stored = window.localStorage.getItem(key);
  if (stored) {
    return stored;
  }
  const generated = generateGuestName();
  window.localStorage.setItem(key, generated);
  return generated;
};

const normalizeChannel = (value: string | null): ClubChannel => {
  if (value === "announcements") {
    return "announcements";
  }
  return "general";
};

const getTimestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getInitials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

const getClubLocation = (club: Club) => {
  if (club.isRemote) {
    return "Remote";
  }
  return club.city ? `${club.city} · ${club.location}` : club.location;
};

const nextWeekdayAt = (
  reference: Date,
  weekday: number,
  hour: number,
  minute: number
) => {
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

const formatEventTime = (value: Date) =>
  value.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

const formatEventBadgeMonth = (value: Date) =>
  value.toLocaleDateString("en-US", { month: "short" }).toUpperCase();

const formatEventBadgeDay = (value: Date) =>
  value.toLocaleDateString("en-US", { day: "2-digit" });

const formatLogMetaDate = (value: string) =>
  new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

const trimText = (value: string, limit: number) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
};

const formatCompactCount = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  }
  return `${value}`;
};

const formatCalendarDate = (value: Date) => {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${value.getUTCDate()}`.padStart(2, "0");
  const hour = `${value.getUTCHours()}`.padStart(2, "0");
  const minute = `${value.getUTCMinutes()}`.padStart(2, "0");
  const second = `${value.getUTCSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
};

const buildUpcomingEvents = (club: Club): UpcomingClubEvent[] => {
  const now = new Date();
  const baseLocation = club.isRemote
    ? "Remote · Live room shared in chat"
    : `${club.location}${club.city ? `, ${club.city}` : ""}`;

  return [
    {
      id: `${club.id}-weekly`,
      title: `${club.title} Weekly Meetup`,
      startsAt: nextWeekdayAt(now, 1, 18, 30),
      location: baseLocation,
      details:
        club.joinPolicy === "application"
          ? "Priority seating for approved members"
          : "Open drop-in session",
    },
    {
      id: `${club.id}-workshop`,
      title: `${club.title} Skill Sprint`,
      startsAt: nextWeekdayAt(now, 4, 17, 0),
      location: baseLocation,
      details: "Hands-on workshop led by the current leadership team",
    },
    {
      id: `${club.id}-social`,
      title: `${club.title} Weekend Hangout`,
      startsAt: nextWeekdayAt(now, 6, 11, 0),
      location: club.isRemote
        ? "Remote lounge"
        : `${club.city ?? "Campus"} commons`,
      details: "Open circle for members, guests, and first-time visitors",
    },
  ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
};

const buildMissionParagraphs = (club: Club) => {
  const locationLabel = getClubLocation(club);
  const membershipLabel =
    club.joinPolicy === "application"
      ? "Membership is reviewed to keep the culture intentional and high-trust."
      : "Membership stays open so new members can join the momentum without friction.";

  return [
    `${club.description} ${club.title} gives students a focused place to sharpen ideas, practice together, and build real campus momentum.`,
    `Based in ${locationLabel}, this ${CATEGORY_LABELS[
      club.category
    ].toLowerCase()} community brings together ${formatCompactCount(
      club.memberCount
    )}+ members around a shared standard for growth. ${membershipLabel}`,
  ];
};

const buildRecentLogs = (
  club: Club,
  messages: ClubChatMessage[],
  upcomingEvents: UpcomingClubEvent[]
): ClubLogEntry[] => {
  const theme = HERO_THEMES[club.category];
  const logsFromMessages = [...messages]
    .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
    .slice(0, 2)
    .map((message, index) => ({
      id: message.id,
      title: trimText(message.message, 44) || `Update from ${message.sender.name}`,
      summary: trimText(message.message, 120),
      meta: `${formatLogMetaDate(message.createdAt)}  •  ${
        message.channel === "announcements" ? "Announcement" : "Discussion"
      }`,
      style: club.imageUrl?.trim()
        ? {
            backgroundImage: `linear-gradient(180deg, rgba(8,12,19,0.18) 0%, rgba(8,12,19,0.48) 100%), url(${club.imageUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : {
            backgroundImage:
              index === 0
                ? theme.background
                : "linear-gradient(135deg, #b86a31 0%, #f1c589 55%, #5c3920 100%)",
          },
    }));

  if (logsFromMessages.length >= 2) {
    return logsFromMessages;
  }

  const eventFallbacks = upcomingEvents.slice(0, 2).map((event, index) => ({
    id: event.id,
    title: event.title,
    summary: trimText(event.details, 120),
    meta: `${formatLogMetaDate(event.startsAt.toISOString())}  •  Event`,
    style:
      index === 0
        ? {
            backgroundImage:
              club.imageUrl?.trim()
                ? `linear-gradient(180deg, rgba(8,12,19,0.2) 0%, rgba(8,12,19,0.48) 100%), url(${club.imageUrl})`
                : theme.background,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }
        : {
            backgroundImage:
              "linear-gradient(135deg, #a46933 0%, #f7d29b 50%, #6f401f 100%)",
          },
  }));

  return [...logsFromMessages, ...eventFallbacks].slice(0, 2);
};

const getOfficerDescription = (club: Club, role: string, index: number) => {
  const descriptions = [
    `Guiding ${club.title.toLowerCase()} with a clear vision for culture, competition, and consistency.`,
    `Coordinating the weekly rhythm of events, member onboarding, and club operations.`,
    `Keeping the organization sustainable while supporting programming and growth.`,
    `Expanding the club's reach through partnerships, outreach, and campus visibility.`,
  ];

  return descriptions[index] ?? `${role} supporting the next chapter of ${club.title}.`;
};

const getHeroImageStyle = (club: Club): CSSProperties => {
  const theme = HERO_THEMES[club.category];

  if (club.imageUrl?.trim()) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(5,8,13,0.08) 0%, rgba(5,8,13,0.12) 40%, rgba(5,8,13,0.18) 100%), url(${club.imageUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return {
    backgroundImage: theme.background,
  };
};

export default function ClubDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const clubId =
    typeof params?.id === "string"
      ? params.id
      : Array.isArray(params?.id)
        ? params.id[0]
        : "";
  const { token, user, openAuthModal } = useAuth();
  const [club, setClub] = useState<Club | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState<ClubChannel>("general");
  const [messages, setMessages] = useState<ClubChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatLoading, setIsChatLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isMembershipLoading, setIsMembershipLoading] = useState(false);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [isShareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const autoJoinRef = useRef(false);
  const discussionSectionRef = useRef<HTMLDivElement | null>(null);

  const isOwner = Boolean(club?.creator?.id && user?.id === club.creator.id);
  const shouldAutoJoin =
    searchParams.get("join") === "1" || searchParams.get("join") === "true";

  useEffect(() => {
    const channelParam = searchParams.get("channel");
    setActiveChannel(normalizeChannel(channelParam));
  }, [searchParams]);

  useEffect(() => {
    autoJoinRef.current = false;
  }, [clubId]);

  useEffect(() => {
    if (!clubId) {
      return;
    }
    setIsLoading(true);
    setError(null);
    apiGet<{ club: Club }>(`/clubs/${encodeURIComponent(clubId)}`, token ?? undefined)
      .then((response) => {
        setClub(response.club ?? null);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this group."
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [clubId, token]);

  useEffect(() => {
    if (!clubId || !token || !shouldAutoJoin) {
      return;
    }
    if (autoJoinRef.current || club?.joinedByUser) {
      return;
    }
    autoJoinRef.current = true;
    apiPost<{ club: Club }>(
      `/clubs/${encodeURIComponent(clubId)}/join`,
      {},
      token
    )
      .then((response) => {
        if (response.club) {
          setClub(response.club);
        }
      })
      .catch((joinError) => {
        setError(
          joinError instanceof Error
            ? joinError.message
            : "Unable to join this group."
        );
      });
  }, [club?.joinedByUser, clubId, shouldAutoJoin, token]);

  useEffect(() => {
    if (!clubId || token) {
      setGuestName(null);
      return;
    }
    setGuestName(getOrCreateGuestName(clubId));
  }, [clubId, token]);

  useEffect(() => {
    if (typeof window === "undefined" || !clubId) {
      return;
    }
    setShareUrl(`${window.location.origin}/clubs/${clubId}?channel=general&join=1`);
  }, [clubId]);

  const qrCodeSrc = useMemo(() => {
    if (!shareUrl) {
      return "";
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      shareUrl
    )}`;
  }, [shareUrl]);

  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!clubId) {
        return;
      }
      if (!options?.silent) {
        setIsChatLoading(true);
      }
      setChatError(null);
      try {
        const response = await apiGet<{ messages: ClubChatMessage[] }>(
          `/clubs/${encodeURIComponent(clubId)}/chat?channel=${encodeURIComponent(
            activeChannel
          )}`,
          token ?? undefined
        );
        setMessages(response.messages ?? []);
      } catch (loadError) {
        if (!options?.silent) {
          setChatError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load discussion."
          );
        }
      } finally {
        if (!options?.silent) {
          setIsChatLoading(false);
        }
      }
    },
    [activeChannel, clubId, token]
  );

  useEffect(() => {
    void fetchMessages();
    const interval = window.setInterval(() => {
      void fetchMessages({ silent: true });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [fetchMessages]);

  const handleSend = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const message = chatDraft.trim();
    if (!message || !clubId) {
      return;
    }
    setIsSending(true);
    setChatError(null);
    try {
      await apiPost<{ message: ClubChatMessage }>(
        `/clubs/${encodeURIComponent(clubId)}/chat`,
        {
          channel: activeChannel,
          message,
          guestName: guestName ?? undefined,
        },
        token ?? undefined
      );
      setChatDraft("");
      void fetchMessages({ silent: true });
    } catch (sendError) {
      setChatError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send that message."
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleAirdrop = async () => {
    if (!shareUrl) {
      return;
    }
    setShareStatus(null);
    try {
      if (navigator.share) {
        await navigator.share({
          title: club?.title ?? "Join this group",
          text: `Join ${club?.title ?? "this group"} on QuadBlitz`,
          url: shareUrl,
        });
        setShareStatus("Share sheet opened.");
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("Link copied to clipboard.");
        return;
      }
      setShareStatus("Copy the link below to share.");
    } catch (shareError) {
      setShareStatus(
        shareError instanceof Error
          ? shareError.message
          : "Unable to share that link."
      );
    }
  };

  const handleMembershipAction = useCallback(async () => {
    if (!clubId || !club) {
      return;
    }
    if (!token) {
      openAuthModal("signup");
      return;
    }
    if (club.joinPolicy === "application" && club.applicationStatus === "pending") {
      return;
    }
    setIsMembershipLoading(true);
    setError(null);
    try {
      const endpoint = club.joinedByUser ? "leave" : "join";
      const response = await apiPost<{ club: Club }>(
        `/clubs/${encodeURIComponent(clubId)}/${endpoint}`,
        {},
        token
      );
      if (response.club) {
        setClub(response.club);
      }
    } catch (membershipError) {
      setError(
        membershipError instanceof Error
          ? membershipError.message
          : "Unable to update membership."
      );
    } finally {
      setIsMembershipLoading(false);
    }
  }, [club, clubId, openAuthModal, token]);

  const membershipLabel = useMemo(() => {
    if (!club) {
      return "Join Club";
    }
    if (isMembershipLoading) {
      if (club.joinedByUser) {
        return "Leaving...";
      }
      return club.joinPolicy === "application" ? "Sending..." : "Joining...";
    }
    if (club.joinedByUser) {
      return "Leave Club";
    }
    if (club.joinPolicy === "application") {
      if (club.applicationStatus === "pending") {
        return "Request Pending";
      }
      if (club.applicationStatus === "denied") {
        return "Reapply";
      }
      return "Request to Join";
    }
    return "Join Club";
  }, [club, isMembershipLoading]);

  const canPreviewPosts = Boolean(
    club?.joinedByUser || isOwner || club?.joinPolicy === "open"
  );

  const activeChannelMeta = CHANNELS.find((channel) => channel.id === activeChannel);

  const upcomingEvents = useMemo(
    () => (club ? buildUpcomingEvents(club) : []),
    [club]
  );

  const officerProfiles = useMemo<OfficerProfile[]>(() => {
    if (!club) {
      return [];
    }
    const roster = new Map<string, OfficerProfile>();
    roster.set(club.creator.id, {
      id: club.creator.id,
      name: club.creator.name,
      subtitle: "Founder",
    });

    messages
      .filter((message) => !message.sender.isGuest)
      .forEach((message) => {
        if (roster.size >= 4 || roster.has(message.sender.id)) {
          return;
        }
        roster.set(message.sender.id, {
          id: message.sender.id,
          name: message.sender.name,
          subtitle: message.sender.handle ?? "Officer",
        });
      });

    while (roster.size < 4) {
      const index = roster.size;
      roster.set(`placeholder-${index}`, {
        id: `placeholder-${index}`,
        name: `Open Seat ${index}`,
        subtitle: "Leadership seat",
      });
    }

    return [...roster.values()].slice(0, 4);
  }, [club, messages]);

  const recentLogs = useMemo(
    () => (club ? buildRecentLogs(club, messages, upcomingEvents) : []),
    [club, messages, upcomingEvents]
  );

  const heroMemberNames = useMemo(
    () => officerProfiles.slice(0, 3).map((profile) => profile.name),
    [officerProfiles]
  );

  const establishedYear = useMemo(() => {
    if (!club) {
      return new Date().getFullYear();
    }
    return new Date(club.createdAt).getFullYear();
  }, [club]);

  const calendarHref = useMemo(() => {
    const upcoming = upcomingEvents[0];
    if (!upcoming) {
      return "";
    }

    const end = new Date(upcoming.startsAt.getTime() + 90 * 60 * 1000);
    const url = new URL("https://calendar.google.com/calendar/render");
    url.searchParams.set("action", "TEMPLATE");
    url.searchParams.set("text", upcoming.title);
    url.searchParams.set(
      "dates",
      `${formatCalendarDate(upcoming.startsAt)}/${formatCalendarDate(end)}`
    );
    url.searchParams.set("details", upcoming.details);
    url.searchParams.set("location", upcoming.location);
    return url.toString();
  }, [upcomingEvents]);

  const theme = club ? HERO_THEMES[club.category] : HERO_THEMES.social;
  const missionParagraphs = club ? buildMissionParagraphs(club) : [];
  const missionHeadline = club ? MISSION_HEADLINES[club.category] : "";

  // Until the API exposes an explicit verified flag, application-based clubs
  // use the verified treatment in the UI.
  const isVerifiedClub = Boolean(
    club && club.joinPolicy === "application"
  );

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-81px)] bg-white text-[#1d2530]">
        <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          <div className="rounded-[34px] border border-[#e8edf3] bg-[#f7f9fc] px-6 py-12 text-center text-sm text-[#6b7480]">
            Loading club...
          </div>
        </div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-[calc(100vh-81px)] bg-white text-[#1d2530]">
        <div className="mx-auto max-w-[1180px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          <div className="rounded-[34px] border border-[#e8edf3] bg-[#f7f9fc] px-6 py-12 text-center text-sm text-[#6b7480]">
            {error ?? "Club not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-81px)] bg-white text-[#1d2530]">
      <div className="mx-auto max-w-[1180px] px-4 pb-24 pt-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-8 rounded-[26px] border border-[#ffd9d9] bg-[#fff7f7] px-5 py-4 text-[14px] font-medium text-[#bf4545]">
            {error}
          </div>
        )}

        <section className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center">
          <div>
            <p className="inline-flex rounded-full bg-[#eef4ff] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
              Established {establishedYear}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-[3.4rem] font-semibold leading-[0.9] tracking-[-0.08em] text-[#2f363d] sm:text-[5.3rem]">
                {club.title}
              </h1>
              {isVerifiedClub && (
                <CheckCircle2 className="h-8 w-8 text-[#2db16c] sm:h-9 sm:w-9" />
              )}
            </div>
            <p className="mt-4 max-w-[560px] text-[18px] leading-8 text-[#68707b]">
              {club.description}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-5 sm:gap-7">
              <div className="flex items-center">
                {heroMemberNames.map((name, index) => (
                  <div key={`${club.id}-${name}`} className={index === 0 ? "" : "-ml-2"}>
                    <Avatar
                      name={name}
                      size={42}
                      className="border-2 border-white text-[13px] shadow-[0_10px_22px_rgba(21,31,48,0.14)]"
                    />
                  </div>
                ))}
                <span className="-ml-2 inline-flex h-[38px] min-w-[42px] items-center justify-center rounded-full border-2 border-white bg-[#f1f3f6] px-2 text-[11px] font-semibold text-[#656d79]">
                  +{Math.max(1, club.memberCount - heroMemberNames.length)}
                </span>
              </div>

              <span className="hidden h-10 w-px bg-[#dfe5ee] sm:block" />

              {isOwner ? (
                <button
                  type="button"
                  className="inline-flex h-14 items-center justify-center rounded-full bg-[#1456f4] px-8 text-[16px] font-semibold text-white shadow-[0_20px_36px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
                  onClick={() => setShareOpen(true)}
                >
                  Share Invite
                </button>
              ) : (
                <button
                  type="button"
                  className={`inline-flex h-14 items-center justify-center rounded-full px-8 text-[16px] font-semibold transition ${
                    club.joinedByUser
                      ? "border border-[#dbe4f4] bg-white text-[#4f5a69] hover:border-[#cfd9ea]"
                      : "bg-[#1456f4] text-white shadow-[0_20px_36px_rgba(20,86,244,0.22)] hover:bg-[#0f49e2]"
                  }`}
                  onClick={handleMembershipAction}
                  disabled={
                    isMembershipLoading ||
                    (club.joinPolicy === "application" &&
                      club.applicationStatus === "pending")
                  }
                >
                  {membershipLabel}
                </button>
              )}
            </div>
          </div>

          <div className="mx-auto w-full max-w-[360px] lg:justify-self-end">
            <div className="rotate-[3deg] overflow-hidden rounded-[40px] shadow-[0_26px_70px_rgba(18,28,43,0.18)]">
              <div
                className="relative aspect-[0.93] w-full bg-[#0d1118]"
                style={getHeroImageStyle(club)}
              >
                {!club.imageUrl && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-28 w-28 items-center justify-center rounded-[28px] border border-white/10 bg-white/8 text-[2.5rem] font-semibold text-white/90 backdrop-blur">
                      {getInitials(club.title) || "C"}
                    </div>
                  </div>
                )}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(0,0,0,0.08)_100%)]" />
              </div>
            </div>
          </div>
        </section>

        <section className="mt-[72px] grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start">
          <div className="max-w-[270px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1456f4]">
              The Mission
            </p>
            <h2 className="mt-5 font-display text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.06em] text-[#2f363d]">
              {missionHeadline}
            </h2>
          </div>

          <div
            className="rounded-[40px] px-7 py-8 shadow-[0_20px_55px_rgba(24,34,50,0.05)] sm:px-10 sm:py-10"
            style={{ backgroundImage: theme.surface }}
          >
            <div className="space-y-6 text-[17px] leading-9 text-[#656e79]">
              {missionParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-10 border-t border-[#dde4ed] pt-8">
              <div>
                <p className="font-display text-[3rem] font-semibold leading-none tracking-[-0.06em] text-[#2f363d]">
                  {formatCompactCount(club.memberCount)}+
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a93a0]">
                  Active Members
                </p>
              </div>
              <div>
                <p className="font-display text-[3rem] font-semibold leading-none tracking-[-0.06em] text-[#2f363d]">
                  {establishedYear}
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a93a0]">
                  Established
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-[72px]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#1456f4]">
                Leadership
              </p>
              <h2 className="mt-3 font-display text-[3rem] font-semibold tracking-[-0.06em] text-[#2f363d]">
                The Council
              </h2>
            </div>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#2f363d] transition hover:text-[#1456f4]"
              onClick={() => router.push("/clubs")}
            >
              View Full Directory
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {officerProfiles.map((officer, index) => (
              <article
                key={officer.id}
                className="rounded-[34px] border border-[#ebeff4] bg-white p-5 shadow-[0_16px_38px_rgba(20,30,44,0.05)]"
              >
                <div className="flex justify-center">
                  <Avatar
                    name={officer.name}
                    size={136}
                    className="border border-[#dce3ee] text-[44px] shadow-[0_12px_30px_rgba(21,31,48,0.1)]"
                  />
                </div>
                <h3 className="mt-6 font-display text-[1.8rem] font-semibold tracking-[-0.05em] text-[#2f363d]">
                  {officer.name}
                </h3>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
                  {LEADERSHIP_ROLES[index] ?? officer.subtitle}
                </p>
                <p className="mt-3 text-[14px] leading-6 text-[#6d7580]">
                  {getOfficerDescription(
                    club,
                    LEADERSHIP_ROLES[index] ?? officer.subtitle,
                    index
                  )}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-[72px] grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-[3rem] font-semibold tracking-[-0.06em] text-[#2f363d]">
                Recent Logs
              </h2>
              <button
                type="button"
                className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-[#1456f4] transition hover:text-[#0f49e2]"
                onClick={() =>
                  discussionSectionRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                View All Posts
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-8 space-y-6">
              {recentLogs.map((log) => (
                <article
                  key={log.id}
                  className="grid gap-5 rounded-[30px] border border-[#ebeff4] bg-white p-4 shadow-[0_16px_38px_rgba(20,30,44,0.05)] sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center"
                >
                  <div
                    className="aspect-[1.65] overflow-hidden rounded-[24px] bg-[#10151d]"
                    style={log.style}
                  />
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9aa2ae]">
                      {log.meta}
                    </p>
                    <h3 className="mt-2 font-display text-[2rem] font-semibold leading-[1.04] tracking-[-0.05em] text-[#2f363d]">
                      {log.title}
                    </h3>
                    <p className="mt-3 text-[15px] leading-7 text-[#6c7480]">
                      {log.summary}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[34px] bg-[#f1f5f9] p-6 shadow-[0_18px_45px_rgba(20,30,44,0.05)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1456f4]">
              Next Moves
            </p>
            <div className="mt-5 space-y-4">
              {upcomingEvents.map((event) => (
                <article
                  key={event.id}
                  className="flex items-start gap-4 rounded-[22px] border border-white/60 bg-white/80 px-4 py-3"
                >
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-white text-[#2f363d] shadow-[0_8px_20px_rgba(20,30,44,0.08)]">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa2ae]">
                      {formatEventBadgeMonth(event.startsAt)}
                    </span>
                    <span className="font-display text-[1.3rem] font-semibold leading-none tracking-[-0.04em]">
                      {formatEventBadgeDay(event.startsAt)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-[1.5rem] font-semibold leading-[1.02] tracking-[-0.05em] text-[#2f363d]">
                      {event.title}
                    </p>
                    <div className="mt-2 space-y-1 text-[13px] text-[#6d7580]">
                      <p className="inline-flex items-center gap-2">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatEventTime(event.startsAt)}
                      </p>
                      <p className="inline-flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        {event.location}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <a
              href={calendarHref || undefined}
              target="_blank"
              rel="noreferrer"
              className={`mt-6 inline-flex h-12 w-full items-center justify-center rounded-full border text-[13px] font-semibold transition ${
                calendarHref
                  ? "border-[#bfd1ff] bg-white text-[#1456f4] hover:border-[#9fb8ff]"
                  : "cursor-default border-[#dde4ee] bg-white text-[#9aa2ae]"
              }`}
            >
              Sync Calendar
            </a>
          </aside>
        </section>

        <section
          ref={discussionSectionRef}
          className="mt-16 rounded-[40px] border border-[#e8edf3] bg-white p-6 shadow-[0_22px_55px_rgba(20,30,44,0.05)] sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1456f4]">
                Community Lounge
              </p>
              <h2 className="mt-3 font-display text-[2.6rem] font-semibold tracking-[-0.06em] text-[#2f363d]">
                Discussion
              </h2>
              <p className="mt-2 max-w-[520px] text-[15px] leading-7 text-[#69727e]">
                Use the live channel feed to coordinate events, post updates, and
                welcome new members.
              </p>
            </div>

            {isOwner && (
              <button
                type="button"
                className="inline-flex h-12 items-center justify-center rounded-full border border-[#dfe5ee] bg-white px-5 text-[13px] font-semibold text-[#4f5763] transition hover:border-[#d2dbe8]"
                onClick={() => setShareOpen(true)}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share Invite
              </button>
            )}
          </div>

          {!token && guestName && (
            <div className="mt-6 rounded-[24px] border border-[#e8edf3] bg-[#f7f9fc] px-4 py-3 text-[13px] text-[#6b7480]">
              You are chatting as{" "}
              <span className="font-semibold text-[#2f363d]">{guestName}</span> in
              public drop-in mode.
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => {
              const isActive = channel.id === activeChannel;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setActiveChannel(channel.id)}
                  className={`rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                    isActive
                      ? "bg-[#1456f4] text-white shadow-[0_14px_28px_rgba(20,86,244,0.18)]"
                      : "border border-[#e0e6ef] bg-white text-[#5a6370] hover:border-[#d3dbe7]"
                  }`}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>

          {!canPreviewPosts ? (
            <div className="mt-8 rounded-[30px] border border-[#e8edf3] bg-[#f7f9fc] px-6 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-[#dde5ee] bg-white text-[#6d7580]">
                <MessageSquare className="h-5 w-5" />
              </div>
              <p className="mt-4 text-[17px] font-semibold text-[#2f363d]">
                Join this club to unlock the full discussion feed.
              </p>
              <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-7 text-[#6c7480]">
                Public visitors can view the club page, but member discussion stays
                inside the community.
              </p>
              {!isOwner && (
                <button
                  type="button"
                  onClick={handleMembershipAction}
                  disabled={isMembershipLoading}
                  className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[14px] font-semibold text-white shadow-[0_16px_30px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
                >
                  {membershipLabel}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-8 rounded-[30px] border border-[#e8edf3] bg-[#f8fafc]">
              <div className="max-h-[380px] space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
                {isChatLoading ? (
                  <p className="text-sm text-[#6c7480]">Loading discussion…</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-[#6c7480]">
                    No posts yet in {activeChannelMeta?.label.toLowerCase()}. Start
                    the first thread.
                  </p>
                ) : (
                  messages
                    .slice()
                    .sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt))
                    .map((message) => (
                      <article
                        key={message.id}
                        className="rounded-[24px] border border-white bg-white px-4 py-3 shadow-[0_10px_26px_rgba(20,30,44,0.05)]"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#808996]">
                          <span className="font-semibold text-[#2f363d]">
                            {message.sender.handle || message.sender.name}
                          </span>
                          <span>{formatRelativeTime(message.createdAt)}</span>
                          {message.sender.isGuest && (
                            <span className="rounded-full border border-[#dfe5ee] px-2 py-0.5 text-[10px] font-semibold text-[#7a8390]">
                              Guest
                            </span>
                          )}
                        </div>
                        <p className="mt-2 text-[14px] leading-7 text-[#4f5763]">
                          {message.message}
                        </p>
                      </article>
                    ))
                )}
              </div>

              <form
                onSubmit={handleSend}
                className="flex flex-wrap items-center gap-3 border-t border-[#e8edf3] px-5 py-4 sm:px-6"
              >
                <input
                  className="min-w-0 flex-1 rounded-full border border-[#dde4ee] bg-white px-5 py-3 text-[14px] text-[#2f363d] placeholder:text-[#8a92a0] focus:border-[#bfd1ff] focus:outline-none"
                  value={chatDraft}
                  onChange={(event) => setChatDraft(event.target.value)}
                  placeholder={`Message ${activeChannelMeta?.label.toLowerCase() ?? "the club"}`}
                  disabled={isSending}
                />
                <Button type="submit" requiresAuth={false} disabled={isSending}>
                  {isSending ? "Posting..." : "Post"}
                </Button>
              </form>

              {chatError && (
                <div className="px-5 pb-5 sm:px-6">
                  <p className="rounded-[20px] border border-[#ffd9d9] bg-[#fff7f7] px-4 py-3 text-[12px] font-semibold text-[#bf4545]">
                    {chatError}
                  </p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {isShareOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-center justify-center px-4 py-8">
            <div
              className="absolute inset-0 bg-[#121926]/42 backdrop-blur-sm"
              onClick={() => setShareOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-full max-w-lg">
              <div className="flex items-center justify-between rounded-t-[28px] border border-[#e5e8ee] bg-white px-5 py-4 md:px-6">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#1456f4]">
                    Share Club
                  </p>
                  <h2 className="mt-1 font-display text-[1.9rem] font-semibold tracking-[-0.05em] text-[#2f363d]">
                    Invite to {club.title}
                  </h2>
                </div>
                <button
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e8ee] text-[#6d7580] transition hover:bg-[#f7f9fc]"
                  onClick={() => setShareOpen(false)}
                >
                  Close
                </button>
              </div>
              <div className="rounded-b-[28px] border border-t-0 border-[#e5e8ee] bg-white px-6 py-5 shadow-[0_40px_100px_rgba(15,21,35,0.18)]">
                <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="flex items-center justify-center rounded-[26px] border border-[#e7ebf1] bg-[#f7f9fc] p-4">
                    {qrCodeSrc ? (
                      <Image
                        src={qrCodeSrc}
                        alt="Club QR code"
                        width={200}
                        height={200}
                        unoptimized
                        className="h-[200px] w-[200px]"
                      />
                    ) : (
                      <div className="h-[200px] w-[200px] rounded-[22px] bg-[#eff2f6]" />
                    )}
                  </div>
                  <div className="space-y-4">
                    <p className="text-[14px] leading-7 text-[#69727e]">
                      Anyone who scans this QR code lands in the general discussion
                      thread. No account required.
                    </p>
                    <div className="rounded-[22px] border border-[#e5e8ee] bg-[#f7f9fc] px-4 py-3 text-[12px] text-[#69727e]">
                      {shareUrl || "Generating link..."}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        requiresAuth={false}
                        onClick={handleAirdrop}
                      >
                        Airdrop Link
                      </Button>
                      <button
                        type="button"
                        className="inline-flex h-10 items-center justify-center rounded-full border border-[#dfe5ee] bg-white px-4 text-[12px] font-semibold text-[#505965] transition hover:border-[#d2dbe8]"
                        onClick={async () => {
                          if (!shareUrl || !navigator.clipboard) {
                            setShareStatus("Copy the link below to share.");
                            return;
                          }
                          await navigator.clipboard.writeText(shareUrl);
                          setShareStatus("Link copied to clipboard.");
                        }}
                      >
                        Copy Link
                      </button>
                    </div>
                    {shareStatus && (
                      <p className="text-[12px] font-semibold text-[#69727e]">
                        {shareStatus}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
