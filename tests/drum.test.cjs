const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  module._compile(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, filename)
}
const { DRUM_STYLES, generateDrumPattern } = require('../src/patterns.ts')
const { DrumEngine } = require('../src/audio.ts')
const { DRUM_KITS } = require('../src/drumKits.ts')

const empty = () => Array.from({length:4}, () => Array(16).fill(false))
for (const style of DRUM_STYLES) {
  const first = generateDrumPattern(style, 'A41F', 30, 55, empty(), [])
  assert.deepEqual(first, generateDrumPattern(style, 'A41F', 30, 55, empty(), []), `${style}: seed reproducibility`)
  assert.equal(first.length, 4)
  assert(first.every(row => row.length === 16))
  const manual = empty(); manual[0][1] = true; manual[2][7] = true
  const locked = generateDrumPattern(style, 'other', 90, 80, manual, [0, 2])
  assert.deepEqual(locked[0], manual[0], `${style}: kick lock`)
  assert.deepEqual(locked[2], manual[2], `${style}: hat lock`)
}
const patterns = DRUM_STYLES.map(style => JSON.stringify(generateDrumPattern(style, 'A41F', 30, 55, empty(), [])))
assert.equal(new Set(patterns).size, DRUM_STYLES.length, 'styles produce distinct patterns')
assert.notDeepEqual(generateDrumPattern('BROKEN', 'A41F', 0, 55, empty(), []), generateDrumPattern('BROKEN', 'A41F', 100, 55, empty(), []), 'WEIRD changes the pattern')
assert.notDeepEqual(generateDrumPattern('BROKEN', 'A41F', 30, 10, empty(), []), generateDrumPattern('BROKEN', 'A41F', 30, 90, empty(), []), 'density changes the pattern')
for (let row = 0; row < 4; row++) {
  const signatures = DRUM_STYLES.map(style => {
    const { level, ...timbre } = DRUM_KITS[style].voices[row]
    assert(level > 0)
    return JSON.stringify(timbre)
  })
  assert.equal(new Set(signatures).size, DRUM_STYLES.length, `voice ${row}: styles differ beyond volume`)
}

let timers = new Map(), rafs = new Map(), id = 0, ctx
const real = {setInterval:global.setInterval,clearInterval:global.clearInterval,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,setTimeout:global.setTimeout,AudioContext:global.AudioContext}
global.setInterval = fn => { const key=++id; timers.set(key,fn); return key }
global.clearInterval = key => timers.delete(key)
global.requestAnimationFrame = fn => { const key=++id; rafs.set(key,fn); return key }
global.cancelAnimationFrame = key => rafs.delete(key)
global.setTimeout = () => 0
class Param { constructor(){this.value=0;this.events=[]} setValueAtTime(v,t){this.value=v;this.events.push([v,t])} exponentialRampToValueAtTime(v,t){this.value=v;this.events.push([v,t])} setTargetAtTime(v){this.value=v} cancelScheduledValues(){} }
class Node { constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param()} connect(node){return node} disconnect(){} start(time){ctx.starts.push(time)} stop(){} }
class Context {
  constructor(){this.currentTime=0;this.state='suspended';this.sampleRate=48000;this.destination=new Node();this.starts=[];this.oscillators=[];this.gains=[];ctx=this}
  async resume(){this.state='running'} async close(){this.state='closed'}
  createGain(){const node=new Node();this.gains.push(node);return node} createOscillator(){const node=new Node();this.oscillators.push(node);return node} createBufferSource(){return new Node()} createBiquadFilter(){return new Node()} createWaveShaper(){return new Node()}
  createBuffer(_channels,length){return {getChannelData:()=>new Float32Array(length)}}
}
global.AudioContext=Context
const tick = time => { ctx.currentTime=time; for(const fn of [...timers.values()]) fn() }
const frame = () => { const all=[...rafs.values()]; rafs.clear(); for(const fn of all) fn() }
async function run(){
  const data={bpm:120, drum:empty(), volume:75, swing:0, human:0, style:'BROKEN'}
  data.drum[0][0]=true
  let visible=null
  const engine=new DrumEngine(()=>data, step=>{visible=step})
  await Promise.all([engine.start(),engine.start()])
  assert.equal(timers.size,1,'repeated PLAY keeps one clock')
  assert.equal(ctx.starts.length,1,'active step schedules a synthesized voice')
  assert.equal(ctx.starts[0],.05)
  tick(.05); frame(); assert.equal(visible,0,'visible step follows audio time')
  data.drum[1][1]=true
  tick(.11); assert(ctx.starts.length > 1,'editing a future step schedules its voice')
  data.bpm=240; data.drum[0][2]=true; data.drum[0][3]=true
  tick(.23); tick(.29)
  const kickTimes=ctx.starts.filter(time=>time>.2)
  assert(kickTimes.length>=2 && Math.abs(kickTimes[1]-kickTimes[0]-.0625)<.00001,'new BPM changes future 16th-note spacing')
  engine.setVolume(0); assert.equal(ctx.gains[0].gain.value,0,'volume changes output gain')
  engine.stop(); assert.equal(timers.size,0,'STOP removes clock'); assert.equal(visible,null,'STOP clears current step')
  const count=ctx.starts.length; tick(2); assert.equal(ctx.starts.length,count,'STOP schedules no further voices')
  await engine.start(); assert.equal(timers.size,1,'restart creates one clock')
  engine.dispose(); assert.equal(timers.size,0,'dispose removes clock')

  const live={bpm:120, drum:empty(), volume:75, swing:0, human:0, style:'BROKEN'}
  live.drum[0].fill(true)
  const rhythm=new DrumEngine(()=>live,()=>{})
  await rhythm.start()
  tick(.11)
  assert(Math.abs(ctx.starts[1]-.175)<1e-8,'zero swing plays even step on the grid')
  live.swing=100
  tick(.23); tick(.36)
  assert(Math.abs(ctx.starts[3]-.48)<1e-8,'swing delays alternate steps without shifting the clock')
  const previousRandom=Math.random
  Math.random=()=>.8
  live.human=100
  tick(.49)
  assert(Math.abs(ctx.gains[5].gain.events[1][0]-.432)<1e-8,'human changes hit velocity')
  live.style='GLITCH'
  tick(.61)
  assert.equal(ctx.oscillators[0].type,'sine')
  assert.equal(ctx.oscillators[5].type,'triangle','style change alters the next synthesized voice without changing the pattern')
  Math.random=previousRandom
  rhythm.dispose()
  Object.assign(global,real)
  console.log('OK: estilos, semillas, WEIRD, densidad, LOCK, PLAY/STOP, BPM, edición y reloj compartido')
}
run().catch(error=>{console.error(error);process.exitCode=1})
