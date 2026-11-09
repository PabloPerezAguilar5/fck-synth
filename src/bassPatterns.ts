export const BASS_MODES = ['PULSE', 'BROKEN', 'DIRTY', 'DRONE', 'CHAOS'] as const
export type BassMode = typeof BASS_MODES[number]
export const ROOTS = ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'] as const
export const SCALES = ['PENTA MIN', 'MINOR', 'MAJOR', 'DORIAN'] as const
export type BassScale = typeof SCALES[number]
const intervals: Record<BassScale, number[]> = {
  'PENTA MIN': [0, 3, 5, 7, 10], MINOR: [0, 2, 3, 7, 10],
  MAJOR: [0, 2, 4, 7, 11], DORIAN: [0, 2, 3, 7, 9],
}
// The five visible rows are scale degrees in descending pitch, starting at C2.
export function bassMidi(root: string, scale: BassScale, row: number) {
  return 36 + Math.max(0, ROOTS.indexOf(root as typeof ROOTS[number])) + intervals[scale][4 - row]
}
export function bassLabels(root: string, scale: BassScale) {
  return Array.from({length: 5}, (_, row) => ROOTS[bassMidi(root, scale, row) % 12])
}
export type BassPattern = { notes: (number | null)[]; accents: number[]; lengths: number[] }
function random(seed: string) {
  let n = 2166136261
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619)
  return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 }
}
export function generateBassPattern(mode: BassMode, seed: string): BassPattern {
  const rnd = random(`${seed}|bass|${mode}`)
  const notes: (number | null)[] = Array(16).fill(null)
  const lengths = Array(16).fill(1)
  const accents: number[] = []
  const motif = [4, rnd() < .5 ? 2 : 1, 4, rnd() < .5 ? 3 : 0]
  for (let step = 0; step < 16; step++) {
    let hit = false, row = 4
    if (mode === 'PULSE') { hit = step % 2 === 0; row = motif[(step % 8) / 2] }
    if (mode === 'BROKEN') { hit = step === 0 || rnd() < (step % 4 === 0 ? .55 : .27); row = [4,4,3,2,1][Math.floor(rnd()*5)] }
    if (mode === 'DIRTY') { hit = step === 0 || rnd() < (step % 2 === 0 ? .85 : .48); row = [4,4,3,2,0][Math.floor(rnd()*5)] }
    if (mode === 'DRONE') { hit = step === 0 || step === 8; row = step === 0 ? 4 : (rnd() < .5 ? 4 : 1); lengths[step] = 6 }
    if (mode === 'CHAOS') { hit = step === 0 || rnd() < .58; row = Math.floor(rnd()*5) }
    if (hit) { notes[step] = row; if (rnd() < (mode === 'DIRTY' ? .6 : .25)) accents.push(step) }
  }
  return {notes, accents, lengths}
}
