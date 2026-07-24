import type { Task } from '../types'
import { mockTasks } from './mock'
import { simulateLatency } from './types'

export async function getTasks(): Promise<Task[]> {
  await simulateLatency()
  return mockTasks
}