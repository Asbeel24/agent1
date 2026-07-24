export type VoiceState = 'idle' | 'listening'

export type MicrophoneState = 'idle' | 'requesting' | 'active' | 'denied'

export type MessageRole = 'user' | 'assistant'

export type Message = {
  id: string
  role: MessageRole
  text: string
  createdAt: number
}