import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";
import { IMAGE_BASE_URL } from "@/lib/api";

const colorClasses = [
  "bg-amber-200",
  "bg-emerald-200",
  "bg-rose-200",
  "bg-sky-200",
];

type AvatarProps = HTMLAttributes<HTMLDivElement> & {
  name: string;
  size?: number;
  avatarUrl?: string | null;
};

const resolveAvatarUrl = (url?: string | null) => {
  if (!url) {
    return "";
  }

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("data:") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${IMAGE_BASE_URL}${normalized}`;
};

export const Avatar = ({
  name,
  size = 40,
  className,
  avatarUrl,
  style,
  ...props
}: AvatarProps) => {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const colorClass = colorClasses[name.length % colorClasses.length];
  const resolvedAvatarUrl = useMemo(() => resolveAvatarUrl(avatarUrl), [avatarUrl]);
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);

  const shouldRenderImage =
    Boolean(resolvedAvatarUrl) && failedAvatarUrl !== resolvedAvatarUrl;

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-full text-sm font-semibold text-ink ${colorClass} ${className ?? ""}`}
      style={{ width: size, height: size, ...style }}
      {...props}
    >
      {shouldRenderImage ? (
        <img
          src={resolvedAvatarUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setFailedAvatarUrl(resolvedAvatarUrl)}
          draggable={false}
        />
      ) : (
        initial
      )}
    </div>
  );
};
