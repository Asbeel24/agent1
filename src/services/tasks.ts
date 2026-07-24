import type { Task } from '../types'
import { agent1Api, agent1Runtime } from '../api'
import { mockTasks } from './mock'
import { simulateLatency } from './types'

export async function getTasks(): Promise<Task[]> {
  if (agent1Runtime.liveApiEnabled && agent1Api.http.tokens.getAccessToken()) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
    const date = formatDateInTimezone(new Date(), timezone)
    const response = await agent1Api.getDailyTasks({ date, timezone, limit: 50 })
    return response.tasks.map((task) => ({
      id: task.task_id,
      time: formatTime(task.created_at),
      title: task.context || task.task_type,
      progress: task.progress || taskStateLabel(task.state),
    }))
  }

  await simulateLatency()
  return mockTasks
}

function formatDateInTimezone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function formatTime(unixSeconds: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(unixSeconds * 1_000))
}

function taskStateLabel(state: string): string {
  const labels: Record<string, string> = {
    suggested: '待确认',
    awaiting_details: '待补充',
    ready: '已就绪',
    scheduled: '已计划',
    pending_dispatch: '等待调度',
    pending: '等待中',
    running: '进行中',
    succeeded: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return labels[state] ?? state
}
