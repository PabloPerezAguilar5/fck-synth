import type { DrumPattern, DrumStyle } from './patterns'
import { bassMidi, type BassMode, type BassScale } from './bassPatterns'
import { BASS_VOICES } from './bassVoices'
import { BASS_SAMPLES, type SampledBassMode, type BassSampleStatus } from './bassSamples'

import { DRUM_KITS } from './drumKits'

type BassData = { notes: (number | null)[]; accents: number[]; lengths: number[]; root: string; scale: BassScale; cutoff: number; resonance: number; decay: number; drive: number; volume: number; mode?: BassMode }
type PlaybackData = { bpm: number; drum: DrumPattern; volume: number; swing: number; human: number; style: DrumStyle; bass?: BassData; muted?: { drum: boolean; bass: boolean; synth?: boolean } }
type StepEvent = { step: number; time: number }
const SAMPLE_KITS = {
  GLITCH: { directory: 'glitch', files: ['kick.wav', 'snare.wav', 'hat.wav', 'perc.wav'] },
  'TRIP-HOP': { directory: 'trip', files: ['kick.wav', 'snare.wav', 'hat.wav', 'perc.wav'] },
} as const
export type SampledDrumStyle = keyof typeof SAMPLE_KITS
export type SampleKitStatus = { state: 'loading' | 'ready' | 'error'; failed: string[] }

/** One clock for the whole instrument. Scheduled steps read live state on each tick. */
export class DrumEngine {
  private context: AudioContext | null = null
  private output: GainNode | null = null
  private limiter: WaveShaperNode | null = null
  private bassOutput: GainNode | null = null
  private bassEnvelope: GainNode | null = null
  private bassVoices = new Map<GainNode, {source: AudioScheduledSourceNode; start: number}>()
  private timer: ReturnType<typeof setInterval> | null = null
  private animation: number | null = null
  private active = false
  private generation = 0
  private nextTime = 0
  private nextStep = 0
  private queue: StepEvent[] = []
  private noise: AudioBuffer | null = null
  private sampleBuffers: Partial<Record<SampledDrumStyle, (AudioBuffer | null)[]>> = {}
  private sampleLoads: Partial<Record<SampledDrumStyle, Promise<SampleKitStatus>>> = {}
  private bassSamples: Partial<Record<SampledBassMode, AudioBuffer>> = {}
  private bassLoads: Partial<Record<SampledBassMode, Promise<BassSampleStatus>>> = {}

  constructor(private read: () => PlaybackData, private onStep: (step: number | null) => void,
    private onBassSampleError?: (mode: SampledBassMode, status: BassSampleStatus) => void) {}

  loadBassSample(mode: SampledBassMode): Promise<BassSampleStatus> {
    const existing = this.bassLoads[mode]
    if (existing) return existing
    const {file} = BASS_SAMPLES[mode]
    const load: Promise<BassSampleStatus> = (async () => {
      try {
        const context = this.context ?? new AudioContext()
        this.context = context
        const response = await fetch(`samples/bass/${encodeURIComponent(file)}`)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const buffer = await context.decodeAudioData(await response.arrayBuffer())
        if (!(buffer.duration > 0)) throw new Error('Empty audio')
        if (this.context === context) this.bassSamples[mode] = buffer
        return {state:'ready', file}
      } catch { return {state:'error', file} }
    })()
    this.bassLoads[mode] = load
    return load
  }

  /** Fetch and decode once per engine, including partial failures. Playback never waits. */
  loadSampleKit(style: SampledDrumStyle): Promise<SampleKitStatus> {
    const existing = this.sampleLoads[style]
    if (existing) return existing
    const kit = SAMPLE_KITS[style]
    const load: Promise<SampleKitStatus> = (async () => {
      const context = this.context ?? new AudioContext()
      this.context = context
      const buffers = await Promise.all(kit.files.map(async file => {
        try {
          const response = await fetch(`samples/drums/${kit.directory}/${encodeURIComponent(file)}`)
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          return await context.decodeAudioData(await response.arrayBuffer())
        } catch { return null }
      }))
      // Make the kit available together; a failed row keeps its synthesized voice.
      if (this.context === context) this.sampleBuffers[style] = buffers
      const failed = kit.files.filter((_, index) => !buffers[index])
      return { state: failed.length ? 'error' : 'ready', failed } as SampleKitStatus
    })().catch(() => ({ state: 'error', failed: [...kit.files] }))
    this.sampleLoads[style] = load
    return load
  }

  async ensureContext() {
    const context = this.context ?? new AudioContext()
    this.context = context
    if (context.state !== 'running') await context.resume()
    if (context.state !== 'running') throw new Error('No se pudo iniciar el audio')
    return context
  }

  async start() {
    if (this.active) return
    this.active = true
    const generation = ++this.generation
    try {
      const context = await this.ensureContext()
      if (!this.active || generation !== this.generation) return
      if (context.state !== 'running') throw new Error('El navegador no pudo iniciar el audio. Tocá PLAY otra vez.')
      this.output = context.createGain()
      this.output.gain.value = this.read().muted?.drum ? 0 : Math.max(0, Math.min(1, this.read().volume / 100)) * .7
      // Bound peaks even when several saturated voices hit at once.
      this.limiter = context.createWaveShaper()
      const limitCurve = new Float32Array(2049)
      for (let i = 0; i < limitCurve.length; i++) limitCurve[i] = Math.tanh((i / 1024 - 1) * 1.4) * .9
      this.limiter.curve = limitCurve
      this.output.connect(this.limiter).connect(context.destination)
      if (this.read().bass) {
        this.bassOutput = context.createGain()
        this.bassOutput.gain.value = this.read().muted?.bass ? 0 : Math.max(0, Math.min(1, this.read().bass!.volume / 100)) * .38
        this.bassOutput.connect(this.limiter)
      }
      this.nextStep = 0
      this.nextTime = context.currentTime + .05
      this.queue = []
      this.schedule()
      this.timer = setInterval(() => this.schedule(), 25)
      this.draw()
    } catch (error) {
      if (generation !== this.generation) return
      this.stop()
      throw error
    }
  }

  stop() {
    this.active = false
    this.generation++
    if (this.timer !== null) clearInterval(this.timer)
    if (this.animation !== null) cancelAnimationFrame(this.animation)
    this.timer = null
    this.animation = null
    this.queue = []
    if (this.output && this.context) {
      const output = this.output
      const limiter = this.limiter
      const bassOutput = this.bassOutput
      if (bassOutput) { bassOutput.gain.cancelScheduledValues(this.context.currentTime); bassOutput.gain.setTargetAtTime(0, this.context.currentTime, .008) }
      this.bassOutput = null
      this.bassEnvelope = null
      this.bassVoices.clear()
      output.gain.cancelScheduledValues(this.context.currentTime)
      output.gain.setValueAtTime(0, this.context.currentTime)
      // Let already scheduled voices finish before disconnecting their silent bus.
      setTimeout(() => { output.disconnect(); bassOutput?.disconnect(); limiter?.disconnect() }, 4000)
      this.output = null
      this.limiter = null
    }
    this.onStep(null)
  }

  setVolume(volume: number, muted = false) {
    if (this.output && this.context) this.output.gain.setTargetAtTime(muted ? 0 : Math.max(0, Math.min(1, volume / 100)) * .7, this.context.currentTime, .015)
  }

  setBassVolume(volume: number, muted = false) {
    if (this.bassOutput && this.context) this.bassOutput.gain.setTargetAtTime(muted ? 0 : Math.max(0, Math.min(1, volume / 100)) * .38, this.context.currentTime, .015)
  }

  setMute(module: 'drum' | 'bass', muted: boolean, volume: number) {
    if (module === 'drum') this.setVolume(volume, muted)
    else {
      this.setBassVolume(volume, muted)
      if (muted && this.context) {
        // Cancel every current and lookahead-scheduled note so it cannot return on unmute.
        const now = this.context.currentTime
        for (const [envelope, voice] of this.bassVoices) {
          if (typeof envelope.gain.cancelAndHoldAtTime === 'function') envelope.gain.cancelAndHoldAtTime(now)
          else envelope.gain.cancelScheduledValues(now)
          envelope.gain.setTargetAtTime(.0001, now, .004)
          // A not-yet-started lookahead note must not reappear on a quick unmute.
          voice.source.stop(voice.start > now ? now : now + .06)
        }
        this.bassEnvelope = null
      }
    }
  }

  dispose() {
    this.stop()
    if (this.context && this.context.state !== 'closed') void this.context.close()
    this.context = null
    this.noise = null
    this.sampleBuffers = {}
    this.bassSamples = {}
  }

  private schedule() {
    const ctx = this.context
    if (!this.active || !ctx || !this.output) return
    // Recover from a stalled background tab without replaying a backlog of late hits.
    if (this.nextTime < ctx.currentTime - .1) this.nextTime = ctx.currentTime + .01
    while (this.nextTime < ctx.currentTime + .08) {
      const data = this.read()
      const step = this.nextStep
      const bpm = Number.isFinite(data.bpm) ? Math.max(40, Math.min(240, data.bpm)) : 120
      const stepDuration = 60 / bpm / 4
      // Swing delays the offbeat sixteenths without moving the underlying clock.
      const swing = Math.max(0, Math.min(100, data.swing)) / 100
      const time = this.nextTime + (step % 2 ? stepDuration * .44 * swing : 0)
      this.queue.push({step, time})
      for (let row = 0; row < 4; row++) {
        if (data.drum[row]?.[step]) this.voice(row, step, time, data.style, data.human)
      }
      const bass = data.bass
      const note = bass?.notes[step]
      if (bass && note != null && !data.muted?.bass) this.bassVoice(note, step, time, stepDuration, bass)
      this.nextTime += stepDuration
      this.nextStep = (step + 1) % 16
    }
  }

  private draw = () => {
    if (!this.active || !this.context) return
    let event: StepEvent | undefined
    while (this.queue.length && this.queue[0].time <= this.context.currentTime) event = this.queue.shift()
    if (event) this.onStep(event.step)
    this.animation = requestAnimationFrame(this.draw)
  }

  private bassVoice(row: number, step: number, time: number, stepDuration: number, data: BassData) {
    const ctx = this.context!
    const output = this.bassOutput
    if (!output) return
    // A new note releases the previous voice even if its original gate was longer.
    if (this.bassEnvelope) {
      this.bassEnvelope.gain.cancelScheduledValues(time)
      this.bassEnvelope.gain.setTargetAtTime(.0001, time, .004)
    }
    const clamp = (value: number) => Math.max(0, Math.min(100, value)) / 100
    const voice = BASS_VOICES[data.mode ?? 'PULSE']
    const accent = data.accents.includes(step)
    const gate = Math.max(1, Math.min(16, data.lengths[step] || 1)) * stepDuration * .85 * voice.gate
    const mode = data.mode ?? 'PULSE'
    const sampledMode = mode === 'PULSE' ? null : mode
    const sample = sampledMode ? this.bassSamples[sampledMode] : undefined
    let source: OscillatorNode | AudioBufferSourceNode
    if (sample && sampledMode) {
      const player = ctx.createBufferSource()
      player.buffer = sample
      // Loop an integer number of measured cycles to sustain long notes.
      const referenceHz = BASS_SAMPLES[sampledMode].referenceHz
      const loopStart = Math.min(.2, sample.duration * .2)
      const loopLimit = Math.min(loopStart + .5, sample.duration - .02)
      const cycles = Math.floor((loopLimit - loopStart) * referenceHz)
      if (cycles >= 1) { player.loop = true; player.loopStart = loopStart; player.loopEnd = loopStart + cycles / referenceHz }
      const targetHz = 440 * Math.pow(2, (bassMidi(data.root, data.scale, row) - 69) / 12)
      const cents = voice.pitchOffset * (step % 3 - 1)
      player.playbackRate.setValueAtTime(targetHz / referenceHz * Math.pow(2, cents / 1200), time)
      if (cents) player.playbackRate.setTargetAtTime(targetHz / referenceHz, time + .008, .08)
      source = player
    } else {
      const osc = ctx.createOscillator()
      osc.type = voice.wave
      const frequency = 440 * Math.pow(2, (bassMidi(data.root, data.scale, row) - 69) / 12)
      // CHAOS bends by a small, repeatable number of cents, never a different note.
      const cents = voice.pitchOffset * (step % 3 - 1)
      osc.frequency.setValueAtTime(frequency * Math.pow(2, cents / 1200), time)
      if (cents) osc.frequency.setTargetAtTime(frequency, time + .008, .08)
      source = osc
    }
    const filter = ctx.createBiquadFilter()
    const distortion = ctx.createWaveShaper()
    const env = ctx.createGain()
    this.bassEnvelope = env
    this.bassVoices.set(env, {source, start: time})
    source.onended = () => { this.bassVoices.delete(env); if (this.bassEnvelope === env) this.bassEnvelope = null }
    filter.type = 'lowpass'
    const cutoff = 110 * Math.pow(22, clamp(data.cutoff)) * voice.cutoff
    filter.frequency.setValueAtTime(cutoff * voice.filterAttack * (accent ? 1.55 : 1), time)
    filter.frequency.setTargetAtTime(cutoff, time + .01, .09)
    filter.Q.value = .6 + clamp(data.resonance) * 8 * voice.resonance
    const amount = 1 + voice.drive + clamp(data.drive) * 3
    const curve = new Float32Array(1025)
    for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 512 - 1) * amount) / Math.tanh(amount) * .65
    distortion.curve = curve
    source.connect(filter).connect(distortion).connect(env).connect(output)
    const level = (accent ? .85 : .52) * voice.level
    const decay = (.06 + clamp(data.decay) * .5) * voice.decay
    const attack = Math.min(voice.attack, gate * .45)
    env.gain.setValueAtTime(.0001, time)
    env.gain.exponentialRampToValueAtTime(level, time + attack)
    env.gain.setTargetAtTime(level * voice.sustain, time + attack, decay)
    env.gain.setTargetAtTime(.0001, time + gate, .025)
    try {
      source.start(time)
      source.stop(time + gate + .2)
    } catch (error) {
      if (!sampledMode || !sample) throw error
      source.disconnect()
      this.bassVoices.delete(env)
      if (this.bassEnvelope === env) this.bassEnvelope = null
      delete this.bassSamples[sampledMode]
      const status: BassSampleStatus = {state:'error', file:BASS_SAMPLES[sampledMode].file}
      this.bassLoads[sampledMode] = Promise.resolve(status)
      this.onBassSampleError?.(sampledMode, status)
      this.bassVoice(row, step, time, stepDuration, data)
    }
  }

  private noiseBuffer(ctx: AudioContext) {
    if (!this.noise) {
      const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .4), ctx.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
      this.noise = buffer
    }
    return this.noise
  }

  private voice(row: number, step: number, time: number, style: DrumStyle, human: number) {
    const ctx = this.context!
    const out = this.output!
    const kit = DRUM_KITS[style]
    const voice = kit.voices[row]
    const humanAmount = Math.max(0, Math.min(100, human)) / 100
    const velocity = 1 - humanAmount * .5 * Math.random()
    const ghost = style === 'TRIP-HOP' && row === 1 && step !== 4 && step !== 12 ? .42 : 1
    const sample = style === 'GLITCH' || style === 'TRIP-HOP' ? this.sampleBuffers[style]?.[row] : null
    if (sample) {
      const source = ctx.createBufferSource()
      const gain = ctx.createGain()
      source.buffer = sample
      // Short fades avoid discontinuities while retaining each sample's natural tail.
      const fade = Math.min(.003, sample.duration / 3)
      gain.gain.setValueAtTime(0, time)
      gain.gain.linearRampToValueAtTime(voice.level * velocity * ghost, time + fade)
      gain.gain.setValueAtTime(voice.level * velocity * ghost, time + sample.duration - fade)
      gain.gain.linearRampToValueAtTime(0, time + sample.duration)
      source.connect(gain).connect(out)
      source.start(time)
      return
    }
    const env = ctx.createGain()
    if (kit.drive > 0) {
      const distortion = ctx.createWaveShaper()
      const curve = new Float32Array(256)
      const amount = 1 + kit.drive * 3
      for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 127.5 - 1) * amount) * .5
      distortion.curve = curve
      env.connect(distortion).connect(out)
    } else env.connect(out)
    env.gain.setValueAtTime(.0001, time)
    env.gain.exponentialRampToValueAtTime(voice.level * velocity * ghost, time + voice.attack)
    env.gain.exponentialRampToValueAtTime(.0001, time + voice.decay)
    if (voice.tone) {
      const osc = ctx.createOscillator()
      osc.type = voice.tone.wave
      osc.frequency.setValueAtTime(voice.tone.start, time)
      osc.frequency.exponentialRampToValueAtTime(voice.tone.end, time + voice.tone.sweep)
      osc.connect(env)
      osc.start(time)
      osc.stop(time + voice.decay + .01)
    }
    if (voice.noise) {
      const noise = ctx.createBufferSource()
      noise.buffer = this.noiseBuffer(ctx)
      const filter = ctx.createBiquadFilter()
      filter.type = voice.noise.type
      filter.frequency.value = voice.noise.frequency
      filter.Q.value = voice.noise.q
      const mix = ctx.createGain()
      mix.gain.value = voice.noise.mix
      noise.connect(filter).connect(mix).connect(env)
      noise.start(time)
      noise.stop(time + voice.decay + .01)
    }
    for (const frequency of voice.metal ?? []) {
      const metal = ctx.createOscillator()
      metal.type = 'square'
      metal.frequency.value = frequency
      const mix = ctx.createGain()
      mix.gain.value = .12
      metal.connect(mix).connect(env)
      metal.start(time)
      metal.stop(time + voice.decay + .01)
    }
  }
}
