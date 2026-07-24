export type Persona = {
  id: string
  name: string
  role: string
  color: string
  source: 'profile' | 'market'
  selectable: boolean
}
