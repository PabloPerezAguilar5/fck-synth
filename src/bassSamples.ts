import type { BassMode } from './bassPatterns'

export type SampledBassMode = Exclude<BassMode, 'PULSE'>

// Fundamental measured in the stable portion of each C recording (Hz).
export const BASS_SAMPLES: Record<SampledBassMode, { file: string; referenceHz: number }> = {
  BROKEN: { file: 'A01_Bass Netro_C - RemiMZ.wav', referenceHz: 32.60 },
  DIRTY: { file: 'A02_Bass Ocho - RemiMZ.wav', referenceHz: 32.71 },
  DRONE: { file: 'A03_brawwww.wav', referenceHz: 65.50 },
  CHAOS: { file: 'A04_bass-jungle-1.wav', referenceHz: 65.84 },
}

export type BassSampleStatus = { state: 'loading' | 'ready' | 'error'; file: string }
