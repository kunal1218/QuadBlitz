import { MapCanvas } from "@/features/map";
import { MapDiscoveryPage } from "@/features/map/MapDiscoveryPage";

type MapPageProps = {
  searchParams?: {
    embedded?: string | string[];
  };
};

export default function MapPage({ searchParams }: MapPageProps) {
  const embeddedParam = searchParams?.embedded;
  const isEmbedded =
    embeddedParam === "1" || (Array.isArray(embeddedParam) && embeddedParam.includes("1"));

  if (isEmbedded) {
    return (
      <div className="relative h-[100svh] min-h-[100vh] w-full overflow-hidden">
        <MapCanvas embedded />
      </div>
    );
  }

  return <MapDiscoveryPage />;
}
