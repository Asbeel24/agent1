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
  return (
    <aside className="persona-drawer" data-open={open} aria-hidden={!open}>
      <div className="drawer-heading">
        <p>Persona exchange</p>
        <button className="interactive-target" type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      <ol>
        {personas.map((persona, index) => (
          <li key={persona.id}>
            <button
              className="persona-option interactive-target"
              data-active={persona.id === activePersonaId}
              type="button"
              onClick={() => onSelectPersona(persona.id)}
            >
              <small>0{index + 1}</small>
              <span>{persona.name}</span>
              <em>{persona.role}</em>
              <i style={{ backgroundColor: persona.color }} />
            </button>
          </li>
        ))}
      </ol>
    </aside>
  )
}