import type { RequestCard as RequestCardType } from "@lockedin/shared";
import { Avatar } from "@/components/Avatar";
import { deriveCollegeFromDomain } from "@/lib/college";
import { formatRelativeTime } from "@/lib/time";

type RequestCardProps = {
  request: RequestCardType;
  onHelp?: (request: RequestCardType) => void | Promise<void>;
  isHelping?: boolean;
  hasHelped?: boolean;
  isOwnRequest?: boolean;
  onLike?: (request: RequestCardType) => void | Promise<void>;
  isLiking?: boolean;
  onDelete?: (request: RequestCardType) => void | Promise<void>;
};

const LocationIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
    <path
      d="M8 13.2s3.1-2.82 3.1-5.7A3.1 3.1 0 0 0 4.9 7.5c0 2.88 3.1 5.7 3.1 5.7Z"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinejoin="round"
    />
    <circle cx="8" cy="7.3" r="1.15" fill="currentColor" />
  </svg>
);

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="h-4 w-4">
    <path
      d="M8.02 13.05 2.7 8.12a3.06 3.06 0 0 1 4.32-4.34L8 4.75l.98-.97A3.06 3.06 0 0 1 13.3 8.1l-5.28 4.95Z"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinejoin="round"
    />
  </svg>
);

const urgencyDisplay = {
  high: {
    label: "Urgent",
    className: "border-[#ffdbe7] bg-[#fff1f6] text-[#d52f68]",
  },
  medium: {
    label: "Medium",
    className: "border-[#d9e6ff] bg-[#edf3ff] text-[#1456f4]",
  },
  low: {
    label: "Low Priority",
    className: "border-[#edf1f7] bg-[#f8fafc] text-[#808aa0]",
  },
} as const;

export const RequestCard = ({
  request,
  onHelp,
  isHelping = false,
  hasHelped = false,
  isOwnRequest = false,
  onLike,
  isLiking = false,
  onDelete,
}: RequestCardProps) => {
  const urgency = urgencyDisplay[request.urgency ?? "low"];
  const collegeLabel = deriveCollegeFromDomain(
    request.creator.collegeDomain ?? ""
  );
  const locationLabel = request.isRemote
    ? "Remote"
    : request.city
      ? `${request.city} · ${request.location}`
      : request.location;
  const visibleTags = request.tags.filter(Boolean).slice(0, 4);

  return (
    <article className="rounded-[36px] border border-[#dbe5fb] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,255,0.98)_100%)] p-6 shadow-[0_28px_70px_rgba(35,72,152,0.1)] sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar
            name={request.creator.name || request.creator.handle}
            size={48}
            className="border border-[#dce5f6] text-[#1c2433] shadow-[0_12px_28px_rgba(35,72,152,0.12)]"
          />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold tracking-[-0.03em] text-[#1c2433]">
              {request.creator.name || request.creator.handle}
            </p>
            <p className="mt-1 truncate text-[12px] font-medium text-[#6d7890]">
              {collegeLabel || request.creator.handle} • {formatRelativeTime(request.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isOwnRequest && (
            <span className="rounded-full border border-[#dce5f6] bg-white px-3 py-[7px] text-[10px] font-bold uppercase tracking-[0.24em] text-[#7a879e]">
              Your Post
            </span>
          )}
          <span
            className={`rounded-full border px-3 py-[7px] text-[10px] font-bold uppercase tracking-[0.24em] ${urgency.className}`}
          >
            {urgency.label}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="max-w-[760px] text-[29px] font-[800] leading-[1.08] tracking-[-0.06em] text-[#1b2230]">
          {request.title}
        </h2>
        <p className="mt-4 max-w-[760px] text-[15px] leading-[1.85] text-[#556176] sm:text-[16px]">
          {request.description}
        </p>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="rounded-full border border-[#dce5f6] bg-white px-3 py-[8px] text-[11px] font-semibold text-[#546177]">
          {request.isRemote ? "Remote" : "In-person"}
        </span>
        {visibleTags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-[#dce5f6] bg-[#f8fbff] px-3 py-[8px] text-[11px] font-semibold text-[#6d7890]"
          >
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3 text-[13px] font-medium text-[#5a6880]">
          <span className="inline-flex items-center gap-2">
            <LocationIcon />
            <span>{locationLabel}</span>
          </span>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-[9px] text-[12px] font-semibold transition ${
              request.likedByUser
                ? "border-[#d9e6ff] bg-[#edf3ff] text-[#1456f4]"
                : "border-[#dce5f6] bg-white text-[#69768c] hover:border-[#cad8f6] hover:text-[#1456f4]"
            }`}
            onClick={() => onLike?.(request)}
            disabled={isLiking}
          >
            <HeartIcon filled={Boolean(request.likedByUser)} />
            <span>{request.likeCount}</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isOwnRequest ? (
            <button
              type="button"
              className="rounded-full border border-[#ffd7df] bg-[#fff3f6] px-5 py-3 text-[13px] font-semibold text-[#cc3e67] transition hover:bg-[#ffeaf0]"
              onClick={() => onDelete?.(request)}
            >
              Delete Request
            </button>
          ) : (
            <button
              type="button"
              className={`rounded-full px-6 py-3 text-[13px] font-semibold transition ${
                hasHelped
                  ? "border border-[#d9e6ff] bg-[#edf3ff] text-[#1456f4]"
                  : "bg-[#1456f4] text-white shadow-[0_16px_32px_rgba(20,86,244,0.24)] hover:bg-[#0e4bd9]"
              }`}
              onClick={() => onHelp?.(request)}
              disabled={isHelping}
            >
              {hasHelped ? "Offer Sent" : isHelping ? "Sending..." : "Offer Help"}
            </button>
          )}
        </div>
      </div>
    </article>
  );
};
