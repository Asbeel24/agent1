import type { MicrophoneState, VoiceState } from '../../types'

type VoiceTriggerProps = {
  voiceState: VoiceState
  microphoneState: MicrophoneState
  recordingSeconds: number
  recordingTime: string
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void
}

export function VoiceTrigger({
  voiceState,
  microphoneState,
  recordingSeconds,
  recordingTime,
  onClick,
}: VoiceTriggerProps) {
  const label =
    microphoneState === 'requesting'
      ? '请求麦克风'
      : microphoneState === 'denied'
        ? '麦克风未授权'
        : voiceState === 'idle'
          ? '开始录音'
          : voiceState === 'listening'
            ? '结束录音'
            : '再次录音'

  return (
    <button
      className="voice-trigger interactive-target"
      data-state={voiceState}
      type="button"
      onClick={onClick}
      aria-label={
        voiceState === 'idle'
          ? '开始录音'
          : voiceState === 'listening'
            ? '结束录音'
            : '再次录音'
      }
    >
      <span className="voice-bars" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span>{label}</span>
      {voiceState === 'listening' && microphoneState === 'active' && (
        <time className="voice-time" dateTime={`PT${recordingSeconds}S`} aria-live="polite">
          REC&nbsp; {recordingTime}
        </time>
      )}
    </button>
  )
}