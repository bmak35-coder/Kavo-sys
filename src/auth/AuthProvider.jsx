import { createContext, useContext, useState } from "react";
import { AuthService } from "../db/services/auth.js";
import { DEFAULT_USERS, PERMISSIONS, ROLE_META } from "./authConstants.js";

export { DEFAULT_USERS, PERMISSIONS, ROLE_META };

function isValidSession(s) {
  return s && typeof s === "object" && typeof s.id === "string" &&
    ["admin","cashier","kitchen"].includes(s.role);
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { const s = AuthService.getSession(); return isValidSession(s) ? s : null; }
    catch { return null; }
  });

  const login = async (username, password) => {
    try {
      const res = await AuthService.login(username, password);
      if (res.success) setUser(res.user);
      return res;
    } catch { return { success: false, error: "Login error. Please try again." }; }
  };

  const logout = () => {
    AuthService.logout();
    setUser(null);
  };

  const can = (permission) => {
    if (!user?.role) return false;
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
