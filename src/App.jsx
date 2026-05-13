import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
const resendApiKey = import.meta.env.VITE_RESEND_API_KEY;

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  brand:"#956342", brandDark:"#7a4f32",
  gold:"#c9a96e", dark:"#0f0a07", surface:"#1a1008", surfaceAlt:"#150d06",
  border:"#2e1e10", borderHi:"#3d2a15",
  muted:"#a07855", faint:"#6b4e35",
  green:"#16a34a", greenBg:"#052e16",
  red:"#dc2626", redBg:"#2d0a0a",
  amber:"#f59e0b", amberBg:"#1c1000",
  blue:"#3b82f6",
};

// ─── LOGO (embedded image) ────────────────────────────────────────────────────
// Put your transparent PNG logo inside:
// /public/mcx-logo.png

const LOGO_SRC = "/mcx-logo.png";

const Logo = ({ size = 56 }) => (
  <img
    src={LOGO_SRC}
    alt="MCX"
    width={size}
    height={size}
    style={{
      objectFit: "contain",
      display: "block",
      background: "transparent",
    }}
  />
);

export default Logo;
// ───SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wrxpyadnllzorrrsiawo.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_2rrfRnIMort56my_pwyg1g__epLmUgB";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STORE LOCATION ───────────────────────────────────────────────────────────
const STORE_LAT=40.700763, STORE_LNG=-73.949922, STORE_RADIUS=200;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MANAGER_PIN="5824";
const PAY_METHODS=["Cash","Check","Zelle","Store Credit"];
const DAYS=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_SCHED={
  Sunday:{active:false,start:"09:00",end:"19:00"},Monday:{active:true,start:"09:00",end:"19:00"},
  Tuesday:{active:true,start:"09:00",end:"19:00"},Wednesday:{active:true,start:"09:00",end:"19:00"},
  Thursday:{active:true,start:"09:00",end:"19:00"},Friday:{active:true,start:"09:00",end:"19:00"},
  Saturday:{active:false,start:"09:00",end:"19:00"},
};
const PRESETS=[["Today",0],["Last 7 days",6],["Last 30 days",29],["This month","month"],["All time",null]];

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pad=n=>String(n).padStart(2,"0");
const fmtMoney=n=>`$${Number(n||0).toFixed(2)}`;
const fmtTime=ts=>{if(!ts)return"—";const d=new Date(ts);let h=d.getHours(),m=d.getMinutes(),ap=h>=12?"PM":"AM";h=h%12||12;return`${h}:${pad(m)} ${ap}`;};
const fmtDate=ts=>{if(!ts)return"";const d=new Date(ts);return`${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;};
const fmt24=t=>{if(!t)return"";const[h,m]=t.split(":").map(Number);return`${h%12||12}:${pad(m)} ${h>=12?"PM":"AM"}`;};
const hoursFrom=list=>{let t=0;for(const e of list)if(e.clock_in&&e.clock_out)t+=(new Date(e.clock_out)-new Date(e.clock_in))/3600000;return t;};
const isToday=ts=>{const d=new Date(ts),n=new Date();return d.getDate()===n.getDate()&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();};
const getSched=w=>{if(!w.schedule)return DEFAULT_SCHED;return typeof w.schedule==="string"?JSON.parse(w.schedule):w.schedule;};
const schedSummary=s=>{const active=DAYS.filter(d=>s?.[d]?.active);if(!active.length)return"No scheduled days";const names=active.map(d=>d.slice(0,3)).join(", ");const times=active.map(d=>`${fmt24(s[d].start)}–${fmt24(s[d].end)}`);return times.every(t=>t===times[0])?`${names}  ${times[0]}`:`${names} (varied)`;};
const geoDist=(la1,ln1,la2,ln2)=>{const R=6371000,dL=(la2-la1)*Math.PI/180,dN=(ln2-ln1)*Math.PI/180;const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dN/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));};
const useNow=()=>{const[n,s]=useState(new Date());useEffect(()=>{const id=setInterval(()=>s(new Date()),1000);return()=>clearInterval(id);},[]);return n;};
const presetLabel=(from,to)=>{if(!from&&!to)return"All time";const now=new Date(),t=now.toISOString().slice(0,10);if(from===t&&to===t)return"Today";const d6=new Date();d6.setDate(now.getDate()-6);if(from===d6.toISOString().slice(0,10)&&to===t)return"Last 7 days";const d29=new Date();d29.setDate(now.getDate()-29);if(from===d29.toISOString().slice(0,10)&&to===t)return"Last 30 days";const m=new Date(now.getFullYear(),now.getMonth(),1);if(from===m.toISOString().slice(0,10)&&to===t)return"This month";return null;};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
const exportCSV=({workers,entries,payments,reminders,from,to})=>{
  const inRange=ts=>{const d=new Date(ts);if(from&&d<new Date(from+"T00:00:00"))return false;if(to&&d>new Date(to+"T23:59:59"))return false;return true;};
  const label=from&&to?`${from}_to_${to}`:new Date().toISOString().slice(0,10);
  const rows=[["Worker","Hours","Rate","Gross Pay","Paid","Balance","Schedule","Methods","Check #s","Alert","Alert Time"]];
  workers.forEach(w=>{
    const we=entries.filter(e=>e.worker_id===w.id&&inRange(e.clock_in));
    const wp=payments.filter(p=>p.worker_id===w.id&&inRange(p.paid_at));
    const hrs=hoursFrom(we),gross=hrs*w.rate,paid=wp.reduce((s,p)=>s+Number(p.amount),0),bal=Math.max(0,gross-paid);
    const methods=wp.flatMap(p=>(p.methods||[]).map(m=>`${m.method} ${fmtMoney(m.amount)}`)).join(" | ");
    const checks=wp.flatMap(p=>(p.methods||[]).filter(m=>m.method==="Check"&&m.checkNumber).map(m=>`#${m.checkNumber}`)).join(", ");
    const alerts=reminders.filter(r=>r.workerId===w.id);
    (alerts.length?alerts:[null]).forEach((a,i)=>{rows.push([i===0?w.name:"",i===0?hrs.toFixed(2):"",i===0?w.rate:"",i===0?fmtMoney(gross):"",i===0?fmtMoney(paid):"",i===0?fmtMoney(bal):"",i===0?schedSummary(getSched(w)):"",i===0?methods:"",i===0?checks:"",a?a.msg:"",a?`${fmtDate(a.ts)} ${fmtTime(a.ts)}`:""])});
    rows.push(new Array(11).fill(""));
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement("a"),{href:url,download:`MCX_Payroll_${label}.csv`}).click();
  URL.revokeObjectURL(url);
};

// ─── UI PRIMITIVES ────────────────────────────────────────────────────────────
const ClockFace=({now,dark=false})=>{
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const mos=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h=now.getHours(),m=now.getMinutes(),s=now.getSeconds();const ap=h>=12?"PM":"AM";h=h%12||12;
  return(<div style={{textAlign:"center",marginBottom:20}}>
    <div style={{fontSize:44,fontFamily:"'Courier New',monospace",fontWeight:700,color:dark?"#fff":"#0a0a0a",letterSpacing:2,lineHeight:1}}>{pad(h)}:{pad(m)}:{pad(s)} <span style={{fontSize:20,color:"#888"}}>{ap}</span></div>
    <div style={{fontSize:13,color:"#888",marginTop:4,letterSpacing:1}}>{days[now.getDay()]}, {mos[now.getMonth()]} {now.getDate()}, {now.getFullYear()}</div>
  </div>);
};

const Toast=({msg,type,onClose})=>{
  useEffect(()=>{const t=setTimeout(onClose,5000);return()=>clearTimeout(t);},[onClose]);
  const bg=type==="success"?T.green:type==="warning"?"#92400e":"#1e3a8a";
  return(<div style={{position:"fixed",top:20,right:20,zIndex:9999,background:bg,color:"#fff",padding:"14px 20px",borderRadius:12,maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,.5)",fontSize:14,lineHeight:1.6,animation:"toastIn .3s ease"}}>{msg}<button onClick={onClose} style={{marginLeft:12,background:"none",border:"none",color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:16}}>✕</button></div>);
};

// Fast three-dot loader (no spinner)
const Loader=()=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:T.brand,flexDirection:"column",gap:20}}>
    <Logo size={70}/>
    <div style={{display:"flex",gap:8}}>
      {[0,1,2].map(i=><div key={i} style={{width:9,height:9,borderRadius:"50%",background:T.gold,animation:`dotPop .6s ${i*0.15}s ease-in-out infinite alternate`}}/>)}
    </div>
  </div>
);

const inp=(x={})=>({width:"100%",padding:"9px 12px",background:T.dark,border:`1px solid ${T.border}`,borderRadius:8,color:"#fff",fontSize:14,boxSizing:"border-box",...x});
const Toggle=({on,onChange})=>(<div onClick={onChange} style={{width:46,height:26,borderRadius:13,background:on?T.green:T.border,position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}><div style={{position:"absolute",top:3,left:on?22:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/></div>);

const SchedEditor=({schedule,onChange})=>{
  const s=schedule||DEFAULT_SCHED;
  return(<div>{DAYS.map(day=>{const ds=s[day]||{active:false,start:"09:00",end:"19:00"};return(<div key={day} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}><Toggle on={ds.active} onChange={()=>onChange({...s,[day]:{...ds,active:!ds.active}})}/><span style={{width:94,fontSize:13,fontWeight:600,color:ds.active?"#fff":T.faint}}>{day}</span>{ds.active?(<>{["start","end"].map((f,i)=>(<span key={f} style={{display:"flex",alignItems:"center",gap:6}}>{i===1&&<span style={{color:T.faint,fontSize:12}}>to</span>}<input type="time" value={ds[f]} onChange={e=>onChange({...s,[day]:{...ds,[f]:e.target.value}})} style={{...inp({width:116,padding:"5px 8px",flex:"none"})}}/></span>))}</>):<span style={{fontSize:12,color:T.faint}}>Day off</span>}</div>);})}</div>);
};

// Date range picker with highlighted active preset
const DateRange=({from,to,onChange})=>{
  const active=presetLabel(from,to);
  const set=(days)=>{
    if(days===null){onChange({from:"",to:""});return;}
    const now=new Date(),s=new Date();
    if(days==="month")s.setDate(1);else s.setDate(now.getDate()-days);
    onChange({from:s.toISOString().slice(0,10),to:now.toISOString().slice(0,10)});
  };
  return(<div style={{background:T.surface,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`,marginBottom:20}}>
    <div style={{fontSize:11,color:T.faint,fontWeight:700,letterSpacing:1,marginBottom:10}}>DATE RANGE FILTER</div>
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
      {PRESETS.map(([l,v])=>{const isActive=active===l;return(<button key={l} onClick={()=>set(v)} style={{padding:"6px 14px",borderRadius:20,border:isActive?`2px solid ${T.gold}`:"2px solid transparent",cursor:"pointer",fontSize:12,fontWeight:700,background:isActive?"#fff":T.border,color:isActive?T.dark:T.muted,transition:"all .15s",boxShadow:isActive?"0 2px 8px rgba(0,0,0,.2)":"none"}}>{l}</button>);})}
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {[["From","from"],["To","to"]].map(([label,field])=>(<div key={field} style={{flex:1,minWidth:140}}><label style={{fontSize:11,color:T.faint,display:"block",marginBottom:4}}>{label}</label><input type="date" value={field==="from"?from:to} onChange={e=>onChange({from,to,...{[field]:e.target.value}})} style={inp({padding:"7px 10px"})}/></div>))}
    </div>
    {(from||to)&&<div style={{fontSize:12,color:T.gold,marginTop:8}}>Showing: {from?fmtDate(from+"T12:00:00"):"start"} → {to?fmtDate(to+"T12:00:00"):"now"}</div>}
  </div>);
};

// Three-dot menu for clock log entries
const EntryMenu=({entry,workers,onEdit,onDelete})=>{
  const[open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{const h=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};document.addEventListener("mousedown",h);return()=>document.removeEventListener("mousedown",h);},[]);
  return(<div ref={ref} style={{position:"relative",display:"inline-block"}}>
    <button onClick={()=>setOpen(o=>!o)} style={{background:"none",border:"none",color:T.faint,cursor:"pointer",fontSize:18,lineHeight:1,padding:"2px 6px",borderRadius:6,transition:"background .15s"}} title="Options">⋮</button>
    {open&&(<div style={{position:"absolute",right:0,top:"110%",zIndex:200,background:T.surface,border:`1px solid ${T.borderHi}`,borderRadius:10,boxShadow:"0 8px 24px rgba(0,0,0,.5)",minWidth:120,overflow:"hidden"}}>
      <button onClick={()=>{setOpen(false);onEdit(entry);}} style={{display:"block",width:"100%",padding:"10px 16px",background:"none",border:"none",color:"#fff",cursor:"pointer",fontSize:13,textAlign:"left",borderBottom:`1px solid ${T.border}`}}>✏️ Edit</button>
      <button onClick={()=>{setOpen(false);onDelete(entry);}} style={{display:"block",width:"100%",padding:"10px 16px",background:"none",border:"none",color:T.red,cursor:"pointer",fontSize:13,textAlign:"left"}}>🗑 Delete</button>
    </div>)}
  </div>);
};

// Edit clock entry modal
const EditEntryModal=({entry,workers,onSave,onClose})=>{
  const w=workers.find(x=>x.id===entry.worker_id);
  const toLocal=ts=>ts?new Date(ts).toISOString().slice(0,16):"";
  const[inVal,setIn]=useState(toLocal(entry.clock_in));
  const[outVal,setOut]=useState(toLocal(entry.clock_out));
  return(<div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
    <div style={{background:T.surface,borderRadius:20,width:"100%",maxWidth:420,border:`1px solid ${T.gold}`,padding:24}}>
      <div style={{fontFamily:"Georgia,serif",fontSize:19,fontWeight:700,marginBottom:4}}>Edit Clock Entry</div>
      <div style={{fontSize:13,color:T.muted,marginBottom:20}}>{w?.name}</div>
      {[["Clock In","datetime-local",inVal,setIn],["Clock Out","datetime-local",outVal,setOut]].map(([label,type,val,setter])=>(
        <div key={label} style={{marginBottom:14}}>
          <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:5}}>{label}</label>
          <input type={type} value={val} onChange={e=>setter(e.target.value)} style={inp()}/>
        </div>
      ))}
      <div style={{display:"flex",gap:10,marginTop:6}}>
        <button onClick={()=>onSave(entry.id,inVal,outVal||null)} style={{flex:2,padding:"11px",background:T.gold,border:"none",borderRadius:10,fontWeight:700,cursor:"pointer",color:T.dark,fontSize:15}}>Save Changes</button>
        <button onClick={onClose} style={{flex:1,padding:"11px",background:T.border,border:"none",borderRadius:10,color:"#888",cursor:"pointer"}}>Cancel</button>
      </div>
    </div>
  </div>);
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const now=useNow();
  const[screen,setScreen]=useState("splash");
  const[splashOut,setSplashOut]=useState(false);
  const[loading,setLoading]=useState(true);
  const[workers,setWorkers]=useState([]);
  const[entries,setEntries]=useState([]);
  const[payments,setPayments]=useState([]);
  const[activeW,setActiveW]=useState(null);
  const[pinBuf,setPinBuf]=useState("");
  const[pinTarget,setPinTarget]=useState(null);
  const[pinErr,setPinErr]=useState("");
  const[toast,setToast]=useState(null);
  const[mTab,setMTab]=useState("dashboard");
  const[saving,setSaving]=useState(false);
  const[editWid,setEditWid]=useState(null);
  const[editForm,setEditForm]=useState({});
  const[editSched,setEditSched]=useState(null);
  const[addingW,setAddingW]=useState(false);
  const[newW,setNewW]=useState({name:"",pin:"",rate:15,email:"",phone:"",geo_bypass:false});
  const[newWSched,setNewWSched]=useState(DEFAULT_SCHED);
  const[expandSch,setExpandSch]=useState(null);
  const[schDraft,setSchDraft]=useState({});
  const[manEntry,setManEntry]=useState(null);
  const[reminders,setReminders]=useState([]);
  const[payModal,setPayModal]=useState(null);
  const[payRows,setPayRows]=useState([{method:"Cash",amount:"",checkNumber:""}]);
  const[payNote,setPayNote]=useState("");
  const[dateRange,setDateRange]=useState({from:"",to:""});
  const[geoState,setGeoState]=useState({status:"idle",msg:""});
  const[editEntry,setEditEntry]=useState(null);

  const toast$=(msg,type="info")=>setToast({msg,type});

  const CSS=`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700&display=swap');*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;font-family:-apple-system,'Segoe UI',sans-serif;background:${T.brand}}button:active{transform:scale(.97)}input:focus,select:focus{outline:1px solid ${T.gold}}@keyframes popIn{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}@keyframes riseUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes dotPop{from{transform:scale(.6);opacity:.4}to{transform:scale(1.2);opacity:1}}@keyframes toastIn{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${T.dark}}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`;

  // splash: short 1.2s then load
  useEffect(()=>{const t1=setTimeout(()=>setSplashOut(true),1200),t2=setTimeout(()=>setScreen("loading"),1700);return()=>{clearTimeout(t1);clearTimeout(t2);};},[]);

  const loadAll=useCallback(async()=>{
    setLoading(true);
    const[{data:ws},{data:ce},{data:pm}]=await Promise.all([
      sb.from("workers").select("*").order("created_at"),
      sb.from("clock_entries").select("*").order("clock_in"),
      sb.from("payments").select("*").order("paid_at"),
    ]);
    setWorkers(ws||[]);setEntries(ce||[]);setPayments(pm||[]);setLoading(false);
  },[]);
  useEffect(()=>{if(screen==="loading")loadAll().then(()=>setScreen("home"));},[screen,loadAll]);

  useEffect(()=>{
    const ch=sb.channel("rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"workers"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"clock_entries"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"payments"},()=>loadAll())
      .subscribe();
    return()=>sb.removeChannel(ch);
  },[loadAll]);

  // reminders
  useEffect(()=>{
    const h=now.getHours(),m=now.getMinutes(),s=now.getSeconds(),dn=DAYS[now.getDay()];
    workers.forEach(w=>{const ds=getSched(w)[dn];if(!ds?.active)return;const[sh,sm]=ds.start.split(":").map(Number),[eh,em]=ds.end.split(":").map(Number);
      if(h===sh&&m===sm+15&&s===0&&!entries.filter(e=>e.worker_id===w.id&&isToday(e.clock_in)).some(e=>!e.clock_out)){const msg=`⏰ ${w.name} hasn't clocked in! Shift started at ${fmt24(ds.start)}.`;setReminders(r=>[...r,{id:Date.now()+w.id,workerId:w.id,msg,ts:Date.now()}]);toast$(msg,"warning");}
      if(h===eh&&m===em&&s===0&&entries.find(e=>e.worker_id===w.id&&isToday(e.clock_in)&&!e.clock_out)){const msg=`🔔 ${w.name} is still clocked in after shift end!`;setReminders(r=>[...r,{id:Date.now()+w.id+1,workerId:w.id,msg,ts:Date.now()}]);toast$(msg,"warning");}
    });
  },[now]);

  const todayE=wid=>entries.filter(e=>e.worker_id===wid&&isToday(e.clock_in));
  const allE  =wid=>entries.filter(e=>e.worker_id===wid);
  const ci    =wid=>todayE(wid).some(e=>!e.clock_out);
  const wkHrs =wid=>hoursFrom(allE(wid));
  const allPay=wid=>payments.filter(p=>p.worker_id===wid);
  const paid$ =wid=>allPay(wid).reduce((s,p)=>s+Number(p.amount),0);
  const earned$=(wid,rate)=>wkHrs(wid)*rate;
  const bal$  =(wid,rate)=>Math.max(0,earned$(wid,rate)-paid$(wid));
  const inRange=ts=>{const d=new Date(ts);if(dateRange.from&&d<new Date(dateRange.from+"T00:00:00"))return false;if(dateRange.to&&d>new Date(dateRange.to+"T23:59:59"))return false;return true;};
  const filtE =wid=>allE(wid).filter(e=>inRange(e.clock_in));
  const filtPay=wid=>allPay(wid).filter(p=>inRange(p.paid_at));

  const geoClockIn=async wid=>{
    const w=workers.find(x=>x.id===wid);
    if(w?.geo_bypass){await doClock(wid);return;}
    if(!navigator.geolocation){toast$("Geolocation not supported.","warning");return;}
    setGeoState({status:"checking",msg:"Checking your location…"});
    navigator.geolocation.getCurrentPosition(
      async pos=>{const dist=geoDist(pos.coords.latitude,pos.coords.longitude,STORE_LAT,STORE_LNG);if(dist<=STORE_RADIUS){setGeoState({status:"ok",msg:`✅ Location verified (${Math.round(dist)}m)`});await doClock(wid);setTimeout(()=>setGeoState({status:"idle",msg:""}),3000);}else{setGeoState({status:"far",msg:`📍 ${Math.round(dist)}m away. Must be within ${STORE_RADIUS}m.`});toast$(`❌ Too far (${Math.round(dist)}m). Must be on-site.`,"warning");}},
      ()=>{setGeoState({status:"denied",msg:"Location denied. Please enable location."});toast$("Location access denied.","warning");},
      {enableHighAccuracy:true,timeout:10000,maximumAge:0}
    );
  };
  const doClock=async wid=>{setSaving(true);const{error}=await sb.from("clock_entries").insert({worker_id:wid,clock_in:new Date().toISOString(),clock_out:null,note:"",manual:false});if(error)toast$("Error: "+error.message,"warning");else{await loadAll();toast$(`✅ ${workers.find(w=>w.id===wid)?.name} clocked IN at ${fmtTime(Date.now())}`,"success");}setSaving(false);};
  const clockOut=async wid=>{setSaving(true);const a=todayE(wid).find(e=>!e.clock_out);if(!a){setSaving(false);return;}const{error}=await sb.from("clock_entries").update({clock_out:new Date().toISOString()}).eq("id",a.id);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();toast$(`🔴 ${workers.find(w=>w.id===wid)?.name} clocked OUT`,"info");}setSaving(false);};

  const handlePin=d=>{const next=pinBuf+d;setPinBuf(next);if(next.length===4){setTimeout(()=>{if(pinTarget==="manager"){if(next===MANAGER_PIN){setScreen("manager");setMTab("dashboard");}else setPinErr("Incorrect manager PIN");}else{const w=workers.find(x=>x.id===pinTarget);if(w&&next===w.pin){setActiveW(w);setScreen("worker");}else setPinErr("Incorrect PIN");}setPinBuf("");},200);}};

  const addWorker=async()=>{if(!newW.name||!newW.pin||newW.pin.length!==4){toast$("Name and 4-digit PIN required","warning");return;}setSaving(true);const{error}=await sb.from("workers").insert({name:newW.name,pin:newW.pin,rate:Number(newW.rate),email:newW.email,phone:newW.phone,geo_bypass:!!newW.geo_bypass,schedule:JSON.stringify(newWSched)});if(error)toast$("Error: "+error.message,"warning");else{await loadAll();setAddingW(false);toast$(`✅ ${newW.name} added`,"success");}setSaving(false);};
  const saveEdit=async wid=>{setSaving(true);const{error}=await sb.from("workers").update({name:editForm.name,pin:editForm.pin,rate:Number(editForm.rate),email:editForm.email,phone:editForm.phone,geo_bypass:!!editForm.geo_bypass,schedule:JSON.stringify(editSched||DEFAULT_SCHED)}).eq("id",wid);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();setEditWid(null);setEditSched(null);toast$("✅ Worker updated","success");}setSaving(false);};
  const deleteW=async(wid,name)=>{if(!window.confirm(`Remove ${name}?`))return;setSaving(true);const{error}=await sb.from("workers").delete().eq("id",wid);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();toast$(`${name} removed`,"info");}setSaving(false);};
  const saveSchTab=async wid=>{setSaving(true);const{error}=await sb.from("workers").update({schedule:JSON.stringify(schDraft)}).eq("id",wid);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();setExpandSch(null);toast$("✅ Schedule saved","success");}setSaving(false);};

  const openPay=wid=>{const w=workers.find(x=>x.id===wid);setPayModal({workerId:wid});setPayRows([{method:"Cash",amount:bal$(wid,w.rate)>0?bal$(wid,w.rate).toFixed(2):"",checkNumber:""}]);setPayNote("");};
  const addRow=()=>setPayRows(r=>[...r,{method:"Cash",amount:"",checkNumber:""}]);
  const delRow=i=>setPayRows(r=>r.filter((_,idx)=>idx!==i));
  const updRow=(i,f,v)=>setPayRows(r=>r.map((row,idx)=>idx===i?{...row,[f]:v}:row));
  const rowTotal=()=>payRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const submitPay=async()=>{const total=rowTotal();if(!total||total<=0){toast$("Enter a valid amount","warning");return;}setSaving(true);const{error}=await sb.from("payments").insert({worker_id:payModal.workerId,amount:total,methods:payRows.filter(r=>parseFloat(r.amount)>0).map(r=>({method:r.method,amount:parseFloat(r.amount),...(r.method==="Check"&&r.checkNumber?{checkNumber:r.checkNumber}:{})})),note:payNote,paid_at:new Date().toISOString()});if(error)toast$("Error: "+error.message,"warning");else{await loadAll();toast$(`✅ Payment of ${fmtMoney(total)} recorded`,"success");setPayModal(null);}setSaving(false);};
  const deletePay=async(pid,amount)=>{if(!window.confirm(`Delete payment of ${fmtMoney(amount)}?`))return;setSaving(true);const{error}=await sb.from("payments").delete().eq("id",pid);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();toast$("Payment deleted","info");}setSaving(false);};

  const saveManual=async()=>{if(!manEntry)return;setSaving(true);const{workerId,date,inTime,outTime}=manEntry;const{error}=await sb.from("clock_entries").insert({worker_id:workerId,clock_in:new Date(`${date}T${inTime}`).toISOString(),clock_out:outTime?new Date(`${date}T${outTime}`).toISOString():null,note:"Manual entry",manual:true});if(error)toast$("Error: "+error.message,"warning");else{await loadAll();setManEntry(null);toast$("✅ Manual entry saved","success");}setSaving(false);};

  // edit / delete clock entry
  const saveEntryEdit=async(id,inVal,outVal)=>{setSaving(true);const{error}=await sb.from("clock_entries").update({clock_in:new Date(inVal).toISOString(),clock_out:outVal?new Date(outVal).toISOString():null}).eq("id",id);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();setEditEntry(null);toast$("✅ Entry updated","success");}setSaving(false);};
  const deleteEntry=async entry=>{if(!window.confirm("Delete this clock entry?"))return;setSaving(true);const{error}=await sb.from("clock_entries").delete().eq("id",entry.id);if(error)toast$("Error: "+error.message,"warning");else{await loadAll();toast$("Entry deleted","info");}setSaving(false);};

  // ── SPLASH ──
  if(screen==="splash")return(<div style={{minHeight:"100vh",background:T.brand,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,opacity:splashOut?0:1,transition:"opacity .5s ease"}}><style>{CSS}</style><div style={{animation:"popIn .5s cubic-bezier(.34,1.56,.64,1) both"}}><Logo size={110}/></div><div style={{fontFamily:"'Inter',sans-serif",fontSize:28,fontWeight:700,color:"#fff",letterSpacing:1,animation:"riseUp .6s .2s both"}}>MCX Time Clock</div><div style={{fontSize:12,color:"rgba(255,255,255,.5)",letterSpacing:4,animation:"riseUp .6s .35s both"}}>PROFESSIONAL PAYROLL SYSTEM</div></div>);

  if(screen==="loading"||loading)return<><style>{CSS}</style><Loader/></>;

  // ── PIN ──
  if(screen==="pin")return(<div style={{minHeight:"100vh",background:"#f8f6f2",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}><style>{CSS}</style><button onClick={()=>{setScreen("home");setPinBuf("");setPinErr("");setGeoState({status:"idle",msg:""}); }} style={{position:"absolute",top:24,left:24,background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#bbb"}}>←</button><Logo size={50}/><h2 style={{fontFamily:"Georgia,serif",fontSize:24,margin:"14px 0 4px",color:"#0a0a0a"}}>{pinTarget==="manager"?"Manager Login":workers.find(w=>w.id===pinTarget)?.name}</h2><p style={{color:"#aaa",fontSize:13,marginBottom:24}}>{pinTarget==="manager"?"Enter manager PIN":"Enter your 4-digit PIN"}</p><div style={{display:"flex",gap:14,marginBottom:24}}>{[0,1,2,3].map(i=><div key={i} style={{width:18,height:18,borderRadius:"50%",background:i<pinBuf.length?"#0a0a0a":"#ddd",transition:"background .15s"}}/>)}</div>{pinErr&&<div style={{color:T.red,fontSize:13,marginBottom:12,background:"#fef2f2",padding:"6px 16px",borderRadius:6}}>{pinErr}</div>}<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,width:240}}>{[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(<button key={i} onClick={()=>{if(d==="⌫"){setPinBuf(p=>p.slice(0,-1));setPinErr("");}else if(d!=="")handlePin(String(d));}} disabled={d===""} style={{height:64,borderRadius:12,border:"none",background:d===""?"transparent":d==="⌫"?"#f0ece4":"#fff",color:"#0a0a0a",fontSize:22,fontWeight:600,cursor:d===""?"default":"pointer",boxShadow:d===""||d==="⌫"?"none":"0 2px 10px rgba(0,0,0,.08)"}}>{d}</button>))}</div></div>);

  // ── HOME ──
  if(screen==="home")return(<div style={{minHeight:"100vh",background:"#f8f6f2",display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 16px"}}><style>{CSS}</style>{toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}<div style={{width:"100%",maxWidth:480}}><div style={{textAlign:"center",marginBottom:26}}><Logo size={80}/><h1 style={{fontFamily:"'Inter',sans-serif",fontSize:28,fontWeight:700,margin:"12px 0 4px",color:"#0a0a0a",letterSpacing:-.5}}>MCX Time Clock</h1><p style={{color:"#bbb",fontSize:13}}>Tap your name to clock in or out</p></div><ClockFace now={now}/><div style={{display:"grid",gap:11,marginBottom:26}}>{workers.map(w=>{const isin=ci(w.id),th=hoursFrom(todayE(w.id));return(<button key={w.id} onClick={()=>{setPinTarget(w.id);setPinBuf("");setPinErr("");setScreen("pin");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",border:isin?`2px solid ${T.green}`:"2px solid #ece8e0",borderRadius:14,padding:"14px 18px",cursor:"pointer",boxShadow:isin?"0 4px 20px rgba(22,163,74,.14)":"0 2px 8px rgba(0,0,0,.05)",transition:"all .2s"}}><div style={{display:"flex",alignItems:"center",gap:13}}><div style={{width:44,height:44,borderRadius:"50%",background:isin?"#dcfce7":"#f3f0ea",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:isin?T.green:"#999"}}>{w.name.split(" ").map(n=>n[0]).join("")}</div><div style={{textAlign:"left"}}><div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:"#0a0a0a"}}>{w.name}</div><div style={{fontSize:12,color:isin?T.green:"#ccc",marginTop:2}}>{isin?`● Clocked In · ${th.toFixed(1)}h today`:"Not clocked in"}</div></div></div><div style={{display:"flex",alignItems:"center",gap:8}}>{w.geo_bypass&&<span style={{fontSize:10,color:T.amber,background:T.amberBg,padding:"2px 7px",borderRadius:10,fontWeight:700}}>🏠 Remote</span>}<div style={{padding:"5px 13px",borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:.5,background:isin?T.green:"#f0ece4",color:isin?"#fff":"#aaa"}}>{isin?"IN":"OUT"}</div></div></button>);})}</div><button onClick={()=>{setPinTarget("manager");setPinBuf("");setPinErr("");setScreen("pin");}} style={{width:"100%",padding:16,background:T.brand,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",letterSpacing:.5}}>Manager Login</button></div></div>);

  // ── WORKER SCREEN ──
  if(screen==="worker"&&activeW){
    const isin=ci(activeW.id),te=todayE(activeW.id),th=hoursFrom(te),wh=wkHrs(activeW.id);
    const active=te.find(e=>!e.clock_out),ds=getSched(activeW)[DAYS[now.getDay()]];
    const busy=saving||geoState.status==="checking";
    const geoColor=geoState.status==="ok"?T.green:geoState.status==="far"||geoState.status==="denied"?T.red:T.amber;
    return(<div style={{minHeight:"100vh",background:isin?"#f0fdf4":"#f8f6f2",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 16px",position:"relative"}}><style>{CSS}</style>{toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}<button onClick={()=>{setScreen("home");setActiveW(null);setGeoState({status:"idle",msg:""}); }} style={{position:"absolute",top:24,left:24,background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#bbb"}}>←</button><div style={{width:"100%",maxWidth:380,textAlign:"center"}}><Logo size={46}/><div style={{width:88,height:88,borderRadius:"50%",margin:"16px auto 10px",background:isin?"#dcfce7":"#f3f0ea",display:"flex",alignItems:"center",justifyContent:"center",fontSize:30,fontWeight:700,color:isin?T.green:"#aaa",border:isin?`3px solid ${T.green}`:"3px solid #e5e0d5"}}>{activeW.name.split(" ").map(n=>n[0]).join("")}</div><h2 style={{fontFamily:"Georgia,serif",fontSize:24,margin:"0 0 4px",color:"#0a0a0a"}}>{activeW.name}</h2>{activeW.geo_bypass&&<div style={{fontSize:12,color:T.amber,marginBottom:6}}>🏠 Remote worker — location check bypassed</div>}<div style={{fontSize:13,color:isin?T.green:"#ccc",marginBottom:18,fontWeight:600}}>{isin?`● CLOCKED IN since ${fmtTime(active?.clock_in)}`:"○ NOT CLOCKED IN"}</div><ClockFace now={now}/><div style={{display:"flex",gap:10,marginBottom:20}}>{[{l:"Today",v:`${th.toFixed(2)}h`},{l:"This Week",v:`${wh.toFixed(2)}h`},{l:"Est. Pay",v:fmtMoney(wh*activeW.rate)}].map(s=>(<div key={s.l} style={{flex:1,background:"#fff",borderRadius:12,padding:"12px 8px",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}><div style={{fontSize:17,fontWeight:700,color:"#0a0a0a"}}>{s.v}</div><div style={{fontSize:11,color:"#bbb",marginTop:2}}>{s.l}</div></div>))}</div>{ds?.active&&<div style={{background:"#fff",borderRadius:12,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#888",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>🕒 Today's shift: <strong style={{color:"#0a0a0a"}}>{fmt24(ds.start)} – {fmt24(ds.end)}</strong></div>}{geoState.status!=="idle"&&<div style={{background:"#fff",borderRadius:12,padding:"10px 16px",marginBottom:16,fontSize:13,color:geoColor,textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)",display:"flex",alignItems:"center",gap:8}}>{geoState.status==="checking"&&<div style={{width:14,height:14,border:`2px solid ${T.amber}`,borderTop:"2px solid transparent",borderRadius:"50%",animation:"spin 1s linear infinite",flexShrink:0}}/>}{geoState.msg}</div>}{!isin?<button onClick={()=>geoClockIn(activeW.id)} disabled={busy} style={{width:"100%",padding:20,background:busy?"#aaa":T.green,color:"#fff",border:"none",borderRadius:16,fontSize:20,fontWeight:700,cursor:busy?"wait":"pointer",boxShadow:"0 8px 28px rgba(22,163,74,.38)",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><span style={{fontSize:26}}>●</span>{geoState.status==="checking"?"Checking location…":saving?"Saving…":"CLOCK IN"}</button>:<button onClick={()=>clockOut(activeW.id)} disabled={saving} style={{width:"100%",padding:20,background:saving?"#aaa":T.red,color:"#fff",border:"none",borderRadius:16,fontSize:20,fontWeight:700,cursor:saving?"wait":"pointer",boxShadow:"0 8px 28px rgba(220,38,38,.38)",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}><span style={{fontSize:26}}>■</span>{saving?"Saving…":"CLOCK OUT"}</button>}{te.length>0&&<div style={{marginTop:20,background:"#fff",borderRadius:12,padding:16,textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}><div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#0a0a0a",letterSpacing:.5}}>TODAY'S LOG</div>{te.map((e,i)=>(<div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f3f0ea",fontSize:13}}><span style={{color:T.green}}>▲ {fmtTime(e.clock_in)}</span><span style={{color:e.clock_out?T.red:T.amber}}>{e.clock_out?`▼ ${fmtTime(e.clock_out)}`:"● Active"}</span><span style={{color:"#aaa"}}>{e.clock_out?`${((new Date(e.clock_out)-new Date(e.clock_in))/3600000).toFixed(2)}h`:"…"}</span></div>))}</div>}</div></div>);
  }

  // ── MANAGER ──
  if(screen==="manager"){
    const totalIn=workers.filter(w=>ci(w.id)).length;
    const totE=workers.reduce((s,w)=>s+earned$(w.id,w.rate),0);
    const totP=workers.reduce((s,w)=>s+paid$(w.id),0);
    const totH=workers.reduce((s,w)=>s+wkHrs(w.id),0);
    const TABS=[{id:"dashboard",l:"Dashboard"},{id:"payroll",l:"Payroll"},{id:"workers",l:"Workers"},{id:"logs",l:"Logs"},{id:"schedule",l:"Schedule"},{id:"alerts",l:`Alerts${reminders.length>0?` (${reminders.length})`:""}`}];
    return(<div style={{minHeight:"100vh",background:T.dark,color:"#fff"}}><style>{CSS}</style>{toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {editEntry&&<EditEntryModal entry={editEntry} workers={workers} onSave={saveEntryEdit} onClose={()=>setEditEntry(null)}/>}

      {/* PAYMENT MODAL */}
      {payModal&&(()=>{const w=workers.find(x=>x.id===payModal.workerId),b=bal$(w.id,w.rate),rt=rowTotal();return(<div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}><div style={{background:T.surface,borderRadius:20,width:"100%",maxWidth:500,border:`1px solid ${T.gold}`,maxHeight:"92vh",overflowY:"auto"}}><div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontFamily:"Georgia,serif",fontSize:21,fontWeight:700}}>Record Payment</div><div style={{fontSize:13,color:T.muted,marginTop:3}}>{w.name}</div></div><button onClick={()=>setPayModal(null)} style={{background:T.border,border:"none",color:"#888",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:18}}>✕</button></div><div style={{padding:"20px 24px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>{[{l:"Earned",v:fmtMoney(earned$(w.id,w.rate)),c:T.gold},{l:"Paid",v:fmtMoney(paid$(w.id)),c:"#4ade80"},{l:"Balance",v:fmtMoney(b),c:b>0?T.red:"#4ade80"}].map(s=>(<div key={s.l} style={{background:T.dark,borderRadius:12,padding:"13px 10px",textAlign:"center",border:`1px solid ${T.border}`}}><div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:11,color:T.faint,marginTop:3}}>{s.l}</div></div>))}</div><div style={{fontSize:12,color:T.faint,fontWeight:700,letterSpacing:1,marginBottom:10}}>PAYMENT METHOD(S)</div>{payRows.map((row,i)=>(<div key={i} style={{marginBottom:12,padding:"12px 14px",background:T.dark,borderRadius:10,border:`1px solid ${T.border}`}}><div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>{PAY_METHODS.map(m=><button key={m} onClick={()=>updRow(i,"method",m)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:row.method===m?T.gold:T.border,color:row.method===m?T.dark:"#888",transition:"all .15s"}}>{m}</button>)}</div><div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{position:"relative",flex:1}}><span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.faint,fontSize:15}}>$</span><input type="number" value={row.amount} min="0" step="0.01" onChange={e=>updRow(i,"amount",e.target.value)} placeholder="0.00" style={{...inp({padding:"11px 12px 11px 26px",fontSize:16})}}/></div>{payRows.length>1&&<button onClick={()=>delRow(i)} style={{background:T.redBg,border:"none",color:T.red,width:36,height:36,borderRadius:8,cursor:"pointer",fontSize:18}}>✕</button>}</div>{row.method==="Check"&&(<div style={{marginTop:10}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:5}}>Check Number</label><input type="text" value={row.checkNumber||""} placeholder="e.g. 1042" onChange={e=>updRow(i,"checkNumber",e.target.value)} style={inp({padding:"9px 12px"})}/></div>)}</div>))}<button onClick={addRow} style={{width:"100%",padding:"9px",background:"transparent",border:`1px dashed ${T.border}`,borderRadius:8,color:T.faint,cursor:"pointer",fontSize:13,marginBottom:16}}>+ Split Payment — Add Another Method</button><div style={{background:T.dark,borderRadius:12,padding:"13px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}><span style={{color:T.faint,fontSize:14}}>Total Being Recorded</span><span style={{color:T.gold,fontSize:22,fontWeight:700}}>{fmtMoney(rt)}</span></div><div style={{marginBottom:20}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:6}}>Note (optional)</label><input type="text" value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="e.g. Weekly pay…" style={inp()}/></div><div style={{display:"flex",gap:10}}><button onClick={submitPay} disabled={saving} style={{flex:2,padding:14,background:saving?T.faint:T.gold,border:"none",borderRadius:12,fontWeight:700,cursor:saving?"wait":"pointer",color:T.dark,fontSize:16}}>{saving?"Saving…":"✓ Confirm Payment"}</button><button onClick={()=>setPayModal(null)} style={{flex:1,padding:14,background:T.border,border:"none",borderRadius:12,color:"#888",cursor:"pointer"}}>Cancel</button></div></div></div></div>);})()} 

      {/* HEADER */}
      <div style={{background:T.brand,borderBottom:`1px solid ${T.brandDark}`,padding:"14px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}><Logo size={36}/><div><div style={{fontFamily:"'Inter',sans-serif",fontSize:17,fontWeight:700}}>MCX Manager</div><div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Payroll & Time System</div></div></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>{saving&&<div style={{fontSize:12,color:T.gold}}>Saving…</div>}<button onClick={()=>setScreen("home")} style={{background:T.brandDark,border:"none",color:"rgba(255,255,255,.7)",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>← Exit</button></div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",gap:2,padding:"14px 22px 0",overflowX:"auto",borderBottom:`1px solid ${T.border}`}}>
        {TABS.map(t=>(<button key={t.id} onClick={()=>setMTab(t.id)} style={{padding:"8px 16px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,whiteSpace:"nowrap",background:mTab===t.id?T.surface:"transparent",color:mTab===t.id?T.gold:T.faint,borderBottom:mTab===t.id?`2px solid ${T.gold}`:"2px solid transparent"}}>{t.l}</button>))}
      </div>

      <div style={{padding:"22px",maxWidth:960,margin:"0 auto"}}>

        {/* DASHBOARD */}
        {mTab==="dashboard"&&(<div><ClockFace now={now} dark/><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))",gap:12,marginBottom:24}}>{[{l:"Workers",v:workers.length,i:"👥"},{l:"Clocked In",v:totalIn,i:"✅",c:T.green},{l:"Weekly Hrs",v:`${totH.toFixed(1)}h`,i:"⏱"},{l:"Total Earned",v:fmtMoney(totE),i:"💵",c:T.gold},{l:"Total Paid",v:fmtMoney(totP),i:"✓",c:"#4ade80"},{l:"Outstanding",v:fmtMoney(Math.max(0,totE-totP)),i:"⚠️",c:T.red}].map(k=>(<div key={k.l} style={{background:T.surface,borderRadius:14,padding:"16px 14px",border:`1px solid ${T.border}`}}><div style={{fontSize:22,marginBottom:6}}>{k.i}</div><div style={{fontSize:22,fontWeight:700,color:k.c||"#fff",fontFamily:"Georgia,serif"}}>{k.v}</div><div style={{fontSize:11,color:T.faint,marginTop:3}}>{k.l}</div></div>))}</div><div style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,overflow:"hidden"}}><div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.faint,fontWeight:700,letterSpacing:1}}>WORKER SUMMARY</div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:540}}><thead><tr style={{background:T.dark}}>{["Name","Status","Geo","Hrs","Earned","Paid","Balance",""].map(h=><th key={h} style={{padding:"9px 14px",fontSize:11,color:T.faint,fontWeight:700,textAlign:"left"}}>{h}</th>)}</tr></thead><tbody>{workers.map((w,i)=>{const isin=ci(w.id),wh=wkHrs(w.id),e=earned$(w.id,w.rate),p=paid$(w.id),b=bal$(w.id,w.rate);return(<tr key={w.id} style={{borderTop:`1px solid ${T.border}`,background:i%2===0?T.surface:T.surfaceAlt}}><td style={{padding:"11px 14px",fontFamily:"Georgia,serif",fontSize:14,fontWeight:600}}>{w.name}</td><td style={{padding:"11px 14px"}}><span style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:isin?T.greenBg:T.border,color:isin?"#4ade80":T.faint}}>{isin?"● IN":"○ OUT"}</span></td><td style={{padding:"11px 14px",fontSize:11,color:w.geo_bypass?T.amber:T.green}}>{w.geo_bypass?"🏠 Remote":"📍 On-site"}</td><td style={{padding:"11px 14px",color:"#aaa",fontSize:13}}>{wh.toFixed(1)}h</td><td style={{padding:"11px 14px",color:T.gold,fontSize:13}}>{fmtMoney(e)}</td><td style={{padding:"11px 14px",color:"#4ade80",fontSize:13}}>{fmtMoney(p)}</td><td style={{padding:"11px 14px",fontSize:13,fontWeight:700,color:b>0?T.red:"#4ade80"}}>{fmtMoney(b)}</td><td style={{padding:"11px 14px"}}><button onClick={()=>openPay(w.id)} style={{padding:"6px 14px",background:T.gold,border:"none",borderRadius:7,color:T.dark,fontWeight:700,cursor:"pointer",fontSize:12}}>Pay</button></td></tr>);})}</tbody></table></div></div></div>)}

        {/* PAYROLL */}
        {mTab==="payroll"&&(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Payroll & Payments</h2><button onClick={()=>exportCSV({workers,entries,payments,reminders,from:dateRange.from,to:dateRange.to})} style={{padding:"9px 18px",background:T.green,border:"none",borderRadius:8,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>⬇ Export to Excel</button></div><DateRange from={dateRange.from} to={dateRange.to} onChange={setDateRange}/>{workers.map(w=>{const fe=filtE(w.id),fp=filtPay(w.id);const wh=hoursFrom(fe),e=wh*w.rate,p=fp.reduce((s,x)=>s+Number(x.amount),0),b=Math.max(0,e-p);return(<div key={w.id} style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:16}}><div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><div><div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700}}>{w.name}</div><div style={{fontSize:12,color:T.faint,marginTop:3}}>{wh.toFixed(2)} hrs · ${w.rate}/hr{(dateRange.from||dateRange.to)?" · filtered":""}</div></div><div style={{display:"flex",gap:14,alignItems:"center"}}><div style={{textAlign:"right"}}><div style={{fontSize:11,color:T.faint}}>Balance Due</div><div style={{fontSize:24,fontWeight:700,color:b>0?T.red:"#4ade80"}}>{fmtMoney(b)}</div></div><button onClick={()=>openPay(w.id)} style={{padding:"11px 22px",background:T.gold,border:"none",borderRadius:10,color:T.dark,fontWeight:700,cursor:"pointer",fontSize:14}}>Pay Worker</button></div></div><div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>{[{l:"Earned",v:fmtMoney(e),c:T.gold},{l:"Paid",v:fmtMoney(p),c:"#4ade80"},{l:"Owed",v:fmtMoney(b),c:b>0?T.red:"#4ade80"}].map((s,i)=>(<div key={s.l} style={{flex:1,padding:"12px 16px",borderRight:i<2?`1px solid ${T.border}`:"none",background:T.dark}}><div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div><div style={{fontSize:11,color:T.faint,marginTop:2}}>{s.l}</div></div>))}</div>{fp.length>0?(<div style={{padding:"14px 22px"}}><div style={{fontSize:11,color:T.faint,fontWeight:700,letterSpacing:1,marginBottom:10}}>PAYMENT HISTORY</div>{[...fp].reverse().map(pay=>(<div key={pay.id} style={{padding:"10px 0",borderBottom:`1px solid ${T.dark}`,display:"flex",justifyContent:"space-between",alignItems:"flex-start",fontSize:13}}><div style={{flex:1}}>{(pay.methods||[]).map((m,mi)=>(<span key={mi} style={{marginRight:10}}><span style={{color:T.gold,fontWeight:700}}>{m.method}</span><span style={{color:T.faint}}> {fmtMoney(m.amount)}</span>{m.method==="Check"&&m.checkNumber&&<span style={{color:T.blue}}> #{m.checkNumber}</span>}</span>))}{pay.note&&<div style={{color:T.faint,fontSize:12,marginTop:3}}>{pay.note}</div>}</div><div style={{textAlign:"right",flexShrink:0,marginLeft:16,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:5}}><div style={{color:"#4ade80",fontWeight:700}}>{fmtMoney(pay.amount)}</div><div style={{color:T.faint,fontSize:11}}>{fmtDate(pay.paid_at)}</div><button onClick={()=>deletePay(pay.id,pay.amount)} style={{padding:"3px 10px",background:T.redBg,border:`1px solid ${T.red}`,borderRadius:6,color:T.red,cursor:"pointer",fontSize:11,fontWeight:700}}>Delete</button></div></div>))}</div>):<div style={{padding:"16px 22px",color:T.faint,fontSize:13}}>No payments in this period.</div>}</div>);})}</div>)}

        {/* WORKERS */}
        {mTab==="workers"&&(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Workers</h2><button onClick={()=>{setAddingW(true);setNewW({name:"",pin:"",rate:15,email:"",phone:"",geo_bypass:false});setNewWSched(DEFAULT_SCHED);}} style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>+ Add Worker</button></div>{addingW&&(<div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.borderHi}`,marginBottom:16}}><h3 style={{margin:"0 0 14px",color:T.gold}}>New Worker</h3>{[["Full Name","name","text"],["PIN (4 digits)","pin","text"],["Hourly Rate ($)","rate","number"],["Email","email","email"],["Phone","phone","tel"]].map(([label,field,type])=>(<div key={field} style={{marginBottom:10}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label><input type={type} value={newW[field]||""} onChange={e=>setNewW(p=>({...p,[field]:e.target.value}))} style={inp()}/></div>))}<div style={{marginTop:14,marginBottom:14,padding:"12px 14px",background:T.dark,borderRadius:10,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:700}}>🏠 Remote Worker</div><div style={{fontSize:11,color:T.faint,marginTop:3}}>Bypass location check — clock in from anywhere</div></div><Toggle on={!!newW.geo_bypass} onChange={()=>setNewW(p=>({...p,geo_bypass:!p.geo_bypass}))}/></div><div style={{marginBottom:8}}><label style={{fontSize:12,color:T.faint,fontWeight:700,letterSpacing:1}}>SCHEDULE</label></div><SchedEditor schedule={newWSched} onChange={setNewWSched}/><div style={{display:"flex",gap:8,marginTop:14}}><button onClick={addWorker} disabled={saving} style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>{saving?"Saving…":"Save Worker"}</button><button onClick={()=>setAddingW(false)} style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button></div></div>)}<div style={{display:"grid",gap:10}}>{workers.map(w=>(<div key={w.id} style={{background:T.surface,borderRadius:14,padding:"14px 18px",border:`1px solid ${T.border}`}}>{editWid===w.id?(<div>{[["Name","name","text"],["PIN (4 digits)","pin","text"],["Rate ($/hr)","rate","number"],["Email","email","email"],["Phone","phone","tel"]].map(([label,field,type])=>(<div key={field} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}><label style={{fontSize:11,color:T.faint,width:90}}>{label}</label><input type={type} value={editForm[field]||""} onChange={e=>setEditForm(p=>({...p,[field]:e.target.value}))} style={{...inp({flex:1,width:"auto"})}}/></div>))}<div style={{marginTop:12,marginBottom:12,padding:"12px 14px",background:T.dark,borderRadius:10,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:13,fontWeight:700}}>🏠 Remote Worker</div><div style={{fontSize:11,color:T.faint,marginTop:3}}>Bypass location check</div></div><Toggle on={!!editForm.geo_bypass} onChange={()=>setEditForm(p=>({...p,geo_bypass:!p.geo_bypass}))}/></div><div style={{marginBottom:8}}><label style={{fontSize:12,color:T.faint,fontWeight:700,letterSpacing:1}}>SCHEDULE</label></div><SchedEditor schedule={editSched} onChange={setEditSched}/><div style={{display:"flex",gap:8,marginTop:12}}><button onClick={()=>saveEdit(w.id)} disabled={saving} style={{flex:1,padding:"8px",background:T.gold,border:"none",borderRadius:6,fontWeight:700,cursor:"pointer",color:T.dark}}>{saving?"Saving…":"Save Changes"}</button><button onClick={()=>{setEditWid(null);setEditSched(null);}} style={{flex:1,padding:"8px",background:T.border,border:"none",borderRadius:6,color:"#888",cursor:"pointer"}}>Cancel</button></div></div>):(<div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}><div style={{flex:1}}><div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700}}>{w.name}</div><div style={{fontSize:12,color:T.faint,marginTop:3}}>PIN: ••••  ·  ${w.rate}/hr{w.email?`  ·  ${w.email}`:""}</div><div style={{fontSize:11,color:T.faint,marginTop:4,opacity:.8}}>📅 {schedSummary(getSched(w))}</div><div style={{fontSize:11,marginTop:3,color:w.geo_bypass?T.amber:T.green}}>{w.geo_bypass?"🏠 Remote — location bypass ON":"📍 On-site — location required"}</div></div><div style={{display:"flex",gap:8,flexShrink:0,marginLeft:10}}><button onClick={()=>{setEditWid(w.id);setEditForm({name:w.name,pin:w.pin,rate:w.rate,email:w.email||"",phone:w.phone||"",geo_bypass:!!w.geo_bypass});setEditSched(getSched(w));}} style={{padding:"6px 14px",background:T.border,border:"none",borderRadius:6,color:"#aaa",cursor:"pointer",fontSize:13}}>Edit</button><button onClick={()=>deleteW(w.id,w.name)} style={{padding:"6px 10px",background:T.redBg,border:"none",borderRadius:6,color:T.red,cursor:"pointer",fontSize:13}}>✕</button></div></div>)}</div>))}</div></div>)}

        {/* LOGS */}
        {mTab==="logs"&&(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Clock Logs</h2><button onClick={()=>setManEntry({workerId:workers[0]?.id,date:new Date().toISOString().slice(0,10),inTime:"09:00",outTime:""})} style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>+ Manual Entry</button></div>{manEntry&&(<div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.gold}`,marginBottom:18}}><h3 style={{margin:"0 0 14px",color:T.gold}}>Manual Clock Entry</h3><div style={{marginBottom:10}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>Worker</label><select value={manEntry.workerId} onChange={e=>setManEntry(p=>({...p,workerId:e.target.value}))} style={inp()}>{workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></div>{[["Date","date","date"],["Clock In Time","inTime","time"],["Clock Out (optional)","outTime","time"]].map(([label,field,type])=>(<div key={field} style={{marginBottom:10}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label><input type={type} value={manEntry[field]} onChange={e=>setManEntry(p=>({...p,[field]:e.target.value}))} style={inp()}/></div>))}<div style={{display:"flex",gap:8,marginTop:10}}><button onClick={saveManual} disabled={saving} style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>{saving?"Saving…":"Save Entry"}</button><button onClick={()=>setManEntry(null)} style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button></div></div>)}{workers.map(w=>{const a=allE(w.id).slice().reverse();if(!a.length)return null;return(<div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,marginBottom:14,overflow:"hidden"}}><div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}><span style={{fontFamily:"Georgia,serif",fontWeight:700,fontSize:15}}>{w.name}</span><span style={{fontSize:12,color:T.faint}}>{a.length} entries</span></div>{a.map((e,i)=>(<div key={i} style={{padding:"8px 18px",borderBottom:`1px solid ${T.dark}`,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13}}><span style={{color:T.faint,minWidth:60}}>{fmtDate(e.clock_in)}</span><span style={{color:"#4ade80"}}>▲ {fmtTime(e.clock_in)}</span><span style={{color:e.clock_out?T.red:T.amber}}>{e.clock_out?`▼ ${fmtTime(e.clock_out)}`:"● Active"}</span><span style={{color:"#888"}}>{e.clock_out?`${((new Date(e.clock_out)-new Date(e.clock_in))/3600000).toFixed(2)}h`:"…"}</span>{e.manual&&<span style={{color:T.gold,fontSize:11}}>Manual</span>}<EntryMenu entry={e} workers={workers} onEdit={setEditEntry} onDelete={deleteEntry}/></div>))}</div>);})}</div>)}

        {/* SCHEDULE */}
        {mTab==="schedule"&&(<div><h2 style={{fontFamily:"Georgia,serif",fontSize:22,marginBottom:6}}>Worker Schedules</h2><p style={{color:T.faint,fontSize:13,marginBottom:20}}>Custom schedule per worker. Reminders fire based on each person's individual hours.</p>{workers.map(w=>{const sched=getSched(w),isOpen=expandSch===w.id;return(<div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${isOpen?T.gold:T.border}`,marginBottom:12,overflow:"hidden"}}><div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}} onClick={()=>{if(isOpen)setExpandSch(null);else{setExpandSch(w.id);setSchDraft(sched);}}}><div><div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700}}>{w.name}</div><div style={{fontSize:12,color:T.faint,marginTop:4}}>📅 {schedSummary(sched)}</div></div><div style={{color:T.gold,fontSize:18}}>{isOpen?"▲":"▼"}</div></div>{isOpen&&(<div style={{padding:"0 20px 20px",borderTop:`1px solid ${T.border}`}}><div style={{marginTop:16}}><SchedEditor schedule={schDraft} onChange={setSchDraft}/></div><div style={{display:"flex",gap:10,marginTop:16}}><button onClick={()=>saveSchTab(w.id)} disabled={saving} style={{flex:1,padding:"10px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark,fontSize:14}}>{saving?"Saving…":"✓ Save Schedule"}</button><button onClick={()=>setExpandSch(null)} style={{flex:1,padding:"10px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button></div></div>)}</div>);})}</div>)}

        {/* ALERTS — no export button */}
        {mTab==="alerts"&&(<div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}><h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Alerts & Reminders</h2>{reminders.length>0&&<button onClick={()=>setReminders([])} style={{background:T.border,border:"none",color:"#888",padding:"9px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>Clear All</button>}</div>{reminders.length===0?(<div style={{background:T.surface,borderRadius:14,padding:40,border:`1px solid ${T.border}`,textAlign:"center"}}><div style={{fontSize:36,marginBottom:10}}>✅</div><div style={{color:T.faint}}>No alerts. All workers are on schedule.</div></div>):(<div style={{display:"grid",gap:10}}>{reminders.slice().reverse().map(r=>(<div key={r.id} style={{background:T.amberBg,borderRadius:12,padding:"14px 18px",border:"1px solid #3a2800",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:14,color:T.amber,marginBottom:3}}>{r.msg}</div><div style={{fontSize:11,color:T.faint}}>{fmtDate(r.ts)} {fmtTime(r.ts)}</div></div><button onClick={()=>setReminders(p=>p.filter(x=>x.id!==r.id))} style={{background:"none",border:"none",color:T.faint,cursor:"pointer",fontSize:18,paddingLeft:12}}>✕</button></div>))}</div>)}</div>)}

      </div>
    </div>);
  }
  return null;
}
