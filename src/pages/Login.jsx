import { useState } from "react";
import { useAuth, ROLE_META } from "../auth/AuthProvider";
import { useLang } from "../i18n/LanguageContext.jsx";

// ── Design tokens ─────────────────────────────────────
const L = {
  bg:    "#070912",
  page:  "#070912",
  card:  "#0d1426",
  inner: "#060a14",
  bdr:   "#1a2540",
  bdrHi: "#2a3a60",
  acc:   "#f0a500",
  text:  "#e8edf5",
  sub:   "#4a6080",
  muted: "#384a60",
};

export default function Login() {
  const { login } = useAuth();
  const { t } = useLang();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [shake,    setShake]    = useState(false);
  const [focusU,   setFocusU]   = useState(false);
  const [focusP,   setFocusP]   = useState(false);

  const bump = () => { setShake(true); setTimeout(() => setShake(false), 500); };

  const doLogin = async (u = username, p = password) => {
    if (!u.trim() || !p) {
      setError(t("enterUsernamePassword"));
      bump(); return;
    }
    setLoading(true); setError("");
    const res = await login(u, p);
    if (!res.success) { setError(res.error); bump(); }
    setLoading(false);
  };

  const m = ROLE_META;

  return (
    <div style={{
      minHeight: "100vh", background: L.page,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px 16px", fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700&display=swap');
        @keyframes fadeUp   { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shake    { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-9px)} 40%,80%{transform:translateX(9px)} }
        @keyframes errIn    { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin     { to{transform:rotate(360deg)} }
        .kv-login-root      { animation: fadeUp 0.5s cubic-bezier(.16,1,.3,1); font-family:'Plus Jakarta Sans',system-ui,sans-serif; }
        .kv-card            { animation: fadeUp 0.55s cubic-bezier(.16,1,.3,1) 0.05s both; }
        .kv-input           { transition: border-color 0.2s, box-shadow 0.2s !important; }
        .kv-login-btn:hover:not(:disabled) { opacity:0.88 !important; transform:translateY(-1px); }
        .kv-login-btn:active:not(:disabled) { transform:translateY(0); }
        .kv-demo-btn:hover  { border-color: var(--dc) !important; background: var(--db) !important; transform:translateY(-2px); }
        .kv-demo-btn:active { transform:translateY(0) !important; }
        .kv-eye:hover       { color: #e8edf5 !important; }
        .kv-shake           { animation: shake 0.45s ease !important; }
      `}</style>

      <div className="kv-login-root" style={{ width: "100%", maxWidth: 400 }}>

        {/* ── Logo block ── */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 68, height: 68, borderRadius: 20,
            background: `linear-gradient(135deg, ${L.acc}22, ${L.acc}08)`,
            border: `1.5px solid ${L.acc}35`, marginBottom: 14, position: "relative",
          }}>
            <span style={{ fontSize: 30, lineHeight: 1 }}>⚡</span>
            <div style={{
              position: "absolute", inset: -1, borderRadius: 20,
              boxShadow: `0 0 32px ${L.acc}20`,
              pointerEvents: "none",
            }}/>
          </div>
          <div style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 900, fontSize: 30, letterSpacing: "0.07em",
            color: L.acc, lineHeight: 1,
          }}>
            KAVO<span style={{ color: L.text, opacity: 0.35, fontWeight: 700 }}>-SYS</span>
          </div>
          <div style={{ fontSize: 12, color: L.sub, marginTop: 8, letterSpacing: "0.08em", fontWeight: 500 }}>
            {t("offlinePOSSystem")}
          </div>
        </div>

        {/* ── Login card ── */}
        <div
          className={`kv-card${shake ? " kv-shake" : ""}`}
          style={{
            background: L.card, border: `1px solid ${L.bdr}`,
            borderRadius: 20, padding: "28px 24px",
            boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 17, color: L.text, marginBottom: 22 }}>
            {t("signInToAccount")}
          </div>

          {/* Username */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.sub, letterSpacing: "0.08em", marginBottom: 7 }}>
              {t("username").toUpperCase()}
            </label>
            <input
              className="kv-input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && doLogin()}
              onFocus={() => setFocusU(true)}
              onBlur={() => setFocusU(false)}
              placeholder={t("enterYourUsername")}
              autoComplete="username"
              spellCheck={false}
              style={{
                width: "100%", background: L.inner,
                border: `1px solid ${focusU ? L.acc : L.bdr}`,
                boxShadow: focusU ? `0 0 0 3px ${L.acc}1a` : "none",
                borderRadius: 10, padding: "11px 14px",
                color: L.text, fontSize: 14, fontFamily: "inherit",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: L.sub, letterSpacing: "0.08em", marginBottom: 7 }}>
              {t("password").toUpperCase()}
            </label>
            <div style={{ position: "relative" }}>
              <input
                className="kv-input"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && doLogin()}
                onFocus={() => setFocusP(true)}
                onBlur={() => setFocusP(false)}
                placeholder={t("enterYourPassword")}
                autoComplete="current-password"
                style={{
                  width: "100%", background: L.inner,
                  border: `1px solid ${focusP ? L.acc : L.bdr}`,
                  boxShadow: focusP ? `0 0 0 3px ${L.acc}1a` : "none",
                  borderRadius: 10, padding: "11px 44px 11px 14px",
                  color: L.text, fontSize: 14, fontFamily: "inherit",
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <button
                className="kv-eye"
                onClick={() => setShowPwd(!showPwd)}
                title={showPwd ? "Hide password" : "Show password"}
                style={{
                  position: "absolute", right: 12, top: "50%",
                  transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  color: L.sub, fontSize: 17, padding: 0, lineHeight: 1,
                  transition: "color 0.15s",
                }}
              >
                {showPwd ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: "#200808", border: "1px solid #f8514935",
              borderRadius: 9, padding: "9px 13px", marginBottom: 16,
              fontSize: 13, color: "#f85149",
              display: "flex", alignItems: "center", gap: 8,
              animation: "errIn 0.25s ease",
            }}>
              <span style={{ fontSize: 15 }}>⚠</span> {error}
            </div>
          )}

          {/* Login button */}
          <button
            className="kv-login-btn"
            onClick={() => doLogin()}
            disabled={loading}
            style={{
              width: "100%", background: loading ? L.acc + "80" : L.acc,
              color: "#000", border: "none", borderRadius: 10,
              padding: "12px 0", fontWeight: 800, fontSize: 14,
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "inherit", letterSpacing: "0.04em",
              transition: "all 0.15s", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={{ width: 16, height: 16, border: "2px solid #00000030", borderTopColor: "#000", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }}/>
                {t("loggingIn")}
              </>
            ) : t("signInBtn")}
          </button>
        </div>

        {/* ── Role reference (no auto-login) ── */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
            <div style={{ flex:1, height:1, background:L.bdr }}/>
            <span style={{ fontSize:10, color:L.muted, letterSpacing:"0.1em", fontWeight:700 }}>
              {t("staffRoles")}
            </span>
            <div style={{ flex:1, height:1, background:L.bdr }}/>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
            {[
              { role:"owner",   accessKey:"roleOwnerAccess" },
              { role:"manager", accessKey:"roleManagerAccess" },
              { role:"cashier", accessKey:"roleCashierAccess" },
              { role:"kitchen", accessKey:"roleKitchenAccess" },
            ].map(({ role, accessKey }) => {
              const meta = m[role] || m.cashier;
              return (
                <div key={role}
                  style={{ background:meta.bg, border:`1px solid ${meta.color}20`,
                           borderRadius:8, padding:"8px 10px",
                           display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:14 }}>{meta.icon}</span>
                  <div>
                    <div style={{ fontSize:10, fontWeight:800, color:meta.color }}>
                      {meta.label}
                    </div>
                    <div style={{ fontSize:9, color:L.muted }}>{t(accessKey)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign:"center", marginTop:22, fontSize:10, color:L.muted,
                      letterSpacing:"0.06em" }}>
          KAVO-SYS · Offline-First · Contact your manager for access
        </div>
      </div>
    </div>
  );
}
