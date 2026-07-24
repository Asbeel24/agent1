import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MeetingTranscript } from '../MeetingTranscript';
import type { MeetingSummary, Transcript } from '../../../api/contracts';

vi.mock('../../../api/agent1Api', () => ({
  agent1Api: {
    getTranscript: vi.fn(),
    getSummary: vi.fn(),
  },
}));

import { agent1Api } from '../../../api/agent1Api';

const mockApi = agent1Api as unknown as {
  getTranscript: ReturnType<typeof vi.fn>;
  getSummary: ReturnType<typeof vi.fn>;
};

const SUMMARY: MeetingSummary = {
  schema_version: 2,
  generated_at: 1700000000000,
  meeting_id: 'meeting-1',
  title: '产品对齐会议',
  overview: '本次会议讨论了产品和工程节奏。',
  key_points: [
    { text: '优先交付录音链路', source_start_ms: 0 },
    { text: '对齐 OPFS 缓存策略', source_start_ms: 5000 },
    { text: '复盘下周排期', source_start_ms: 12000 },
  ],
  action_items: [
    {
      title: '上传管线落地',
      description: '上传会议录音到云端',
      owner_text: '前端组',
      due_text: '本周五',
      source_start_ms: null,
    },
    {
      title: '总结会议协议',
      description: '补齐 OpenAPI',
      owner_text: '后端组',
      due_text: '下周一',
      source_start_ms: null,
    },
  ],
  chapters: [],
  decisions: [],
  highlights: [],
};

const TRANSCRIPT: Transcript = {
  schema_version: 1,
  meeting_id: 'meeting-1',
  created_at: '2026-07-24T01:00:00.000Z',
  language: 'zh-CN',
  speakers: [],
  segments: [
    { start_ms: 0, end_ms: 4000, text: '今天的重点是推进录音上传链路。' },
    { start_ms: 4000, end_ms: 9000, text: '云端会做转写与摘要。' },
  ],
  text: '今天的重点是推进录音上传链路。云端会做转写与摘要。',
};

beforeEach(() => {
  mockApi.getTranscript.mockReset();
  mockApi.getSummary.mockReset();
});

describe('MeetingTranscript', () => {
  it('renders the local placeholder when no meetingId is provided', () => {
    render(<MeetingTranscript open meetingId={null} uploadState="idle" />);
    expect(screen.getByText(/点击粒子球开始一段会议录音/)).toBeInTheDocument();
  });

  it('shows a loading state while transcript and summary are pending', () => {
    mockApi.getTranscript.mockReturnValue(new Promise(() => undefined));
    mockApi.getSummary.mockReturnValue(new Promise(() => undefined));
    render(<MeetingTranscript open meetingId="meeting-1" />);
    expect(screen.getByText(/正在生成/)).toBeInTheDocument();
  });

  it('renders the cloud transcript and summary once both resolve', async () => {
    mockApi.getTranscript.mockResolvedValue(TRANSCRIPT);
    mockApi.getSummary.mockResolvedValue(SUMMARY);
    render(<MeetingTranscript open meetingId="meeting-1" />);
    await waitFor(() => expect(screen.getByText('产品对齐会议')).toBeInTheDocument());
    expect(screen.getByText(/优先交付录音链路/)).toBeInTheDocument();
    expect(screen.getByText(/上传管线落地/)).toBeInTheDocument();
    expect(screen.getByText(/OWNER · 前端组 · 本周五/)).toBeInTheDocument();
  });

  it('falls back gracefully when the summary endpoint fails', async () => {
    mockApi.getTranscript.mockResolvedValue(TRANSCRIPT);
    mockApi.getSummary.mockRejectedValue(new Error('server error'));
    render(<MeetingTranscript open meetingId="meeting-1" />);
    await waitFor(() => expect(screen.getByText(/无法读取/)).toBeInTheDocument());
    expect(screen.getByText(/server error/)).toBeInTheDocument();
  });

  it('reflects upload state in the local transcript copy', () => {
    render(<MeetingTranscript open meetingId={null} uploadState="uploading" />);
    expect(screen.getByText(/正在上传到云端/)).toBeInTheDocument();
  });

  it('shows the failed upload message and any error from the hook', () => {
    render(
      <MeetingTranscript
        open
        meetingId={null}
        uploadState="failed"
        errorMessage="OSS 临时凭证失效"
      />,
    );
    expect(screen.getByText(/上传失败：OSS 临时凭证失效/)).toBeInTheDocument();
  });

  it('shows the aborted message when uploadState is aborted', () => {
    render(<MeetingTranscript open meetingId={null} uploadState="aborted" />);
    expect(screen.getByText(/已取消本次会议录音/)).toBeInTheDocument();
  });
});
