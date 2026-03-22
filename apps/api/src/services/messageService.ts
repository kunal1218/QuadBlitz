import { randomUUID } from "crypto";
import { db } from "../db";
import { ensureUsersTable } from "./authService";
import { createMessageNotification } from "./notificationService";

export type MessageUser = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
};

export type DirectMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: MessageUser;
  recipient: MessageUser;
};

type MessageUserRow = {
  id: string;
  name: string;
  handle: string;
  avatar_url?: string | null;
};

type MessageRow = {
  id: string;
  body: string;
  created_at: string | Date;
  sender_id: string;
  sender_name: string;
  sender_handle: string;
  sender_avatar_url?: string | null;
  recipient_id: string;
  recipient_name: string;
  recipient_handle: string;
  recipient_avatar_url?: string | null;
};

export class MessageError extends Error {
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

const mapMessageUser = (row: MessageUserRow): MessageUser => ({
  id: row.id,
  name: row.name,
  handle: row.handle,
  avatarUrl: row.avatar_url ?? null,
});

const mapMessage = (row: MessageRow): DirectMessage => ({
  id: row.id,
  body: row.body,
  createdAt: toIsoString(row.created_at),
  sender: {
    id: row.sender_id,
    name: row.sender_name,
    handle: row.sender_handle,
    avatarUrl: row.sender_avatar_url ?? null,
  },
  recipient: {
    id: row.recipient_id,
    name: row.recipient_name,
    handle: row.recipient_handle,
    avatarUrl: row.recipient_avatar_url ?? null,
  },
});

const ensureMessageTables = async () => {
  await ensureUsersTable();

  await db.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id uuid PRIMARY KEY,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS direct_messages_participants_idx
      ON direct_messages (sender_id, recipient_id, created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS direct_messages_recipient_idx
      ON direct_messages (recipient_id, created_at DESC);
  `);
};

export const getMessageUserByHandle = async (
  handle: string
): Promise<MessageUser> => {
  await ensureUsersTable();
  const normalized = normalizeHandle(handle);
  if (!normalized) {
    throw new MessageError("Handle is required", 400);
  }

  const result = await db.query(
    "SELECT id, name, handle, profile_picture_url AS avatar_url FROM users WHERE handle = $1",
    [normalized]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new MessageError("User not found", 404);
  }

  return mapMessageUser(result.rows[0] as MessageUserRow);
};

export const fetchDirectMessages = async (
  userId: string,
  otherUserId: string
): Promise<DirectMessage[]> => {
  await ensureMessageTables();

  const result = await db.query(
    `SELECT m.id,
            m.body,
            m.created_at,
            sender.id AS sender_id,
            sender.name AS sender_name,
            sender.handle AS sender_handle,
            sender.profile_picture_url AS sender_avatar_url,
            recipient.id AS recipient_id,
            recipient.name AS recipient_name,
            recipient.handle AS recipient_handle,
            recipient.profile_picture_url AS recipient_avatar_url
     FROM direct_messages m
     JOIN users sender ON sender.id = m.sender_id
     JOIN users recipient ON recipient.id = m.recipient_id
     WHERE (m.sender_id = $1 AND m.recipient_id = $2)
        OR (m.sender_id = $2 AND m.recipient_id = $1)
     ORDER BY m.created_at ASC`,
    [userId, otherUserId]
  );

  return (result.rows as MessageRow[]).map(mapMessage);
};

export const sendDirectMessage = async (params: {
  senderId: string;
  recipientId: string;
  body: string;
}): Promise<DirectMessage> => {
  await ensureMessageTables();
  const trimmed = params.body.trim();
  if (!trimmed) {
    throw new MessageError("Message body is required", 400);
  }
  if (trimmed.length > 2000) {
    throw new MessageError("Message is too long", 400);
  }
  if (params.senderId === params.recipientId) {
    throw new MessageError("Cannot message yourself", 400);
  }

  const messageId = randomUUID();

  await db.query(
    `INSERT INTO direct_messages (id, sender_id, recipient_id, body)
     VALUES ($1, $2, $3, $4)`,
    [messageId, params.senderId, params.recipientId, trimmed]
  );

  const result = await db.query(
    `SELECT m.id,
            m.body,
            m.created_at,
            sender.id AS sender_id,
            sender.name AS sender_name,
            sender.handle AS sender_handle,
            sender.profile_picture_url AS sender_avatar_url,
            recipient.id AS recipient_id,
            recipient.name AS recipient_name,
            recipient.handle AS recipient_handle,
            recipient.profile_picture_url AS recipient_avatar_url
     FROM direct_messages m
     JOIN users sender ON sender.id = m.sender_id
     JOIN users recipient ON recipient.id = m.recipient_id
     WHERE m.id = $1`,
    [messageId]
  );

  const message = mapMessage(result.rows[0] as MessageRow);

  await createMessageNotification({
    recipientId: params.recipientId,
    actorId: params.senderId,
    messageId,
    messageBody: trimmed,
  });

  return message;
};

export const updateDirectMessage = async (params: {
  messageId: string;
  userId: string;
  body: string;
}): Promise<DirectMessage> => {
  await ensureMessageTables();
  const trimmed = params.body.trim();
  if (!trimmed) {
    throw new MessageError("Message body is required", 400);
  }
  if (trimmed.length > 2000) {
    throw new MessageError("Message is too long", 400);
  }

  const existing = await db.query(
    `SELECT m.id,
            m.sender_id,
            m.recipient_id,
            m.created_at,
            sender.id AS sender_id,
            sender.name AS sender_name,
            sender.handle AS sender_handle,
            sender.profile_picture_url AS sender_avatar_url,
            recipient.id AS recipient_id,
            recipient.name AS recipient_name,
            recipient.handle AS recipient_handle,
            recipient.profile_picture_url AS recipient_avatar_url
     FROM direct_messages m
     JOIN users sender ON sender.id = m.sender_id
     JOIN users recipient ON recipient.id = m.recipient_id
     WHERE m.id = $1`,
    [params.messageId]
  );

  if ((existing.rowCount ?? 0) === 0) {
    throw new MessageError("Message not found", 404);
  }

  const row = existing.rows[0] as MessageRow;
  if (row.sender_id !== params.userId) {
    throw new MessageError("You can only edit your own messages", 403);
  }

  await db.query(
    `UPDATE direct_messages SET body = $1 WHERE id = $2`,
    [trimmed, params.messageId]
  );

  const updated = await db.query(
    `SELECT m.id,
            m.body,
            m.created_at,
            sender.id AS sender_id,
            sender.name AS sender_name,
            sender.handle AS sender_handle,
            sender.profile_picture_url AS sender_avatar_url,
            recipient.id AS recipient_id,
            recipient.name AS recipient_name,
            recipient.handle AS recipient_handle,
            recipient.profile_picture_url AS recipient_avatar_url
     FROM direct_messages m
     JOIN users sender ON sender.id = m.sender_id
     JOIN users recipient ON recipient.id = m.recipient_id
     WHERE m.id = $1`,
    [params.messageId]
  );

  return mapMessage(updated.rows[0] as MessageRow);
};

export const deleteDirectMessage = async (params: {
  messageId: string;
  userId: string;
}): Promise<void> => {
  await ensureMessageTables();
  const result = await db.query(
    `DELETE FROM direct_messages WHERE id = $1 AND sender_id = $2`,
    [params.messageId, params.userId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new MessageError("Message not found or not yours", 404);
  }
};
