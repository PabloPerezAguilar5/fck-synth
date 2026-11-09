const assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript')
const compile=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,filename)
require.extensions['.ts']=compile;require.extensions['.tsx']=compile
global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'),{create,act}=require('react-test-renderer')
const {TouchPad}=require('../src/TouchPad.tsx')
const old={requestAnimationFrame:global.requestAnimationFrame,cancelAnimationFrame:global.cancelAnimationFrame,window:global.window,document:global.document,AudioContext:global.AudioContext}
let frames=new Map(),id=0,draws=0
global.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};global.cancelAnimationFrame=id=>frames.delete(id)
global.window={matchMedia:()=>({matches:true})};global.document={hidden:false}
global.AudioContext=class{constructor(){throw Error('static must never start audio')}}
const ctx={createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{draws++}}
const canvas={getContext:()=>ctx}
const state={padPoint:{x:.5,y:.5},padSounding:false,muted:{synth:false},padBegin(){},padMove(){},padEnd(){},padClear(){}}
const frame=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(time))}
async function run(){
 let view;await act(async()=>{view=create(React.createElement(TouchPad,{state}),{createNodeMock:node=>node.type==='canvas'?canvas:null})})
 assert.equal(canvas.width,144);assert.equal(canvas.height,80);assert.equal(frames.size,1)
 frame(0);frame(20);frame(199);assert.equal(draws,1,'reduced motion throttles visual frames')
 frame(200);assert.equal(draws,2);assert.equal(frames.size,1,'only one visual animation loop')
 document.hidden=true;frame(450);assert.equal(draws,2,'hidden page skips drawing')
 document.hidden=false;frame(500);assert.equal(draws,3)
 await act(async()=>{view.unmount()});assert.equal(frames.size,0,'unmount cancels animation')
 Object.assign(global,old);console.log('OK: estatica sin audio, calidad limitada y limpieza de animacion')
}
run().catch(e=>{console.error(e);process.exitCode=1})
