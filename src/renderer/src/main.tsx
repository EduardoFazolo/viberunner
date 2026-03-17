import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import { pluginRegistry } from '../../plugins/types'
import { notionPlugin } from '../../plugins/notion'

// Register plugins before the app renders
pluginRegistry.register(notionPlugin)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
