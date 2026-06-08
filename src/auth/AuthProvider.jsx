import { createContext, useContext, useState } from "react";
import { AuthService } from "../db/services/auth.js";
import { DEFAULT_USERS, PERMISSIONS, ROLE_META } from "./authConstants.js";

export { DEFAULT_USERS, PERMISSIONS, ROLE_META };

function isValidSession(s) {
  return s && typeof s === "object" && typeof s.id === "string" &&
    ["owner","admin","manager","cashier","kitchen"].includes(s.role);
}

const AuthContext = createContext(null);

export function AuthProvider({ children, initialUser = null, onLogoutCallback = null }) {
  const [user, setUser] = useState(() => {
    // If initialUser is provided (Firestore tenant user), use that
    if (initialUser) return initialUser;
    
    // Otherwise, check IndexedDB session (for local/legacy mode)
    try { const s = AuthService.getSession(); return isValidSession(s) ? s : null; }
    catch { return null; }
  });

  const login = async (username, password) => {
    // If initialUser is provided, this is tenant mode - don't allow login here
    if (initialUser) {
      return { success: false, error: "Please log in through the tenant portal" };
    }
    
    try {
      const res = await AuthService.login(username, password);
      if (res.success) {
        console.log("✅ Login successful - User:", res.user);
        setUser(res.user);
      } else {
        console.log("❌ Login failed:", res.error);
      }
      return res;
    } catch { return { success: false, error: "Login error. Please try again." }; }
  };

  const logout = () => {
    // If initialUser was provided, don't clear IndexedDB session
    if (!initialUser) {
      AuthService.logout();
    }
    setUser(null);
    
    // Call the logout callback if provided (for tenant logout)
    if (onLogoutCallback) {
      onLogoutCallback();
    }
  };

  const can = (permission) => {
    if (!user?.role) return false;
    
    // Check if user has 'all' permissions (Firestore tenant users)
    if (user.permissions?.all === true) return true;
    
    // Check specific permission in user.permissions (Firestore)
    if (user.permissions && user.permissions[permission] === true) return true;
    
    // Fallback to role-based permissions (IndexedDB users)
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
