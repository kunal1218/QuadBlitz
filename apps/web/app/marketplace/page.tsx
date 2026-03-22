"use client";

import { useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import { CreateListingModal } from "@/features/marketplace/CreateListingModal";
import { MarketplaceGridCard } from "@/features/marketplace/MarketplaceGridCard";
import { MarketplaceHeader } from "@/features/marketplace/MarketplaceHeader";
import { fetchListings } from "@/lib/api/marketplace";
import type { Listing } from "@/features/marketplace/types";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.75" />
    <path
      d="M20 20l-3.6-3.6"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
  </svg>
);

const MessageStackIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <path
      d="M4.1 5.1h11.8a1 1 0 0 1 1 1v7.1a1 1 0 0 1-1 1H9.4L6 16.8v-2.6H4.1a1 1 0 0 1-1-1V6.1a1 1 0 0 1 1-1Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinejoin="round"
    />
  </svg>
);

const ListingsIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <path
      d="M5 4.5h10M5 8.5h10M5 12.5h6"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
    <rect x="3.5" y="3.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const filters = [
  { id: "all", label: "All Items", queryCategory: undefined },
  { id: "Textbooks", label: "Textbooks", queryCategory: "Textbooks" },
  { id: "Electronics", label: "Electronics", queryCategory: "Electronics" },
  { id: "Furniture", label: "Furniture", queryCategory: "Furniture" },
  { id: "Clothing", label: "Clothing", queryCategory: "Clothing" },
  { id: "Other", label: "Other", queryCategory: "Other" },
] as const;

type FilterId = (typeof filters)[number]["id"];

const cardSkeletons = Array.from({ length: 8 }, (_, index) => index);

export default function MarketplacePage() {
  const [selectedFilter, setSelectedFilter] = useState<FilterId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [listings, setListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const activeFilter = useMemo(
    () => filters.find((filter) => filter.id === selectedFilter) ?? filters[0],
    [selectedFilter]
  );

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const nextListings = await fetchListings({
          category: activeFilter.queryCategory,
          search: searchQuery,
        });

        if (!isActive) {
          return;
        }

        setListings(nextListings);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load marketplace listings."
        );
        setListings([]);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }, searchQuery.trim() ? 160 : 0);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, [activeFilter.queryCategory, refreshNonce, searchQuery]);

  const resultsLabel = isLoading
    ? "Refreshing listings"
    : `${listings.length} listing${listings.length === 1 ? "" : "s"}`;

  return (
    <div
      className={`${outfit.className} min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(20,86,244,0.10),transparent_28%),radial-gradient(circle_at_top_right,rgba(91,137,255,0.10),transparent_30%),#f5f7fb] text-[#181d25]`}
    >
      <MarketplaceHeader />

      <main className="mx-auto max-w-[1280px] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-[34px] border border-[#e7ecf4] bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(250,252,255,0.98)_52%,rgba(242,246,255,0.96)_100%)] p-5 shadow-[0_24px_70px_rgba(20,28,48,0.08)] sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute right-[-80px] top-[-90px] h-[220px] w-[220px] rounded-full bg-[radial-gradient(circle,rgba(20,86,244,0.16),rgba(20,86,244,0)_70%)]" />
          <div className="pointer-events-none absolute bottom-[-90px] left-[-40px] h-[180px] w-[180px] rounded-full bg-[radial-gradient(circle,rgba(120,161,255,0.12),rgba(120,161,255,0)_70%)]" />

          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-[560px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6e7b92]">
                Campus Exchange
              </p>
              <h1 className="mt-3 text-[40px] font-[800] tracking-[-0.07em] text-[#20242d] sm:text-[48px]">
                Marketplace
              </h1>
              <p className="mt-3 max-w-[440px] text-[15px] leading-[1.7] text-[#6b7587] sm:text-[16px]">
                Buy and sell within your campus community with ease and trust.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <Link
                href="/marketplace/messages"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white/90 px-4 text-[12px] font-semibold text-[#4d5564] shadow-[inset_0_0_0_1px_rgba(228,234,243,0.95)] transition hover:bg-white hover:text-[#20242d]"
              >
                <MessageStackIcon className="h-4 w-4" />
                <span>Marketplace Messages</span>
              </Link>
              <Link
                href="/marketplace/my-listings"
                className="inline-flex h-11 items-center gap-2 rounded-full bg-white/90 px-4 text-[12px] font-semibold text-[#4d5564] shadow-[inset_0_0_0_1px_rgba(228,234,243,0.95)] transition hover:bg-white hover:text-[#20242d]"
              >
                <ListingsIcon className="h-4 w-4" />
                <span>My Listings</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex h-11 items-center justify-center rounded-full bg-[#1456f4] px-5 text-[12px] font-semibold text-white shadow-[0_16px_30px_rgba(20,86,244,0.24)] transition hover:bg-[#0f49e2]"
              >
                Post Listing
              </button>
            </div>
          </div>

          <div className="relative mt-7">
            <SearchIcon className="pointer-events-none absolute left-5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#97a0b0]" />
            <input
              type="text"
              placeholder="What are you looking for today?"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-14 w-full rounded-full border border-[#edf1f6] bg-white/96 pl-14 pr-5 text-[14px] text-[#20242d] shadow-[0_14px_34px_rgba(15,23,42,0.04)] outline-none transition placeholder:text-[#a1a9b8] focus:border-[#d7e2ff] focus:ring-4 focus:ring-[#1456f4]/10"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {filters.map((filter) => {
              const isActive = filter.id === selectedFilter;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => setSelectedFilter(filter.id)}
                  className={`inline-flex h-9 items-center rounded-full px-4 text-[11px] font-semibold transition ${
                    isActive
                      ? "bg-[#1456f4] text-white shadow-[0_14px_28px_rgba(20,86,244,0.24)]"
                      : "bg-white/94 text-[#5f6675] shadow-[inset_0_0_0_1px_rgba(229,234,243,1)] hover:bg-white hover:text-[#20242d]"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between gap-4 px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7e8798]">
              {resultsLabel}
            </p>
            {error && (
              <p className="rounded-full bg-[#fff1eb] px-3 py-1 text-[11px] font-semibold text-[#b15b24]">
                {error}
              </p>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {cardSkeletons.map((card) => (
                <div
                  key={card}
                  className="overflow-hidden rounded-[28px] border border-[#e6ebf3] bg-white p-[10px] shadow-[0_20px_38px_rgba(17,24,39,0.04)]"
                >
                  <div className="h-[230px] animate-pulse rounded-[22px] bg-[#eef2f8]" />
                  <div className="space-y-3 px-2 pb-2 pt-4">
                    <div className="h-5 w-3/4 animate-pulse rounded-full bg-[#eef2f8]" />
                    <div className="h-4 w-1/2 animate-pulse rounded-full bg-[#eef2f8]" />
                    <div className="h-10 w-28 animate-pulse rounded-full bg-[#eef2f8]" />
                  </div>
                </div>
              ))}
            </div>
          ) : listings.length === 0 ? (
            <div className="rounded-[30px] border border-dashed border-[#dbe3ef] bg-white/80 px-6 py-16 text-center shadow-[0_20px_45px_rgba(15,23,42,0.05)]">
              <p className="text-[28px] font-[800] tracking-[-0.06em] text-[#20242d]">
                Nothing matches that search yet.
              </p>
              <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-[1.7] text-[#6b7587]">
                Try a broader search, switch categories, or post the first listing in this lane.
              </p>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="mt-7 inline-flex h-11 items-center justify-center rounded-full bg-[#1456f4] px-5 text-[12px] font-semibold text-white shadow-[0_16px_30px_rgba(20,86,244,0.24)] transition hover:bg-[#0f49e2]"
              >
                Post Listing
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {listings.map((listing) => (
                <Link
                  key={listing.id}
                  href={`/marketplace/${listing.id}`}
                  className="block h-full"
                >
                  <MarketplaceGridCard listing={listing} />
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <CreateListingModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          setSelectedFilter("all");
          setSearchQuery("");
          setRefreshNonce((value) => value + 1);
        }}
      />
    </div>
  );
}
