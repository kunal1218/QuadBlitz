"use client";

import type { MouseEvent, ReactElement, SVGProps } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GroupsNavIcon } from "@/components/GroupsNavIcon";
import { useAuth } from "@/features/auth";
import { Avatar } from "@/components/Avatar";
import { apiGet } from "@/lib/api";
import { formatHeaderPoints } from "@/lib/points";
import { Button } from "./Button";

type NavItem = {
  href: string;
  label: string;
  icon?: HeaderIconComponent;
};

type HeaderIconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

const HomeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.9 7.12 8 2.86l5.1 4.26v5.14a.8.8 0 0 1-.8.8H9.44V9.4H6.56v3.66H3.7a.8.8 0 0 1-.8-.8V7.12Z"
      fill="currentColor"
    />
  </svg>
);

const PlayNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M5.1 3.1 12.4 8l-7.3 4.9V3.1Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
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

const RequestsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M4.2 2.75h7.6a1.05 1.05 0 0 1 1.05 1.05v8.4a1.05 1.05 0 0 1-1.05 1.05H4.2a1.05 1.05 0 0 1-1.05-1.05V3.8A1.05 1.05 0 0 1 4.2 2.75Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
    <path d="M5.15 5.25h5.7M5.15 8h5.7M5.15 10.75h3.45" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" />
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

const baseNavItems: NavItem[] = [
  { href: "/", label: "HOME", icon: HomeNavIcon },
  { href: "/play", label: "PLAY", icon: PlayNavIcon },
  { href: "/friends", label: "CHAT", icon: ChatNavIcon },
  { href: "/map", label: "MAPS", icon: MapsNavIcon },
  { href: "/requests", label: "REQUESTS", icon: RequestsNavIcon },
  { href: "/challenges", label: "CHALLENGES", icon: ChallengeNavIcon },
  { href: "/clubs", label: "GROUPS", icon: GroupsNavIcon },
  { href: "/marketplace", label: "MARKET", icon: MarketNavIcon },
];

const SiteIcon = ({
  className,
}: {
  className?: string;
}) => (
  <svg
    viewBox="0 0 40 40"
    aria-hidden="true"
    className={className}
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
  <span className="inline-flex items-center gap-[10px] leading-none">
    <SiteIcon className="h-[34px] w-[34px] shrink-0" />
    <span className="text-[21px] font-extrabold tracking-[-0.045em] text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]">
      QuadBlitz
    </span>
  </span>
);

export const SiteHeader = () => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const profileName = user?.name ?? "Profile";
  const profilePoints = formatHeaderPoints(user?.coins ?? 0);
  const navItems = user?.isAdmin
    ? [...baseNavItems, { href: "/admin", label: "ADMIN" }]
    : baseNavItems;

  const handleNavClick =
    (href: string) => (event: MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      router.push(href);
      if (typeof window !== "undefined") {
        window.setTimeout(() => {
          if (window.location.pathname !== href) {
            window.location.assign(href);
          }
        }, 50);
      }
    };

  useEffect(() => {
    if (!token) {
      return;
    }

    let isActive = true;

    const loadCount = async () => {
      try {
        const payload = await apiGet<{ count: number }>(
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
  }, [pathname, token]);
  const isEmbedded = searchParams.get("embedded") === "1";

  if (
    isEmbedded ||
    pathname === "/" ||
    pathname === "/challenges" ||
    pathname.startsWith("/clubs") ||
    pathname === "/friends" ||
    pathname === "/map" ||
    pathname === "/notifications" ||
    pathname.startsWith("/posts") ||
    pathname.startsWith("/marketplace") ||
    pathname.startsWith("/profile")
  ) {
    return null;
  }

  return (
    <header
      data-site-header="true"
      className="sticky top-0 z-30 border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl"
    >
      <div className="flex w-full items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
        <div className="flex items-center gap-[54px]">
          <Link
            href="/"
            className="inline-flex items-center leading-none"
            onClick={handleNavClick("/")}
          >
            <HeaderWordmark />
          </Link>
          <nav className="hidden items-center gap-[28px] xl:gap-[38px] lg:flex">
            {navItems.map((item) => {
              const isActive =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex items-center gap-[9px] text-[14px] font-bold tracking-[-0.01em] transition ${
                    isActive
                      ? "text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]"
                      : "text-[#4b5059] hover:text-[#1456f4]"
                  }`}
                  onClick={handleNavClick(item.href)}
                >
                  {Icon ? (
                    <Icon
                      className={`h-[16px] w-[16px] ${
                        isActive ? "text-[#1456f4]" : "text-[#4f5560]"
                      }`}
                    />
                  ) : null}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-5">
          {!isAuthenticated ? (
            <Button
              className="rounded-full bg-[#1756f5] px-6 py-[15px] text-[13px] font-semibold tracking-[0.18em] text-white shadow-[0_14px_30px_rgba(23,86,245,0.22)] transition hover:translate-y-0 hover:bg-[#0f49e2]"
              authMode="signup"
            >
              SIGN UP
            </Button>
          ) : (
            <>
              <Link
                href="/notifications"
                onClick={handleNavClick("/notifications")}
                aria-label="Notifications"
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#252a34] transition hover:bg-[#f4f7fb]"
              >
                <BellNavIcon className="h-[20px] w-[20px]" />
                {token && unreadCount > 0 ? (
                  <span className="absolute right-[9px] top-[6px] h-[7px] w-[7px] rounded-full bg-[#ff4c4c]" />
                ) : null}
              </Link>
              <Link
                href="/profile"
                onClick={handleNavClick("/profile")}
                aria-label="Profile"
                className="flex items-center gap-3 border-l border-[#eceff5] pl-6"
              >
                <div className="hidden text-right leading-none sm:block">
                  <p className="text-[14px] font-bold tracking-[-0.04em] text-[#20242d]">
                    {profileName}
                  </p>
                  <p className="mt-[3px] text-[10.5px] font-medium uppercase tracking-[-0.01em] text-[#666d7b]">
                    {profilePoints}
                  </p>
                </div>
                <Avatar
                  name={profileName}
                  avatarUrl={user?.avatarUrl}
                  size={42}
                  className="border border-[#dde4ef] text-[#202531] shadow-[0_10px_20px_rgba(26,39,73,0.08)]"
                />
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
