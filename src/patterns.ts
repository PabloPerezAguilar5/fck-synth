export const DRUM_STYLES = ['BROKEN', 'GLITCH', 'MINIMAL', 'TRIP-HOP', 'DIRTY MACHINE', 'GHOST'] as const
export type DrumStyle = typeof DRUM_STYLES[number]
export type DrumPattern = boolean[][]

// Sixteen-step probability maps: kick, snare, hat, percussion.
const weights: Record<DrumStyle, number[][]> = {
  BROKEN: [
    [.94,.03,.08,.22,.20,.09,.12,.38,.73,.03,.16,.36,.16,.07,.20,.36],
    [.02,.04,.09,.12,.78,.08,.10,.22,.06,.10,.23,.08,.76,.09,.28,.15],
    [.28,.12,.54,.13,.33,.19,.57,.23,.25,.12,.56,.15,.33,.21,.60,.27],
    [.04,.13,.08,.34,.08,.14,.13,.35,.05,.17,.12,.30,.08,.14,.18,.38],
  ],
  GLITCH: [
    [.72,.07,.12,.25,.18,.18,.10,.35,.59,.12,.23,.30,.15,.18,.12,.42],
    [.05,.08,.14,.29,.58,.14,.20,.33,.09,.16,.29,.18,.61,.12,.28,.39],
    [.30,.24,.58,.35,.29,.31,.65,.42,.31,.25,.59,.36,.30,.34,.65,.49],
    [.12,.21,.22,.47,.14,.28,.31,.52,.12,.22,.33,.45,.14,.30,.38,.58],
  ],
  MINIMAL: [
    [.95,.01,.02,.04,.10,.02,.03,.08,.60,.01,.03,.07,.08,.02,.04,.08],
    [.01,.01,.02,.03,.50,.02,.03,.04,.01,.02,.03,.04,.58,.02,.04,.06],
    [.10,.03,.22,.03,.12,.04,.25,.05,.10,.03,.22,.04,.12,.04,.26,.07],
    [.01,.02,.02,.08,.02,.03,.03,.11,.01,.03,.03,.09,.02,.03,.04,.12],
  ],
  'TRIP-HOP': [
    [.97,.01,.06,.14,.10,.05,.10,.35,.80,.02,.08,.24,.12,.07,.12,.26],
    [.01,.02,.05,.19,.90,.04,.07,.17,.02,.03,.08,.22,.88,.05,.10,.22],
    [.22,.05,.36,.08,.24,.06,.38,.10,.22,.06,.38,.08,.24,.07,.42,.12],
    [.03,.06,.08,.18,.04,.09,.09,.20,.03,.07,.10,.20,.04,.09,.12,.22],
  ],
  'DIRTY MACHINE': [
    [.98,.02,.08,.11,.46,.05,.08,.18,.90,.03,.09,.13,.44,.06,.11,.23],
    [.02,.03,.06,.10,.91,.03,.07,.12,.03,.04,.07,.13,.91,.05,.08,.18],
    [.51,.06,.70,.08,.53,.08,.72,.11,.51,.07,.70,.09,.53,.09,.74,.13],
    [.08,.07,.12,.21,.08,.10,.13,.26,.08,.08,.14,.22,.08,.11,.16,.29],
  ],
  GHOST: [
    [.58,.02,.03,.08,.08,.03,.07,.14,.39,.03,.05,.13,.06,.04,.09,.15],
    [.01,.03,.04,.13,.36,.05,.07,.16,.02,.04,.07,.15,.42,.05,.09,.18],
    [.12,.05,.20,.10,.13,.08,.24,.12,.12,.06,.22,.10,.14,.08,.26,.14],
    [.03,.08,.10,.20,.04,.12,.13,.24,.03,.09,.13,.21,.05,.12,.16,.25],
  ],
}
function hash(text: string) {
  let n = 2166136261
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619)
  return n >>> 0
}
function randomAt(seed: string, row: number, step: number) {
  let n = hash(`${seed}|${row}|${step}`) + 0x6d2b79f5
  n = Math.imul(n ^ n >>> 15, n | 1)
  n ^= n + Math.imul(n ^ n >>> 7, n | 61)
  return ((n ^ n >>> 14) >>> 0) / 4294967296
}
export function generateDrumPattern(style: DrumStyle, seed: string, weird: number, density: number, current: DrumPattern, locked: number[]): DrumPattern {
  const oddity = Math.max(0, Math.min(100, weird)) / 100
  const densityFactor = Math.max(0, Math.min(100, density)) / 50
  return weights[style].map((row, rowIndex) => {
    if (locked.includes(rowIndex)) return [...current[rowIndex]]
    return row.map((base, step) => {
      // WEIRD weakens expected anchors and gradually introduces off-grid surprises.
      const probability = Math.max(0, Math.min(.98, base * densityFactor * (1 - oddity * .38) + oddity * (step % 2 ? .21 : .08)))
      return randomAt(`${seed}|${style}`, rowIndex, step) < probability
    })
  })
}
