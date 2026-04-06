import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import http from "http";
import path from "path";
import { initializeSocketServer } from "./services/socketService";
import { registerRoutes } from "./routes";

dotenv.config();

const app = express();
const httpServer = http.createServer(app);

const normalizeOrigin = (value: string) => value.replace(/\/$/, "");
const defaultAllowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://quadblitz.com",
  "https://www.quadblitz.com",
].map(normalizeOrigin);
const configuredOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((value) => normalizeOrigin(value.trim()))
  .filter(Boolean);
const allowedOriginSet = new Set([...defaultAllowedOrigins, ...configuredOrigins]);
const isAllowedOrigin = (origin?: string) => {
  if (!origin) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  if (allowedOriginSet.has(normalized)) {
    return true;
  }
  if (normalized.endsWith(".vercel.app")) {
    return true;
  }
  if (normalized.startsWith("http://localhost") || normalized.startsWith("http://127.0.0.1")) {
    return true;
  }
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "6mb" }));
app.use(express.static(path.resolve(__dirname, "../public")));
app.use(
  "/uploads",
  express.static(path.resolve(__dirname, "../public/uploads"))
);

registerRoutes(app);

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.path} not found` });
});

const port = process.env.PORT ? Number(process.env.PORT) : 4001;

initializeSocketServer(httpServer);

httpServer.listen(port);
