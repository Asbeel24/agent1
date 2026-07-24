import type { Persona } from '../../types'

type PersonaDrawerProps = {
  open: boolean
  personas: readonly Persona[]
  activePersonaId: string
  onSelectPersona: (id: string) => void
  onClose: () => void
}

export function PersonaDrawer({
  open,
  personas,
  activePersonaId,
  onSelectPersona,
  onClose,
}: PersonaDrawerProps) {
  const profiles = personas.filter((persona) => persona.source === 'profile')
  const market = personas.filter((persona) => persona.source === 'market')

  const renderPersona = (persona: Persona, index: number) => (
    <li key={persona.id}>
      <button
        className="persona-option interactive-target"
        data-active={persona.id === activePersonaId}
        data-readonly={!persona.selectable}
        type="button"
        disabled={!persona.selectable}
        onClick={() => onSelectPersona(persona.id)}
      >
        <small>{String(index + 1).padStart(2, '0')}</small>
        <span>{persona.name}</span>
        <em>{persona.role}</em>
        <i style={{ backgroundColor: persona.color }} />
      </button>
    </li>
  )

  return (
    <aside className="persona-drawer" data-open={open} aria-hidden={!open}>
      <div className="drawer-heading">
        <p>Persona exchange</p>
        <button className="interactive-target" type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <ol>
        <li className="persona-section-label">内置人格 · 可切换</li>
        {profiles.map(renderPersona)}
        {market.length > 0 && (
          <>
            <li className="persona-section-label">人格市场 · 只读预览</li>
            {market.map((persona, index) => renderPersona(persona, profiles.length + index))}
          </>
        )}
      </ol>
    </aside>
  )
}
