import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { RackState } from './state'

/** Visual static has no connection to the audio graph. */
export function TouchPad({state}:{state:RackState}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<number | null>(null)
  const marker = useRef<HTMLSpanElement>(null)
  const keyDown = useRef(false)
  const stateRef = useRef(state)
  const visual = useRef({point:state.padPoint, contact:false})
  const [contact, setContact] = useState(false)
  stateRef.current = state
  if (!visual.current.contact) visual.current.point = state.padPoint
  visual.current.contact = contact

  useEffect(() => {
    const element = canvas.current
    const ctx = element?.getContext('2d', {alpha:false})
    if (!element || !ctx) return
    const width=144, height=80
    element.width=width; element.height=height
    const image=ctx.createImageData(width,height)
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const slow = typeof navigator !== 'undefined' && navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4
    const interval = reduced ? 200 : slow ? 100 : 70
    let frame=0, last=-Infinity, random=0x12345678
    const draw=(time:number) => {
      if (time - last >= interval && !document.hidden) {
        last=time
        const {point, contact:touching} = visual.current
        for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
          random ^= random << 13; random ^= random >>> 17; random ^= random << 5
          let value = 25 + ((random >>> 24) & 127)
          if (touching) {
            const dx=x-point.x*width, dy=(y-point.y*height)*1.35
            const distance=Math.sqrt(dx*dx+dy*dy)
            if (distance<28) value += Math.sin(distance*.48-time*.012)*35*(1-distance/28)
          }
          const i=(y*width+x)*4
          image.data[i]=value; image.data[i+1]=value; image.data[i+2]=value; image.data[i+3]=255
        }
        ctx.putImageData(image,0,0)
      }
      frame=requestAnimationFrame(draw)
    }
    frame=requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const cancelGesture = () => {
      if (pointer.current === null && !keyDown.current) return
      pointer.current=null; keyDown.current=false; setContact(false); stateRef.current.padCancel()
    }
    const onVisibility = () => { if (document.hidden) cancelGesture() }
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', onVisibility)
    if (typeof window !== 'undefined') window.addEventListener?.('blur', cancelGesture)
    return () => {
      if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', onVisibility)
      if (typeof window !== 'undefined') window.removeEventListener?.('blur', cancelGesture)
      if (pointer.current !== null || keyDown.current) stateRef.current.padCancel()
    }
  }, [])

  const position = (event:PointerEvent<HTMLDivElement>) => {
    const rect=event.currentTarget.getBoundingClientRect()
    return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)), y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))}
  }
  const down = (event:PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== null || keyDown.current || (event.pointerType === 'mouse' && event.button !== 0)) return
    event.preventDefault()
    pointer.current=event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    setContact(true)
    const point=position(event)
    visual.current.point=point; visual.current.contact=true
    state.padBegin(point)
  }
  const movePoint = (point:{x:number;y:number}) => {
    visual.current.point=point
    if (marker.current) { marker.current.style.left=`${point.x*100}%`; marker.current.style.top=`${point.y*100}%` }
    state.padMove(point)
  }
  const move = (event:PointerEvent<HTMLDivElement>) => { if (pointer.current === event.pointerId) movePoint(position(event)) }
  const end = (event:PointerEvent<HTMLDivElement>, cancelled:boolean) => {
    if (pointer.current !== event.pointerId) return
    pointer.current=null; setContact(false)
    if (cancelled) state.padCancel()
    else state.padEnd()
  }
  const key = (event:KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === ' ' || event.key === 'Enter') && !keyDown.current && pointer.current === null) {
      event.preventDefault(); keyDown.current=true; setContact(true); state.padBegin(state.padPoint)
    } else if (keyDown.current && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const delta=.035, p=visual.current.point
      movePoint({x:Math.max(0,Math.min(1,p.x+(event.key==='ArrowRight'?delta:event.key==='ArrowLeft'?-delta:0))),y:Math.max(0,Math.min(1,p.y+(event.key==='ArrowDown'?delta:event.key==='ArrowUp'?-delta:0)))})
    }
  }
  return <div className="tv-shell"><div className="tv-bezel">
    <div className={`tv-screen ${contact?'is-touched':''}`} role="application" tabIndex={0} aria-label="Pad SYNTH X Y: arrastrá para tocar, espacio y flechas con teclado" onPointerDown={down} onPointerMove={move} onPointerUp={e=>end(e,false)} onPointerCancel={e=>end(e,true)} onLostPointerCapture={e=>end(e,true)} onKeyDown={key} onKeyUp={e=>{if ((e.key===' '||e.key==='Enter') && keyDown.current) {e.preventDefault();keyDown.current=false;setContact(false);state.padEnd()}}} onBlur={()=>{if(keyDown.current){keyDown.current=false;setContact(false);state.padCancel()}}}>
      <canvas ref={canvas} aria-hidden="true"/><div className="tv-scanlines" aria-hidden="true"/>
      {contact && <span ref={marker} className="tv-contact" style={{left:`${visual.current.point.x*100}%`,top:`${visual.current.point.y*100}%`}} aria-hidden="true"/>}
      <span className="tv-caption tv-top">◂ GRAVE <b>X / ALTURA</b> AGUDO ▸</span><span className="tv-caption tv-side">BRILLO ↑</span><span className="tv-caption tv-bottom">{state.muted.synth?'SILENCIADO':state.padSounding?'SEÑAL ACTIVA':'TOCÁ LA PANTALLA'}</span>
    </div>
  </div></div>
}
