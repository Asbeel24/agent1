import type { Scene, SceneId } from '../../types'
import type { AppWsStatus } from '../../api'
import { SceneRail } from './SceneRail'

type HeaderProps = {
  scenes: readonly Scene[]
  activeSceneId: SceneId
  onSelectScene: (nextScene: SceneId) => void
  realtimeStatus?: AppWsStatus
}

export function Header({
  scenes,
  activeSceneId,
  onSelectScene,
  realtimeStatus = 'idle',
}: HeaderProps) {
  const live = realtimeStatus === 'open'
  const statusLabel: Record<AppWsStatus, string> = {
    idle: 'AppWS idle',
    connecting: 'AppWS connecting',
    open: 'AppWS live',
    reconnecting: 'AppWS reconnecting',
    closed: 'AppWS offline',
  }

  return (
    <header className="experience-header">
      <a className="brand-mark interactive-target" href="/" aria-label="BicaMind 首页">
        <span>BICA</span>
        <span>MIND</span>
      </a>

      <SceneRail
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSelectScene={onSelectScene}
      />

      <div className="system-status">
        <span className="status-dot" />
        <span>{statusLabel[realtimeStatus]}</span>
        <small>{live ? 'B / ONLINE' : 'B / LINKING'}</small>
      </div>
    </header>
  )
}
