const DEFAULT_HTTP_BASE_URL = 'https://agent1-dev-api.bicamind.xyz'
const DEFAULT_APP_WS_URL = 'wss://agent1-dev-api.bicamind.xyz/ws'

export const agent1Runtime = {
  httpBaseUrl: (import.meta.env.VITE_AGENT1_API_URL || DEFAULT_HTTP_BASE_URL).replace(/\/$/, ''),
  appWsUrl: import.meta.env.VITE_AGENT1_WS_URL || DEFAULT_APP_WS_URL,
  liveApiEnabled: import.meta.env.VITE_AGENT1_API_MODE === 'live',
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
