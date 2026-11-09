const assert = require('node:assert/strict')
const fs = require('node:fs'), ts = require('typescript')
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, filename)
const { BASS_MODES, ROOTS, SCALES, bassMidi, bassLabels, generateBassPattern } = require('../src/bassPatterns.ts')
const { DrumEngine } = require('../src/audio.ts')
const scaleIntervals = {'PENTA MIN':[0,3,5,7,10], MINOR:[0,2,3,5,7,8,10], MAJOR:[0,2,4,5,7,9,11], DORIAN:[0,2,3,5,7,9,10]}
for (const mode of BASS_MODES) for (const root of ROOTS) for (const scale of SCALES) {
  const pattern = generateBassPattern(mode, 'TEST')
  assert.deepEqual(pattern, generateBassPattern(mode, 'TEST'))
  assert.equal(pattern.notes.length, 16)
  assert(pattern.notes.some(note => note !== null))
  assert(pattern.notes.every(note => note === null || Number.isInteger(note) && note >= 0 && note < 5))
  assert(pattern.notes.every(note => note === null || scaleIntervals[scale].includes((bassMidi(root, scale, note) - ROOTS.indexOf(root)) % 12)))
  assert.equal(bassLabels(root,scale).length, 5)
  assert(pattern.accents.every(step => pattern.notes[step] !== null))
}
assert.equal(new Set(BASS_MODES.map(mode => JSON.stringify(generateBassPattern(mode,'TEST')))).size, 5)
assert(generateBassPattern('DRONE','TEST').lengths.some(length => length > 1))
assert.notDeepEqual(generateBassPattern('CHAOS','TEST'), generateBassPattern('CHAOS','OTHER'))
let timers = new Map(), id = 0, ctx
const original = {setInterval:global.setInterval,clearInterval:global.clearInterval,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,setTimeout:global.setTimeout,AudioContext:global.AudioContext}
global.setInterval=fn=>{timers.set(++id,fn);return id}; global.clearInterval=id=>timers.delete(id)
global.requestAnimationFrame=()=>++id; global.cancelAnimationFrame=()=>{}; global.setTimeout=()=>0
class Param {constructor(){this.value=0;this.events=[]} setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t])} exponentialRampToValueAtTime(v,t){this.value=v;this.events.push(['ramp',v,t])} setTargetAtTime(v,t,k){this.value=v;this.events.push(['target',v,t,k])} cancelScheduledValues(t){this.events.push(['cancel',t])}}
class Node {constructor(kind){this.kind=kind;this.gain=new Param();this.frequency=new Param();this.Q=new Param()} connect(n){return n} disconnect(){} start(t){ctx.started.push([this.kind,t])} stop(t){ctx.stopped.push([this.kind,t])}}
class Context {constructor(){this.currentTime=0;this.state='suspended';this.sampleRate=48000;this.destination=new Node('destination');this.started=[];this.stopped=[];this.filters=[];this.gains=[];this.oscs=[];this.shapers=[];ctx=this} async resume(){this.state='running'} async close(){this.state='closed'} createGain(){const n=new Node('gain');this.gains.push(n);return n} createOscillator(){const n=new Node('osc');this.oscs.push(n);return n} createBufferSource(){return new Node('noise')} createBiquadFilter(){const n=new Node('filter');this.filters.push(n);return n} createWaveShaper(){const n=new Node('shaper');this.shapers.push(n);return n} createBuffer(_,length){return {getChannelData:()=>new Float32Array(length)}}}
global.AudioContext=Context
async function run(){
 const notes=Array(16).fill(null), drum=Array.from({length:4},()=>Array(16).fill(false));notes[0]=4; drum[0][0]=true
 const bass={notes,accents:[0],lengths:Array(16).fill(1),root:'C',scale:'PENTA MIN',cutoff:50,resonance:20,decay:50,drive:30,volume:60};bass.lengths[0]=6
 const data={bpm:120,drum,volume:75,swing:0,human:0,style:'BROKEN',bass}
 const engine=new DrumEngine(()=>data,()=>{})
 await Promise.all([engine.start(),engine.start()]);assert.equal(timers.size,1)
 assert.deepEqual(ctx.started.map(x=>x[1]),[.05,.05],'drum and bass start together')
 const firstBass=ctx.oscs[1], firstEnvelope=ctx.gains[3]
 assert(Math.abs(firstBass.frequency.events[0][1]-65.406)<.01)
 assert.equal(firstEnvelope.gain.events[1][1],.85,'accent changes amplitude')
 notes[1]=2;bass.accents=[];bass.cutoff=80;bass.resonance=75;bass.decay=90;bass.drive=90;data.bpm=240
 ctx.currentTime=.11;for(const tick of timers.values())tick()
 assert.equal(ctx.oscs.length,3,'editing schedules a new bass note')
 assert(firstEnvelope.gain.events.some(e=>e[0]==='cancel' && e[1]===.175),'new note releases a sustained note')
 assert(ctx.filters[1].frequency.events[0][1]>ctx.filters[0].frequency.events[0][1],'cutoff changes filter')
 assert(ctx.filters[1].Q.value>ctx.filters[0].Q.value,'resonance changes filter')
 assert(ctx.shapers[2].curve[256]!==ctx.shapers[1].curve[256],'drive changes distortion')
 assert.equal(ctx.gains[4].gain.events[1][1],.52,'unaccented note is quieter')
 assert(ctx.gains[4].gain.events.some(e=>e[0]==='target' && e[3]>.5),'decay changes envelope')
 engine.setBassVolume(0);assert.equal(ctx.gains[1].gain.value,0)
 const count=ctx.oscs.length;ctx.currentTime=.17;for(const tick of timers.values())tick();assert.equal(ctx.oscs.length,count,'empty bass steps are silent')
 notes[3]=4;drum[0][3]=true;ctx.currentTime=.23;for(const tick of timers.values())tick()
 assert.deepEqual(ctx.started.slice(-2).map(x=>x[1]),[.3,.3],'both modules follow the updated BPM together')
 engine.stop();assert.equal(timers.size,0);assert(ctx.gains[1].gain.events.some(e=>e[0]==='target'&&e[1]===0),'stop fades bass output')
 engine.dispose()

 // The same notes and controls must produce a different synthesis in every mode.
 const signatures=[]
 for (const mode of BASS_MODES) {
  const sameNotes=Array(16).fill(null);sameNotes[0]=4
  const settings={notes:sameNotes,accents:[],lengths:Array(16).fill(1),root:'C',scale:'PENTA MIN',cutoff:50,resonance:50,decay:50,drive:30,volume:60,mode}
  const playback={bpm:120,drum:Array.from({length:4},()=>Array(16).fill(false)),volume:75,swing:0,human:0,style:'BROKEN',bass:settings}
  const player=new DrumEngine(()=>playback,()=>{});await player.start()
  signatures.push(JSON.stringify([ctx.oscs[0].type,ctx.filters[0].frequency.events,ctx.filters[0].Q.value,Array.from(ctx.shapers[1].curve.filter((_,i)=>i%128===0)),ctx.gains[2].gain.events]))
  assert.equal(sameNotes[0],4,`${mode} leaves the pattern intact`)
  player.dispose()
 }
 assert.equal(new Set(signatures).size,5,'each mode changes actual synthesis parameters')

 const unchanged=Array(16).fill(4)
 const changing={bpm:120,drum:Array.from({length:4},()=>Array(16).fill(false)),volume:75,swing:0,human:0,style:'BROKEN',bass:{notes:unchanged,accents:[],lengths:Array(16).fill(1),root:'C',scale:'PENTA MIN',cutoff:50,resonance:50,decay:50,drive:30,volume:60,mode:'PULSE'}}
 const changingPlayer=new DrumEngine(()=>changing,()=>{});await changingPlayer.start()
 assert.equal(ctx.oscs[0].type,'triangle')
 changing.bass.mode='DIRTY';ctx.currentTime=.11;for(const tick of timers.values())tick()
 assert.equal(ctx.oscs[1].type,'sawtooth','changing mode alters the next live note')
 assert(unchanged.every(note=>note===4),'changing mode does not regenerate notes')
 assert.equal(timers.size,1);changingPlayer.dispose()

 const held=Array(16).fill(null);held[0]=4;held[1]=3;held[2]=2;held[3]=1
 const rhythm=Array.from({length:4},()=>Array(16).fill(false));rhythm[1].fill(true)
 const live={bpm:120,drum:rhythm,volume:75,swing:0,human:0,style:'BROKEN',muted:{drum:false,bass:false},bass:{notes:held,accents:[],lengths:Array(16).fill(6),root:'C',scale:'PENTA MIN',cutoff:50,resonance:50,decay:50,drive:30,volume:60,mode:'DRONE'}}
 const player=new DrumEngine(()=>live,()=>{});await player.start()
 ctx.currentTime=.11;for(const tick of timers.values())tick() // Step 2 is already queued.
 const bassEnvelopes=ctx.gains.filter(n=>n.gain.events.some(e=>e[0]==='ramp' && e[1]===.52*.68))
 assert.equal(bassEnvelopes.length,2,'current and lookahead bass notes exist')
 live.muted.bass=true;player.setMute('bass',true,live.bass.volume)
 assert(bassEnvelopes.every(n=>n.gain.events.some(e=>e[0]==='cancel'&&e[1]===.11)), 'mute releases both current and queued bass voices')
 assert(ctx.stopped.some(([kind,time])=>kind==='osc' && time===.11),'mute cancels a future oscillator before it starts')
 assert.equal(ctx.gains[1].gain.events.at(-1)[1],0,'bass output fades to silence')
 assert(ctx.gains[0].gain.value>0,'bass mute leaves drum output alone')
 player.setBassVolume(100,true);assert.equal(ctx.gains[1].gain.value,0,'volume changes cannot override mute')
 const bassCount=()=>ctx.gains.filter(n=>n.gain.events.some(e=>e[0]==='ramp' && e[1]===.52*.68)).length
 const before=bassCount();ctx.currentTime=.23;for(const tick of timers.values())tick()
 assert.equal(bassCount(),before,'muted bass schedules no new notes')
 live.muted.bass=false;player.setMute('bass',false,live.bass.volume)
 live.muted.drum=true;player.setMute('drum',true,live.volume)
 assert.equal(ctx.gains[0].gain.events.at(-1)[1],0,'drum output fades independently')
 assert(ctx.gains[1].gain.value>0,'unmuting bass restores its level')
 ctx.currentTime=.36;for(const tick of timers.values())tick()
 assert.equal(bassCount(),before+1,'bass resumes on the next scheduled note')
 assert.equal(timers.size,1,'mute changes never add clocks')
 player.stop();await player.start()
 assert.equal(ctx.gains[0].gain.value,0,'muted drum remains muted after restart')
 assert.equal(timers.size,1)
 player.dispose();Object.assign(global,original);console.log('OK: BASS escalas, timbres, controles, MUTE y reloj compartido')
}
run().catch(e=>{console.error(e);process.exitCode=1})
