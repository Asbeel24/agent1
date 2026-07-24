import type { Language } from '../types'
import { agent1Api, agent1Runtime } from '../api'
import { mockLanguages } from './mock'

export async function getLanguages(): Promise<Language[]> {
  if (!agent1Runtime.liveApiEnabled) return mockLanguages

  const config = await agent1Api.getConfig()
  const byCode = new Map<string, Language>()
  config.translation.languages.forEach((language) => {
    byCode.set(language.code.toLowerCase(), {
      code: language.code.toUpperCase(),
      label: language.native_name || language.name || language.code.toUpperCase(),
      supportedTargets: [],
    })
  })
  config.translation.supported_pairs.forEach(({ source_lang, target_lang }) => {
    ;[source_lang, target_lang].forEach((code) => {
      const normalized = code.toLowerCase()
      if (!byCode.has(normalized)) {
        byCode.set(normalized, {
          code: code.toUpperCase(),
          label: code.toUpperCase(),
          supportedTargets: [],
        })
      }
    })
    const source = byCode.get(source_lang.toLowerCase())
    const targetCode = target_lang.toUpperCase()
    if (source && !source.supportedTargets.includes(targetCode)) {
      source.supportedTargets.push(targetCode)
    }
  })

  const defaultSource = config.translation.default_pair.source_lang.toLowerCase()
  const defaultTarget = config.translation.default_pair.target_lang.toLowerCase()
  const languages = Array.from(byCode.values()).sort((left, right) => {
    const rank = (code: string) => {
      if (code.toLowerCase() === defaultSource) return 0
      if (code.toLowerCase() === defaultTarget) return 1
      return 2
    }
    return rank(left.code) - rank(right.code)
  })
  return languages.length >= 2 ? languages : mockLanguages
}
