import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// THEME — change any color here to update the whole app
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  brand:      "#956342",
  brandDark:  "#7a4f32",
  brandLight: "#b8875e",
  gold:       "#c9a96e",
  dark:       "#0f0a07",
  surface:    "#1a1008",
  surfaceAlt: "#150d06",
  border:     "#2e1e10",
  borderHi:   "#3d2a15",
  text:       "#ffffff",
  muted:      "#a07855",
  faint:      "#6b4e35",
  green:      "#16a34a",
  greenBg:    "#052e16",
  red:        "#dc2626",
  redBg:      "#2d0a0a",
  amber:      "#f59e0b",
  amberBg:    "#1c1000",
  blue:       "#3b82f6",
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wrxpyadnllzorrrsiawo.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_2rrfRnIMort56my_pwyg1g__epLmUgB";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MANAGER_PIN  = "0000";
const PAY_METHODS  = ["Cash", "Check", "Zelle", "Store Credit"];
const DAYS         = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_SCHED = {
  Sunday:    { active:false, start:"09:00", end:"19:00" },
  Monday:    { active:true,  start:"09:00", end:"19:00" },
  Tuesday:   { active:true,  start:"09:00", end:"19:00" },
  Wednesday: { active:true,  start:"09:00", end:"19:00" },
  Thursday:  { active:true,  start:"09:00", end:"19:00" },
  Friday:    { active:true,  start:"09:00", end:"19:00" },
  Saturday:  { active:false, start:"09:00", end:"19:00" },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const pad       = (n) => String(n).padStart(2,"0");
const fmtMoney  = (n) => `$${Number(n||0).toFixed(2)}`;
const fmtTime   = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes(), ap = h>=12?"PM":"AM";
  h = h%12||12;
  return `${h}:${pad(m)} ${ap}`;
};
const fmtDate   = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
};
const fmt24     = (t) => {
  if (!t) return "";
  const [h,m] = t.split(":").map(Number);
  return `${h%12||12}:${pad(m)} ${h>=12?"PM":"AM"}`;
};
const hoursFrom = (list) => {
  let t = 0;
  for (const e of list)
    if (e.clock_in && e.clock_out)
      t += (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
  return t;
};
const isToday   = (ts) => {
  const d = new Date(ts), n = new Date();
  return d.getDate()===n.getDate() && d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear();
};
const getSched  = (w) => {
  if (!w.schedule) return DEFAULT_SCHED;
  return typeof w.schedule==="string" ? JSON.parse(w.schedule) : w.schedule;
};
const schedSummary = (s) => {
  const active = DAYS.filter(d => s?.[d]?.active);
  if (!active.length) return "No scheduled days";
  const names = active.map(d => d.slice(0,3)).join(", ");
  const times = active.map(d => `${fmt24(s[d].start)}–${fmt24(s[d].end)}`);
  return times.every(t=>t===times[0]) ? `${names}  ${times[0]}` : `${names} (varied)`;
};
const useNow = () => {
  const [now, setNow] = useState(new Date());
  useEffect(()=>{ const id=setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(id); },[]);
  return now;
};

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL / CSV EXPORT
// ─────────────────────────────────────────────────────────────────────────────
const exportExcel = ({ workers, clockEntries, payments, reminders }) => {
  const rows = [[
    "Worker Name","Total Hours","Hourly Rate","Gross Pay",
    "Total Paid","Balance Due","Schedule Summary",
    "Payment Method(s)","Check Number(s)",
    "Alert Message","Alert Time",
  ]];
  workers.forEach(w => {
    const allE   = clockEntries.filter(e=>e.worker_id===w.id);
    const allP   = payments.filter(p=>p.worker_id===w.id);
    const hrs    = hoursFrom(allE);
    const earned = hrs * w.rate;
    const paid   = allP.reduce((s,p)=>s+Number(p.amount),0);
    const bal    = Math.max(0,earned-paid);
    const sched  = getSched(w);
    const methods= allP.flatMap(p=>(p.methods||[]).map(m=>`${m.method} ${fmtMoney(m.amount)}`)).join(" | ");
    const checks = allP.flatMap(p=>(p.methods||[]).filter(m=>m.method==="Check"&&m.checkNumber).map(m=>`#${m.checkNumber}`)).join(", ");
    const alerts = reminders.filter(r=>r.workerId===w.id);
    (alerts.length ? alerts : [null]).forEach((a,i)=>{
      rows.push([
        i===0?w.name:"", i===0?hrs.toFixed(2):"",
        i===0?w.rate:"", i===0?fmtMoney(earned):"",
        i===0?fmtMoney(paid):"", i===0?fmtMoney(bal):"",
        i===0?schedSummary(sched):"", i===0?methods:"", i===0?checks:"",
        a?a.msg:"", a?`${fmtDate(a.ts)} ${fmtTime(a.ts)}`:"",
      ]);
    });
    rows.push(new Array(11).fill(""));
  });
  const csv  = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"),{href:url,download:`MCX_Payroll_${new Date().toISOString().slice(0,10)}.csv`});
  a.click();
  URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const MCXLogo = ({ size=56, light=false }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
    <ellipse cx="110" cy="90" rx="75" ry="32" transform="rotate(-30 110 90)"
      stroke={T.gold} strokeWidth="3.5" fill="none" opacity="0.75"/>
    <ellipse cx="110" cy="100" rx="55" ry="22" transform="rotate(-30 110 100)"
      stroke={T.gold} strokeWidth="2" fill="none" opacity="0.4"/>
    <text x="28" y="135" fontFamily="Georgia,serif" fontSize="88" fontWeight="700"
      fill={light?"#fff":"#0a0a0a"} letterSpacing="-2">mcx</text>
  </svg>
);

const Clock = ({ now, dark=false }) => {
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const mos=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h=now.getHours(),m=now.getMinutes(),s=now.getSeconds();
  const ap=h>=12?"PM":"AM"; h=h%12||12;
  return (
    <div style={{textAlign:"center",marginBottom:20}}>
      <div style={{fontSize:44,fontFamily:"'Courier New',monospace",fontWeight:700,
        color:dark?"#fff":"#0a0a0a",letterSpacing:2,lineHeight:1}}>
        {pad(h)}:{pad(m)}:{pad(s)} <span style={{fontSize:20,color:"#888"}}>{ap}</span>
      </div>
      <div style={{fontSize:13,color:"#888",marginTop:4,letterSpacing:1}}>
        {days[now.getDay()]}, {mos[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
      </div>
    </div>
  );
};

const Toast = ({ msg, type, onClose }) => {
  useEffect(()=>{ const t=setTimeout(onClose,4500); return ()=>clearTimeout(t); },[onClose]);
  const bg = type==="success"?T.green:type==="warning"?"#92400e":"#1e3a8a";
  return (
    <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:bg,color:"#fff",
      padding:"14px 20px",borderRadius:12,maxWidth:340,boxShadow:"0 8px 32px rgba(0,0,0,.5)",
      fontSize:14,lineHeight:1.5,animation:"toastIn .3s ease"}}>
      {msg}
      <button onClick={onClose} style={{marginLeft:12,background:"none",border:"none",
        color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:16}}>✕</button>
    </div>
  );
};

const Spinner = () => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",
    minHeight:"100vh",background:T.brand,flexDirection:"column",gap:16}}>
    <MCXLogo size={60} light/>
    <div style={{width:36,height:36,border:`3px solid ${T.brandDark}`,
      borderTop:`3px solid ${T.gold}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    <div style={{color:"rgba(255,255,255,.5)",fontSize:13,letterSpacing:2}}>LOADING…</div>
  </div>
);

const inp = (extra={}) => ({
  width:"100%",padding:"9px 12px",background:T.dark,
  border:`1px solid ${T.border}`,borderRadius:8,
  color:"#fff",fontSize:14,boxSizing:"border-box",...extra,
});

const SchedEditor = ({ schedule, onChange }) => {
  const s = schedule || DEFAULT_SCHED;
  return (
    <div>
      {DAYS.map(day => {
        const ds = s[day] || {active:false,start:"09:00",end:"19:00"};
        return (
          <div key={day} style={{display:"flex",alignItems:"center",gap:10,
            padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
            <button onClick={()=>onChange({...s,[day]:{...ds,active:!ds.active}})}
              style={{width:42,height:24,borderRadius:12,border:"none",cursor:"pointer",
                background:ds.active?T.green:T.border,position:"relative",transition:"background .2s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:ds.active?20:3,width:18,height:18,
                borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
            </button>
            <span style={{width:92,fontSize:13,fontWeight:600,color:ds.active?"#fff":T.faint}}>{day}</span>
            {ds.active ? (
              <>
                <input type="time" value={ds.start}
                  onChange={e=>onChange({...s,[day]:{...ds,start:e.target.value}})}
                  style={{...inp({width:120,padding:"5px 8px",flex:"none"})}}/>
                <span style={{color:T.faint,fontSize:13}}>to</span>
                <input type="time" value={ds.end}
                  onChange={e=>onChange({...s,[day]:{...ds,end:e.target.value}})}
                  style={{...inp({width:120,padding:"5px 8px",flex:"none"})}}/>
              </>
            ) : (
              <span style={{fontSize:12,color:T.faint}}>Day off</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const now = useNow();
  const [screen,      setScreen]      = useState("splash");
  const [splashOut,   setSplashOut]   = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [workers,     setWorkers]     = useState([]);
  const [entries,     setEntries]     = useState([]);
  const [payments,    setPayments]    = useState([]);
  const [activeW,     setActiveW]     = useState(null);
  const [pinBuf,      setPinBuf]      = useState("");
  const [pinTarget,   setPinTarget]   = useState(null);
  const [pinErr,      setPinErr]      = useState("");
  const [toast,       setToast]       = useState(null);
  const [mTab,        setMTab]        = useState("dashboard");
  const [editWid,     setEditWid]     = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [editSched,   setEditSched]   = useState(null);
  const [addingW,     setAddingW]     = useState(false);
  const [newW,        setNewW]        = useState({name:"",pin:"",rate:15,email:"",phone:""});
  const [newWSched,   setNewWSched]   = useState(DEFAULT_SCHED);
  const [manEntry,    setManEntry]    = useState(null);
  const [reminders,   setReminders]   = useState([]);
  const [payModal,    setPayModal]    = useState(null);
  const [payRows,     setPayRows]     = useState([{method:"Cash",amount:"",checkNumber:""}]);
  const [payNote,     setPayNote]     = useState("");
  const [saving,      setSaving]      = useState(false);
  const [expandSched, setExpandSched] = useState(null);
  const [schedDraft,  setSchedDraft]  = useState({});

  const toast$ = (msg,type="info") => setToast({msg,type});

  const CSS = `
    *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
    body{margin:0;font-family:-apple-system,'Segoe UI',sans-serif;background:${T.brand}}
    button:active{transform:scale(.97)}
    input:focus,select:focus{outline:1px solid ${T.gold}}
    @keyframes popIn  {from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}
    @keyframes riseUp {from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes pulse  {0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}
    @keyframes toastIn{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}
    @keyframes spin   {to{transform:rotate(360deg)}}
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-track{background:${T.dark}}
    ::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}
  `;

  // SPLASH
  useEffect(()=>{
    const t1=setTimeout(()=>setSplashOut(true),2400);
    const t2=setTimeout(()=>setScreen("loading"),3000);
    return ()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);

  // LOAD DATA
  const loadAll = useCallback(async()=>{
    setLoading(true);
    const [{data:ws},{data:ce},{data:pm}] = await Promise.all([
      sb.from("workers").select("*").order("created_at"),
      sb.from("clock_entries").select("*").order("clock_in"),
      sb.from("payments").select("*").order("paid_at"),
    ]);
    setWorkers(ws||[]); setEntries(ce||[]); setPayments(pm||[]);
    setLoading(false);
  },[]);

  useEffect(()=>{ if(screen==="loading") loadAll().then(()=>setScreen("home")); },[screen,loadAll]);

  // REALTIME
  useEffect(()=>{
    const ch = sb.channel("rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"workers"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"clock_entries"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"payments"},()=>loadAll())
      .subscribe();
    return ()=>sb.removeChannel(ch);
  },[loadAll]);

  // REMINDERS
  useEffect(()=>{
    const h=now.getHours(),m=now.getMinutes(),s=now.getSeconds();
    const todayName=DAYS[now.getDay()];
    workers.forEach(w=>{
      const sched=getSched(w), ds=sched[todayName];
      if (!ds?.active) return;
      const [sh,sm]=ds.start.split(":").map(Number);
      const [eh,em]=ds.end.split(":").map(Number);
      if (h===sh && m===sm+15 && s===0) {
        const todayIn=entries.filter(e=>e.worker_id===w.id&&isToday(e.clock_in));
        if (!todayIn.some(e=>!e.clock_out)) {
          const msg=`⏰ ${w.name} hasn't clocked in! Shift started at ${fmt24(ds.start)}.`;
          setReminders(r=>[...r,{id:Date.now()+w.id,workerId:w.id,msg,ts:Date.now()}]);
          toast$(msg,"warning");
        }
      }
      if (h===eh && m===em && s===0) {
        if (entries.find(e=>e.worker_id===w.id&&isToday(e.clock_in)&&!e.clock_out)) {
          const msg=`🔔 ${w.name} is still clocked in after shift end!`;
          setReminders(r=>[...r,{id:Date.now()+w.id+1,workerId:w.id,msg,ts:Date.now()}]);
          toast$(msg,"warning");
        }
      }
    });
  },[now]);

  // DATA HELPERS
  const todayE   = (wid)=>entries.filter(e=>e.worker_id===wid&&isToday(e.clock_in));
  const allE     = (wid)=>entries.filter(e=>e.worker_id===wid);
  const ci       = (wid)=>todayE(wid).some(e=>!e.clock_out);
  const wkHrs    = (wid)=>hoursFrom(allE(wid));
  const wkPay    = (wid)=>payments.filter(p=>p.worker_id===wid);
  const paid$    = (wid)=>wkPay(wid).reduce((s,p)=>s+Number(p.amount),0);
  const earned$  = (wid,rate)=>wkHrs(wid)*rate;
  const bal$     = (wid,rate)=>Math.max(0,earned$(wid,rate)-paid$(wid));

  // CLOCK
  const clockIn = async(wid)=>{
    setSaving(true);
    const {error}=await sb.from("clock_entries").insert({worker_id:wid,clock_in:new Date().toISOString(),clock_out:null,note:"",manual:false});
    if(error) toast$("Error: "+error.message,"warning");
    else { await loadAll(); toast$(`✅ ${workers.find(w=>w.id===wid)?.name} clocked IN at ${fmtTime(Date.now())}`,"success"); }
    setSaving(false);
  };
  const clockOut = async(wid)=>{
    setSaving(true);
    const a=todayE(wid).find(e=>!e.clock_out);
    if(!a){setSaving(false);return;}
    const {error}=await sb.from("clock_entries").update({clock_out:new Date().toISOString()}).eq("id",a.id);
    if(error) toast$("Error: "+error.message,"warning");
    else { await loadAll(); toast$(`🔴 ${workers.find(w=>w.id===wid)?.name} clocked OUT at ${fmtTime(Date.now())}`,"info"); }
    setSaving(false);
  };

  // PIN
  const handlePin = (d)=>{
    const next=pinBuf+d; setPinBuf(next);
    if(next.length===4){
      setTimeout(()=>{
        if(pinTarget==="manager"){
          if(next===MANAGER_PIN){setScreen("manager");setMTab("dashboard");}
          else setPinErr("Incorrect manager PIN");
        } else {
          const w=workers.find(x=>x.id===pinTarget);
          if(w&&next===w.pin){setActiveW(w);setScreen("worker");}
          else setPinErr("Incorrect PIN");
        }
        setPinBuf("");
      },200);
    }
  };

  // WORKER CRUD
  const addWorker = async()=>{
    if(!newW.name||!newW.pin||newW.pin.length!==4){toast$("Name and 4-digit PIN required","warning");return;}
    setSaving(true);
    const {error}=await sb.from("workers").insert({...newW,rate:Number(newW.rate),schedule:JSON.stringify(newWSched)});
    if(error) toast$("Error: "+error.message,"warning");
    else{await loadAll();setAddingW(false);toast$(`✅ ${newW.name} added`,"success");}
    setSaving(false);
  };
  const saveEdit = async(wid)=>{
    setSaving(true);
    const {error}=await sb.from("workers").update({...editForm,rate:Number(editForm.rate),schedule:JSON.stringify(editSched||DEFAULT_SCHED)}).eq("id",wid);
    if(error) toast$("Error: "+error.message,"warning");
    else{await loadAll();setEditWid(null);setEditSched(null);toast$("✅ Worker updated","success");}
    setSaving(false);
  };
  const deleteW = async(wid,name)=>{
    if(!window.confirm(`Remove ${name}? All their data will be deleted.`)) return;
    setSaving(true);
    const {error}=await sb.from("workers").delete().eq("id",wid);
    if(error) toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$(`${name} removed`,"info");}
    setSaving(false);
  };
  const saveSchedTab = async(wid)=>{
    setSaving(true);
    const {error}=await sb.from("workers").update({schedule:JSON.stringify(schedDraft)}).eq("id",wid);
    if(error) toast$("Error: "+error.message,"warning");
    else{await loadAll();setExpandSched(null);toast$("✅ Schedule saved","success");}
    setSaving(false);
  };

  // PAYMENT
  const openPay = (wid)=>{
    const w=workers.find(x=>x.id===wid);
    const b=bal$(wid,w.rate);
    setPayModal({workerId:wid});
    setPayRows([{method:"Cash",amount:b>0?b.toFixed(2):"",checkNumber:""}]);
    setPayNote("");
  };
  const addRow    = ()=>setPayRows(r=>[...r,{method:"Cash",amount:"",checkNumber:""}]);
  const delRow    = (i)=>setPayRows(r=>r.filter((_,idx)=>idx!==i));
  const updRow    = (i,f,v)=>setPayRows(r=>r.map((row,idx)=>idx===i?{...row,[f]:v}:row));
  const rowTotal  = ()=>payRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);
  const submitPay = async()=>{
    const total=rowTotal();
    if(!total||total<=0){toast$("Enter a valid amount","warning");return;}
    const {workerId}=payModal;
    setSaving(true);
    const {error}=await sb.from("payments").insert({
      worker_id:workerId, amount:total,
      methods:payRows.filter(r=>parseFloat(r.amount)>0).map(r=>({
        method:r.method, amount:parseFloat(r.amount),
        ...(r.method==="Check"&&r.checkNumber?{checkNumber:r.checkNumber}:{}),
      })),
      note:payNote, paid_at:new Date().toISOString(),
    });
    if(error) toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$(`✅ Payment of ${fmtMoney(total)} recorded`,"success");setPayModal(null);}
    setSaving(false);
  };

  // MANUAL ENTRY
  const saveManual = async()=>{
    if(!manEntry) return;
    const {workerId,date,inTime,outTime}=manEntry;
    setSaving(true);
    const {error}=await sb.from("clock_entries").insert({
      worker_id:workerId,
      clock_in:new Date(`${date}T${inTime}`).toISOString(),
      clock_out:outTime?new Date(`${date}T${outTime}`).toISOString():null,
      note:"Manual entry",manual:true,
    });
    if(error) toast$("Error: "+error.message,"warning");
    else{await loadAll();setManEntry(null);toast$("✅ Manual entry saved","success");}
    setSaving(false);
  };

  // ── SPLASH ──
  if(screen==="splash") return (
    <div style={{minHeight:"100vh",background:T.brand,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",gap:18,
      opacity:splashOut?0:1,transition:"opacity .6s ease"}}>
      <style>{CSS}</style>
      <div style={{animation:"popIn .7s cubic-bezier(.34,1.56,.64,1) both"}}><MCXLogo size={130} light/></div>
      <div style={{fontFamily:"Georgia,serif",fontSize:30,color:"#fff",letterSpacing:3,animation:"riseUp .8s .3s both"}}>MCX Time Clock</div>
      <div style={{fontSize:12,color:"rgba(255,255,255,.5)",letterSpacing:4,animation:"riseUp .8s .55s both"}}>PROFESSIONAL PAYROLL SYSTEM</div>
      <div style={{marginTop:24,display:"flex",gap:6,animation:"riseUp .8s .8s both"}}>
        {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.gold,animation:`pulse 1.2s ${i*.2}s infinite`}}/>)}
      </div>
    </div>
  );

  if(screen==="loading"||loading) return <><style>{CSS}</style><Spinner/></>;

  // ── PIN ──
  if(screen==="pin") return (
    <div style={{minHeight:"100vh",background:"#f8f6f2",display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:24,position:"relative"}}>
      <style>{CSS}</style>
      <button onClick={()=>{setScreen("home");setPinBuf("");setPinErr("");}}
        style={{position:"absolute",top:24,left:24,background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#bbb"}}>←</button>
      <MCXLogo size={50}/>
      <h2 style={{fontFamily:"Georgia,serif",fontSize:24,margin:"14px 0 4px",color:"#0a0a0a"}}>
        {pinTarget==="manager"?"Manager Login":workers.find(w=>w.id===pinTarget)?.name}
      </h2>
      <p style={{color:"#aaa",fontSize:13,marginBottom:24}}>
        {pinTarget==="manager"?"Enter manager PIN":"Enter your 4-digit PIN"}
      </p>
      <div style={{display:"flex",gap:14,marginBottom:24}}>
        {[0,1,2,3].map(i=><div key={i} style={{width:18,height:18,borderRadius:"50%",
          background:i<pinBuf.length?"#0a0a0a":"#ddd",transition:"background .15s"}}/>)}
      </div>
      {pinErr&&<div style={{color:T.red,fontSize:13,marginBottom:12,background:"#fef2f2",padding:"6px 16px",borderRadius:6}}>{pinErr}</div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,width:240}}>
        {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
          <button key={i} onClick={()=>{if(d==="⌫"){setPinBuf(p=>p.slice(0,-1));setPinErr("");}else if(d!=="")handlePin(String(d));}}
            disabled={d===""} style={{height:64,borderRadius:12,border:"none",
              background:d===""?"transparent":d==="⌫"?"#f0ece4":"#fff",
              color:"#0a0a0a",fontSize:22,fontWeight:600,cursor:d===""?"default":"pointer",
              boxShadow:d===""||d==="⌫"?"none":"0 2px 10px rgba(0,0,0,.08)"}}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );

  // ── HOME ──
  if(screen==="home") return (
    <div style={{minHeight:"100vh",background:"#f8f6f2",display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 16px"}}>
      <style>{CSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div style={{width:"100%",maxWidth:480}}>
        <div style={{textAlign:"center",marginBottom:26}}>
          <MCXLogo size={80}/>
          <h1 style={{fontFamily:"Georgia,serif",fontSize:30,margin:"10px 0 4px",color:"#0a0a0a",letterSpacing:-1}}>MCX Time Clock</h1>
          <p style={{color:"#bbb",fontSize:13}}>Tap your name to clock in or out</p>
        </div>
        <Clock now={now}/>
        <div style={{display:"grid",gap:11,marginBottom:26}}>
          {workers.map(w=>{
            const isin=ci(w.id), th=hoursFrom(todayE(w.id));
            return (
              <button key={w.id} onClick={()=>{setPinTarget(w.id);setPinBuf("");setPinErr("");setScreen("pin");}}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",
                  border:isin?`2px solid ${T.green}`:"2px solid #ece8e0",borderRadius:14,padding:"14px 18px",
                  cursor:"pointer",boxShadow:isin?"0 4px 20px rgba(22,163,74,.14)":"0 2px 8px rgba(0,0,0,.05)",transition:"all .2s"}}>
                <div style={{display:"flex",alignItems:"center",gap:13}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:isin?"#dcfce7":"#f3f0ea",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:isin?T.green:"#999"}}>
                    {w.name.split(" ").map(n=>n[0]).join("")}
                  </div>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:"#0a0a0a"}}>{w.name}</div>
                    <div style={{fontSize:12,color:isin?T.green:"#ccc",marginTop:2}}>
                      {isin?`● Clocked In · ${th.toFixed(1)}h today`:"Not clocked in"}
                    </div>
                  </div>
                </div>
                <div style={{padding:"5px 13px",borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:.5,
                  background:isin?T.green:"#f0ece4",color:isin?"#fff":"#aaa"}}>{isin?"IN":"OUT"}</div>
              </button>
            );
          })}
        </div>
        <button onClick={()=>{setPinTarget("manager");setPinBuf("");setPinErr("");setScreen("pin");}}
          style={{width:"100%",padding:16,background:T.brand,color:"#fff",border:"none",
            borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",letterSpacing:.5}}>
          Manager Login
        </button>
      </div>
    </div>
  );

  // ── WORKER ──
  if(screen==="worker"&&activeW){
    const isin=ci(activeW.id), te=todayE(activeW.id);
    const th=hoursFrom(te), wh=wkHrs(activeW.id);
    const active=te.find(e=>!e.clock_out);
    const ds=getSched(activeW)[DAYS[now.getDay()]];
    return (
      <div style={{minHeight:"100vh",background:isin?"#f0fdf4":"#f8f6f2",display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 16px",position:"relative"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
        <button onClick={()=>{setScreen("home");setActiveW(null);}}
          style={{position:"absolute",top:24,left:24,background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#bbb"}}>←</button>
        <div style={{width:"100%",maxWidth:380,textAlign:"center"}}>
          <MCXLogo size={46}/>
          <div style={{width:88,height:88,borderRadius:"50%",margin:"16px auto 10px",
            background:isin?"#dcfce7":"#f3f0ea",display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:30,fontWeight:700,color:isin?T.green:"#aaa",border:isin?`3px solid ${T.green}`:"3px solid #e5e0d5"}}>
            {activeW.name.split(" ").map(n=>n[0]).join("")}
          </div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:24,margin:"0 0 4px",color:"#0a0a0a"}}>{activeW.name}</h2>
          <div style={{fontSize:13,color:isin?T.green:"#ccc",marginBottom:18,fontWeight:600}}>
            {isin?`● CLOCKED IN since ${fmtTime(active?.clock_in)}`:"○ NOT CLOCKED IN"}
          </div>
          <Clock now={now}/>
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            {[{l:"Today",v:`${th.toFixed(2)}h`},{l:"This Week",v:`${wh.toFixed(2)}h`},{l:"Est. Pay",v:fmtMoney(wh*activeW.rate)}].map(s=>(
              <div key={s.l} style={{flex:1,background:"#fff",borderRadius:12,padding:"12px 8px",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:17,fontWeight:700,color:"#0a0a0a"}}>{s.v}</div>
                <div style={{fontSize:11,color:"#bbb",marginTop:2}}>{s.l}</div>
              </div>
            ))}
          </div>
          {ds?.active&&(
            <div style={{background:"#fff",borderRadius:12,padding:"10px 16px",marginBottom:20,
              fontSize:13,color:"#888",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              🕒 Today's shift: <strong style={{color:"#0a0a0a"}}>{fmt24(ds.start)} – {fmt24(ds.end)}</strong>
            </div>
          )}
          {!isin?(
            <button onClick={()=>clockIn(activeW.id)} disabled={saving}
              style={{width:"100%",padding:20,background:saving?"#aaa":T.green,color:"#fff",border:"none",
                borderRadius:16,fontSize:20,fontWeight:700,cursor:saving?"wait":"pointer",
                boxShadow:"0 8px 28px rgba(22,163,74,.38)",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
              <span style={{fontSize:26}}>●</span>{saving?"Saving…":"CLOCK IN"}
            </button>
          ):(
            <button onClick={()=>clockOut(activeW.id)} disabled={saving}
              style={{width:"100%",padding:20,background:saving?"#aaa":T.red,color:"#fff",border:"none",
                borderRadius:16,fontSize:20,fontWeight:700,cursor:saving?"wait":"pointer",
                boxShadow:"0 8px 28px rgba(220,38,38,.38)",display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
              <span style={{fontSize:26}}>■</span>{saving?"Saving…":"CLOCK OUT"}
            </button>
          )}
          {te.length>0&&(
            <div style={{marginTop:20,background:"#fff",borderRadius:12,padding:16,textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#0a0a0a",letterSpacing:.5}}>TODAY'S LOG</div>
              {te.map((e,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:"1px solid #f3f0ea",fontSize:13}}>
                  <span style={{color:T.green}}>▲ {fmtTime(e.clock_in)}</span>
                  <span style={{color:e.clock_out?T.red:T.amber}}>{e.clock_out?`▼ ${fmtTime(e.clock_out)}`:"● Active"}</span>
                  <span style={{color:"#aaa"}}>{e.clock_out?`${((new Date(e.clock_out)-new Date(e.clock_in))/3600000).toFixed(2)}h`:"…"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── MANAGER ──
  if(screen==="manager"){
    const totalIn    = workers.filter(w=>ci(w.id)).length;
    const totEarned  = workers.reduce((s,w)=>s+earned$(w.id,w.rate),0);
    const totPaid    = workers.reduce((s,w)=>s+paid$(w.id),0);
    const totHrs     = workers.reduce((s,w)=>s+wkHrs(w.id),0);
    const TABS=[
      {id:"dashboard",l:"Dashboard"},{id:"payroll",l:"Payroll"},{id:"workers",l:"Workers"},
      {id:"logs",l:"Logs"},{id:"schedule",l:"Schedule"},
      {id:"alerts",l:`Alerts${reminders.length>0?` (${reminders.length})`:""}`},
    ];

    return (
      <div style={{minHeight:"100vh",background:T.dark,color:"#fff"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

        {/* PAYMENT MODAL */}
        {payModal&&(()=>{
          const w=workers.find(x=>x.id===payModal.workerId);
          const b=bal$(w.id,w.rate), rt=rowTotal();
          return (
            <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",
              display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:T.surface,borderRadius:20,width:"100%",maxWidth:500,
                border:`1px solid ${T.gold}`,maxHeight:"92vh",overflowY:"auto"}}>
                <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:21,fontWeight:700}}>Record Payment</div>
                    <div style={{fontSize:13,color:T.muted,marginTop:3}}>{w.name}</div>
                  </div>
                  <button onClick={()=>setPayModal(null)}
                    style={{background:T.border,border:"none",color:"#888",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:18}}>✕</button>
                </div>
                <div style={{padding:"20px 24px"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>
                    {[{l:"Earned",v:fmtMoney(earned$(w.id,w.rate)),c:T.gold},
                      {l:"Paid",v:fmtMoney(paid$(w.id)),c:"#4ade80"},
                      {l:"Balance",v:fmtMoney(b),c:b>0?T.red:"#4ade80"}].map(s=>(
                      <div key={s.l} style={{background:T.dark,borderRadius:12,padding:"13px 10px",textAlign:"center",border:`1px solid ${T.border}`}}>
                        <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div>
                        <div style={{fontSize:11,color:T.faint,marginTop:3}}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:T.faint,fontWeight:700,letterSpacing:1,marginBottom:10}}>PAYMENT METHOD(S)</div>
                  {payRows.map((row,i)=>(
                    <div key={i} style={{marginBottom:12,padding:"12px 14px",background:T.dark,borderRadius:10,border:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        {PAY_METHODS.map(m=>(
                          <button key={m} onClick={()=>updRow(i,"method",m)}
                            style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,
                              background:row.method===m?T.gold:T.border,color:row.method===m?T.dark:"#888",transition:"all .15s"}}>{m}</button>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{position:"relative",flex:1}}>
                          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.faint,fontSize:15}}>$</span>
                          <input type="number" value={row.amount} min="0" step="0.01"
                            onChange={e=>updRow(i,"amount",e.target.value)} placeholder="0.00"
                            style={{...inp({padding:"11px 12px 11px 26px",fontSize:16})}}/>
                        </div>
                        {payRows.length>1&&<button onClick={()=>delRow(i)}
                          style={{background:T.redBg,border:"none",color:T.red,width:36,height:36,borderRadius:8,cursor:"pointer",fontSize:18}}>✕</button>}
                      </div>
                      {row.method==="Check"&&(
                        <div style={{marginTop:10}}>
                          <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:5}}>Check Number</label>
                          <input type="text" value={row.checkNumber||""} placeholder="e.g. 1042"
                            onChange={e=>updRow(i,"checkNumber",e.target.value)} style={inp({padding:"9px 12px"})}/>
                        </div>
                      )}
                    </div>
                  ))}
                  <button onClick={addRow}
                    style={{width:"100%",padding:"9px",background:"transparent",border:`1px dashed ${T.border}`,
                      borderRadius:8,color:T.faint,cursor:"pointer",fontSize:13,marginBottom:16}}>
                    + Split Payment — Add Another Method
                  </button>
                  <div style={{background:T.dark,borderRadius:12,padding:"13px 18px",marginBottom:16,
                    display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}>
                    <span style={{color:T.faint,fontSize:14}}>Total Being Recorded</span>
                    <span style={{color:T.gold,fontSize:22,fontWeight:700}}>{fmtMoney(rt)}</span>
                  </div>
                  <div style={{marginBottom:20}}>
                    <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:6}}>Note (optional)</label>
                    <input type="text" value={payNote} onChange={e=>setPayNote(e.target.value)}
                      placeholder="e.g. Weekly pay, partial, bonus…" style={inp()}/>
                  </div>
                  <div style={{display:"flex",gap:10}}>
                    <button onClick={submitPay} disabled={saving}
                      style={{flex:2,padding:14,background:saving?T.faint:T.gold,border:"none",
                        borderRadius:12,fontWeight:700,cursor:saving?"wait":"pointer",color:T.dark,fontSize:16}}>
                      {saving?"Saving…":"✓ Confirm Payment"}
                    </button>
                    <button onClick={()=>setPayModal(null)}
                      style={{flex:1,padding:14,background:T.border,border:"none",borderRadius:12,color:"#888",cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* HEADER */}
        <div style={{background:T.brand,borderBottom:`1px solid ${T.brandDark}`,padding:"14px 22px",
          display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <MCXLogo size={36} light/>
            <div>
              <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700}}>MCX Manager</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,.5)"}}>Payroll & Time System</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            {saving&&<div style={{fontSize:12,color:T.gold}}>Saving…</div>}
            <button onClick={()=>setScreen("home")}
              style={{background:T.brandDark,border:"none",color:"rgba(255,255,255,.7)",padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>← Exit</button>
          </div>
        </div>

        {/* TABS */}
        <div style={{display:"flex",gap:2,padding:"14px 22px 0",overflowX:"auto",borderBottom:`1px solid ${T.border}`}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setMTab(t.id)}
              style={{padding:"8px 16px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",
                fontSize:13,fontWeight:600,whiteSpace:"nowrap",
                background:mTab===t.id?T.surface:"transparent",
                color:mTab===t.id?T.gold:T.faint,
                borderBottom:mTab===t.id?`2px solid ${T.gold}`:"2px solid transparent"}}>
              {t.l}
            </button>
          ))}
        </div>

        <div style={{padding:"22px",maxWidth:960,margin:"0 auto"}}>

          {/* DASHBOARD */}
          {mTab==="dashboard"&&(
            <div>
              <Clock now={now} dark/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(148px,1fr))",gap:12,marginBottom:24}}>
                {[{l:"Workers",v:workers.length,i:"👥"},{l:"Clocked In",v:totalIn,i:"✅",c:T.green},
                  {l:"Weekly Hrs",v:`${totHrs.toFixed(1)}h`,i:"⏱"},{l:"Total Earned",v:fmtMoney(totEarned),i:"💵",c:T.gold},
                  {l:"Total Paid",v:fmtMoney(totPaid),i:"✓",c:"#4ade80"},{l:"Outstanding",v:fmtMoney(Math.max(0,totEarned-totPaid)),i:"⚠️",c:T.red},
                ].map(k=>(
                  <div key={k.l} style={{background:T.surface,borderRadius:14,padding:"16px 14px",border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:22,marginBottom:6}}>{k.i}</div>
                    <div style={{fontSize:22,fontWeight:700,color:k.c||"#fff",fontFamily:"Georgia,serif"}}>{k.v}</div>
                    <div style={{fontSize:11,color:T.faint,marginTop:3}}>{k.l}</div>
                  </div>
                ))}
              </div>
              <div style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.faint,fontWeight:700,letterSpacing:1}}>WORKER SUMMARY</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:520}}>
                    <thead><tr style={{background:T.dark}}>
                      {["Name","Status","Hrs","Earned","Paid","Balance",""].map(h=>(
                        <th key={h} style={{padding:"9px 14px",fontSize:11,color:T.faint,fontWeight:700,textAlign:"left"}}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {workers.map((w,i)=>{
                        const isin=ci(w.id),wh=wkHrs(w.id),e=earned$(w.id,w.rate),p=paid$(w.id),b=bal$(w.id,w.rate);
                        return (
                          <tr key={w.id} style={{borderTop:`1px solid ${T.border}`,background:i%2===0?T.surface:T.surfaceAlt}}>
                            <td style={{padding:"11px 14px",fontFamily:"Georgia,serif",fontSize:14,fontWeight:600}}>{w.name}</td>
                            <td style={{padding:"11px 14px"}}>
                              <span style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,
                                background:isin?T.greenBg:T.border,color:isin?"#4ade80":T.faint}}>
                                {isin?"● IN":"○ OUT"}
                              </span>
                            </td>
                            <td style={{padding:"11px 14px",color:"#aaa",fontSize:13}}>{wh.toFixed(1)}h</td>
                            <td style={{padding:"11px 14px",color:T.gold,fontSize:13}}>{fmtMoney(e)}</td>
                            <td style={{padding:"11px 14px",color:"#4ade80",fontSize:13}}>{fmtMoney(p)}</td>
                            <td style={{padding:"11px 14px",fontSize:13,fontWeight:700,color:b>0?T.red:"#4ade80"}}>{fmtMoney(b)}</td>
                            <td style={{padding:"11px 14px"}}>
                              <button onClick={()=>openPay(w.id)}
                                style={{padding:"6px 14px",background:T.gold,border:"none",borderRadius:7,color:T.dark,fontWeight:700,cursor:"pointer",fontSize:12}}>Pay</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* PAYROLL */}
          {mTab==="payroll"&&(
            <div>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:22,marginBottom:20}}>Payroll & Payments</h2>
              {workers.map(w=>{
                const wh=wkHrs(w.id),e=earned$(w.id,w.rate),p=paid$(w.id),b=bal$(w.id,w.rate);
                const hist=wkPay(w.id).slice().reverse();
                return (
                  <div key={w.id} style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden",marginBottom:16}}>
                    <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                      <div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700}}>{w.name}</div>
                        <div style={{fontSize:12,color:T.faint,marginTop:3}}>{wh.toFixed(2)} hrs · ${w.rate}/hr</div>
                      </div>
                      <div style={{display:"flex",gap:14,alignItems:"center"}}>
                        <div style={{textAlign:"right"}}>
                          <div style={{fontSize:11,color:T.faint}}>Balance Due</div>
                          <div style={{fontSize:24,fontWeight:700,color:b>0?T.red:"#4ade80"}}>{fmtMoney(b)}</div>
                        </div>
                        <button onClick={()=>openPay(w.id)}
                          style={{padding:"11px 22px",background:T.gold,border:"none",borderRadius:10,color:T.dark,fontWeight:700,cursor:"pointer",fontSize:14}}>Pay Worker</button>
                      </div>
                    </div>
                    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
                      {[{l:"Earned",v:fmtMoney(e),c:T.gold},{l:"Paid",v:fmtMoney(p),c:"#4ade80"},{l:"Owed",v:fmtMoney(b),c:b>0?T.red:"#4ade80"}].map((s,i)=>(
                        <div key={s.l} style={{flex:1,padding:"12px 16px",borderRight:i<2?`1px solid ${T.border}`:"none",background:T.dark}}>
                          <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:11,color:T.faint,marginTop:2}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                    {hist.length>0?(
                      <div style={{padding:"14px 22px"}}>
                        <div style={{fontSize:11,color:T.faint,fontWeight:700,letterSpacing:1,marginBottom:10}}>PAYMENT HISTORY</div>
                        {hist.map(pay=>(
                          <div key={pay.id} style={{padding:"10px 0",borderBottom:`1px solid ${T.dark}`,display:"flex",justifyContent:"space-between",fontSize:13}}>
                            <div>
                              {(pay.methods||[]).map((m,mi)=>(
                                <span key={mi} style={{marginRight:10}}>
                                  <span style={{color:T.gold,fontWeight:700}}>{m.method}</span>
                                  <span style={{color:T.faint}}> {fmtMoney(m.amount)}</span>
                                  {m.method==="Check"&&m.checkNumber&&<span style={{color:T.blue}}> #{m.checkNumber}</span>}
                                </span>
                              ))}
                              {pay.note&&<div style={{color:T.faint,fontSize:12,marginTop:3}}>{pay.note}</div>}
                            </div>
                            <div style={{textAlign:"right",flexShrink:0,marginLeft:16}}>
                              <div style={{color:"#4ade80",fontWeight:700}}>{fmtMoney(pay.amount)}</div>
                              <div style={{color:T.faint,fontSize:11,marginTop:2}}>{fmtDate(pay.paid_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ):<div style={{padding:"16px 22px",color:T.faint,fontSize:13}}>No payments recorded yet.</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* WORKERS */}
          {mTab==="workers"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Workers</h2>
                <button onClick={()=>{setAddingW(true);setNewW({name:"",pin:"",rate:15,email:"",phone:""});setNewWSched(DEFAULT_SCHED);}}
                  style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>+ Add Worker</button>
              </div>
              {addingW&&(
                <div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.borderHi}`,marginBottom:16}}>
                  <h3 style={{margin:"0 0 14px",color:T.gold}}>New Worker</h3>
                  {[["Full Name","name","text"],["PIN (4 digits)","pin","text"],["Hourly Rate ($)","rate","number"],["Email","email","email"],["Phone","phone","tel"]].map(([label,field,type])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label>
                      <input type={type} value={newW[field]} onChange={e=>setNewW(p=>({...p,[field]:e.target.value}))} style={inp()}/>
                    </div>
                  ))}
                  <div style={{marginTop:16,marginBottom:8}}>
                    <label style={{fontSize:12,color:T.faint,fontWeight:700,letterSpacing:1}}>SCHEDULE</label>
                  </div>
                  <SchedEditor schedule={newWSched} onChange={setNewWSched}/>
                  <div style={{display:"flex",gap:8,marginTop:14}}>
                    <button onClick={addWorker} disabled={saving}
                      style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>
                      {saving?"Saving…":"Save Worker"}</button>
                    <button onClick={()=>setAddingW(false)}
                      style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              )}
              <div style={{display:"grid",gap:10}}>
                {workers.map(w=>(
                  <div key={w.id} style={{background:T.surface,borderRadius:14,padding:"14px 18px",border:`1px solid ${T.border}`}}>
                    {editWid===w.id?(
                      <div>
                        {[["Name","name","text"],["PIN (4 digits)","pin","text"],["Rate ($/hr)","rate","number"],["Email","email","email"],["Phone","phone","tel"]].map(([label,field,type])=>(
                          <div key={field} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <label style={{fontSize:11,color:T.faint,width:90}}>{label}</label>
                            <input type={type} value={editForm[field]||""} onChange={e=>setEditForm(p=>({...p,[field]:e.target.value}))} style={{...inp({flex:1,width:"auto"})}}/>
                          </div>
                        ))}
                        <div style={{marginTop:14,marginBottom:8}}>
                          <label style={{fontSize:12,color:T.faint,fontWeight:700,letterSpacing:1}}>SCHEDULE</label>
                        </div>
                        <SchedEditor schedule={editSched} onChange={setEditSched}/>
                        <div style={{display:"flex",gap:8,marginTop:12}}>
                          <button onClick={()=>saveEdit(w.id)} disabled={saving}
                            style={{flex:1,padding:"8px",background:T.gold,border:"none",borderRadius:6,fontWeight:700,cursor:"pointer",color:T.dark}}>
                            {saving?"Saving…":"Save Changes"}</button>
                          <button onClick={()=>{setEditWid(null);setEditSched(null);}}
                            style={{flex:1,padding:"8px",background:T.border,border:"none",borderRadius:6,color:"#888",cursor:"pointer"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700}}>{w.name}</div>
                          <div style={{fontSize:12,color:T.faint,marginTop:3}}>PIN: ••••  ·  ${w.rate}/hr{w.email?`  ·  ${w.email}`:""}</div>
                          <div style={{fontSize:11,color:T.faint,marginTop:4,opacity:.7}}>📅 {schedSummary(getSched(w))}</div>
                        </div>
                        <div style={{display:"flex",gap:8,flexShrink:0,marginLeft:10}}>
                          <button onClick={()=>{setEditWid(w.id);setEditForm({name:w.name,pin:w.pin,rate:w.rate,email:w.email||"",phone:w.phone||""});setEditSched(getSched(w));}}
                            style={{padding:"6px 14px",background:T.border,border:"none",borderRadius:6,color:"#aaa",cursor:"pointer",fontSize:13}}>Edit</button>
                          <button onClick={()=>deleteW(w.id,w.name)}
                            style={{padding:"6px 10px",background:T.redBg,border:"none",borderRadius:6,color:T.red,cursor:"pointer",fontSize:13}}>✕</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* LOGS */}
          {mTab==="logs"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Clock Logs</h2>
                <button onClick={()=>setManEntry({workerId:workers[0]?.id,date:new Date().toISOString().slice(0,10),inTime:"09:00",outTime:""})}
                  style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>+ Manual Entry</button>
              </div>
              {manEntry&&(
                <div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.gold}`,marginBottom:18}}>
                  <h3 style={{margin:"0 0 14px",color:T.gold}}>Manual Clock Entry</h3>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>Worker</label>
                    <select value={manEntry.workerId} onChange={e=>setManEntry(p=>({...p,workerId:e.target.value}))} style={inp()}>
                      {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  {[["Date","date","date"],["Clock In Time","inTime","time"],["Clock Out (optional)","outTime","time"]].map(([label,field,type])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label>
                      <input type={type} value={manEntry[field]} onChange={e=>setManEntry(p=>({...p,[field]:e.target.value}))} style={inp()}/>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={saveManual} disabled={saving}
                      style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>
                      {saving?"Saving…":"Save Entry"}</button>
                    <button onClick={()=>setManEntry(null)}
                      style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              )}
              {workers.map(w=>{
                const a=allE(w.id).slice().reverse();
                if(!a.length) return null;
                return (
                  <div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,marginBottom:14,overflow:"hidden"}}>
                    <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}>
                      <span style={{fontFamily:"Georgia,serif",fontWeight:700,fontSize:15}}>{w.name}</span>
                      <span style={{fontSize:12,color:T.faint}}>{a.length} entries</span>
                    </div>
                    {a.map((e,i)=>(
                      <div key={i} style={{padding:"10px 18px",borderBottom:`1px solid ${T.dark}`,display:"flex",justifyContent:"space-between",fontSize:13}}>
                        <span style={{color:T.faint}}>{fmtDate(e.clock_in)}</span>
                        <span style={{color:"#4ade80"}}>▲ {fmtTime(e.clock_in)}</span>
                        <span style={{color:e.clock_out?T.red:T.amber}}>{e.clock_out?`▼ ${fmtTime(e.clock_out)}`:"● Active"}</span>
                        <span style={{color:"#888"}}>{e.clock_out?`${((new Date(e.clock_out)-new Date(e.clock_in))/3600000).toFixed(2)}h`:"…"}</span>
                        {e.manual&&<span style={{color:T.gold,fontSize:11}}>Manual</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* SCHEDULE */}
          {mTab==="schedule"&&(
            <div>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:22,marginBottom:6}}>Worker Schedules</h2>
              <p style={{color:T.faint,fontSize:13,marginBottom:20}}>Set a custom schedule per worker. Reminders fire based on each worker's individual hours.</p>
              {workers.map(w=>{
                const sched=getSched(w), isOpen=expandSched===w.id;
                return (
                  <div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${isOpen?T.gold:T.border}`,marginBottom:12,overflow:"hidden"}}>
                    <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                      onClick={()=>{ if(isOpen){setExpandSched(null);}else{setExpandSched(w.id);setSchedDraft(sched);} }}>
                      <div>
                        <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700}}>{w.name}</div>
                        <div style={{fontSize:12,color:T.faint,marginTop:4}}>📅 {schedSummary(sched)}</div>
                      </div>
                      <div style={{color:T.gold,fontSize:18}}>{isOpen?"▲":"▼"}</div>
                    </div>
                    {isOpen&&(
                      <div style={{padding:"0 20px 20px",borderTop:`1px solid ${T.border}`}}>
                        <div style={{marginTop:16}}><SchedEditor schedule={schedDraft} onChange={setSchedDraft}/></div>
                        <div style={{display:"flex",gap:10,marginTop:16}}>
                          <button onClick={()=>saveSchedTab(w.id)} disabled={saving}
                            style={{flex:1,padding:"10px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark,fontSize:14}}>
                            {saving?"Saving…":"✓ Save Schedule"}</button>
                          <button onClick={()=>setExpandSched(null)}
                            style={{flex:1,padding:"10px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ALERTS */}
          {mTab==="alerts"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Alerts & Reminders</h2>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>exportExcel({workers,clockEntries:entries,payments,reminders})}
                    style={{padding:"9px 18px",background:T.green,border:"none",borderRadius:8,color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13}}>
                    ⬇ Export to Excel
                  </button>
                  {reminders.length>0&&(
                    <button onClick={()=>setReminders([])}
                      style={{background:T.border,border:"none",color:"#888",padding:"9px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>Clear All</button>
                  )}
                </div>
              </div>
              {reminders.length===0?(
                <div style={{background:T.surface,borderRadius:14,padding:40,border:`1px solid ${T.border}`,textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:10}}>✅</div>
                  <div style={{color:T.faint}}>No alerts. All workers are on schedule.</div>
                  <div style={{fontSize:13,color:T.faint,marginTop:10,opacity:.6}}>Use Export to Excel above for a full payroll report anytime.</div>
                </div>
              ):(
                <div style={{display:"grid",gap:10}}>
                  {reminders.slice().reverse().map(r=>(
                    <div key={r.id} style={{background:T.amberBg,borderRadius:12,padding:"14px 18px",
                      border:"1px solid #3a2800",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:14,color:T.amber,marginBottom:3}}>{r.msg}</div>
                        <div style={{fontSize:11,color:T.faint}}>{fmtDate(r.ts)} {fmtTime(r.ts)}</div>
                      </div>
                      <button onClick={()=>setReminders(p=>p.filter(x=>x.id!==r.id))}
                        style={{background:"none",border:"none",color:T.faint,cursor:"pointer",fontSize:18,paddingLeft:12}}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    );
  }

  return null;
}
