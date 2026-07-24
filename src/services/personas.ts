import type { Persona } from '../types'
import { SessionTokenStore, agent1Api, agent1Runtime } from '../api'
import { mockPersonas } from './mock'
import { simulateLatency } from './types'

export async function getPersonas(): Promise<Persona[]> {
  if (agent1Runtime.liveApiEnabled) {
    const config = await agent1Api.getConfig()
    const colors = ['#c6c8d9', '#79bfd2', '#d49b79', '#b6a1c8']
    const profiles: Persona[] = config.profile.options
      .filter((profile) => profile.available)
      .map((profile, index) => ({
        id: profile.id,
        name: profile.label,
        role: profile.description || 'Agent1 人格配置',
        color: colors[index % colors.length],
        source: 'profile',
        selectable: true,
      }))

    const accessToken = new SessionTokenStore().getAccessToken()
    if (!accessToken) return profiles.length ? profiles : mockPersonas

    try {
      const market = await agent1Api.getPersonaMarket()
      const previews: Persona[] = market.items.map((persona, index) => ({
        id: `market:${persona.id}`,
        name: persona.name,
        role: persona.summary || '公开人格预览',
        color: colors[(profiles.length + index) % colors.length],
        source: 'market',
        selectable: false,
      }))
      return profiles.length || previews.length ? [...profiles, ...previews] : mockPersonas
    } catch {
      return profiles.length ? profiles : mockPersonas
    }
  }

  await simulateLatency()
  return mockPersonas
}
