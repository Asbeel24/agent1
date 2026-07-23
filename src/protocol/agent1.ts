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
  | 'running'
  | 'awaiting_confirmation'
  | 'completed'
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
    reason: 'task_ink' | string
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

type EventUnion<EventMap> = {
  [Name in keyof EventMap & string]: {
    type: Name
    data: EventMap[Name]
  }
}[keyof EventMap & string]

export type Agent1ClientEvent = EventUnion<ClientEventMap>
export type Agent1ServerEvent = EventUnion<ServerEventMap>

export function createClientEvent<Name extends keyof ClientEventMap & string>(
  type: Name,
  data: ClientEventMap[Name],
): Extract<Agent1ClientEvent, { type: Name }> {
  return { type, data } as Extract<Agent1ClientEvent, { type: Name }>
}

const serverEventNames = new Set<string>(Object.values(SERVER_EVENTS))

export function isAgent1ServerEvent(value: unknown): value is Agent1ServerEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as { type?: unknown; data?: unknown }
  return (
    typeof candidate.type === 'string' &&
    serverEventNames.has(candidate.type) &&
    typeof candidate.data === 'object' &&
    candidate.data !== null
  )
}
