"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent, SVGProps } from "react";
import Link from "next/link";
import Image from "next/image";
import { Outfit } from "next/font/google";
import { createPortal } from "react-dom";
import type { DailyChallenge as DailyChallengeType, FeedPost } from "@lockedin/shared";
import {
  Ellipsis,
  Flame,
  Trophy,
  Zap,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";
import { PostComposerModal } from "./PostComposerModal";
import {
  dailyChallenge as fallbackDailyChallenge,
  feedPosts as fallbackFeedPosts,
} from "./mock";

type SortOption = "top" | "fresh";
type ScopeOption = "global" | "local";

type NotificationCountResponse = {
  count: number;
};

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const spotlightMeta = [
  {
    title: "HOTTEST TOPICS",
    icon: Flame,
    background:
      "linear-gradient(180deg, rgba(38,115,128,0.96) 0%, rgba(7,50,57,1) 100%)",
  },
  {
    title: "HOTTEST TOPICS",
    icon: Zap,
    background:
      "linear-gradient(180deg, rgba(223,232,223,0.98) 0%, rgba(192,201,193,0.95) 100%)",
  },
  {
    title: "LAST WEEK'S TOP CONTENDERS",
    icon: Trophy,
    background:
      "linear-gradient(180deg, rgba(247,204,140,0.98) 0%, rgba(184,146,96,0.96) 100%)",
  },
  {
    title: "LAST WEEK'S TOP CONTENDERS",
    icon: Trophy,
    background:
      "linear-gradient(180deg, rgba(54,119,130,0.98) 0%, rgba(8,46,52,1) 100%)",
  },
] as const;

type HeaderIconComponent = (props: SVGProps<SVGSVGElement>) => React.JSX.Element;

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

const navItems: Array<{
  href: string;
  label: string;
  icon: HeaderIconComponent;
  active?: boolean;
}> = [
  { href: "/", label: "HOME", icon: HomeNavIcon, active: true },
  { href: "/play", label: "CHALLENGES", icon: ChallengeNavIcon },
  { href: "/notifications", label: "CHAT", icon: ChatNavIcon },
  { href: "/map", label: "MAPS", icon: MapsNavIcon },
  { href: "/marketplace", label: "MARKET", icon: MarketNavIcon },
];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const normalizeText = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .trim();

const trimText = (value: string, limit: number) => {
  const cleaned = normalizeText(value);
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
};

const splitHeadline = (value: string) => {
  const cleaned = trimText(value, 72);
  const words = cleaned.split(" ");
  const middle = Math.ceil(words.length / 2);
  return {
    first: words.slice(0, middle).join(" "),
    second: words.slice(middle).join(" "),
  };
};

const formatPoints = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}KBLITZPTS`;
  }
  return `${value}BLITZPTS`;
};

const HeaderWordmark = () => (
  <span className="text-[21px] font-extrabold tracking-[-0.095em] text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]">
    QuadBlitz
  </span>
);

const matchesLocalPost = (
  post: FeedPost,
  user: {
    collegeName?: string | null;
    collegeDomain?: string | null;
  } | null
) => {
  if (!user) {
    return true;
  }

  const normalizedUserCollege = user.collegeName?.trim().toLowerCase() ?? "";
  const normalizedUserDomain = user.collegeDomain?.trim().toLowerCase() ?? "";
  const normalizedPostCollege = post.author.collegeName?.trim().toLowerCase() ?? "";
  const normalizedPostDomain = post.author.collegeDomain?.trim().toLowerCase() ?? "";

  return Boolean(
    (normalizedUserCollege && normalizedUserCollege === normalizedPostCollege) ||
      (normalizedUserDomain && normalizedUserDomain === normalizedPostDomain)
  );
};

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
    reader.onerror = () => {
      setError("Unable to read that image.");
    };
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
              <div className="mt-5 overflow-hidden rounded-[24px] border border-[#dde4ef] bg-white">
                <Image
                  src={previewUrl}
                  alt="Challenge submission preview"
                  width={1200}
                  height={900}
                  unoptimized
                  className="h-auto max-h-[420px] w-full object-cover"
                />
              </div>
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

const HeroFigure = () => (
  <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-[320px] -translate-x-1/2 lg:block">
    <div className="absolute left-1/2 top-3 h-[138px] w-[138px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_40%_35%,rgba(255,255,255,0.38),rgba(255,255,255,0.08)_70%,transparent_72%)] opacity-80" />
    <div className="absolute left-1/2 top-24 h-[230px] w-[160px] -translate-x-1/2 rounded-[46%] bg-[linear-gradient(180deg,rgba(255,255,255,0.2),rgba(255,255,255,0.05))] blur-[1px]" />
    <div className="absolute left-[112px] top-[188px] h-[236px] w-[60px] rotate-[8deg] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))]" />
    <div className="absolute right-[108px] top-[188px] h-[236px] w-[60px] -rotate-[8deg] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))]" />
    <div className="absolute left-[128px] top-[110px] h-[360px] w-[64px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))]" />
    <div className="absolute right-[122px] top-[118px] h-[352px] w-[64px] rounded-full bg-[linear-gradient(180deg,rgba(255,255,255,0.18),rgba(255,255,255,0.04))]" />
    <div className="absolute inset-y-0 left-1/2 w-[120px] -translate-x-1/2 bg-[radial-gradient(circle_at_center,rgba(82,144,255,0.42),transparent_70%)] blur-[36px]" />
  </div>
);

const HeroSection = ({
  challenge,
  onSubmitProof,
}: {
  challenge: DailyChallengeType;
  onSubmitProof: () => void;
}) => {
  const headline = splitHeadline(challenge.title);

  return (
    <section className="relative overflow-hidden rounded-[58px] bg-[linear-gradient(180deg,#2054cc_0%,#1657ef_100%)] px-6 py-8 text-white shadow-[0_28px_60px_rgba(24,82,235,0.22)] sm:px-10 sm:py-10 lg:min-h-[400px] lg:px-[40px] lg:py-[42px]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(85,156,255,0.36),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0))]" />
      <HeroFigure />
      <div className="relative flex h-full flex-col justify-between gap-10">
        <div className="max-w-[540px] pt-1">
          <div className="inline-flex rounded-full bg-white/18 px-[19px] py-[8px] text-[12px] font-semibold tracking-[0.27em] text-white/95">
            DAILY CHALLENGE
          </div>
          <h1 className="mt-7 text-[46px] font-extrabold leading-[0.92] tracking-[-0.085em] sm:text-[61px]">
            <span className="block">{headline.first}</span>
            {headline.second && <span className="block">{headline.second}</span>}
          </h1>
          <p className="mt-6 max-w-[470px] text-[15px] font-medium text-white/72 sm:text-[16px]">
            {trimText(challenge.description, 120)}
          </p>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-white/76">
            {challenge.participants} people are in today
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="inline-flex min-h-[53px] items-center justify-center rounded-full bg-white px-11 text-[18px] font-bold tracking-[-0.04em] text-[#1756f5] shadow-[0_20px_35px_rgba(8,33,100,0.18)]">
              +500 pts
            </div>
            <button
              type="button"
              className="inline-flex min-h-[53px] items-center justify-center rounded-full bg-white px-11 text-[14px] font-semibold tracking-[0.19em] text-[#1756f5] shadow-[0_20px_35px_rgba(8,33,100,0.18)] transition hover:translate-y-[-1px]"
              onClick={onSubmitProof}
            >
              SUBMIT PROOF
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

const SpotlightIllustration = ({
  variant,
  content,
}: {
  variant: number;
  content: string;
}) => {
  if (variant === 1) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-14 top-16 h-10 w-10 rounded-full bg-[#6a9041]/70 shadow-[0_0_0_8px_rgba(242,245,236,0.7)]" />
        <div className="absolute right-[68px] top-[94px] h-16 w-2 rounded-full bg-[#8b704b]" />
        {[0, 1].map((shelf) => (
          <div
            key={shelf}
            className={`absolute left-10 right-10 h-[18px] rounded-[3px] bg-[#7c5737]/85 shadow-[0_4px_10px_rgba(66,47,25,0.18)] ${
              shelf === 0 ? "bottom-[116px]" : "bottom-[48px]"
            }`}
          />
        ))}
        {Array.from({ length: 24 }).map((_, index) => {
          const height = 54 + (index % 5) * 10;
          const width = 7 + (index % 3);
          const row = index < 12 ? 0 : 1;
          return (
            <div
              key={index}
              className="absolute rounded-t-[2px] bg-[#c9c2b2] shadow-[inset_-1px_0_0_rgba(91,72,46,0.18)]"
              style={{
                bottom: row === 0 ? 133 : 65,
                left: `${52 + (index % 12) * 16}px`,
                height,
                width,
              }}
            />
          );
        })}
      </div>
    );
  }

  if (variant === 2) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[130px] h-[62px] w-[110px] -translate-x-1/2 rounded-[16px] bg-[#303030] shadow-[0_14px_22px_rgba(52,37,18,0.24)]" />
        <div className="absolute left-1/2 top-[116px] h-[24px] w-[86px] -translate-x-1/2 rounded-t-[12px] bg-[#cfc9c3]" />
        <div className="absolute left-1/2 top-[138px] h-[44px] w-[44px] -translate-x-1/2 rounded-full border-[6px] border-[#0f0f10] bg-[#202124]" />
        <div className="absolute left-1/2 top-[149px] h-[16px] w-[16px] -translate-x-1/2 rounded-full border-[3px] border-[#3d4655]" />
        <div className="absolute left-[108px] top-[122px] h-3 w-4 rounded-[6px] bg-[#d7d1ca]" />
        <div className="absolute right-[110px] top-[122px] h-3 w-4 rounded-[6px] bg-[#d7d1ca]" />
      </div>
    );
  }

  if (variant === 3) {
    return (
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[88px] h-[114px] w-[86px] -translate-x-1/2 rounded-[4px] border border-white/28 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] shadow-[18px_18px_24px_rgba(2,20,26,0.18)]" />
        <div className="absolute left-1/2 top-[118px] h-[1px] w-12 -translate-x-1/2 bg-white/24" />
        <div className="absolute left-1/2 top-[132px] h-[1px] w-9 -translate-x-1/2 bg-white/18" />
        <div className="absolute left-1/2 top-[144px] h-[1px] w-6 -translate-x-1/2 bg-white/12" />
        <div className="absolute left-[170px] top-[136px] h-[44px] w-[14px] rounded-[4px] border border-white/24 border-l-transparent" />
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      <div className="absolute inset-x-0 top-[86px] text-center text-[44px] font-semibold uppercase tracking-[0.04em] text-[#0d626f]/20">
        {trimText(content, 18)}
      </div>
      <div className="absolute inset-x-0 bottom-[72px] text-center text-[11px] font-medium uppercase tracking-[0.24em] text-white/30">
        campus event
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[84px] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,rgba(0,0,0,0.42)_100%)]" />
    </div>
  );
};

const SpotlightCard = ({
  index,
  post,
}: {
  index: number;
  post: FeedPost;
}) => {
  const meta = spotlightMeta[index % spotlightMeta.length];
  const Icon = meta.icon;

  return (
    <div
      className="group relative h-[270px] overflow-hidden rounded-[40px] text-white shadow-[0_24px_50px_rgba(14,27,46,0.12)]"
      style={{ backgroundImage: meta.background }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04)_0%,rgba(0,0,0,0.18)_100%)]" />
      <SpotlightIllustration variant={index % spotlightMeta.length} content={post.content} />
      <div className="relative flex h-full flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-3 text-white/82">
          <div className="flex items-center gap-2 text-[11px] font-medium">
            <Icon className="h-5 w-5" strokeWidth={2.1} />
            <span>{post.author.handle.replace(/^@/, "")}</span>
          </div>
          <span className="text-[10px] uppercase tracking-[0.24em] text-white/45">
            {post.type}
          </span>
        </div>
        <div className="relative z-10 mt-auto">
          <p className="max-w-[210px] text-[13px] font-bold leading-[1.05] tracking-[0.01em] text-white">
            {meta.title}
          </p>
          <p className="mt-2 text-[13px] leading-[1.25] text-white/88">
            {trimText(post.content, 56)}
          </p>
        </div>
      </div>
    </div>
  );
};

const FeedPoster = ({ post }: { post: FeedPost }) => {
  const authorName = post.author.name || post.author.handle.replace(/^@/, "");
  const posterHeadline = trimText(post.content, 44)
    .toUpperCase()
    .replace(/[.!?]+$/g, "");

  return (
    <article className="rounded-[42px] border border-[#edf0f6] bg-white p-5 shadow-[0_24px_70px_rgba(18,36,81,0.08)] sm:p-8">
      <div className="flex items-start gap-4">
        <Avatar
          name={authorName}
          size={50}
          className="shrink-0 border border-[#efede5] bg-[#f2ead8] text-[#4e4a3e]"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="truncate text-[19px] font-semibold tracking-[-0.03em] text-[#202531]">
                {authorName}
                <span className="ml-2 text-[18px] font-medium text-[#4d5464]">
                  {post.author.handle} • {formatRelativeTime(post.createdAt)}
                </span>
              </p>
              <p className="mt-1 text-[16px] leading-[1.45] text-[#454d5d]">
                {trimText(post.content, 150)}
              </p>
            </div>
            <Link
              href={`/posts/${encodeURIComponent(post.id)}`}
              aria-label="Open post"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#50586a] transition hover:bg-[#f3f6fb]"
            >
              <Ellipsis className="h-5 w-5" />
            </Link>
          </div>

          <Link
            href={`/posts/${encodeURIComponent(post.id)}`}
            className="mt-7 block overflow-hidden rounded-[31px] bg-[linear-gradient(120deg,#3f898c_0%,#08363a_36%,#4a8a8f_100%)]"
          >
            <div className="relative min-h-[280px] p-8 text-white sm:min-h-[360px] sm:p-12">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,20,24,0.46),rgba(5,20,24,0.1)_35%,rgba(255,255,255,0.06)_100%)]" />
              <div className="absolute left-[30%] top-0 h-full w-px bg-white/10" />
              <div className="absolute right-[18%] top-0 h-full w-px bg-white/8" />
              <div className="relative max-w-[520px]">
                <div className="text-[16px] uppercase tracking-[0.38em] text-white/70">
                  CAMPUS
                </div>
                <div className="mt-1 text-[16px] uppercase tracking-[0.38em] text-white/70">
                  LIFE...
                </div>
                <h3 className="mt-10 text-[32px] font-semibold leading-[1.02] tracking-[0.06em] text-white sm:text-[54px]">
                  {posterHeadline}
                </h3>
                {post.tags && post.tags.length > 0 && (
                  <div className="mt-8 flex flex-wrap gap-2">
                    {post.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/18 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/78"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Link>

          <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#626b7c]">
            <span className="rounded-full bg-[#f3f6fb] px-3 py-1 font-semibold text-[#2b3344]">
              {post.likeCount} likes
            </span>
            <span>{post.commentCount ?? 0} replies</span>
            <span className="uppercase tracking-[0.2em] text-[#9098a8]">{post.type}</span>
          </div>
        </div>
      </div>
    </article>
  );
};

export const HomeDashboard = () => {
  const { isAuthenticated, openAuthModal, token, user } = useAuth();
  const [challenge, setChallenge] = useState<DailyChallengeType | null>(null);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>(fallbackFeedPosts);
  const [spotlightPosts, setSpotlightPosts] = useState<FeedPost[]>(fallbackFeedPosts);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [sort, setSort] = useState<SortOption>("top");
  const [scope, setScope] = useState<ScopeOption>("global");
  const [unreadCount, setUnreadCount] = useState(0);
  const [isComposerOpen, setComposerOpen] = useState(false);
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

    apiGet<{ posts: FeedPost[] }>("/feed?sort=top", token ?? undefined)
      .then((payload) => {
        if (isActive) {
          setSpotlightPosts((payload.posts ?? []).length > 0 ? payload.posts : fallbackFeedPosts);
        }
      })
      .catch(() => {
        if (isActive) {
          setSpotlightPosts(fallbackFeedPosts);
        }
      });

    return () => {
      isActive = false;
    };
  }, [token]);

  useEffect(() => {
    let isActive = true;

    apiGet<{ posts: FeedPost[] }>(`/feed?sort=${sort}`, token ?? undefined)
      .then((payload) => {
        if (isActive) {
          setFeedPosts((payload.posts ?? []).length > 0 ? payload.posts : fallbackFeedPosts);
        }
      })
      .catch(() => {
        if (isActive) {
          setFeedPosts(fallbackFeedPosts);
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoadingFeed(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [sort, token]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadUnreadCount = async () => {
      try {
        const payload = await apiGet<NotificationCountResponse>(
          "/notifications/unread-count",
          token
        );
        if (isActive) {
          setUnreadCount(payload.count ?? 0);
        }
      } catch {
        if (isActive) {
          setUnreadCount(0);
        }
      }
    };

    void loadUnreadCount();
    const interval = window.setInterval(loadUnreadCount, 15000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [token]);

  const activeChallenge = challenge ?? fallbackDailyChallenge;
  const visiblePosts = useMemo(() => {
    if (scope === "global") {
      return feedPosts;
    }

    const filtered = feedPosts.filter((post) => matchesLocalPost(post, user));
    if (filtered.length > 0) {
      return filtered;
    }
    return feedPosts;
  }, [feedPosts, scope, user]);

  const visibleSpotlights = useMemo(() => {
    if (spotlightPosts.length === 0) {
      return [];
    }

    const filled = [...spotlightPosts];
    while (filled.length < 4) {
      filled.push(spotlightPosts[filled.length % spotlightPosts.length]);
    }
    return filled.slice(0, 4);
  }, [spotlightPosts]);

  const profileName = user?.name ?? "Guest User";
  const profilePoints = formatPoints(user?.coins ?? 0);

  const handleOpenComposer = () => {
    if (!token) {
      openAuthModal("signup");
      return;
    }
    setComposerOpen(true);
  };

  const handleSubmitProof = () => {
    if (!isAuthenticated) {
      openAuthModal("signup");
      return;
    }
    setProofModalOpen(true);
  };

  const handleCreatePost = async (payload: {
    type: "text" | "poll";
    content: string;
    tags: string[];
    pollOptions?: string[];
  }) => {
    if (!token) {
      openAuthModal("signup");
      throw new Error("Please sign in to post.");
    }

    const response = await apiPost<{ post: FeedPost }>("/feed", payload, token);
    setFeedPosts((current) =>
      sort === "fresh" ? [response.post, ...current] : [...current, response.post]
    );
  };

  return (
    <div className={`${outfit.className} min-h-screen bg-[#ffffff] text-[#131722]`}>
      <header className="sticky top-0 z-30 border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1880px] items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
          <div className="flex items-center gap-[54px]">
            <Link href="/" className="inline-flex items-center leading-none">
              <HeaderWordmark />
            </Link>
            <nav className="hidden items-center gap-[44px] lg:flex">
              {navItems.map(({ href, icon: Icon, label, active }) => (
                <Link
                  key={label}
                  href={href}
                  className={`inline-flex items-center gap-[9px] text-[14px] font-bold tracking-[-0.01em] transition ${
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
              {token && unreadCount > 0 && (
                <span className="absolute right-[9px] top-[6px] h-[4px] w-[4px] rounded-full bg-[#ff4c4c]" />
              )}
            </Link>

            {isAuthenticated ? (
              <Link
                href="/profile"
                className="flex items-center gap-3 border-l border-[#eceff5] pl-6"
              >
                <div className="text-right leading-none">
                  <p className="text-[14px] font-bold tracking-[-0.04em] text-[#20242d]">
                    {profileName}
                  </p>
                  <p className="mt-[3px] text-[10.5px] font-medium uppercase tracking-[-0.01em] text-[#666d7b]">
                    {profilePoints}
                  </p>
                </div>
                <Avatar
                  name={profileName}
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

      <div className="mx-auto max-w-[1140px] px-5 pb-16 pt-[16px] sm:px-8 lg:px-0 lg:pt-[18px]">
        <HeroSection challenge={activeChallenge} onSubmitProof={handleSubmitProof} />

        {proofNotice && (
          <div className="mt-4 rounded-[20px] border border-[#dbe5ff] bg-[#f5f8ff] px-5 py-4 text-sm font-medium text-[#1f4fd7]">
            {proofNotice}
          </div>
        )}

        <div className="mt-8 border-t border-[#edf0f6] pt-8">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {visibleSpotlights.map((post, index) => (
              <SpotlightCard key={`${post.id}-${index}`} index={index} post={post} />
            ))}
          </div>
        </div>

        <div className="mt-8 border-t border-[#edf0f6] pt-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <div className="inline-flex rounded-full bg-[#eef2f7] p-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                {([
                  { id: "global" as const, label: "Global" },
                  { id: "local" as const, label: "Local" },
                ]).map((option) => {
                  const active = scope === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-full px-[22px] py-[9px] text-[14px] font-semibold transition ${
                        active
                          ? "bg-white text-[#1756f5] shadow-[0_6px_16px_rgba(22,57,126,0.12)]"
                          : "text-[#4b5565]"
                      }`}
                      onClick={() => setScope(option.id)}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div className="inline-flex rounded-full bg-[#eef2f7] p-[4px] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                {([
                  { id: "top" as const, label: "Trending" },
                  { id: "fresh" as const, label: "Recent" },
                ]).map((option) => {
                  const active = sort === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`rounded-full px-[22px] py-[9px] text-[14px] font-semibold transition ${
                        active
                          ? "bg-[#1756f5] text-white shadow-[0_10px_20px_rgba(23,86,245,0.24)]"
                          : "text-[#4b5565]"
                      }`}
                      onClick={() => {
                        if (sort === option.id) {
                          return;
                        }
                        setIsLoadingFeed(true);
                        setSort(option.id);
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex min-h-[52px] items-center justify-center rounded-full bg-[linear-gradient(90deg,#1756f5,#4c86f8)] px-[50px] text-[14px] font-semibold tracking-[0.16em] text-white shadow-[0_18px_30px_rgba(23,86,245,0.22)] transition hover:translate-y-[-1px]"
              onClick={handleOpenComposer}
            >
              CREATE POST
            </button>
          </div>

          <div className="mt-6 space-y-6">
            {isLoadingFeed ? (
              <div className="rounded-[34px] border border-[#edf0f6] bg-white px-6 py-10 text-center text-[#677183] shadow-[0_18px_50px_rgba(18,36,81,0.06)]">
                Loading messages...
              </div>
            ) : visiblePosts.length === 0 ? (
              <div className="rounded-[34px] border border-[#edf0f6] bg-white px-6 py-10 text-center shadow-[0_18px_50px_rgba(18,36,81,0.06)]">
                <p className="text-lg font-semibold tracking-[-0.03em] text-[#1e2430]">
                  No posts yet
                </p>
                <p className="mt-2 text-sm text-[#677183]">
                  Create the first post to get the campus feed moving.
                </p>
              </div>
            ) : (
              visiblePosts.map((post) => <FeedPoster key={post.id} post={post} />)
            )}
          </div>
        </div>
      </div>

      <PostComposerModal
        isOpen={isComposerOpen}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleCreatePost}
      />
      <ChallengeProofModal
        challengeTitle={activeChallenge.title}
        isOpen={isProofModalOpen}
        onClose={() => setProofModalOpen(false)}
        onSuccess={() => setProofNotice("Proof submitted. The challenge team can review it now.")}
        token={token}
      />
    </div>
  );
};
