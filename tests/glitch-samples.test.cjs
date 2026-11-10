const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename)
const {DrumEngine} = require('../src/audio.ts')
const files = ['kick.wav','snare.wav','hat.wav','perc.wav']
const tripFiles = ['kick.wav','snare.wav','hat.wav','perc.wav']
const tripOriginals = ['A01_06 Kick#2.wav','A02_07 Snare#2.wav','A03_09 Hihat#2.wav','A04_13 Rimshot.wav']
for (const file of files) {
  const data = fs.readFileSync(`public/samples/drums/glitch/${file}`)
  assert.equal(data.toString('ascii',0,4),'RIFF')
  assert.equal(data.toString('ascii',8,12),'WAVE')
}
for (const [index, file] of tripFiles.entries()) {
  const data=fs.readFileSync(`public/samples/drums/trip/${file}`)
  assert.equal(data.toString('ascii',0,4),'RIFF')
  assert.equal(data.toString('ascii',8,12),'WAVE')
  assert.deepEqual(data,fs.readFileSync(`public/samples/drums/trip/${tripOriginals[index]}`),'TRIP sample copy matches its original')
}
let context, timers = new Map(), nextId = 0
global.setInterval = fn => { const id=++nextId; timers.set(id,fn); return id }
global.clearInterval = id => timers.delete(id)
global.requestAnimationFrame = () => ++nextId
global.cancelAnimationFrame = () => {}
global.setTimeout = () => 0
class Param {
  constructor(){this.value=0;this.events=[]}
  setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])}
  linearRampToValueAtTime(v,t){this.value=v;this.events.push(['linear',v,t])}
  exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['exp',v,t])}
  setTargetAtTime(v){this.value=v}
  cancelScheduledValues(){}
}
class Node {
  constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param()}
  connect(node){this.connected=node;return node} disconnect(){}
  start(time){context.started.push({node:this,time})} stop(){}
}
class Context {
  constructor(){context=this;this.currentTime=0;this.state='suspended';this.sampleRate=48000;this.destination=new Node();this.started=[];this.oscillators=[];this.gains=[];this.decodes=[]}
  async resume(){this.state='running'} async close(){this.state='closed'}
  async decodeAudioData(data){this.decodes.push(data.file);if(data.file===this.badDecode) throw Error('bad wav');return {file:data.file,duration:.3}}
  createGain(){const n=new Node();this.gains.push(n);return n}
  createOscillator(){const n=new Node();this.oscillators.push(n);return n}
  createBufferSource(){return new Node()} createBiquadFilter(){return new Node()} createWaveShaper(){return new Node()}
  createBuffer(_,length){return {getChannelData:()=>new Float32Array(length)}}
}
global.AudioContext=Context
let requests=[], missing='', gate
global.fetch = async url => {
  requests.push(url)
  if (gate) await gate
  const file=decodeURIComponent(url.split('/').pop())
  return {ok:file!==missing,status:404,arrayBuffer:async()=>({file})}
}
const tick = time => {context.currentTime=time;for(const fn of [...timers.values()]) fn()}
const empty = () => Array.from({length:4},()=>Array(16).fill(false))
async function run(){
  const data={bpm:120,drum:empty(),volume:75,swing:0,human:0,style:'BROKEN'}
  for(const row of data.drum) row.fill(true)
  const engine=new DrumEngine(()=>data,()=>{})
  await engine.start()
  assert.equal(context.oscillators.length,3,'other styles retain synthesized voices')
  let release; gate=new Promise(resolve=>{release=resolve})
  const pending=engine.loadSampleKit('GLITCH')
  assert.equal(engine.loadSampleKit('GLITCH'),pending,'concurrent requests share a load')
  data.style='GLITCH'
  tick(.11)
  assert(context.oscillators.length>3,'GLITCH uses synthesized voices during loading')
  release(); gate=null
  assert.deepEqual(await pending,{state:'ready',failed:[]})
  assert.deepEqual(requests.map(x=>x.split('/').pop()),files)
  assert.deepEqual(context.decodes,files)
  data.swing=100; data.human=100
  const random=Math.random; Math.random=()=>.8
  tick(.23); tick(.36)
  const samples=context.started.filter(x=>x.node.buffer?.file)
  assert.deepEqual(samples.slice(0,4).map(x=>x.node.buffer.file),files,'rows map to the correct samples')
  assert(samples.slice(4,8).every(x=>Math.abs(x.time-.48)<1e-8),'swing delays sample hits on the shared clock')
  const sampleGain=samples[0].node.connected.gain
  assert(Math.abs(sampleGain.events[1][1]-.57*.6)<1e-8,'HUMAN changes sample velocity')
  assert.equal(sampleGain.events.at(-1)[1],0,'sample tail fades out')
  engine.setMute('drum',true,75); assert.equal(context.gains[0].gain.value,0,'mute applies to the sample bus')
  engine.setMute('drum',false,40); assert(Math.abs(context.gains[0].gain.value-.28)<1e-8,'volume applies to the sample bus')
  const oscCount=context.oscillators.length, pattern=JSON.stringify(data.drum)
  data.style='BROKEN'; tick(.49)
  assert(context.oscillators.length>oscCount,'switching back restores synthesis')
  assert.equal(JSON.stringify(data.drum),pattern,'style changes do not alter the pattern')
  assert.equal(timers.size,1,'style changes keep the same transport')
  assert.deepEqual(await engine.loadSampleKit('GLITCH'),{state:'ready',failed:[]})
  assert.equal(requests.length,4,'samples are fetched and decoded only once')
  assert.deepEqual(await engine.loadSampleKit('TRIP-HOP'),{state:'ready',failed:[]})
  assert.deepEqual(requests.slice(4).map(x=>decodeURIComponent(x.split('/').pop())),tripFiles,'TRIP requests the correct files in row order')
  assert(requests.slice(4).every(x=>x.startsWith('samples/drums/trip/')),'TRIP uses its own sample directory')
  const previousStarts=context.started.length
  data.style='TRIP-HOP'; tick(.61)
  assert.deepEqual(context.started.slice(previousStarts).filter(x=>x.node.buffer?.file).map(x=>x.node.buffer.file),tripFiles,'TRIP sample mapping follows the sequencer')
  assert.equal(timers.size,1,'switching sample kits preserves the transport')
  assert.deepEqual(await engine.loadSampleKit('TRIP-HOP'),{state:'ready',failed:[]})
  assert.equal(requests.length,8,'TRIP is also cached')
  Math.random=random
  engine.dispose()

  requests=[];missing='snare.wav'
  const failedEngine=new DrumEngine(()=>data,()=>{})
  const load=failedEngine.loadSampleKit('GLITCH'); context.badDecode='hat.wav'
  assert.deepEqual(await load,{state:'error',failed:['snare.wav','hat.wav']},'missing and undecodable files identify their rows')
  data.style='GLITCH'; data.swing=0; data.human=0
  await failedEngine.start()
  assert.deepEqual(context.started.filter(x=>x.node.buffer?.file).map(x=>x.node.buffer.file),['kick.wav','perc.wav'],'healthy rows still use samples')
  assert(context.oscillators.some(x=>x.type==='square'),'failed rows use GLITCH synthesis')
  failedEngine.dispose()
  requests=[];missing=tripFiles[1]
  const failedTrip=new DrumEngine(()=>data,()=>{})
  const tripLoad=failedTrip.loadSampleKit('TRIP-HOP'); context.badDecode=tripFiles[2]
  assert.deepEqual(await tripLoad,{state:'error',failed:[tripFiles[1],tripFiles[2]]},'TRIP reports the actual missing and undecodable filenames')
  data.style='TRIP-HOP'
  await failedTrip.start()
  assert.deepEqual(context.started.filter(x=>x.node.buffer?.file).map(x=>x.node.buffer.file),[tripFiles[0],tripFiles[3]],'TRIP falls back only on failed rows')
  assert(context.oscillators.some(x=>x.type==='triangle'),'TRIP snare fallback is synthesized')
  failedTrip.dispose()
  console.log('OK: carga, asignación GLITCH, cambio de estilo, controles y respaldo por archivo')
}
run().catch(error=>{console.error(error);process.exitCode=1})
