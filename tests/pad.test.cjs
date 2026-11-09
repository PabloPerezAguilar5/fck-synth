const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename)
const {SynthPadEngine,padMidi,PAD_PRESETS,PAD_MAX_LAYERS}=require('../src/synthPad.ts')
const {SYNTH_DEFAULTS}=require('../src/synthParams.ts')
const {ROOTS,SCALES,bassMidi}=require('../src/bassPatterns.ts')
const {DrumEngine}=require('../src/audio.ts')
for(const root of ROOTS)for(const scale of SCALES){const classes=new Set(Array.from({length:5},(_,i)=>bassMidi(root,scale,i)%12));let last=-1;for(let i=0;i<=100;i++){const midi=padMidi(i/100,root,scale);assert(classes.has(midi%12));assert(midi>=last);last=midi}}
let ctx,contexts=0,timers=new Map(),timeouts=[],id=0
const original={AudioContext:global.AudioContext,setInterval:global.setInterval,clearInterval:global.clearInterval,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,setTimeout:global.setTimeout,clearTimeout:global.clearTimeout}
global.setInterval=fn=>{timers.set(++id,fn);return id};global.clearInterval=id=>timers.delete(id);global.requestAnimationFrame=()=>++id;global.cancelAnimationFrame=()=>{};global.setTimeout=(fn,ms)=>{fn.delay=ms;timeouts.push(fn);return timeouts.length};global.clearTimeout=id=>{if(timeouts[id-1])timeouts[id-1].cancelled=true}
class Param{constructor(){this.value=0;this.events=[]}setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])}setTargetAtTime(v,t,k){this.value=v;this.events.push(['target',v,t,k])}exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t])}cancelScheduledValues(t){this.events.push(['cancel',t])}}
class Node{constructor(kind){this.kind=kind;this.gain=new Param();this.frequency=new Param();this.Q=new Param();this.delayTime=new Param();this.threshold=new Param();this.knee=new Param();this.ratio=new Param();this.attack=new Param();this.release=new Param();this.starts=[];this.stops=[];this.connections=[];this.disconnected=false}connect(n){this.out=n;this.connections.push(n);return n}disconnect(){this.disconnected=true}start(t){this.starts.push(t)}stop(t){this.stops.push(t)}}
class Context{
 constructor(){contexts++;ctx=this;this.state='suspended';this.currentTime=0;this.sampleRate=48000;this.destination=new Node('destination');this.gains=[];this.filters=[];this.oscs=[];this.sources=[];this.delays=[];this.convolvers=[];this.shapers=[]}
 async resume(){this.state='running'}async close(){this.state='closed'}
 createGain(){const n=new Node('gain');this.gains.push(n);return n}createOscillator(){const n=new Node('osc');this.oscs.push(n);return n}createBufferSource(){const n=new Node('noise');this.sources.push(n);return n}createBiquadFilter(){const n=new Node('filter');this.filters.push(n);return n}createWaveShaper(){const n=new Node('shaper');this.shapers.push(n);return n}createDelay(){const n=new Node('delay');this.delays.push(n);return n}createConvolver(){const n=new Node('convolver');this.convolvers.push(n);return n}createDynamicsCompressor(){this.compressor=new Node('compressor');return this.compressor}createBuffer(_,length){return {getChannelData:()=>new Float32Array(length)}}
}
global.AudioContext=Context
const settings={...SYNTH_DEFAULTS.DRONE,root:'C',scale:'PENTA MIN',preset:'DRONE',volume:60,octave:0}
const flush=()=>new Promise(setImmediate)
const voice=(context,index)=>{
 const noise=context.sources[index],input=noise.out.out.out
 const main=context.oscs.filter(o=>o.out?.out?.out===input),aux=context.oscs.filter(o=>o.out?.out===input)
 const oscillators=[...main,...aux],osc=oscillators[0],lfo=context.oscs.find(o=>o.connections.some(g=>g.connections?.includes(osc.frequency)))
 const filters=input.connections,envelope=filters[0].out.out,output=envelope.out
 const mixers=[osc.out.out,oscillators[4].out,oscillators[5].out,oscillators[6].out,noise.out.out]
 return {osc,oscillators,lfo,filters,noise,envelope,output,mixers,waveMix:oscillators.slice(0,4).map(o=>o.out),pitchMod:lfo.connections.find(g=>g.connections?.includes(osc.frequency)),cutoffMod:lfo.connections.find(g=>g.connections?.includes(filters[0].frequency))}
}
async function run(){
 const drum=Array.from({length:4},()=>Array(16).fill(false));drum[0][0]=true
 const bass=Array(16).fill(null);bass[0]=4
 const data={bpm:120,drum,volume:75,swing:0,human:0,style:'BROKEN',bass:{notes:bass,accents:[],lengths:Array(16).fill(1),root:'C',scale:'PENTA MIN',cutoff:50,resonance:50,decay:50,drive:30,volume:60}}
 const transport=new DrumEngine(()=>data,()=>{});let count=0
 const pad=new SynthPadEngine(()=>transport.ensureContext(),settings,n=>{count=n})
 assert.equal(contexts,0,'static and preset selection do not start audio')
 pad.update({...settings,preset:'NOISE',...SYNTH_DEFAULTS.NOISE});assert.equal(contexts,0)
 pad.update(settings);assert(pad.press({x:0,y:1}));await flush()
 assert.equal(contexts,1);assert.equal(timers.size,0);assert.equal(ctx.oscs.length,8)
 const first=voice(ctx,0), firstPitch=first.osc.frequency.value, dark=first.filters[0].frequency.value
 assert.equal(first.noise.starts.length,1);assert.equal(first.mixers[4].gain.value,0,'DRONE does not mix noise')
 pad.move({x:.2,y:.5});assert(first.osc.frequency.value>firstPitch);assert(first.filters[0].frequency.value>dark)
 pad.end(true);const oldPitch=first.osc.frequency.value,oldFilter=first.filters[0].frequency.value,oldMix=first.mixers.map(n=>n.gain.value)
 pad.update({...settings,preset:'GLASS'});assert.deepEqual(first.mixers.map(n=>n.gain.value),oldMix,'preset identity is retained')
 assert(pad.press({x:.5,y:.4}));await flush();const second=voice(ctx,1)
 assert.equal(count,2);assert.notDeepEqual(second.mixers.map(n=>n.gain.value),oldMix);assert.equal(first.osc.stops.length,0)
 pad.move({x:.7,y:.1});assert.equal(first.osc.frequency.value,oldPitch);assert.equal(first.filters[0].frequency.value,oldFilter,'drag only changes current voice')
 pad.end(true)
 assert.equal(ctx.delays.length,1);assert.equal(ctx.convolvers.length,1);assert.equal(first.lfo,second.lfo,'layers share one effects bus and LFO')
 pad.update({...settings,...SYNTH_DEFAULTS.GLASS,preset:'GLASS'})
 assert(first.filters[0].frequency.value!==oldFilter,'loading a preset applies its live controls to existing layers')
 assert.deepEqual(first.mixers.map(n=>n.gain.value),oldMix);assert.equal(first.osc.stops.length,0,'loading a preset retains each layer identity')
 const fxInput=first.output.out,driveDry=fxInput.connections[0],driveWet=ctx.shapers[0].out,delay=ctx.delays[0],delayWet=delay.connections[1],reverbWet=ctx.convolvers[0].out
 assert.equal(second.output.out,fxInput,'both layers use the same bus')
 const originalFreq=first.osc.frequency.value,originalSecond=second.osc.frequency.value,originalMix=first.mixers.map(n=>n.gain.value)
 let live={...settings,preset:'GLASS',wave:'square',octave:1,detune:100,cutoff:90,resonance:85,filterType:'highpass',lfoRate:80,lfoDepth:90,lfoTarget:'pitch',drive:80,delayMix:75,delayTime:70,reverb:80,volume:35,sustain:25}
 pad.update(live)
 assert(Math.abs(first.osc.frequency.value/originalFreq-2)<1e-8 && Math.abs(second.osc.frequency.value/originalSecond-2)<1e-8,'octave retunes both layers')
 assert(first.oscillators[4].frequency.value>first.osc.frequency.value,'detune separates the second oscillator')
 assert(first.waveMix[3].gain.value===1 && first.waveMix[1].gain.value===0,'waveform crossfades')
 assert.equal(first.waveMix[3].gain.events.at(-1)[3],.025);assert.equal(first.osc.frequency.events.at(-1)[3],.035,'wave and octave changes are smoothed')
 assert(first.filters[1].out.gain.value===1 && first.filters[0].out.gain.value===0,'filter type crossfades')
 assert(first.filters[0].frequency.value>oldFilter && first.filters.every(f=>f.Q.value>4) && second.filters.every(f=>f.Q.value>4),'cutoff and resonance update all layers')
 assert(first.lfo.frequency.value>5 && first.pitchMod.gain.value>0 && first.cutoffMod.gain.value===0,'LFO rate and pitch depth are active')
 assert(first.envelope.gain.events.some(e=>e[0]==='target'&&Math.abs(e[1]-.2)<1e-8) && second.envelope.gain.events.some(e=>e[0]==='target'&&Math.abs(e[1]-.2)<1e-8),'sustain affects held layers')
 assert(driveDry.gain.value<1&&driveWet.gain.value>0,'drive changes wet/dry saturation')
 assert(delayWet.gain.value>0&&delay.delayTime.value>.5&&reverbWet.gain.value>0,'delay amount/time and reverb are connected')
 assert.equal(delay.connections[0].gain.value,.22,'delay feedback stays bounded')
 assert.equal(ctx.compressor.threshold.value,-12);assert.equal(ctx.compressor.ratio.value,8,'synth output has peak control')
 assert.deepEqual(first.mixers.map(n=>n.gain.value),originalMix,'live controls do not change retained preset identity')
 live={...live,lfoTarget:'cutoff',filterType:'bandpass'};pad.update(live)
 assert(first.filters[2].out.gain.value===1 && second.filters[2].out.gain.value===1,'bandpass selection reaches both layers')
 assert.equal(first.pitchMod.gain.value,0);assert(first.cutoffMod.gain.value>0&&second.cutoffMod.gain.value>0,'LFO cutoff affects all layers')
 const priorAttack=first.envelope.gain.events[1],priorDecay=first.envelope.gain.events[2]
 pad.update({...live,attack:100,decay:100});assert(first.envelope.gain.events.includes(priorAttack)&&first.envelope.gain.events.includes(priorDecay),'attack and decay remain as scheduled for existing voices')
 assert(pad.press({x:.3,y:.4}));await flush();const third=voice(ctx,2)
 assert(third.envelope.gain.events[1][3]>priorAttack[3]&&third.envelope.gain.events[2][3]>priorDecay[3],'new voice uses new attack and decay')
 pad.end(false);assert(third.osc.stops.length>0,'TOUCH releases its voice');third.osc.onended()
 const releaseTimes=[]
 for(const release of [0,100]) {pad.update({...live,release});const index=ctx.sources.length;assert(pad.press({x:.3,y:.4}));await flush();const v=voice(ctx,index);pad.end(false);releaseTimes.push(v.osc.stops[0]);v.osc.onended()}
 assert(releaseTimes[1]>releaseTimes[0]+2,'release is applied when each voice is freed')
 pad.update({...live,drive:0,delayMix:0,delayTime:0,reverb:0})
 assert.equal(driveWet.gain.value,0);assert.equal(delayWet.gain.value,0);assert.equal(reverbWet.gain.value,0);assert(Math.abs(delay.delayTime.value-.08)<1e-8,'FX controls can return to dry')
 await transport.start();assert.equal(contexts,1);assert.equal(timers.size,1)
 transport.stop();assert.equal(first.osc.stops.length,0);assert.equal(second.osc.stops.length,0,'transport does not stop HOLD')
 await transport.start();pad.clear();assert(first.osc.stops.length&&second.osc.stops.length);assert.equal(timers.size,1,'STOP/CLEAR does not stop transport')
 first.osc.onended();second.osc.onended();assert.equal(count,0)
 const signatures=[]
 for(const preset of PAD_PRESETS){
  pad.update({...settings,...SYNTH_DEFAULTS[preset],preset});const index=ctx.sources.length
  assert(pad.press({x:.4,y:.5}));await flush();const v=voice(ctx,index);signatures.push(JSON.stringify(v.mixers.map(n=>n.gain.value)))
  if(preset==='NOISE')assert(v.mixers[4].gain.value>0&&v.mixers[0].gain.value===0)
  pad.end(false);v.osc.onended()
 }
 assert.equal(new Set(signatures).size,5,'all presets have distinct synthesis')
 const idle=()=>timeouts.filter(fn=>fn.delay===4000&&!fn.cancelled).at(-1)
 assert(idle(),'idle effect bus is scheduled to stop after its tail')
 const pendingIdle=idle()
 pad.update(settings);const held=[]
 for(let i=0;i<PAD_MAX_LAYERS;i++){const index=ctx.sources.length;assert(pad.press({x:i/6,y:.5}));await flush();held.push(voice(ctx,index));pad.end(true)}
 assert(pendingIdle.cancelled,'a new note keeps the effects bus alive')
 assert.equal(count,PAD_MAX_LAYERS);const before=ctx.oscs.length;assert.equal(pad.press({x:.5,y:.5}),false);assert.equal(ctx.oscs.length,before);assert(held.every(v=>v.osc.stops.length===0),'limit keeps existing voices')
 pad.clear();assert(held.every(v=>v.osc.stops.length>0));assert.equal(pad.press({x:.5,y:.5}),false,'release tails remain in limit')
 const oldFx=held[0].output.out,master=oldFx.connections[0].out.connections[0]
 pad.clear(true);assert(master.gain.value===0,'MUTE fades the shared effect output');timeouts.filter(fn=>!fn.cancelled).forEach(fn=>fn());assert(oldFx.disconnected,'MUTE disconnects old effect tails')
 held.forEach(v=>v.osc.onended());assert.equal(count,0)
 transport.dispose();pad.dispose()
 let resolve;const pending=new Promise(r=>{resolve=r});const delayed=new SynthPadEngine(()=>pending,settings)
 delayed.press({x:.5,y:.5});delayed.end(false);const deferredContext=new Context();deferredContext.state='running';resolve(deferredContext);await flush();assert.equal(deferredContext.oscs.length,0)
 let resolveHeld;const waiting=new Promise(r=>{resolveHeld=r});const delayedHold=new SynthPadEngine(()=>waiting,settings)
 delayedHold.press({x:.5,y:.5});delayedHold.end(true);delayedHold.update({...settings,preset:'GLASS'});delayedHold.press({x:.8,y:.2});delayedHold.end(true)
 const heldContext=new Context();heldContext.state='running';resolveHeld(heldContext);await flush();assert.equal(heldContext.oscs.length,15);assert.notDeepEqual(voice(heldContext,0).mixers.map(n=>n.gain.value),voice(heldContext,1).mixers.map(n=>n.gain.value));delayedHold.dispose()
 let resolveMuted;const mutedWait=new Promise(r=>{resolveMuted=r});const mutedPending=new SynthPadEngine(()=>mutedWait,settings)
 mutedPending.press({x:.3,y:.5});mutedPending.end(true);mutedPending.press({x:.5,y:.5});mutedPending.clear(true)
 const mutedContext=new Context();mutedContext.state='running';resolveMuted(mutedContext);await flush();assert.equal(mutedContext.oscs.length,0)
 const failureContext=new Context();failureContext.state='running';let errors=0,failureCount=0
 const createOsc=failureContext.createOscillator.bind(failureContext)
 failureContext.createOscillator=()=>{const node=createOsc();if(failureContext.oscs.length===3)node.start=()=>{throw Error('start failed')};return node}
 const failing=new SynthPadEngine(async()=>failureContext,settings,n=>{failureCount=n},()=>{errors++})
 failing.press({x:.5,y:.5});await flush();assert.equal(errors,1);assert.equal(failureCount,0);assert(failureContext.oscs[1].stops.length>0)
 Object.assign(global,original);console.log('OK: pad capas, ADSR, OSC, filtro, LFO, FX, mute y transporte')
}
run().catch(error=>{console.error(error);process.exitCode=1})
