import type { DrumPattern, DrumStyle } from './patterns'

import { DRUM_KITS } from './drumKits'

type PlaybackData = { bpm: number; drum: DrumPattern; volume: number; swing: number; human: number; style: DrumStyle }
type StepEvent = { step: number; time: number }

/** One clock for the whole instrument. Scheduled steps read live state on each tick. */
export class DrumEngine {
  private context: AudioContext | null = null
  private output: GainNode | null = null
  private limiter: WaveShaperNode | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private animation: number | null = null
  private active = false
  private generation = 0
  private nextTime = 0
  private nextStep = 0
  private queue: StepEvent[] = []
  private noise: AudioBuffer | null = null

  constructor(private read: () => PlaybackData, private onStep: (step: number | null) => void) {}

  async start() {
    if (this.active) return
    this.active = true
    const generation = ++this.generation
    try {
      const context = this.context ?? new AudioContext()
      this.context = context
      if (context.state !== 'running') await context.resume()
      if (!this.active || generation !== this.generation) return
      if (context.state !== 'running') throw new Error('El navegador no pudo iniciar el audio. Tocá PLAY otra vez.')
      this.output = context.createGain()
      this.output.gain.value = Math.max(0, Math.min(1, this.read().volume / 100)) * .7
      // Bound peaks even when several saturated voices hit at once.
      this.limiter = context.createWaveShaper()
      const limitCurve = new Float32Array(2049)
      for (let i = 0; i < limitCurve.length; i++) limitCurve[i] = Math.tanh((i / 1024 - 1) * 1.4) * .9
      this.limiter.curve = limitCurve
      this.output.connect(this.limiter).connect(context.destination)
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
      output.gain.cancelScheduledValues(this.context.currentTime)
      output.gain.setValueAtTime(0, this.context.currentTime)
      // Let already scheduled voices finish before disconnecting their silent bus.
      setTimeout(() => { output.disconnect(); limiter?.disconnect() }, 1000)
      this.output = null
      this.limiter = null
    }
    this.onStep(null)
  }

  setVolume(volume: number) {
    if (this.output && this.context) this.output.gain.setTargetAtTime(Math.max(0, Math.min(1, volume / 100)) * .7, this.context.currentTime, .015)
  }

  dispose() {
    this.stop()
    if (this.context && this.context.state !== 'closed') void this.context.close()
    this.context = null
    this.noise = null
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
