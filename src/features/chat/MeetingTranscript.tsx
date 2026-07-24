type MeetingTranscriptProps = {
  open: boolean
}

export function MeetingTranscript({ open }: MeetingTranscriptProps) {
  return (
    <section
      className="meeting-transcript"
      aria-hidden={!open}
      aria-label="会议文本记录"
    >
      <header className="meeting-transcript-line">
        <span>MEETING NOTE</span>
        <time dateTime="2026-07-23T14:10">23 JUL · 14:10</time>
      </header>
      <p className="meeting-transcript-line">给自己的会议备忘。</p>
      <p className="meeting-transcript-line">
        今天的讨论不是继续堆叠功能，而是让声音、信息与决定在同一个界面里自然发生。
        <mark>先完成体验，再增加能力。</mark>
      </p>
      <p className="meeting-transcript-line">
        当对话结束，系统需要留下三种结果：清晰的上下文、可执行的下一步，以及仍然属于人的判断。
      </p>
      <div className="meeting-transcript-line meeting-actions">
        <span>01</span>
        <p>整理语音记录，生成一页会议摘要。</p>
        <em>OWNER · JOI</em>
      </div>
      <div className="meeting-transcript-line meeting-actions">
        <span>02</span>
        <p>确认本周交互原型，并标记需要继续验证的细节。</p>
        <em>NEXT · FRI</em>
      </div>
      <footer className="meeting-transcript-line">
        记录不是终点，它应该推动下一次行动。
      </footer>
    </section>
  )
}