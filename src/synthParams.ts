export type Waveform = 'sine' | 'triangle' | 'sawtooth' | 'square'
export type FilterKind = 'lowpass' | 'highpass' | 'bandpass'
export type ModTarget = 'pitch' | 'cutoff'
export type SynthControls = {
  wave: Waveform; octave: number; detune: number
  cutoff: number; resonance: number; filterType: FilterKind
  attack: number; decay: number; sustain: number; release: number
  lfoRate: number; lfoDepth: number; lfoTarget: ModTarget
  drive: number; delayMix: number; delayTime: number; reverb: number
}

// Preset selection loads these exact values; the volume control stays independent.
export const SYNTH_DEFAULTS: Record<'DRONE'|'PAD'|'GLASS'|'NOISE'|'ALIEN', SynthControls> = {
  DRONE:{wave:'triangle',octave:-1,detune:20,cutoff:42,resonance:16,filterType:'lowpass',attack:42,decay:55,sustain:78,release:65,lfoRate:22,lfoDepth:18,lfoTarget:'cutoff',drive:8,delayMix:12,delayTime:50,reverb:25},
  PAD:{wave:'sine',octave:0,detune:28,cutoff:58,resonance:14,filterType:'lowpass',attack:32,decay:45,sustain:72,release:58,lfoRate:27,lfoDepth:12,lfoTarget:'cutoff',drive:0,delayMix:15,delayTime:48,reverb:35},
  GLASS:{wave:'sine',octave:0,detune:12,cutoff:76,resonance:22,filterType:'lowpass',attack:8,decay:40,sustain:45,release:65,lfoRate:30,lfoDepth:8,lfoTarget:'pitch',drive:0,delayMix:22,delayTime:42,reverb:42},
  NOISE:{wave:'sine',octave:0,detune:0,cutoff:55,resonance:28,filterType:'bandpass',attack:24,decay:45,sustain:68,release:48,lfoRate:30,lfoDepth:18,lfoTarget:'cutoff',drive:6,delayMix:10,delayTime:35,reverb:30},
  ALIEN:{wave:'sawtooth',octave:0,detune:42,cutoff:64,resonance:35,filterType:'lowpass',attack:14,decay:40,sustain:68,release:48,lfoRate:48,lfoDepth:44,lfoTarget:'cutoff',drive:24,delayMix:26,delayTime:46,reverb:22},
}
