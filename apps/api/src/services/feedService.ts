import { randomUUID } from "crypto";
import type {
  FeedComment,
  FeedPost,
  FeedPostType,
  PollOption,
} from "@lockedin/shared";
import { db } from "../db";
import { deriveCollegeFromEmail, ensureUsersTable } from "./authService";

type FeedSort = "fresh" | "top";

type FeedPostRow = {
  id: string;
  author_id: string;
  author_name: string;
  author_handle: string;
  author_avatar_url?: string | null;
  author_college_name?: string | null;
  author_college_domain?: string | null;
  type: FeedPostType;
  content: string;
  created_at: string | Date;
  tags: string[] | null;
  like_count: number | string;
  comment_count?: number | string | null;
  liked_by_user?: boolean;
};

type PollOptionRow = {
  id: string;
  post_id: string;
  label: string;
  votes: number | string;
  position: number;
};

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  author_name: string;
  author_handle: string;
  author_avatar_url?: string | null;
  content: string;
  created_at: string | Date;
  like_count?: number | string | null;
  liked_by_user?: boolean | null;
};

export class FeedError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const ensureFeedTables = async () => {
  await ensureUsersTable();
  await db.query(`
    CREATE TABLE IF NOT EXISTS feed_posts (
      id uuid PRIMARY KEY,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type text NOT NULL,
      content text NOT NULL,
      tags text[] NOT NULL DEFAULT ARRAY[]::text[],
      like_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feed_poll_options (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      label text NOT NULL,
      votes integer NOT NULL DEFAULT 0,
      position integer NOT NULL
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feed_poll_votes (
      post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      option_id uuid NOT NULL REFERENCES feed_poll_options(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, user_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feed_post_likes (
      post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, user_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feed_comments (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES feed_posts(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS feed_comment_likes (
      comment_id uuid NOT NULL REFERENCES feed_comments(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (comment_id, user_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS feed_posts_created_at_idx
      ON feed_posts (created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS feed_posts_like_count_idx
      ON feed_posts (like_count DESC);
  `);
};

const normalizeTags = (tags: string[]) => {
  const cleaned = tags
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean);

  return Array.from(new Set(cleaned)).slice(0, 10);
};

const toIsoString = (value: string | Date) =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapPollOptions = (rows: PollOptionRow[]): Map<string, PollOption[]> => {
  const map = new Map<string, PollOption[]>();
  rows.forEach((row) => {
    const list = map.get(row.post_id) ?? [];
    list.push({
      id: row.id,
      label: row.label,
      votes: Number(row.votes ?? 0),
    });
    map.set(row.post_id, list);
  });
  return map;
};

const mapPost = (
  row: FeedPostRow,
  pollOptionsByPostId: Map<string, PollOption[]>
): FeedPost => ({
  id: row.id,
  author: {
    id: row.author_id,
    name: row.author_name,
    handle: row.author_handle,
    avatarUrl: row.author_avatar_url ?? undefined,
    collegeName: row.author_college_name ?? undefined,
    collegeDomain: row.author_college_domain ?? undefined,
  },
  type: row.type,
  content: row.content,
  createdAt: toIsoString(row.created_at),
  tags: row.tags && row.tags.length > 0 ? row.tags : undefined,
  pollOptions: pollOptionsByPostId.get(row.id),
  likeCount: Number(row.like_count ?? 0),
  likedByUser: Boolean(row.liked_by_user),
  commentCount: Number(row.comment_count ?? 0),
});

const mapComment = (row: CommentRow): FeedComment => ({
  id: row.id,
  postId: row.post_id,
  author: {
    id: row.author_id,
    name: row.author_name,
    handle: row.author_handle,
    avatarUrl: row.author_avatar_url ?? undefined,
  },
  content: row.content,
  createdAt: toIsoString(row.created_at),
  likeCount: Number(row.like_count ?? 0),
  likedByUser: Boolean(row.liked_by_user),
});

const fetchPollOptionsForPosts = async (postIds: string[]) => {
  if (postIds.length === 0) {
    return new Map<string, PollOption[]>();
  }

  const result = await db.query(
    `SELECT id, post_id, label, votes, position
     FROM feed_poll_options
     WHERE post_id = ANY($1::uuid[])
     ORDER BY post_id, position`,
    [postIds]
  );

  return mapPollOptions(result.rows as PollOptionRow[]);
};

const insertPollOptions = async (postId: string, options: string[]) => {
  if (options.length === 0) {
    return;
  }

  const values: string[] = [];
  const params: Array<string | number> = [];

  options.forEach((label, index) => {
    const id = randomUUID();
    const position = index;
    params.push(id, postId, label, position);
    const start = params.length - 3;
    values.push(
      `($${start}, $${start + 1}, $${start + 2}, $${start + 3})`
    );
  });

  await db.query(
    `INSERT INTO feed_poll_options (id, post_id, label, position)
     VALUES ${values.join(", ")}`,
    params
  );
};

export const fetchFeed = async (params: {
  sort?: FeedSort;
  viewerId?: string | null;
} = {}): Promise<FeedPost[]> => {
  await ensureFeedTables();

  const sort = params.sort ?? "fresh";
  const orderBy =
    sort === "top"
      ? "posts.like_count DESC, posts.created_at DESC"
      : "posts.created_at DESC";

  const result = await db.query(
    `SELECT posts.id,
            posts.author_id,
            posts.type,
            posts.content,
            posts.created_at,
            posts.tags,
            posts.like_count,
            COALESCE(comments.comment_count, 0) AS comment_count,
            users.name AS author_name,
            users.handle AS author_handle,
            users.profile_picture_url AS author_avatar_url,
            users.college_name AS author_college_name,
            users.college_domain AS author_college_domain,
            (likes.user_id IS NOT NULL) AS liked_by_user
     FROM feed_posts posts
     JOIN users ON users.id = posts.author_id
     LEFT JOIN (
       SELECT post_id, COUNT(*) AS comment_count
       FROM feed_comments
       GROUP BY post_id
     ) comments ON comments.post_id = posts.id
     LEFT JOIN feed_post_likes likes
       ON likes.post_id = posts.id AND likes.user_id = $1
     ORDER BY ${orderBy}`,
    [params.viewerId ?? null]
  );

  const rows = result.rows as FeedPostRow[];
  const pollIds = rows.filter((row) => row.type === "poll").map((row) => row.id);
  const pollOptionsByPostId = await fetchPollOptionsForPosts(pollIds);

  return rows.map((row) => mapPost(row, pollOptionsByPostId));
};

export const fetchPostById = async (
  postId: string,
  viewerId?: string | null
): Promise<FeedPost | null> => {
  await ensureFeedTables();

  const result = await db.query(
    `SELECT posts.id,
            posts.author_id,
            posts.type,
            posts.content,
            posts.created_at,
            posts.tags,
            posts.like_count,
            COALESCE(comments.comment_count, 0) AS comment_count,
            users.name AS author_name,
            users.handle AS author_handle,
            users.profile_picture_url AS author_avatar_url,
            users.college_name AS author_college_name,
            users.college_domain AS author_college_domain,
            (likes.user_id IS NOT NULL) AS liked_by_user
     FROM feed_posts posts
     JOIN users ON users.id = posts.author_id
     LEFT JOIN (
       SELECT post_id, COUNT(*) AS comment_count
       FROM feed_comments
       GROUP BY post_id
     ) comments ON comments.post_id = posts.id
     LEFT JOIN feed_post_likes likes
       ON likes.post_id = posts.id AND likes.user_id = $2
     WHERE posts.id = $1`,
    [postId, viewerId ?? null]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  const row = result.rows[0] as FeedPostRow;
  const pollOptionsByPostId = await fetchPollOptionsForPosts([postId]);

  return mapPost(row, pollOptionsByPostId);
};

export const voteOnPollOption = async (params: {
  postId: string;
  optionId: string;
  userId: string;
}): Promise<PollOption[]> => {
  await ensureFeedTables();
  const { postId, optionId, userId } = params;

  const postResult = await db.query(
    `SELECT id, type FROM feed_posts WHERE id = $1 LIMIT 1`,
    [postId]
  );
  if ((postResult.rowCount ?? 0) === 0) {
    throw new FeedError("Post not found", 404);
  }
  const post = postResult.rows[0] as { id: string; type: FeedPostType };
  if (post.type !== "poll") {
    throw new FeedError("Not a poll", 400);
  }

  const optionResult = await db.query(
    `SELECT id FROM feed_poll_options WHERE id = $1 AND post_id = $2`,
    [optionId, postId]
  );
  if ((optionResult.rowCount ?? 0) === 0) {
    throw new FeedError("Poll option not found", 404);
  }

  await db.query("BEGIN");
  try {
    const existing = await db.query(
      `SELECT option_id FROM feed_poll_votes WHERE post_id = $1 AND user_id = $2`,
      [postId, userId]
    );

    if ((existing.rowCount ?? 0) > 0) {
      const prevOption = (existing.rows[0] as { option_id: string }).option_id;
      if (prevOption === optionId) {
        const options = await fetchPollOptionsForPosts([postId]);
        await db.query("COMMIT");
        return options.get(postId) ?? [];
      }
      await db.query(
        `UPDATE feed_poll_options SET votes = votes - 1 WHERE id = $1`,
        [prevOption]
      );
      await db.query(
        `DELETE FROM feed_poll_votes WHERE post_id = $1 AND user_id = $2`,
        [postId, userId]
      );
    }

    await db.query(
      `INSERT INTO feed_poll_votes (post_id, option_id, user_id)
       VALUES ($1, $2, $3)`,
      [postId, optionId, userId]
    );
    await db.query(
      `UPDATE feed_poll_options SET votes = votes + 1 WHERE id = $1`,
      [optionId]
    );

    const options = await fetchPollOptionsForPosts([postId]);
    await db.query("COMMIT");
    return options.get(postId) ?? [];
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
};

export const createPost = async (params: {
  userId: string;
  type: FeedPostType;
  content: string;
  tags?: string[];
  pollOptions?: string[];
}): Promise<FeedPost> => {
  await ensureFeedTables();

  const authorResult = await db.query(
    "SELECT email, college_name, college_domain FROM users WHERE id = $1",
    [params.userId]
  );
  const authorRow = authorResult.rows[0] as
    | { email: string; college_name?: string | null; college_domain?: string | null }
    | undefined;

  if (
    authorRow &&
    (!authorRow.college_name || !authorRow.college_domain)
  ) {
    const college = deriveCollegeFromEmail(authorRow.email);
    if (college) {
      await db.query(
        "UPDATE users SET college_name = $2, college_domain = $3 WHERE id = $1",
        [params.userId, college.name, college.domain]
      );
    }
  }

  const postId = randomUUID();
  const tags = normalizeTags(params.tags ?? []);

  if (params.type === "poll" && (params.pollOptions ?? []).length < 2) {
    throw new FeedError("Polls need at least two options", 400);
  }

  await db.query(
    `INSERT INTO feed_posts (id, author_id, type, content, tags)
     VALUES ($1, $2, $3, $4, $5)`,
    [postId, params.userId, params.type, params.content, tags]
  );

  if (params.type === "poll") {
    await insertPollOptions(postId, params.pollOptions ?? []);
  }

  const post = await fetchPostById(postId, params.userId);
  if (!post) {
    throw new FeedError("Unable to create post", 500);
  }

  return post;
};

export const updatePost = async (params: {
  userId: string;
  postId: string;
  content: string;
  tags?: string[];
  pollOptions?: string[];
}): Promise<FeedPost> => {
  await ensureFeedTables();

  const current = await db.query(
    "SELECT author_id, type, tags FROM feed_posts WHERE id = $1",
    [params.postId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new FeedError("Post not found", 404);
  }

  const {
    author_id: authorId,
    type,
    tags: existingTags,
  } = current.rows[0] as {
    author_id: string;
    type: FeedPostType;
    tags: string[] | null;
  };

  if (authorId !== params.userId) {
    throw new FeedError("You can only edit your own posts", 403);
  }

  const tags = normalizeTags(
    params.tags ?? (existingTags ?? [])
  );

  await db.query(
    `UPDATE feed_posts
     SET content = $2,
         tags = $3,
         updated_at = now()
     WHERE id = $1`,
    [params.postId, params.content, tags]
  );

  if (type === "poll" && params.pollOptions) {
    if (params.pollOptions.length < 2) {
      throw new FeedError("Polls need at least two options", 400);
    }

    await db.query("DELETE FROM feed_poll_options WHERE post_id = $1", [
      params.postId,
    ]);
    await insertPollOptions(params.postId, params.pollOptions);
  }

  const post = await fetchPostById(params.postId, params.userId);
  if (!post) {
    throw new FeedError("Post not found", 404);
  }

  return post;
};

export const deletePost = async (params: {
  userId: string;
  postId: string;
  isAdmin?: boolean;
}) => {
  await ensureFeedTables();

  const current = await db.query(
    "SELECT author_id FROM feed_posts WHERE id = $1",
    [params.postId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new FeedError("Post not found", 404);
  }

  const { author_id: authorId } = current.rows[0] as { author_id: string };
  if (authorId !== params.userId && !params.isAdmin) {
    throw new FeedError("You can only delete your own posts", 403);
  }

  await db.query("DELETE FROM feed_posts WHERE id = $1", [params.postId]);
};

export const toggleLike = async (params: {
  userId: string;
  postId: string;
}): Promise<{ likeCount: number; liked: boolean }> => {
  await ensureFeedTables();

  const postExists = await db.query("SELECT 1 FROM feed_posts WHERE id = $1", [
    params.postId,
  ]);
  if ((postExists.rowCount ?? 0) === 0) {
    throw new FeedError("Post not found", 404);
  }

  const existing = await db.query(
    "SELECT 1 FROM feed_post_likes WHERE post_id = $1 AND user_id = $2",
    [params.postId, params.userId]
  );

  if ((existing.rowCount ?? 0) > 0) {
    await db.query(
      "DELETE FROM feed_post_likes WHERE post_id = $1 AND user_id = $2",
      [params.postId, params.userId]
    );
    const updated = await db.query(
      "UPDATE feed_posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = $1 RETURNING like_count",
      [params.postId]
    );
    return {
      likeCount: Number(updated.rows[0]?.like_count ?? 0),
      liked: false,
    };
  }

  await db.query(
    "INSERT INTO feed_post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [params.postId, params.userId]
  );
  const updated = await db.query(
    "UPDATE feed_posts SET like_count = like_count + 1 WHERE id = $1 RETURNING like_count",
    [params.postId]
  );
  return {
    likeCount: Number(updated.rows[0]?.like_count ?? 0),
    liked: true,
  };
};

export const toggleCommentLike = async (params: {
  userId: string;
  commentId: string;
}): Promise<{ likeCount: number; liked: boolean }> => {
  await ensureFeedTables();

  const commentExists = await db.query(
    "SELECT 1 FROM feed_comments WHERE id = $1",
    [params.commentId]
  );
  if ((commentExists.rowCount ?? 0) === 0) {
    throw new FeedError("Comment not found", 404);
  }

  const existing = await db.query(
    "SELECT 1 FROM feed_comment_likes WHERE comment_id = $1 AND user_id = $2",
    [params.commentId, params.userId]
  );

  if ((existing.rowCount ?? 0) > 0) {
    await db.query(
      "DELETE FROM feed_comment_likes WHERE comment_id = $1 AND user_id = $2",
      [params.commentId, params.userId]
    );
    const countResult = await db.query(
      "SELECT COUNT(*) FROM feed_comment_likes WHERE comment_id = $1",
      [params.commentId]
    );
    return {
      likeCount: Number(countResult.rows[0]?.count ?? 0),
      liked: false,
    };
  }

  await db.query(
    "INSERT INTO feed_comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [params.commentId, params.userId]
  );
  const countResult = await db.query(
    "SELECT COUNT(*) FROM feed_comment_likes WHERE comment_id = $1",
    [params.commentId]
  );
  return {
    likeCount: Number(countResult.rows[0]?.count ?? 0),
    liked: true,
  };
};

const fetchCommentById = async (
  commentId: string,
  viewerId?: string | null
): Promise<FeedComment | null> => {
  const result = await db.query(
    `SELECT comments.id,
            comments.post_id,
            comments.author_id,
            comments.content,
            comments.created_at,
            users.name AS author_name,
            users.handle AS author_handle,
            users.profile_picture_url AS author_avatar_url,
            COALESCE(like_counts.count, 0) AS like_count,
            (user_likes.user_id IS NOT NULL) AS liked_by_user
     FROM feed_comments comments
     JOIN users ON users.id = comments.author_id
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::int AS count
       FROM feed_comment_likes
       GROUP BY comment_id
     ) like_counts ON like_counts.comment_id = comments.id
     LEFT JOIN feed_comment_likes user_likes
       ON user_likes.comment_id = comments.id AND user_likes.user_id = $2
     WHERE comments.id = $1`,
    [commentId, viewerId ?? null]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  return mapComment(result.rows[0] as CommentRow);
};

export const fetchComments = async (
  postId: string,
  viewerId?: string | null
): Promise<FeedComment[]> => {
  await ensureFeedTables();

  const result = await db.query(
    `SELECT comments.id,
            comments.post_id,
            comments.author_id,
            comments.content,
            comments.created_at,
            users.name AS author_name,
            users.handle AS author_handle,
            users.profile_picture_url AS author_avatar_url,
            COALESCE(like_counts.count, 0) AS like_count,
            (user_likes.user_id IS NOT NULL) AS liked_by_user
     FROM feed_comments comments
     JOIN users ON users.id = comments.author_id
     LEFT JOIN (
       SELECT comment_id, COUNT(*)::int AS count
       FROM feed_comment_likes
       GROUP BY comment_id
     ) like_counts ON like_counts.comment_id = comments.id
     LEFT JOIN feed_comment_likes user_likes
       ON user_likes.comment_id = comments.id AND user_likes.user_id = $2
     WHERE comments.post_id = $1
     ORDER BY comments.created_at DESC`,
    [postId, viewerId ?? null]
  );

  return (result.rows as CommentRow[]).map(mapComment);
};

export const addComment = async (params: {
  userId: string;
  postId: string;
  content: string;
}): Promise<FeedComment> => {
  await ensureFeedTables();

  const postExists = await db.query("SELECT 1 FROM feed_posts WHERE id = $1", [
    params.postId,
  ]);
  if ((postExists.rowCount ?? 0) === 0) {
    throw new FeedError("Post not found", 404);
  }

  const commentId = randomUUID();
  await db.query(
    `INSERT INTO feed_comments (id, post_id, author_id, content)
     VALUES ($1, $2, $3, $4)`,
    [commentId, params.postId, params.userId, params.content]
  );

  const comment = await fetchCommentById(commentId, params.userId);
  if (!comment) {
    throw new FeedError("Unable to save comment", 500);
  }

  return comment;
};

export const updateComment = async (params: {
  userId: string;
  commentId: string;
  content: string;
}): Promise<FeedComment> => {
  await ensureFeedTables();

  const current = await db.query(
    "SELECT author_id FROM feed_comments WHERE id = $1",
    [params.commentId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new FeedError("Comment not found", 404);
  }

  const { author_id: authorId } = current.rows[0] as { author_id: string };
  if (authorId !== params.userId) {
    throw new FeedError("You can only edit your own comments", 403);
  }

  await db.query(
    "UPDATE feed_comments SET content = $2 WHERE id = $1",
    [params.commentId, params.content]
  );

  const comment = await fetchCommentById(params.commentId, params.userId);
  if (!comment) {
    throw new FeedError("Unable to update comment", 500);
  }

  return comment;
};

export const deleteComment = async (params: {
  userId: string;
  commentId: string;
}): Promise<void> => {
  await ensureFeedTables();

  const current = await db.query(
    "SELECT author_id FROM feed_comments WHERE id = $1",
    [params.commentId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new FeedError("Comment not found", 404);
  }

  const { author_id: authorId } = current.rows[0] as { author_id: string };
  if (authorId !== params.userId) {
    throw new FeedError("You can only delete your own comments", 403);
  }

  await db.query("DELETE FROM feed_comments WHERE id = $1", [
    params.commentId,
  ]);
};
