import type { Scene, VoiceState } from '../../types'

type SceneMetaProps = {
  scene: Scene
  personaName: string
  voiceState: VoiceState
}

export function SceneMeta({ scene, personaName, voiceState }: SceneMetaProps) {
  return (
    <aside className="scene-meta" aria-label="当前场景信息">
      <div className="scene-meta-row">
        <span>Field</span>
        <strong className="scene-meta-value">{scene.order} / 04</strong>
      </div>
      <div className="scene-meta-row">
        <span>Persona</span>
        <strong className="scene-meta-value">{personaName}</strong>
      </div>
      <div className="scene-meta-row">
        <span>State</span>
        <strong className="scene-meta-value">{voiceState}</strong>
      </div>
    </aside>
  )
}