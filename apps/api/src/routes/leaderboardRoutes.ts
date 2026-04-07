import { Router } from "express";
import { getLeaderboard } from "../controllers/leaderboardController";

const router = Router();

router.get("/", getLeaderboard);
router.get("/public", getLeaderboard);

export default router;
