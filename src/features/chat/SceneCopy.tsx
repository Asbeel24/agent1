import type { Scene } from '../../types'

type SceneCopyProps = {
  scene: Scene
}

export function SceneCopy({ scene }: SceneCopyProps) {
  return (
    <section className="scene-copy" aria-live="polite">
      <p className="scene-eyebrow scene-copy-line">{scene.signal}</p>
      <div className="scene-identity scene-copy-line">
        <span>{scene.order}</span>
        <strong>{scene.label}</strong>
      </div>
      <p className="scene-description scene-copy-line">{scene.description}</p>
    </section>
  )
}