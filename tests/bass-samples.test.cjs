const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename)
const {DrumEngine} = require('../src/audio.ts')
const {BASS_SAMPLES} = require('../src/bassSamples.ts')
const {bassMidi} = require('../src/bassPatterns.ts')
let context, timers = new Map(), id = 0, missing = '', badDecode = '', failStart = false, requests = []
global.setInterval = fn => {timers.set(++id,fn);return id}
global.clearInterval = id => timers.delete(id)
global.requestAnimationFrame = () => ++id
global.cancelAnimationFrame = () => {}
global.setTimeout = () => 0
global.fetch = async url => {
  requests.push(url)
  const file=decodeURIComponent(url.split('/').pop())
  return {ok:file!==missing,status:404,arrayBuffer:async()=>({file})}
}
class Param {
  constructor(){this.value=0;this.events=[]}
  setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])}
  exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t])}
  setTargetAtTime(v,t,k){this.value=v;this.events.push(['target',v,t,k])}
  cancelScheduledValues(t){this.events.push(['cancel',t])}
}
class Node {
  constructor(kind){this.kind=kind;this.gain=new Param();this.frequency=new Param();this.playbackRate=new Param();this.Q=new Param();this.stops=[]}
  connect(node){this.next=node;return node} disconnect(){}
  start(time){if(this.buffer && failStart){failStart=false;throw Error('cannot play')};context.starts.push({node:this,time})}
  stop(time){this.stops.push(time)}
}
class Context {
  constructor(){context=this;this.currentTime=0;this.state='suspended';this.destination=new Node('destination');this.starts=[];this.oscs=[];this.samples=[];this.filters=[];this.shapers=[];this.gains=[];this.decodes=[]}
  async resume(){this.state='running'} async close(){this.state='closed'}
  async decodeAudioData(data){this.decodes.push(data.file);if(data.file===badDecode) throw Error('bad wav');return {file:data.file,duration:2}}
  createGain(){const node=new Node('gain');this.gains.push(node);return node}
  createOscillator(){const node=new Node('osc');this.oscs.push(node);return node}
  createBufferSource(){const node=new Node('sample');this.samples.push(node);return node}
  createBiquadFilter(){const node=new Node('filter');this.filters.push(node);return node}
  createWaveShaper(){const node=new Node('shaper');this.shapers.push(node);return node}
}
global.AudioContext=Context
const empty=()=>Array.from({length:4},()=>Array(16).fill(false))
const tick=time=>{context.currentTime=time;for(const fn of [...timers.values()]) fn()}
function setup(mode='PULSE') {
 const notes=Array(16).fill(null); notes[0]=4
 const bass={mode,notes,accents:[],lengths:Array(16).fill(1),root:'C',scale:'PENTA MIN',cutoff:50,resonance:30,decay:50,drive:30,volume:60}
 return {bpm:120,drum:empty(),volume:75,swing:0,human:0,style:'BROKEN',bass,muted:{drum:false,bass:false}}
}
async function run() {
 const data=setup(), errors=[]
 const player=new DrumEngine(()=>data,()=>{},(mode,status)=>errors.push({mode,status}))
 for(const [mode,config] of Object.entries(BASS_SAMPLES)) {
  const file=fs.readFileSync(`public/samples/bass/${config.file}`)
  assert.equal(file.toString('ascii',0,4),'RIFF');assert.equal(file.toString('ascii',8,12),'WAVE')
  const promise=player.loadBassSample(mode)
  assert.equal(player.loadBassSample(mode),promise,'each mode loads once')
  assert.deepEqual(await promise,{state:'ready',file:config.file})
 }
 assert.equal(requests.length,4);assert.equal(context.decodes.length,4)
 await player.start()
 assert.equal(context.oscs.length,1,'PULSE keeps its oscillator')
 const initial=context.oscs[0]
 for(const [i,mode] of Object.keys(BASS_SAMPLES).entries()) {
  data.bass.mode=mode;data.bass.notes[i+1]=4
  if(i===0){data.bass.accents=[1];data.bass.lengths[1]=6}
  tick(.11+i*.125)
  const node=context.samples.at(-1), config=BASS_SAMPLES[mode]
  assert.equal(node.buffer.file,config.file,`${mode} uses its assigned file`)
  const cents=mode==='CHAOS' ? 12*((i+1)%3-1) : 0
  assert(Math.abs(node.playbackRate.events[0][1]-(65.406391/config.referenceHz)*Math.pow(2,cents/1200))<1e-6,`${mode} transposes its measured fundamental to C2`)
  assert(node.loop && node.loopEnd>node.loopStart,`${mode} loops for sustained notes`)
  assert.equal(timers.size,1,'mode changes keep the same clock')
 }
 const firstSample=context.samples[0]
 assert(firstSample.stops[0]>.175+.5,'six-step note keeps its gate')
 assert(context.gains.some(g=>g.gain.events.some(e=>e[0]==='ramp' && Math.abs(e[1]-.85*.65)<1e-8)),'sample accent changes level')
 assert(context.gains.some(g=>g.gain.events.some(e=>e[0]==='cancel' && e[1]>.175)),'new notes release the preceding envelope')
 assert(initial.onended,'oscillator voice is still tracked')
 data.bass.root='D'; data.bass.scale='MAJOR'; data.bass.notes[5]=0;data.bass.cutoff=90;data.bass.resonance=80;data.bass.decay=90;data.bass.drive=90
 tick(.61)
 const changed=context.samples.at(-1), hz=440*Math.pow(2,(bassMidi('D','MAJOR',0)-69)/12)
 assert(Math.abs(changed.playbackRate.events[0][1]-hz/BASS_SAMPLES.CHAOS.referenceHz*Math.pow(2,12/1200))<1e-6,'root and scale set the sample pitch')
 assert(context.filters.at(-1).Q.value>context.filters[0].Q.value,'resonance controls sample filter')
 assert(context.filters.at(-1).frequency.events[0][1]>context.filters[0].frequency.events[0][1],'cutoff controls sample filter')
 assert(context.gains.at(-1).gain.events.some(e=>e[0]==='target'&&e[3]>.4),'decay controls sample envelope')
 assert(context.shapers.at(-1).curve[256]!==context.shapers[1].curve[256],'drive controls sample distortion')
 player.setBassVolume(25);assert(Math.abs(context.gains[1].gain.value-.095)<1e-8,'bass volume still controls output')
 data.muted.bass=true;player.setMute('bass',true,25)
 assert.equal(context.gains[1].gain.value,0);assert(changed.stops.some(t=>t<=.67),'mute stops active and queued sample sources')
 assert(context.gains[0].gain.value>0,'bass mute leaves DRUM output unchanged')
 player.dispose()

 const broken=setup('BROKEN'), missingPlayer=new DrumEngine(()=>broken,()=>{})
 missing=BASS_SAMPLES.BROKEN.file
 assert.deepEqual(await missingPlayer.loadBassSample('BROKEN'),{state:'error',file:missing})
 await missingPlayer.start();assert.equal(context.oscs[0].type,'square','missing sample falls back to its synthesized voice')
 missingPlayer.dispose();missing=''
 const invalid=setup('DIRTY'), invalidPlayer=new DrumEngine(()=>invalid,()=>{})
 badDecode=BASS_SAMPLES.DIRTY.file
 assert.deepEqual(await invalidPlayer.loadBassSample('DIRTY'),{state:'error',file:badDecode})
 await invalidPlayer.start();assert.equal(context.oscs[0].type,'sawtooth','decode error falls back to synthesis')
 invalidPlayer.dispose();badDecode=''
 const runtime=setup('DRONE'), runtimeErrors=[]
 const runtimePlayer=new DrumEngine(()=>runtime,()=>{},(mode,status)=>runtimeErrors.push({mode,status}))
 await runtimePlayer.loadBassSample('DRONE'); failStart=true; await runtimePlayer.start()
 assert.equal(context.oscs[0].type,'sawtooth','a source start error falls back to synthesis')
 assert.deepEqual(runtimeErrors,[{mode:'DRONE',status:{state:'error',file:BASS_SAMPLES.DRONE.file}}])
 assert.equal((await runtimePlayer.loadBassSample('DRONE')).state,'error','runtime failure is retained')
 runtimePlayer.dispose()
 console.log('OK: samples BASS, afinación, controles, mute y alternativas')
}
run().catch(error=>{console.error(error);process.exitCode=1})
