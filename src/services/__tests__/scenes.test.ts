import { describe, it, expect } from 'vitest'
import { getScenes } from '../scenes'

describe('getScenes', () => {
  it('returns the expected 4 scenes', async () => {
    const data = await getScenes()
    expect(data).toHaveLength(4)
    expect(data.map((s) => s.id)).toEqual(['translate', 'home', 'meeting', 'personas'])
  })

  it('simulates latency (≥140ms)', async () => {
    const start = Date.now()
    await getScenes()
    const elapsed = Date.now() - start
    expect(elapsed).toBeGreaterThanOrEqual(140)
  })
})