"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent, JSX, SVGProps } from "react";
import Link from "next/link";
import Image from "next/image";
import { Outfit } from "next/font/google";
import { createPortal } from "react-dom";
import type { DailyChallenge as DailyChallengeType } from "@lockedin/shared";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import { dailyChallenge as fallbackDailyChallenge } from "@/features/home/mock";

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

type HeaderIconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const ELITE_QUAD_TARGET = 10000;

const HomeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.9 7.12 8 2.86l5.1 4.26v5.14a.8.8 0 0 1-.8.8H9.44V9.4H6.56v3.66H3.7a.8.8 0 0 1-.8-.8V7.12Z"
      fill="currentColor"
    />
  </svg>
);

const ChallengeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M8.77 1.92 4.52 8.22h2.9l-1.02 5.87 5.05-6.83H8.58l.19-5.34Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

const ChatNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.23 3.22h9.54a.8.8 0 0 1 .8.8v6.03a.8.8 0 0 1-.8.8H7.41L4.68 12.9v-2.05H3.23a.8.8 0 0 1-.8-.8V4.02a.8.8 0 0 1 .8-.8Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

const MapsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.5 4.35 6.42 2.8l3.17 1.06 3.91-1.55v9.34l-3.91 1.55-3.17-1.06-3.92 1.55V4.35Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path d="M6.42 2.8v9.34M9.58 3.86v9.34" stroke="currentColor" strokeWidth="1.65" />
  </svg>
);

const MarketNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.3 6.1h9.4v5.4a.8.8 0 0 1-.8.8H4.1a.8.8 0 0 1-.8-.8V6.1Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path
      d="M5.04 6.1V4.87a2.96 2.96 0 0 1 5.92 0V6.1M3.25 6.1l1.33-2.36M12.75 6.1l-1.33-2.36"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BellNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" {...props}>
    <path
      d="M9 2.8a3.1 3.1 0 0 0-3.1 3.1v1.35c0 .72-.22 1.42-.64 2l-1.13 1.58h9.76l-1.13-1.58a3.48 3.48 0 0 1-.64-2V5.9A3.1 3.1 0 0 0 9 2.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M7.2 12.4a1.8 1.8 0 0 0 3.6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const SiteIcon = () => (
  <svg
    viewBox="0 0 40 40"
    aria-hidden="true"
    className="h-[34px] w-[34px] shrink-0"
    xmlns="http://www.w3.org/2000/svg"
  >
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

const headerNavItems: Array<{
  href: string;
  label: string;
  icon: HeaderIconComponent;
  active?: boolean;
}> = [
  { href: "/", label: "HOME", icon: HomeNavIcon },
  { href: "/challenges", label: "CHALLENGES", icon: ChallengeNavIcon, active: true },
  { href: "/notifications", label: "CHAT", icon: ChatNavIcon },
  { href: "/map", label: "MAPS", icon: MapsNavIcon },
  { href: "/marketplace", label: "MARKET", icon: MarketNavIcon },
];

const formatCompactPoints = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return `${value}`;
};

const formatPointsLabel = (value: number) => `${formatCompactPoints(value)} PTS`;

const formatRankLabel = (rank: number | null) => (rank ? `#${rank}` : "#--");

const formatHandleLabel = (handle: string) =>
  handle.replace(/^@/, "").replace(/[_-]+/g, " ").toUpperCase();

const getTimeRemainingLabel = (endsAt: string) => {
  const diffMs = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(diffMs) || diffMs <= 0) {
    return "ENDS TODAY";
  }

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `ENDS IN ${hours}H ${minutes}M`;
};

const getDisplayLeaderboardEntries = (
  entries: LeaderboardEntry[],
  currentUserId?: string | null
) => {
  const ranked = entries.map((entry, index) => ({
    entry,
    rank: index + 1,
    highlighted: entry.id === currentUserId,
  }));

  if (!currentUserId) {
    return ranked.slice(0, 5);
  }

  const current = ranked.find((item) => item.entry.id === currentUserId);
  if (!current) {
    return ranked.slice(0, 5);
  }

  if (current.rank <= 5) {
    return ranked.slice(0, 5);
  }

  const withoutCurrent = ranked.filter((item) => item.entry.id !== currentUserId);
  return [...withoutCurrent.slice(0, 2), current, ...withoutCurrent.slice(2, 4)];
};

const loadLeaderboardEntries = async (token: string | null) => {
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

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const payload = await apiGet<{ entries: LeaderboardEntry[] }>(
        attempt.path,
        attempt.token
      );
      return payload.entries ?? [];
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Unable to load leaderboard.");
};

const HeaderWordmark = () => (
  <span className="inline-flex items-center gap-[10px]">
    <SiteIcon />
    <span className="text-[21px] font-extrabold tracking-[-0.045em] text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]">
      QuadBlitz
    </span>
  </span>
);

const StatueMissionArt = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[40px]">
    <div className="absolute inset-0 bg-[linear-gradient(180deg,#1b4a4a_0%,#082023_100%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_60%_28%,rgba(255,255,255,0.12),transparent_34%)]" />
    <div className="absolute left-1/2 top-[38px] h-[58px] w-[58px] -translate-x-1/2 rounded-full bg-[linear-gradient(180deg,rgba(198,227,217,0.55),rgba(198,227,217,0.12))]" />
    <div className="absolute left-1/2 top-[92px] h-[170px] w-[122px] -translate-x-1/2 rounded-[46%] bg-[linear-gradient(180deg,rgba(210,235,224,0.65),rgba(103,149,136,0.18))]" />
    <div className="absolute left-[156px] top-[146px] h-[170px] w-[44px] rotate-[8deg] rounded-full bg-[linear-gradient(180deg,rgba(205,232,222,0.55),rgba(100,145,132,0.12))]" />
    <div className="absolute right-[158px] top-[146px] h-[170px] w-[44px] -rotate-[8deg] rounded-full bg-[linear-gradient(180deg,rgba(205,232,222,0.55),rgba(100,145,132,0.12))]" />
    <div className="absolute left-[184px] top-[192px] h-[138px] w-[36px] rotate-[4deg] rounded-full bg-[linear-gradient(180deg,rgba(205,232,222,0.55),rgba(100,145,132,0.12))]" />
    <div className="absolute right-[184px] top-[192px] h-[138px] w-[36px] -rotate-[4deg] rounded-full bg-[linear-gradient(180deg,rgba(205,232,222,0.55),rgba(100,145,132,0.12))]" />
    <div className="absolute inset-x-0 bottom-0 h-[82px] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.45)_100%)]" />
  </div>
);

const LibraryMissionArt = () => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[40px]">
    <div className="absolute inset-0 bg-[linear-gradient(180deg,#dfe5dc_0%,#c6cfca_100%)]" />
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.8),transparent_32%)]" />
    <div className="absolute right-[56px] top-[56px] h-8 w-8 rounded-full bg-[#688d53]/80 shadow-[0_0_0_6px_rgba(236,240,232,0.65)]" />
    <div className="absolute right-[70px] top-[82px] h-12 w-[6px] rounded-full bg-[#7d6247]" />
    {[0, 1].map((index) => (
      <div
        key={index}
        className={`absolute left-[48px] right-[48px] h-[18px] rounded-[3px] bg-[#7d5738] shadow-[0_4px_10px_rgba(66,47,25,0.18)] ${
          index === 0 ? "bottom-[132px]" : "bottom-[60px]"
        }`}
      />
    ))}
    {Array.from({ length: 28 }).map((_, index) => {
      const height = 40 + (index % 5) * 8;
      const row = index < 14 ? 0 : 1;
      return (
        <div
          key={index}
          className="absolute rounded-t-[2px] bg-[#cbc4b4] shadow-[inset_-1px_0_0_rgba(91,72,46,0.18)]"
          style={{
            bottom: row === 0 ? 149 : 77,
            left: `${62 + (index % 14) * 14}px`,
            height,
            width: 7,
          }}
        />
      );
    })}
    <div className="absolute inset-x-0 bottom-0 h-[82px] bg-[linear-gradient(180deg,rgba(0,0,0,0)_0%,rgba(0,0,0,0.42)_100%)]" />
  </div>
);

const CafeArt = () => (
  <div className="relative h-full overflow-hidden rounded-[34px] bg-[linear-gradient(180deg,#f6f8fd_0%,#e8edf6_100%)]">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_62%_28%,rgba(255,255,255,0.88),transparent_34%)]" />
    <div className="absolute left-[28px] bottom-[32px] h-[94px] w-[4px] rounded-full bg-[#91785d]" />
    <div className="absolute left-[16px] bottom-[110px] h-[46px] w-[30px] rounded-full bg-[#669a72]/75 shadow-[0_0_0_8px_rgba(241,245,239,0.9)]" />
    {[0, 1].map((lamp) => (
      <div key={lamp} className={`absolute top-[28px] ${lamp === 0 ? "left-[92px]" : "left-[168px]"}`}>
        <div className="mx-auto h-[38px] w-[2px] bg-[#474d59]/35" />
        <div className="h-[22px] w-[24px] rounded-b-[14px] rounded-t-[4px] bg-[#23262d] shadow-[0_8px_18px_rgba(0,0,0,0.14)]" />
      </div>
    ))}
    <div className="absolute left-[62px] top-[86px] h-[18px] w-[142px] rounded-full bg-white/70 text-center text-[11px] font-semibold tracking-[0.18em] text-[#303543]">
      <span className="relative top-[2px]">CAMPUS CAFE</span>
    </div>
    <div className="absolute bottom-[36px] left-[52px] h-[34px] w-[146px] rounded-[10px] bg-[#b88a57]" />
    <div className="absolute bottom-[70px] left-[62px] h-[44px] w-[128px] rounded-[12px] bg-[#7f8d85] shadow-[0_16px_28px_rgba(45,52,61,0.14)]" />
    <div className="absolute bottom-[76px] left-[88px] h-[22px] w-[74px] rounded-[6px] bg-[#d4b78a]" />
  </div>
);

const MedalIcon = () => (
  <svg viewBox="0 0 48 48" className="h-10 w-10" aria-hidden="true">
    <path d="M16 5h6l2 9h-8L16 5Zm10 0h6l0 9h-8l2-9Z" fill="#1456f4" />
    <circle cx="24" cy="25" r="10" fill="#1456f4" />
    <path d="M24 19.5v11M19 25h10" stroke="white" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const CameraBadge = () => (
  <svg viewBox="0 0 22 22" className="h-6 w-6" aria-hidden="true">
    <path d="M4 7.5h14v9.5H4V7.5Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
    <path d="M8 7.5 9.4 5.6h3.2L14 7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="11" cy="12.25" r="2.8" stroke="white" strokeWidth="2" />
  </svg>
);

const MapBadge = () => (
  <svg viewBox="0 0 22 22" className="h-6 w-6" aria-hidden="true">
    <path d="M4 6.5 9 4.5l4 1.4 5-2v11l-5 2-4-1.4-5 2v-11Z" stroke="white" strokeWidth="2" strokeLinejoin="round" />
    <path d="M9 4.5v11M13 5.9v11" stroke="white" strokeWidth="2" />
    <circle cx="11" cy="7.7" r="1.4" fill="white" />
  </svg>
);

const ShareBadge = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
    <path
      d="M16.4 8.4a2.4 2.4 0 1 0-2.26-3.2 2.4 2.4 0 0 0 2.26 3.2ZM7.6 14.4a2.4 2.4 0 1 0-2.26-3.2 2.4 2.4 0 0 0 2.26 3.2Zm8.8 6a2.4 2.4 0 1 0-2.26-3.2 2.4 2.4 0 0 0 2.26 3.2Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
    <path d="m9.8 11.1 4.4-2.4m-4.4 4.8 4.4 2.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ChallengeProofModal = ({
  challengeTitle,
  isOpen,
  onClose,
  onSuccess,
  token,
}: {
  challengeTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  token: string | null;
}) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setImageData(null);
    setPreviewUrl(null);
    setError(null);
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") {
    return null;
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image is too large. Please keep it under 2MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      setImageData(result || null);
      setPreviewUrl(result || null);
      setError(null);
    };
    reader.onerror = () => setError("Unable to read that image.");
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      setError("Please sign in before submitting.");
      return;
    }

    if (!imageData) {
      setError("Please add a photo before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await apiPost("/challenge/attempts", { imageData }, token);
      onSuccess();
      onClose();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to submit your proof."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-10">
      <button
        type="button"
        className="absolute inset-0 bg-[#0b0d14]/45 backdrop-blur-[10px]"
        onClick={onClose}
        aria-label="Close challenge submission modal"
      />
      <div className="relative z-10 w-full max-w-[720px] overflow-hidden rounded-[32px] border border-[#e6ebf3] bg-white shadow-[0_40px_120px_rgba(18,29,68,0.25)]">
        <form className="space-y-6 p-6 sm:p-8" onSubmit={handleSubmit}>
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6e7585]">
                Daily Challenge
              </p>
              <h2 className="mt-3 text-[28px] font-bold tracking-[-0.05em] text-[#111827]">
                Submit Proof
              </h2>
              <p className="mt-2 text-sm text-[#60697c]">
                Upload a photo for “{challengeTitle}”.
              </p>
            </div>
            <button
              type="button"
              className="rounded-full border border-[#d9dfeb] px-4 py-2 text-xs font-semibold tracking-[0.14em] text-[#495266] transition hover:border-[#1756f5] hover:text-[#1756f5]"
              onClick={onClose}
            >
              CLOSE
            </button>
          </div>

          <div className="rounded-[28px] border border-dashed border-[#d4dced] bg-[#f7f9fc] p-5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#697287]">
              Upload Photo
            </label>
            <input
              type="file"
              accept="image/*"
              className="mt-4 block w-full text-sm text-[#556073] file:mr-4 file:rounded-full file:border-0 file:bg-[#1756f5] file:px-4 file:py-2 file:text-xs file:font-semibold file:text-white"
              onChange={handleFileChange}
            />
            <p className="mt-2 text-xs text-[#7d8697]">PNG or JPG, up to 2MB.</p>
            {previewUrl && (
              <Image
                src={previewUrl}
                alt="Challenge submission preview"
                width={1200}
                height={900}
                unoptimized
                className="mt-5 h-auto max-h-[420px] w-full rounded-[24px] border border-[#dde4ef] object-cover"
              />
            )}
          </div>

          {error && <p className="text-sm font-medium text-[#d33d32]">{error}</p>}

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="rounded-full border border-[#d9dfeb] px-5 py-3 text-xs font-semibold tracking-[0.16em] text-[#4f586d] transition hover:border-[#1756f5] hover:text-[#1756f5]"
              onClick={onClose}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-full bg-[#1756f5] px-6 py-3 text-xs font-semibold tracking-[0.16em] text-white shadow-[0_14px_30px_rgba(23,86,245,0.24)] transition hover:bg-[#0f49e2] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? "SUBMITTING..." : "SUBMIT PROOF"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default function ChallengesPage() {
  const { isAuthenticated, openAuthModal, token, user } = useAuth();
  const [challenge, setChallenge] = useState<DailyChallengeType | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [isLeaderboardLoading, setLeaderboardLoading] = useState(true);
  const [isProofModalOpen, setProofModalOpen] = useState(false);
  const [proofNotice, setProofNotice] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    apiGet<DailyChallengeType>("/challenge/today")
      .then((payload) => {
        if (isActive) {
          setChallenge(payload);
        }
      })
      .catch(() => {
        if (isActive) {
          setChallenge(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    loadLeaderboardEntries(token ?? null)
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setEntries(payload);
        setLeaderboardError(null);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        setEntries([]);
        setLeaderboardError(
          error instanceof Error ? error.message : "Unable to load leaderboard."
        );
      })
      .finally(() => {
        if (isActive) {
          setLeaderboardLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  const activeChallenge = challenge ?? fallbackDailyChallenge;
  const currentUserId = user?.id ?? null;
  const currentRank =
    currentUserId === null
      ? null
      : (() => {
          const index = entries.findIndex((entry) => entry.id === currentUserId);
          return index >= 0 ? index + 1 : null;
        })();

  const displayEntries = getDisplayLeaderboardEntries(entries, currentUserId);

  const coins = user?.coins ?? 0;
  const progressPercent = Math.min(100, Math.round((coins / ELITE_QUAD_TARGET) * 100));
  const pointsToElite = Math.max(0, ELITE_QUAD_TARGET - coins);
  const currentStatus = coins >= ELITE_QUAD_TARGET ? "ELITE QUAD" : "ADVANCED SCOUT";
  const timeRemainingLabel = getTimeRemainingLabel(activeChallenge.endsAt);
  const secondaryMissionTitle =
    currentRank && currentRank > 1
      ? `Pass ${Math.min(currentRank - 1, 3)} Blitzers today`
      : "Defend the top spot today";
  const secondaryMissionBody =
    currentRank && currentRank > 1
      ? `You are currently ${formatRankLabel(currentRank)}. A strong mission streak can push you upward fast.`
      : "Keep your momentum up and make it harder for the rest of campus to catch you.";

  const handleOpenProof = () => {
    if (!isAuthenticated) {
      openAuthModal("signup");
      return;
    }
    setProofModalOpen(true);
  };

  const handleShareFeatured = async () => {
    const payload = {
      title: "QuadBlitz Challenge Hub",
      text: `Leaderboard Sprint: ${secondaryMissionTitle}`,
      url: `${window.location.origin}/challenges`,
    };

    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }

      await navigator.clipboard.writeText(payload.url);
    } catch {
      // Ignore share failures.
    }
  };

  return (
    <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
      <header className="sticky top-0 z-30 border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1880px] items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
          <div className="flex items-center gap-[54px]">
            <Link href="/" className="inline-flex items-center leading-none">
              <HeaderWordmark />
            </Link>
            <nav className="hidden items-center gap-[44px] lg:flex">
              {headerNavItems.map(({ href, icon: Icon, label, active }) => (
                <Link
                  key={label}
                  href={href}
                  className={`inline-flex items-center gap-[9px] text-[14px] font-semibold tracking-[-0.01em] transition ${
                    active
                      ? "text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]"
                      : "text-[#4b5059] hover:text-[#1456f4]"
                  }`}
                >
                  <Icon
                    className={`h-[16px] w-[16px] ${active ? "text-[#1456f4]" : "text-[#4f5560]"}`}
                  />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-5">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#252a34] transition hover:bg-[#f4f7fb]"
            >
              <BellNavIcon className="h-[20px] w-[20px]" />
            </Link>

            {isAuthenticated ? (
              <Link href="/profile" className="flex items-center gap-3 border-l border-[#eceff5] pl-6">
                <div className="text-right leading-none">
                  <p className="text-[14px] font-bold tracking-[-0.04em] text-[#20242d]">
                    {user?.name ?? "Profile"}
                  </p>
                  <p className="mt-[3px] text-[10.5px] font-medium uppercase tracking-[-0.01em] text-[#666d7b]">
                    {formatPointsLabel(coins)}
                  </p>
                </div>
                <Avatar
                  name={user?.name ?? "Profile"}
                  size={42}
                  className="border border-[#dde4ef] bg-white text-[#202531] shadow-[0_10px_20px_rgba(26,39,73,0.08)]"
                />
              </Link>
            ) : (
              <button
                type="button"
                className="rounded-full bg-[#1756f5] px-6 py-[15px] text-[13px] font-semibold tracking-[0.18em] text-white shadow-[0_14px_30px_rgba(23,86,245,0.22)] transition hover:bg-[#0f49e2]"
                onClick={() => openAuthModal("signup")}
              >
                SIGN UP
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1140px] gap-12 px-5 pb-16 pt-10 lg:grid-cols-[1fr_346px] lg:px-0">
        <section>
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
              Campus Missions
            </p>
            <h1 className="mt-5 text-[64px] font-[700] leading-[0.91] tracking-[-0.068em] text-[#20242d]">
              Challenge Hub
            </h1>
          </div>

          {proofNotice && (
            <div className="mt-5 rounded-[20px] border border-[#dbe5ff] bg-[#f5f8ff] px-5 py-4 text-sm font-medium text-[#1f4fd7]">
              {proofNotice}
            </div>
          )}

          <div className="mt-10 flex items-center justify-between gap-4">
            <h2 className="text-[24px] font-[700] tracking-[-0.07em] text-[#232833]">
              Daily Challenges
            </h2>
            <div className="rounded-full bg-[#edf1f6] px-[18px] py-[8px] text-[12px] font-semibold tracking-[0.01em] text-[#4d5565]">
              {timeRemainingLabel}
            </div>
          </div>

          <div className="mt-8 grid gap-6 md:grid-cols-2">
            <article className="relative min-h-[356px] overflow-hidden rounded-[40px] px-8 pb-8 pt-8 text-white shadow-[0_26px_50px_rgba(10,24,32,0.14)]">
              <StatueMissionArt />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <CameraBadge />
                  <p className="text-[18px] font-[700] tracking-[-0.04em] text-white">+500</p>
                </div>
                <div className="mt-auto">
                  <h3 className="max-w-[270px] text-[21px] font-[700] leading-[1.08] tracking-[-0.05em] text-white">
                    {activeChallenge.title}
                  </h3>
                  <button
                    type="button"
                    className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-full bg-[#1756f5] text-[13px] font-semibold tracking-[0.22em] text-white shadow-[0_18px_30px_rgba(23,86,245,0.24)] transition hover:bg-[#0f49e2]"
                    onClick={handleOpenProof}
                  >
                    SUBMIT PROOF
                  </button>
                </div>
              </div>
            </article>

            <article className="relative min-h-[356px] overflow-hidden rounded-[40px] px-8 pb-8 pt-8 text-white shadow-[0_26px_50px_rgba(10,24,32,0.12)]">
              <LibraryMissionArt />
              <div className="relative flex h-full flex-col">
                <div className="flex items-start justify-between">
                  <MapBadge />
                  <p className="text-[18px] font-[700] tracking-[-0.04em] text-white">+250</p>
                </div>
                <div className="mt-auto">
                  <h3 className="max-w-[290px] text-[21px] font-[700] leading-[1.08] tracking-[-0.05em] text-white">
                    {secondaryMissionTitle}
                  </h3>
                  <p className="mt-3 max-w-[290px] text-[14px] leading-[1.45] text-white/78">
                    {secondaryMissionBody}
                  </p>
                  <Link
                    href="/leaderboard"
                    className="mt-5 inline-flex h-[50px] w-full items-center justify-center rounded-full bg-[#1756f5] text-[13px] font-semibold tracking-[0.22em] text-white shadow-[0_18px_30px_rgba(23,86,245,0.24)] transition hover:bg-[#0f49e2]"
                  >
                    VIEW BOARD
                  </Link>
                </div>
              </div>
            </article>
          </div>

          <article className="mt-7 rounded-[40px] border border-[#edf1f7] bg-[#fbfcff] p-8 shadow-[0_16px_38px_rgba(18,36,81,0.05)]">
            <div className="grid gap-8 md:grid-cols-[268px_1fr]">
              <div className="h-[204px]">
                <CafeArt />
              </div>
              <div className="flex flex-col justify-between">
                <div className="flex items-start justify-between gap-6">
                  <div className="max-w-[390px]">
                    <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
                      Featured Mission
                    </p>
                    <h3 className="mt-3 text-[26px] font-[700] tracking-[-0.06em] text-[#232833]">
                      Leaderboard Sprint
                    </h3>
                    <p className="mt-3 text-[15px] leading-[1.45] text-[#596274]">
                      {currentRank
                        ? `You are currently ${formatRankLabel(currentRank)}. Pair today’s mission with a leaderboard push and close the gap before the next reset.`
                        : "Complete today’s mission, bank points, and break into the Top Blitzers list."}
                    </p>
                  </div>
                  <p className="text-[30px] font-[700] tracking-[-0.05em] text-[#1456f4]">
                    +750
                  </p>
                </div>

                <div className="mt-8 flex items-center gap-4">
                  <Link
                    href="/leaderboard"
                    className="inline-flex h-[54px] min-w-[300px] items-center justify-center rounded-full bg-[#1756f5] px-10 text-[13px] font-semibold tracking-[0.22em] text-white shadow-[0_18px_30px_rgba(23,86,245,0.24)] transition hover:bg-[#0f49e2]"
                  >
                    START MISSION
                  </Link>
                  <button
                    type="button"
                    className="inline-flex h-[54px] w-[54px] items-center justify-center rounded-full border border-[#e7edf6] text-[#495365] transition hover:border-[#d7e0ee] hover:text-[#1456f4]"
                    onClick={handleShareFeatured}
                    aria-label="Share featured mission"
                  >
                    <ShareBadge />
                  </button>
                </div>
              </div>
            </div>
          </article>

          <div className="mt-12">
            <h2 className="text-[24px] font-[700] tracking-[-0.07em] text-[#232833]">
              Personal Progress
            </h2>
            <div className="mt-7 rounded-[42px] border border-[#dbe3ff] bg-[linear-gradient(180deg,#eef3ff_0%,#e9eefb_100%)] px-10 py-11 shadow-[0_18px_40px_rgba(18,36,81,0.05)]">
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
                    Current Status: {currentStatus}
                  </p>
                  <h3 className="mt-4 text-[36px] font-[700] tracking-[-0.07em] text-[#20242d]">
                    {pointsToElite.toLocaleString()} PTS to Elite Quad
                  </h3>
                  <div className="mt-6 flex items-center justify-between text-[14px] font-semibold text-[#1456f4]">
                    <span>{progressPercent}%</span>
                    <span>{formatPointsLabel(coins)}</span>
                  </div>
                  <div className="mt-4 h-3 rounded-full bg-[#d6dde9]">
                    <div
                      className="h-3 rounded-full bg-[linear-gradient(90deg,#2d6bff,#5b8cff)]"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
                <div className="flex h-[94px] w-[94px] shrink-0 items-center justify-center rounded-full bg-white shadow-[0_12px_30px_rgba(20,86,244,0.12)]">
                  <MedalIcon />
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="lg:sticky lg:top-[108px] lg:self-start">
          <div className="rounded-[44px] border border-[#e8edf4] bg-[#f5f7fb] py-6 shadow-[0_10px_26px_rgba(18,36,81,0.04)]">
            <div className="grid grid-cols-2 divide-x divide-[#e7ebf3]">
              <div className="px-7">
                <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] leading-none text-[#596274]">
                  Current Balance
                </p>
                <p className="mt-[10px] text-[26px] font-[700] tracking-[-0.05em] text-[#1456f4]">
                  {formatCompactPoints(coins)}
                  <span className="ml-1 text-[12px] font-semibold tracking-[0.02em]">PTS</span>
                </p>
              </div>
              <div className="px-7 text-right">
                <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] leading-none text-[#596274]">
                  Global Rank
                </p>
                <p className="mt-[10px] text-[26px] font-[700] tracking-[-0.05em] text-[#20242d]">
                  {formatRankLabel(currentRank)}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-12 rounded-[42px] border border-[#e8edf4] bg-[#f5f7fb] px-7 py-8 shadow-[0_10px_26px_rgba(18,36,81,0.04)]">
            <div className="flex items-center justify-between gap-4">
                <h2 className="text-[20px] font-[700] tracking-[-0.06em] text-[#20242d]">
                Top Blitzers
              </h2>
              <Link
                href="/leaderboard"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#20242d]"
              >
                VIEW ALL
              </Link>
            </div>

            <div className="mt-8 space-y-4">
              {isLeaderboardLoading ? (
                <div className="rounded-[28px] border border-[#e6ecf5] bg-white px-5 py-6 text-sm text-[#667183]">
                  Loading leaderboard...
                </div>
              ) : leaderboardError ? (
                <div className="rounded-[28px] border border-[#e6ecf5] bg-white px-5 py-6 text-sm text-[#667183]">
                  Top Blitzers are loading right now.
                </div>
              ) : displayEntries.length === 0 ? (
                <div className="rounded-[28px] border border-[#e6ecf5] bg-white px-5 py-6 text-sm text-[#667183]">
                  No leaderboard entries yet.
                </div>
              ) : (
                displayEntries.map(({ entry, rank, highlighted }) => (
                  <div
                    key={`${entry.id}-${rank}`}
                    className={`flex items-center gap-4 rounded-[28px] px-4 py-5 ${
                      highlighted
                        ? "bg-[linear-gradient(90deg,#1456f4,#4b7df8)] text-white shadow-[0_18px_36px_rgba(20,86,244,0.2)]"
                        : "bg-white"
                    }`}
                  >
                    <div
                      className={`w-9 text-center text-[14px] font-bold ${
                        highlighted ? "text-white/80" : "text-[#9aa1ad]"
                      }`}
                    >
                      {String(rank).padStart(2, "0")}
                    </div>
                    <div className="relative">
                      <Avatar
                        name={entry.name}
                        size={46}
                        className={highlighted ? "border border-white/20 text-[#202531]" : "border border-[#e5ebf5] text-[#202531]"}
                      />
                      {rank === 1 && (
                        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#ffcf30] text-[11px] text-white">
                          ★
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[17px] font-bold leading-[1.05] tracking-[-0.03em] ${highlighted ? "text-white" : "text-[#20242d]"}`}>
                        {highlighted ? "YOU" : entry.name}
                      </p>
                      <p className={`mt-1 text-[11px] font-medium uppercase tracking-[0.02em] ${highlighted ? "text-white/72" : "text-[#6b7280]"}`}>
                        {formatHandleLabel(entry.handle)}
                      </p>
                    </div>
                    <div className={`text-[16px] font-bold tracking-[-0.03em] ${highlighted ? "text-white" : "text-[#20242d]"}`}>
                      {formatCompactPoints(entry.coins)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>

      <ChallengeProofModal
        challengeTitle={activeChallenge.title}
        isOpen={isProofModalOpen}
        onClose={() => setProofModalOpen(false)}
        onSuccess={() => setProofNotice("Proof submitted. The challenge team can review it now.")}
        token={token}
      />
    </div>
  );
}
