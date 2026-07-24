import { describe, it, expect } from 'vitest'
import { getPersonas } from '../personas'

describe('getPersonas', () => {
  it('returns the expected 4 personas', async () => {
    const data = await getPersonas()
    expect(data).toHaveLength(4)
    expect(data.map((p) => p.id)).toEqual(['joi', 'moss', 'ember', 'violet'])
  })
})