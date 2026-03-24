import type { ReactNode } from "react";
import { MarketplaceHeader } from "@/features/marketplace/MarketplaceHeader";

export default function MarketplaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      <MarketplaceHeader />
      {children}
    </>
  );
}
