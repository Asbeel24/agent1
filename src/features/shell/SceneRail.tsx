import type { Scene, SceneId } from '../../types'

type SceneRailProps = {
  scenes: readonly Scene[]
  activeSceneId: SceneId
  onSelectScene: (nextScene: SceneId) => void
}

export function SceneRail({ scenes, activeSceneId, onSelectScene }: SceneRailProps) {
  return (
    <nav className="scene-nav" aria-label="体验场景">
      {scenes.map((scene) => (
        <button
          className="scene-nav-item interactive-target"
          data-active={scene.id === activeSceneId}
          key={scene.id}
          type="button"
          onClick={() => onSelectScene(scene.id)}
          aria-label={`${scene.label} ${scene.order}`}
          aria-current={scene.id === activeSceneId ? 'page' : undefined}
        >
          <span className="scene-nav-signal" aria-hidden="true">
            <i />
          </span>
          <span data-mobile-label={scene.id === 'personas' ? '人格' : scene.label}>
            {scene.label}
          </span>
          <small>{scene.order}</small>
        </button>
      ))}
    </nav>
  )
}