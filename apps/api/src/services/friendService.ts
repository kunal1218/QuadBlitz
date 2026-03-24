import { randomUUID } from "crypto";
import { db } from "../db";
import { ensureUsersTable } from "./authService";
import { isUserOnline } from "./socketService";

export type FriendUser = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
  collegeName?: string | null;
  collegeDomain?: string | null;
  isOnline?: boolean;
};

export type FriendRequest = {
  id: string;
  createdAt: string;
  requester: FriendUser;
  recipient: FriendUser;
};

export type FriendSummary = {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: FriendUser[];
};

export type RelationshipStatus =
  | "none"
  | "incoming"
  | "outgoing"
  | "friends"
  | "blocked"
  | "blocked_by";

type FriendUserRow = {
  id: string;
  name: string;
  handle: string;
  profile_picture_url?: string | null;
  college_name?: string | null;
  college_domain?: string | null;
  is_online?: boolean | null;
};

type FriendRequestRow = {
  id: string;
  created_at: string | Date;
  requester_id: string;
  requester_name: string;
  requester_handle: string;
  requester_profile_picture_url?: string | null;
  requester_college_name?: string | null;
  requester_college_domain?: string | null;
  recipient_id: string;
  recipient_name: string;
  recipient_handle: string;
  recipient_profile_picture_url?: string | null;
  recipient_college_name?: string | null;
  recipient_college_domain?: string | null;
};

export class FriendError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const normalizeHandle = (value: string) => {
  const cleaned = value.trim().toLowerCase().replace(/^@/, "");
  const sanitized = cleaned.replace(/[^a-z0-9_]/g, "");
  if (!sanitized) {
    return "";
  }
  return `@${sanitized}`;
};

const toIsoString = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapUser = (row: FriendUserRow): FriendUser => ({
  id: row.id,
  name: row.name,
  handle: row.handle,
  avatarUrl: row.profile_picture_url ?? null,
  collegeName: row.college_name ?? null,
  collegeDomain: row.college_domain ?? null,
  isOnline: Boolean(row.is_online),
});

const mapRequest = (row: FriendRequestRow): FriendRequest => ({
  id: row.id,
  createdAt: toIsoString(row.created_at),
  requester: mapUser({
    id: row.requester_id,
    name: row.requester_name,
    handle: row.requester_handle,
    profile_picture_url: row.requester_profile_picture_url ?? null,
    college_name: row.requester_college_name ?? null,
    college_domain: row.requester_college_domain ?? null,
  }),
  recipient: mapUser({
    id: row.recipient_id,
    name: row.recipient_name,
    handle: row.recipient_handle,
    profile_picture_url: row.recipient_profile_picture_url ?? null,
    college_name: row.recipient_college_name ?? null,
    college_domain: row.recipient_college_domain ?? null,
  }),
});

export const ensureFriendTables = async () => {
  await ensureUsersTable();

  await db.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id uuid PRIMARY KEY,
      requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (requester_id, recipient_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS friend_blocks (
      blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (blocker_id, blocked_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS friend_requests_recipient_idx
      ON friend_requests (recipient_id, status);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS friend_requests_requester_idx
      ON friend_requests (requester_id, status);
  `);
};

export const getUserByHandle = async (handle: string): Promise<FriendUserRow> => {
  await ensureUsersTable();
  const normalized = normalizeHandle(handle);
  if (!normalized) {
    throw new FriendError("Handle is required", 400);
  }

  const result = await db.query(
    "SELECT id, name, handle, profile_picture_url, college_name, college_domain FROM users WHERE handle = $1",
    [normalized]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new FriendError("User not found", 404);
  }

  return result.rows[0] as FriendUserRow;
};

const hasBlock = async (blockerId: string, blockedId: string) => {
  const result = await db.query(
    "SELECT 1 FROM friend_blocks WHERE blocker_id = $1 AND blocked_id = $2",
    [blockerId, blockedId]
  );
  return (result.rowCount ?? 0) > 0;
};

const fetchRequestBetween = async (userId: string, otherId: string) => {
  const result = await db.query(
    `SELECT id, status, requester_id, recipient_id
     FROM friend_requests
     WHERE (requester_id = $1 AND recipient_id = $2)
        OR (requester_id = $2 AND recipient_id = $1)
     LIMIT 1`,
    [userId, otherId]
  );
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  return result.rows[0] as {
    id: string;
    status: string;
    requester_id: string;
    recipient_id: string;
  };
};

export const getRelationshipStatus = async (
  userId: string,
  otherId: string
): Promise<RelationshipStatus> => {
  await ensureFriendTables();

  if (await hasBlock(userId, otherId)) {
    return "blocked";
  }
  if (await hasBlock(otherId, userId)) {
    return "blocked_by";
  }

  const request = await fetchRequestBetween(userId, otherId);
  if (!request) {
    return "none";
  }

  if (request.status === "accepted") {
    return "friends";
  }

  if (request.status === "pending") {
    return request.requester_id === userId ? "outgoing" : "incoming";
  }

  return "none";
};

export const fetchFriendSummary = async (userId: string): Promise<FriendSummary> => {
  await ensureFriendTables();

  const friendsResult = await db.query(
    `SELECT
        CASE WHEN fr.requester_id = $1 THEN recipient.id ELSE requester.id END AS id,
        CASE WHEN fr.requester_id = $1 THEN recipient.name ELSE requester.name END AS name,
        CASE WHEN fr.requester_id = $1 THEN recipient.handle ELSE requester.handle END AS handle,
        CASE WHEN fr.requester_id = $1 THEN recipient.profile_picture_url ELSE requester.profile_picture_url END AS profile_picture_url,
        CASE WHEN fr.requester_id = $1 THEN recipient.college_name ELSE requester.college_name END AS college_name,
        CASE WHEN fr.requester_id = $1 THEN recipient.college_domain ELSE requester.college_domain END AS college_domain
     FROM friend_requests fr
     JOIN users requester ON requester.id = fr.requester_id
     JOIN users recipient ON recipient.id = fr.recipient_id
     WHERE fr.status = 'accepted'
       AND (fr.requester_id = $1 OR fr.recipient_id = $1)
     ORDER BY fr.updated_at DESC`,
    [userId]
  );

  const incomingResult = await db.query(
    `SELECT fr.id,
            fr.created_at,
            requester.id AS requester_id,
            requester.name AS requester_name,
            requester.handle AS requester_handle,
            requester.profile_picture_url AS requester_profile_picture_url,
            requester.college_name AS requester_college_name,
            requester.college_domain AS requester_college_domain,
            recipient.id AS recipient_id,
            recipient.name AS recipient_name,
            recipient.handle AS recipient_handle,
            recipient.profile_picture_url AS recipient_profile_picture_url,
            recipient.college_name AS recipient_college_name,
            recipient.college_domain AS recipient_college_domain
     FROM friend_requests fr
     JOIN users requester ON requester.id = fr.requester_id
     JOIN users recipient ON recipient.id = fr.recipient_id
     WHERE fr.status = 'pending'
       AND fr.recipient_id = $1
     ORDER BY fr.created_at DESC`,
    [userId]
  );

  const outgoingResult = await db.query(
    `SELECT fr.id,
            fr.created_at,
            requester.id AS requester_id,
            requester.name AS requester_name,
            requester.handle AS requester_handle,
            requester.profile_picture_url AS requester_profile_picture_url,
            requester.college_name AS requester_college_name,
            requester.college_domain AS requester_college_domain,
            recipient.id AS recipient_id,
            recipient.name AS recipient_name,
            recipient.handle AS recipient_handle,
            recipient.profile_picture_url AS recipient_profile_picture_url,
            recipient.college_name AS recipient_college_name,
            recipient.college_domain AS recipient_college_domain
     FROM friend_requests fr
     JOIN users requester ON requester.id = fr.requester_id
     JOIN users recipient ON recipient.id = fr.recipient_id
     WHERE fr.status = 'pending'
       AND fr.requester_id = $1
     ORDER BY fr.created_at DESC`,
    [userId]
  );

  const blockedResult = await db.query(
    `SELECT users.id, users.name, users.handle, users.profile_picture_url, users.college_name, users.college_domain
     FROM friend_blocks blocks
     JOIN users ON users.id = blocks.blocked_id
     WHERE blocks.blocker_id = $1
     ORDER BY blocks.created_at DESC`,
    [userId]
  );

  return {
    friends: (friendsResult.rows as FriendUserRow[]).map((row) =>
      mapUser({
        ...row,
        is_online: isUserOnline(row.id),
      })
    ),
    incoming: (incomingResult.rows as FriendRequestRow[]).map(mapRequest),
    outgoing: (outgoingResult.rows as FriendRequestRow[]).map(mapRequest),
    blocked: (blockedResult.rows as FriendUserRow[]).map(mapUser),
  };
};

export const createFriendRequest = async (params: {
  requesterId: string;
  recipientId: string;
}): Promise<void> => {
  await ensureFriendTables();

  if (params.requesterId === params.recipientId) {
    throw new FriendError("You cannot friend yourself", 400);
  }

  if (await hasBlock(params.recipientId, params.requesterId)) {
    throw new FriendError("This user has blocked you", 403);
  }

  if (await hasBlock(params.requesterId, params.recipientId)) {
    throw new FriendError("Unblock this user before sending a request", 403);
  }

  const existing = await fetchRequestBetween(params.requesterId, params.recipientId);
  if (existing) {
    if (existing.status === "accepted") {
      throw new FriendError("You are already friends", 409);
    }
    throw new FriendError("A friend request is already pending", 409);
  }

  await db.query(
    `INSERT INTO friend_requests (id, requester_id, recipient_id, status)
     VALUES ($1, $2, $3, 'pending')`,
    [randomUUID(), params.requesterId, params.recipientId]
  );
};

export const acceptFriendRequest = async (params: {
  recipientId: string;
  requesterId: string;
}): Promise<void> => {
  await ensureFriendTables();

  const updated = await db.query(
    `UPDATE friend_requests
     SET status = 'accepted', updated_at = now()
     WHERE requester_id = $1 AND recipient_id = $2 AND status = 'pending'`,
    [params.requesterId, params.recipientId]
  );

  if ((updated.rowCount ?? 0) === 0) {
    throw new FriendError("Friend request not found", 404);
  }
};

export const removeFriendRequest = async (params: {
  userId: string;
  otherUserId: string;
}): Promise<void> => {
  await ensureFriendTables();

  await db.query(
    `DELETE FROM friend_requests
     WHERE status = 'pending'
       AND ((requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1))`,
    [params.userId, params.otherUserId]
  );
};

export const removeFriendship = async (params: {
  userId: string;
  otherUserId: string;
}): Promise<void> => {
  await ensureFriendTables();

  await db.query(
    `DELETE FROM friend_requests
     WHERE status = 'accepted'
       AND ((requester_id = $1 AND recipient_id = $2)
         OR (requester_id = $2 AND recipient_id = $1))`,
    [params.userId, params.otherUserId]
  );
};

export const blockUser = async (params: {
  blockerId: string;
  blockedId: string;
}): Promise<void> => {
  await ensureFriendTables();

  if (params.blockerId === params.blockedId) {
    throw new FriendError("You cannot block yourself", 400);
  }

  await db.query(
    `INSERT INTO friend_blocks (blocker_id, blocked_id)
     VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [params.blockerId, params.blockedId]
  );

  await db.query(
    `DELETE FROM friend_requests
     WHERE (requester_id = $1 AND recipient_id = $2)
        OR (requester_id = $2 AND recipient_id = $1)`,
    [params.blockerId, params.blockedId]
  );
};

export const unblockUser = async (params: {
  blockerId: string;
  blockedId: string;
}): Promise<void> => {
  await ensureFriendTables();

  await db.query(
    "DELETE FROM friend_blocks WHERE blocker_id = $1 AND blocked_id = $2",
    [params.blockerId, params.blockedId]
  );
};
