"use client";

import { Armchair, BookOpen, Cpu, Package, Shirt } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { IMAGE_BASE_URL } from "@/lib/api";
import type { Listing } from "./types";

const categoryThemes = {
  Textbooks: {
    Icon: BookOpen,
    fallback: "bg-[linear-gradient(145deg,#e9efe4_0%,#d7e0ce_100%)] text-[#64735b]",
    accent: "bg-[#eef5ff] text-[#3360f4]",
  },
  Electronics: {
    Icon: Cpu,
    fallback: "bg-[linear-gradient(145deg,#6b968b_0%,#3b4b48_100%)] text-white",
    accent: "bg-[#ecf7ff] text-[#1b7bc2]",
  },
  Furniture: {
    Icon: Armchair,
    fallback: "bg-[linear-gradient(145deg,#f2e7d7_0%,#dcc09a_100%)] text-[#8b5d21]",
    accent: "bg-[#f9f0e2] text-[#ae6c14]",
  },
  Clothing: {
    Icon: Shirt,
    fallback: "bg-[linear-gradient(145deg,#f5eadf_0%,#eed5bb_100%)] text-[#875c31]",
    accent: "bg-[#fff1ea] text-[#b15b24]",
  },
  Other: {
    Icon: Package,
    fallback: "bg-[linear-gradient(145deg,#dfe8df_0%,#c4d0c4_100%)] text-[#5c6b5b]",
    accent: "bg-[#f1f3f7] text-[#687384]",
  },
} as const;

const conditionThemes = {
  New: "bg-[#ecf4ff] text-[#2963ff]",
  "Like New": "bg-[#eef9f3] text-[#147d43]",
  Good: "bg-[#f8eefc] text-[#9a4dd0]",
  Fair: "bg-[#fff1eb] text-[#c36b3e]",
} as const;

const resolveImageUrl = (url: string) => {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${IMAGE_BASE_URL}${normalized}`;
};

const formatTimeAgo = (dateString: string) => {
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "just now";
  const minutes = Math.floor(diffInSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
};

export const MarketplaceGridCard = ({ listing }: { listing: Listing }) => {
  const theme = categoryThemes[listing.category] ?? categoryThemes.Other;
  const conditionTheme = conditionThemes[listing.condition] ?? conditionThemes.Good;
  const imageUrl = listing.images[0] ? resolveImageUrl(listing.images[0]) : "";
  const sellerName = listing.seller.name || listing.seller.username || "Seller";
  const sellerHandle = listing.seller.username || listing.seller.name;
  const sellerLabel = sellerHandle.startsWith("@") ? sellerHandle : `@${sellerHandle}`;

  return (
    <article className="group flex h-full flex-col rounded-[28px] border border-[#e6ebf3] bg-white p-[10px] shadow-[0_20px_38px_rgba(17,24,39,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_26px_48px_rgba(17,24,39,0.1)]">
      <div className="relative overflow-hidden rounded-[22px] bg-[#f4f6fb] aspect-[1/0.78] min-h-[156px]">
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
            <theme.Icon className="h-14 w-14 opacity-90" strokeWidth={1.75} />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3">
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${conditionTheme}`}>
            {listing.condition}
          </span>
          <span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] ${theme.accent}`}>
            {listing.category}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-2 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="line-clamp-2 text-[17px] font-[700] leading-[1.18] tracking-[-0.045em] text-[#20242d]">
            {listing.title}
          </h2>
          <p className="shrink-0 text-[19px] font-[800] tracking-[-0.05em] text-[#2963ff]">
            ${listing.price}
          </p>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Avatar
            name={sellerName}
            size={22}
            className="border border-white text-[10px] shadow-[0_6px_12px_rgba(17,24,39,0.12)]"
          />
          <span className="truncate text-[11px] font-medium text-[#5f697d]">
            {sellerLabel}
          </span>
          <span className="text-[#c0c7d3]">•</span>
          <span className="shrink-0 text-[11px] font-medium text-[#8a93a4]">
            {formatTimeAgo(listing.createdAt)}
          </span>
        </div>

        <div className="mt-5">
          <span className="inline-flex h-10 items-center justify-center rounded-full border border-[#e3e8f1] bg-[#f8faff] px-5 text-[11px] font-semibold tracking-[-0.01em] text-[#2963ff] transition group-hover:border-[#d2ddff] group-hover:bg-[#eef3ff]">
            View Details
          </span>
        </div>
      </div>
    </article>
  );
};
