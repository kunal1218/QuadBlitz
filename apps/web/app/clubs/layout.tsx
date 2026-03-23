import type { ReactNode } from "react";
import { MarketplaceHeader } from "@/features/marketplace/MarketplaceHeader";

export default function ClubsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <MarketplaceHeader activeHref="/clubs" />
      {children}
    </>
  );
}
