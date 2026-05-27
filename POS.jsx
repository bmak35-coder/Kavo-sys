import { createContext, useContext, useState, useEffect } from "react";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Auth Layer  ·  v2
   All storage through AuthStorage — swap for API later.
══════════════════════════════════════════════════════ */

const USERS_KEY   = "kavo_users";
const SESSION_KEY = "kavo_session";

// ── Safe JSON helpers ────────────────────────────────
function safeRead(store, key) {
  try {
    const raw = store.getItem(key);
    if (raw === null || raw === undefined || raw === "") return null;
    const parsed = JSON.parse(raw);
    if (parsed === null || parsed === undefined) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function safeWrite(store, key, value) {
  try { store.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function safeRemove(store, key) {
  try { store.removeItem(key); } catch (_) {}
}

// ── Storage Layer (replace with API calls later) ──────
export const AuthStorage = {
  getUsers:     () => safeRead(localStorage,   USERS_KEY),
  setUsers:     (u) => safeWrite(localStorage,  USERS_KEY, u),
  getSession:   () => safeRead(sessionStorage,  SESSION_KEY),
  setSession:   (s) => safeWrite(sessionStorage, SESSION_KEY, s),
  clearSession: () => safeRemove(sessionStorage, SESSION_KEY),
};

// ── Default Demo Accounts ─────────────────────────────
export const DEFAULT_USERS = [
  { id:"u1", username:"admin",   password:"admin123",   name:"Admin User",    role:"admin"   },
  { id:"u2", username:"cashier", password:"cashier123", name:"Alex Kassem",   role:"cashier" },
  { id:"u3", username:"kitchen", password:"kitchen123", name:"Kitchen Staff", role:"kitchen" },
];

// ── Role Permissions ──────────────────────────────────
export const PERMISSIONS = {
  admin: {
    canAccessPOS:      true,
    canAccessKitchen:  true,
    canAccessReports:  true,
    canAccessSettings: true,
    canManageMenu:     true,
    canBackupRestore:  true,
    canDeleteData:     true,
    canEditPrices:     true,
    canVoidOrders:     true,
    canApplyDiscount:  true,
  },
  cashier: {
    canAccessPOS:      true,
    canAccessKitchen:  false,
    canAccessReports:  false,
    canAccessSettings: false,
    canManageMenu:     false,
    canBackupRestore:  false,
    canDeleteData:     false,
    canEditPrices:     false,
    canVoidOrders:     false,
    canApplyDiscount:  true,
  },
  kitchen: {
    canAccessPOS:      false,
    canAccessKitchen:  true,
    canAccessReports:  false,
    canAccessSettings: false,
    canManageMenu:     false,
    canBackupRestore:  false,
    canDeleteData:     false,
    canEditPrices:     false,
    canVoidOrders:     false,
    canApplyDiscount:  false,
  },
};

export const ROLE_META = {
  admin:   { label:"Admin",   color:"#f0a500", bg:"#f0a50018", icon:"👑" },
  cashier: { label:"Cashier", color:"#58a6ff", bg:"#58a6ff18", icon:"💳" },
  kitchen: { label:"Kitchen", color:"#3fb950", bg:"#3fb95018", icon:"🍳" },
};

// ── Validate session shape ────────────────────────────
function isValidSession(s) {
  return (
    s &&
    typeof s === "object" &&
    typeof s.id === "string" &&
    typeof s.username === "string" &&
    typeof s.role === "string" &&
    ["admin","cashier","kitchen"].includes(s.role)
  );
}

// ── Context ────────────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const s = AuthStorage.getSession();
    return isValidSession(s) ? s : null;
  });

  // Seed users on first run
  useEffect(() => {
    try {
      const existing = AuthStorage.getUsers();
      if (!Array.isArray(existing) || existing.length === 0) {
        AuthStorage.setUsers(DEFAULT_USERS);
      }
    } catch (_) {
      AuthStorage.setUsers(DEFAULT_USERS);
    }
  }, []);

  const login = (username, password) => {
    try {
      let users = AuthStorage.getUsers();
      if (!Array.isArray(users) || users.length === 0) {
        users = DEFAULT_USERS;
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
      AuthStorage.setSession(session);
      setUser(session);
      return { success: true, user: session };
    } catch (_) {
      return { success: false, error: "Login error. Please try again." };
    }
  };

  const logout = () => {
    AuthStorage.clearSession();
    setUser(null);
  };

  const can = (permission) => {
    if (!user || !user.role) return false;
    return PERMISSIONS[user.role]?.[permission] === true;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
