import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'
import '../../plugins/monaco/setup'
import { pluginRegistry } from '../../plugins/types'
import { notionPlugin } from '../../plugins/notion'
import { claudePlugin } from '../../plugins/claude'
import { monacoPlugin } from '../../plugins/monaco'
import { trelloPlugin } from '../../plugins/trello'
import { lovablePlugin } from '../../plugins/lovable'

// Register plugins before the app renders
pluginRegistry.register(notionPlugin)
pluginRegistry.register(claudePlugin)
pluginRegistry.register(monacoPlugin)
pluginRegistry.register(trelloPlugin)
pluginRegistry.register(lovablePlugin)

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <App />
)
