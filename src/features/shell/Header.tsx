import type { Scene, SceneId } from '../../types'
import { SceneRail } from './SceneRail'

type HeaderProps = {
  scenes: readonly Scene[]
  activeSceneId: SceneId
  onSelectScene: (nextScene: SceneId) => void
}

export function Header({ scenes, activeSceneId, onSelectScene }: HeaderProps) {
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
        <span>System online</span>
        <small>CN / 16:42</small>
      </div>
    </header>
  )
}