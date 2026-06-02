/**
 * KAVO-SYS · Language System
 * Provides: LangProvider, useLang(), LangSwitcher
 *
 * Usage:
 *   const { t, lang, isRTL } = useLang();
 *   t("save")   →  "Save" or "حفظ"
 *
 * RTL: applied automatically to document.documentElement
 */

import { createContext, useContext, useState, useEffect } from "react";
import { translations } from "./translations.js";

const LANG_KEY = "kavo_language";
const SUPPORTED = ["en", "ar"];

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return SUPPORTED.includes(saved) ? saved : "en";
    } catch { return "en"; }
  });

  // Apply RTL / font to document root whenever language changes
  useEffect(() => {
    const html = document.documentElement;
    if (lang === "ar") {
      html.setAttribute("dir", "rtl");
      html.setAttribute("lang", "ar");
      html.style.fontFamily = "'Noto Sans Arabic', 'Segoe UI', system-ui, sans-serif";
    } else {
      html.setAttribute("dir", "ltr");
      html.setAttribute("lang", "en");
      html.style.fontFamily = "";
    }
  }, [lang]);

  function setLang(l) {
    if (!SUPPORTED.includes(l)) return;
    try { localStorage.setItem(LANG_KEY, l); } catch {}
    setLangState(l);
  }

  // t(key) — falls back to key if translation missing
  function t(key) {
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
  }

  const isRTL = lang === "ar";

  return (
    <LangContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  // Safe fallback if used outside provider
  if (!ctx) {
    return {
      lang: "en",
      setLang: () => {},
      t: (k) => translations.en[k] || k,
      isRTL: false,
    };
  }
  return ctx;
}

// ── Language Switcher UI component ────────────────────
const SWITCH_STYLE = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  background: "rgba(255,255,255,0.06)",
  borderRadius: 8,
  padding: "2px 3px",
  border: "1px solid rgba(255,255,255,0.10)",
  flexShrink: 0,
};

function LangBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "#f0a500" : "transparent",
        color: active ? "#000" : "#7d8fa0",
        border: "none",
        borderRadius: 6,
        padding: "3px 9px",
        cursor: active ? "default" : "pointer",
        fontWeight: 700,
        fontSize: 11,
        fontFamily: "inherit",
        letterSpacing: ".04em",
        transition: "all .14s",
      }}
    >
      {children}
    </button>
  );
}

export function LangSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <div style={SWITCH_STYLE}>
      <LangBtn active={lang === "en"} onClick={() => setLang("en")}>EN</LangBtn>
      <LangBtn active={lang === "ar"} onClick={() => setLang("ar")}>AR</LangBtn>
    </div>
  );
}
