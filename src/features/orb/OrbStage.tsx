import { ParticleOrb } from '../../components/ParticleOrb'
import type { MicrophoneState, VoiceState } from '../../types'
import type { OrbMode } from '../../components/ParticleOrb'
import { VoiceTrigger } from './VoiceTrigger'

type OrbStageProps = {
  mode: OrbMode
  voiceState: VoiceState
  microphoneState: MicrophoneState
  recordingSeconds: number
  recordingTime: string
  onActivate: () => void
  onToggleVoice: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function OrbStage({
  mode,
  voiceState,
  microphoneState,
  recordingSeconds,
  recordingTime,
  onActivate,
  onToggleVoice,
}: OrbStageProps) {
  return (
    <div
      className="orb-stage interactive-target"
      data-voice-state={voiceState}
      data-microphone-state={microphoneState}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) return
        onActivate()
      }}
    >
      <div className="orb-grid" aria-hidden="true">
        <i />
      </div>
      <div className="orb-coordinate orb-coordinate--top" aria-hidden="true">
        <span>Y</span>
        <i />
      </div>
      <div className="orb-coordinate orb-coordinate--side" aria-hidden="true">
        <span>X</span>
        <i />
      </div>
      <ParticleOrb mode={mode} showControls={false} />
      <VoiceTrigger
        voiceState={voiceState}
        microphoneState={microphoneState}
        recordingSeconds={recordingSeconds}
        recordingTime={recordingTime}
        onClick={(event) => {
          event.stopPropagation()
          onToggleVoice(event)
        }}
      />
    </div>
  )
}