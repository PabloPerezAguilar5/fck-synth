import { useEffect, useRef, useState } from 'react'
import { DrumEngine } from './audio'
import { generateDrumPattern, type DrumStyle } from './patterns'

export type ModuleName = 'synth' | 'drum' | 'bass'
type Head = { speed: string; direction: string; transpose: number; mute: boolean }
const initialSynth = [[2,1],[5,2],[9,0],[12,3],[1,4],[7,4],[10,5],[14,4],[4,6],[8,7],[13,7],[0,8]]
const initialDrum = [[0,4,8,12],[4,12,15],[2,6,9,10,14],[3,9,12]].map(row => Array.from({length:16},(_,i) => row.includes(i)))
const initialBass = [4,null,3,1,null,4,null,2,0,null,3,4,4,null,1,null]

export function useRackState() {
  const [view, setView] = useState<ModuleName | 'rack'>('rack')
  const [playing, setPlaying] = useState(false)
  const [bpm, setBpm] = useState(128)
  const [key, setKey] = useState('C minor')
  const [synth, setSynth] = useState(initialSynth.map(([x,y]) => `${x}-${y}`))
  const [drum, setDrum] = useState(initialDrum)
  const [bass, setBass] = useState<(number | null)[]>(initialBass)
  const [accents, setAccents] = useState([0,3,8,12])
  const [locked, setLocked] = useState<number[]>([])
  const [style, setStyle] = useState<DrumStyle>('BROKEN')
  const [seed, setSeed] = useState('A41F')
  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [audioError, setAudioError] = useState('')
  const [root, setRoot] = useState('C')
  const [scale, setScale] = useState('PENTA MIN')
  const [values, setValues] = useState<Record<string, number>>({ 'synth-CUTOFF':68, 'synth-RESONANCIA':35, 'synth-ATAQUE':18, 'synth-DECAY':48, 'synth-SUSTAIN':63, 'synth-RELEASE':38, 'drum-DENSIDAD':58, 'drum-SWING':25, 'drum-HUMAN':20, 'drum-VOLUMEN':75, 'drum-WEIRD':25, 'bass-CUTOFF':66, 'bass-RESONANCIA':35, 'bass-DECAY':55, 'bass-DRIVE':32 })
  const [heads, setHeads] = useState<Head[]>([
    {speed:'1×',direction:'→',transpose:0,mute:false}, {speed:'2×',direction:'←',transpose:0,mute:false},
    {speed:'½×',direction:'↔',transpose:0,mute:false}, {speed:'1×',direction:'→',transpose:0,mute:false},
  ])
  const latest = useRef({ bpm, drum, volume: values['drum-VOLUMEN'], swing: values['drum-SWING'], human: values['drum-HUMAN'], style })
  latest.current = { bpm, drum, volume: values['drum-VOLUMEN'], swing: values['drum-SWING'], human: values['drum-HUMAN'], style }
  const engine = useRef<DrumEngine | null>(null)
  const requested = useRef(false)
  useEffect(() => () => { requested.current = false; engine.current?.dispose(); engine.current = null }, [])
  useEffect(() => { engine.current?.setVolume(values['drum-VOLUMEN']) }, [values])
  const stop = () => { requested.current = false; engine.current?.stop(); setPlaying(false) }
  const togglePlay = () => {
    if (requested.current) { stop(); return }
    requested.current = true
    setAudioError('')
    const player = engine.current ?? new DrumEngine(() => latest.current, setCurrentStep)
    engine.current = player
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
  const toggleSynth = (x:number,y:number) => setSynth(old => old.includes(`${x}-${y}`) ? old.filter(n => n !== `${x}-${y}`) : [...old,`${x}-${y}`])
  const toggleDrum = (row:number,step:number) => setDrum(old => old.map((r,i) => i === row ? r.map((v,j) => j === step ? !v : v) : r))
  const toggleBass = (row:number,step:number) => setBass(old => old.map((v,i) => i === step ? (v === row ? null : row) : v))
  const toggleAccent = (step:number) => setAccents(old => old.includes(step) ? old.filter(n=>n!==step) : [...old,step])
  const updateHead = (index:number, patch:Partial<Head>) => setHeads(old => old.map((h,i) => i===index ? {...h,...patch} : h))
  return {view,setView,playing,togglePlay,stop,currentStep,audioError,seed,setSeed,repeatDrum,randomizeDrum,bpm,setBpm,key,setKey,synth,toggleSynth,drum,toggleDrum,bass,toggleBass,accents,toggleAccent,locked,setLocked,style,setStyle,root,setRoot,scale,setScale,values,setValues,heads,updateHead}
}
export type RackState = ReturnType<typeof useRackState>
