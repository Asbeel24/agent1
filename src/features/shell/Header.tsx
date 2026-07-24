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
        <span>{live ? 'AppWS live' : 'System online'}</span>
        <small>{live ? 'B / ONLINE' : 'CN / 16:42'}</small>
      </div>
    </header>
  )
}
