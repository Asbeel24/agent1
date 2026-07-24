import type {
  Agent1Config,
  AuthResult,
  CalendarTaskResponse,
  DailyTaskResponse,
  DeviceInput,
  MeetingDetail,
  MeetingListResponse,
  MeetingSettings,
  MeetingSummary,
  PersonaMarketResponse,
  PersonaTwin,
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
  ): Promise<{ task: Record<string, unknown>; changed: boolean }> {
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
}

export const agent1Api = new Agent1Api()
