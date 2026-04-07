import type { Request, Response } from "express";
import { db } from "../db";

type LeaderboardEntry = {
  id: string;
  name: string;
  handle: string;
  coins: number;
};

const parseLimit = (value: unknown) => {
  const limit = Number(value);
  if (!Number.isFinite(limit)) {
    return 50;
  }
  return Math.min(250, Math.max(1, Math.floor(limit)));
};

const fetchLeaderboardEntries = async (limit: number): Promise<LeaderboardEntry[]> => {
  const result = await db.query(
    `SELECT id, name, handle,
            CASE
              WHEN monthly_coins_month = date_trunc('month', now())::date
                THEN COALESCE(monthly_coins, 0)
              ELSE 0
            END AS coins
       FROM users
      ORDER BY coins DESC, handle ASC
      LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? "Unknown"),
    handle: String(row.handle ?? ""),
    coins: Number(row.coins) || 0,
  }));
};

export const getLeaderboard = async (req: Request, res: Response) => {
  try {
    const entries = await fetchLeaderboardEntries(parseLimit(req.query.limit));
    res.json({ entries });
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Unable to load leaderboard" });
  }
};
