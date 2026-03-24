import { randomUUID } from "crypto";
import { db } from "../db";
import { ensureUsersTable } from "./authService";

export type NotificationActor = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
};

export type NotificationItem = {
  id: string;
  type: string;
  createdAt: string;
  readAt: string | null;
  actor: NotificationActor | null;
  messageId: string | null;
  messagePreview: string | null;
  contextId: string | null;
};

type NotificationRow = {
  id: string;
  type: string;
  created_at: string | Date;
  read_at: string | Date | null;
  actor_id: string | null;
  actor_name?: string | null;
  actor_handle?: string | null;
  actor_avatar_url?: string | null;
  message_id: string | null;
  message_preview: string | null;
  context_id: string | null;
};

export class NotificationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const toIsoString = (value: string | Date | null | undefined) => {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const trimPreview = (value: string | null | undefined, limit = 140) => {
  if (!value) {
    return null;
  }
  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, limit - 3).trimEnd()}...`;
};

const ensureNotificationsTable = async () => {
  await ensureUsersTable();

  await db.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
      type text NOT NULL,
      message_id uuid,
      message_preview text,
      context_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      read_at timestamptz
    );
  `);

  await db.query(`
    ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS context_id uuid;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS notifications_user_idx
      ON notifications (user_id, created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
      ON notifications (user_id, read_at);
  `);
};

const mapNotification = (row: NotificationRow): NotificationItem => ({
  id: row.id,
  type: row.type,
  createdAt: toIsoString(row.created_at) ?? new Date().toISOString(),
  readAt: toIsoString(row.read_at),
  actor: row.actor_id
    ? {
        id: row.actor_id,
        name: row.actor_name ?? "",
        handle: row.actor_handle ?? "",
        avatarUrl: row.actor_avatar_url ?? null,
      }
    : null,
  messageId: row.message_id ?? null,
  messagePreview: trimPreview(row.message_preview),
  contextId: row.context_id ?? null,
});

export const createMessageNotification = async (params: {
  recipientId: string;
  actorId: string;
  messageId: string;
  messageBody: string;
}) => {
  if (params.recipientId === params.actorId) {
    return;
  }

  await ensureNotificationsTable();
  const id = randomUUID();
  const preview = trimPreview(params.messageBody);

  await db.query(
    `INSERT INTO notifications (
      id, user_id, actor_id, type, message_id, message_preview
     ) VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      params.recipientId,
      params.actorId,
      "message",
      params.messageId,
      preview,
    ]
  );
};

export const createMarketplaceMessageNotification = async (params: {
  recipientId: string;
  actorId: string;
  messageId: string;
  messageBody: string;
  conversationId: string;
  listingTitle: string;
}) => {
  if (params.recipientId === params.actorId) {
    return;
  }

  await ensureNotificationsTable();
  const id = randomUUID();
  const previewSource = params.listingTitle
    ? `${params.listingTitle}: ${params.messageBody}`
    : params.messageBody;
  const preview = trimPreview(previewSource);

  await db.query(
    `INSERT INTO notifications (
      id, user_id, actor_id, type, message_id, message_preview, context_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.recipientId,
      params.actorId,
      "marketplace_message",
      params.messageId,
      preview,
      params.conversationId,
    ]
  );
};

export const createRequestHelpNotification = async (params: {
  recipientId: string;
  actorId: string;
  requestId: string;
  requestTitle: string;
  requestDescription: string;
}) => {
  if (params.recipientId === params.actorId) {
    return;
  }

  await ensureNotificationsTable();
  const id = randomUUID();
  const previewSource = params.requestDescription || params.requestTitle || "";
  const preview = trimPreview(previewSource);

  await db.query(
    `INSERT INTO notifications (
      id, user_id, actor_id, type, message_id, message_preview, context_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.recipientId,
      params.actorId,
      "request_help",
      params.requestId,
      preview,
      params.requestId,
    ]
  );
};

export const createClubApplicationNotification = async (params: {
  recipientId: string;
  actorId: string;
  clubId: string;
  clubTitle: string;
  applicationId: string;
}) => {
  if (params.recipientId === params.actorId) {
    return;
  }

  await ensureNotificationsTable();
  const id = randomUUID();
  const preview = trimPreview(params.clubTitle);

  await db.query(
    `INSERT INTO notifications (
      id, user_id, actor_id, type, message_id, message_preview, context_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      id,
      params.recipientId,
      params.actorId,
      "club_application",
      params.applicationId,
      preview,
      params.clubId,
    ]
  );
};

export const deleteRequestHelpNotification = async (params: {
  recipientId: string;
  actorId: string;
  requestId: string;
}) => {
  await ensureNotificationsTable();
  await db.query(
    `DELETE FROM notifications
     WHERE user_id = $1
       AND actor_id = $2
       AND type = 'request_help'
       AND context_id = $3`,
    [params.recipientId, params.actorId, params.requestId]
  );
};

export const fetchNotificationsForUser = async (
  userId: string,
  limit = 50
): Promise<NotificationItem[]> => {
  await ensureNotificationsTable();

  const result = await db.query(
    `SELECT n.id,
            n.type,
            n.created_at,
     n.read_at,
     n.message_id,
     n.message_preview,
      n.context_id,
      actor.id AS actor_id,
      actor.name AS actor_name,
      actor.handle AS actor_handle,
      actor.profile_picture_url AS actor_avatar_url
     FROM notifications n
     LEFT JOIN users actor ON actor.id = n.actor_id
     WHERE n.user_id = $1
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [userId, limit]
  );

  return (result.rows as NotificationRow[]).map(mapNotification);
};

export const fetchUnreadNotificationCount = async (
  userId: string
): Promise<number> => {
  await ensureNotificationsTable();
  const result = await db.query(
    `SELECT COUNT(*)::int AS count
     FROM notifications
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
  const count = result.rows[0]?.count ?? 0;
  return Number(count) || 0;
};

export const markNotificationsRead = async (userId: string) => {
  await ensureNotificationsTable();
  await db.query(
    `UPDATE notifications
     SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId]
  );
};

export const markMessageNotificationsRead = async (
  userId: string,
  actorId: string
) => {
  await ensureNotificationsTable();
  await db.query(
    `UPDATE notifications
     SET read_at = now()
     WHERE user_id = $1
       AND actor_id = $2
       AND type = 'message'
       AND read_at IS NULL`,
    [userId, actorId]
  );
};

export const markMarketplaceMessageNotificationsRead = async (
  userId: string,
  conversationId: string
) => {
  await ensureNotificationsTable();
  await db.query(
    `UPDATE notifications
     SET read_at = now()
     WHERE user_id = $1
       AND type = 'marketplace_message'
       AND context_id = $2
       AND read_at IS NULL`,
    [userId, conversationId]
  );
};
