import { Component } from "react";

/**
 * KAVO-SYS Error Boundary
 * Catches any React render/lifecycle error and shows a
 * recovery screen instead of a blank/black page.
 * Replace the black screen with something actionable.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log for debugging — harmless in production
    console.error("[KAVO-SYS] Uncaught error:", error);
    console.error("[KAVO-SYS] Component stack:", info?.componentStack);
    this.setState({ info });
  }

  handleReload() {
    window.location.reload();
  }

  handleClearReload() {
    try { localStorage.clear(); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const msg = this.state.error?.message || "An unexpected error occurred";

    return (
      <div style={{
        minHeight: "100vh",
        background: "#070912",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "20px",
        boxSizing: "border-box",
      }}>
        <div style={{
          background: "#0d1426",
          border: "1px solid rgba(248,81,73,0.3)",
          borderRadius: 16,
          padding: "32px 28px",
          maxWidth: 480,
          width: "100%",
          textAlign: "center",
        }}>
          {/* Icon */}
          <div style={{ fontSize: 48, marginBottom: 16, lineHeight: 1 }}>⚠️</div>

          {/* Title */}
          <div style={{
            fontSize: 22, fontWeight: 800,
            color: "#f0a500", marginBottom: 8, letterSpacing: "0.04em",
          }}>
            KAVO-SYS
          </div>
          <div style={{ fontSize: 14, color: "#9198a1", marginBottom: 24 }}>
            Something went wrong. Please refresh to continue.
          </div>

          {/* Error detail */}
          <div style={{
            background: "#060a14",
            border: "1px solid rgba(248,81,73,0.2)",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 11,
            color: "#f85149",
            fontFamily: "monospace",
            textAlign: "left",
            marginBottom: 24,
            wordBreak: "break-word",
            lineHeight: 1.6,
          }}>
            {msg}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={this.handleReload}
              style={{
                flex: 1,
                background: "#f0a500",
                color: "#000",
                border: "none",
                borderRadius: 10,
                padding: "12px 0",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              🔄 Refresh
            </button>
            <button
              onClick={this.handleClearReload}
              style={{
                flex: 1,
                background: "transparent",
                color: "#f85149",
                border: "1px solid rgba(248,81,73,0.3)",
                borderRadius: 10,
                padding: "12px 0",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              🗑 Clear & Restart
            </button>
          </div>

          <div style={{ fontSize: 10, color: "#384a60", marginTop: 16 }}>
            "Clear & Restart" resets all local data and reloads the app
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
