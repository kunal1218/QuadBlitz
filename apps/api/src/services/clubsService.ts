import { randomUUID } from "crypto";
import { db } from "../db";
import { ensureUsersTable } from "./authService";
import { createClubApplicationNotification } from "./notificationService";

export type ClubJoinPolicy = "open" | "application";
export type ClubApplicationStatus = "pending" | "approved" | "denied";

export type ClubSummary = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  city: string | null;
  isRemote: boolean;
  joinPolicy: ClubJoinPolicy;
  imageUrl: string | null;
  isOfficial: boolean;
  createdAt: string;
  memberCount: number;
  joinedByUser: boolean;
  applicationStatus: ClubApplicationStatus | null;
  creator: {
    id: string;
    name: string;
    handle: string;
  };
};

type ClubRow = {
  id: string;
  title: string;
  description: string;
  category: string;
  location: string;
  city: string | null;
  is_remote?: boolean | null;
  join_policy?: string | null;
  image_url?: string | null;
  is_official?: boolean | null;
  created_at: string | Date;
  creator_id: string;
  creator_name: string;
  creator_handle: string;
  member_count?: number | string | null;
  joined_by_user?: boolean | null;
  application_status?: string | null;
};

export class ClubError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const toIsoString = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const normalizeJoinPolicy = (value?: string | null): ClubJoinPolicy =>
  value === "application" ? "application" : "open";

const ensureClubsTable = async () => {
  await ensureUsersTable();

  await db.query(`
    CREATE TABLE IF NOT EXISTS clubs (
      id uuid PRIMARY KEY,
      creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title text NOT NULL,
      description text NOT NULL,
      category text NOT NULL,
      location text NOT NULL,
      city text,
      is_remote boolean NOT NULL DEFAULT false,
      join_policy text NOT NULL DEFAULT 'open',
      is_official boolean NOT NULL DEFAULT false,
      image_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    ALTER TABLE clubs
    ADD COLUMN IF NOT EXISTS city text,
    ADD COLUMN IF NOT EXISTS is_remote boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS join_policy text NOT NULL DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS is_official boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS image_url text;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS clubs_created_at_idx
      ON clubs (created_at DESC);
  `);
};

const ensureClubMembersTable = async () => {
  await ensureClubsTable();

  await db.query(`
    CREATE TABLE IF NOT EXISTS club_members (
      club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role text NOT NULL DEFAULT 'member',
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (club_id, user_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS club_members_club_idx
      ON club_members (club_id);
  `);
};

const ensureClubApplicationsTable = async () => {
  await ensureClubsTable();

  await db.query(`
    CREATE TABLE IF NOT EXISTS club_applications (
      id uuid PRIMARY KEY,
      club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
      applicant_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status text NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (club_id, applicant_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS club_applications_club_idx
      ON club_applications (club_id);
  `);
};

const mapClub = (row: ClubRow): ClubSummary => ({
  id: row.id,
  title: row.title,
  description: row.description,
  category: row.category,
  location: row.location,
  city: row.city ?? null,
  isRemote: Boolean(row.is_remote),
  joinPolicy: normalizeJoinPolicy(row.join_policy),
  imageUrl: row.image_url ?? null,
  isOfficial: Boolean(row.is_official),
  createdAt: toIsoString(row.created_at),
  memberCount: Number(row.member_count ?? 0) || 0,
  joinedByUser: Boolean(row.joined_by_user),
  applicationStatus: (row.application_status as ClubApplicationStatus) ?? null,
  creator: {
    id: row.creator_id,
    name: row.creator_name,
    handle: row.creator_handle,
  },
});

const fetchClubRow = async (clubId: string) => {
  await ensureClubsTable();
  const result = await db.query(
    `SELECT c.id,
            c.creator_id,
            c.title,
            c.join_policy,
            c.is_official,
            c.image_url,
            u.name AS creator_name,
            u.handle AS creator_handle
     FROM clubs c
     JOIN users u ON u.id = c.creator_id
     WHERE c.id = $1`,
    [clubId]
  );
  return result.rows[0] as
    | {
        id: string;
        creator_id: string;
        title: string;
        join_policy: string;
        is_official: boolean;
        image_url: string | null;
        creator_name: string;
        creator_handle: string;
      }
    | undefined;
};

export const fetchClubs = async (params: {
  viewerId?: string | null;
  limit?: number;
} = {}): Promise<ClubSummary[]> => {
  await ensureClubsTable();
  await ensureClubMembersTable();
  await ensureClubApplicationsTable();

  const viewerId = params.viewerId ?? null;
  const limit = params.limit ?? 50;

  const result = await db.query(
    `SELECT c.id,
            c.title,
            c.description,
            c.category,
            c.location,
            c.city,
            c.is_remote,
            c.join_policy,
            c.is_official,
            c.image_url,
            c.created_at,
            u.id AS creator_id,
            u.name AS creator_name,
            u.handle AS creator_handle,
            COUNT(DISTINCT m.user_id)::int AS member_count,
            BOOL_OR(m.user_id = $1) AS joined_by_user,
            MAX(a.status) FILTER (WHERE a.applicant_id = $1) AS application_status
     FROM clubs c
     JOIN users u ON u.id = c.creator_id
     LEFT JOIN club_members m ON m.club_id = c.id
     LEFT JOIN club_applications a ON a.club_id = c.id AND a.applicant_id = $1
     GROUP BY c.id, u.id
     ORDER BY c.created_at DESC
     LIMIT $2`,
    [viewerId, limit]
  );

  return (result.rows as ClubRow[]).map(mapClub);
};

export const fetchClubById = async (params: {
  clubId: string;
  viewerId?: string | null;
}): Promise<ClubSummary | null> => {
  await ensureClubsTable();
  await ensureClubMembersTable();
  await ensureClubApplicationsTable();

  const viewerId = params.viewerId ?? null;

  const result = await db.query(
    `SELECT c.id,
            c.title,
            c.description,
            c.category,
            c.location,
            c.city,
            c.is_remote,
            c.join_policy,
            c.is_official,
            c.image_url,
            c.created_at,
            u.id AS creator_id,
            u.name AS creator_name,
            u.handle AS creator_handle,
            COUNT(DISTINCT m.user_id)::int AS member_count,
            BOOL_OR(m.user_id = $2) AS joined_by_user,
            MAX(a.status) FILTER (WHERE a.applicant_id = $2) AS application_status
     FROM clubs c
     JOIN users u ON u.id = c.creator_id
     LEFT JOIN club_members m ON m.club_id = c.id
     LEFT JOIN club_applications a ON a.club_id = c.id AND a.applicant_id = $2
     WHERE c.id = $1
     GROUP BY c.id, u.id`,
    [params.clubId, viewerId]
  );

  const row = result.rows[0] as ClubRow | undefined;
  return row ? mapClub(row) : null;
};

export const createClub = async (params: {
  creatorId: string;
  title: string;
  description: string;
  category: string;
  location?: string;
  city?: string | null;
  isRemote?: boolean;
  joinPolicy?: string;
  isOfficial?: boolean;
  imageUrl?: string | null;
}): Promise<ClubSummary> => {
  await ensureClubsTable();
  await ensureClubMembersTable();

  const title = (params.title ?? "").trim();
  const description = (params.description ?? "").trim();
  const category = (params.category ?? "").trim() || "social";
  const city = (params.city ?? "").trim() || null;
  const isRemote = Boolean(params.isRemote);
  const location =
    (params.location ?? params.city ?? "").trim() ||
    (isRemote ? "Remote" : "");
  const joinPolicy = normalizeJoinPolicy(params.joinPolicy);
  const isOfficial = Boolean(params.isOfficial);
  const imageUrl = params.imageUrl?.trim() || null;

  if (!title) {
    throw new ClubError("Club name is required.");
  }
  if (!description) {
    throw new ClubError("Club description is required.");
  }
  if (!isRemote && !city) {
    throw new ClubError("City is required for in-person clubs.");
  }

  const id = randomUUID();
  await db.query(
    `INSERT INTO clubs (
      id, creator_id, title, description, category, location, city, is_remote, join_policy, is_official, image_url
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      params.creatorId,
      title,
      description,
      category,
      location,
      city,
      isRemote,
      joinPolicy,
      isOfficial,
      imageUrl,
    ]
  );

  await db.query(
    `INSERT INTO club_members (club_id, user_id, role)
     VALUES ($1, $2, 'owner')
     ON CONFLICT DO NOTHING`,
    [id, params.creatorId]
  );

  const clubs = await fetchClubs({ viewerId: params.creatorId, limit: 1 });
  const created = clubs.find((club) => club.id === id);
  if (!created) {
    throw new ClubError("Unable to create club.", 500);
  }
  return created;
};

export const joinClub = async (params: {
  clubId: string;
  userId: string;
}): Promise<{ status: "joined" | "pending"; club: ClubSummary }> => {
  await ensureClubsTable();
  await ensureClubMembersTable();
  await ensureClubApplicationsTable();

  const club = await fetchClubRow(params.clubId);
  if (!club) {
    throw new ClubError("Club not found.", 404);
  }

  const joinPolicy = normalizeJoinPolicy(club.join_policy);

  const memberResult = await db.query(
    `SELECT 1 FROM club_members WHERE club_id = $1 AND user_id = $2`,
    [params.clubId, params.userId]
  );

  if (memberResult.rowCount && memberResult.rowCount > 0) {
    const updated = await fetchClubs({ viewerId: params.userId, limit: 1 });
    const summary = updated.find((item) => item.id === params.clubId);
    if (!summary) {
      throw new ClubError("Club not found.", 404);
    }
    return { status: "joined", club: summary };
  }

  if (joinPolicy === "open") {
    await db.query(
      `INSERT INTO club_members (club_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [params.clubId, params.userId]
    );
    const updated = await fetchClubs({ viewerId: params.userId, limit: 1 });
    const summary = updated.find((item) => item.id === params.clubId);
    if (!summary) {
      throw new ClubError("Club not found.", 404);
    }
    return { status: "joined", club: summary };
  }

  const existingAppResult = await db.query(
    `SELECT id, status
     FROM club_applications
     WHERE club_id = $1 AND applicant_id = $2`,
    [params.clubId, params.userId]
  );
  const existingApp = existingAppResult.rows[0] as
    | { id: string; status: string }
    | undefined;

  if (existingApp?.status === "pending") {
    const updated = await fetchClubs({ viewerId: params.userId, limit: 1 });
    const summary = updated.find((item) => item.id === params.clubId);
    if (!summary) {
      throw new ClubError("Club not found.", 404);
    }
    return { status: "pending", club: summary };
  }

  if (existingApp?.status === "approved") {
    await db.query(
      `INSERT INTO club_members (club_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [params.clubId, params.userId]
    );
    const updated = await fetchClubs({ viewerId: params.userId, limit: 1 });
    const summary = updated.find((item) => item.id === params.clubId);
    if (!summary) {
      throw new ClubError("Club not found.", 404);
    }
    return { status: "joined", club: summary };
  }

  const applicationId = existingApp?.id ?? randomUUID();
  if (existingApp) {
    await db.query(
      `UPDATE club_applications
       SET status = 'pending', updated_at = now()
       WHERE id = $1`,
      [applicationId]
    );
  } else {
    await db.query(
      `INSERT INTO club_applications (id, club_id, applicant_id, status)
       VALUES ($1, $2, $3, 'pending')`,
      [applicationId, params.clubId, params.userId]
    );
  }

  await createClubApplicationNotification({
    recipientId: club.creator_id,
    actorId: params.userId,
    clubId: params.clubId,
    clubTitle: club.title,
    applicationId,
  });

  const updated = await fetchClubs({ viewerId: params.userId, limit: 1 });
  const summary = updated.find((item) => item.id === params.clubId);
  if (!summary) {
    throw new ClubError("Club not found.", 404);
  }
  return { status: "pending", club: summary };
};

export const leaveClub = async (params: {
  clubId: string;
  userId: string;
}): Promise<{ club: ClubSummary }> => {
  await ensureClubsTable();
  await ensureClubMembersTable();
  await ensureClubApplicationsTable();

  await db.query(
    `DELETE FROM club_members WHERE club_id = $1 AND user_id = $2`,
    [params.clubId, params.userId]
  );
  await db.query(
    `DELETE FROM club_applications WHERE club_id = $1 AND applicant_id = $2`,
    [params.clubId, params.userId]
  );

  const updated = await fetchClubs({ viewerId: params.userId, limit: 1 });
  const summary = updated.find((item) => item.id === params.clubId);
  if (!summary) {
    throw new ClubError("Club not found.", 404);
  }
  return { club: summary };
};

export const decideClubApplication = async (params: {
  clubId: string;
  applicantId: string;
  ownerId: string;
  decision: "approve" | "deny";
}) => {
  await ensureClubsTable();
  await ensureClubMembersTable();
  await ensureClubApplicationsTable();

  const club = await fetchClubRow(params.clubId);
  if (!club) {
    throw new ClubError("Club not found.", 404);
  }
  if (club.creator_id !== params.ownerId) {
    throw new ClubError("Not authorized to review applications.", 403);
  }

  const appResult = await db.query(
    `SELECT id FROM club_applications
     WHERE club_id = $1 AND applicant_id = $2`,
    [params.clubId, params.applicantId]
  );
  const app = appResult.rows[0] as { id: string } | undefined;
  if (!app) {
    throw new ClubError("Application not found.", 404);
  }

  const status = params.decision === "approve" ? "approved" : "denied";
  await db.query(
    `UPDATE club_applications
     SET status = $1, updated_at = now()
     WHERE id = $2`,
    [status, app.id]
  );

  if (status === "approved") {
    await db.query(
      `INSERT INTO club_members (club_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [params.clubId, params.applicantId]
    );
  }

  return { status };
};
