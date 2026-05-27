import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { ErrorBoundary } from './components/ErrorBoundary.jsx'

// Safety check: if root element is missing, log clearly and stop
const rootEl = document.getElementById('root')
if (!rootEl) {
  document.body.innerHTML = '<div style="color:#f0a500;font-family:monospace;padding:20px">KAVO-SYS: Missing #root element</div>'
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}
