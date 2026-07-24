import type { ProfileSettings, VoiceSettings } from '../protocol/agent1'

export type ApiErrorPayload = {
  error:
    | string
    | {
        code: string
        message: string
      }
}
export type DeviceInput = {
  platform_family: string
  installation_id: string
  platform?: string
  device_name?: string
  app_version?: string
  push_token?: string
}

export type AuthUser = {
  id: string
  display_name: string
  locale: string
  timezone: string
}

export type AuthDevice = {
  id: string
  platform_family: string
  platform: string
  installation_id: string
  device_name: string
  app_version: string
}

export type AuthSession = {
  id: string
  platform_family: string
  status: string
  expires_at: string
}

export type AuthResult = {
  access_token: string
  refresh_token: string
  user: AuthUser
  device: AuthDevice
  auth_session: AuthSession
}

export type TranslationLanguage = {
  code: string
  name: string
  native_name: string
}

export type TranslationPair = {
  source_lang: string
  target_lang: string
}

export type Agent1Config = {
  voice: VoiceSettings
  profile: ProfileSettings
  translation: {
    provider: string
    mode: string
    default_pair: TranslationPair
    languages: TranslationLanguage[]
    supported_pairs: TranslationPair[]
  }
}

export type TaskState =
  | 'suggested'
  | 'draft'
  | 'awaiting_details'
  | 'ready'
  | 'scheduled'
  | 'pending_dispatch'
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | string

export type DailyTask = {
  task_id: string
  task_type: string
  session_id: string
  context: string
  state: TaskState
  progress: string
  result: string
  error_message: string
  announcement_state: string
  created_at: number
  updated_at: number
  completed_at: number
}

export type DailyTaskResponse = {
  date: string
  timezone: string
  total: number
  tasks: DailyTask[]
  next_cursor: string
}

export type CalendarTask = {
  task_id: string
  title: string
  context: string
  task_type: string
  origin: string
  state: TaskState
  status_reason: string
  version: number
  created_session_id: string
  scheduled_at: number
  scheduled_local_date: string
  schedule_timezone: string
  schedule_precision: string
  missing_fields: string[]
  clarification_question: string
  evidence_excerpts: string[]
  suggestion_reason: string
  announcement_state: string
  created_at: number
  updated_at: number
  completed_at: number | null
}

export type CalendarTaskResponse = {
  start_date: string
  end_date: string
  timezone: string
  tasks: CalendarTask[]
}

export type TaskStatusResponse = {
  task: {
    id: string
    draft_id: string
    provider: string
    provider_task_id: string
    session_key: string
    session_id: string
    context: string
    state: TaskState
    progress: string
    result: string
    error_message: string
    created_at: string
    updated_at: string
    last_updated: string
  }
  report: string
  found: boolean
}

export type PersonaTwin = {
  id: string
  name: string
  summary: string
  prompt: string
  source_profile_count: number
  source_turn_count: number
  generator_model: string
  version: number
  is_published: boolean
  use_count: number
  published_at: string
  created_at: string
  updated_at: string
}

export type PersonaMarketItem = Pick<
  PersonaTwin,
  'id' | 'name' | 'summary' | 'use_count' | 'created_at' | 'updated_at'
>

export type PersonaMarketResponse = {
  items: PersonaMarketItem[]
  next_cursor: string
}

export type MeetingSettings = {
  speaker_diarization_enabled: boolean
}

export type MeetingProcessingStatus =
  | 'none'
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'verifying'
  | 'transcription_queued'
  | 'transcribing'
  | 'summary_queued'
  | 'summarizing'
  | 'ready'
  | string

export type Meeting = {
  meeting_id: string
  session_id?: string
  title: string
  started_at?: string
  ended_at?: string
  duration_ms?: number
  sample_rate?: number
  format?: string
  bytes_written?: number
  transcription_status?: string
  summary_status?: string
  transcript_preview?: string
  summary_preview?: string
  valid?: boolean
  error?: string
  recording_sha256?: string
  processing_status: MeetingProcessingStatus
  upload_status?: string
  speaker_diarization_enabled?: boolean
}

export type MeetingListResponse = {
  meetings: Meeting[]
}

export type MeetingDetail = Meeting & {
  speaker_aliases?: Record<string, string>
  audio?: MeetingCapabilityLink
  transcript?: MeetingCapabilityLink
}

export type MeetingCapabilityLink = {
  url: string
  expires_at: number
  checksum_sha256: string
  content_type: string
  bytes_written: number
}

export type Transcript = {
  schema_version: 1
  meeting_id: string
  created_at: string
  language: string
  speakers?: Array<{
    speaker_id: string
    display_name: string
    alias: string
  }>
  segments: Array<{
    start_ms: number
    end_ms: number
    speaker_id?: string
    speaker_name?: string
    text: string
  }>
  text: string
}

export type MeetingSummary = {
  schema_version: 2
  generated_at: number
  meeting_id: string
  title: string
  overview: string
  key_points: Array<{ text: string; source_start_ms: number | null }>
  action_items: Array<{
    title: string
    description: string
    owner_text: string
    due_text: string
    source_start_ms: number | null
  }>
  chapters: Array<{
    title: string
    start_ms: number
    end_ms: number
    summary: string
    key_points: string[]
  }>
  decisions: Array<{
    decision: string
    rationale: string
    source_start_ms: number | null
  }>
  highlights: Array<{
    quote: string
    context: string
    source_start_ms: number | null
  }>
}
