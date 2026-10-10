import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import apiRoutes from "./routes/api.js";
import "./db.js";
import { startDailyRiskEmailJob } from "./utils/emailScheduler.js";
import { initializeAuth } from "./utils/auth.js";
import {
  hydrateSqliteFromPostgres,
  isPostgresPersistenceEnabled,
  queuePostgresSnapshot,
} from "./utils/postgresPersistence.js";

const app = express();
const PORT = process.env.PORT || 3001;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(cors({
  origin(origin, callback) {
    const allowed = !origin || origin === process.env.APP_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin);
    callback(null, allowed);
  },
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use("/api", (req, res, next) => {
  res.on("finish", () => {
    if (
      ["POST", "PUT", "DELETE"].includes(req.method) &&
      res.statusCode < 400
    ) {
      setImmediate(queuePostgresSnapshot);
    }
  });
  next();
});

if (isPostgresPersistenceEnabled()) {
  const hydrated = await hydrateSqliteFromPostgres();
  console.log(
    `Supabase persistence loaded (${hydrated.counts.components} raw materials)`,
  );
}

initializeAuth();

app.use("/api", apiRoutes);
app.use(express.static(path.join(root, "dist")));
app.get("/{*path}", (_req, res) => {
  res.sendFile(path.join(root, "dist", "index.html"));
});
startDailyRiskEmailJob();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`INEL RM running on port ${PORT}`);
});
