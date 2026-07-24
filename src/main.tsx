import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { LocalLoginGate } from './features/auth/LocalLoginGate'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalLoginGate>
      <App />
    </LocalLoginGate>
  </StrictMode>,
)
