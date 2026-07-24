/**
 * Agent1 AppWS protocol.
 *
 * Source of truth: OpenTars HTTP API 与 AppWS 接口文档 (2026-07-24).
 * AppWS uses JSON text envelopes shaped as { id?, event, data? }.
 */

export const CLIENT_EVENTS = {
  inputAudioAppend: 'client.input.audio.append',
  inputAudioCommit: 'client.input.audio.commit',
  sessionInputReset: 'client.session.input_reset',
  inputAudioBufferClear: 'client.input_audio_buffer.clear',
  ping: 'client.ping',
  responseAudioFeedback: 'client.response.audio.feedback',
  taskCancel: 'client.task.cancel',
  onboardingAnswer: 'client.onboarding.answer',
  onboardingSkip: 'client.onboarding.skip',
  translationStart: 'client.translation.start',
  translationStop: 'client.translation.stop',
  voiceSelect: 'client.voice.select',
  profileSelect: 'client.profile.select',
  memoryUndo: 'client.memory.undo',
} as const

export const SERVER_EVENTS = {
  connected: 'server.connected',
  cloudEvent: 'server.cloud_event',
  error: 'server.error',
  responseAudio: 'server.response.audio',
  responseAudioInterrupt: 'server.response.audio.interrupt',
  speechStarted: 'server.input_audio_buffer.speech_started',
  speechStopped: 'server.input_audio_buffer.speech_stopped',
  inputTranscript: 'server.input.transcript',
  responseTranscript: 'server.response.transcript',
  ttsSentenceStart: 'server.tts.sentence.start',
  ttsSentenceEnd: 'server.tts.sentence.end',
  sessionModeChanged: 'server.session.mode.changed',
  voiceSettings: 'server.voice.settings',
  voiceChanged: 'server.voice.changed',
  profileSettings: 'server.profile.settings',
  profileChanged: 'server.profile.changed',
  taskStarted: 'server.task.started',
  taskProgress: 'server.task.progress',
  taskCompleted: 'server.task.completed',
  taskFailed: 'server.task.failed',
  taskCancelled: 'server.task.cancelled',
  taskDraftCreated: 'server.task.draft_created',
  taskAwaitingDetails: 'server.task.awaiting_details',
  taskReady: 'server.task.ready',
  taskResultPending: 'server.task.result_pending_announcement',
  taskStepsCreated: 'server.task.steps_created',
  taskStepStarted: 'server.task.step_started',
  taskStepProgress: 'server.task.step_progress',
  taskStepCompleted: 'server.task.step_completed',
  taskStepFailed: 'server.task.step_failed',
  taskStepCancelled: 'server.task.step_cancelled',
  onboardingStarted: 'server.onboarding.started',
  onboardingQuestion: 'server.onboarding.question',
  onboardingCompleted: 'server.onboarding.completed',
  onboardingSkipped: 'server.onboarding.skipped',
  memoryChanged: 'server.memory.changed',
  memoryUndoResult: 'server.memory.undo_result',
  healthAlert: 'server.health.alert',
  healthPolicyChanged: 'server.health.policy.changed',
  healthAlertDismissed: 'server.health.alert.dismissed',
} as const

export type AppWsEnvelope<EventName extends string = string, Data = unknown> = {
  id?: string
  event: EventName
  data?: Data
}

export type AudioPacket = {
  format: string
  sample_rate: number
  data: string
}

export type InputAudioPacket = AudioPacket & {
  format: 'pcm'
}

export type VoiceOption = {
  id: string
  label: string
  description: string
  provider: string
  voice: string
  profile_id: string
  preview_text: string
  selected: boolean
  available: boolean
  disabled_reason: string
  live_update_supported: boolean
}

export type VoiceSettings = {
  provider: string
  current_voice_id: string
  current_voice: string
  options: VoiceOption[]
}

export type ProfileOption = {
  id: string
  label: string
  description: string
  recommended_voice_id: string
  preview_text: string
  selected: boolean
  available: boolean
  disabled_reason: string
}

export type ProfileSettings = {
  current_profile_id: string
  current_profile: string
  options: ProfileOption[]
}

export type TaskDraft = {
  draft_id: string
  session_id: string
  original_text: string
  task_type: string
  slots: Record<string, unknown>
  missing_fields: string[]
  clarification_question: string
  state: 'draft' | 'awaiting_details' | 'ready' | string
  updated_at: number
}

export type TaskStep = {
  step_id: string
  root_task_id: string
  provider: string
  provider_task_id: string
  session_key: string
  title: string
  instruction: string
  depends_on: string[]
  state: string
  progress: string
  result: string
  error: string
  started_at: number
  completed_at: number
  updated_at: number
}

export type TaskStepEvent = {
  step_id: string
  root_task_id: string
  provider: string
  provider_task_id: string
  session_key: string
  state: string
  message: string
  result: string
  error: string
  elapsed_seconds: number
  updated_at: number
}

export type ClientEventMap = {
  [CLIENT_EVENTS.inputAudioAppend]: InputAudioPacket
  [CLIENT_EVENTS.inputAudioCommit]: undefined
  [CLIENT_EVENTS.sessionInputReset]: undefined
  [CLIENT_EVENTS.inputAudioBufferClear]: undefined
  [CLIENT_EVENTS.ping]: undefined
  [CLIENT_EVENTS.responseAudioFeedback]: {
    event: string
    sample_rate?: number
    data_size?: number
  }
  [CLIENT_EVENTS.taskCancel]: {
    task_id?: string
    reason?: string
  }
  [CLIENT_EVENTS.onboardingAnswer]: {
    index: number
    answer: string
  }
  [CLIENT_EVENTS.onboardingSkip]: undefined
  [CLIENT_EVENTS.translationStart]: {
    source_lang?: string
    target_lang?: string
  }
  [CLIENT_EVENTS.translationStop]: undefined
  [CLIENT_EVENTS.voiceSelect]: {
    voice_id: string
  }
  [CLIENT_EVENTS.profileSelect]: {
    profile_id: string
  }
  [CLIENT_EVENTS.memoryUndo]: {
    request_id?: string
    change_id: string
  }
}

export type ServerEventMap = {
  [SERVER_EVENTS.connected]: {
    session_id: string
  }
  [SERVER_EVENTS.cloudEvent]: {
    type: string
    payload: Record<string, unknown>
  }
  [SERVER_EVENTS.error]: {
    code: string
    message: string
  }
  [SERVER_EVENTS.responseAudio]: AudioPacket & {
    source?: 'voice_agent' | 'translation' | string
  }
  [SERVER_EVENTS.responseAudioInterrupt]: {
    reason?: string
  }
  [SERVER_EVENTS.speechStarted]: null
  [SERVER_EVENTS.speechStopped]: null
  [SERVER_EVENTS.inputTranscript]: {
    text: string
    final: boolean
  }
  [SERVER_EVENTS.responseTranscript]: {
    text: string
    reply_id?: string
  }
  [SERVER_EVENTS.ttsSentenceStart]: {
    text: string
    sample_rate: number
  }
  [SERVER_EVENTS.ttsSentenceEnd]: {
    text: string
    sample_rate: number
  }
  [SERVER_EVENTS.sessionModeChanged]: {
    mode: 'voice_agent' | 'translation' | string
    reason?: string
  }
  [SERVER_EVENTS.voiceSettings]: VoiceSettings
  [SERVER_EVENTS.voiceChanged]: VoiceSettings & {
    applied: boolean
    live_update: boolean
    reason?: string
  }
  [SERVER_EVENTS.profileSettings]: ProfileSettings
  [SERVER_EVENTS.profileChanged]: ProfileSettings & {
    applied: boolean
    live_update: boolean
    reason?: string
  }
  [SERVER_EVENTS.taskStarted]: {
    task_id: string
    context: string
    started_at: number
  }
  [SERVER_EVENTS.taskProgress]: {
    task_id: string
    state: string
    message?: string
    elapsed_seconds: number
  }
  [SERVER_EVENTS.taskCompleted]: {
    task_id: string
    result?: string
    elapsed_seconds: number
  }
  [SERVER_EVENTS.taskFailed]: {
    task_id: string
    error?: string
    elapsed_seconds: number
  }
  [SERVER_EVENTS.taskCancelled]: {
    task_id: string
    reason?: string
    elapsed_seconds: number
  }
  [SERVER_EVENTS.taskDraftCreated]: TaskDraft
  [SERVER_EVENTS.taskAwaitingDetails]: TaskDraft
  [SERVER_EVENTS.taskReady]: TaskDraft
  [SERVER_EVENTS.taskResultPending]: {
    task_id: string
    result?: string
    announcement_state: string
    updated_at: number
  }
  [SERVER_EVENTS.taskStepsCreated]: {
    root_task_id: string
    steps: TaskStep[]
  }
  [SERVER_EVENTS.taskStepStarted]: TaskStepEvent
  [SERVER_EVENTS.taskStepProgress]: TaskStepEvent
  [SERVER_EVENTS.taskStepCompleted]: TaskStepEvent
  [SERVER_EVENTS.taskStepFailed]: TaskStepEvent
  [SERVER_EVENTS.taskStepCancelled]: TaskStepEvent
  [SERVER_EVENTS.onboardingStarted]: {
    total: number
  }
  [SERVER_EVENTS.onboardingQuestion]: {
    index: number
    total: number
    text: string
    category: string
    is_last: boolean
  }
  [SERVER_EVENTS.onboardingCompleted]: {
    profile_summary: Array<{ key: string; content: string }>
    total_answered: number
  }
  [SERVER_EVENTS.onboardingSkipped]: Record<string, never>
  [SERVER_EVENTS.memoryChanged]: {
    change_id: string
    kind: string
    summary: string
    undoable: boolean
  }
  [SERVER_EVENTS.memoryUndoResult]: {
    request_id: string
    ok: boolean
    change?: {
      change_id: string
      kind: string
      summary: string
      undoable: boolean
    }
    code: string
    message: string
  }
  [SERVER_EVENTS.healthAlert]: Record<string, unknown>
  [SERVER_EVENTS.healthPolicyChanged]: Record<string, unknown>
  [SERVER_EVENTS.healthAlertDismissed]: {
    alert_id: string
  }
}

type EventUnion<EventMap> = {
  [Name in keyof EventMap & string]: AppWsEnvelope<Name, EventMap[Name]>
}[keyof EventMap & string]

export type Agent1ClientEvent = EventUnion<ClientEventMap>
export type Agent1ServerEvent = EventUnion<ServerEventMap>

export function createClientEvent<Name extends keyof ClientEventMap & string>(
  event: Name,
  data: ClientEventMap[Name],
  id?: string,
): Extract<Agent1ClientEvent, { event: Name }> {
  const envelope: AppWsEnvelope<Name, ClientEventMap[Name]> = { event }
  if (id) envelope.id = id
  if (data !== undefined) envelope.data = data
  return envelope as Extract<Agent1ClientEvent, { event: Name }>
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasString(record: UnknownRecord, key: string): boolean {
  return typeof record[key] === 'string'
}

function hasNumber(record: UnknownRecord, key: string): boolean {
  return typeof record[key] === 'number' && Number.isFinite(record[key])
}

function hasBoolean(record: UnknownRecord, key: string): boolean {
  return typeof record[key] === 'boolean'
}

export function isAppWsEnvelope(value: unknown): value is AppWsEnvelope {
  if (!isRecord(value) || !hasString(value, 'event')) return false
  if (value.id !== undefined && typeof value.id !== 'string') return false
  return value.data === undefined || value.data === null || isRecord(value.data)
}

export function isAgent1ServerEvent(value: unknown): value is Agent1ServerEvent {
  if (!isAppWsEnvelope(value)) return false
  const data = value.data

  switch (value.event) {
    case SERVER_EVENTS.speechStarted:
    case SERVER_EVENTS.speechStopped:
      return data === null
    case SERVER_EVENTS.onboardingSkipped:
      return isRecord(data)
    default:
      if (!isRecord(data)) return false
  }

  switch (value.event) {
    case SERVER_EVENTS.connected:
      return hasString(data, 'session_id')
    case SERVER_EVENTS.cloudEvent:
      return hasString(data, 'type') && isRecord(data.payload)
    case SERVER_EVENTS.error:
      return hasString(data, 'code') && hasString(data, 'message')
    case SERVER_EVENTS.responseAudio:
      return (
        hasString(data, 'format') &&
        hasNumber(data, 'sample_rate') &&
        hasString(data, 'data')
      )
    case SERVER_EVENTS.responseAudioInterrupt:
      return data.reason === undefined || hasString(data, 'reason')
    case SERVER_EVENTS.inputTranscript:
      return hasString(data, 'text') && hasBoolean(data, 'final')
    case SERVER_EVENTS.responseTranscript:
      return hasString(data, 'text')
    case SERVER_EVENTS.ttsSentenceStart:
    case SERVER_EVENTS.ttsSentenceEnd:
      return hasString(data, 'text') && hasNumber(data, 'sample_rate')
    case SERVER_EVENTS.sessionModeChanged:
      return hasString(data, 'mode')
    case SERVER_EVENTS.taskStarted:
      return (
        hasString(data, 'task_id') &&
        hasString(data, 'context') &&
        hasNumber(data, 'started_at')
      )
    case SERVER_EVENTS.taskProgress:
      return (
        hasString(data, 'task_id') &&
        hasString(data, 'state') &&
        hasNumber(data, 'elapsed_seconds')
      )
    case SERVER_EVENTS.taskCompleted:
    case SERVER_EVENTS.taskFailed:
    case SERVER_EVENTS.taskCancelled:
      return hasString(data, 'task_id') && hasNumber(data, 'elapsed_seconds')
    case SERVER_EVENTS.taskDraftCreated:
    case SERVER_EVENTS.taskAwaitingDetails:
    case SERVER_EVENTS.taskReady:
      return (
        hasString(data, 'draft_id') &&
        hasString(data, 'session_id') &&
        hasString(data, 'state') &&
        hasNumber(data, 'updated_at')
      )
    case SERVER_EVENTS.taskResultPending:
      return (
        hasString(data, 'task_id') &&
        hasString(data, 'announcement_state') &&
        hasNumber(data, 'updated_at')
      )
    case SERVER_EVENTS.taskStepsCreated:
      return hasString(data, 'root_task_id') && Array.isArray(data.steps)
    case SERVER_EVENTS.taskStepStarted:
    case SERVER_EVENTS.taskStepProgress:
    case SERVER_EVENTS.taskStepCompleted:
    case SERVER_EVENTS.taskStepFailed:
    case SERVER_EVENTS.taskStepCancelled:
      return (
        hasString(data, 'step_id') &&
        hasString(data, 'root_task_id') &&
        hasString(data, 'state') &&
        hasNumber(data, 'elapsed_seconds')
      )
    case SERVER_EVENTS.onboardingStarted:
      return hasNumber(data, 'total')
    case SERVER_EVENTS.onboardingQuestion:
      return (
        hasNumber(data, 'index') &&
        hasNumber(data, 'total') &&
        hasString(data, 'text') &&
        hasBoolean(data, 'is_last')
      )
    case SERVER_EVENTS.onboardingCompleted:
      return Array.isArray(data.profile_summary) && hasNumber(data, 'total_answered')
    case SERVER_EVENTS.memoryChanged:
      return (
        hasString(data, 'change_id') &&
        hasString(data, 'summary') &&
        hasBoolean(data, 'undoable')
      )
    case SERVER_EVENTS.memoryUndoResult:
      return hasString(data, 'request_id') && hasBoolean(data, 'ok')
    case SERVER_EVENTS.voiceSettings:
    case SERVER_EVENTS.voiceChanged:
      return hasString(data, 'current_voice_id') && Array.isArray(data.options)
    case SERVER_EVENTS.profileSettings:
    case SERVER_EVENTS.profileChanged:
      return hasString(data, 'current_profile_id') && Array.isArray(data.options)
    case SERVER_EVENTS.healthAlert:
    case SERVER_EVENTS.healthPolicyChanged:
      return true
    case SERVER_EVENTS.healthAlertDismissed:
      return hasString(data, 'alert_id')
    default:
      return false
  }
}
