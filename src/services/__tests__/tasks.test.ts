import { describe, it, expect } from 'vitest'
import { getTasks } from '../tasks'

describe('getTasks', () => {
  it('returns the expected 3 tasks', async () => {
    const data = await getTasks()
    expect(data).toHaveLength(3)
    expect(data.map((t) => t.id)).toEqual([
      'market-notes',
      'meeting-brief',
      'memory-review',
    ])
  })
})