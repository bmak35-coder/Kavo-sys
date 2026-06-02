import { db, safeDB } from "../db.js";
import { DEFAULT_USERS } from "../../auth/authConstants.js";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Auth Service  ·  IndexedDB-backed
   Sessions still use sessionStorage (intentional —
   sessionStorage clears on tab close = auto logout).
   Replace with JWT/cookie for cloud auth later.
══════════════════════════════════════════════════════ */

const SESSION_KEY = "kavo_session";

// ── Safe sessionStorage helpers ───────────────────────
function ssGet(key) {
  try { const v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function ssSet(key, val) {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function ssDel(key) {
  try { sessionStorage.removeItem(key); } catch {}
}

function isValidSession(s) {
  return s && typeof s === "object" &&
    typeof s.id === "string" &&
    typeof s.role === "string" &&
    ["owner","admin","manager","cashier","kitchen"].includes(s.role);
}

// ── Auth Service ──────────────────────────────────────
export const AuthService = {
  /** Get current session (sync — sessionStorage) */
  getSession() {
    const s = ssGet(SESSION_KEY);
    return isValidSession(s) ? s : null;
  },

  /** Login — verifies against IndexedDB users table */
  async login(username, password) {
    try {
      // Try IDB first
      let users = await safeDB(() => db.users.toArray(), null);

      // Fallback: localStorage or defaults
      if (!Array.isArray(users) || users.length === 0) {
        try {
          const raw = localStorage.getItem("kavo_users");
          users = raw ? JSON.parse(raw) : null;
        } catch {}
        if (!Array.isArray(users) || users.length === 0) {
          users = DEFAULT_USERS;
          // Seed into IDB for next time
          await safeDB(() => db.users.bulkPut(DEFAULT_USERS));
        }
      }

      const found = users.find(u =>
        typeof u.username === "string" &&
        u.username.toLowerCase() === String(username).toLowerCase().trim() &&
        u.password === password
      );
      if (!found) return { success: false, error: "Invalid username or password" };

      const session = {
        id:       found.id,
        username: found.username,
        name:     found.name,
        role:     found.role,
        loginAt:  new Date().toISOString(),
      };
      ssSet(SESSION_KEY, session);
      return { success: true, user: session };
    } catch (err) {
      console.error("[Auth] login error:", err);
      return { success: false, error: "Login error. Please try again." };
    }
  },

  /** Logout — clear session */
  logout() {
    ssDel(SESSION_KEY);
  },

  /** Get all users (admin) */
  async getUsers() {
    let users = await safeDB(() => db.users.toArray(), null);
    if (!Array.isArray(users) || users.length === 0) {
      return DEFAULT_USERS;
    }
    return users;
  },

  /** Create/update a user */
  async saveUser(user) {
    return safeDB(() => db.users.put(user));
  },

  /** Delete a user */
  async deleteUser(id) {
    return safeDB(() => db.users.delete(id));
  },
};
