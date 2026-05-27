import { createContext, useContext, useState, useEffect } from "react";

/* ══════════════════════════════════════════════════════
   AUTH LAYER  ·  KAVO-SYS
   All storage calls go through AuthStorage.
   Swap AuthStorage.get/set for real API calls later.
══════════════════════════════════════════════════════ */

const USERS_KEY   = "kavo_users";
const SESSION_KEY = "kavo_session";

// ── Storage Layer (replace these with API calls later) ──
export const AuthStorage = {
  getUsers:     ()  => { try { const v=localStorage.getItem(USERS_KEY);   return v?JSON.parse(v):null; } catch{return null;} },
  setUsers:     (u) => { try { localStorage.setItem(USERS_KEY,JSON.stringify(u)); } catch{} },
  getSession:   ()  => { try { const v=sessionStorage.getItem(SESSION_KEY); return v?JSON.parse(v):null; } catch{return null;} },
  setSession:   (s) => { try { sessionStorage.setItem(SESSION_KEY,JSON.stringify(s)); } catch{} },
  clearSession: ()  => { try { sessionStorage.removeItem(SESSION_KEY); } catch{} },
};

// ── Default Demo Accounts ────────────────────────────
const DEFAULT_USERS = [
  { id:"u1", username:"admin",   password:"admin123",   name:"Admin User",    role:"admin"   },
  { id:"u2", username:"cashier", password:"cashier123", name:"Alex Kassem",   role:"cashier" },
  { id:"u3", username:"kitchen", password:"kitchen123", name:"Kitchen Staff", role:"kitchen" },
];

// ── Role Permissions ─────────────────────────────────
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

// ── Auth Context ──────────────────────────────────────
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => AuthStorage.getSession());

  // Seed default users on first run
  useEffect(() => {
    if (!AuthStorage.getUsers()) AuthStorage.setUsers(DEFAULT_USERS);
  }, []);

  const login = (username, password) => {
    const users = AuthStorage.getUsers() || DEFAULT_USERS;
    const found = users.find(u =>
      u.username.toLowerCase() === username.toLowerCase().trim() &&
      u.password === password
    );
    if (!found) return { success: false, error: "Invalid username or password" };
    const session = {
      id: found.id, username: found.username,
      name: found.name, role: found.role,
      loginAt: new Date().toISOString(),
    };
    AuthStorage.setSession(session);
    setUser(session);
    return { success: true, user: session };
  };

  const logout = () => {
    AuthStorage.clearSession();
    setUser(null);
  };

  // Check a single permission for current user
  const can = (permission) => {
    if (!user) return false;
    return PERMISSIONS[user.role]?.[permission] ?? false;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
};
