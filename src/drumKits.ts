import type { DrumStyle } from './patterns'

type Wave = OscillatorType
type Tone = { wave: Wave; start: number; end: number; sweep: number }
type Noise = { type: BiquadFilterType; frequency: number; q: number; mix: number }
type Voice = { attack: number; decay: number; level: number; tone?: Tone; noise?: Noise; metal?: number[] }
export type DrumKit = { voices: [Voice, Voice, Voice, Voice]; drive: number }

// Synthesized voices: attack, decay, pitch, spectral color and oscillator shape
// differ by kit, so changing styles also changes an unchanged pattern.
export const DRUM_KITS: Record<DrumStyle, DrumKit> = {
  BROKEN: { drive: 0, voices: [
    { attack:.002, decay:.23, level:.72, tone:{wave:'sine',start:155,end:47,sweep:.075} },
    { attack:.002, decay:.12, level:.31, tone:{wave:'triangle',start:240,end:120,sweep:.045}, noise:{type:'bandpass',frequency:2100,q:.8,mix:.85} },
    { attack:.001, decay:.045, level:.16, noise:{type:'highpass',frequency:7200,q:.7,mix:1} },
    { attack:.002, decay:.095, level:.20, tone:{wave:'triangle',start:900,end:260,sweep:.045}, noise:{type:'bandpass',frequency:3500,q:2,mix:.55} },
  ]},
  GLITCH: { drive: .18, voices: [
    { attack:.001, decay:.12, level:.57, tone:{wave:'triangle',start:220,end:62,sweep:.032} },
    { attack:.001, decay:.065, level:.24, tone:{wave:'square',start:420,end:175,sweep:.024}, noise:{type:'bandpass',frequency:3900,q:2.8,mix:.65} },
    { attack:.001, decay:.035, level:.10, noise:{type:'highpass',frequency:8500,q:1.3,mix:.55}, metal:[5400,7230] },
    { attack:.001, decay:.065, level:.15, tone:{wave:'square',start:1750,end:540,sweep:.025}, noise:{type:'bandpass',frequency:5600,q:5,mix:.45}, metal:[2900,4150] },
  ]},
  MINIMAL: { drive: 0, voices: [
    { attack:.002, decay:.16, level:.65, tone:{wave:'sine',start:115,end:52,sweep:.045} },
    { attack:.002, decay:.085, level:.23, tone:{wave:'sine',start:190,end:120,sweep:.04}, noise:{type:'bandpass',frequency:1600,q:.65,mix:.65} },
    { attack:.001, decay:.028, level:.11, noise:{type:'highpass',frequency:6800,q:.6,mix:1} },
    { attack:.002, decay:.07, level:.16, tone:{wave:'sine',start:620,end:320,sweep:.03} },
  ]},
  'TRIP-HOP': { drive: 0, voices: [
    { attack:.003, decay:.40, level:.76, tone:{wave:'sine',start:105,end:34,sweep:.14} },
    { attack:.003, decay:.22, level:.30, tone:{wave:'triangle',start:150,end:76,sweep:.09}, noise:{type:'bandpass',frequency:950,q:.6,mix:.75} },
    { attack:.004, decay:.075, level:.09, noise:{type:'highpass',frequency:5100,q:.5,mix:.75} },
    { attack:.003, decay:.16, level:.17, tone:{wave:'triangle',start:530,end:170,sweep:.065}, noise:{type:'bandpass',frequency:1450,q:1.1,mix:.45} },
  ]},
  'DIRTY MACHINE': { drive: .7, voices: [
    { attack:.001, decay:.24, level:.57, tone:{wave:'triangle',start:150,end:43,sweep:.055} },
    { attack:.001, decay:.14, level:.20, tone:{wave:'sawtooth',start:230,end:93,sweep:.05}, noise:{type:'bandpass',frequency:1700,q:1.2,mix:.75} },
    { attack:.001, decay:.055, level:.075, noise:{type:'highpass',frequency:6200,q:1,mix:.9}, metal:[4500,6100] },
    { attack:.001, decay:.11, level:.14, tone:{wave:'sawtooth',start:740,end:185,sweep:.04}, noise:{type:'bandpass',frequency:2600,q:2.3,mix:.7} },
  ]},
  GHOST: { drive: 0, voices: [
    { attack:.008, decay:.32, level:.43, tone:{wave:'sine',start:92,end:38,sweep:.12} },
    { attack:.012, decay:.27, level:.17, tone:{wave:'sine',start:135,end:88,sweep:.11}, noise:{type:'bandpass',frequency:1250,q:.45,mix:.85} },
    { attack:.009, decay:.15, level:.07, noise:{type:'highpass',frequency:4800,q:.5,mix:.8} },
    { attack:.01, decay:.22, level:.10, tone:{wave:'sine',start:470,end:250,sweep:.10}, noise:{type:'bandpass',frequency:1900,q:.7,mix:.7} },
  ]},
}
