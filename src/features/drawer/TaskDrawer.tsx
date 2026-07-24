import type { Task } from '../../types'

type TaskDrawerProps = {
  open: boolean
  tasks: readonly Task[]
  onClose: () => void
  onFlashTask: (taskId: string) => void
}

export function TaskDrawer({ open, tasks, onClose, onFlashTask }: TaskDrawerProps) {
  return (
    <section className="task-drawer" data-open={open} aria-hidden={!open}>
      <div className="drawer-heading">
        <p>Today · 23 July</p>
        <button className="interactive-target" type="button" onClick={onClose}>
          收起
        </button>
      </div>
      <ol>
        {tasks.map((task, index) => (
          <li key={task.id}>
            <button
              className="task-row interactive-target"
              type="button"
              onClick={() => onFlashTask(task.id)}
            >
              <small>0{index + 1}</small>
              <time>{task.time}</time>
              <span>{task.title}</span>
              <em>{task.progress}</em>
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}