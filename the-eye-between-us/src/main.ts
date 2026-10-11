import { emotionColour } from './visual/emotionPalette';
import './styles.css';
import { App } from './app/App';
import { installShortcuts } from './debug/simulationControls';
const params=new URLSearchParams(location.search);
const canvas=document.getElementById('stage') as HTMLCanvasElement;
const app=new App(canvas);installShortcuts(app);app.audio.setMuted(true);
const button=(id:string)=>document.getElementById(id) as HTMLButtonElement;
const camera=button('camera-btn'),mouse=button('mouse-btn'),trace=button('trace-btn'),sound=button('sound-btn');
const reset=document.getElementById('reset-dialog') as HTMLDialogElement;
const imprintDialog=document.getElementById('imprint-dialog') as HTMLDialogElement;
const imprintForm=document.getElementById('imprint-form') as HTMLFormElement;
const imprintText=document.getElementById('imprint-text') as HTMLTextAreaElement;
const imprintMood=document.getElementById('imprint-mood') as HTMLSelectElement;
const detail=document.getElementById('imprint-detail') as HTMLDialogElement;
button('imprint-btn').onclick=()=>{document.getElementById('imprint-error')!.textContent='';imprintDialog.showModal();imprintText.focus();};
button('imprint-cancel').onclick=()=>imprintDialog.close();
imprintForm.onsubmit=e=>{
 e.preventDefault();
 if(!imprintText.value.trim()){imprintText.setCustomValidity('Please leave a few words.');imprintText.reportValidity();return;}
 if(!app.addImprint(imprintText.value,imprintMood.value)){document.getElementById('imprint-error')!.textContent='Let the current trace settle, then try again.';return;}
 imprintText.value='';imprintDialog.close();
};
imprintText.oninput=()=>imprintText.setCustomValidity('');
canvas.addEventListener('pointermove',e=>app.setPointer((e.clientX/innerWidth-.5)*2,(e.clientY/innerHeight-.5)*2));
canvas.addEventListener('pointerdown',e=>{
 const hit=app.renderer.hitTest(e.clientX*app.renderer.dpr,e.clientY*app.renderer.dpr);
 if(hit){
  document.getElementById('imprint-detail-id')!.textContent=`IMPRINT ${hit.id.toUpperCase()}`;
  const words=document.getElementById('imprint-detail-mood')!;
  words.replaceChildren(...hit.keywords.slice(0,3).map(word=>{
   const span=document.createElement('span');span.textContent=word.toUpperCase();
   span.style.color=`rgb(${emotionColour(word).join(',')})`;span.style.display='block';
   return span;
  }));
  document.getElementById('imprint-detail-note')!.textContent=hit.note??'A presence, a gaze, a moment left in the collective eye.';
  document.getElementById('imprint-detail-date')!.textContent=hit.id==='origin'?'The starting point · not a participant record':new Date(hit.createdAt).toLocaleString('en-GB');
  detail.showModal();return;
 }
 app.setPointer((e.clientX/innerWidth-.5)*2,(e.clientY/innerHeight-.5)*2);
 if(app.inputMode==='mouse')app.triggerBlink();
});
camera.onclick=async()=>{camera.disabled=true;try{await app.enableCamera();}finally{camera.disabled=false;}};
mouse.onclick=()=>{app.useMouse();app.setPointer(0,0);};
trace.onclick=()=>app.leaveTrace();
sound.onclick=async()=>{if(!app.audio.running){const ok=await app.audio.start();if(!ok)return;app.audio.setMuted(false);}else app.audio.setMuted(!app.audio.muted);};
button('reset-btn').onclick=()=>reset.showModal();
reset.addEventListener('close',()=>{if(reset.returnValue==='reset')app.resetMemory();});
button('full-btn').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{app.overlay.setNotice('Fullscreen is unavailable in this browser.');}};
setInterval(()=>{
 const tracking=app.inputMode==='camera';
 document.getElementById('mode-status')!.textContent=tracking?(app.camera.status==='requesting'?'CAMERA · REQUESTING':app.tracker.status==='loading'?'CAMERA · LOADING':app.faceCount?'LIVE · GAZE CONNECTED':'LIVE · AWAITING YOUR GAZE'):'MOUSE EXPERIENCE';
 camera.classList.toggle('active',tracking);mouse.classList.toggle('active',!tracking);
 const busy=app.session.state==='COMMITTING'||app.session.state==='RESIDUE';trace.disabled=busy;button('imprint-btn').disabled=busy;
 trace.innerHTML=busy?'Your trace is becoming part of us':'Leave your trace <span>＋</span>';
 sound.textContent=app.audio.running&&!app.audio.muted?'Sound: on':'Sound: off';sound.setAttribute('aria-pressed',String(app.audio.running&&!app.audio.muted));
 document.getElementById('memory-count')!.textContent=String(app.engine.participantCount).padStart(3,'0');
},250);
window.addEventListener('pagehide',()=>app.camera.stop());
void app.start({camera:false,demo:params.get('demo')==='1'});
(window as unknown as {eye:App}).eye=app;
