import { useState, useEffect } from 'react';
import { IS_ELECTRON, electronAPI } from '../hooks/useElectron.js';

/**
 * KAVO-SYS  ·  Electron Title Bar
 * Shows a slim native-style title bar only in Electron on Windows/Linux.
 * macOS uses the default traffic-light buttons (hiddenInset titleBarStyle).
 * Returns null in browser (web) mode.
 */
export default function ElectronTitleBar() {
  const [isFs,      setIsFs]      = useState(false);
  const [platform,  setPlatform]  = useState('');

  useEffect(() => {
    if (!IS_ELECTRON) return;
    electronAPI.platform().then(setPlatform).catch(() => {});
    electronAPI.window.isFullscreen().then(setIsFs).catch(() => {});
  }, []);

  // Only render on Windows / Linux in Electron
  if (!IS_ELECTRON || platform === 'darwin') return null;

  const C = {
    bg:  '#050a10',
    bdr: '#1a2438',
    acc: '#f0a500',
    txt: '#4a6080',
  };

  return (
    <div
      style={{
        height:         30,
        background:     C.bg,
        borderBottom:   `1px solid ${C.bdr}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '0 12px',
        flexShrink:     0,
        // Allow dragging the titlebar to move the window
        WebkitAppRegion: 'drag',
        userSelect:     'none',
      }}
    >
      {/* Left: logo + name */}
      <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:11 }}>
        <span style={{ fontSize:14 }}>⚡</span>
        <span style={{ fontWeight:800, color:C.acc, letterSpacing:'0.06em' }}>KAVO-SYS</span>
        <span style={{ color:C.txt, fontSize:10 }}>POS</span>
      </div>

      {/* Right: window controls */}
      <div style={{ display:'flex', gap:4, WebkitAppRegion:'no-drag' }}>
        {/* Fullscreen toggle */}
        <WinBtn
          onClick={() => electronAPI.window.fullscreen().then(() => setIsFs(f=>!f))}
          title={isFs ? 'Restore' : 'Fullscreen'}
          color={C.acc}
        >
          {isFs ? '⊡' : '⊞'}
        </WinBtn>
        {/* Minimize */}
        <WinBtn onClick={() => electronAPI.window.minimize()} title="Minimize" color={C.txt}>
          –
        </WinBtn>
        {/* Maximize */}
        <WinBtn onClick={() => electronAPI.window.maximize()} title="Maximize" color={C.txt}>
          □
        </WinBtn>
        {/* Close */}
        <WinBtn onClick={() => window.close()} title="Close" color="#f85149" hoverBg="#f85149">
          ✕
        </WinBtn>
      </div>
    </div>
  );
}

function WinBtn({ onClick, children, title, color, hoverBg }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width:      26, height:   22,
        background: hov ? (hoverBg||'#1a2438') : 'transparent',
        border:     'none',
        borderRadius: 4,
        color:      hov && hoverBg ? '#fff' : color,
        cursor:     'pointer',
        fontSize:   12,
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  );
}
