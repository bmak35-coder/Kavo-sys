import { AuthProvider, useAuth } from "./auth/AuthProvider";
import Login from "./pages/Login";
import POS from "./pages/POS";
import KitchenDisplay from "./pages/KitchenDisplay";

/* ══════════════════════════════════════════════════════
   KAVO-SYS  ·  Root Router
   Reads auth state and renders the right screen.
   No URL routing needed — roles determine the view.
══════════════════════════════════════════════════════ */

function Router() {
  const { user } = useAuth();

  // Not logged in → Login screen
  if (!user) return <Login />;

  // Kitchen role → Kitchen Display only
  if (user.role === "kitchen") return <KitchenDisplay />;

  // Admin + Cashier → Full POS
  return <POS />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
