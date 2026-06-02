import { Component } from "react";

/**
 * KAVO-SYS · ErrorBoundary · v2
 *
 * Accepts an optional `fallback` prop.
 * If provided: renders fallback on error (used by Screen wrapper in App.jsx).
 * If not provided: renders the built-in full-screen recovery UI.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("[KAVO-SYS] Component error:", error?.message || error);
    console.error("[KAVO-SYS] Component stack:", info?.componentStack);
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  handleClear() {
    try { localStorage.clear(); } catch (_) {}
    try { sessionStorage.clear(); } catch (_) {}
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // If a custom fallback was provided (e.g. from <Screen>), use it
    if (this.props.fallback) return this.props.fallback;

    // Built-in full-screen recovery UI
    const msg = this.state.error?.message || "Unknown error";
    const C = { bg:"#070c16", acc:"#f0a500", danger:"#f85149",
                text:"#e8edf5", muted:"#4a6080", bdr:"#1a2438" };

    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex",
                    alignItems:"center", justifyContent:"center",
                    fontFamily:"system-ui,-apple-system,sans-serif" }}>
        <div style={{ background:"#0d1525", border:`1px solid ${C.bdr}`, borderRadius:16,
                      padding:"36px 32px", maxWidth:480, width:"90vw", textAlign:"center",
                      boxShadow:"0 24px 64px rgba(0,0,0,.6)" }}>

          <div style={{ fontSize:48, marginBottom:14 }}>⚠️</div>

          <div style={{ fontWeight:900, color:C.acc, fontSize:22, letterSpacing:".06em",
                        marginBottom:8 }}>
            KAVO-SYS
          </div>
          <div style={{ fontSize:14, color:C.text, marginBottom:6 }}>
            Something went wrong. Please refresh to continue.
          </div>

          <div style={{ fontFamily:"'Courier New',monospace", fontSize:12, color:C.danger,
                        background:"#120808", borderRadius:8, padding:"10px 14px",
                        margin:"16px 0", textAlign:"left", wordBreak:"break-all" }}>
            {msg}
          </div>

          <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
            <button onClick={() => this.handleReset()}
              style={{ background:C.acc, color:"#000", border:"none", borderRadius:8,
                       padding:"10px 24px", fontWeight:700, fontSize:13,
                       cursor:"pointer", fontFamily:"inherit" }}>
              🔄 Refresh
            </button>
            <button onClick={() => { if (window.confirm("Clear & Restart will reset all local data. Continue?")) this.handleClear(); }}
              style={{ background:"transparent", color:C.danger, border:`1px solid ${C.danger}50`,
                       borderRadius:8, padding:"10px 20px", fontWeight:700, fontSize:13,
                       cursor:"pointer", fontFamily:"inherit" }}>
              🗑 Clear & Restart
            </button>
          </div>

          <div style={{ fontSize:10, color:C.muted, marginTop:14 }}>
            "Clear &amp; Restart" resets all local data and reloads the app
          </div>
        </div>
      </div>
    );
  }
}
