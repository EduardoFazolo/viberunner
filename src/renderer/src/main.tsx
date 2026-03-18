import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import { pluginRegistry } from '../../plugins/types'
import { notionPlugin } from '../../plugins/notion'
import { claudePlugin } from '../../plugins/claude'

// Register plugins before the app renders
pluginRegistry.register(notionPlugin)
pluginRegistry.register(claudePlugin)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
