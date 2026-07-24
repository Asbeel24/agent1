import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PcmStreamPlayer, type PcmPlaybackFeedback } from '../PcmStreamPlayer'

class FakeAudioBuffer {
  readonly duration: number
  readonly channel: Float32Array

  constructor(length: number, sampleRate: number) {
    this.duration = length / sampleRate
    this.channel = new Float32Array(length)
  }

  getChannelData() {
    return this.channel
  }
}

class FakeAudioBufferSource {
  buffer: FakeAudioBuffer | null = null
  onended: (() => void) | null = null
  startTime = -1
  stopped = false

  connect() {}
  disconnect() {}
  start(time: number) {
    this.startTime = time
  }
  stop() {
    this.stopped = true
    this.onended?.()
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = []
  readonly destination = {}
  readonly sources: FakeAudioBufferSource[] = []
  currentTime = 0.1
  state: AudioContextState = 'running'

  constructor() {
    FakeAudioContext.instances.push(this)
  }

  createBuffer(_channels: number, length: number, sampleRate: number) {
    return new FakeAudioBuffer(length, sampleRate)
  }

  createBufferSource() {
    const source = new FakeAudioBufferSource()
    this.sources.push(source)
    return source
  }

  async resume() {
    this.state = 'running'
  }

  async close() {
    this.state = 'closed'
  }
}

describe('PcmStreamPlayer', () => {
  beforeEach(() => {
    FakeAudioContext.instances = []
    vi.stubGlobal('AudioContext', FakeAudioContext)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodes little-endian PCM16 and schedules chunks in arrival order', async () => {
    const feedback: PcmPlaybackFeedback[] = []
    const player = new PcmStreamPlayer({ onFeedback: (value) => feedback.push(value) })
    const chunk = btoa(String.fromCharCode(0, 0, 255, 127))

    await Promise.all([
      player.enqueueBase64Pcm(chunk, 16_000),
      player.enqueueBase64Pcm(chunk, 16_000),
    ])

    const context = FakeAudioContext.instances[0]
    expect(context.sources).toHaveLength(2)
    expect(context.sources[0].buffer?.channel[0]).toBe(0)
    expect(context.sources[0].buffer?.channel[1]).toBeCloseTo(32767 / 32768)
    expect(context.sources[1].startTime).toBeGreaterThan(context.sources[0].startTime)

    context.sources.forEach((source) => source.onended?.())
    expect(feedback).toEqual([
      { event: 'played', sampleRate: 16_000, dataSize: 4 },
      { event: 'played', sampleRate: 16_000, dataSize: 4 },
    ])
  })

  it('stops all queued chunks and emits one interrupted feedback event', async () => {
    const feedback: PcmPlaybackFeedback[] = []
    const levels: number[] = []
    const player = new PcmStreamPlayer({
      onFeedback: (value) => feedback.push(value),
      onLevel: (value) => levels.push(value),
    })
    const chunk = btoa(String.fromCharCode(0, 0, 0, 64))

    await player.enqueueBase64Pcm(chunk, 24_000)
    await player.enqueueBase64Pcm(chunk, 24_000)
    player.interrupt()

    const sources = FakeAudioContext.instances[0].sources
    expect(sources.every((source) => source.stopped)).toBe(true)
    expect(feedback).toEqual([
      { event: 'interrupted', sampleRate: 24_000, dataSize: 8 },
    ])
    expect(levels.at(-1)).toBe(0)
  })
})
