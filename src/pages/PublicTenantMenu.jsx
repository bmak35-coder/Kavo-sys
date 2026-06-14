import { useEffect, useMemo, useState } from "react";
import { useFirebaseServices } from "../firebase/FirebaseServicesProvider.jsx";
import { FirebaseServicesProvider } from "../firebase/FirebaseServicesProvider.jsx";
import { useTenant } from "../contexts/TenantProvider.jsx";

const C = {
  bg: "#f8f6f1",
  surface: "#ffffff",
  text: "#1f2430",
  muted: "#6b7280",
  border: "#e7dfcf",
  accent: "#f0a500",
  accentDeep: "#b57600",
  chip: "#fff8e8",
  shadow: "0 18px 50px rgba(120, 93, 43, 0.12)",
};

const safeArr = (v, d = []) => (Array.isArray(v) ? v : d);
const safeNum = (v) => {
  const n = +v;
  return Number.isFinite(n) ? n : 0;
};

function normalizeCategoryId(item) {
  return item?.cat || item?.category || "uncategorized";
}

function normalizeCategoryName(catId, categoryMap) {
  if (categoryMap[catId]?.name) return categoryMap[catId].name;
  if (catId === "uncategorized") return "Specials";
  return String(catId)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function ItemCard({ item, currencySymbol }) {
  const displayPrice = `${currencySymbol}${safeNum(item.price).toFixed(2)}`;
  const tileBackground = item.bg || "#f4efe3";

  return (
    <article
      style={{
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 16,
        boxShadow: "0 8px 22px rgba(58, 42, 12, 0.08)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: 120,
          background: tileBackground,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {item.photo ? (
          <img
            src={item.photo}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: 48 }}>{item.em || "🍽"}</span>
        )}
        {item.favorite && (
          <div
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "rgba(255,255,255,0.9)",
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              padding: "4px 9px",
              fontSize: 11,
              fontWeight: 700,
              color: C.accentDeep,
            }}
          >
            Chef Pick
          </div>
        )}
      </div>

      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <h3
            style={{
              margin: 0,
              fontFamily: "'Manrope', sans-serif",
              fontSize: 17,
              fontWeight: 800,
              color: C.text,
              lineHeight: 1.2,
            }}
          >
            {item.name}
          </h3>
          <span
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: 16,
              fontWeight: 800,
              color: C.accentDeep,
              whiteSpace: "nowrap",
            }}
          >
            {displayPrice}
          </span>
        </div>

        {item.description && (
          <p
            style={{
              margin: "8px 0 0",
              color: C.muted,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {item.description}
          </p>
        )}
      </div>
    </article>
  );
}

function PublicTenantMenuContent({ tenant }) {
  const firebaseServices = useFirebaseServices();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [currencySymbol, setCurrencySymbol] = useState("$");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    let alive = true;

    const loadMenu = async () => {
      setLoading(true);
      setError("");
      try {
        const [allItems, allCategories, settings] = await Promise.all([
          firebaseServices.menu.getAll(),
          firebaseServices.menu.getCategories().catch(() => []),
          firebaseServices.settings.getAll().catch(() => ({})),
        ]);

        if (!alive) return;

        const visibleItems = safeArr(allItems).filter(
          (item) => item.active !== false && !item.outOfStock
        );

        setItems(visibleItems);
        setCategories(safeArr(allCategories));
        setCurrencySymbol(settings?.currency?.primarySymbol || "$");
      } catch (err) {
        console.error("Error loading public menu:", err);
        if (!alive) return;
        setError("Unable to load menu at the moment.");
      }
      if (alive) setLoading(false);
    };

    loadMenu();
    return () => {
      alive = false;
    };
  }, [firebaseServices]);

  const categoryMap = useMemo(() => {
    const map = {};
    categories.forEach((cat) => {
      map[cat.id] = cat;
    });
    return map;
  }, [categories]);

  const grouped = useMemo(() => {
    const groups = {};

    items.forEach((item) => {
      const catId = normalizeCategoryId(item);
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(item);
    });

    return Object.entries(groups)
      .sort((a, b) => {
        const aSort = safeNum(categoryMap[a[0]]?.sortOrder);
        const bSort = safeNum(categoryMap[b[0]]?.sortOrder);
        if (aSort !== bSort) return aSort - bSort;
        return normalizeCategoryName(a[0], categoryMap).localeCompare(
          normalizeCategoryName(b[0], categoryMap)
        );
      })
      .map(([id, categoryItems]) => ({
        id,
        icon: categoryMap[id]?.icon || "🍽",
        name: normalizeCategoryName(id, categoryMap),
        items: categoryItems.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
      }));
  }, [items, categoryMap]);

  const visibleGroups = useMemo(() => {
    if (activeCategory === "all") return grouped;
    return grouped.filter((g) => g.id === activeCategory);
  }, [grouped, activeCategory]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 10,
          color: C.text,
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        <div style={{ fontSize: 44 }}>🍽</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Preparing menu...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Playfair+Display:wght@600;700;800&display=swap');
        * { box-sizing: border-box; }
        .menu-shell {
          max-width: 1140px;
          margin: 0 auto;
          padding: 24px 16px 64px;
        }
        .menu-hero {
          position: relative;
          background: linear-gradient(140deg, #fffdf8 0%, #fff7e5 50%, #f7ebd2 100%);
          border: 1px solid ${C.border};
          border-radius: 26px;
          overflow: hidden;
          box-shadow: ${C.shadow};
          padding: 26px 24px;
        }
        .menu-orb {
          position: absolute;
          width: 230px;
          height: 230px;
          border-radius: 999px;
          filter: blur(18px);
          opacity: 0.35;
          pointer-events: none;
        }
        .menu-orb.a { right: -70px; top: -90px; background: #f0a500; }
        .menu-orb.b { left: -80px; bottom: -120px; background: #f4d7a1; }
        .menu-chip {
          border: 1px solid ${C.border};
          background: ${C.chip};
          color: ${C.accentDeep};
          border-radius: 999px;
          padding: 9px 13px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          font-family: 'Manrope', sans-serif;
        }
        .menu-chip:hover { transform: translateY(-1px); }
        .menu-chip.active {
          border-color: #e4bc63;
          background: #f0a500;
          color: #2a1b00;
          box-shadow: 0 8px 16px rgba(190, 132, 18, 0.3);
        }
        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 14px;
        }
        @media (max-width: 640px) {
          .menu-shell { padding: 14px 12px 48px; }
          .menu-hero { border-radius: 18px; padding: 20px 16px; }
          .menu-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <main className="menu-shell">
        <section className="menu-hero">
          <div className="menu-orb a" />
          <div className="menu-orb b" />

          <div style={{ position: "relative", zIndex: 2 }}>
            <div
              style={{
                fontFamily: "'Manrope', sans-serif",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: ".08em",
                color: C.accentDeep,
                textTransform: "uppercase",
              }}
            >
              Digital Menu
            </div>
            <h1
              style={{
                margin: "8px 0 0",
                fontFamily: "'Playfair Display', serif",
                fontSize: "clamp(30px, 4.8vw, 48px)",
                fontWeight: 700,
                lineHeight: 1.08,
              }}
            >
              {tenant?.name || "Our Restaurant"}
            </h1>
            <p
              style={{
                margin: "12px 0 0",
                maxWidth: 720,
                color: "#4f5b68",
                lineHeight: 1.5,
                fontFamily: "'Manrope', sans-serif",
                fontSize: 15,
              }}
            >
              Explore our menu by category. Prices are listed clearly and update automatically from your tenant menu management.
            </p>
          </div>
        </section>

        <section
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            position: "sticky",
            top: 0,
            zIndex: 3,
            background: "linear-gradient(to bottom, rgba(248,246,241,0.95), rgba(248,246,241,0.75), rgba(248,246,241,0))",
            paddingTop: 10,
            paddingBottom: 8,
            backdropFilter: "blur(2px)",
          }}
        >
          <button
            className={`menu-chip ${activeCategory === "all" ? "active" : ""}`}
            onClick={() => setActiveCategory("all")}
          >
            All Categories
          </button>
          {grouped.map((group) => (
            <button
              key={group.id}
              className={`menu-chip ${activeCategory === group.id ? "active" : ""}`}
              onClick={() => setActiveCategory(group.id)}
            >
              {group.icon} {group.name}
            </button>
          ))}
        </section>

        {error && (
          <div
            style={{
              marginTop: 16,
              border: "1px solid #efb8b8",
              background: "#fff4f4",
              borderRadius: 12,
              padding: "10px 12px",
              color: "#9e2f2f",
              fontFamily: "'Manrope', sans-serif",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        )}

        {!error && grouped.length === 0 && (
          <div
            style={{
              marginTop: 16,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 14,
              padding: "18px 16px",
              textAlign: "center",
              fontFamily: "'Manrope', sans-serif",
              color: C.muted,
            }}
          >
            No active menu items available yet.
          </div>
        )}

        {!error &&
          visibleGroups.map((group) => (
            <section key={group.id} style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 999,
                    background: "#fff4dc",
                    border: `1px solid ${C.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  {group.icon}
                </div>
                <div>
                  <h2
                    style={{
                      margin: 0,
                      fontFamily: "'Playfair Display', serif",
                      fontWeight: 700,
                      fontSize: 28,
                      lineHeight: 1,
                    }}
                  >
                    {group.name}
                  </h2>
                  <div
                    style={{
                      marginTop: 4,
                      color: C.muted,
                      fontSize: 12,
                      fontWeight: 700,
                      fontFamily: "'Manrope', sans-serif",
                    }}
                  >
                    {group.items.length} item{group.items.length !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              <div className="menu-grid">
                {group.items.map((item) => (
                  <ItemCard key={item.id} item={item} currencySymbol={currencySymbol} />
                ))}
              </div>
            </section>
          ))}
      </main>
    </div>
  );
}

export default function PublicTenantMenu() {
  const { tenant, tenantId, loading, error } = useTenant();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 10,
          color: C.text,
          fontFamily: "'Manrope', sans-serif",
        }}
      >
        <div style={{ fontSize: 44 }}>🍽</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Loading restaurant...</div>
      </div>
    );
  }

  if (error || !tenantId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: C.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 10,
          color: C.text,
          fontFamily: "'Manrope', sans-serif",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        <div style={{ fontSize: 44 }}>🚫</div>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Restaurant Not Found</div>
        <div style={{ fontSize: 13, color: C.muted, maxWidth: 360 }}>
          {error || "This menu link is invalid or inactive."}
        </div>
      </div>
    );
  }

  return (
    <FirebaseServicesProvider tenantId={tenantId}>
      <PublicTenantMenuContent tenant={tenant} />
    </FirebaseServicesProvider>
  );
}
