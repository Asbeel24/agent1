/**
 * Agent1 business protocol derived from the OpenTars user-journey document.
 *
 * This file deliberately models event names and business payloads only.
 * Authentication, the WebSocket envelope and binary audio framing still need
 * backend confirmation before a live transport is implemented.
 */

export const CLIENT_EVENTS = {
  onboardingAnswer: 'client.onboarding.answer',
  onboardingSkip: 'client.onboarding.skip',
  translationStart: 'client.translation.start',
  translationStop: 'client.translation.stop',
  taskCancel: 'client.task.cancel',
  reviewEvidence: 'client.review_candidates.evidence',
} as const

export const SERVER_EVENTS = {
  connected: 'server.connected',
  error: 'server.error',
  inputTranscript: 'server.input.transcript',
  onboardingStarted: 'server.onboarding.started',
  onboardingQuestion: 'server.onboarding.question',
  onboardingCompleted: 'server.onboarding.completed',
  translationSource: 'server.translation.source',
  translationTarget: 'server.translation.target',
  translationState: 'server.translation.state',
  taskSnapshot: 'server.task.snapshot',
  taskDraftCreated: 'server.task.draft_created',
  taskAwaitingDetails: 'server.task.awaiting_details',
  taskReady: 'server.task.ready',
  taskStarted: 'server.task.started',
  taskStepsCreated: 'server.task.steps_created',
  taskStepStarted: 'server.task.step_started',
  taskStepProgress: 'server.task.step_progress',
  taskStepCompleted: 'server.task.step_completed',
  taskProgress: 'server.task.progress',
  taskResultPending: 'server.task.result_pending_announcement',
  taskCompleted: 'server.task.completed',
  taskFailed: 'server.task.failed',
  taskCancelled: 'server.task.cancelled',
  ttsSentenceStart: 'server.tts.sentence.start',
  ttsSentenceEnd: 'server.tts.sentence.end',
} as const

export type TranslationStreamState =
  | 'armed'
  | 'ready'
  | 'recovering'
  | 'recovered'
  | 'unavailable'
  | 'stopped'

export type TaskStatus =
  | 'draft'
  | 'awaiting_details'
  | 'ready'
  | 'queued'
  | 'planning'
  | 'pending'
  | 'running'
  | 'retrying'
  | 'awaiting_confirmation'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export type ClientEventMap = {
  [CLIENT_EVENTS.onboardingAnswer]: {
    answer: string
    question_id?: string
  }
  [CLIENT_EVENTS.onboardingSkip]: Record<string, never>
  [CLIENT_EVENTS.translationStart]: {
    source_lang: string
    target_lang: string
  }
  [CLIENT_EVENTS.translationStop]: Record<string, never>
  [CLIENT_EVENTS.taskCancel]: {
    task_id: string
    reason: string
  }
  [CLIENT_EVENTS.reviewEvidence]: {
    candidate_id: string
  }
}

export type TranslationSegment = {
  stream_id: string
  sequence: number
  text: string
  final: boolean
  start_time_ms?: number
  end_time_ms?: number
}

export type TaskStep = {
  id: string
  title?: string
  status?: string
  progress?: number
  depends_on?: string[]
  updated_at?: string
}

export type TaskEvidence = {
  title?: string
  url?: string
  excerpt?: string
  published_at?: string
}

export type TaskArtifact = {
  name: string
  url: string
  media_type?: string
}

export type TaskSnapshot = {
  id: string
  status: TaskStatus
  context?: string
  clarification_question?: string
  missing_fields?: string[]
  progress?: number
  result?: string
  error?: string
  steps?: TaskStep[]
  evidence?: TaskEvidence[]
  artifacts?: TaskArtifact[]
  updated_at?: string
}

export type ServerEventMap = {
  [SERVER_EVENTS.connected]: {
    session_id?: string
  }
  [SERVER_EVENTS.error]: {
    code?: string
    message: string
    recoverable?: boolean
  }
  [SERVER_EVENTS.inputTranscript]: {
    text: string
    final: boolean
  }
  [SERVER_EVENTS.onboardingStarted]: {
    total_questions: number
  }
  [SERVER_EVENTS.onboardingQuestion]: {
    question: string
    question_id?: string
    index?: number
    total_questions?: number
  }
  [SERVER_EVENTS.onboardingCompleted]: {
    profile_summary?: string
  }
  [SERVER_EVENTS.translationSource]: TranslationSegment
  [SERVER_EVENTS.translationTarget]: TranslationSegment
  [SERVER_EVENTS.translationState]: {
    state: TranslationStreamState
    stream_id?: string
    message?: string
  }
  [SERVER_EVENTS.taskSnapshot]: {
    tasks: TaskSnapshot[]
  }
  [SERVER_EVENTS.taskDraftCreated]: TaskSnapshot
  [SERVER_EVENTS.taskAwaitingDetails]: TaskSnapshot
  [SERVER_EVENTS.taskReady]: TaskSnapshot
  [SERVER_EVENTS.taskStarted]: TaskSnapshot
  [SERVER_EVENTS.taskStepsCreated]: {
    task_id: string
    steps: TaskStep[]
  }
  [SERVER_EVENTS.taskStepStarted]: {
    task_id: string
    step: TaskStep
  }
  [SERVER_EVENTS.taskStepProgress]: {
    task_id: string
    step_id: string
    progress: number
    updated_at?: string
  }
  [SERVER_EVENTS.taskStepCompleted]: {
    task_id: string
    step: TaskStep
  }
  [SERVER_EVENTS.taskProgress]: {
    task_id: string
    progress: number
    message?: string
    updated_at?: string
  }
  [SERVER_EVENTS.taskResultPending]: {
    task_id: string
    result?: string
  }
  [SERVER_EVENTS.taskCompleted]: TaskSnapshot
  [SERVER_EVENTS.taskFailed]: TaskSnapshot
  [SERVER_EVENTS.taskCancelled]: TaskSnapshot
  [SERVER_EVENTS.ttsSentenceStart]: {
    text: string
    sentence_id?: string
  }
  [SERVER_EVENTS.ttsSentenceEnd]: {
    sentence_id?: string
  }
}

/**
 * Canonical event representation inside the frontend. The transport adapter
 * must convert the backend's confirmed wire envelope into this shape.
 */
type CanonicalEventUnion<EventMap> = {
  [Name in keyof EventMap & string]: {
    type: Name
    data: EventMap[Name]
  }
}[keyof EventMap & string]

export type Agent1ClientEvent = CanonicalEventUnion<ClientEventMap>
export type Agent1ServerEvent = CanonicalEventUnion<ServerEventMap>

export function createClientEvent<Name extends keyof ClientEventMap & string>(
  type: Name,
  data: ClientEventMap[Name],
): Extract<Agent1ClientEvent, { type: Name }> {
  return { type, data } as Extract<Agent1ClientEvent, { type: Name }>
}

type UnknownRecord = Record<string, unknown>

const taskStatuses = new Set<string>([
  'draft',
  'awaiting_details',
  'ready',
  'queued',
  'planning',
  'pending',
  'running',
  'retrying',
  'awaiting_confirmation',
  'succeeded',
  'failed',
  'cancelled',
])

const translationStreamStates = new Set<string>([
  'armed',
  'ready',
  'recovering',
  'recovered',
  'unavailable',
  'stopped',
])

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

function isTaskStep(value: unknown): value is TaskStep {
  return isRecord(value) && hasString(value, 'id')
}

function isTaskSnapshot(value: unknown): value is TaskSnapshot {
  if (!isRecord(value) || !hasString(value, 'id')) return false
  const status = value.status
  if (typeof status !== 'string' || !taskStatuses.has(status)) return false
  return value.steps === undefined || (Array.isArray(value.steps) && value.steps.every(isTaskStep))
}

function isTranslationSegment(value: unknown): value is TranslationSegment {
  return (
    isRecord(value) &&
    hasString(value, 'stream_id') &&
    hasNumber(value, 'sequence') &&
    hasString(value, 'text') &&
    hasBoolean(value, 'final')
  )
}

export function isAgent1ServerEvent(value: unknown): value is Agent1ServerEvent {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.data)) return false
  const data = value.data

  switch (value.type) {
    case SERVER_EVENTS.connected:
      return data.session_id === undefined || hasString(data, 'session_id')
    case SERVER_EVENTS.error:
      return hasString(data, 'message')
    case SERVER_EVENTS.inputTranscript:
      return hasString(data, 'text') && hasBoolean(data, 'final')
    case SERVER_EVENTS.onboardingStarted:
      return hasNumber(data, 'total_questions')
    case SERVER_EVENTS.onboardingQuestion:
      return hasString(data, 'question')
    case SERVER_EVENTS.onboardingCompleted:
      return data.profile_summary === undefined || hasString(data, 'profile_summary')
    case SERVER_EVENTS.translationSource:
    case SERVER_EVENTS.translationTarget:
      return isTranslationSegment(data)
    case SERVER_EVENTS.translationState:
      return typeof data.state === 'string' && translationStreamStates.has(data.state)
    case SERVER_EVENTS.taskSnapshot:
      return Array.isArray(data.tasks) && data.tasks.every(isTaskSnapshot)
    case SERVER_EVENTS.taskDraftCreated:
    case SERVER_EVENTS.taskAwaitingDetails:
    case SERVER_EVENTS.taskReady:
    case SERVER_EVENTS.taskStarted:
    case SERVER_EVENTS.taskCompleted:
    case SERVER_EVENTS.taskFailed:
    case SERVER_EVENTS.taskCancelled:
      return isTaskSnapshot(data)
    case SERVER_EVENTS.taskStepsCreated:
      return (
        hasString(data, 'task_id') &&
        Array.isArray(data.steps) &&
        data.steps.every(isTaskStep)
      )
    case SERVER_EVENTS.taskStepStarted:
    case SERVER_EVENTS.taskStepCompleted:
      return hasString(data, 'task_id') && isTaskStep(data.step)
    case SERVER_EVENTS.taskStepProgress:
      return (
        hasString(data, 'task_id') &&
        hasString(data, 'step_id') &&
        hasNumber(data, 'progress')
      )
    case SERVER_EVENTS.taskProgress:
      return hasString(data, 'task_id') && hasNumber(data, 'progress')
    case SERVER_EVENTS.taskResultPending:
      return hasString(data, 'task_id')
    case SERVER_EVENTS.ttsSentenceStart:
      return hasString(data, 'text')
    case SERVER_EVENTS.ttsSentenceEnd:
      return data.sentence_id === undefined || hasString(data, 'sentence_id')
    default:
      return false
  }
}
