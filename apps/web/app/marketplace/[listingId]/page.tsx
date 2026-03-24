"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Armchair,
  Book,
  ChevronRight,
  Cpu,
  Heart,
  MessageSquare,
  Package,
  ShieldCheck,
  Shirt,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { useAuth } from "@/features/auth";
import { EditListingModal } from "@/features/marketplace/EditListingModal";
import type { Listing } from "@/features/marketplace/types";
import { IMAGE_BASE_URL } from "@/lib/api";
import {
  deleteListing,
  fetchListingById,
  fetchListings,
  startMarketplaceConversation,
  updateListingStatus,
} from "@/lib/api/marketplace";
import { getProfileHref } from "@/lib/profile";
import { formatRelativeTime } from "@/lib/time";

const categoryThemes = {
  Textbooks: {
    accent: "bg-[#ecebff] text-[#6366f1]",
    fallback: "bg-[linear-gradient(145deg,#f3efe7_0%,#e4dbcb_100%)] text-[#786b54]",
    Icon: Book,
  },
  Electronics: {
    accent: "bg-[#ecf4ff] text-[#2563eb]",
    fallback: "bg-[linear-gradient(145deg,#eff3f7_0%,#cfd8e4_100%)] text-[#566579]",
    Icon: Cpu,
  },
  Furniture: {
    accent: "bg-[#f9efe1] text-[#b26b1d]",
    fallback: "bg-[linear-gradient(145deg,#f2e7d8_0%,#dcc3a1_100%)] text-[#8a6031]",
    Icon: Armchair,
  },
  Clothing: {
    accent: "bg-[#fff1ea] text-[#d16b38]",
    fallback: "bg-[linear-gradient(145deg,#f7ece3_0%,#e8d2bc_100%)] text-[#946340]",
    Icon: Shirt,
  },
  Other: {
    accent: "bg-[#eef2f7] text-[#617083]",
    fallback: "bg-[linear-gradient(145deg,#e5ebea_0%,#cdd7d2_100%)] text-[#5c6d62]",
    Icon: Package,
  },
} as const;

const conditionLabels = {
  New: "New",
  "Like New": "Like New",
  Good: "Good",
  Fair: "Fair",
} as const;

const resolveImageUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${IMAGE_BASE_URL}${normalized}`;
};

const toHandleSlug = (handle: string) => handle.replace(/^@/, "").trim();

const toHashTag = (value: string) =>
  `#${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim()}`;

const NearbyListingCard = ({ listing }: { listing: Listing }) => {
  const theme = categoryThemes[listing.category] ?? categoryThemes.Other;
  const previewImage = listing.images[0] ? resolveImageUrl(listing.images[0]) : "";

  return (
    <Link href={`/marketplace/${listing.id}`} className="group block h-full">
      <article className="h-full rounded-[30px] bg-white p-3 shadow-[0_18px_40px_rgba(20,29,47,0.08)] transition hover:-translate-y-1 hover:shadow-[0_24px_52px_rgba(20,29,47,0.14)]">
        <div className="relative overflow-hidden rounded-[24px] bg-[#edf1f6] aspect-[1/0.98]">
          {previewImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewImage}
              alt={listing.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center ${theme.fallback}`}>
              <theme.Icon className="h-12 w-12 opacity-90" strokeWidth={1.75} />
            </div>
          )}
          <div className="absolute right-3 top-3 rounded-full bg-white/94 px-2.5 py-1 text-[10px] font-semibold tracking-[-0.01em] text-[#20242d] shadow-[0_8px_18px_rgba(20,29,47,0.12)]">
            ${listing.price}
          </div>
        </div>

        <div className="px-1 pb-1 pt-4">
          <p className="line-clamp-2 text-[17px] font-[700] leading-[1.16] tracking-[-0.05em] text-[#20242d]">
            {listing.title}
          </p>
          <p className="mt-1 text-[11px] text-[#7e8797]">
            Condition: {listing.condition}
          </p>
        </div>
      </article>
    </Link>
  );
};

export default function ListingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token, isAuthenticated, openAuthModal } = useAuth();
  const listingId = useMemo(() => {
    const raw = (params as { listingId?: string | string[] } | null)?.listingId;
    if (!raw) return "";
    return Array.isArray(raw) ? raw[0] ?? "" : raw;
  }, [params]);

  const [listing, setListing] = useState<Listing | null>(null);
  const [relatedListings, setRelatedListings] = useState<Listing[]>([]);
  const [sellerOtherListings, setSellerOtherListings] = useState<Listing[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isMessagingSeller, setIsMessagingSeller] = useState(false);

  useEffect(() => {
    if (!listingId) {
      setError("Listing not found.");
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    fetchListingById(listingId)
      .then((data) => {
        if (!isActive) return;
        setListing(data);
      })
      .catch((loadError) => {
        if (!isActive) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load listing."
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [listingId]);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [listing?.id]);

  useEffect(() => {
    if (!listing) {
      setRelatedListings([]);
      setSellerOtherListings([]);
      return;
    }

    let isActive = true;

    fetchListings()
      .then((items) => {
        if (!isActive) {
          return;
        }

        const others = items.filter((item) => item.id !== listing.id);
        const sellerItems = others
          .filter((item) => item.seller.id === listing.seller.id)
          .slice(0, 3);

        const nearbyMatches = [
          ...others.filter(
            (item) =>
              item.category === listing.category && item.seller.id !== listing.seller.id
          ),
          ...others.filter(
            (item) =>
              item.category !== listing.category && item.seller.id !== listing.seller.id
          ),
        ];

        const uniqueNearby = nearbyMatches.filter(
          (item, index, array) =>
            array.findIndex((candidate) => candidate.id === item.id) === index
        );

        setSellerOtherListings(sellerItems);
        setRelatedListings(uniqueNearby.slice(0, 3));
      })
      .catch(() => {
        if (!isActive) {
          return;
        }
        setSellerOtherListings([]);
        setRelatedListings([]);
      });

    return () => {
      isActive = false;
    };
  }, [listing]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] bg-white px-6 py-10 text-sm text-[#6f7888] shadow-[0_20px_45px_rgba(20,29,47,0.08)]">
          Loading listing...
        </div>
      </div>
    );
  }

  if (error || !listing) {
    return (
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="rounded-[32px] border border-[#f3d7d7] bg-[#fff8f8] px-6 py-10 text-sm font-semibold text-[#b14444] shadow-[0_18px_40px_rgba(20,29,47,0.05)]">
          {error ?? "Listing not found."}
        </div>
      </div>
    );
  }

  const theme = categoryThemes[listing.category] ?? categoryThemes.Other;
  const galleryImages = (listing.images ?? []).map((image) => resolveImageUrl(image)).filter(Boolean);
  const activeImage = galleryImages[activeImageIndex] ?? "";
  const isSeller = user?.id === listing.seller.id;
  const canDeleteListing = isSeller || Boolean(user?.isAdmin);
  const isSold = listing.status === "sold";
  const sellerProfileHref = getProfileHref(
    { id: listing.seller.id, handle: listing.seller.username },
    user?.id
  );
  const sellerListingCount = sellerOtherListings.length + 1;
  const sellerHandle = listing.seller.username.startsWith("@")
    ? listing.seller.username
    : `@${toHandleSlug(listing.seller.username || listing.seller.name)}`;
  const memberSinceYear = listing.seller.createdAt
    ? new Date(listing.seller.createdAt).getFullYear()
    : null;
  const deliveryLabel = listing.location?.trim() || "On-Campus Pickup";
  const descriptionTags = [
    toHashTag(listing.category),
    toHashTag(listing.condition),
    toHashTag(deliveryLabel.includes("Pickup") ? "campus pickup" : deliveryLabel),
  ];
  const secondarySellerActionLabel = sellerOtherListings.length > 0
    ? "View Other Listings"
    : "View Seller Profile";

  const handleMessageSeller = async () => {
    if (!isAuthenticated || !token) {
      openAuthModal("login");
      return;
    }
    if (isSeller || isSold) {
      return;
    }

    setIsMessagingSeller(true);
    setNotice(null);

    try {
      const response = await startMarketplaceConversation(
        listing.id,
        `Hi! I'm interested in your listing: ${listing.title}`,
        token
      );
      router.push(`/marketplace/messages/${response.conversationId}`);
    } catch (sendError) {
      setNotice({
        type: "error",
        message:
          sendError instanceof Error
            ? sendError.message
            : "Unable to start conversation.",
      });
    } finally {
      setIsMessagingSeller(false);
    }
  };

  const handleViewSellerAction = () => {
    if (sellerOtherListings[0]) {
      router.push(`/marketplace/${sellerOtherListings[0].id}`);
      return;
    }
    router.push(sellerProfileHref);
  };

  const handleEditSuccess = (updated: Listing) => {
    setListing(updated);
    setNotice({ type: "success", message: "Listing updated." });
    setIsEditOpen(false);
  };

  const handleDelete = async () => {
    if (!isAuthenticated || !token) {
      openAuthModal("login");
      return;
    }

    setIsDeleting(true);
    setNotice(null);

    try {
      await deleteListing(listing.id, token);
      router.push("/marketplace");
    } catch (deleteError) {
      setNotice({
        type: "error",
        message:
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete listing.",
      });
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  const handleStatusToggle = async () => {
    if (!isAuthenticated || !token) {
      openAuthModal("login");
      return;
    }

    setIsUpdatingStatus(true);
    setNotice(null);

    try {
      const nextStatus = listing.status === "sold" ? "active" : "sold";
      const updated = await updateListingStatus(listing.id, nextStatus, token);
      setListing(updated);
      setNotice({
        type: "success",
        message:
          nextStatus === "sold"
            ? "Listing marked as sold."
            : "Listing marked as available.",
      });
    } catch (statusError) {
      setNotice({
        type: "error",
        message:
          statusError instanceof Error
            ? statusError.message
            : "Failed to update listing status.",
      });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="bg-[#f6f8fc] text-[#202531]">
      <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-8 sm:px-6 lg:px-8">
        {notice && (
          <div
            className={`mb-6 rounded-[26px] border px-5 py-4 text-sm font-semibold ${
              notice.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-600"
            }`}
          >
            {notice.message}
          </div>
        )}

        <nav className="mb-8 flex flex-wrap items-center gap-2 text-[12px] font-medium text-[#8f97a6]">
          <Link href="/marketplace" className="transition hover:text-[#20242d]">
            Marketplace
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-[#b4bcc9]" />
          <span>{listing.category}</span>
          <ChevronRight className="h-3.5 w-3.5 text-[#b4bcc9]" />
          <span className="text-[#20242d]">{listing.title}</span>
        </nav>

        <div className="grid gap-12 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.72fr)] xl:items-start">
          <section>
            <div className="relative overflow-hidden rounded-[34px] bg-white shadow-[0_26px_60px_rgba(20,29,47,0.09)]">
              <button
                type="button"
                aria-label="Save listing"
                className="absolute right-5 top-5 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/96 text-[#d64f73] shadow-[0_16px_30px_rgba(20,29,47,0.12)] transition hover:scale-[1.03]"
              >
                <Heart className="h-4 w-4 fill-current" strokeWidth={1.8} />
              </button>
              <div className="aspect-[1.52/1] bg-[#edf1f6]">
                {activeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={activeImage}
                    alt={listing.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className={`flex h-full w-full items-center justify-center ${theme.fallback}`}>
                    <theme.Icon className="h-20 w-20 opacity-90" strokeWidth={1.7} />
                  </div>
                )}
              </div>
            </div>

            {galleryImages.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-4">
                {galleryImages.map((image, index) => {
                  const isActive = index === activeImageIndex;
                  return (
                    <button
                      key={`${image}-${index}`}
                      type="button"
                      onClick={() => setActiveImageIndex(index)}
                      className={`overflow-hidden rounded-[22px] p-[3px] transition ${
                        isActive
                          ? "bg-[linear-gradient(180deg,#f4c988_0%,#1456f4_100%)] shadow-[0_16px_34px_rgba(20,86,244,0.18)]"
                          : "bg-white shadow-[0_12px_26px_rgba(20,29,47,0.08)] hover:-translate-y-0.5"
                      }`}
                    >
                      <span className="block h-[70px] w-[70px] overflow-hidden rounded-[19px] bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image}
                          alt={`${listing.title} thumbnail ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="space-y-7">
            <div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    isSold ? "bg-[#f9e9e9] text-[#bb4b4b]" : "bg-[#ecebff] text-[#6266f1]"
                  }`}
                >
                  {isSold ? "Sold" : "In Stock"}
                </span>
                <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${theme.accent}`}>
                  {listing.category}
                </span>
              </div>

              <h1 className="mt-5 max-w-[420px] text-[48px] font-[800] leading-[0.93] tracking-[-0.08em] text-[#2a2e37]">
                {listing.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-end gap-3">
                <span className="text-[46px] font-[800] leading-none tracking-[-0.08em] text-[#1456f4]">
                  ${listing.price}
                </span>
                <span className="pb-1 text-[14px] font-medium text-[#9aa3b4]">
                  Posted {formatRelativeTime(listing.createdAt)}
                </span>
              </div>

              <div className="mt-6 grid grid-cols-2 border-y border-[#e7ebf2] py-5">
                <div className="border-r border-[#e7ebf2] pr-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a1aab9]">
                    Condition
                  </p>
                  <p className="mt-2 text-[24px] font-[700] tracking-[-0.05em] text-[#2a2e37]">
                    {conditionLabels[listing.condition]}
                  </p>
                </div>
                <div className="pl-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#a1aab9]">
                    Delivery
                  </p>
                  <p className="mt-2 text-[24px] font-[700] leading-[1.1] tracking-[-0.05em] text-[#2a2e37]">
                    {deliveryLabel}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[34px] bg-white p-6 shadow-[0_24px_52px_rgba(20,29,47,0.09)]">
              <div className="flex items-start justify-between gap-4">
                <Link href={sellerProfileHref} className="flex min-w-0 items-center gap-4 transition hover:opacity-90">
                  <div className="relative">
                    <Avatar
                      name={listing.seller.name}
                      avatarUrl={listing.seller.avatarUrl}
                      size={62}
                      className="border-[3px] border-[#f1f4f9] text-[18px] shadow-[0_12px_30px_rgba(20,29,47,0.14)]"
                    />
                    <span className="absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#2ec77a]" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[26px] font-[700] leading-none tracking-[-0.05em] text-[#2a2e37]">
                      {listing.seller.name}
                    </p>
                    <p className="mt-2 text-[13px] font-medium text-[#4a72ff]">
                      {sellerHandle}
                    </p>
                    <p className="mt-1 text-[11px] text-[#93a0b3]">
                      {memberSinceYear ? `Member since ${memberSinceYear}` : "Campus seller"}
                    </p>
                  </div>
                </Link>

                <div className="rounded-[20px] bg-[#f8f2fb] px-3 py-2 text-right">
                  <p className="text-[18px] font-[800] leading-none tracking-[-0.04em] text-[#b045c7]">
                    {sellerListingCount}
                  </p>
                  <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#b88dc4]">
                    Listings
                  </p>
                </div>
              </div>

              <button
                type="button"
                className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(90deg,#1456f4_0%,#6b84f8_100%)] px-5 text-[14px] font-semibold text-white shadow-[0_18px_36px_rgba(20,86,244,0.22)] transition hover:brightness-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleMessageSeller}
                disabled={isSeller || isSold || isMessagingSeller}
              >
                <MessageSquare className="h-4 w-4" strokeWidth={2} />
                <span>
                  {isSeller
                    ? "This Is Your Listing"
                    : isMessagingSeller
                      ? "Opening..."
                      : "Message Seller"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleViewSellerAction}
                className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#f1f3f7] px-5 text-[14px] font-semibold text-[#3b4250] transition hover:bg-[#e9edf3]"
              >
                {secondarySellerActionLabel}
              </button>

              {canDeleteListing && (
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {isSeller && (
                    <button
                      type="button"
                      onClick={() => setIsEditOpen(true)}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#dde3ee] bg-white px-4 text-[12px] font-semibold text-[#445064] transition hover:border-[#cfd8e8] hover:text-[#20242d]"
                    >
                      Edit Listing
                    </button>
                  )}
                  {isSeller && (
                    <button
                      type="button"
                      onClick={handleStatusToggle}
                      disabled={isUpdatingStatus}
                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#dde3ee] bg-white px-4 text-[12px] font-semibold text-[#445064] transition hover:border-[#cfd8e8] hover:text-[#20242d] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isUpdatingStatus
                        ? "Updating..."
                        : isSold
                          ? "Mark Available"
                          : "Mark Sold"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsDeleteOpen(true)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-[#f0d6d6] bg-[#fff8f8] px-4 text-[12px] font-semibold text-[#bb4d4d] transition hover:border-[#e9c2c2] hover:bg-[#fff3f3] sm:col-span-2"
                  >
                    Delete Listing
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-[32px] bg-[linear-gradient(180deg,#1456f4_0%,#1456f4_100%)] p-[1px] shadow-[0_18px_42px_rgba(20,86,244,0.12)]">
              <div className="flex items-start gap-4 rounded-[31px] bg-[#f6f8fc] px-5 py-5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#edf2ff] text-[#1456f4]">
                  <ShieldCheck className="h-5 w-5" strokeWidth={2.1} />
                </div>
                <div>
                  <p className="text-[12px] font-[700] uppercase tracking-[0.14em] text-[#2f3643]">
                    Safety First
                  </p>
                  <p className="mt-2 text-[13px] leading-[1.65] text-[#6a7384]">
                    Meet in a public place on campus and verify the item before paying.
                    Never send money before seeing the item.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#a5aebb]">
                Description
              </p>
              <p className="mt-4 text-[14px] leading-[1.9] text-[#5f6879]">
                {listing.description}
              </p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                {descriptionTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex h-8 items-center rounded-full bg-[#edf1f6] px-4 text-[11px] font-semibold text-[#5e6777]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </aside>
        </div>

        <section className="mt-20">
          <div className="mb-7 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-[38px] font-[800] tracking-[-0.07em] text-[#2a2e37]">
                Similar Items Nearby
              </h2>
              <p className="mt-2 text-[15px] text-[#7d8696]">
                More student deals within 1 mile
              </p>
            </div>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2 text-[14px] font-semibold text-[#1456f4] transition hover:text-[#0f49e2]"
            >
              <span>View All</span>
              <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
            </Link>
          </div>

          {relatedListings.length > 0 ? (
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {relatedListings.map((item) => (
                <NearbyListingCard key={item.id} listing={item} />
              ))}
            </div>
          ) : (
            <div className="rounded-[30px] bg-white px-6 py-12 text-center text-[14px] text-[#728093] shadow-[0_20px_42px_rgba(20,29,47,0.07)]">
              No nearby alternatives yet.
            </div>
          )}
        </section>

        <EditListingModal
          isOpen={isEditOpen}
          listing={listing}
          onClose={() => setIsEditOpen(false)}
          onSuccess={handleEditSuccess}
        />

        {isDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm">
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
                <Button
                  variant="outline"
                  requiresAuth={false}
                  onClick={() => setIsDeleteOpen(false)}
                >
                  Cancel
                </Button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center rounded-full bg-[#e25555] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d94848] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
