import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import '@fontsource/montserrat/400.css'
import '@fontsource/montserrat/500.css'
import '@fontsource/montserrat/600.css'
import '@fontsource/montserrat/700.css'
import '@fontsource/poppins/600.css'
import './index.css'
import './pages.css'
import './admin.css'
import './responsive.css'
import App from './App'

let registration: ServiceWorkerRegistration | undefined
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('akocp:pwa-update', { detail: () => updateSW(true) }))
  },
  onRegisteredSW(_url, value) {
    registration = value
  }
})

const checkForAppUpdate = () => {
  if (document.visibilityState === 'visible') void registration?.update()
}
document.addEventListener('visibilitychange', checkForAppUpdate)
window.addEventListener('pageshow', checkForAppUpdate)
window.setInterval(checkForAppUpdate, 60 * 60 * 1000)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
)
