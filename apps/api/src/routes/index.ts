import type { Express } from "express";
import adminRoutes from "./adminRoutes";
import challengeRoutes from "./challengeRoutes";
import chatRoutes from "./chatRoutes";
import authRoutes from "./authRoutes";
import eventsRoutes from "./eventsRoutes";
import feedRoutes from "./feedRoutes";
import friendRoutes from "./friendRoutes";
import leaderboardRoutes from "./leaderboardRoutes";
import messageRoutes from "./messageRoutes";
import mapRoutes from "./mapRoutes";
import notificationRoutes from "./notificationRoutes";
import profileRoutes from "./profileRoutes";
import rankedRoutes from "./rankedRoutes";
import requestsRoutes from "./requestsRoutes";
import pokerRoutes from "./pokerRoutes";
import clubsRoutes from "./clubsRoutes";
import marketplaceRoutes from "./marketplaceRoutes";

export const registerRoutes = (app: Express) => {
  const build =
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    "local";

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", build });
  });

  app.use("/auth", authRoutes);
  app.use("/admin", adminRoutes);
  app.use("/challenge", challengeRoutes);
  app.use("/chat", chatRoutes);
  app.use("/events", eventsRoutes);
  app.use("/feed", feedRoutes);
  app.use("/friends", friendRoutes);
  app.use("/leaderboard", leaderboardRoutes);
  app.use("/messages", messageRoutes);
  app.use("/map", mapRoutes);
  app.use("/marketplace", marketplaceRoutes);
  app.use("/notifications", notificationRoutes);
  app.use("/requests", requestsRoutes);
  app.use("/profile", profileRoutes);
  app.use("/ranked", rankedRoutes);
  app.use("/poker", pokerRoutes);
  app.use("/clubs", clubsRoutes);
};
