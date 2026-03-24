"use client";

import { useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import { CreateListingModal } from "@/features/marketplace/CreateListingModal";
import { MarketplaceGridCard } from "@/features/marketplace/MarketplaceGridCard";
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
  { id: "Kitchen", label: "Kitchen", queryCategory: "Other" },
  { id: "Sporting Goods", label: "Sporting Goods", queryCategory: "Other" },
] as const satisfies ReadonlyArray<{
  id: string;
  label: string;
  queryCategory: Listing["category"] | undefined;
}>;

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
    <div className={`${outfit.className} min-h-screen bg-white text-[#181d25]`}>
      <main className="mx-auto max-w-[1180px] px-5 pb-16 pt-7 sm:px-6 lg:px-8">
        <section className="border-b border-[#edf1f6] pb-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-[380px]">
              <h1 className="text-[44px] font-[800] tracking-[-0.08em] text-[#252933] sm:text-[52px]">
                Marketplace
              </h1>
              <p className="mt-2 max-w-[300px] text-[14px] leading-[1.6] text-[#7d8695] sm:text-[15px]">
                Buy and sell within your campus community with ease and trust.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Link
                href="/marketplace/my-listings"
                className="inline-flex h-10 items-center gap-2 rounded-full bg-[#f8f9fc] px-4 text-[11px] font-semibold text-[#4f5563] shadow-[inset_0_0_0_1px_rgba(231,236,244,1)] transition hover:bg-white hover:text-[#20242d]"
              >
                <ListingsIcon className="h-[13px] w-[13px]" />
                <span>My Listings</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex h-10 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[11px] font-semibold text-white shadow-[0_14px_28px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
              >
                Post Listing
              </button>
            </div>
          </div>

          <div className="relative mt-7 max-w-[940px]">
            <SearchIcon className="pointer-events-none absolute left-5 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#a2aabc]" />
            <input
              type="text"
              placeholder="What are you looking for today?"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-14 w-full rounded-full bg-[#fbfbfd] pl-14 pr-5 text-[14px] text-[#20242d] shadow-[inset_0_0_0_1px_rgba(238,242,247,1)] outline-none transition placeholder:text-[#adb4c2] focus:bg-white focus:ring-4 focus:ring-[#1456f4]/8"
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
                  className={`inline-flex h-9 items-center rounded-full px-4 text-[10px] font-semibold transition ${
                    isActive
                      ? "bg-[#1456f4] text-white shadow-[0_12px_24px_rgba(20,86,244,0.22)]"
                      : "bg-[#fbfbfd] text-[#6f7684] shadow-[inset_0_0_0_1px_rgba(231,236,244,1)] hover:bg-white hover:text-[#20242d]"
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
                  <div className="h-[170px] animate-pulse rounded-[22px] bg-[#eef2f8]" />
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
