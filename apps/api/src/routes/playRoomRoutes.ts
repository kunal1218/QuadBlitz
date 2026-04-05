import { Router } from "express";
import { getPlayRooms } from "../controllers/playRoomController";

const router = Router();

router.get("/", getPlayRooms);

export default router;
