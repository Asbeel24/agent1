import type { Persona } from '../types'
import { mockPersonas } from './mock'
import { simulateLatency } from './types'

export async function getPersonas(): Promise<Persona[]> {
  await simulateLatency()
  return mockPersonas
}