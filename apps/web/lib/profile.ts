type ProfileTarget = {
  id?: string | null;
  handle?: string | null;
};

export const getProfileIdentifier = (target: ProfileTarget) => {
  const handleSlug = target.handle?.replace(/^@/, "").trim();
  if (handleSlug) {
    return handleSlug;
  }

  return target.id?.trim() ?? "";
};

export const getProfileHref = (
  target: ProfileTarget,
  viewerId?: string | null
) => {
  if (viewerId && target.id === viewerId) {
    return "/profile";
  }

  const identifier = getProfileIdentifier(target);
  return identifier ? `/profile/${encodeURIComponent(identifier)}` : "/profile";
};
