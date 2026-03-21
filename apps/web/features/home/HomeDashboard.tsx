"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bell,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Gamepad2,
  Landmark,
  MessageSquareMore,
  Palette,
  Rocket,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
  PersonStanding,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
};

type HeroCard = {
  badge: string;
  title: string;
  description: string;
  count: string;
  background: string;
};

type OrgCard = {
  title: string;
  description: string;
  members: string;
  icon: LucideIcon;
};

type ClubRow = {
  title: string;
  description: string;
  members: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: "/", label: "Discover", icon: Sparkles, active: true },
  { href: "/clubs", label: "My Clubs", icon: Users },
  { href: "/map", label: "Events", icon: CalendarDays },
  { href: "/clubs", label: "Verified Orgs", icon: BadgeCheck },
  { href: "/profile", label: "Settings", icon: Settings2 },
];

const heroCards: HeroCard[] = [
  {
    badge: "Popular Now",
    title: "Innovation Tech Lab",
    description: "Building the next generation of campus startups and tech.",
    count: "+124",
    background:
      "linear-gradient(180deg, rgba(11,18,32,0.02) 0%, rgba(11,18,32,0.84) 100%), radial-gradient(circle at 18% 14%, rgba(176, 216, 192, 0.55), transparent 24%), radial-gradient(circle at 60% 20%, rgba(245, 244, 241, 0.48), transparent 20%), radial-gradient(circle at 70% 72%, rgba(67, 77, 93, 0.46), transparent 18%), linear-gradient(135deg, #5d6a71 0%, #29313a 38%, #0f1419 100%)",
  },
  {
    badge: "Weekend Event",
    title: "Campus Soundwaves",
    description: "Live music, festivals, and student performances.",
    count: "2.4k",
    background:
      "linear-gradient(180deg, rgba(14,16,22,0.04) 0%, rgba(14,16,22,0.72) 100%), radial-gradient(circle at 18% 14%, rgba(161, 219, 113, 0.82), transparent 28%), radial-gradient(circle at 74% 18%, rgba(134, 201, 245, 0.78), transparent 24%), radial-gradient(circle at 56% 54%, rgba(203, 123, 73, 0.5), transparent 18%), linear-gradient(135deg, #688443 0%, #8f8b48 34%, #b66b3c 60%, #2e4158 100%)",
  },
];

const orgCards: OrgCard[] = [
  {
    title: "Student Government",
    description:
      "Representing the student body and managing campus-wide legislative initiatives.",
    members: "4.2K Members",
    icon: Landmark,
  },
  {
    title: "Aerospace Society",
    description:
      "NASA-backed research group focused on rocketry and orbital mechanics projects.",
    members: "850 Members",
    icon: Rocket,
  },
  {
    title: "Fine Arts Council",
    description:
      "Curation and management of campus galleries and biennial art showcase.",
    members: "1.1K Members",
    icon: Palette,
  },
];

const clubRows: ClubRow[] = [
  {
    title: "Morning Runners",
    description: "Meeting every Tue & Thu at North Gate",
    members: "230",
    icon: PersonStanding,
  },
  {
    title: "Philosophy Tea Club",
    description: "Late night discussions on existentialism and oolong.",
    members: "45",
    icon: BookOpen,
  },
  {
    title: "E-Sports Alliance",
    description: "Competitive gaming teams and social viewing parties.",
    members: "1.8k",
    icon: Gamepad2,
  },
];

const BrandMark = () => (
  <div className="flex items-center gap-3">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#2153f6] shadow-[0_14px_30px_rgba(33,83,246,0.26)]">
      <svg
        viewBox="0 0 48 48"
        className="h-7 w-7"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="24" cy="24" r="5.6" fill="white" />
        <circle cx="24" cy="10.5" r="3.2" fill="white" />
        <circle cx="24" cy="37.5" r="3.2" fill="white" />
        <circle cx="10.5" cy="24" r="3.2" fill="white" />
        <circle cx="37.5" cy="24" r="3.2" fill="white" />
        <circle cx="14.4" cy="14.4" r="3.2" fill="white" />
        <circle cx="33.6" cy="14.4" r="3.2" fill="white" />
        <circle cx="14.4" cy="33.6" r="3.2" fill="white" />
        <circle cx="33.6" cy="33.6" r="3.2" fill="white" />
        <path
          d="M24 14.5v19M14.5 24h19M17.3 17.3l13.4 13.4M30.7 17.3 17.3 30.7"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.72"
        />
      </svg>
    </div>
    <div className="leading-none">
      <p className="text-[2rem] font-bold tracking-[-0.05em] text-[#2153f6]">QuadBlitz</p>
      <p className="mt-1 text-[0.7rem] font-medium uppercase tracking-[0.34em] text-[#8a92a7]">
        Campus Hub
      </p>
    </div>
  </div>
);

const SidebarLink = ({ href, label, icon: Icon, active }: NavItem) => (
  <Link
    href={href}
    className={`flex items-center gap-4 rounded-full px-6 py-4 text-[1.05rem] font-medium transition ${
      active
        ? "bg-white text-[#2153f6] shadow-[0_12px_30px_rgba(17,24,39,0.06)]"
        : "text-[#667089] hover:bg-white/70 hover:text-[#232631]"
    }`}
  >
    <Icon className={`h-5 w-5 ${active ? "text-[#2153f6]" : "text-[#65718c]"}`} strokeWidth={2.2} />
    <span>{label}</span>
  </Link>
);

const MobileNav = () => (
  <div className="flex gap-3 overflow-x-auto pb-1 lg:hidden">
    {navItems.map(({ href, label, icon: Icon, active }) => (
      <Link
        key={label}
        href={href}
        className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition ${
          active
            ? "border-[#2153f6] bg-[#2153f6] text-white shadow-[0_14px_30px_rgba(33,83,246,0.18)]"
            : "border-[#e4e8f3] bg-white text-[#4b5567]"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.2} />
        <span>{label}</span>
      </Link>
    ))}
  </div>
);

const MemberStack = ({ count }: { count: string }) => (
  <div className="flex items-center">
    {["AM", "LC", "RY"].map((initials, index) => (
      <div
        key={initials}
        className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-[0.66rem] font-bold text-[#232631] ${
          index === 0 ? "bg-[#ffc8a6]" : index === 1 ? "bg-[#ffdfbf]" : "bg-[#f5bd8d]"
        } ${index === 0 ? "" : "-ml-2.5"}`}
      >
        {initials}
      </div>
    ))}
    <div className="-ml-2.5 flex h-9 min-w-9 items-center justify-center rounded-full border-2 border-white bg-[#1f2430] px-2 text-[0.72rem] font-semibold text-white">
      {count}
    </div>
  </div>
);

export const HomeDashboard = () => {
  const { user } = useAuth();
  const profileName = user?.name ?? "Alex Chen";

  return (
    <div className="min-h-screen bg-[#f4f5f9] text-[#232631]">
      <div className="mx-auto max-w-[1500px] lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
        <aside className="hidden border-r border-white/70 bg-[#f7f8fc] px-8 py-6 lg:flex lg:min-h-screen lg:flex-col">
          <BrandMark />
          <nav className="mt-12 space-y-3">
            {navItems.map((item) => (
              <SidebarLink key={item.label} {...item} />
            ))}
          </nav>

          <div className="mt-auto pt-10">
            <Link
              href="/clubs"
              className="flex h-14 items-center justify-center rounded-full bg-[#3d69f8] text-base font-semibold text-white shadow-[0_20px_35px_rgba(61,105,248,0.25)] transition hover:bg-[#2f5cf3]"
            >
              Create Group
            </Link>
            <div className="mt-10 space-y-5 pl-4 text-sm text-[#8d97ab]">
              <div className="flex items-center gap-3">
                <CircleHelp className="h-4 w-4" />
                <span>Help</span>
              </div>
              <div className="flex items-center gap-3">
                <MessageSquareMore className="h-4 w-4" />
                <span>Feedback</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="px-4 pb-10 pt-5 sm:px-6 lg:px-9 lg:pb-14 lg:pt-6">
          <div className="space-y-5 lg:hidden">
            <div className="flex items-center justify-between gap-4">
              <BrandMark />
              <div className="flex items-center gap-3 rounded-full bg-white px-2 py-2 shadow-[0_12px_30px_rgba(17,24,39,0.06)]">
                <button
                  type="button"
                  aria-label="Notifications"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f8ff] text-[#2153f6]"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3 pr-2">
                  <Avatar name={profileName} size={36} />
                  <span className="text-sm font-semibold text-[#232631]">{profileName}</span>
                </div>
              </div>
            </div>
            <MobileNav />
          </div>

          <div className="mt-5 flex flex-col gap-5 lg:mt-0 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-[520px]">
              <p className="text-[0.82rem] font-bold uppercase tracking-[0.32em] text-[#2153f6]">
                Central Hub
              </p>
              <h1 className="mt-3 text-[3rem] font-bold leading-[0.92] tracking-[-0.08em] text-[#232631] drop-shadow-[0_2px_0_rgba(35,38,49,0.24)] sm:text-[4.5rem]">
                Explore
                <br />
                Communities
              </h1>
            </div>

            <div className="hidden items-center gap-4 lg:flex">
              <div className="flex items-center gap-3 rounded-full bg-white px-3 py-2 shadow-[0_14px_30px_rgba(17,24,39,0.06)]">
                <button
                  type="button"
                  aria-label="Notifications"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f6f8ff] text-[#2153f6]"
                >
                  <Bell className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-3 pr-2">
                  <Avatar name={profileName} size={36} />
                  <span className="text-base font-semibold text-[#232631]">{profileName}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:mt-2 lg:flex-row lg:items-center lg:justify-end">
            <div className="flex h-16 w-full items-center gap-3 rounded-full border border-white/80 bg-white px-6 shadow-[0_14px_30px_rgba(17,24,39,0.04)] lg:max-w-[420px]">
              <Search className="h-5 w-5 text-[#646f83]" />
              <input
                readOnly
                value=""
                placeholder="Search clubs, interests, or tags..."
                className="w-full border-none bg-transparent text-[0.98rem] text-[#232631] outline-none placeholder:text-[#a7afbf]"
              />
            </div>
            <button
              type="button"
              aria-label="Filters"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white text-[#232631] shadow-[0_14px_30px_rgba(17,24,39,0.04)]"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>

          <section className="mt-16">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-[2rem] font-bold tracking-[-0.06em] text-[#232631]">
                Trending Clubs
              </h2>
              <div className="hidden items-center gap-3 lg:flex">
                <button
                  type="button"
                  aria-label="Previous"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eff2f8] text-[#232631]"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eff2f8] text-[#232631]"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {heroCards.map((card, index) => (
                <article
                  key={card.title}
                  className="relative min-h-[325px] overflow-hidden rounded-[2.1rem] p-7 text-white shadow-[0_24px_50px_rgba(17,24,39,0.14)]"
                  style={{ backgroundImage: card.background }}
                >
                  <div
                    className={`absolute inset-0 ${
                      index === 0
                        ? "bg-[radial-gradient(circle_at_22%_30%,rgba(255,255,255,0.16),transparent_20%),linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.05)_40%,transparent_72%)]"
                        : "bg-[radial-gradient(circle_at_84%_16%,rgba(255,255,255,0.2),transparent_18%),linear-gradient(180deg,transparent_0%,rgba(255,255,255,0.06)_45%,transparent_100%)]"
                    }`}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/45 to-transparent" />
                  <div className="relative flex h-full flex-col justify-end">
                    <span
                      className={`mb-5 inline-flex w-fit rounded-full px-4 py-2 text-[0.72rem] font-bold uppercase tracking-[0.08em] ${
                        index === 0 ? "bg-[#2153f6]" : "bg-[#9532af]"
                      }`}
                    >
                      {card.badge}
                    </span>
                    <h3 className="text-[2.05rem] font-bold tracking-[-0.06em]">{card.title}</h3>
                    <p className="mt-2 max-w-[420px] text-base text-white/82">{card.description}</p>
                    <div className="mt-6 flex items-center justify-between gap-4">
                      <MemberStack count={card.count} />
                      <button
                        type="button"
                        className="rounded-full bg-white px-7 py-3.5 text-base font-semibold text-[#232631] shadow-[0_12px_24px_rgba(255,255,255,0.2)]"
                      >
                        View Club
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-16">
            <div className="mb-7 flex items-center gap-3">
              <h2 className="text-[2rem] font-bold tracking-[-0.06em] text-[#232631]">
                Verified University Orgs
              </h2>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2153f6] text-white">
                <BadgeCheck className="h-4 w-4" />
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              {orgCards.map(({ title, description, members, icon: Icon }) => (
                <article
                  key={title}
                  className="relative overflow-hidden rounded-[2rem] border border-white/80 bg-white px-7 pb-7 pt-8 shadow-[0_22px_40px_rgba(17,24,39,0.05)]"
                >
                  <div className="absolute -right-8 -top-9 h-32 w-32 rounded-full bg-[#f4f6ff]" />
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#f5f7ff] text-[#2153f6]">
                      <Icon className="h-7 w-7" />
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#f1f5ff] px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#2153f6]">
                      <BadgeCheck className="h-3 w-3" />
                      Official
                    </span>
                  </div>
                  <h3 className="relative mt-8 text-[2rem] font-bold tracking-[-0.06em] text-[#232631]">
                    {title}
                  </h3>
                  <p className="relative mt-4 text-[1.02rem] leading-8 text-[#6c7487]">{description}</p>
                  <div className="relative mt-8 h-px bg-[#edf0f7]" />
                  <div className="relative mt-7 flex items-center justify-between gap-4">
                    <p className="text-[0.9rem] font-semibold uppercase tracking-[0.16em] text-[#70778b]">
                      {members}
                    </p>
                    <button
                      type="button"
                      className="rounded-full bg-[#2153f6] px-6 py-3 text-base font-semibold text-white"
                    >
                      Join
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="mt-20">
            <h2 className="text-[2rem] font-bold tracking-[-0.06em] text-[#232631]">
              Student Organizations
            </h2>

            <div className="mt-8 space-y-4">
              {clubRows.map(({ title, description, members, icon: Icon }) => (
                <article
                  key={title}
                  className="flex flex-col gap-6 rounded-[2rem] border border-white/80 bg-white px-5 py-5 shadow-[0_18px_36px_rgba(17,24,39,0.04)] sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-5">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[#f5f7ff] text-[#2153f6]">
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-[1.7rem] font-bold tracking-[-0.06em] text-[#232631]">
                        {title}
                      </h3>
                      <p className="mt-1 text-[1.02rem] text-[#80889a]">{description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-5 lg:justify-end">
                    <div className="min-w-[92px] text-center">
                      <p className="text-[1.35rem] font-semibold text-[#232631]">{members}</p>
                      <p className="mt-1 text-[0.74rem] font-semibold uppercase tracking-[0.2em] text-[#8c93a6]">
                        Members
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-full bg-[#f2f3f7] px-7 py-3.5 text-base font-semibold text-[#232631]"
                    >
                      Request to Join
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};
