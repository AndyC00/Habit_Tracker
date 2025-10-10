import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './style.css'

const container =
  document.getElementById('app') ??
  (() => {
    const el = document.createElement('div')
    el.id = 'app'
    document.body.appendChild(el)
    return el
  })()

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)