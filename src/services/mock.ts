import type { Language, Persona, Scene, Task } from '../types'

export const mockScenes: Scene[] = [
  {
    id: 'translate',
    order: '01',
    label: '翻译',
    description: '双向聆听 · 实时转述',
    signal: 'BILINGUAL FIELD',
    color: '#74c9e8',
    orbMode: 'translate',
    preset: 'listening',
  },
  {
    id: 'home',
    order: '02',
    label: '主场',
    description: '自然对话 · 长期记忆',
    signal: 'PRIMARY PRESENCE',
    color: '#c6c8d9',
    orbMode: 'dialogue',
    preset: 'idle',
  },
  {
    id: 'meeting',
    order: '03',
    label: '会议',
    description: '实时记录 · 任务提取',
    signal: 'COLLECTIVE MEMORY',
    color: '#d9a17d',
    orbMode: 'meeting',
    preset: 'thinking',
  },
  {
    id: 'personas',
    order: '04',
    label: '人格市场',
    description: '人格切换 · 关系延续',
    signal: 'PERSONA EXCHANGE',
    color: '#c2afd2',
    orbMode: 'idle',
    preset: 'idle',
  },
]

export const mockPersonas: Persona[] = [
  { id: 'joi', name: 'Joi', role: '温和的长期陪伴者', color: '#c6c8d9' },
  { id: 'moss', name: 'Moss', role: '冷静的研究搭档', color: '#79bfd2' },
  { id: 'ember', name: 'Ember', role: '直接的行动顾问', color: '#d49b79' },
  { id: 'violet', name: 'Violet', role: '敏锐的创意伙伴', color: '#b6a1c8' },
]

export const mockTasks: Task[] = [
  { id: 'market-notes', time: '09:40', title: '整理市场访谈', progress: '06 / 08' },
  { id: 'meeting-brief', time: '14:10', title: '生成周会简报', progress: '进行中' },
  { id: 'memory-review', time: '18:30', title: '回顾今日记忆', progress: '待确认' },
]

export const mockLanguages: Language[] = [
  { code: 'ZH', label: '中文' },
  { code: 'EN', label: 'English' },
  { code: 'JA', label: '日本語' },
  { code: 'KO', label: '한국어' },
]