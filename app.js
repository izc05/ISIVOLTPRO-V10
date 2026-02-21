
// =================== V2.1 IsiVolt Pro Legionella ===================
// Login paco/1234, audio GDrive, todos los bugs corregidos, sonidos mejorados

const SERVICE_CATALOG_V19 = [
  {id:"URGENCIAS", nombre:"UGC Urgencias"},
  {id:"RADIO", nombre:"UGC Radiodiagnóstico"},
  {id:"REHAB", nombre:"UGC Rehabilitación"},
  {id:"LAB", nombre:"UGC Laboratorios / Extracciones"},
  {id:"BANCO", nombre:"Banco de sangre / Hemoterapia"},
  {id:"MICRO", nombre:"Microbiología / Infecciosas"},
  {id:"ANAPAT", nombre:"Anatomía Patológica"},
  {id:"HEMO", nombre:"Hemodiálisis"},
  {id:"BLOQUE", nombre:"Bloque Quirúrgico"},
  {id:"CMA", nombre:"CMA"},
  {id:"HOSP_DIA", nombre:"Hospital de Día"},
  {id:"CONS_EXT", nombre:"Consultas Externas"},
  {id:"SALUD_MENTAL", nombre:"Salud Mental"},
  {id:"CARDIO", nombre:"Cardiología"},
  {id:"NEURO", nombre:"Neurología / Ictus"},
  {id:"URO", nombre:"Urología"},
  {id:"OFTALMO", nombre:"Oftalmología"},
  {id:"CIRUGIA_GEN", nombre:"Cirugía General"},
  {id:"TRAUMA", nombre:"Traumatología"},
  {id:"ORL", nombre:"Otorrino"},
  {id:"MAXILO", nombre:"Maxilofacial"},
  {id:"ONCO", nombre:"Oncohematología"},
  {id:"GASES", nombre:"Gases Medicinales"},
  {id:"PCI", nombre:"Protección Contra Incendios"},
  {id:"RITI", nombre:"RITI / Telecomunicaciones"},
  {id:"FARMACIA", nombre:"Farmacia"},
  {id:"ESTERIL", nombre:"Esterilización"},
  {id:"MED_NUC", nombre:"Medicina Nuclear"},
  {id:"ARCHIVO", nombre:"Archivo / Documentación Clínica"},
  {id:"HELIPUERTO", nombre:"Helipuerto / Planta Técnica"},
  {id:"UTA", nombre:"UTAs / Cubierta Técnica"}
];

import {
  dbPutOT, dbGetOTByTechDate, dbDeleteOTByTechDate, dbDeleteOTKey,
  dbAddHistory, dbGetHistoryByTech,
  dbExportAll, dbImportAll,
  dbPutMonthly, dbGetMonthlyByTechMonth, dbDeleteMonthlyByTechMonth,
  dbPutMonthlyFile, dbGetMonthlyFile,
  dbPutMonthlyHeader, dbGetMonthlyHeader
} from "./db.js";

const $ = (id) => document.getElementById(id);

// =================== LOGIN ===================
const AUTH_KEY = "isivolt.auth";
const DEFAULT_CREDENTIALS = { user: "paco", pass: "1234" };

function getCredentials() {
  try { const raw = localStorage.getItem(AUTH_KEY); return raw ? JSON.parse(raw) : { ...DEFAULT_CREDENTIALS }; }
  catch { return { ...DEFAULT_CREDENTIALS }; }
}
function saveCredentials(c) { localStorage.setItem(AUTH_KEY, JSON.stringify(c)); }
function isLoggedIn() { return localStorage.getItem("isivolt.loggedIn") === "1"; }
function setLoggedIn(val) { val ? localStorage.setItem("isivolt.loggedIn","1") : localStorage.removeItem("isivolt.loggedIn"); }

// =================== SCREENS ===================
const screens = {
  login: $("screenLogin"),
  profile: $("screenProfile"),
  home: $("screenHome"),
  scan: $("screenScan"),
  point: $("screenPoint"),
  timer: $("screenTimer"),
  history: $("screenHistory"),
  monthly: $("screenMonthly"),
  guide: $("screenGuide"),
};

const state = {
  tech: localStorage.getItem("isivolt.tech") || "",
  currentCode: "",
  currentOTKey: "",
  stream: null,
  detector: null,
  scanMode: "ot",
  showEmptyMonthly: false,
  timer: { running:false, paused:false, startTs:0, durationMs:0, elapsedMs:0, raf:0 }
};

const SETTINGS_KEY = "isivolt.settings";
const DEFAULT_SETTINGS = { bleachPct: 5, targetPpm: 50, baseMin: 10, factorPerL: 0.00 };
const GUIDE_KEY = "isivolt.guideText";
const DEFAULT_GUIDE = `Bienvenido a IsiVolt Pro V2.1 Legionella.

OT diaria
1) Crea tu lista en el taller: escanea QR o escribe el código (usamos siempre los 5 últimos).
2) En cada punto: calcula dosis y tiempo, anota observación si hace falta, y pulsa Iniciar.
3) El cronómetro llena el depósito de agua hasta completar el tiempo. Al finalizar vibra y queda registrado con fecha y hora.
4) Si hay problemas, pulsa Incidencia y escribe una causa corta.

Mensual (muestras)
1) Rellena cabecera (fecha muestreo y técnico asignado).
2) Crea la ruta por plantas (-1, Baja, 1ª-8ª).
3) Marca cada punto como Hecho / Incidencia / No aplica.`;

function todayStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function monthStr(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }

function show(screenName){
  for (const k of Object.keys(screens)){
    if (screens[k]) screens[k].classList.toggle("hidden", k !== screenName);
  }
}

function getSettings(){ const raw=localStorage.getItem(SETTINGS_KEY); if(!raw) return {...DEFAULT_SETTINGS}; try{return{...DEFAULT_SETTINGS,...JSON.parse(raw)};}catch{return{...DEFAULT_SETTINGS};} }
function saveSettings(s){ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function normalizeCode(input){
  const s=String(input||"").trim(); if(!s) return "";
  const clean=s.replace(/[^a-zA-Z0-9]/g,"");
  if(clean.length<=5) return clean.toUpperCase();
  return clean.slice(-5).toUpperCase();
}
function fmtTime(ms){ const t=Math.max(0,Math.ceil(ms/1000)); return `${String(Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`; }
function mgPerMlFromPct(pct){ return Number(pct)*100; }
function calcDoseMl(liters,settings){ const L=Number(liters); if(!isFinite(L)||L<=0) return null; const ppm=Number(settings.targetPpm),mgTotal=ppm*L,mgPerMl=mgPerMlFromPct(settings.bleachPct); if(mgPerMl<=0) return null; return Math.max(0,mgTotal/mgPerMl); }
function calcAutoMinutes(liters,settings){ const L=Number(liters),base=Number(settings.baseMin),f=Number(settings.factorPerL); if(!isFinite(L)||L<=0) return Math.max(1,Math.round(base)); return Math.max(1,Math.round(base+(L*f))); }

// =================== SONIDOS ===================
let _audioCtx = null;
function getAudioCtx(){ if(!_audioCtx||_audioCtx.state==="closed"){ try{_audioCtx=new(window.AudioContext||window.webkitAudioContext)();}catch{return null;} } return _audioCtx; }

function playBeep(freq=880,durationMs=120,gain=0.07,type="sine"){
  try{
    const ctx=getAudioCtx(); if(!ctx) return;
    const osc=ctx.createOscillator(),g=ctx.createGain();
    osc.type=type; osc.frequency.setValueAtTime(freq,ctx.currentTime);
    g.gain.setValueAtTime(gain,ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+durationMs/1000);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+durationMs/1000+0.02);
  }catch{}
}
function playSoundOK(){ playBeep(523,80,0.07); setTimeout(()=>playBeep(659,80,0.07),90); setTimeout(()=>playBeep(784,160,0.08),180); }
function playSoundIssue(){ playBeep(440,120,0.08,"sawtooth"); setTimeout(()=>playBeep(330,180,0.07,"sawtooth"),140); }
function playSoundTimerEnd(){ playBeep(880,130,0.07); setTimeout(()=>playBeep(880,130,0.07),200); setTimeout(()=>playBeep(1174,300,0.09),400); }
function playSoundScan(){ playBeep(1200,60,0.06,"square"); }
function playSoundSave(){ playBeep(600,50,0.04); setTimeout(()=>playBeep(800,60,0.04),60); }
function playSoundLogin(){ playBeep(440,80,0.05); setTimeout(()=>playBeep(554,80,0.05),90); setTimeout(()=>playBeep(659,120,0.06),180); }
// =================== FIN SONIDOS ===================

function toast(msg,type="info",title=""){
  try{navigator.vibrate?.(18);}catch{}
  const root=$("toastRoot"); if(!root){alert(msg);return;}
  const t=document.createElement("div");
  t.className=`toast ${type==="ok"?"ok":type==="warn"?"warn":""}`;
  t.innerHTML=`<div style="min-width:0;"><div class="t-title">${title||(type==="ok"?"Hecho":"")||"Aviso"}</div><div class="t-msg">${String(msg)}</div></div><div class="t-actions"><button class="x" aria-label="Cerrar">✖</button></div>`;
  const close=()=>t.remove();
  t.querySelector(".x").addEventListener("click",close);
  root.prepend(t);
  setTimeout(()=>{t.style.opacity="0";t.style.transform="translateY(8px)";},4200);
  setTimeout(close,4600);
}

function getSelectedService(){ return document.getElementById("serviceSelect")?.value||""; }

// =================== OT ===================
async function refreshOT(){
  const tech=state.tech,date=todayStr();
  const items=await dbGetOTByTechDate(tech,date);
  const done=items.filter(i=>i.status==="ok").length,total=items.length;
  if($("kpiTech")) $("kpiTech").textContent=tech||"—";
  if($("kpiToday")) $("kpiToday").textContent=`${done} / ${total}`;
  const list=$("otList"); if(!list) return;
  list.innerHTML="";
  $("otEmpty")?.classList.toggle("hidden",total!==0);
  for(const it of items.sort((a,b)=>(a.order||0)-(b.order||0))){
    const el=document.createElement("div"); el.className="item";
    const badgeClass=it.status==="ok"?"ok":it.status==="issue"?"issue":"todo";
    const badgeText=it.status==="ok"?"✅ Hecho":it.status==="issue"?"⚠ Incid.":"⏳ Pend.";
    const note=it.note?` · ${it.note}`:"";
    el.innerHTML=`
      <div class="left">
        <div class="code">${it.code}</div>
        <div class="meta">${it.updatedAt?new Date(it.updatedAt).toLocaleTimeString():"—"}${note}</div>
      </div>
      <div class="row">
        <span class="badge ${badgeClass}">${badgeText}</span>
        <button class="smallbtn ok" data-quickok="1" title="Marcar Hecho">✅</button>
        <button class="smallbtn issue" data-quickissue="1" title="Incidencia rápida">⚠</button>
        <button class="btn btn-ghost" data-open="${it.code}">Abrir</button>
        <button class="btn btn-ghost" data-edit="${it.code}" title="Editar código">✏️</button>
      </div>`;
    el.querySelector("[data-open]").addEventListener("click",()=>openPoint(it.code));
    el.querySelector("[data-edit]").addEventListener("click",()=>editOTCode(it.code));

    el.querySelector('[data-quickok="1"]').addEventListener("click",async(e)=>{
      e.stopPropagation();
      const note=prompt("OK rápido (opcional):",it.note||"")??"";
      await dbAddHistory(enrichWithHospitalFields({servicio:getSelectedService(),tech:state.tech,date:todayStr(),code:it.code,ts:Date.now(),liters:null,doseMl:null,minutes:null,result:"ok",note:(note.trim().slice(0,120)||"Marcado rápido")}));
      await markOTStatus(it.code,"ok");
      if(note) await saveOTNote(it.code,note);
      playSoundOK(); toast(`Marcado ✅ ${it.code}`,"ok","OT");
    });

    el.querySelector('[data-quickissue="1"]').addEventListener("click",async(e)=>{
      e.stopPropagation();
      const reason=prompt("Incidencia rápida:",it.note||"");
      if(reason==null) return;
      await dbAddHistory(enrichWithHospitalFields({servicio:getSelectedService(),tech:state.tech,date:todayStr(),code:it.code,ts:Date.now(),liters:null,doseMl:null,minutes:null,result:"issue",note:(reason.trim().slice(0,120)||"Incidencia")}));
      await markOTStatus(it.code,"issue");
      await saveOTNote(it.code,reason);
      playSoundIssue(); toast(`Marcado ⚠ ${it.code}`,"warn","OT");
    });

    bindSwipe(el,{
      onRight:async()=>{
        const note=prompt("✅ OK (opcional):",it.note||"")??"";
        await dbAddHistory(enrichWithHospitalFields({servicio:getSelectedService(),tech:state.tech,date:todayStr(),code:it.code,ts:Date.now(),liters:null,doseMl:null,minutes:null,result:"ok",note:(note.trim().slice(0,120)||"Swipe OK")}));
        await markOTStatus(it.code,"ok"); if(note) await saveOTNote(it.code,note);
        playSoundOK(); toast(`Swipe ✅ ${it.code}`,"ok","OT");
      },
      onLeft:async()=>{
        const reason=prompt("⚠ Incidencia:",it.note||""); if(reason==null) return;
        await dbAddHistory(enrichWithHospitalFields({servicio:getSelectedService(),tech:state.tech,date:todayStr(),code:it.code,ts:Date.now(),liters:null,doseMl:null,minutes:null,result:"issue",note:(reason.trim().slice(0,120)||"Swipe Incidencia")}));
        await markOTStatus(it.code,"issue"); await saveOTNote(it.code,reason);
        playSoundIssue(); toast(`Swipe ⚠ ${it.code}`,"warn","OT");
      }
    });
    list.appendChild(el);
  }
}

async function addOTCode(code){
  const c=normalizeCode(code); if(!c) return toast("Introduce un código válido (se usan los 5 últimos).");
  const tech=state.tech,date=todayStr();
  const existing=await dbGetOTByTechDate(tech,date);
  if(existing.some(x=>x.code===c)) return openPoint(c);
  const note=prompt("Observación rápida (opcional) para este punto:","")??"";
  await dbPutOT({key:`${tech}|${date}|${c}`,tech,date,code:c,status:"todo",order:Date.now(),createdAt:Date.now(),updatedAt:Date.now(),defaultLiters:60,note:note.trim().slice(0,80)});
  playSoundSave(); await refreshOT(); openPoint(c);
}

async function saveOTNote(code,note){
  const tech=state.tech,date=todayStr();
  const items=await dbGetOTByTechDate(tech,date);
  const it=items.find(x=>x.code===code); if(!it) return;
  it.note=String(note||"").trim().slice(0,120); it.updatedAt=Date.now();
  await dbPutOT(it); await refreshOT();
}

async function editOTCode(oldCode){
  const oldC=normalizeCode(oldCode); if(!oldC) return;
  const newRaw=prompt(`Editar código (${oldC})\n\nIntroduce el código correcto (usará los 5 últimos):`,oldC);
  if(newRaw==null) return;
  const newC=normalizeCode(newRaw); if(!newC) return toast("Código inválido."); if(newC===oldC) return;
  const tech=state.tech,date=todayStr();
  const items=await dbGetOTByTechDate(tech,date);
  const it=items.find(x=>x.code===oldC); if(!it) return;
  if(items.some(x=>x.code===newC)) return toast("Ese código ya existe en la OT de hoy.");
  const oldKey=it.key; it.code=newC; it.key=`${tech}|${date}|${newC}`; it.updatedAt=Date.now();
  await dbPutOT(it); await dbDeleteOTKey(oldKey);
  if(state.currentCode===oldC){ state.currentCode=newC; state.currentOTKey=it.key; if($("pointCode")) $("pointCode").textContent=newC; if($("timerCode")) $("timerCode").textContent=newC; }
  playSoundSave(); await refreshOT();
}

// =================== PUNTO ===================
async function openPoint(code){
  state.currentCode=normalizeCode(code); if(!state.currentCode) return;
  const items=await dbGetOTByTechDate(state.tech,todayStr());
  const it=items.find(x=>x.code===state.currentCode);
  state.currentOTKey=it?.key||"";
  if($("pointCode")) $("pointCode").textContent=state.currentCode;
  const settings=getSettings(),liters=it?.defaultLiters??60;
  if($("liters")) $("liters").value=liters;
  if($("targetMinutes")) $("targetMinutes").value=calcAutoMinutes(liters,settings);
  if($("pointNote")) $("pointNote").value=it?.note??"";
  ["chkConnect","chkReturn","chkDose","chkStart"].forEach(id=>{if($(id)) $(id).checked=false;});
  updateDoseUI(); show("point");
}
function updateDoseUI(){ const s=getSettings(),ml=calcDoseMl($("liters")?.value,s); if($("doseMl")) $("doseMl").textContent=ml==null?"—":`${Math.round(ml)} ml`; }

// =================== TIMER ===================
function stopRaf(){ if(state.timer.raf) cancelAnimationFrame(state.timer.raf); state.timer.raf=0; }
function setRingProgress(pct){ const p=Math.max(0,Math.min(1,pct)),deg=Math.round(p*360),ring=$("ring"); if(!ring) return; ring.style.background=`conic-gradient(rgba(0,212,255,.55) ${deg}deg, rgba(46,196,182,.45) ${deg}deg, rgba(255,255,255,.10) 0deg)`; }
function initBubbles(){
  const root=$("bubbles"); if(!root||root.dataset.ready==="1") return; root.dataset.ready="1";
  for(let i=0;i<10;i++){ const b=document.createElement("div"); b.className="bubble"; b.style.left=`${Math.round(8+Math.random()*84)}%`; b.style.animationDuration=`${4+Math.random()*3.5}s`; b.style.animationDelay=`${Math.random()*2.5}s`; const s=6+Math.random()*10; b.style.width=`${s}px`; b.style.height=`${s}px`; b.style.opacity=`${0.25+Math.random()*0.35}`; root.appendChild(b); }
}
function setWaterProgress(pct){ const wf=$("waterFill"); if(wf) wf.style.height=`${Math.round(Math.max(0,Math.min(1,pct))*100)}%`; }
function timerTick(){
  const t=state.timer; if(!t.running||t.paused) return;
  const now=performance.now(); t.elapsedMs=now-t.startTs;
  const left=Math.max(0,t.durationMs-t.elapsedMs);
  if($("timerLeft")) $("timerLeft").textContent=fmtTime(left);
  setWaterProgress(t.elapsedMs/t.durationMs); setRingProgress(t.elapsedMs/t.durationMs);
  if(left<=0){ finishTimer(true); return; }
  t.raf=requestAnimationFrame(timerTick);
}
function startTimerForCurrent(){
  const code=state.currentCode; if(!code) return;
  const mins=Number($("targetMinutes")?.value); if(!isFinite(mins)||mins<=0) return toast("Tiempo objetivo inválido.");
  if($("timerCode")) $("timerCode").textContent=code;
  if($("timerTarget")) $("timerTarget").textContent=`Objetivo: ${mins} min`;
  $("sealDone")?.classList.add("hidden"); $("sealWarn")?.classList.add("hidden");
  $("btnPause")?.classList.remove("hidden"); $("btnResume")?.classList.add("hidden");
  const t=state.timer; t.running=true; t.paused=false; t.durationMs=mins*60*1000; t.elapsedMs=0; t.startTs=performance.now();
  if($("timerLeft")) $("timerLeft").textContent=fmtTime(t.durationMs);
  setWaterProgress(0); setRingProgress(0);
  show("timer"); initBubbles(); stopRaf(); playSoundSave();
  t.raf=requestAnimationFrame(timerTick);
}
async function markOTStatus(code,status){
  const items=await dbGetOTByTechDate(state.tech,todayStr());
  const it=items.find(x=>x.code===code); if(!it) return;
  it.status=status; it.updatedAt=Date.now(); it.defaultLiters=Number($("liters")?.value)||it.defaultLiters||60;
  await dbPutOT(it); await refreshOT();
}
async function finishTimer(auto=false){
  const t=state.timer; t.running=false; stopRaf();
  try{navigator.vibrate?.([120,60,120]);}catch{}
  if(auto) playSoundTimerEnd();
  $("sealDone")?.classList.remove("hidden");
  const liters=Number($("liters")?.value)||null,settings=getSettings();
  const dose=liters?Math.round(calcDoseMl(liters,settings)??0):null;
  const mins=Number($("targetMinutes")?.value)||null;
  const note=String($("pointNote")?.value||"").trim().slice(0,120);
  await dbAddHistory(enrichWithHospitalFields({servicio:getSelectedService(),tech:state.tech,date:todayStr(),code:state.currentCode,ts:Date.now(),liters,doseMl:dose,minutes:mins,result:"ok",note:note||undefined}));
  if(note) await saveOTNote(state.currentCode,note);
  await markOTStatus(state.currentCode,"ok");
}
function pauseTimer(){ const t=state.timer; if(!t.running||t.paused) return; t.paused=true; stopRaf(); $("btnPause")?.classList.add("hidden"); $("btnResume")?.classList.remove("hidden"); }
function resumeTimer(){ const t=state.timer; if(!t.running||!t.paused) return; t.paused=false; t.startTs=performance.now()-t.elapsedMs; $("btnPause")?.classList.remove("hidden"); $("btnResume")?.classList.add("hidden"); t.raf=requestAnimationFrame(timerTick); }
async function markIssue(){
  const code=state.currentCode; if(!code) return;
  const reason=prompt("Incidencia (rápido):\n- No accesible\n- Bomba no arranca\n- Sin retorno\n- Fuga\n\nEscribe una frase corta:");
  if(reason==null) return;
  if($("timerCode")) $("timerCode").textContent=code;
  $("sealDone")?.classList.add("hidden"); $("sealWarn")?.classList.remove("hidden");
  const note=String($("pointNote")?.value||"").trim().slice(0,120),finalReason=reason.trim().slice(0,120)||"Incidencia";
  await dbAddHistory(enrichWithHospitalFields({servicio:getSelectedService(),tech:state.tech,date:todayStr(),code,ts:Date.now(),liters:Number($("liters")?.value)||null,doseMl:null,minutes:Number($("targetMinutes")?.value)||null,result:"issue",note:note?`${finalReason} · ${note}`:finalReason}));
  await saveOTNote(code,note||finalReason); await markOTStatus(code,"issue");
  playSoundIssue(); show("timer"); initBubbles();
  try{navigator.vibrate?.([80,40,80]);}catch{}
}

// =================== QR SCAN ===================
async function startScan(){
  if(!("mediaDevices" in navigator)){ toast("Este navegador no soporta cámara."); return; }
  const video=$("qrVideo");
  try{
    state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"},audio:false});
    video.srcObject=state.stream; await video.play();
    if("BarcodeDetector" in window){ state.detector=new BarcodeDetector({formats:["qr_code"]}); scanLoop(); }
    else toast("Este móvil no soporta BarcodeDetector. Usa 'Añadir punto'.");
  }catch{ toast("No se pudo abrir la cámara. Revisa permisos."); }
}
async function scanLoop(){
  const video=$("qrVideo"); if(!state.detector||!state.stream) return;
  try{
    const barcodes=await state.detector.detect(video);
    if(barcodes&&barcodes.length){ const raw=barcodes[0].rawValue||"",c=normalizeCode(raw);
      if(c){ playSoundScan(); stopScan();
        if(state.scanMode==="monthlyHot"){await addMonthlyQuick(c,"ACS");await openMonthly();}
        else if(state.scanMode==="monthlyCold"){await addMonthlyQuick(c,"AFCH");await openMonthly();}
        else{await addOTCode(c);show("home");}
        return; } }
  }catch{}
  requestAnimationFrame(scanLoop);
}
function stopScan(){ const video=$("qrVideo"); if(state.stream){state.stream.getTracks().forEach(t=>t.stop());state.stream=null;} if(video) video.srcObject=null; state.detector=null; }

// =================== HISTORIAL ===================
async function openHistory(){
  const items=await dbGetHistoryByTech(state.tech,300);
  const list=$("historyList"); if(!list) return; list.innerHTML="";
  $("historyEmpty")?.classList.toggle("hidden",items.length!==0);
  for(const h of items){
    const el=document.createElement("div"); el.className="item";
    const dt=new Date(h.ts||Date.now()),badgeClass=h.result==="ok"?"ok":"issue",badgeText=h.result==="ok"?"✅ OK":"⚠ Incid.",note=h.note?` · ${h.note}`:"";
    el.innerHTML=`<div class="left"><div class="code">${h.code}</div><div class="meta">${dt.toLocaleString()} · ${h.liters??"—"} L · ${h.minutes??"—"} min${note}</div></div><span class="badge ${badgeClass}">${badgeText}</span>`;
    list.appendChild(el);
  }
  show("history");
}
async function exportData(){
  const dump=await dbExportAll();
  const payload={app:"IsiVolt Pro V2.1 Legionella",exportedAt:Date.now(),tech:state.tech,data:dump};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url; a.download=`isivolt_export_${state.tech}_${todayStr()}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importData(file){
  const text=await file.text(); let payload;
  try{payload=JSON.parse(text);}catch{return toast("Archivo inválido.");}
  if(!payload?.data) return toast("No contiene datos.");
  await dbImportAll(payload.data); toast("Importación completada ✅"); await refreshOT();
}

// =================== MENSUAL PRO ===================
const MONTH_PLANTS=["-1","Baja","1ª","2ª","3ª","4ª","5ª","6ª","7ª","8ª","Otros"];
function monthKey(){ return monthStr(); }
function getDefaultPlant(){ return $("monthlyPlantDefault")?.value||"Baja"; }

async function loadMonthlyHeader(){
  const h=await dbGetMonthlyHeader(state.tech,monthKey());
  if($("monthSampleDate")) $("monthSampleDate").value=h?.sampleDate||"";
  if($("monthAssignedTech")) $("monthAssignedTech").value=h?.assignedTech||"";
  if($("monthHeaderNote")) $("monthHeaderNote").value=h?.note||"";
}
async function saveMonthlyHeader(){
  await dbPutMonthlyHeader(state.tech,monthKey(),{sampleDate:$("monthSampleDate")?.value||"",assignedTech:($("monthAssignedTech")?.value||"").trim().slice(0,18),note:($("monthHeaderNote")?.value||"").trim().slice(0,180)});
  playSoundSave(); toast("Cabecera guardada ✅");
}

async function openMonthly(){
  const tech=state.tech,month=monthKey();
  if($("kpiMonth")) $("kpiMonth").textContent=month;
  await loadMonthlyHeader();
  const items=await dbGetMonthlyByTechMonth(tech,month);
  const done=items.filter(i=>i.status==="ok").length;
  if($("kpiMonthDone")) $("kpiMonthDone").textContent=`${done} / ${items.length}`;
  $("monthlyEmpty")?.classList.toggle("hidden",items.length!==0);
  const accRoot=$("monthlyAccordions"); if(!accRoot) return show("monthly");
  accRoot.innerHTML="";
  const grouped=new Map();
  for(const p of MONTH_PLANTS) grouped.set(p,[]);
  for(const it of items){ const plant=it.plant&&MONTH_PLANTS.includes(it.plant)?it.plant:"Otros"; grouped.get(plant).push(it); }
  for(const plant of MONTH_PLANTS){
    const arr=grouped.get(plant)||[];
    if(!state.showEmptyMonthly&&arr.length===0) continue;
    const pDone=arr.filter(x=>x.status==="ok").length,pTotal=arr.length,pct=pTotal?Math.round((pDone/pTotal)*100):0;
    const acc=document.createElement("div"); acc.className="accordion";
    acc.innerHTML=`<div class="acc-head"><div><div class="acc-title">Planta ${plant}</div><div class="acc-sub">${pDone} / ${pTotal} · ${pct}%</div></div><div class="row" style="gap:10px;"><div class="progress"><div style="width:${pct}%;"></div></div><div class="acc-arrow">▾</div></div></div><div class="acc-body"><div class="row" style="justify-content:space-between;margin-bottom:10px;"><div class="muted tiny">Acciones rápidas</div><button class="btn btn-ghost" data-naall="1">🚫 No aplica (planta)</button></div><div class="list" data-list="1"></div><div class="muted tiny" data-empty="1" style="padding:10px 6px;display:none;">Sin puntos en esta planta.</div></div>`;
    acc.querySelector(".acc-head").addEventListener("click",()=>{ acc.classList.toggle("open"); acc.querySelector(".acc-arrow").textContent=acc.classList.contains("open")?"▴":"▾"; });
    if(!state.showEmptyMonthly&&arr.length&&accRoot.children.length===0){ acc.classList.add("open"); acc.querySelector(".acc-arrow").textContent="▴"; }
    const list=acc.querySelector('[data-list="1"]'),empty=acc.querySelector('[data-empty="1"]');
    empty.style.display=(arr.length===0)?"block":"none";
    acc.querySelector('[data-naall="1"]').addEventListener("click",async(e)=>{ e.stopPropagation(); if(arr.length===0) return toast("No hay puntos en esta planta."); if(!confirm(`¿Marcar TODA la Planta ${plant} como NO APLICA?`)) return; const reason=prompt("Motivo rápido:","Parking sin tomas"),r=(reason||"No aplica").trim().slice(0,80); for(const it of arr){it.status="na";it.updatedAt=Date.now();it.note=r;await dbPutMonthly(it);} await openMonthly(); });
    for(const it of arr.sort((a,b)=>(a.order||0)-(b.order||0))){
      const el=document.createElement("div"); el.className="item";
      const dt=it.updatedAt?new Date(it.updatedAt).toLocaleString():"—";
      const bC=it.status==="ok"?"ok":it.status==="issue"?"issue":it.status==="na"?"na":"todo";
      const bT=it.status==="ok"?"✅ Hecho":it.status==="issue"?"⚠ Incid.":it.status==="na"?"🚫 No aplica":"⏳ Pend.";
      const water=it.water==="ACS"?"🔥 ACS":it.water==="AFCH"?"❄️ AFCH":"—";
      const icon=it.element==="Ducha"?"🚿":it.element==="Grifo"?"🚰":it.element==="Lavabo"?"🚰":it.element==="Fregadero"?"🍽️":"📍";
      el.innerHTML=`<div class="left"><div class="code">${icon} ${it.code}</div><div class="meta">${water}${it.desc?` · ${it.desc}`:""}</div><div class="meta">${dt}${it.note?` · ${it.note}`:""}</div></div><div class="item-actions"><span class="badge ${bC}">${bT}</span><button class="smallbtn ok" data-ok="1">✅</button><button class="smallbtn issue" data-issue="1">⚠</button><button class="smallbtn na" data-na="1">🚫</button></div>`;
      el.querySelector('[data-ok="1"]').addEventListener("click",async()=>{ it.status="ok";it.updatedAt=Date.now();it.note="";await dbPutMonthly(it);playSoundOK();await openMonthly(); });
      el.querySelector('[data-issue="1"]').addEventListener("click",async()=>{ const r=prompt("Incidencia:",it.note||"");if(r==null) return;it.status="issue";it.updatedAt=Date.now();it.note=r.trim().slice(0,120);await dbPutMonthly(it);playSoundIssue();await openMonthly(); });
      el.querySelector('[data-na="1"]').addEventListener("click",async()=>{ const r=prompt("No aplica (motivo):\n- Exterior (otra empresa)\n- Parking sin tomas\n- No corresponde este mes",it.note||"Exterior (otra empresa)");if(r==null) return;it.status="na";it.updatedAt=Date.now();it.note=r.trim().slice(0,120);await dbPutMonthly(it);await openMonthly(); });
      bindSwipe(el,{
        onRight:async()=>{ it.status="ok";it.updatedAt=Date.now();it.note="";await dbPutMonthly(it);playSoundOK();toast(`✅ ${it.code}`,"ok","Mensual");await openMonthly(); },
        onLeft:async()=>{ const choice=prompt("1 = Incidencia\n2 = No aplica","1");if(choice==null) return; if(String(choice).trim()==="2"){const r=prompt("No aplica (motivo):",it.note||"Exterior (otra empresa)");if(r==null)return;it.status="na";it.note=r.trim().slice(0,120);}else{const r=prompt("Incidencia:",it.note||"");if(r==null)return;it.status="issue";it.note=r.trim().slice(0,120);playSoundIssue();}it.updatedAt=Date.now();await dbPutMonthly(it);toast(`Actualizado ${it.code}`,"info","Mensual");await openMonthly(); }
      });
      list.appendChild(el);
    }
    accRoot.appendChild(acc);
  }
  show("monthly");
}

async function addMonthlyQuick(code,water){
  const c=normalizeCode(code); if(!c) return toast("Código inválido.");
  const tech=state.tech,month=monthKey(),plant=getDefaultPlant()||"Baja";
  const existing=await dbGetMonthlyByTechMonth(tech,month);
  if(existing.some(x=>x.code===c&&x.water===water&&x.plant===plant)){toast("Ya existe este punto en esa planta/agua.");return;}
  const elRaw=prompt("Elemento: DUCHA / GRIFO / LAVABO / FREGADERO / OTRO","DUCHA");
  const element=String(elRaw||"DUCHA").toUpperCase().startsWith("G")?"Grifo":String(elRaw||"").toUpperCase().startsWith("LAV")?"Lavabo":String(elRaw||"").toUpperCase().startsWith("FRE")?"Fregadero":String(elRaw||"").toUpperCase().startsWith("O")?"Otro":"Ducha";
  const desc=prompt("Descripción corta (opcional):\nEj: 2ª Planta · Hab 21024 · Aseo","")??"";
  await dbPutMonthly({key:`${tech}|${month}|${plant}|${water}|${c}`,tech,month,plant,water,element,code:c,desc:desc.trim().slice(0,120),status:"todo",order:Date.now(),updatedAt:Date.now(),note:""});
}
async function addMonthlyManual(){
  const waterRaw=prompt("Tipo de agua: ACS (caliente) o AFCH (fría)","ACS"); if(waterRaw==null) return;
  const water=String(waterRaw).toUpperCase().startsWith("A")?"ACS":"AFCH";
  const plant=prompt("Planta (ej: Baja, 2ª, 6ª, -1, Otros)",getDefaultPlant()); if(plant==null) return;
  const p=MONTH_PLANTS.includes(plant)?plant:plant.trim()||"Otros";
  const code=prompt("Código del punto (usará los 5 últimos):"); if(code==null) return;
  const c=normalizeCode(code); if(!c) return toast("Código inválido.");
  const elRaw=prompt("Elemento: DUCHA / GRIFO / LAVABO / FREGADERO / OTRO","DUCHA"); if(elRaw==null) return;
  const element=String(elRaw||"DUCHA").toUpperCase().startsWith("G")?"Grifo":String(elRaw||"").toUpperCase().startsWith("LAV")?"Lavabo":String(elRaw||"").toUpperCase().startsWith("FRE")?"Fregadero":String(elRaw||"").toUpperCase().startsWith("O")?"Otro":"Ducha";
  const desc=prompt("Descripción (opcional)","")??"";
  const tech=state.tech,month=monthKey();
  const existing=await dbGetMonthlyByTechMonth(tech,month);
  if(existing.some(x=>x.code===c&&x.water===water&&x.plant===p)) return toast("Ya existe este punto en esa planta/agua.");
  await dbPutMonthly({key:`${tech}|${month}|${p}|${water}|${c}`,tech,month,plant:p,water,element,code:c,desc:desc.trim().slice(0,160),status:"todo",order:Date.now(),updatedAt:Date.now(),note:""});
}
async function attachMonthlyFile(file){ await dbPutMonthlyFile(state.tech,monthKey(),{filename:file.name,mime:file.type,dataUrl:await fileToDataUrl(file)}); toast("Adjunto guardado ✅"); }
async function openMonthlyFile(){ const f=await dbGetMonthlyFile(state.tech,monthKey()); if(!f?.dataUrl) return toast("Aún no has adjuntado archivo para este mes."); window.open(f.dataUrl,"_blank"); }
function fileToDataUrl(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(file); }); }
async function exportMonthly(){
  const tech=state.tech,month=monthKey();
  const payload={app:"IsiVolt Pro V2.1 Legionella",kind:"monthly",exportedAt:Date.now(),tech,month,header:await dbGetMonthlyHeader(tech,month),items:await dbGetMonthlyByTechMonth(tech,month)};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a"); a.href=url; a.download=`isivolt_mensual_${tech}_${month}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}

// =================== GUIDE ===================
function openGuide(){ if($("guideText")) $("guideText").value=localStorage.getItem(GUIDE_KEY)||DEFAULT_GUIDE; show("guide"); }
function saveGuideText(){ if($("guideText")) localStorage.setItem(GUIDE_KEY,$("guideText").value); }
function speakGuide(){ saveGuideText(); if(!("speechSynthesis" in window)) return toast("Este móvil no soporta voz."); const u=new SpeechSynthesisUtterance($("guideText")?.value||""); u.lang="es-ES"; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u); }
function stopSpeak(){ if("speechSynthesis" in window) window.speechSynthesis.cancel(); }

// =================== SETTINGS ===================
function openSettings(){ const s=getSettings(); if($("bleachPct")) $("bleachPct").value=s.bleachPct; if($("targetPpm")) $("targetPpm").value=s.targetPpm; if($("baseMin")) $("baseMin").value=s.baseMin; if($("factorPerL")) $("factorPerL").value=s.factorPerL; $("modalSettings")?.classList.remove("hidden"); }
function closeSettings(){ $("modalSettings")?.classList.add("hidden"); }
function saveSettingsFromUI(){ const s={bleachPct:Number($("bleachPct")?.value)||DEFAULT_SETTINGS.bleachPct,targetPpm:Number($("targetPpm")?.value)||DEFAULT_SETTINGS.targetPpm,baseMin:Number($("baseMin")?.value)||DEFAULT_SETTINGS.baseMin,factorPerL:Number($("factorPerL")?.value)||DEFAULT_SETTINGS.factorPerL}; saveSettings(s); closeSettings(); updateDoseUI(); if($("targetMinutes")) $("targetMinutes").value=calcAutoMinutes($("liters")?.value,s); playSoundSave(); }
function resetSettings(){ saveSettings({...DEFAULT_SETTINGS}); openSettings(); }

// =================== SWIPE ===================
function bindSwipe(el,{onRight,onLeft}){
  let startX=0,startY=0,dx=0,dy=0,active=false;
  const threshold=80;
  el.addEventListener("touchstart",(e)=>{ const t=e.touches?.[0];if(!t) return; startX=t.clientX;startY=t.clientY;dx=0;dy=0;active=true;el.classList.remove("swipe-ok","swipe-issue"); },{passive:true});
  el.addEventListener("touchmove",(e)=>{ if(!active) return;const t=e.touches?.[0];if(!t) return; dx=t.clientX-startX;dy=t.clientY-startY; if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>18){el.classList.add("swiping");el.style.transform=`translateX(${Math.max(-110,Math.min(110,dx))}px)`;if(dx>0){el.classList.add("swipe-ok");el.classList.remove("swipe-issue");}else{el.classList.add("swipe-issue");el.classList.remove("swipe-ok");}} },{passive:true});
  el.addEventListener("touchend",async()=>{ if(!active) return;active=false;el.classList.remove("swiping");el.style.transition="transform .18s ease";el.style.transform="translateX(0px)";setTimeout(()=>{el.style.transition="";},220);if(Math.abs(dx)>threshold&&Math.abs(dx)>Math.abs(dy)){if(dx>0){await onRight?.();}else{await onLeft?.();}}el.classList.remove("swipe-ok","swipe-issue"); },{passive:true});
}

// =================== PODCAST V2.1 ===================
// Audio de Google Drive - enlace de descarga directa
const PODCAST_GDRIVE_ID = "1OzN5cLTm4oJlpP-tZQpPXC0LIVluzQ2V";
const PODCAST_SRC = `https://drive.google.com/uc?export=download&id=${PODCAST_GDRIVE_ID}`;

let wakeLock=null,ropeAnimId=null;
function loadPodcastPos(){ try{return Number(localStorage.getItem("isivolt_podcast_pos")||"0");}catch{return 0;} }
function savePodcastPos(t){ try{localStorage.setItem("isivolt_podcast_pos",String(t));}catch{} }
function fmtClock(sec){ if(!isFinite(sec)||sec<0) return "00:00"; sec=Math.floor(sec); return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`; }
async function requestWakeLock(){ try{if(!("wakeLock" in navigator)) return;wakeLock=await navigator.wakeLock.request("screen");}catch{} }
async function releaseWakeLock(){ try{await wakeLock?.release();}catch{} wakeLock=null; }

function startRopeWave(){
  const c=$("ropeWave"); if(!c) return;
  const ctx=c.getContext("2d"),dpr=Math.max(1,window.devicePixelRatio||1),rect=c.getBoundingClientRect();
  c.width=Math.floor(rect.width*dpr); c.height=Math.floor(rect.height*dpr); ctx.scale(dpr,dpr);
  const lines=[{amp:10,freq:1.2,speed:0.9,off:0},{amp:14,freq:0.9,speed:0.7,off:1.4},{amp:8,freq:1.6,speed:1.0,off:2.2}];
  const draw=(t)=>{ const w=rect.width,h=rect.height; ctx.clearRect(0,0,w,h); ctx.fillStyle="rgba(255,255,255,0.02)"; ctx.fillRect(0,0,w,h);
    for(let i=0;i<lines.length;i++){ const L=lines[i]; ctx.beginPath(); for(let x=0;x<=w;x+=4){ const y=h/2+Math.sin((x/w)*Math.PI*2*L.freq+t*0.002*L.speed+L.off)*L.amp; if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); } ctx.lineWidth=i===0?3:2; ctx.strokeStyle=i===0?"rgba(46,196,182,0.85)":i===1?"rgba(0,212,255,0.70)":"rgba(255,255,255,0.30)"; ctx.shadowColor="rgba(46,196,182,0.25)";ctx.shadowBlur=10;ctx.stroke();ctx.shadowBlur=0; }
    ropeAnimId=requestAnimationFrame(draw); };
  cancelAnimationFrame(ropeAnimId); ropeAnimId=requestAnimationFrame(draw);
}
function stopRopeWave(){ if(ropeAnimId) cancelAnimationFrame(ropeAnimId); ropeAnimId=null; }

function initPodcastUI(){
  const audio=$("podcastPlayer"); if(!audio) return;

  // Establecer fuente del audio (Google Drive)
  audio.src = PODCAST_SRC;

  // Restaurar posición guardada
  const savedPos = loadPodcastPos();

  audio.addEventListener("loadedmetadata",()=>{
    if(savedPos>0 && savedPos<(audio.duration||0)-2) audio.currentTime=savedPos;
    updatePodcastText();
  });

  const rates=[1,1.25,1.5,1.75,2];

  function updatePodcastText(){
    const cur=fmtClock(audio.currentTime||0),dur=fmtClock(audio.duration||0),rate=audio.playbackRate||1;
    if($("podcastProgress")) $("podcastProgress").textContent=`${cur} / ${dur} · ${rate}×`;
    if($("miniTime")) $("miniTime").textContent=`${cur} / ${dur}`;
    if($("podcastSpeedBtn")) $("podcastSpeedBtn").textContent=`${rate}×`;
    const fill=$("miniBarFill");
    if(fill&&isFinite(audio.duration)&&audio.duration>0) fill.style.width=`${Math.min(100,(audio.currentTime/audio.duration)*100)}%`;
  }

  audio.addEventListener("timeupdate",()=>{ updatePodcastText(); if(Math.floor(audio.currentTime)%3===0) savePodcastPos(audio.currentTime); });
  audio.addEventListener("ratechange",updatePodcastText);
  audio.addEventListener("pause",()=>savePodcastPos(audio.currentTime));
  audio.addEventListener("error",()=>toast("No se pudo cargar el audio. Necesitas conexión la primera vez.","warn","Podcast"));
  window.addEventListener("beforeunload",()=>savePodcastPos(audio.currentTime));

  // Botones principales
  $("btnPodcastPlay")?.addEventListener("click",async()=>{ try{await audio.play();}catch{toast("No se pudo reproducir.","warn","Podcast");} });
  $("btnPodcastPause")?.addEventListener("click",()=>audio.pause());
  $("btnPodcastRestart")?.addEventListener("click",()=>{ audio.currentTime=0; savePodcastPos(0); audio.play().catch(()=>{}); updatePodcastText(); });
  $("podcastSpeedBtn")?.addEventListener("click",()=>{ const idx=rates.indexOf(audio.playbackRate); const next=rates[(idx+1)%rates.length]; audio.playbackRate=next; updatePodcastText(); toast(`Velocidad: ${next}×`,"info","Podcast"); });

  // Mini player
  $("miniRew")?.addEventListener("click",()=>{ audio.currentTime=Math.max(0,(audio.currentTime||0)-10); });
  $("miniFwd")?.addEventListener("click",()=>{ audio.currentTime=Math.min(audio.duration||Infinity,(audio.currentTime||0)+10); });
  $("miniPlay")?.addEventListener("click",async()=>{ if(audio.paused) await audio.play().catch(()=>{}); else audio.pause(); });

  const mini=$("miniPlayer"),miniPlay=$("miniPlay");
  const syncMini=()=>{ if(!mini||!miniPlay) return; const started=(audio.currentTime||0)>0||!audio.paused; if(started) mini.classList.remove("hidden"); miniPlay.textContent=audio.paused?"▶":"⏸"; };

  audio.addEventListener("play",async()=>{ syncMini();startRopeWave();await requestWakeLock(); });
  audio.addEventListener("pause",()=>{ syncMini();stopRopeWave();releaseWakeLock(); });
  audio.addEventListener("ended",()=>{ syncMini();stopRopeWave();releaseWakeLock(); });
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&!audio.paused) requestWakeLock(); else if(document.visibilityState!=="visible") releaseWakeLock(); });
  window.addEventListener("resize",()=>{ if(!audio.paused) startRopeWave(); });

  updatePodcastText(); syncMini(); if(!audio.paused) startRopeWave();
}

// =================== HOSPITAL MODE ===================
const HOSPITAL_RULES={lettersByFloor:{"-1":["A","B","C","D","E","F","H"],"0":["A","B","C","D","E","H"],"1":["A","B","C"],"2":["B","C","D","E","H"],"3":["B","D","H"],"4":["B","D","H"],"5":["B","D","H"],"6":["B","D","H"],"7":["B","D","H"],"8":["D","H"],"9":["D","H"]},numericMacroByFloor:{"0":[1,2,3],"1":[1,4,5],"2":[1,2,3,4,5],"3":[1,2,3,4,5],"4":[1,2,3,4,5],"5":[1,2,3,4,5],"6":[1,2,3,4,5],"7":[1,2,3,4,5]}};
function normalizeHospitalCode(raw){ return String(raw||"").trim().replace(/\s+/g,"").replace(/-/g,"").toUpperCase(); }
function parseHospitalCode(raw){
  const code=normalizeHospitalCode(raw); if(!code) return{ok:false,error:"Código vacío"};
  let m=code.match(/^S([A-Z])(\d{3})([A-Z])?$/); if(m){const z=m[1],loc=m[2],suf=(m[3]||"").toLowerCase();const allowed=HOSPITAL_RULES.lettersByFloor["-1"]||[];if(!allowed.includes(z))return{ok:false,error:`Zona no válida en sótano: ${z}`};return{ok:true,data:{codigoHospital:code,planta:-1,macroZona:"S"+z,zona:z,local:loc,sufijo:suf||""}};}
  m=code.match(/^S([1-9])(\d{3})([A-Z])?$/); if(m){const d=m[1],loc=m[2],suf=(m[3]||"").toLowerCase();return{ok:true,data:{codigoHospital:code,planta:-1,macroZona:"S"+d,zona:"T"+d,local:loc,sufijo:suf||""}};}
  m=code.match(/^([0-9])([A-Z])(\d{3})([A-Z])?$/); if(m){const p=Number(m[1]),z=m[2],loc=m[3],suf=(m[4]||"").toLowerCase();const allowed=HOSPITAL_RULES.lettersByFloor[String(p)]||[];if(!allowed.includes(z))return{ok:false,error:`Zona ${z} no válida en planta ${p}`};return{ok:true,data:{codigoHospital:code,planta:p,macroZona:String(p)+z,zona:z,local:loc,sufijo:suf||""}};}
  m=code.match(/^([0-9])([0-9])(\d{3})([A-Z])?$/); if(m){const p=Number(m[1]),macro=Number(m[2]),loc=m[3],suf=(m[4]||"").toLowerCase();const am=HOSPITAL_RULES.numericMacroByFloor[String(p)];if(am&&!am.includes(macro))return{ok:false,error:`Macrozona ${p}${macro} no válida en planta ${p}`};return{ok:true,data:{codigoHospital:code,planta:p,macroZona:String(p)+String(macro),zona:"Z"+String(macro),local:loc,sufijo:suf||""}};}
  return{ok:false,error:"Formato inválido. Ej: 7D001 / 21001 / SA001"};
}
function enrichWithHospitalFields(obj){ try{if(!obj||!obj.code) return obj;if(obj.planta!==undefined&&obj.macroZona) return obj;const p=parseHospitalCode(obj.code);if(!p.ok) return obj;return{...obj,...p.data};}catch{return obj;} }
function escHtml(s){ return String(s??"").replace(/[&<>"]/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

function populateServiceSelect(){
  const sel=document.getElementById("serviceSelect"); if(!sel) return;
  sel.innerHTML="<option value=''>-- Servicio (opcional) --</option>";
  SERVICE_CATALOG_V19.forEach(s=>{const opt=document.createElement("option");opt.value=s.id;opt.textContent=s.nombre;sel.appendChild(opt);});
}

// Exportar Excel historial
function fmtDateTime(ts){ const d=new Date(ts); return{date:d.toLocaleDateString("es-ES"),time:d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}; }
async function exportHistoryExcel(){
  const dump=await dbExportAll(),items=dump.history||[];
  if(!items.length){toast("No hay registros en el historial.","info","Historial");return;}
  items.sort((a,b)=>(b.ts||0)-(a.ts||0));
  const rows=items.map(it=>{const{date,time}=fmtDateTime(it.ts||Date.now());return{Fecha:date,Hora:time,Tecnico:it.tech||"",Codigo:it.code||"",Resultado:it.result||"",Litros:it.liters??"",Dosis_ml:it.doseMl??"",Minutos:it.minutes??"",Nota:it.note||""};});
  const header=Object.keys(rows[0]);
  let html='<html><head><meta charset="utf-8"></head><body><table border="1" cellspacing="0" cellpadding="4"><tr>'+header.map(h=>`<th>${escHtml(h)}</th>`).join('')+'</tr>';
  for(const r of rows) html+='<tr>'+header.map(h=>`<td>${escHtml(r[h])}</td>`).join('')+'</tr>';
  html+='</table></body></html>';
  const blob=new Blob([html],{type:"application/vnd.ms-excel;charset=utf-8"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`historial_legionella_${todayStr()}.xls`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  toast("Excel descargado.","ok","Historial");
}

// Mensual texto/CSV
function extractFirstCodeFromLine(line){const t=String(line||"").trim();if(!t) return null;const m=t.match(/(S[A-Z]\d{3}[A-Z]?|S[1-9]\d{3}[A-Z]?|[0-9][A-Z]\d{3}[A-Z]?|[0-9][0-9]\d{3}[A-Z]?)/i);return m?m[1]:null;}
function monthlyLoad(){try{return JSON.parse(localStorage.getItem("isivolt_monthly_v2")||"[]");}catch{return[];}}
function monthlySave(items){localStorage.setItem("isivolt_monthly_v2",JSON.stringify(items||[]));}
function monthlyRender(){
  const host=$("monthlyList");if(!host) return;
  const items=monthlyLoad(),groups=new Map();
  for(const it of items){const key=`${it.planta}|${it.macroZona}`;if(!groups.has(key))groups.set(key,{planta:it.planta,macroZona:it.macroZona,items:[]});groups.get(key).items.push(it);}
  const sorted=Array.from(groups.values()).sort((a,b)=>{if(a.planta===b.planta) return String(a.macroZona).localeCompare(String(b.macroZona));return String(a.planta).localeCompare(String(b.planta));});
  host.innerHTML="";
  if(!sorted.length){host.innerHTML=`<div class="muted">Aún no hay checklist mensual.</div>`;return;}
  for(const g of sorted){
    const box=document.createElement("div");box.className="monthly-group";
    box.innerHTML=`<h4>Planta ${escHtml(g.planta)} · MacroZona ${escHtml(g.macroZona)} <span class="muted tiny">(${g.items.length})</span></h4>`;
    g.items.sort((a,b)=>String(a.codigoHospital).localeCompare(String(b.codigoHospital)));
    for(const it of g.items){
      const row=document.createElement("label");row.className="monthly-item"+(it.done?" done":"");
      row.innerHTML=`<input type="checkbox" ${it.done?"checked":""}><div><div><b>${escHtml(it.codigoHospital)}</b> <span class="muted tiny">${escHtml(it.tipo||"")}</span></div><div class="meta muted">${escHtml(it.descripcion||"")}</div></div>`;
      const cb=row.querySelector("input");
      cb.addEventListener("change",()=>{const all=monthlyLoad(),idx=all.findIndex(x=>x.id===it.id);if(idx>=0){all[idx].done=cb.checked;all[idx].doneAt=cb.checked?new Date().toISOString():"";monthlySave(all);monthlyRender();if(cb.checked)playSoundOK();}});
      box.appendChild(row);
    }
    host.appendChild(box);
  }
}
function monthlyBuildFromLines(lines){
  const out=[],now=Date.now();
  for(let i=0;i<lines.length;i++){
    const line=String(lines[i]||"").trim();if(!line) continue;
    const codeRaw=extractFirstCodeFromLine(line);if(!codeRaw) continue;
    const parsed=parseHospitalCode(codeRaw);if(!parsed.ok) continue;
    const d=parsed.data,lower=line.toLowerCase();let tipo="";
    if(lower.includes("afch")||lower.includes("fria")||lower.includes("agua fria"))tipo="AFCH";
    if(lower.includes("acs")||lower.includes("caliente")||lower.includes("agua caliente"))tipo=tipo?(tipo+"+ACS"):"ACS";
    if(lower.includes("ducha"))tipo=tipo?(tipo+" · Ducha"):"Ducha";
    if(lower.includes("grifo"))tipo=tipo?(tipo+" · Grifo"):"Grifo";
    if(lower.includes("fregadero"))tipo=tipo?(tipo+" · Fregadero"):"Fregadero";
    out.push({id:`m_${now}_${i}`,codigoHospital:d.codigoHospital,planta:d.planta,macroZona:d.macroZona,zona:d.zona,local:d.local,sufijo:d.sufijo||"",tipo,descripcion:line.replace(codeRaw,"").trim(),done:false,createdAt:new Date().toISOString()});
  }
  return out;
}
function initMonthlyV2(){
  const ta=$("monthlyImportText"),file=$("monthlyImportFile"),buildBtn=$("monthlyBuildBtn"),clearBtn=$("monthlyClearBtn");
  buildBtn?.addEventListener("click",()=>{const lines=String(ta?.value||"").split(/\r?\n/),newItems=monthlyBuildFromLines(lines),existing=monthlyLoad(),set=new Set(existing.map(x=>x.codigoHospital));for(const it of newItems){if(!set.has(it.codigoHospital)){existing.push(it);set.add(it.codigoHospital);}}monthlySave(existing);monthlyRender();playSoundOK();toast("Checklist mensual generado.","ok","Mensual");});
  clearBtn?.addEventListener("click",()=>{if(confirm("¿Vaciar checklist mensual?")){monthlySave([]);monthlyRender();}});
  file?.addEventListener("change",async(e)=>{const f=e.target.files?.[0];if(!f) return;const txt=await f.text(),lines=txt.split(/\r?\n/).map(l=>l.split(",")[0]);if(ta) ta.value=lines.join("\n");toast("CSV cargado. Pulsa 'Generar checklist'.","ok","Mensual");});
  monthlyRender();
}

// =================== NAV ===================
function bindNav(){
  document.querySelectorAll("[data-nav]").forEach(btn=>{
    btn.addEventListener("click",()=>{ const to=btn.getAttribute("data-nav"); if(to==="home"){show("home");refreshOT();} });
  });
}
function setScanMode(mode){
  state.scanMode=mode;
  const title=$("scanTitle"),hint=$("scanHint");
  if(mode==="monthlyHot"){if(title) title.textContent="Escanear · 🔥 ACS (Caliente)";if(hint) hint.textContent="Escanea el QR/código del punto (ACS).";}
  else if(mode==="monthlyCold"){if(title) title.textContent="Escanear · ❄️ AFCH (Fría)";if(hint) hint.textContent="Escanea el QR/código del punto (AFCH).";}
  else{if(title) title.textContent="Escanear QR";if(hint) hint.textContent='Si tu móvil no soporta escaneo nativo, usa "Añadir punto".';}
}

// =================== INIT ===================
function init(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.register("./sw.js").then((reg)=>{
      reg.addEventListener("updatefound",()=>{
        const nw=reg.installing;if(!nw) return;
        nw.addEventListener("statechange",()=>{if(nw.state==="installed"&&navigator.serviceWorker.controller){const banner=$("updateBanner");banner?.classList.remove("hidden");$("btnUpdateNow")?.addEventListener("click",()=>window.location.reload());$("btnUpdateLater")?.addEventListener("click",()=>banner?.classList.add("hidden"));toast("Hay una nueva versión lista. Pulsa Actualizar.","info","Actualización");}});
      });
    }).catch(()=>{});
  }

  populateServiceSelect();
  bindNav();
  initMonthlyV2();
  initPodcastUI();

  const pill=$("pillOffline");
  if(pill){ function updateOnline(){const on=navigator.onLine;pill.textContent=on?"Online":"Offline OK";pill.style.opacity=on?"0.95":"0.8";}window.addEventListener("online",updateOnline);window.addEventListener("offline",updateOnline);updateOnline(); }

  // ---- LOGIN ----
  $("btnLogin")?.addEventListener("click",()=>{
    const creds=getCredentials();
    const u=($("loginUser")?.value||"").trim().toLowerCase();
    const p=($("loginPass")?.value||"").trim();
    if(u===creds.user.toLowerCase()&&p===creds.pass){
      setLoggedIn(true); playSoundLogin();
      if(!state.tech){show("profile");}else{show("home");refreshOT();}
    }else{
      try{navigator.vibrate?.([80,40,80]);}catch{}
      toast("Usuario o contraseña incorrectos.","warn","Acceso");
      if($("loginPass")){$("loginPass").value="";$("loginPass").focus();}
    }
  });
  $("loginPass")?.addEventListener("keydown",(e)=>{if(e.key==="Enter") $("btnLogin")?.click();});
  $("loginUser")?.addEventListener("keydown",(e)=>{if(e.key==="Enter") $("loginPass")?.focus();});

  // ---- CAMBIAR CONTRASEÑA ----
  $("btnChangePass")?.addEventListener("click",()=>{
    const creds=getCredentials();
    const oldPass=prompt("Contraseña actual:");if(oldPass==null) return;
    if(oldPass!==creds.pass) return toast("Contraseña actual incorrecta.","warn","Seguridad");
    const newUser=prompt("Nuevo usuario:",creds.user);if(newUser==null) return;
    const newPass=prompt("Nueva contraseña:");if(newPass==null) return;
    if(!newUser.trim()||!newPass.trim()) return toast("Usuario o contraseña no pueden estar vacíos.","warn");
    saveCredentials({user:newUser.trim(),pass:newPass});
    toast("Credenciales actualizadas ✅","ok","Seguridad");
  });

  // Verificar si ya está logueado
  if(!isLoggedIn()){show("login");return;}
  if(!state.tech){show("profile");}else{show("home");refreshOT();}

  // ---- PROFILE ----
  $("btnSetTech")?.addEventListener("click",async()=>{const name=String($("techName")?.value||"").trim();if(!name) return toast("Escribe el nombre del técnico.");state.tech=name;localStorage.setItem("isivolt.tech",name);playSoundLogin();show("home");await refreshOT();});
  $("btnSwitchTech")?.addEventListener("click",()=>{localStorage.removeItem("isivolt.tech");state.tech="";if($("techName")) $("techName").value="";show("profile");});
  $("btnLogout")?.addEventListener("click",()=>{if(!confirm("¿Cerrar sesión?")) return;setLoggedIn(false);state.tech="";localStorage.removeItem("isivolt.tech");show("login");});

  // ---- HOME ----
  $("btnAddCode")?.addEventListener("click",async()=>{const code=prompt("Introduce el código (se usarán los 5 últimos):");if(code==null) return;await addOTCode(code);});
  $("btnScan")?.addEventListener("click",()=>{setScanMode("ot");show("scan");});
  $("btnHistory")?.addEventListener("click",()=>openHistory());
  $("btnMonthly")?.addEventListener("click",()=>openMonthly());
  $("btnExplainOT")?.addEventListener("click",()=>{alert("OT de hoy = la lista de puntos que vas a hacer hoy.\n\nSe crea añadiendo puntos (QR o código).\nCuando completas un punto, queda ✅ y se guarda en el historial.");});
  $("btnClearOT")?.addEventListener("click",async()=>{if(!confirm("¿Vaciar OT de hoy? (solo en este móvil)")) return;await dbDeleteOTByTechDate(state.tech,todayStr());await refreshOT();});

  // ---- SCAN ----
  $("btnStartScan")?.addEventListener("click",startScan);
  $("btnStopScan")?.addEventListener("click",stopScan);
  $("btnManualGo")?.addEventListener("click",async()=>{const c=normalizeCode($("manualCodeFromScan")?.value);if(!c) return toast("Código inválido.");stopScan();if(state.scanMode==="monthlyHot"){await addMonthlyQuick(c,"ACS");await openMonthly();}else if(state.scanMode==="monthlyCold"){await addMonthlyQuick(c,"AFCH");await openMonthly();}else{await addOTCode(c);show("home");}});

  // ---- PUNTO ----
  $("liters")?.addEventListener("input",()=>updateDoseUI());
  $("btnUseDefaultLiters")?.addEventListener("click",()=>{if($("liters")) $("liters").value=60;updateDoseUI();if($("targetMinutes")) $("targetMinutes").value=calcAutoMinutes(60,getSettings());});
  $("btnTimeAuto")?.addEventListener("click",()=>{if($("targetMinutes")) $("targetMinutes").value=calcAutoMinutes($("liters")?.value,getSettings());});
  $("btnSaveNote")?.addEventListener("click",async()=>{await saveOTNote(state.currentCode,$("pointNote")?.value);playSoundSave();toast("Nota guardada ✅");});
  $("btnStartTimer")?.addEventListener("click",()=>startTimerForCurrent());
  $("btnMarkIssue")?.addEventListener("click",markIssue);
  $("btnEditCode")?.addEventListener("click",()=>editOTCode(state.currentCode));

  // ---- TIMER ----
  $("btnPause")?.addEventListener("click",pauseTimer);
  $("btnResume")?.addEventListener("click",resumeTimer);
  $("btnFinish")?.addEventListener("click",()=>finishTimer(false));
  $("btnExitTimer")?.addEventListener("click",()=>{state.timer.running=false;stopRaf();show("home");});

  // ---- HISTORIAL ----
  $("btnExport")?.addEventListener("click",exportData);
  $("btnImport")?.addEventListener("click",()=>$("fileImport")?.click());
  $("fileImport")?.addEventListener("change",async(e)=>{const file=e.target.files?.[0];if(!file) return;await importData(file);e.target.value="";});
  $("btnExportExcel")?.addEventListener("click",exportHistoryExcel);

  // ---- MENSUAL ----
  $("btnMonthlyAdd")?.addEventListener("click",async()=>{await addMonthlyManual();await openMonthly();});
  $("btnMonthlyClear")?.addEventListener("click",async()=>{if(!confirm("¿Vaciar checklist mensual del mes actual?")) return;await dbDeleteMonthlyByTechMonth(state.tech,monthKey());await openMonthly();});
  $("btnMonthlyAttach")?.addEventListener("click",()=>$("monthlyFile")?.click());
  $("monthlyFile")?.addEventListener("change",async(e)=>{const file=e.target.files?.[0];if(!file) return;await attachMonthlyFile(file);e.target.value="";});
  $("btnMonthlyOpen")?.addEventListener("click",openMonthlyFile);
  $("btnMonthlyScanHot")?.addEventListener("click",()=>{setScanMode("monthlyHot");show("scan");});
  $("btnMonthlyScanCold")?.addEventListener("click",()=>{setScanMode("monthlyCold");show("scan");});
  $("btnMonthlyShowEmpty")?.addEventListener("click",async()=>{state.showEmptyMonthly=!state.showEmptyMonthly;const btn=$("btnMonthlyShowEmpty");if(btn) btn.textContent=`👁️ Mostrar vacías: ${state.showEmptyMonthly?"ON":"OFF"}`;await openMonthly();});
  $("btnSaveMonthlyHeader")?.addEventListener("click",saveMonthlyHeader);
  $("btnMonthlyExport")?.addEventListener("click",exportMonthly);

  // ---- AJUSTES ----
  $("btnSettings")?.addEventListener("click",openSettings);
  $("btnCloseSettings")?.addEventListener("click",closeSettings);
  $("btnSaveSettings")?.addEventListener("click",saveSettingsFromUI);
  $("btnResetSettings")?.addEventListener("click",resetSettings);

  // ---- GUÍA ----
  $("btnGuide")?.addEventListener("click",openGuide);
  $("btnSpeak")?.addEventListener("click",speakGuide);
  $("btnStopSpeak")?.addEventListener("click",stopSpeak);
}

init();
