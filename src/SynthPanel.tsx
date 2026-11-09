import type { CSSProperties } from 'react'
import type { RackState } from './state'
import type { FilterKind, ModTarget, Waveform } from './synthParams'

type NumericKey = 'detune'|'cutoff'|'resonance'|'attack'|'decay'|'sustain'|'release'|'lfoRate'|'lfoDepth'|'drive'|'delayMix'|'delayTime'|'reverb'
const seconds = (n:number) => `${n.toFixed(2)} s`
const format:Partial<Record<NumericKey,(n:number)=>string>> = {
  detune:n=>`${Math.round(n*.32)} ct`, lfoRate:n=>`${(.06+(n/100)**2*9.94).toFixed(2)} Hz`,
  attack:n=>seconds(.008+(n/100)**2*1.2),decay:n=>seconds(.04+(n/100)**2*1.8),release:n=>seconds(.1+(n/100)**2*2.4),
  delayTime:n=>seconds(.08+n/100*.72),
}
function Dial({label,value,onChange,disabled,display}:{label:string;value:number;onChange:(value:number)=>void;disabled?:boolean;display?:string}) {
 return <label className={`knob-control synth-dial ${disabled?'is-disabled':''}`}><span className="knob" style={{'--angle':`${-135+value*2.7}deg`} as CSSProperties}><span className="knob-mark"/><input aria-label={`${label} synth`} type="range" min="0" max="100" value={value} disabled={disabled} onChange={e=>onChange(Number(e.target.value))}/></span><span>{label}</span><span className="knob-value">{display??`${value}%`}</span></label>
}
function Param({label,param,state,disabled}:{label:string;param:NumericKey;state:RackState;disabled?:boolean}) {
 const value=state.synthControls[param]
 return <Dial label={label} value={value} disabled={disabled} display={format[param]?.(value)} onChange={v=>state.setSynthControl(param,v)}/>
}
function Volume({state}:{state:RackState}) {
 return <Dial label="VOLUMEN" value={state.values['synth-VOLUMEN']} onChange={v=>state.setValues({...state.values,'synth-VOLUMEN':v})}/>
}
const sections=['OSC','FILTER','ENV','MOD','FX'] as const
export function SynthPanel({state}:{state:RackState}) {
 const s=state.synthControls, noise=state.padPreset==='NOISE'
 if(state.view!=='synth') return <div className="sound-section"><div className="section-label"><span>SONIDO EN VIVO</span><span>AMPLIAR PARA MÁS CONTROLES</span></div><div className="synth-panel-controls rack-synth-controls"><Volume state={state}/><Param label="CUTOFF" param="cutoff" state={state}/><Param label="ATAQUE" param="attack" state={state}/><Param label="RELEASE" param="release" state={state}/></div></div>
 return <div className="synth-panel"><div className="synth-tabs" role="tablist" aria-label="Secciones de síntesis">{sections.map(section=><button key={section} role="tab" aria-selected={state.synthSection===section} onClick={()=>state.setSynthSection(section)}>{section}</button>)}</div>
  <div className="synth-panel-controls" role="tabpanel" aria-label={`Controles ${state.synthSection}`}>
   {state.synthSection==='OSC'&&<><label className="synth-select">ONDA<select aria-label="Forma de onda synth" value={s.wave} disabled={noise} onChange={e=>state.setSynthControl('wave',e.target.value as Waveform)}><option value="sine">SINE</option><option value="triangle">TRIANGLE</option><option value="sawtooth">SAW</option><option value="square">SQUARE</option></select></label><label className="synth-select">OCTAVA<select aria-label="Octava synth" value={s.octave} onChange={e=>state.setSynthControl('octave',Number(e.target.value))}>{[-2,-1,0,1,2].map(v=><option key={v} value={v}>{v>0?`+${v}`:v}</option>)}</select></label><Param label="DETUNE" param="detune" state={state} disabled={noise}/><Volume state={state}/></>}
   {state.synthSection==='FILTER'&&<><label className="synth-select">TIPO<select aria-label="Tipo de filtro synth" value={s.filterType} onChange={e=>state.setSynthControl('filterType',e.target.value as FilterKind)}><option value="lowpass">PASA BAJOS</option><option value="highpass">PASA ALTOS</option><option value="bandpass">PASA BANDA</option></select></label><Param label="CUTOFF" param="cutoff" state={state}/><Param label="RESONANCIA" param="resonance" state={state}/><Volume state={state}/></>}
   {state.synthSection==='ENV'&&<><Param label="ATAQUE" param="attack" state={state}/><Param label="DECAY" param="decay" state={state}/><Param label="SUSTAIN" param="sustain" state={state}/><Param label="RELEASE" param="release" state={state}/><Volume state={state}/></>}
   {state.synthSection==='MOD'&&<><label className="synth-select">DESTINO<select aria-label="Destino LFO synth" value={s.lfoTarget} onChange={e=>state.setSynthControl('lfoTarget',e.target.value as ModTarget)}><option value="pitch">AFINACIÓN</option><option value="cutoff">CUTOFF</option></select></label><Param label="LFO VEL" param="lfoRate" state={state}/><Param label="LFO PROF" param="lfoDepth" state={state}/><Volume state={state}/></>}
   {state.synthSection==='FX'&&<><Param label="DRIVE" param="drive" state={state}/><Param label="DELAY" param="delayMix" state={state}/><Param label="TIEMPO" param="delayTime" state={state}/><Param label="REVERB" param="reverb" state={state}/><Volume state={state}/></>}
  </div>
  <p className="synth-panel-help">{noise&&state.synthSection==='OSC'?'NOISE USA RUIDO: ONDA Y DETUNE NO SE APLICAN.':'PRESET CARGA LOS CONTROLES; CADA CAPA CONSERVA SU CARÁCTER.'} ATAQUE / DECAY: NUEVAS · SUSTAIN: EN VIVO · RELEASE: AL LIBERAR.</p>
 </div>
}
