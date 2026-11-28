import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { stadiumSlugs } from './stadiums/catalog'

// ?stadium=<slug> opens that stadium; without it (or with an unknown one) the landing page lets you pick.
const slug = new URLSearchParams(location.search).get('stadium') ?? ''
const Root = stadiumSlugs.includes(slug) ? (await import('./App.tsx')).default : (await import('./ui/Landing.tsx')).default

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
