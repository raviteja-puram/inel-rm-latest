import crypto from "crypto";
import db from "../db.js";

const COOKIE_NAME = "inel_rm_session";
const SESSION_DAYS = 7;

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString("hex");
}

function publicUser(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.display_name || row.username,
    role: row.role,
  };
}

export function initializeAuth() {
  const count = db.prepare("SELECT COUNT(*) AS count FROM app_users").get().count;
  if (count) return;
  // Keep the existing demo accounts available while moving credentials off
  // the browser. Deployments can override the initial admin password.
  const defaults = [
    { username: "admin", password: process.env.INEL_ADMIN_PASSWORD || "admin123", role: "admin", name: "Admin" },
    { username: "planner", password: "plan123", role: "planner", name: "Planner" },
    { username: "analyst", password: "view123", role: "analyst", name: "Analyst" },
  ];
  const insert = db.prepare(`INSERT INTO app_users
    (id, username, display_name, role, password_salt, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)`);
  const seed = db.transaction(() => defaults.forEach((user) => {
    const salt = crypto.randomBytes(16).toString("hex");
    insert.run(crypto.randomUUID(), user.username, user.name, user.role, salt, hashPassword(user.password, salt));
  }));
  seed();
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export function authenticate(username, password) {
  const user = db.prepare("SELECT * FROM app_users WHERE username = ?").get(String(username || "").trim().toLowerCase());
  if (!user) return null;
  const actual = Buffer.from(hashPassword(password, user.password_salt), "hex");
  const expected = Buffer.from(user.password_hash, "hex");
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return publicUser(user);
}

export function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  // One row per account means a new login revokes any older session.
  db.prepare(`INSERT INTO app_sessions (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash, expires_at=excluded.expires_at, created_at=datetime('now')`)
    .run(userId, crypto.createHash("sha256").update(token).digest("hex"), expiresAt);
  res.cookie(COOKIE_NAME, token, cookieOptions(SESSION_DAYS * 86400000));
}

function cookieToken(req) {
  const cookies = String(req.headers.cookie || "").split(";");
  const pair = cookies.map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
  return pair ? decodeURIComponent(pair.slice(COOKIE_NAME.length + 1)) : "";
}

export function clearSession(req, res) {
  const token = cookieToken(req);
  if (token) {
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    db.prepare("DELETE FROM app_sessions WHERE token_hash = ?").run(hash);
  }
  res.clearCookie(COOKIE_NAME, cookieOptions(0));
}

export function requireAuth(req, res, next) {
  const token = cookieToken(req);
  if (!token) return res.status(401).json({ error: "Sign in required" });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = db.prepare(`SELECT u.* FROM app_sessions s JOIN app_users u ON u.id=s.user_id
    WHERE s.token_hash=? AND datetime(s.expires_at) > datetime('now')`).get(tokenHash);
  if (!row) return res.status(401).json({ error: "Session expired or replaced by another login" });
  req.user = publicUser(row);
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "Administrator access required" });
  next();
}

export function listUsers() {
  return db.prepare("SELECT * FROM app_users ORDER BY username").all().map(publicUser);
}

export function saveUser({ username, name, role, password }) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(normalized)) throw new Error("Username must be 2–40 letters, numbers, dots, underscores, or hyphens");
  if (!["admin", "planner", "analyst"].includes(role)) throw new Error("Choose a valid role");
  const existing = db.prepare("SELECT * FROM app_users WHERE username = ?").get(normalized);
  if (!existing && String(password || "").length < 8) throw new Error("New user passwords must be at least 8 characters");
  const id = existing?.id || crypto.randomUUID();
  const salt = password ? crypto.randomBytes(16).toString("hex") : existing.password_salt;
  const passwordHash = password ? hashPassword(password, salt) : existing.password_hash;
  db.prepare(`INSERT INTO app_users (id, username, display_name, role, password_salt, password_hash)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET display_name=excluded.display_name, role=excluded.role,
    password_salt=excluded.password_salt, password_hash=excluded.password_hash`)
    .run(id, normalized, String(name || normalized).trim(), role, salt, passwordHash);
  if (password) db.prepare("DELETE FROM app_sessions WHERE user_id = ?").run(id);
  return publicUser(db.prepare("SELECT * FROM app_users WHERE id = ?").get(id));
}

export function deleteUser(username) {
  const user = db.prepare("SELECT * FROM app_users WHERE username = ?").get(String(username || "").trim().toLowerCase());
  if (!user) return;
  if (user.role === "admin" && db.prepare("SELECT COUNT(*) AS count FROM app_users WHERE role='admin'").get().count <= 1) {
    throw new Error("At least one administrator must remain");
  }
  db.prepare("DELETE FROM app_users WHERE id = ?").run(user.id);
}
