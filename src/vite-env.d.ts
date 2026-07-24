/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENTARS_API_MODE?: 'mock' | 'live'
  readonly VITE_OPENTARS_API_BASE_URL?: string
  readonly VITE_OPENTARS_WS_URL?: string
  readonly VITE_OPENTARS_ACCESS_TOKEN?: string
  readonly VITE_OPENTARS_REFRESH_TOKEN?: string
  readonly VITE_AGENT1_API_MODE?: 'mock' | 'live'
  readonly VITE_AGENT1_API_URL?: string
  readonly VITE_AGENT1_WS_URL?: string
  readonly VITE_AGENT1_ACCESS_TOKEN?: string
  readonly VITE_AGENT1_REFRESH_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
