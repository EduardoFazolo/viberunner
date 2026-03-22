import React, { useEffect } from 'react'
import { useMaestro } from './useMaestro'
import { MaestroOverlay } from './MaestroOverlay'
import { useMaestroStore } from '../maestroStore'

export function MaestroCanvasMount(): React.ReactElement | null {
  const { loaded, load } = useMaestroStore()
  useEffect(() => { if (!loaded) void load() }, [loaded, load])

  const state = useMaestro()
  return <MaestroOverlay state={state} />
}
