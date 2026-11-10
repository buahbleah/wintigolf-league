import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SessionProvider } from '@/state/session'
import { UpdateNotice } from '@/ui/UpdateNotice'
import './design/tokens.css'
import './design/base.css'
import './design/components.css'
import './design/screens.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <App />
      <UpdateNotice />
    </SessionProvider>
  </StrictMode>,
)
