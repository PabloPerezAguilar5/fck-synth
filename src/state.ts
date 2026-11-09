import { useEffect, useRef, useState } from 'react'
import { DrumEngine } from './audio'
import { generateDrumPattern, type DrumStyle } from './patterns'
import { generateBassPattern, type BassMode, type BassScale } from './bassPatterns'
import { SynthPadEngine, PAD_MAX_LAYERS, padMidi, type PadPoint, type PadPreset } from './synthPad'
import { SYNTH_DEFAULTS, type SynthControls } from './synthParams'

export type ModuleName = 'synth' | 'drum' | 'bass'
const initialDrum = [[0,4,8,12],[4,12,15],[2,6,9,10,14],[3,9,12]].map(row => Array.from({length:16},(_,i) => row.includes(i)))
const initialBass = [4,null,3,1,null,4,null,2,0,null,3,4,4,null,1,null]

export function useRackState() {
  const [view, setView] = useState<ModuleName | 'rack'>('rack')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState<Record<ModuleName, boolean>>({synth:false, drum:false, bass:false})
  const [bpm, setBpm] = useState(128)
  const [drum, setDrum] = useState(initialDrum)
  const [bass, setBass] = useState<(number | null)[]>(initialBass)
  const [bassLengths, setBassLengths] = useState<number[]>(Array(16).fill(1))
  const [bassMode, setBassMode] = useState<BassMode>('PULSE')
  const [bassSeed, setBassSeed] = useState('B41F')
  const [accents, setAccents] = useState([0,3,8,12])
  const [locked, setLocked] = useState<number[]>([])
  const [style, setStyle] = useState<DrumStyle>('BROKEN')
  const [seed, setSeed] = useState('A41F')
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [audioError, setAudioError] = useState('')
  const [root, setRoot] = useState('C')
  const [scale, setScale] = useState<BassScale>('PENTA MIN')
  const [values, setValues] = useState<Record<string, number>>({ 'synth-VOLUMEN':60, 'drum-DENSIDAD':58, 'drum-SWING':25, 'drum-HUMAN':20, 'drum-VOLUMEN':75, 'drum-WEIRD':25, 'bass-CUTOFF':66, 'bass-RESONANCIA':35, 'bass-DECAY':55, 'bass-DRIVE':32, 'bass-VOLUMEN':65 })
  const playback = { bpm, drum, muted, volume: values['drum-VOLUMEN'], swing: values['drum-SWING'], human: values['drum-HUMAN'], style, bass: { notes: bass, accents, lengths: bassLengths, root, scale, mode: bassMode, cutoff: values['bass-CUTOFF'], resonance: values['bass-RESONANCIA'], decay: values['bass-DECAY'], drive: values['bass-DRIVE'], volume: values['bass-VOLUMEN'] } }
  const latest = useRef(playback)
  latest.current = playback
  const engine = useRef<DrumEngine | null>(null)
  const requested = useRef(false)
  const pad = useRef<SynthPadEngine | null>(null)
  const [padPreset, setPadPresetState] = useState<PadPreset>('DRONE')
  const [synthControls, setSynthControls] = useState<SynthControls>({...SYNTH_DEFAULTS.DRONE})
  const [synthSection, setSynthSection] = useState<'OSC'|'FILTER'|'ENV'|'MOD'|'FX'>('OSC')
  const setPadPreset = (preset:PadPreset) => { setPadPresetState(preset); setSynthControls({...SYNTH_DEFAULTS[preset]}) }
  const setSynthControl = <K extends keyof SynthControls>(key:K, value:SynthControls[K]) => setSynthControls(old=>({...old,[key]:value}))
  const [padMode, setPadMode] = useState<'TOUCH' | 'HOLD'>('TOUCH')
  const [padPoint, setPadPoint] = useState<PadPoint>({x:.5,y:.5})
  const padPointRef = useRef<PadPoint>(padPoint)
  const padReadout = useRef(padMidi(padPoint.x, root, scale))
  padReadout.current = padMidi(padPoint.x, root, scale)
  const [padLayers, setPadLayers] = useState(0)
  const [padNotice, setPadNotice] = useState('')
  const padGesture = useRef(false)
  const gestureMode = useRef<'TOUCH' | 'HOLD'>('TOUCH')
  const padSettings = {...synthControls, root, scale, preset:padPreset, volume:values['synth-VOLUMEN']}
  const getEngine = () => {
    if (!engine.current) engine.current = new DrumEngine(() => latest.current, setCurrentStep)
    return engine.current
  }
  const getPad = () => {
    if (!pad.current) pad.current = new SynthPadEngine(() => getEngine().ensureContext(), padSettings,
      count => { setPadLayers(count); if (count < PAD_MAX_LAYERS) setPadNotice('') },
      () => setAudioError('No se pudo iniciar el audio del pad. Tocá otra vez.'))
    return pad.current
  }
  useEffect(() => () => { requested.current = false; pad.current?.dispose(); pad.current = null; engine.current?.dispose(); engine.current = null }, [])
  useEffect(() => { engine.current?.setVolume(values['drum-VOLUMEN'], muted.drum); engine.current?.setBassVolume(values['bass-VOLUMEN'], muted.bass) }, [values, muted])
  useEffect(() => { pad.current?.update(padSettings) }, [root, scale, padPreset, values['synth-VOLUMEN'], synthControls])
  const padBegin = (point: PadPoint) => {
    padPointRef.current = point; setPadPoint(point); padGesture.current = false
    if (muted.synth) return
    setAudioError('')
    gestureMode.current = padMode
    if (getPad().press(point)) { padGesture.current = true; setPadNotice('') }
    else setPadNotice('TOQUE NO AGREGADO · ESPERÁ RELEASE O USÁ STOP / CLEAR')
  }
  const padMove = (point: PadPoint) => {
    if (!padGesture.current) return
    padPointRef.current = point
    const note = padMidi(point.x, root, scale)
    if (note !== padReadout.current) { padReadout.current = note; setPadPoint(point) }
    if (!muted.synth) pad.current?.move(point)
  }
  const padClear = (immediate = false) => { padGesture.current = false; setPadNotice(''); pad.current?.clear(immediate) }
  const padCancel = () => { if (padGesture.current) pad.current?.end(false); padGesture.current = false }
  const padEnd = () => { if (padGesture.current) pad.current?.end(gestureMode.current === 'HOLD'); padGesture.current = false; setPadPoint(padPointRef.current) }
  const changePadMode = (mode: 'TOUCH' | 'HOLD') => { setPadMode(mode) }
  const toggleMute = (module: ModuleName) => {
    const next = {...muted, [module]: !muted[module]}
    latest.current = {...latest.current, muted: next}
    if (module === 'synth') { if (next.synth) padClear(true) }
    else engine.current?.setMute(module, next[module], values[`${module}-VOLUMEN`])
    setMuted(next)
  }
  const stop = () => { requested.current = false; engine.current?.stop(); setPlaying(false) }
  const togglePlay = () => {
    if (requested.current) { stop(); return }
    requested.current = true
    setAudioError('')
    const player = getEngine()
    setPlaying(true)
    void player.start().catch(() => {
      if (requested.current) { requested.current = false; setPlaying(false); setAudioError('No se pudo iniciar el audio. Tocá PLAY para reintentar.') }
    })
  }
  const generateWithSeed = (value: string) => setDrum(old => generateDrumPattern(style, value, values['drum-WEIRD'], values['drum-DENSIDAD'], old, locked))
  const repeatDrum = () => generateWithSeed(seed)
  const randomizeDrum = () => {
    const nextSeed = Math.floor(Math.random() * 0x100000000).toString(16).toUpperCase().padStart(8, '0')
    setSeed(nextSeed)
    generateWithSeed(nextSeed)
  }
  const generateBass = (value: string) => { const pattern = generateBassPattern(bassMode, value); setBass(pattern.notes); setAccents(pattern.accents); setBassLengths(pattern.lengths) }
  const repeatBass = () => generateBass(bassSeed)
  const randomizeBass = () => { const next = Math.floor(Math.random() * 0x100000000).toString(16).toUpperCase().padStart(8, '0'); setBassSeed(next); generateBass(next) }
  const toggleDrum = (row:number,step:number) => setDrum(old => old.map((r,i) => i === row ? r.map((v,j) => j === step ? !v : v) : r))
  const toggleBass = (row:number,step:number) => { setBass(old => old.map((v,i) => i === step ? (v === row ? null : row) : v)); setBassLengths(old => old.map((v,i) => i === step ? 1 : v)) }
  const toggleAccent = (step:number) => setAccents(old => old.includes(step) ? old.filter(n=>n!==step) : [...old,step])
  return {view,setView,playing,togglePlay,stop,muted,toggleMute,currentStep,audioError,seed,setSeed,repeatDrum,randomizeDrum,bpm,setBpm,padPreset,setPadPreset,synthControls,setSynthControl,synthSection,setSynthSection,padMode,changePadMode,padPoint,padSounding:padLayers>0,padLayers,padNotice,padBegin,padMove,padEnd,padClear,padCancel,drum,toggleDrum,bass,toggleBass,bassLengths,bassMode,setBassMode,bassSeed,setBassSeed,repeatBass,randomizeBass,accents,toggleAccent,locked,setLocked,style,setStyle,root,setRoot,scale,setScale,values,setValues}
}
export type RackState = ReturnType<typeof useRackState>
