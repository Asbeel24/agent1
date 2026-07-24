import type { Scene } from '../types'
import { mockScenes } from './mock'
import { simulateLatency } from './types'

export async function getScenes(): Promise<Scene[]> {
  await simulateLatency()
  return mockScenes
}