import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'
import ElectronTitleBar from './components/ElectronTitleBar.jsx'
import { LangProvider } from './i18n/LanguageContext.jsx'

// Load Arabic font (non-blocking — only fetches when needed)
const fontLink = document.createElement('link');
fontLink.rel  = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;600;700;800;900&display=swap';
document.head.appendChild(fontLink);

const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<div style="color:#f0a500;font-family:monospace;padding:20px">KAVO-SYS: Missing #root element</div>'
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <LangProvider>
          <ElectronTitleBar />
          <App />
        </LangProvider>
      </ErrorBoundary>
    </StrictMode>
  )
}
