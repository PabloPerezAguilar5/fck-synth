const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const compile = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename)
require.extensions['.ts']=compile
require.extensions['.tsx']=compile
require.extensions['.css']=()=>{}
global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react')
const {create,act}=require('react-test-renderer')
const App=require('../src/App.tsx').default
let timers=new Map(), id=0, starts=0
const original={setInterval:global.setInterval,clearInterval:global.clearInterval,requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,AudioContext:global.AudioContext}
global.setInterval=fn=>{const n=++id;timers.set(n,fn);return n}
global.clearInterval=n=>timers.delete(n)
global.requestAnimationFrame=()=>++id
global.cancelAnimationFrame=()=>{}
class Param{constructor(){this.value=0}setValueAtTime(v){this.value=v}exponentialRampToValueAtTime(){}setTargetAtTime(){}cancelScheduledValues(){}}
class Node{constructor(){this.gain=new Param();this.frequency=new Param();this.Q=new Param()}connect(node){return node}disconnect(){}start(){starts++}stop(){}}
class Context{constructor(){this.currentTime=0;this.sampleRate=48000;this.state='suspended';this.destination=new Node()}async resume(){this.state='running'}async close(){this.state='closed'}createGain(){return new Node()}createOscillator(){return new Node()}createBufferSource(){return new Node()}createBiquadFilter(){return new Node()}createWaveShaper(){return new Node()}createBuffer(_,length){return {getChannelData:()=>new Float32Array(length)}}}
global.AudioContext=Context
async function run(){
 let app
 await act(async()=>{app=create(React.createElement(App))})
 const find=props=>app.root.findByProps(props)
 await act(async()=>{find({'aria-label':'KICK, paso 2'}).props.onClick()})
 assert.equal(find({'aria-label':'KICK, paso 2'}).props['aria-pressed'],true)
 await act(async()=>{find({'aria-label':'Iniciar reproducción'}).props.onClick()})
 assert.equal(timers.size,1);assert(starts>0)
 await act(async()=>{find({'aria-label':'Ampliar drum'}).props.onClick()})
 assert.equal(find({'aria-label':'KICK, paso 2'}).props['aria-pressed'],true,'pattern remains after expansion')
 assert.equal(timers.size,1,'expansion does not duplicate playback')
 await act(async()=>{find({'aria-label':'Bloquear KICK para RANDOM'}).props.onClick()})
 await act(async()=>{find({'aria-label':'Estilo de batería'}).props.onChange({target:{value:'GLITCH'}})})
 assert.equal(find({'aria-label':'KICK, paso 2'}).props['aria-pressed'],true,'changing style keeps the current pattern')
 await act(async()=>{find({'aria-label':'Semilla del patrón DRUM'}).props.onChange({target:{value:'TEST'}})})
 const repeat=()=>app.root.findAllByType('button').find(x=>x.children.includes('REPETIR'))
 const pattern=()=>['KICK','SNARE','HAT','PERC'].map(row=>Array.from({length:16},(_,i)=>find({'aria-label':`${row}, paso ${i+1}`}).props['aria-pressed']))
 await act(async()=>{repeat().props.onClick()})
 const seeded=pattern()
 await act(async()=>{repeat().props.onClick()})
 assert.deepEqual(pattern(),seeded,'REPETIR recreates the pattern from the visible seed and configuration')
 await act(async()=>{app.root.findAllByType('button').find(x=>x.children.includes('RANDOM')&&!x.props.disabled).props.onClick()})
 assert.notEqual(find({'aria-label':'Semilla del patrón DRUM'}).props.value,'TEST','RANDOM chooses and displays a new seed')
 assert.equal(find({'aria-label':'KICK, paso 2'}).props['aria-pressed'],true,'random preserves locked kick')
 await act(async()=>{app.root.findAllByType('button').find(x=>x.children.some(c=>c && c.type==='span' && c.children.includes('VOLVER AL RACK'))).props.onClick()})
 assert.equal(find({'aria-label':'KICK, paso 2'}).props['aria-pressed'],true,'pattern remains after returning to rack')
 assert.equal(timers.size,1,'returning does not duplicate playback')
 await act(async()=>{find({'aria-label':'Detener reproducción'}).props.onClick()})
 assert.equal(timers.size,0)
 await act(async()=>{app.unmount()})
 Object.assign(global,original)
 console.log('OK: React conserva patrón y reloj al ampliar, generar con LOCK y volver al rack')
}
run().catch(error=>{console.error(error);process.exitCode=1})
