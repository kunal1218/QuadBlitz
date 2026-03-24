import { MapCanvas } from "@/features/map";

type MapPageProps = {
  searchParams?: {
    embedded?: string | string[];
    mobileMinimal?: string | string[];
  };
};

export default function MapPage({ searchParams }: MapPageProps) {
  const embeddedParam = searchParams?.embedded;
  const mobileMinimalParam = searchParams?.mobileMinimal;
  const isEmbedded =
    embeddedParam === "1" || (Array.isArray(embeddedParam) && embeddedParam.includes("1"));
  const isMobileMinimal =
    mobileMinimalParam === "1" ||
    (Array.isArray(mobileMinimalParam) && mobileMinimalParam.includes("1"));

  return (
    <div
      className={
        isEmbedded
          ? "relative h-[100svh] min-h-[100vh] w-full overflow-hidden"
          : "relative h-[calc(100svh-96px)] min-h-[calc(100vh-96px)] w-full overflow-hidden"
      }
    >
      <MapCanvas embedded={isEmbedded} mobileMinimal={isMobileMinimal} />
    </div>
  );
}
