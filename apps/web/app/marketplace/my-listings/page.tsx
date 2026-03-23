"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import {
  Armchair,
  BadgeCheck,
  BookOpen,
  ChevronRight,
  Cpu,
  Package,
  PencilLine,
  Plus,
  Shirt,
  Tag,
  Trash2,
} from "lucide-react";
import { CreateListingModal } from "@/features/marketplace/CreateListingModal";
import { EditListingModal } from "@/features/marketplace/EditListingModal";
import { useAuth } from "@/features/auth";
import type { Listing } from "@/features/marketplace/types";
import { IMAGE_BASE_URL } from "@/lib/api";
import {
  deleteListing,
  fetchListings,
  fetchMyListings,
  updateListingStatus,
} from "@/lib/api/marketplace";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const tabs = [
  { id: "active", label: "Active" },
  { id: "sold", label: "Sold" },
  { id: "drafts", label: "Drafts" },
] as const;

type DashboardTab = (typeof tabs)[number]["id"];

const categoryThemes = {
  Textbooks: {
    Icon: BookOpen,
    fallback: "bg-[linear-gradient(145deg,#f4ead9_0%,#ecd8ba_100%)] text-[#836642]",
  },
  Electronics: {
    Icon: Cpu,
    fallback: "bg-[linear-gradient(145deg,#f2efe7_0%,#d9d5cb_100%)] text-[#666457]",
  },
  Furniture: {
    Icon: Armchair,
    fallback: "bg-[linear-gradient(145deg,#f2e7d8_0%,#ddc5a6_100%)] text-[#8b6336]",
  },
  Clothing: {
    Icon: Shirt,
    fallback: "bg-[linear-gradient(145deg,#f8eee6_0%,#edd8c8_100%)] text-[#946340]",
  },
  Other: {
    Icon: Package,
    fallback: "bg-[linear-gradient(145deg,#eef2f4_0%,#d7dde3_100%)] text-[#677382]",
  },
} as const;

const fallbackTrendingCards = [
  {
    id: "fallback-1",
    title: "Featured Listing",
    price: "--",
    tone: "bg-[linear-gradient(145deg,#fee2cf_0%,#f6efe6_100%)]",
  },
  {
    id: "fallback-2",
    title: "Campus Find",
    price: "--",
    tone: "bg-[linear-gradient(145deg,#f4f4f1_0%,#ece9e1_100%)]",
  },
  {
    id: "fallback-3",
    title: "New Drop Soon",
    price: "--",
    tone: "bg-[linear-gradient(145deg,#f5f1ce_0%,#f3edd8_100%)]",
  },
] as const;

const resolveImageUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${IMAGE_BASE_URL}${normalized}`;
};

const formatPrice = (price: number) =>
  Number.isInteger(price) ? `${price}` : price.toFixed(2);

const formatRelativeAge = (dateString: string) => {
  const now = new Date();
  const createdAt = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};

const EmptyIllustration = () => (
  <div className="relative mx-auto flex h-[172px] w-[172px] items-end justify-center overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#ffe6ca_0%,#fff1e2_56%,#fff8f1_100%)]">
    <div className="absolute inset-x-0 bottom-0 h-[70px] bg-[linear-gradient(180deg,rgba(255,255,255,0.24),rgba(255,255,255,0.88))]" />
    <div className="absolute bottom-[32px] h-[14px] w-[74px] rounded-full bg-[#bda07b]/18 blur-[2px]" />
    <div className="relative bottom-[38px] h-[18px] w-[66px] rounded-full border border-[#f1dec7] bg-[linear-gradient(180deg,#fffdfa_0%,#f2dec1_100%)] shadow-[0_10px_18px_rgba(158,122,81,0.15)]" />
  </div>
);

const TrendingCard = ({ listing }: { listing: Listing }) => {
  const imageUrl = listing.images[0] ? resolveImageUrl(listing.images[0]) : "";
  const theme = categoryThemes[listing.category] ?? categoryThemes.Other;

  return (
    <Link href={`/marketplace/${listing.id}`} className="group block h-full">
      <article className="h-full rounded-[28px] border border-[#edf1f6] bg-white p-2 shadow-[0_16px_34px_rgba(25,34,56,0.06)] transition hover:-translate-y-1 hover:shadow-[0_22px_42px_rgba(25,34,56,0.1)]">
        <div className="aspect-[0.95/1] overflow-hidden rounded-[22px] bg-[#f6f8fb]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={listing.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center ${theme.fallback}`}>
              <theme.Icon className="h-16 w-16 opacity-90" strokeWidth={1.75} />
            </div>
          )}
        </div>
        <div className="px-2 pb-2 pt-4">
          <h3 className="line-clamp-2 text-[17px] font-[700] leading-[1.16] tracking-[-0.05em] text-[#20242d]">
            {listing.title}
          </h3>
          <p className="mt-1 text-[20px] font-[800] tracking-[-0.05em] text-[#1456f4]">
            ${formatPrice(listing.price)}
          </p>
        </div>
      </article>
    </Link>
  );
};

const PlaceholderTrendingCard = ({
  title,
  price,
  tone,
}: {
  title: string;
  price: string;
  tone: string;
}) => (
  <article className="rounded-[28px] border border-[#edf1f6] bg-white p-2 shadow-[0_16px_34px_rgba(25,34,56,0.04)]">
    <div className={`aspect-[0.95/1] rounded-[22px] ${tone}`} />
    <div className="px-2 pb-2 pt-4">
      <h3 className="text-[17px] font-[700] tracking-[-0.05em] text-[#20242d]">{title}</h3>
      <p className="mt-1 text-[20px] font-[800] tracking-[-0.05em] text-[#c2c8d3]">{price}</p>
    </div>
  </article>
);

const OwnedListingCard = ({
  listing,
  onEdit,
  onDelete,
  onStatusChange,
  isUpdatingStatus,
}: {
  listing: Listing;
  onEdit: (listing: Listing) => void;
  onDelete: (listing: Listing) => void;
  onStatusChange: (listing: Listing, nextStatus: "active" | "sold") => void;
  isUpdatingStatus: boolean;
}) => {
  const imageUrl = listing.images[0] ? resolveImageUrl(listing.images[0]) : "";
  const theme = categoryThemes[listing.category] ?? categoryThemes.Other;
  const nextStatus = listing.status === "active" ? "sold" : "active";

  return (
    <article className="rounded-[30px] border border-[#edf1f6] bg-white p-4 shadow-[0_18px_38px_rgba(20,29,47,0.07)]">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="h-[188px] w-full shrink-0 overflow-hidden rounded-[24px] bg-[#f6f8fb] md:w-[210px]">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={listing.title} className="h-full w-full object-cover" />
          ) : (
            <div className={`flex h-full w-full items-center justify-center ${theme.fallback}`}>
              <theme.Icon className="h-16 w-16 opacity-90" strokeWidth={1.75} />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                  listing.status === "sold"
                    ? "bg-[#fdf0f6] text-[#b25a9d]"
                    : "bg-[#edf3ff] text-[#1456f4]"
                }`}
              >
                {listing.status === "sold" ? "Sold" : "Active"}
              </span>
              <span className="rounded-full bg-[#f5f7fb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#667183]">
                {listing.category}
              </span>
            </div>

            <h3 className="mt-4 line-clamp-2 text-[28px] font-[800] leading-[0.98] tracking-[-0.06em] text-[#20242d]">
              {listing.title}
            </h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <span className="text-[32px] font-[800] leading-none tracking-[-0.06em] text-[#1456f4]">
                ${formatPrice(listing.price)}
              </span>
              <span className="pb-1 text-[13px] font-medium text-[#8d97a8]">
                Posted {formatRelativeAge(listing.createdAt)}
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {listing.status === "active" && (
              <button
                type="button"
                onClick={() => onEdit(listing)}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#e4e9f2] bg-white px-5 text-[12px] font-semibold text-[#596274] transition hover:border-[#d6dce8] hover:text-[#20242d]"
              >
                <PencilLine className="h-4 w-4" strokeWidth={2} />
                Edit
              </button>
            )}
            <button
              type="button"
              onClick={() => onStatusChange(listing, nextStatus)}
              disabled={isUpdatingStatus}
              className="inline-flex h-11 items-center justify-center rounded-full bg-[#1456f4] px-5 text-[12px] font-semibold text-white shadow-[0_14px_28px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUpdatingStatus
                ? "Updating..."
                : listing.status === "active"
                  ? "Mark as Sold"
                  : "Mark as Available"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(listing)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#f1dddd] bg-[#fff8f8] px-5 text-[12px] font-semibold text-[#c25151] transition hover:border-[#ebcaca] hover:bg-[#fff3f3]"
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} />
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

export default function MyListingsPage() {
  const { token, isAuthenticated, openAuthModal } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [trendingListings, setTrendingListings] = useState<Listing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeListing, setActiveListing] = useState<Listing | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Listing | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<DashboardTab>("active");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<Record<string, boolean>>({});

  const stats = useMemo(() => {
    const activeListings = listings.filter((listing) => listing.status === "active");
    const soldListings = listings.filter((listing) => listing.status === "sold");

    return {
      activeCount: activeListings.length,
      soldCount: soldListings.length,
    };
  }, [listings]);

  const filteredListings = useMemo(() => {
    if (activeTab === "drafts") {
      return [] as Listing[];
    }
    return listings.filter((listing) => listing.status === activeTab);
  }, [activeTab, listings]);

  const emptyStateCopy = useMemo(() => {
    if (activeTab === "sold") {
      return {
        title: "No sold listings yet?",
        body: "Once a listing sells, it will show up here so you can keep track of completed sales.",
        cta: "Keep Selling",
      };
    }

    if (activeTab === "drafts") {
      return {
        title: "No drafts yet?",
        body: "Draft saving is not enabled yet, but you can post a fresh listing any time from this dashboard.",
        cta: "Start a New Listing",
      };
    }

    return {
      title: "No listings yet?",
      body: "Turn your unused items into campus currency. From textbooks to dorm furniture, start selling to your community today.",
      cta: "Post Your First Listing",
    };
  }, [activeTab]);

  const loadDashboard = useCallback(async () => {
    if (!isAuthenticated || !token) {
      setListings([]);
      setTrendingListings([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [mine, marketplace] = await Promise.all([
        fetchMyListings(token),
        fetchListings(),
      ]);

      const mineIds = new Set(mine.map((listing) => listing.id));
      const trending = marketplace
        .filter((listing) => !mineIds.has(listing.id))
        .slice(0, 3);

      setListings(mine);
      setTrendingListings(trending);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load your marketplace dashboard."
      );
      setListings([]);
      setTrendingListings([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleEdit = (listing: Listing) => {
    setActiveListing(listing);
    setIsEditOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget || !token) {
      return;
    }

    setIsDeleting(true);

    try {
      await deleteListing(deleteTarget.id, token);
      setDeleteTarget(null);
      await loadDashboard();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete listing."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSuccess = (updated: Listing) => {
    setListings((prev) =>
      prev.map((listing) => (listing.id === updated.id ? updated : listing))
    );
    setActiveListing(updated);
  };

  const handleStatusChange = async (
    listing: Listing,
    nextStatus: "active" | "sold"
  ) => {
    if (!token) {
      return;
    }

    setIsUpdatingStatus((prev) => ({ ...prev, [listing.id]: true }));

    try {
      const updated = await updateListingStatus(listing.id, nextStatus, token);
      setListings((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "Failed to update listing status."
      );
    } finally {
      setIsUpdatingStatus((prev) => {
        const nextState = { ...prev };
        delete nextState[listing.id];
        return nextState;
      });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className={`${outfit.className} min-h-screen bg-[#f6f8fc] text-[#181d25]`}>
        <main className="mx-auto max-w-[980px] px-5 pb-16 pt-7 sm:px-6 lg:px-8">
          <section className="rounded-[34px] border border-[#edf1f6] bg-white px-8 py-12 text-center shadow-[0_24px_54px_rgba(20,29,47,0.06)]">
            <h1 className="text-[52px] font-[800] leading-[0.92] tracking-[-0.08em] text-[#252933]">
              My Listings
            </h1>
            <p className="mx-auto mt-4 max-w-[480px] text-[15px] leading-[1.8] text-[#7d8695]">
              Sign in to manage the items you have posted and track what is live in the marketplace.
            </p>
            <button
              type="button"
              onClick={() => openAuthModal("login")}
              className="mt-8 inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[12px] font-semibold uppercase tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(20,86,244,0.24)] transition hover:bg-[#0f49e2]"
            >
              Sign In
            </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`${outfit.className} min-h-screen bg-[#f6f8fc] text-[#181d25]`}>
      <main className="mx-auto max-w-[980px] px-5 pb-16 pt-7 sm:px-6 lg:px-8">
        <section>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-[52px] font-[800] leading-[0.92] tracking-[-0.08em] text-[#252933]">
                My Listings
              </h1>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex h-[48px] items-center justify-center gap-2 self-start rounded-full bg-[linear-gradient(90deg,#1456f4_0%,#6f8cf8_100%)] px-7 text-[13px] font-semibold text-white shadow-[0_18px_34px_rgba(20,86,244,0.22)] transition hover:brightness-[1.03]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.3} />
              <span>Post New Listing</span>
            </button>
          </div>

          <div className="mt-9 grid gap-5 md:grid-cols-2">
            <article className="rounded-[30px] border border-[#edf1f6] bg-white px-7 py-7 shadow-[0_20px_44px_rgba(20,29,47,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[16px] font-medium tracking-[-0.03em] text-[#4b5563]">
                  Active Listings
                </p>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#edf3ff] text-[#1456f4]">
                  <Tag className="h-4 w-4" strokeWidth={2.1} />
                </span>
              </div>
              <p className="mt-5 text-[40px] font-[800] leading-none tracking-[-0.07em] text-[#2b313a]">
                {stats.activeCount}
              </p>
              <p className="mt-2 text-[13px] text-[#7d8695]">
                Items currently live for sale
              </p>
            </article>

            <article className="rounded-[30px] border border-[#edf1f6] bg-white px-7 py-7 shadow-[0_20px_44px_rgba(20,29,47,0.05)]">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[16px] font-medium tracking-[-0.03em] text-[#4b5563]">
                  Sold Listings
                </p>
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f9eefb] text-[#b45cc7]">
                  <BadgeCheck className="h-4 w-4" strokeWidth={2.1} />
                </span>
              </div>
              <p className="mt-5 text-[40px] font-[800] leading-none tracking-[-0.07em] text-[#2b313a]">
                {stats.soldCount}
              </p>
              <p className="mt-2 text-[13px] text-[#7d8695]">
                Successfully completed sales
              </p>
            </article>
          </div>
        </section>

        <section className="mt-11">
          <div className="flex items-end gap-8 border-b border-[#dde4ef]">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative -mb-px pb-4 text-[14px] font-semibold transition ${
                    isActive
                      ? "text-[#1456f4] after:absolute after:bottom-0 after:left-0 after:h-[2px] after:w-full after:bg-[#1456f4]"
                      : "text-[#606878] hover:text-[#252933]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="mt-6 rounded-[24px] border border-[#f2d6d6] bg-[#fff7f7] px-5 py-4 text-[13px] font-semibold text-[#c25151]">
            {error}
          </div>
        )}

        <section className="mt-10">
          {isLoading ? (
            <div className="rounded-[34px] border border-[#edf1f6] bg-white px-8 py-14 text-center text-[15px] text-[#7d8695] shadow-[0_20px_44px_rgba(20,29,47,0.05)]">
              Loading your listings...
            </div>
          ) : filteredListings.length === 0 ? (
            <div className="rounded-[36px] border border-[#edf1f6] bg-[#f8fbff] px-8 py-14 text-center shadow-[0_20px_44px_rgba(20,29,47,0.04)] sm:px-12 sm:py-16">
              <EmptyIllustration />
              <h2 className="mt-7 text-[25px] font-[800] tracking-[-0.06em] text-[#252933]">
                {emptyStateCopy.title}
              </h2>
              <p className="mx-auto mt-3 max-w-[470px] text-[15px] leading-[1.8] text-[#6f7888]">
                {emptyStateCopy.body}
              </p>
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="mt-8 inline-flex h-[48px] items-center justify-center rounded-full bg-[#1456f4] px-8 text-[13px] font-semibold text-white shadow-[0_18px_34px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
              >
                {emptyStateCopy.cta}
              </button>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredListings.map((listing) => (
                <OwnedListingCard
                  key={listing.id}
                  listing={listing}
                  onEdit={handleEdit}
                  onDelete={setDeleteTarget}
                  onStatusChange={handleStatusChange}
                  isUpdatingStatus={Boolean(isUpdatingStatus[listing.id])}
                />
              ))}
            </div>
          )}
        </section>

        <section className="mt-16">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h2 className="text-[31px] font-[800] tracking-[-0.07em] text-[#252933]">
              Trending in Marketplace
            </h2>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#1456f4] transition hover:text-[#0f49e2]"
            >
              <span>View all</span>
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            </Link>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {trendingListings.length > 0
              ? trendingListings.map((listing) => (
                  <TrendingCard key={listing.id} listing={listing} />
                ))
              : fallbackTrendingCards.map((card) => (
                  <PlaceholderTrendingCard
                    key={card.id}
                    title={card.title}
                    price={card.price}
                    tone={card.tone}
                  />
                ))}
          </div>
        </section>

        <CreateListingModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
          onSuccess={() => {
            setIsCreateOpen(false);
            setActiveTab("active");
            void loadDashboard();
          }}
        />

        <EditListingModal
          isOpen={isEditOpen}
          listing={activeListing}
          onClose={() => setIsEditOpen(false)}
          onSuccess={(updated) => {
            handleEditSuccess(updated);
            setIsEditOpen(false);
          }}
        />

        {deleteTarget && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl">
              <div className="border-b border-[#edf1f6] px-6 py-5">
                <h3 className="text-[24px] font-[800] tracking-[-0.05em] text-[#20242d]">
                  Delete this listing?
                </h3>
                <p className="mt-2 text-sm text-[#6f7888]">
                  This action cannot be undone.
                </p>
              </div>
              <div className="flex flex-col gap-3 px-6 py-6 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white px-5 text-[12px] font-semibold text-[#596274] transition hover:border-[#d6dce8] hover:text-[#20242d]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[#e25555] px-5 text-[12px] font-semibold text-white transition hover:bg-[#d94848] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
