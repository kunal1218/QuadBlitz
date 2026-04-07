import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import nodemailer from "nodemailer";
import { db } from "../db";
import { getRedis } from "../db/redis";
import type { PoolClient } from "pg";

type UserRow = {
  id: string;
  name: string;
  handle: string;
  email: string;
  password_hash: string;
  profile_picture_url?: string | null;
  college_name?: string | null;
  college_domain?: string | null;
  coins?: number | null;
  banned_until?: string | Date | null;
  banned_indefinitely?: boolean | null;
};

export type AuthUser = {
  id: string;
  name: string;
  handle: string;
  email: string;
  avatarUrl?: string | null;
  collegeName?: string | null;
  collegeDomain?: string | null;
  isAdmin?: boolean;
  coins?: number;
};

export type AuthPayload = {
  user: AuthUser;
  token: string;
};

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const RESET_TOKEN_TTL_MINUTES = 60;
let didBackfillHandles = false;
let cachedAdminEmails: Set<string> | null = null;

const getAdminEmails = () => {
  if (cachedAdminEmails) {
    return cachedAdminEmails;
  }

  const raw = process.env.LOCKEDIN_ADMIN_EMAILS ?? "";
  const emails = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  cachedAdminEmails = new Set(emails);
  return cachedAdminEmails;
};

const isAdminEmail = (email: string) =>
  getAdminEmails().has(email.trim().toLowerCase());

export const ensureUsersTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      name text NOT NULL,
      handle text NOT NULL UNIQUE,
      email text NOT NULL UNIQUE,
      password_hash text NOT NULL,
      profile_picture_url text,
      bio text,
      college_name text,
      college_domain text,
      coins integer NOT NULL DEFAULT 0,
      monthly_coins integer NOT NULL DEFAULT 0,
      monthly_coins_month date NOT NULL DEFAULT (date_trunc('month', now())::date),
      monthly_coins_seeded boolean NOT NULL DEFAULT false,
      banned_until timestamptz,
      banned_indefinitely boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS profile_picture_url text,
    ADD COLUMN IF NOT EXISTS bio text,
    ADD COLUMN IF NOT EXISTS college_name text,
    ADD COLUMN IF NOT EXISTS college_domain text,
    ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monthly_coins integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS monthly_coins_month date NOT NULL DEFAULT (date_trunc('month', now())::date),
    ADD COLUMN IF NOT EXISTS monthly_coins_seeded boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS banned_until timestamptz,
    ADD COLUMN IF NOT EXISTS banned_indefinitely boolean NOT NULL DEFAULT false;
  `);

  await db.query(`
    UPDATE users
    SET monthly_coins = coins,
        monthly_coins_month = date_trunc('month', now())::date,
        monthly_coins_seeded = true
    WHERE monthly_coins_seeded = false
      AND monthly_coins = 0
      AND coins > 0
      AND monthly_coins_month = date_trunc('month', now())::date;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS users_college_domain_idx
      ON users (college_domain);
  `);

  await backfillInvalidHandles();
};

export const ensurePasswordResetTable = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at timestamptz NOT NULL,
      used_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx
      ON password_reset_tokens (user_id);
  `);

  await db.query(`
    DELETE FROM password_reset_tokens
     WHERE expires_at < now() - interval '30 days';
  `);
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const toCollegeName = (slug: string) => {
  const cleaned = slug.replace(/[-_]+/g, " ").trim();
  if (!cleaned) {
    return "";
  }

  const compact = cleaned.replace(/\s+/g, "");
  if (compact.length <= 4) {
    return compact.toUpperCase();
  }

  return cleaned
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export const deriveCollegeFromEmail = (email: string) => {
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const parts = domain.split(".").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }

  const tld = parts[parts.length - 1];
  const secondLevel = parts[parts.length - 2];
  let collegeDomain = "";
  let slug = "";

  if (tld === "edu" && parts.length >= 2) {
    slug = parts[parts.length - 2];
    collegeDomain = parts.slice(-2).join(".");
  } else if (secondLevel === "edu" && tld.length === 2 && parts.length >= 3) {
    slug = parts[parts.length - 3];
    collegeDomain = parts.slice(-3).join(".");
  } else if (secondLevel === "ac" && tld.length === 2 && parts.length >= 3) {
    slug = parts[parts.length - 3];
    collegeDomain = parts.slice(-3).join(".");
  } else {
    return null;
  }

  const name = toCollegeName(slug);
  if (!name || !collegeDomain) {
    return null;
  }

  return { name, domain: collegeDomain };
};

const normalizeHandle = (handle: string) => {
  const cleaned = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!cleaned) {
    return "";
  }
  return `@${cleaned}`;
};

const isHandleAvailable = async (handle: string, userId: string) => {
  const result = await db.query(
    "SELECT 1 FROM users WHERE handle = $1 AND id <> $2",
    [handle, userId]
  );
  return (result.rowCount ?? 0) === 0;
};

const isUserBanned = (row: Pick<UserRow, "banned_until" | "banned_indefinitely">) => {
  if (row.banned_indefinitely) {
    return true;
  }
  if (!row.banned_until) {
    return false;
  }
  return new Date(row.banned_until).getTime() > Date.now();
};

const assertNotBanned = (row: Pick<UserRow, "banned_until" | "banned_indefinitely">) => {
  if (!isUserBanned(row)) {
    return;
  }
  if (row.banned_indefinitely) {
    throw new AuthError("Account is banned.", 403);
  }
  const bannedUntil = row.banned_until;
  if (!bannedUntil) {
    throw new AuthError("Account is banned.", 403);
  }
  const until =
    bannedUntil instanceof Date
      ? bannedUntil.toISOString()
      : new Date(bannedUntil).toISOString();
  throw new AuthError(`Account is banned until ${until}`, 403);
};

const mapUser = (
  row: Pick<
    UserRow,
    | "id"
    | "name"
    | "handle"
    | "email"
    | "profile_picture_url"
    | "college_name"
    | "college_domain"
    | "coins"
  >
) => ({
  id: row.id,
  name: row.name,
  handle: row.handle,
  email: row.email,
  avatarUrl: row.profile_picture_url ?? null,
  collegeName: row.college_name ?? null,
  collegeDomain: row.college_domain ?? null,
  isAdmin: isAdminEmail(row.email),
  coins: row.coins ?? 0,
});

const handleExists = async (handle: string) => {
  const result = await db.query("SELECT 1 FROM users WHERE handle = $1", [
    handle,
  ]);
  return (result.rowCount ?? 0) > 0;
};

const generateHandle = async (name: string) => {
  const base = normalizeHandle(name) || "@user";
  if (!(await handleExists(base))) {
    return base;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const suffix = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${base}${suffix}`;
    if (!(await handleExists(candidate))) {
      return candidate;
    }
  }

  return `${base}${randomUUID().slice(0, 6)}`;
};

const backfillInvalidHandles = async () => {
  if (didBackfillHandles) {
    return;
  }

  const result = await db.query(
    `SELECT id, name, handle
     FROM users
     WHERE handle IS NULL
        OR BTRIM(handle) = ''
        OR handle !~ '^@[a-z0-9_]+$'`
  );

  for (const row of result.rows as Array<{
    id: string;
    name: string;
    handle?: string | null;
  }>) {
    const normalized = normalizeHandle(row.handle ?? "");
    let candidate = "";

    if (normalized && (await isHandleAvailable(normalized, row.id))) {
      candidate = normalized;
    } else {
      candidate = await generateHandle(row.name || "user");
    }

    if (candidate) {
      await db.query("UPDATE users SET handle = $2 WHERE id = $1", [
        row.id,
        candidate,
      ]);
    }
  }

  didBackfillHandles = true;
};

const createSession = async (userId: string) => {
  const redis = await getRedis();
  if (!redis) {
    throw new AuthError("REDIS_URL is not configured", 500);
  }

  const token = randomUUID();
  await redis.set(`session:${token}`, JSON.stringify({ userId }), {
    EX: SESSION_TTL_SECONDS,
  });
  return token;
};

const insertResetToken = async (client: PoolClient, userId: string) => {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

  await client.query(
    `INSERT INTO password_reset_tokens (token, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [token, userId, expiresAt]
  );

  return { token, expiresAt };
};

const sendPasswordResetEmail = async (params: {
  to: string;
  name?: string | null;
  resetLink: string;
}) => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.PASSWORD_RESET_FROM ?? user ?? "no-reply@lockedin.app";

  if (!host || !user || !pass) {
    console.info(
      `[auth] Password reset email for ${params.to}: ${params.resetLink} (SMTP not configured; link logged only)`
    );
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const previewName = params.name ? `Hi ${params.name},` : "Hi there,";

    await transporter.sendMail({
      from,
      to: params.to,
      subject: "Reset your QuadBlitz password",
      text: `${previewName}\n\nUse this link to reset your password: ${params.resetLink}\n\nThe link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.`,
      html: `
        <p>${previewName}</p>
        <p>Use this link to reset your password:</p>
        <p><a href="${params.resetLink}">${params.resetLink}</a></p>
        <p>This link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.</p>
      `,
    });
  } catch (error) {
    console.error("Failed to send password reset email", error);
  }
};

export const requestPasswordReset = async (email: string) => {
  await ensureUsersTable();
  await ensurePasswordResetTable();

  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new AuthError("Email is required", 400);
  }

  const userResult = await db.query(
    `SELECT id, email, name FROM users WHERE email = $1`,
    [normalized]
  );

  if ((userResult.rowCount ?? 0) === 0) {
    // Always respond the same way to avoid leaking which emails exist.
    return { token: null, email: normalized };
  }

  const user = userResult.rows[0] as { id: string; email: string; name: string };

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM password_reset_tokens
        WHERE user_id = $1 AND (used_at IS NOT NULL OR expires_at < now())`,
      [user.id]
    );

    const { token, expiresAt } = await insertResetToken(client, user.id);
    await client.query("COMMIT");

    const baseUrl =
      process.env.PASSWORD_RESET_URL ?? "http://localhost:3000/reset-password";
    const resetLink = `${baseUrl}?token=${token}`;

    await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetLink,
    });

    return { token, email: user.email, name: user.name, expiresAt };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const resetPasswordWithToken = async (params: {
  token: string;
  password: string;
}) => {
  await ensureUsersTable();
  await ensurePasswordResetTable();

  const token = params.token.trim();
  const password = params.password.trim();

  if (!token) {
    throw new AuthError("Reset token is required", 400);
  }
  if (password.length < 8) {
    throw new AuthError("Password must be at least 8 characters", 400);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `SELECT user_id, expires_at, used_at
         FROM password_reset_tokens
        WHERE token = $1
        LIMIT 1`,
      [token]
    );

    if ((tokenResult.rowCount ?? 0) === 0) {
      throw new AuthError("Invalid or expired reset link", 400);
    }

    const { user_id: userId, expires_at: expiresAt, used_at: usedAt } =
      tokenResult.rows[0] as { user_id: string; expires_at: Date; used_at?: Date | null };

    if (usedAt) {
      throw new AuthError("This reset link has already been used", 400);
    }
    if (new Date(expiresAt).getTime() < Date.now()) {
      throw new AuthError("This reset link has expired", 400);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await client.query(
      `UPDATE users SET password_hash = $2 WHERE id = $1`,
      [userId, passwordHash]
    );

    await client.query(
      `UPDATE password_reset_tokens
          SET used_at = now()
        WHERE token = $1`,
      [token]
    );

    await client.query(
      `DELETE FROM password_reset_tokens
        WHERE user_id = $1 AND token <> $2`,
      [userId, token]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const signUpUser = async (params: {
  name: string;
  email: string;
  password: string;
  handle?: string;
}): Promise<AuthPayload> => {
  await ensureUsersTable();

  const name = params.name.trim();
  const email = normalizeEmail(params.email);

  if (!name) {
    throw new AuthError("Name is required", 400);
  }
  if (!email) {
    throw new AuthError("Email is required", 400);
  }
  if (params.password.length < 8) {
    throw new AuthError("Password must be at least 8 characters", 400);
  }

  const existing = await db.query("SELECT 1 FROM users WHERE email = $1", [
    email,
  ]);
  if ((existing.rowCount ?? 0) > 0) {
    throw new AuthError("Email is already in use", 409);
  }

  let handle = params.handle ? normalizeHandle(params.handle) : "";
  if (handle) {
    if (await handleExists(handle)) {
      throw new AuthError("Handle is already taken", 409);
    }
  } else {
    handle = await generateHandle(name);
  }

  const passwordHash = await bcrypt.hash(params.password, 10);
  const userId = randomUUID();
  const college = deriveCollegeFromEmail(email);

  const result = await db.query(
    `INSERT INTO users (id, name, handle, email, password_hash, college_name, college_domain)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, name, handle, email, profile_picture_url, college_name, college_domain, coins`,
    [
      userId,
      name,
      handle,
      email,
      passwordHash,
      college?.name ?? null,
      college?.domain ?? null,
    ]
  );

  const user = mapUser(result.rows[0]);
  const token = await createSession(user.id);

  return { user, token };
};

export const signInUser = async (params: {
  email: string;
  password: string;
}): Promise<AuthPayload> => {
  await ensureUsersTable();

  const email = normalizeEmail(params.email);

  if (!email || !params.password) {
    throw new AuthError("Email and password are required", 400);
  }

  const result = await db.query(
    "SELECT id, name, handle, email, password_hash, profile_picture_url, college_name, college_domain, coins, banned_until, banned_indefinitely FROM users WHERE email = $1",
    [email]
  );
  const row = result.rows[0] as UserRow | undefined;

  if (!row) {
    throw new AuthError("Invalid email or password", 401);
  }

  const matches = await bcrypt.compare(params.password, row.password_hash);
  if (!matches) {
    throw new AuthError("Invalid email or password", 401);
  }

  assertNotBanned(row);

  if (!row.college_domain || !row.college_name) {
    const college = deriveCollegeFromEmail(row.email);
    if (college) {
      const refreshed = await db.query(
        `UPDATE users
         SET college_name = $2, college_domain = $3
         WHERE id = $1
         RETURNING id, name, handle, email, profile_picture_url, college_name, college_domain, coins, banned_until, banned_indefinitely`,
        [row.id, college.name, college.domain]
      );
      const updated = refreshed.rows[0] as UserRow | undefined;
      if (updated) {
        row.college_name = updated.college_name ?? null;
        row.college_domain = updated.college_domain ?? null;
      }
    }
  }

  const user = mapUser(row);
  const token = await createSession(user.id);

  return { user, token };
};

export const getUserFromToken = async (
  token: string
): Promise<AuthUser | null> => {
  await ensureUsersTable();
  const redis = await getRedis();
  if (!redis) {
    throw new AuthError("REDIS_URL is not configured", 500);
  }

  const session = await redis.get(`session:${token}`);
  if (!session) {
    return null;
  }

  const { userId } = JSON.parse(session) as { userId: string };
  const result = await db.query(
    "SELECT id, name, handle, email, profile_picture_url, college_name, college_domain, coins, banned_until, banned_indefinitely FROM users WHERE id = $1",
    [userId]
  );
  const row = result.rows[0] as UserRow | undefined;
  if (!row) {
    return null;
  }

  assertNotBanned(row);

  if (!row.college_domain || !row.college_name) {
    const college = deriveCollegeFromEmail(row.email);
    if (college) {
      const refreshed = await db.query(
        `UPDATE users
         SET college_name = $2, college_domain = $3
         WHERE id = $1
         RETURNING id, name, handle, email, profile_picture_url, college_name, college_domain, coins, banned_until, banned_indefinitely`,
        [row.id, college.name, college.domain]
      );
      const updated = refreshed.rows[0] as UserRow | undefined;
      if (updated) {
        row.college_name = updated.college_name ?? null;
        row.college_domain = updated.college_domain ?? null;
      }
    }
  }

  return mapUser(row);
};
