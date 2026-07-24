import { useEffect, useState } from 'react';
import type { MeetingSummary, Transcript } from '../../api/contracts';
import { agent1Api } from '../../api/agent1Api';
import { useAsync } from '../../hooks/useAsync';

type MeetingTranscriptProps = {
  open: boolean;
  meetingId?: string | null;
  uploadState?: 'idle' | 'recording' | 'finalizing' | 'uploading' | 'finished' | 'failed' | 'aborted';
  errorMessage?: string;
};

function formatDate(value?: string | number | null): string {
  if (!value) return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = date.toLocaleString('en-US', { day: '2-digit', month: 'short' }).toUpperCase();
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${day} · ${time}`;
}

export function MeetingTranscript({ open, meetingId, uploadState, errorMessage }: MeetingTranscriptProps) {
  const hasMeetingId = Boolean(meetingId);

  const transcriptQuery = useAsync<Transcript>(
    async () => agent1Api.getTranscript(meetingId as string),
    [meetingId],
  );
  const summaryQuery = useAsync<MeetingSummary>(
    async () => agent1Api.getSummary(meetingId as string),
    [meetingId],
  );

  // Reset local state when meetingId flips
  useEffect(() => {
    // useAsync already re-runs on dep change; this effect is a hook for visual reset.
  }, [meetingId]);

  if (hasMeetingId && (transcriptQuery.loading || summaryQuery.loading) && !summaryQuery.data) {
    return (
      <section
        className="meeting-transcript"
        aria-hidden={!open}
        aria-label="会议文本记录"
        data-state="loading"
      >
        <header className="meeting-transcript-line">
          <span>MEETING NOTE</span>
          <time>正在生成…</time>
        </header>
        <p className="meeting-transcript-line">会议内容正在云端整理，稍候片刻。</p>
      </section>
    );
  }

  if (hasMeetingId && (transcriptQuery.error || summaryQuery.error) && !summaryQuery.data) {
    return (
      <section
        className="meeting-transcript"
        aria-hidden={!open}
        aria-label="会议文本记录"
        data-state="error"
      >
        <header className="meeting-transcript-line">
          <span>MEETING NOTE</span>
          <time>无法读取</time>
        </header>
        <p className="meeting-transcript-line">
          云端会议记录暂不可用：{(summaryQuery.error ?? transcriptQuery.error)?.message}
        </p>
      </section>
    );
  }

  if (hasMeetingId && summaryQuery.data) {
    return (
      <CloudMeetingTranscript
        open={open}
        summary={summaryQuery.data}
        transcript={transcriptQuery.data}
      />
    );
  }

  return (
    <LocalMeetingTranscript
      open={open}
      uploadState={uploadState}
      errorMessage={errorMessage}
    />
  );
}

function CloudMeetingTranscript({
  open,
  summary,
  transcript,
}: {
  open: boolean;
  summary: MeetingSummary;
  transcript: Transcript | null;
}) {
  const startedAt = transcript?.created_at ?? new Date(summary.generated_at).toISOString();
  const startedLabel = formatDate(startedAt);
  const overview = summary.overview || transcript?.text || '';
  const keyPoints = summary.key_points.slice(0, 3);
  const actionItems = summary.action_items.slice(0, 3);

  return (
    <section
      className="meeting-transcript"
      aria-hidden={!open}
      aria-label="会议文本记录"
      data-state="cloud"
    >
      <header className="meeting-transcript-line">
        <span>MEETING NOTE</span>
        {startedLabel && <time dateTime={startedAt}>{startedLabel}</time>}
      </header>
      <p className="meeting-transcript-line">
        {summary.title || '已完成的会议'}
      </p>
      {overview && (
        <p className="meeting-transcript-line">
          {overview}
          {keyPoints[0] && (
            <>
              <mark>{keyPoints[0].text}</mark>
            </>
          )}
        </p>
      )}
      {actionItems.map((item, index) => (
        <div key={`action-${index}`} className="meeting-transcript-line meeting-actions">
          <span>{String(index + 1).padStart(2, '0')}</span>
          <p>{item.title}</p>
          <em>
            {item.owner_text ? `OWNER · ${item.owner_text}` : 'OWNER'}
            {item.due_text ? ` · ${item.due_text}` : ''}
          </em>
        </div>
      ))}
      {keyPoints.length > 1 && (
        <div className="meeting-transcript-line meeting-actions">
          <span>议程</span>
          <p>{keyPoints.slice(1).map((point) => point.text).join('；')}</p>
          <em>接下来</em>
        </div>
      )}
      <footer className="meeting-transcript-line">
        云端摘要将在 {formatDate(summary.generated_at)} 之前一直可见。
      </footer>
    </section>
  );
}

function LocalMeetingTranscript({
  open,
  uploadState,
  errorMessage,
}: {
  open: boolean;
  uploadState?: MeetingTranscriptProps['uploadState'];
  errorMessage?: string;
}) {
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    if (!uploadState) {
      setProgressText('');
      return;
    }
    switch (uploadState) {
      case 'recording':
        setProgressText('正在捕捉会议音频…');
        break;
      case 'finalizing':
        setProgressText('正在完成本地录音…');
        break;
      case 'uploading':
        setProgressText('正在上传到云端…');
        break;
      case 'finished':
        setProgressText('会议已上传，等待云端转写与摘要。');
        break;
      case 'failed':
        setProgressText('上传失败：' + (errorMessage || '请稍后重试。'));
        break;
      case 'aborted':
        setProgressText('已取消本次会议录音。');
        break;
      default:
        setProgressText('');
    }
  }, [uploadState, errorMessage]);

  return (
    <section
      className="meeting-transcript"
      aria-hidden={!open}
      aria-label="会议文本记录"
      data-state="idle"
    >
      <header className="meeting-transcript-line">
        <span>MEETING NOTE</span>
        <time>等待录音</time>
      </header>
      <p className="meeting-transcript-line">
        点击粒子球开始一段会议录音。完成后，云端会在几秒内返回会议笔记与可执行项。
      </p>
      {progressText && (
        <p className="meeting-transcript-line" data-upload-state={uploadState}>
          {progressText}
        </p>
      )}
      <footer className="meeting-transcript-line">
        录音会在本地 OPFS 暂存，上传完成后被清理。
      </footer>
    </section>
  );
}
