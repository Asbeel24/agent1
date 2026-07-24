import type { SceneId } from '../../types'

type FooterProps = {
  sceneId: SceneId
  taskOpen: boolean
  meetingTextOpen: boolean
  onToggleTask: () => void
}

export function Footer({ sceneId, taskOpen, meetingTextOpen, onToggleTask }: FooterProps) {
  return (
    <footer className="experience-footer">
      <button
        className="footer-action interactive-target"
        type="button"
        data-active={taskOpen}
        onClick={onToggleTask}
      >
        <span>任务日历</span>
        <small>{taskOpen ? 'Close' : '03 active'}</small>
      </button>

      <p className="footer-note">
        {sceneId === 'meeting'
          ? meetingTextOpen
            ? 'Swipe down · return to particle field'
            : 'Swipe up · resolve meeting notes'
          : 'Drag / swipe to change field · Click to speak'}
      </p>

      <div className="frame-rate">
        <span>GPU field</span>
        <small>adaptive / live</small>
      </div>
    </footer>
  )
}