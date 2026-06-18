import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import PortalApp from './PortalApp.tsx'
import './portal.css'

createRoot(document.getElementById('portal-root')!).render(
  <StrictMode>
    <PortalApp />
  </StrictMode>,
)
