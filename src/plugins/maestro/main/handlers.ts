import type { IpcMainLike } from '../../types'

export function registerMaestroHandlers(ipc: IpcMainLike): void {
  let robot: typeof import('@jitsi/robotjs') | null = null

  function getRobot() {
    if (!robot) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      robot = require('@jitsi/robotjs')
      // Disable robotjs mouse movement delay for real-time control
      robot!.setMouseDelay(0)
    }
    return robot!
  }

  ipc.handle('maestro:mouse-move', (_e: unknown, x: number, y: number) => {
    getRobot().moveMouse(Math.round(x), Math.round(y))
  })

  ipc.handle('maestro:mouse-click', (_e: unknown, button: string) => {
    getRobot().mouseClick(button as 'left' | 'right')
  })

  ipc.handle('maestro:mouse-toggle', (_e: unknown, down: boolean, button: string) => {
    getRobot().mouseToggle(down ? 'down' : 'up', button as 'left' | 'right')
  })

  ipc.handle('maestro:mouse-get-pos', () => {
    return getRobot().getMousePos()
  })
}
