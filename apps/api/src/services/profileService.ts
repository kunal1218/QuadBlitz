import { profile } from "./mockData";
import { db } from "../db";
import { ensureUsersTable } from "./authService";
import { ensureFriendTables } from "./friendService";
import { getProfileAnswers } from "./profileAnswersService";
import {
  LayoutMode,
  fetchProfileLayout,
} from "./profileLayoutService";

type PublicProfileUserRow = {
  id: string;
  name: string;
  handle: string;
  profile_picture_url?: string | null;
  college_name?: string | null;
  college_domain?: string | null;
  banned_until?: string | Date | null;
  banned_indefinitely?: boolean | null;
};

const toIsoString = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const getBanInfo = (row: PublicProfileUserRow) => {
  const isIndefinite = Boolean(row.banned_indefinitely);
  const until = row.banned_until ? toIsoString(row.banned_until) : null;
  const isActive = isIndefinite || (until ? new Date(until).getTime() > Date.now() : false);
  return { isActive, until, isIndefinite };
};

const normalizeHandle = (value: string) => {
  const cleaned = value.trim().toLowerCase().replace(/^@/, "");
  const sanitized = cleaned.replace(/[^a-z0-9_]/g, "");
  if (!sanitized) {
    return "";
  }
  return `@${sanitized}`;
};

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );

export const fetchProfile = async () => {
  return profile;
};

export const fetchPublicProfileByHandle = async (
  handle: string,
  mode?: LayoutMode,
  options?: { includeBanInfo?: boolean }
) => {
  await ensureUsersTable();
  const trimmed = handle.trim();
  if (!trimmed) {
    return null;
  }

  let result;
  if (isUuid(trimmed)) {
    result = await db.query(
      "SELECT id, name, handle, profile_picture_url, college_name, college_domain, banned_until, banned_indefinitely FROM users WHERE id = $1",
      [trimmed]
    );
  } else {
    const normalized = normalizeHandle(trimmed);
    if (!normalized) {
      return null;
    }
    result = await db.query(
      "SELECT id, name, handle, profile_picture_url, college_name, college_domain, banned_until, banned_indefinitely FROM users WHERE handle = $1",
      [normalized]
    );
  }

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  const row = result.rows[0] as PublicProfileUserRow;
  const requestedMode = mode ?? "default";
  const fallbackMode = requestedMode === "compact" ? "default" : "compact";
  await ensureFriendTables();

  const [answers, primaryLayout, fallbackLayout, friendsCountResult] = await Promise.all([
    getProfileAnswers(row.id),
    fetchProfileLayout({ userId: row.id, mode: requestedMode }),
    fetchProfileLayout({ userId: row.id, mode: fallbackMode }),
    db.query(
      `SELECT COUNT(*)::text AS count
       FROM friend_requests
       WHERE status = 'accepted'
         AND (requester_id = $1 OR recipient_id = $1)`,
      [row.id]
    ),
  ]);

  const layout = primaryLayout ?? fallbackLayout;
  const friendsCount = Number.parseInt(
    (friendsCountResult.rows[0] as { count?: string } | undefined)?.count ?? "0",
    10
  );

  const ban = options?.includeBanInfo ? getBanInfo(row) : undefined;

  return {
    user: {
      id: row.id,
      name: row.name,
      handle: row.handle,
      avatarUrl: row.profile_picture_url ?? null,
      collegeName: row.college_name ?? null,
      collegeDomain: row.college_domain ?? null,
    },
    answers,
    layout,
    stats: {
      friendsCount: Number.isFinite(friendsCount) ? friendsCount : 0,
    },
    ban,
  };
};
