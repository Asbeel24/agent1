import type {
  Agent1Config,
  AuthMeResponse,
  AuthResult,
  CalendarTaskResponse,
  DailyTaskResponse,
  DeviceInput,
  HealthResponse,
  MeetingAsset,
  MeetingAssetListResponse,
  MeetingCreateInput,
  MeetingCreateResponse,
  MeetingDetail,
  MeetingListResponse,
  MeetingSettings,
  MeetingShareStatus,
  MeetingSpeakerAliasesResponse,
  MeetingSummary,
  MeetingUpload,
  MeetingUploadInitializeInput,
  MeetingUploadTarget,
  MeetingUploadTest,
  PersonaMarketResponse,
  PersonaTwin,
  PublicMeetingDocument,
  ReadinessResponse,
  SuggestionDecisionResponse,
  TaskStatusResponse,
  Transcript,
} from './contracts'
import { agent1Http, type Agent1HttpClient } from './httpClient'

function jsonBody(value: unknown): Pick<RequestInit, 'body' | 'headers'> {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  }
}

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined) query.set(key, String(value))
  })
  const serialized = query.toString()
  return serialized ? `?${serialized}` : ''
}

export class Agent1Api {
  constructor(readonly http: Agent1HttpClient = agent1Http) {}

  getHealth(): Promise<HealthResponse> {
    return this.http.request('/healthz', { authenticated: false })
  }

  getReadiness(): Promise<ReadinessResponse> {
    return this.http.request('/readyz', { authenticated: false })
  }

  getConfig(): Promise<Agent1Config> {
    return this.http.request('/v1/config', { authenticated: false })
  }

  async login(email: string, password: string, device: DeviceInput): Promise<AuthResult> {
    const result = await this.http.request<AuthResult>('/v1/auth/login', {
      method: 'POST',
      authenticated: false,
      ...jsonBody({ email, password, device }),
    })
    this.http.tokens.setTokens(result)
    return result
  }

  async register(
    email: string,
    password: string,
    displayName: string,
    device: DeviceInput,
  ): Promise<AuthResult> {
    const result = await this.http.request<AuthResult>('/v1/auth/register', {
      method: 'POST',
      authenticated: false,
      ...jsonBody({ email, password, display_name: displayName, device }),
    })
    this.http.tokens.setTokens(result)
    return result
  }

  async logout(): Promise<void> {
    try {
      await this.http.request<void>('/v1/auth/logout', { method: 'POST' })
    } finally {
      this.http.tokens.clear()
    }
  }

  getMe(): Promise<AuthMeResponse> {
    return this.http.request('/v1/me')
  }

  getDailyTasks(input: {
    date: string
    timezone: string
    limit?: number
    cursor?: string
  }): Promise<DailyTaskResponse> {
    return this.http.request(
      `/v1/tasks${queryString(input)}`,
    )
  }

  getCalendarTasks(input: {
    start_date: string
    end_date: string
    timezone: string
    include_unscheduled?: boolean
    limit?: number
  }): Promise<CalendarTaskResponse> {
    return this.http.request(
      `/v1/tasks${queryString(input)}`,
    )
  }

  getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
    return this.http.request(`/v1/tasks/${encodeURIComponent(taskId)}/status`)
  }

  cancelTask(taskId: string, reason?: string): Promise<{ ok: boolean; task_id: string; reason: string }> {
    return this.http.request(`/v1/tasks/${encodeURIComponent(taskId)}/cancel`, {
      method: 'POST',
      ...(reason ? jsonBody({ reason }) : {}),
    })
  }

  decideSuggestedTask(
    taskId: string,
    decision: 'confirm' | 'ignore',
    expectedVersion: number,
  ): Promise<SuggestionDecisionResponse> {
    return this.http.request(`/v1/tasks/${encodeURIComponent(taskId)}/suggestion-decision`, {
      method: 'POST',
      ...jsonBody({ decision, expected_version: expectedVersion }),
    })
  }

  getPersonaTwin(): Promise<PersonaTwin> {
    return this.http.request('/v1/persona-twin')
  }

  generatePersonaTwin(): Promise<PersonaTwin> {
    return this.http.request('/v1/persona-twin/generate', { method: 'POST' })
  }

  publishPersonaTwin(): Promise<PersonaTwin> {
    return this.http.request('/v1/persona-twin/publish', { method: 'POST' })
  }

  unpublishPersonaTwin(): Promise<PersonaTwin> {
    return this.http.request('/v1/persona-twin/unpublish', { method: 'POST' })
  }

  renamePersonaTwin(name: string): Promise<PersonaTwin> {
    return this.http.request('/v1/persona-twin/name', {
      method: 'PATCH',
      ...jsonBody({ name }),
    })
  }

  getPersonaMarket(limit = 50, cursor?: string): Promise<PersonaMarketResponse> {
    return this.http.request(
      `/v1/persona-twins/market${queryString({ limit, cursor })}`,
    )
  }

  getMeetingSettings(): Promise<MeetingSettings> {
    return this.http.request('/v1/meeting-settings')
  }

  updateMeetingSettings(settings: MeetingSettings): Promise<MeetingSettings> {
    return this.http.request('/v1/meeting-settings', {
      method: 'PUT',
      ...jsonBody(settings),
    })
  }

  getMeetings(): Promise<MeetingListResponse> {
    return this.http.request('/v1/meetings')
  }

  getMeeting(meetingId: string): Promise<MeetingDetail> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}`)
  }

  createMeeting(input: MeetingCreateInput): Promise<MeetingCreateResponse> {
    return this.http.request('/v1/meetings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': input.file_sha256,
      },
      body: JSON.stringify(input),
    })
  }

  deleteMeeting(meetingId: string): Promise<void> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}`, {
      method: 'DELETE',
    })
  }

  getTranscript(meetingId: string): Promise<Transcript> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/transcript`)
  }

  getSummary(meetingId: string): Promise<MeetingSummary> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/summary`)
  }

  transcribeMeeting(meetingId: string): Promise<{ meeting_id: string; status: string }> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/transcribe`, {
      method: 'POST',
    })
  }

  summarizeMeeting(meetingId: string): Promise<{ meeting_id: string; status: string }> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/summarize`, {
      method: 'POST',
    })
  }

  updateMeetingSpeakerAliases(
    meetingId: string,
    aliases: Record<string, string>,
  ): Promise<MeetingSpeakerAliasesResponse> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/speaker-aliases`, {
      method: 'PUT',
      ...jsonBody({ aliases }),
    })
  }

  listMeetingAssets(meetingId: string): Promise<MeetingAssetListResponse> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/assets`)
  }

  uploadMeetingAsset(
    meetingId: string,
    assetType: string,
    body: Blob | ArrayBuffer,
    contentType = 'application/octet-stream',
  ): Promise<MeetingAsset> {
    return this.http.request(
      `/v1/meetings/${encodeURIComponent(meetingId)}/assets/${encodeURIComponent(assetType)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body,
      },
    )
  }

  downloadMeetingAsset(meetingId: string, assetType: string): Promise<Blob> {
    return this.http.request(
      `/v1/meetings/${encodeURIComponent(meetingId)}/assets/${encodeURIComponent(assetType)}`,
    )
  }

  downloadMeetingAudio(meetingId: string): Promise<Blob> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/audio`)
  }

  downloadMeetingCapability(token: string): Promise<Blob> {
    return this.http.request(`/v1/meeting-assets/access/${encodeURIComponent(token)}`, {
      authenticated: false,
    })
  }

  initializeMeetingUpload(
    input: MeetingUploadInitializeInput,
    idempotencyKey: string,
  ): Promise<MeetingUpload> {
    return this.http.request('/v1/meeting-uploads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(input),
    })
  }

  getMeetingUpload(uploadId: string): Promise<MeetingUpload> {
    return this.http.request(`/v1/meeting-uploads/${encodeURIComponent(uploadId)}`)
  }

  refreshMeetingUploadCredentials(uploadId: string): Promise<MeetingUploadTarget> {
    return this.http.request(
      `/v1/meeting-uploads/${encodeURIComponent(uploadId)}/credentials`,
      { method: 'POST' },
    )
  }

  completeMeetingUpload(uploadId: string): Promise<MeetingUpload> {
    return this.http.request(`/v1/meeting-uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: 'POST',
    })
  }

  abortMeetingUpload(uploadId: string): Promise<void> {
    return this.http.request(`/v1/meeting-uploads/${encodeURIComponent(uploadId)}`, {
      method: 'DELETE',
    })
  }

  createMeetingUploadTest(): Promise<MeetingUploadTest> {
    return this.http.request('/v1/meeting-upload-tests', { method: 'POST' })
  }

  deleteMeetingUploadTest(testId: string): Promise<void> {
    return this.http.request(`/v1/meeting-upload-tests/${encodeURIComponent(testId)}`, {
      method: 'DELETE',
    })
  }

  getMeetingShare(meetingId: string): Promise<MeetingShareStatus> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/share`)
  }

  createMeetingShare(meetingId: string): Promise<MeetingShareStatus> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/share`, {
      method: 'POST',
    })
  }

  revokeMeetingShare(meetingId: string): Promise<void> {
    return this.http.request(`/v1/meetings/${encodeURIComponent(meetingId)}/share`, {
      method: 'DELETE',
    })
  }

  getPublicMeetingShare(token: string): Promise<PublicMeetingDocument> {
    return this.http.request(`/v1/public/meeting-shares/${encodeURIComponent(token)}`, {
      authenticated: false,
    })
  }
}

export const agent1Api = new Agent1Api()
