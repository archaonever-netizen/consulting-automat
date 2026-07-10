import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LandingPage from './LandingPage.tsx'
import '../styles/styles.css'

createRoot(document.getElementById('landing-root')!).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
)
