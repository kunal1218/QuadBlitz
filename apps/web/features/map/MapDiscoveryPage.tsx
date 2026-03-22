"use client";

import type { JSX, SVGProps } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiGet } from "@/lib/api";
import { formatHeaderPoints } from "@/lib/points";
import { MapCanvas } from "./MapCanvas";

type NotificationCountResponse = {
  count: number;
};

type HeaderIconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

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
    <path
      d="M7.2 12.4a1.8 1.8 0 0 0 3.6 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
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

const HeaderWordmark = () => (
  <span className="inline-flex items-center gap-[10px]">
    <SiteIcon />
    <span className="text-[21px] font-extrabold tracking-[-0.045em] text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]">
      QuadBlitz
    </span>
  </span>
);

const headerNavItems: Array<{
  href: string;
  label: string;
  icon: HeaderIconComponent;
  active?: boolean;
}> = [
  { href: "/", label: "HOME", icon: HomeNavIcon },
  { href: "/challenges", label: "CHALLENGES", icon: ChallengeNavIcon },
  { href: "/friends", label: "CHAT", icon: ChatNavIcon },
  { href: "/map", label: "MAPS", icon: MapsNavIcon, active: true },
  { href: "/marketplace", label: "MARKET", icon: MarketNavIcon },
];

export const MapDiscoveryPage = () => {
  const { token, user, isAuthenticated, openAuthModal } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const profileName = user?.name ?? "Profile";
  const profilePoints = formatHeaderPoints(user?.coins ?? 0);

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadCount = async () => {
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

    loadCount();
    const interval = window.setInterval(loadCount, 15000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [token]);

  return (
    <div className={`${outfit.className} h-screen overflow-hidden bg-white text-[#181d25]`}>
      <header className="sticky top-0 z-30 border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl">
        <div className="flex w-full items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
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
                    className={`h-[16px] w-[16px] ${
                      active ? "text-[#1456f4]" : "text-[#4f5560]"
                    }`}
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

      <div className="h-[calc(100vh-81px)] overflow-hidden">
        <MapCanvas variant="discovery" />
      </div>
    </div>
  );
};
