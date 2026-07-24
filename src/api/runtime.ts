const DEFAULT_HTTP_BASE_URL = 'https://agent1-dev-api.bicamind.xyz'
const DEFAULT_APP_WS_URL = 'wss://agent1-dev-api.bicamind.xyz/ws'
const DEV_HTTP_PROXY_PATH = '/opentars-api'

function firstDefined(...values: Array<string | undefined>): string | undefined {
  return values.find((value) => value?.trim())?.trim()
}

const apiMode = firstDefined(
  import.meta.env.VITE_OPENTARS_API_MODE,
  import.meta.env.VITE_AGENT1_API_MODE,
)

function defaultHttpBaseUrl(): string {
  return import.meta.env.DEV ? DEV_HTTP_PROXY_PATH : DEFAULT_HTTP_BASE_URL
}

export const agent1Runtime = {
  httpBaseUrl: (
    firstDefined(
      import.meta.env.VITE_OPENTARS_API_BASE_URL,
      import.meta.env.VITE_AGENT1_API_URL,
    ) || defaultHttpBaseUrl()
  ).replace(/\/$/, ''),
  appWsUrl:
    firstDefined(import.meta.env.VITE_OPENTARS_WS_URL, import.meta.env.VITE_AGENT1_WS_URL) ||
    DEFAULT_APP_WS_URL,
  liveApiEnabled: apiMode ? apiMode === 'live' : import.meta.env.MODE !== 'test',
} as const

export function getDefaultDeviceInput() {
  const storageKey = 'agent1.installation_id'
  let installationId = localStorage.getItem(storageKey)
  if (!installationId) {
    installationId =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(storageKey, installationId)
  }

  return {
    platform_family: 'web',
    platform: 'web',
    installation_id: installationId,
    device_name: navigator.userAgent,
    app_version: '1.0.0-b',
    push_token: '',
  }
}
