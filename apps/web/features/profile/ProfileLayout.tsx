"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX, SVGProps } from "react";
import { Outfit } from "next/font/google";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiGet } from "@/lib/api";
import { deriveCollegeFromDomain, deriveCollegeFromEmail } from "@/lib/college";
import { ProfileAnswersProvider, useProfileAnswers } from "./ProfileAnswersContext";
import { ProfileQuestionnaireModal } from "./ProfileQuestionnaireModal";
import { profile as fallbackProfile } from "./mock";

type FriendUser = {
  id: string;
  name: string;
  handle: string;
};

type FriendRequest = {
  id: string;
  createdAt: string;
  requester: FriendUser;
  recipient: FriendUser;
};

type FriendSummary = {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: FriendUser[];
};

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

type StatItem = {
  label: string;
  value: number;
  icon: JSX.Element;
};

type PromptCardProps = {
  icon: JSX.Element;
  title: string;
  answer?: string;
  chips?: string[];
  actionLabel: string;
  onAction: () => void;
};

type PromptCardData = Omit<PromptCardProps, "onAction">;

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const shellCardClasses =
  "rounded-[30px] border border-[#e7edf6] bg-white/94 shadow-[0_24px_60px_rgba(24,35,61,0.08)]";

const loadLeaderboardRank = async (token: string | null, userId: string) => {
  const attempts: Array<{ path: string; token?: string }> = token
    ? [
        { path: "/leaderboard?limit=250", token },
        { path: "/ranked/leaderboard?limit=250", token },
        { path: "/leaderboard/public?limit=250" },
      ]
    : [
        { path: "/leaderboard/public?limit=250" },
        { path: "/leaderboard?limit=250" },
      ];

  for (const attempt of attempts) {
    try {
      const payload = await apiGet<{ entries: LeaderboardEntry[] }>(
        attempt.path,
        attempt.token
      );
      const entries = payload.entries ?? [];
      const index = entries.findIndex((entry) => entry.id === userId);
      if (index >= 0) {
        return index + 1;
      }
    } catch {
      // Try the next path.
    }
  }

  return null;
};

const toCollegeAcronym = (value: string) => {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return "CAMP";
  }

  const compact = parts.join("");
  if (compact.length <= 4) {
    return compact.toUpperCase();
  }

  return parts
    .slice(0, 4)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
};

const buildMemberId = (seed: string) => {
  const checksum = Array.from(seed).reduce(
    (total, character) => total + character.charCodeAt(0),
    0
  );
  const serial = ((checksum * 97) % 9000) + 1000;
  return `#${new Date().getFullYear()}-${serial}`;
};

const PeopleIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="8.2" cy="9.1" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="15.95" cy="8.55" r="1.95" stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M4.7 17.6c.52-2.2 2.2-3.5 4.72-3.5 2.56 0 4.25 1.3 4.77 3.5M13.95 13.95c1.56.17 2.66.86 3.33 2.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const SparkIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="m12 3 1.62 4.38L18 9l-4.38 1.62L12 15l-1.62-4.38L6 9l4.38-1.62L12 3Z"
      fill="currentColor"
    />
    <path d="m18.4 15.2.72 1.95 1.94.71-1.94.72-.72 1.94-.72-1.94-1.94-.72 1.94-.71.72-1.95Z" fill="currentColor" />
    <path d="m5.5 15.4.52 1.4 1.4.52-1.4.52-.52 1.4-.52-1.4-1.4-.52 1.4-.52.52-1.4Z" fill="currentColor" />
  </svg>
);

const ShieldIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 3.8 5.2 6.7v5.25c0 4.1 2.57 7.08 6.8 8.65 4.23-1.57 6.8-4.55 6.8-8.65V6.7L12 3.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="m9.1 12.45 1.9 1.9 3.9-4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const MemoryIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M12 4.25 13.7 8l4.05.4-3.06 2.74.86 4.01L12 13.16l-3.55 1.99.86-4.01L6.25 8.4 10.3 8 12 4.25Z"
      fill="currentColor"
    />
  </svg>
);

const CareerIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M8.2 8.1V6.95A2.95 2.95 0 0 1 11.15 4h1.7A2.95 2.95 0 0 1 15.8 6.95V8.1M5 8.1h14v8.75a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8.1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="M10.25 12.2h3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const PencilIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="m5.45 16.95 8.7-8.7 2.9 2.9-8.7 8.7-3.75.85.85-3.75ZM14.95 7.45l1.2-1.2a2 2 0 1 1 2.82 2.82l-1.2 1.2"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ShareIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="18.25" cy="5.75" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="6" cy="12" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="18.25" cy="18.25" r="2.35" stroke="currentColor" strokeWidth="1.8" />
    <path d="m8.05 10.95 7.95-4.1M8.05 13.05l7.95 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const SiteGlyph = () => (
  <svg viewBox="0 0 40 40" aria-hidden="true" className="h-10 w-10">
    <circle cx="20" cy="20" r="19" fill="#1456f4" />
    <circle cx="20" cy="20" r="5.2" fill="white" />
    <circle cx="20" cy="9.4" r="3.15" fill="white" />
    <circle cx="29.2" cy="14.7" r="3.15" fill="white" />
    <circle cx="29.2" cy="25.3" r="3.15" fill="white" />
    <circle cx="20" cy="30.6" r="3.15" fill="white" />
    <circle cx="10.8" cy="25.3" r="3.15" fill="white" />
    <circle cx="10.8" cy="14.7" r="3.15" fill="white" />
    <path
      d="M20 14.6v-2.2M24.6 17.3l2.05-1.18M24.6 22.7l2.05 1.18M20 25.4v2.2M15.4 22.7l-2.05 1.18M15.4 17.3l-2.05-1.18"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.96"
    />
  </svg>
);

const PromptCard = ({
  icon,
  title,
  answer,
  chips,
  actionLabel,
  onAction,
}: PromptCardProps) => {
  const hasChips = Boolean(chips && chips.length > 0);

  return (
    <article className={`${shellCardClasses} flex min-h-[280px] flex-col p-5`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#edf3ff] text-[#1456f4]">
        {icon}
      </div>
      <h3 className="mt-5 max-w-[220px] text-[18px] font-[700] leading-[1.16] tracking-[-0.05em] text-[#20242d]">
        {title}
      </h3>
      <div className="mt-4 flex-1">
        {hasChips ? (
          <div className="flex flex-wrap gap-2">
            {chips?.map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-[#fdebf7] px-3 py-1 text-[11px] font-semibold lowercase tracking-[-0.01em] text-[#cc5d9f]"
              >
                {chip}
              </span>
            ))}
          </div>
        ) : answer?.trim() ? (
          <p className="max-w-[260px] text-[13px] leading-[1.7] text-[#5f697b]">
            “{answer.trim()}”
          </p>
        ) : (
          <p className="max-w-[260px] text-[13px] leading-[1.7] text-[#96a0b0]">
            Add an answer so your profile feels more like you.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onAction}
        className="mt-6 inline-flex h-10 items-center justify-center self-start rounded-full border border-[#e4e9f2] bg-white px-5 text-[11px] font-semibold tracking-[-0.01em] text-[#5b6577] transition hover:border-[#d7deea] hover:text-[#20242d]"
      >
        {actionLabel}
      </button>
    </article>
  );
};

const ProfileLayoutInner = () => {
  const { user, token, isAuthenticated, openAuthModal } = useAuth();
  const { answers, isLoaded } = useProfileAnswers();
  const [friendsSummary, setFriendsSummary] = useState<FriendSummary | null>(null);
  const [leaderboardRank, setLeaderboardRank] = useState<number | null>(null);
  const [isAnswerEditorOpen, setAnswerEditorOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");

  useEffect(() => {
    if (!token || !isAuthenticated) {
      return;
    }

    let isActive = true;

    const loadData = async () => {
      const [summaryResult, rankResult] = await Promise.allSettled([
        apiGet<FriendSummary>("/friends/summary", token),
        user?.id ? loadLeaderboardRank(token, user.id) : Promise.resolve(null),
      ]);

      if (!isActive) {
        return;
      }

      if (summaryResult.status === "fulfilled") {
        setFriendsSummary(summaryResult.value);
      } else {
        setFriendsSummary(null);
      }

      if (rankResult.status === "fulfilled") {
        setLeaderboardRank(rankResult.value);
      } else {
        setLeaderboardRank(null);
      }
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [isAuthenticated, token, user?.id]);

  const handleOpenEditor = useCallback(() => {
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    setAnswerEditorOpen(true);
  }, [isAuthenticated, openAuthModal]);

  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareLabel("Copied");
      window.setTimeout(() => setShareLabel("Share"), 1800);
    } catch {
      setShareLabel("Share");
    }
  }, []);

  const displayName = user?.name ?? fallbackProfile.name;
  const displayHandle = user?.handle ?? fallbackProfile.handle;
  const collegeLabel =
    user?.collegeName ??
    deriveCollegeFromDomain(user?.collegeDomain ?? "") ??
    deriveCollegeFromEmail(user?.email ?? "") ??
    "Campus";
  const collegeAcronym = toCollegeAcronym(collegeLabel);
  const displayBio = fallbackProfile.bio;
  const memberId = buildMemberId(user?.id ?? displayHandle);
  const promptCount = [
    answers?.career?.trim(),
    answers?.memory?.trim(),
    answers?.madlib.when?.trim() &&
      answers?.madlib.focus?.trim() &&
      answers?.madlib.action?.trim()
      ? "madlib"
      : "",
  ].filter(Boolean).length;

  const displayBadges = useMemo(() => {
    const values = [...fallbackProfile.badges];
    values.unshift(`${collegeAcronym} Member`);
    if (leaderboardRank) {
      values.push(`Ranked #${leaderboardRank}`);
    }
    return Array.from(new Set(values)).slice(0, 4);
  }, [collegeAcronym, leaderboardRank]);

  const ecosystemStats = useMemo<StatItem[]>(
    () => [
      {
        label: "Friends",
        value: friendsSummary?.friends.length ?? 0,
        icon: <PeopleIcon className="h-4 w-4" />,
      },
      {
        label: "Prompts",
        value: promptCount,
        icon: <SparkIcon className="h-4 w-4" />,
      },
      {
        label: "Badges",
        value: displayBadges.length,
        icon: <ShieldIcon className="h-4 w-4" />,
      },
    ],
    [displayBadges.length, friendsSummary?.friends.length, promptCount]
  );

  const madlibChips = useMemo(
    () =>
      [
        answers?.madlib.when?.trim(),
        answers?.madlib.focus?.trim(),
        answers?.madlib.action?.trim(),
      ].filter(Boolean) as string[],
    [answers?.madlib.action, answers?.madlib.focus, answers?.madlib.when]
  );

  const promptCards: PromptCardData[] = [
    {
      title: "What's your favorite memory?",
      answer: answers?.memory,
      chips: undefined,
      icon: <MemoryIcon className="h-[18px] w-[18px]" />,
      actionLabel: answers?.memory?.trim() ? "Reply" : "Add your answer",
    },
    {
      title: "If you're guaranteed success, what career would you choose?",
      answer: answers?.career,
      chips: undefined,
      icon: <CareerIcon className="h-[18px] w-[18px]" />,
      actionLabel: answers?.career?.trim() ? "Edit response" : "Add your answer",
    },
    {
      title: "Whenever I'm _______, my _______ stop and _______.",
      answer: undefined,
      chips: madlibChips,
      icon: <PencilIcon className="h-[18px] w-[18px]" />,
      actionLabel: madlibChips.length > 0 ? "Edit response" : "Add your answer",
    },
  ] as const;

  if (!isAuthenticated) {
    return (
      <div className={`${outfit.className} mx-auto max-w-[980px] px-4 pb-16 pt-6`}>
        <div className={`${shellCardClasses} px-8 py-12 text-center`}>
          <h1 className="text-[34px] font-[800] tracking-[-0.065em] text-[#20242d]">
            Your Profile
          </h1>
          <p className="mx-auto mt-3 max-w-[480px] text-[15px] leading-[1.7] text-[#667183]">
            Sign in to customize your card, prompt answers, badges, and campus identity.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal("login")}
            className="mt-7 inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[12px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_16px_32px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
          >
            Log In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${outfit.className} mx-auto max-w-[1100px] px-4 pb-16 pt-4 md:pt-6`}>
      <div className={`${shellCardClasses} px-5 py-5 sm:px-6 sm:py-6`}>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4 sm:gap-5">
            <div className="relative shrink-0">
              <Avatar
                name={displayName}
                size={86}
                className="border-[3px] border-white text-[32px] text-[#202531] shadow-[0_16px_34px_rgba(24,35,61,0.14)]"
              />
              <span className="absolute bottom-[6px] right-[6px] flex h-4 w-4 items-center justify-center rounded-full border-[3px] border-white bg-[#1456f4]" />
            </div>

            <div className="min-w-0">
              <h1 className="truncate text-[34px] font-[800] leading-[0.96] tracking-[-0.07em] text-[#20242d] sm:text-[40px]">
                {displayName}
              </h1>
              <p className="mt-2 text-[13px] font-medium text-[#7a8394]">
                {displayHandle}{" "}
                <span className="px-1.5 text-[#bcc4d1]">•</span>
                {collegeAcronym}
              </p>
              <p className="mt-3 max-w-[560px] text-[15px] leading-[1.7] text-[#616c7e]">
                {displayBio}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start">
            <button
              type="button"
              onClick={handleOpenEditor}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#1456f4] px-5 text-[12px] font-semibold text-white shadow-[0_14px_28px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
            >
              Edit Profile
            </button>
            <button
              type="button"
              onClick={handleShare}
              aria-label="Share profile"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white text-[#5e6778] transition hover:border-[#d6dce8] hover:text-[#20242d]"
            >
              <ShareIcon className="h-[18px] w-[18px]" />
            </button>
            <span className="sr-only">{shareLabel}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className={`${shellCardClasses} p-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
              My Ecosystem
            </p>
            <div className="mt-4 divide-y divide-[#edf1f6]">
              {ecosystemStats.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#eef3ff] text-[#1456f4]">
                      {item.icon}
                    </span>
                    <span className="text-[13px] font-medium text-[#434b5a]">
                      {item.label}
                    </span>
                  </div>
                  <span className="text-[18px] font-[800] tracking-[-0.05em] text-[#20242d]">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className={`${shellCardClasses} p-4`}>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
              Badges
            </p>
            <div className="mt-4 space-y-3">
              {displayBadges.map((badge) => (
                <div
                  key={badge}
                  className="flex items-center gap-3 rounded-[18px] bg-[#f7f9fc] px-3 py-3"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#edf3ff] text-[#1456f4]">
                    <ShieldIcon className="h-4 w-4" />
                  </span>
                  <p className="text-[13px] font-medium leading-[1.45] text-[#434b5a]">
                    {badge}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-[34px] border border-[#376ef7]/20 bg-[linear-gradient(135deg,#2a63f5_0%,#5f84f7_100%)] p-6 text-white shadow-[0_26px_60px_rgba(20,86,244,0.22)] sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_210px] lg:items-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/84">
                Official University ID
              </p>
              <div className="mt-6 grid gap-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                    Student Name
                  </p>
                  <h2 className="mt-2 text-[34px] font-[800] leading-[0.94] tracking-[-0.06em] text-white sm:text-[40px]">
                    {displayName}
                  </h2>
                </div>

                <div className="grid gap-4 text-[14px] sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                      Affiliation
                    </p>
                    <p className="mt-1 font-medium text-white">{collegeLabel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                      Member ID
                    </p>
                    <p className="mt-1 font-medium text-white">{memberId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                      Handle
                    </p>
                    <p className="mt-1 font-medium text-white">{displayHandle}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/64">
                      Global Rank
                    </p>
                    <p className="mt-1 font-medium text-white">
                      {leaderboardRank ? `#${leaderboardRank}` : "Unranked"}
                    </p>
                  </div>
                </div>

                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/16 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]">
                  <span className="h-2 w-2 rounded-full bg-[#57e69a]" />
                  NFC Tap Ready
                </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[210px]">
              <div className="rounded-[30px] bg-white px-5 py-6 text-center text-[#20242d] shadow-[0_22px_45px_rgba(22,34,72,0.18)]">
                <div className="mx-auto flex h-[164px] w-[122px] items-center justify-center rounded-[16px] bg-[linear-gradient(180deg,#30404c_0%,#202936_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
                  <div className="flex h-[106px] w-[76px] flex-col items-center justify-center rounded-[12px] bg-white shadow-[0_16px_28px_rgba(17,27,57,0.12)]">
                    <SiteGlyph />
                    <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#5d6777]">
                      Verified
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#20242d]">
                  Scan to verify
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-10 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-[30px] font-[800] tracking-[-0.065em] text-[#20242d]">
            Identity Prompts
          </h2>
          {!isLoaded && (
            <p className="mt-2 text-[14px] text-[#8c95a6]">Loading your answers...</p>
          )}
        </div>
        <button
          type="button"
          onClick={handleOpenEditor}
          className="text-[11px] font-semibold tracking-[0.02em] text-[#1456f4] transition hover:text-[#0f49e2]"
        >
          Customize Prompts
        </button>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {promptCards.map((card) => (
          <PromptCard
            key={card.title}
            icon={card.icon}
            title={card.title}
            answer={card.answer}
            chips={card.chips}
            actionLabel={card.actionLabel}
            onAction={handleOpenEditor}
          />
        ))}
      </div>

      <ProfileQuestionnaireModal
        isOpen={isAnswerEditorOpen}
        onClose={() => setAnswerEditorOpen(false)}
      />
    </div>
  );
};

export const ProfileLayout = () => {
  return (
    <ProfileAnswersProvider>
      <ProfileLayoutInner />
    </ProfileAnswersProvider>
  );
};
