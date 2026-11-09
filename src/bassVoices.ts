import type { BassMode } from './bassPatterns'

// Mode character is combined with the live panel controls for each new note.
export const BASS_VOICES: Record<BassMode, {
  wave: OscillatorType; cutoff: number; filterAttack: number; resonance: number
  drive: number; level: number; attack: number; decay: number; sustain: number
  gate: number; pitchOffset: number
}> = {
  PULSE:  { wave:'triangle', cutoff:.85, filterAttack:1.2, resonance:.8, drive:.1, level:1, attack:.008, decay:1, sustain:.42, gate:1, pitchOffset:0 },
  BROKEN: { wave:'square', cutoff:1.05, filterAttack:1.6, resonance:.8, drive:.25, level:.65, attack:.004, decay:.55, sustain:.16, gate:.58, pitchOffset:0 },
  DIRTY:  { wave:'sawtooth', cutoff:1.15, filterAttack:1.9, resonance:1, drive:1.7, level:.62, attack:.006, decay:.8, sustain:.35, gate:.9, pitchOffset:0 },
  DRONE:  { wave:'sawtooth', cutoff:.52, filterAttack:1.1, resonance:.7, drive:.3, level:.68, attack:.04, decay:1.5, sustain:.7, gate:1, pitchOffset:0 },
  CHAOS:  { wave:'square', cutoff:1.2, filterAttack:2.1, resonance:1.1, drive:.65, level:.62, attack:.006, decay:.8, sustain:.3, gate:.8, pitchOffset:12 },
}
