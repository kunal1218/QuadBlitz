"use client";

import type { EventWithDetails } from "@lockedin/shared";
import {
  formatEventTooltipTime,
  getCategoryColor,
  getCategoryIcon,
  getEventMarkerSize,
  getEventStatus,
} from "../utils/eventHelpers";

type EventMarkerProps = {
  event: EventWithDetails;
  isSelected?: boolean;
  onClick?: (event: EventWithDetails) => void;
  tooltip?: string;
  variant?: "default" | "discovery";
};

const SportsMarkerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]" fill="none">
    <circle cx="12" cy="12" r="8.3" stroke="currentColor" strokeWidth="2.1" />
    <path
      d="M3.9 12h16.2M12 3.9c2.3 2.15 3.45 4.86 3.45 8.1 0 3.24-1.15 5.95-3.45 8.1M12 3.9c-2.3 2.15-3.45 4.86-3.45 8.1 0 3.24 1.15 5.95 3.45 8.1"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const StudyMarkerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]" fill="none">
    <path
      d="M5.1 6.25 11 4.6l7.9 2.05v10.9L13 15.95l-7.9 1.65V6.25Z"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinejoin="round"
    />
    <path d="M11 4.6v11.35" stroke="currentColor" strokeWidth="1.95" />
  </svg>
);

const SocialMarkerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]" fill="none">
    <circle cx="8" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.9" />
    <circle cx="16.3" cy="9.2" r="2.2" stroke="currentColor" strokeWidth="1.9" />
    <path
      d="M4.8 18.2c.55-2.45 2.45-3.9 5.2-3.9 2.8 0 4.7 1.45 5.25 3.9M13.7 14.45c1.95.16 3.35 1.02 4.18 2.63"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
    />
  </svg>
);

const BuildMarkerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]" fill="none">
    <path
      d="M7.2 5.3h9.6v2.25a3.3 3.3 0 0 1-3.3 3.3h-3a3.3 3.3 0 0 1-3.3-3.3V5.3Z"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinejoin="round"
    />
    <path
      d="M9.1 18.7h5.8M12 10.85v7.85M8 5.3V3.8M16 5.3V3.8"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinecap="round"
    />
  </svg>
);

const OtherMarkerIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]" fill="none">
    <path
      d="M8.2 4.4v7.1M15.7 4.4v7.1M6.8 4.4h2.8M14.3 4.4h2.8M8.2 11.5v8.1M15.7 11.5v8.1"
      stroke="currentColor"
      strokeWidth="1.95"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const getDiscoveryMarkerIcon = (category: EventWithDetails["category"]) => {
  switch (category) {
    case "sports":
      return <SportsMarkerIcon />;
    case "study":
      return <StudyMarkerIcon />;
    case "build":
      return <BuildMarkerIcon />;
    case "social":
      return <SocialMarkerIcon />;
    default:
      return <OtherMarkerIcon />;
  }
};

export const EventMarker = ({
  event,
  isSelected,
  onClick,
  tooltip,
  variant = "default",
}: EventMarkerProps) => {
  const icon = getCategoryIcon(event.category);
  const backgroundColor = getCategoryColor(event.category);
  const count = Math.max(0, Number(event.attendee_count ?? 0));
  const size = getEventMarkerSize(event);
  const status = getEventStatus(event.start_time, event.end_time);
  const markerSize = size;
  const title =
    tooltip ??
    `${event.title} • ${formatEventTooltipTime(event.start_time)} • ${count} going`;

  if (variant === "discovery") {
    return (
      <div
        role="button"
        aria-label={event.title}
        title={title}
        onClick={() => onClick?.(event)}
        className={`relative flex h-[94px] w-[94px] cursor-pointer items-center justify-center transition-transform duration-200 ${
          isSelected ? "scale-105" : "hover:scale-[1.03]"
        }`}
      >
        <span
          className={`absolute rounded-full bg-white/18 backdrop-blur-[1px] transition-all duration-200 ${
            isSelected ? "inset-0 shadow-[0_16px_40px_rgba(28,54,110,0.18)]" : "inset-[10px]"
          }`}
          aria-hidden="true"
        />
        <span
          className={`relative flex items-center justify-center rounded-full border-[4px] border-white bg-[#2962ff] text-white shadow-[0_10px_22px_rgba(41,98,255,0.34)] transition-all duration-200 ${
            isSelected ? "h-[64px] w-[64px]" : "h-[58px] w-[58px]"
          }`}
        >
          {getDiscoveryMarkerIcon(event.category)}
        </span>
      </div>
    );
  }

  return (
    <div
      role="button"
      aria-label={event.title}
      title={title}
      onClick={() => onClick?.(event)}
      className={`relative flex cursor-pointer items-center justify-center rounded-full text-white shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-transform duration-200 ${
        isSelected ? "scale-110" : "hover:scale-105"
      }`}
      style={{ backgroundColor, width: markerSize, height: markerSize }}
    >
      {status.urgent && (
        <span
          className="absolute inset-[-4px] rounded-full border border-rose-400/40 bg-rose-500/10"
          aria-hidden="true"
        />
      )}
      {isSelected && (
        <span
          className="absolute inset-0 rounded-full ring-4 ring-white/60 shadow-[0_0_18px_rgba(255,255,255,0.55)]"
          aria-hidden="true"
        />
      )}
      <span className="text-lg" aria-hidden="true">
        {icon}
      </span>
      {count > 0 && (
        <span className="absolute -right-2 -top-2 flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-ink shadow-[0_2px_6px_rgba(0,0,0,0.25)]">
          {count}
        </span>
      )}
    </div>
  );
};
