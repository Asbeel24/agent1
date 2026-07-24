export type PcmPlaybackFeedback = {
  event: 'played' | 'interrupted' | 'error'
  sampleRate?: number
  dataSize?: number
}

type PcmStreamPlayerOptions = {
  onLevel?: (level: number) => void
  onFeedback?: (feedback: PcmPlaybackFeedback) => void
}

type ScheduledSource = {
  source: AudioBufferSourceNode
  sampleRate: number
  dataSize: number
}

export class PcmStreamPlayer {
  private context: AudioContext | null = null
  private nextStartTime = 0
  private generation = 0
  private enqueueChain = Promise.resolve()
  private readonly scheduled = new Set<ScheduledSource>()

  constructor(private readonly options: PcmStreamPlayerOptions = {}) {}

  enqueueBase64Pcm(data: string, sampleRate: number): Promise<void> {
    if (!data || !Number.isFinite(sampleRate) || sampleRate <= 0) return Promise.resolve()
    const generation = this.generation
    this.enqueueChain = this.enqueueChain.then(() => this.schedule(data, sampleRate, generation))
    return this.enqueueChain
  }

  private async schedule(data: string, sampleRate: number, generation: number): Promise<void> {
    try {
      const bytes = decodeBase64(data)
      const samples = pcm16BytesToFloat32(bytes)
      if (samples.length === 0 || generation !== this.generation) return

      const context = this.ensureContext()
      if (context.state === 'suspended') await context.resume()
      if (generation !== this.generation) return

      const buffer = context.createBuffer(1, samples.length, sampleRate)
      buffer.getChannelData(0).set(samples)

      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(context.destination)

      const scheduled: ScheduledSource = {
        source,
        sampleRate,
        dataSize: bytes.byteLength,
      }
      const startTime = Math.max(context.currentTime + 0.012, this.nextStartTime)
      this.nextStartTime = startTime + buffer.duration
      this.scheduled.add(scheduled)
      this.options.onLevel?.(pcmLevel(samples))

      source.onended = () => {
        source.disconnect()
        if (!this.scheduled.delete(scheduled)) return
        this.options.onFeedback?.({
          event: 'played',
          sampleRate: scheduled.sampleRate,
          dataSize: scheduled.dataSize,
        })
        if (this.scheduled.size === 0) {
          this.nextStartTime = 0
          this.options.onLevel?.(0)
        }
      }
      source.start(startTime)
    } catch {
      this.options.onLevel?.(0)
      this.options.onFeedback?.({ event: 'error', sampleRate })
    }
  }

  interrupt(): void {
    this.generation += 1
    if (this.scheduled.size === 0) {
      this.nextStartTime = 0
      this.options.onLevel?.(0)
      return
    }

    let dataSize = 0
    let sampleRate: number | undefined
    for (const scheduled of this.scheduled) {
      dataSize += scheduled.dataSize
      sampleRate ??= scheduled.sampleRate
      scheduled.source.onended = null
      try {
        scheduled.source.stop()
      } catch {
        // The source may already have reached its natural end.
      }
      scheduled.source.disconnect()
    }
    this.scheduled.clear()
    this.nextStartTime = 0
    this.options.onLevel?.(0)
    this.options.onFeedback?.({ event: 'interrupted', sampleRate, dataSize })
  }

  async close(): Promise<void> {
    this.interrupt()
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') await context.close()
  }

  private ensureContext(): AudioContext {
    if (!this.context || this.context.state === 'closed') {
      this.context = new AudioContext()
    }
    return this.context
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function pcm16BytesToFloat32(bytes: Uint8Array): Float32Array {
  const sampleCount = Math.floor(bytes.byteLength / 2)
  const samples = new Float32Array(sampleCount)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(index * 2, true) / 0x8000
  }
  return samples
}

function pcmLevel(samples: Float32Array): number {
  let energy = 0
  for (const sample of samples) energy += sample * sample
  const rms = Math.sqrt(energy / samples.length)
  return Math.min(1, Math.max(0.04, rms * 4.5))
}
