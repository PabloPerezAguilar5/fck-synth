import { bassMidi, ROOTS, type BassScale } from './bassPatterns'
import type { SynthControls } from './synthParams'

export const PAD_PRESETS = ['DRONE', 'PAD', 'GLASS', 'NOISE', 'ALIEN'] as const
export const PAD_MAX_LAYERS = 6
export type PadPreset = typeof PAD_PRESETS[number]
export type PadSettings = SynthControls & {root:string; scale:BassScale; preset:PadPreset; volume:number}
export type PadPoint = {x:number; y:number}
const clamp = (n:number) => Math.max(0, Math.min(1, n))

export function padMidi(x:number, root:string, scale:BassScale) {
  const index=Math.round(clamp(x)*15)
  return bassMidi(root,scale,4-index%5)+12+12*Math.floor(index/5)
}
export function padNote(x:number, root:string, scale:BassScale) {
  const midi=padMidi(x,root,scale)
  return `${ROOTS[midi%12]}${Math.floor(midi/12)-1}`
}

type Fx = {input:GainNode; master:GainNode; driveDry:GainNode; driveWet:GainNode; delay:DelayNode; delayWet:GainNode; reverbWet:GainNode; lfo:OscillatorNode; nodes:AudioNode[]}
type Voice = {
  sources:AudioScheduledSourceNode[]; oscillators:OscillatorNode[]; waveMix:GainNode[]; mixers:GainNode[]
  noiseFilter:BiquadFilterNode; filters:BiquadFilterNode[]; filterMix:GainNode[]
  lfo:OscillatorNode; pitchMod:GainNode; cutoffMod:GainNode; envelope:GainNode; output:GainNode; nodes:AudioNode[]
}
type Layer = {point:PadPoint; preset:PadPreset; attack:number; decay:number; voice:Voice|null; releasing:boolean; decayStart:number; decayTime:number; sustain:number}

/** One shared effects bus and a bounded set of independent gesture layers. */
export class SynthPadEngine {
  private current:Layer|null=null
  private layers=new Set<Layer>()
  private context:AudioContext|null=null
  private noiseBuffer:AudioBuffer|null=null
  private impulse:AudioBuffer|null=null
  private noiseContext:AudioContext|null=null
  private fx:Fx|null=null
  private idleTimer:ReturnType<typeof setTimeout>|null=null

  constructor(private getContext:()=>Promise<AudioContext>, private settings:PadSettings, private onCount:(count:number)=>void=()=>{}, private onError:()=>void=()=>{}) {}

  press(point:PadPoint) {
    if(this.current || this.layers.size>=PAD_MAX_LAYERS) return false
    const layer:Layer={point,preset:this.settings.preset,attack:this.settings.attack,decay:this.settings.decay,voice:null,releasing:false,decayStart:0,decayTime:0,sustain:this.settings.sustain}
    this.layers.add(layer);this.current=layer;this.changed()
    void this.activate(layer)
    return true
  }

  private async activate(layer:Layer) {
    try {
      const ctx=await this.getContext()
      if(!this.layers.has(layer)) return
      this.context=ctx
      const voice=this.createVoice(ctx,layer)
      layer.voice=voice
      const now=ctx.currentTime
      const attack=.008+Math.pow(clamp(layer.attack/100),2)*1.2
      const decay=.04+Math.pow(clamp(layer.decay/100),2)*1.8
      layer.decayStart=now+attack;layer.decayTime=Math.max(.008,decay/5);layer.sustain=this.settings.sustain
      this.apply(layer,ctx)
      voice.envelope.gain.setValueAtTime(.0001,now)
      voice.envelope.gain.setTargetAtTime(.8,now,Math.max(.004,attack/3))
      voice.envelope.gain.setTargetAtTime(Math.max(.0001,.8*clamp(layer.sustain/100)),layer.decayStart,layer.decayTime)
      for(const source of voice.sources) source.start(now)
    } catch {
      if(!this.layers.has(layer)) return
      if(layer.voice) {
        for(const source of layer.voice.sources) { try {source.stop(this.context?.currentTime??0)} catch { /* Some sources may not have started. */ } }
        for(const node of layer.voice.nodes) node.disconnect()
      }
      this.layers.delete(layer);if(this.current===layer)this.current=null;this.changed();if(this.layers.size===0)this.retireFx();this.onError()
    }
  }
  move(point:PadPoint) { if(!this.current)return;this.current.point=point;if(this.current.voice&&this.context)this.apply(this.current,this.context) }
  update(settings:PadSettings) { this.settings=settings;this.applyAll();if(this.fx&&this.context)this.applyFx(this.fx,this.context) }
  end(hold:boolean) { const layer=this.current;this.current=null;if(layer&&!hold)this.releaseLayer(layer,false) }
  clear(immediate=false) {
    this.current=null
    for(const layer of [...this.layers])this.releaseLayer(layer,immediate)
    if(immediate)this.retireFx()
  }
  dispose() {
    for(const layer of this.layers)if(layer.voice)this.retire(layer.voice,.04)
    this.layers.clear();this.current=null;this.retireFx();this.noiseBuffer=null;this.impulse=null;this.noiseContext=null
  }
  private releaseLayer(layer:Layer,immediate:boolean) {
    if(!layer.voice) {this.layers.delete(layer);this.changed()}
    else if(!layer.releasing||immediate) {
      layer.releasing=true
      this.retire(layer.voice,immediate?.06:.1+Math.pow(clamp(this.settings.release/100),2)*2.4)
    }
  }
  private changed() {
    this.applyAll();this.onCount(this.layers.size)
    if(this.layers.size>0 && this.idleTimer!==null) {clearTimeout(this.idleTimer);this.idleTimer=null}
    if(this.layers.size===0 && this.fx && this.idleTimer===null) {
      // Keep the bounded delay tail, then stop the shared LFO and effects graph.
      const fx=this.fx
      this.idleTimer=setTimeout(()=>{this.idleTimer=null;if(this.layers.size===0 && this.fx===fx)this.retireFx()},4000)
    }
  }
  private applyAll() {if(this.context)for(const layer of this.layers)if(layer.voice)this.apply(layer,this.context)}
  private retire(voice:Voice,seconds:number) {
    if(!this.context)return
    const now=this.context.currentTime,gain=voice.envelope.gain
    if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(now);else gain.cancelScheduledValues(now)
    gain.setTargetAtTime(.0001,now,Math.max(.004,seconds/5))
    for(const source of voice.sources)source.stop(now+seconds+.02)
  }

  private ensureFx(ctx:AudioContext) {
    if(this.fx)return this.fx
    const input=ctx.createGain(), driveDry=ctx.createGain(), driveWet=ctx.createGain(), shaper=ctx.createWaveShaper(), sum=ctx.createGain()
    const curve=new Float32Array(1025)
    for(let i=0;i<curve.length;i++)curve[i]=Math.tanh((i/512-1)*4)/Math.tanh(4)*.5
    shaper.curve=curve
    input.connect(driveDry).connect(sum);input.connect(shaper).connect(driveWet).connect(sum)
    const master=ctx.createGain(), delay=ctx.createDelay(1.2), feedback=ctx.createGain(), delayWet=ctx.createGain(), reverb=ctx.createConvolver(), reverbWet=ctx.createGain()
    driveWet.gain.value=0;delayWet.gain.value=0;reverbWet.gain.value=0
    feedback.gain.value=.22
    sum.connect(master);sum.connect(delay);delay.connect(feedback).connect(delay);delay.connect(delayWet).connect(master)
    if(!this.impulse || this.noiseContext!==ctx) {
      const impulse=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.7),ctx.sampleRate), samples=impulse.getChannelData(0)
      const scale=2.2/Math.sqrt(samples.length)
      for(let i=0;i<samples.length;i++)samples[i]=(Math.random()*2-1)*Math.pow(1-i/samples.length,3)*scale
      this.impulse=impulse
    }
    reverb.normalize=false;reverb.buffer=this.impulse;sum.connect(reverb).connect(reverbWet).connect(master)
    const compressor=ctx.createDynamicsCompressor(),lfo=ctx.createOscillator()
    compressor.threshold.value=-12;compressor.knee.value=6;compressor.ratio.value=8;compressor.attack.value=.003;compressor.release.value=.18
    master.gain.value=.75;master.connect(compressor).connect(ctx.destination)
    lfo.type='sine';lfo.start(ctx.currentTime)
    this.fx={input,master,driveDry,driveWet,delay,delayWet,reverbWet,lfo,nodes:[input,driveDry,driveWet,shaper,sum,master,delay,feedback,delayWet,reverb,reverbWet,compressor,lfo]}
    this.applyFx(this.fx,ctx)
    return this.fx
  }
  private applyFx(fx:Fx,ctx:AudioContext) {
    const now=ctx.currentTime,drive=clamp(this.settings.drive/100)
    fx.driveDry.gain.setTargetAtTime(1-drive*.5,now,.035)
    fx.driveWet.gain.setTargetAtTime(drive*.4,now,.035)
    fx.delay.delayTime.setTargetAtTime(.08+clamp(this.settings.delayTime/100)*.72,now,.04)
    fx.delayWet.gain.setTargetAtTime(clamp(this.settings.delayMix/100)*.35,now,.035)
    fx.reverbWet.gain.setTargetAtTime(clamp(this.settings.reverb/100)*.3,now,.035)
    fx.lfo.frequency.setTargetAtTime(.06+Math.pow(clamp(this.settings.lfoRate/100),2)*9.94,now,.04)
  }
  private retireFx() {
    if(this.idleTimer!==null){clearTimeout(this.idleTimer);this.idleTimer=null}
    const fx=this.fx,ctx=this.context
    this.fx=null
    if(!fx||!ctx)return
    fx.master.gain.setTargetAtTime(0,ctx.currentTime,.008)
    fx.lfo.stop(ctx.currentTime+.24)
    // Disconnect the feedback loop too, so an old wet tail cannot return after MUTE.
    setTimeout(()=>fx.nodes.forEach(node=>node.disconnect()),250)
  }

  private createVoice(ctx:AudioContext,layer:Layer):Voice {
    const filterInput=ctx.createGain(),envelope=ctx.createGain(),output=ctx.createGain()
    output.gain.value=0
    const filters=(['lowpass','highpass','bandpass'] as const).map(type=>{const f=ctx.createBiquadFilter();f.type=type;return f})
    const filterMix=filters.map(filter=>{const g=ctx.createGain();g.gain.value=0;filterInput.connect(filter).connect(g).connect(envelope);return g})
    const fx=this.ensureFx(ctx)
    envelope.connect(output).connect(fx.input)
    const oscillators=Array.from({length:7},()=>ctx.createOscillator())
    ;(['sine','triangle','sawtooth','square','sawtooth','sine','sine'] as const).forEach((wave,i)=>{oscillators[i].type=wave})
    const waveMix=Array.from({length:4},()=>{const g=ctx.createGain();g.gain.value=0;return g})
    const mixers=Array.from({length:5},()=>{const g=ctx.createGain();g.gain.value=0;return g})
    for(let i=0;i<4;i++)oscillators[i].connect(waveMix[i]).connect(mixers[0])
    mixers[0].connect(filterInput)
    for(let i=4;i<7;i++)oscillators[i].connect(mixers[i-3]).connect(filterInput)
    const noise=ctx.createBufferSource(),noiseFilter=ctx.createBiquadFilter()
    if(!this.noiseBuffer||this.noiseContext!==ctx) {
      this.noiseBuffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*2),ctx.sampleRate);this.noiseContext=ctx
      const samples=this.noiseBuffer.getChannelData(0)
      for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1
    }
    noise.buffer=this.noiseBuffer;noise.loop=true;noiseFilter.type='bandpass';noiseFilter.Q.value=2
    noise.connect(noiseFilter).connect(mixers[4]).connect(filterInput)
    const lfo=fx.lfo,pitchMod=ctx.createGain(),cutoffMod=ctx.createGain()
    pitchMod.gain.value=0;cutoffMod.gain.value=0
    lfo.connect(pitchMod);lfo.connect(cutoffMod)
    oscillators.forEach(osc=>pitchMod.connect(osc.frequency));pitchMod.connect(noiseFilter.frequency)
    filters.forEach(filter=>cutoffMod.connect(filter.frequency))
    const sources:AudioScheduledSourceNode[]=[...oscillators,noise]
    const nodes:AudioNode[]=[...sources,...waveMix,...mixers,noiseFilter,filterInput,...filters,...filterMix,pitchMod,cutoffMod,envelope,output]
    const voice={sources,oscillators,waveMix,mixers,noiseFilter,filters,filterMix,lfo,pitchMod,cutoffMod,envelope,output,nodes}
    oscillators[0].onended=()=>{
      const removed=this.layers.delete(layer);if(this.current===layer)this.current=null
      try{lfo.disconnect(pitchMod)}catch{/* The effects bus may already be disconnected. */}
      try{lfo.disconnect(cutoffMod)}catch{/* The effects bus may already be disconnected. */}
      nodes.forEach(node=>node.disconnect());if(removed)this.changed()
    }
    return voice
  }

  private apply(layer:Layer,ctx:AudioContext) {
    const voice=layer.voice!, now=ctx.currentTime, s=this.settings
    const frequency=440*Math.pow(2,(padMidi(layer.point.x,s.root,s.scale)+s.octave*12-69)/12)
    const detuned=frequency*Math.pow(2,clamp(s.detune/100)*32/1200)
    const frequencies=[frequency,frequency,frequency,frequency,detuned,frequency*2.76,frequency*.5]
    voice.oscillators.forEach((osc,i)=>osc.frequency.setTargetAtTime(Math.min(ctx.sampleRate*.45,frequencies[i]),now,.035))
    voice.noiseFilter.frequency.setTargetAtTime(Math.min(ctx.sampleRate*.45,frequency*3),now,.035)
    ;(['sine','triangle','sawtooth','square'] as const).forEach((wave,i)=>voice.waveMix[i].gain.setTargetAtTime(s.wave===wave?1:0,now,.025))
    const brightness=clamp(.15+(1-clamp(layer.point.y))*.5+clamp(s.cutoff/100)*.35),cutoff=Math.min(ctx.sampleRate*.4,100*Math.pow(60,brightness))
    voice.filters.forEach((filter,i)=>{filter.frequency.setTargetAtTime(cutoff,now,.025);filter.Q.setTargetAtTime(.6+clamp(s.resonance/100)*5,now,.025);voice.filterMix[i].gain.setTargetAtTime(filter.type===s.filterType?1:0,now,.025)})
    const mixes:Record<PadPreset,number[]>={DRONE:[.4,.08,0,.38,0],PAD:[.42,.12,.03,.12,0],GLASS:[.12,.07,.42,.04,0],NOISE:[0,0,0,0,.62],ALIEN:[.08,.3,.2,.04,0]}
    voice.mixers.forEach((mix,i)=>mix.gain.setTargetAtTime(mixes[layer.preset][i],now,.025))
    const depth=clamp(s.lfoDepth/100)
    voice.pitchMod.gain.setTargetAtTime(s.lfoTarget==='pitch'?frequency*.025*depth:0,now,.04)
    voice.cutoffMod.gain.setTargetAtTime(s.lfoTarget==='cutoff'?cutoff*.4*depth:0,now,.04)
    voice.output.gain.setTargetAtTime(clamp(s.volume/100)*.28/Math.sqrt(Math.max(1,this.layers.size)),now,.02)
    if(!layer.releasing && layer.sustain!==s.sustain) {
      layer.sustain=s.sustain
      const gain=voice.envelope.gain,at=Math.max(now,layer.decayStart)
      if(at===now && typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(now);else gain.cancelScheduledValues(at)
      gain.setTargetAtTime(Math.max(.0001,.8*clamp(s.sustain/100)),at,at===now?.04:layer.decayTime)
    }
  }
}
