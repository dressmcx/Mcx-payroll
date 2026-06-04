import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  brand:"#956342", brandDark:"#7a4f32",
  gold:"#c9a96e", dark:"#0f0a07", surface:"#1a1008", surfaceAlt:"#150d06",
  border:"#2e1e10", borderHi:"#3d2a15",
  muted:"#a07855", faint:"#6b4e35",
  green:"#16a34a", greenBg:"#052e16",
  red:"#dc2626",   redBg:"#2d0a0a",
  amber:"#f59e0b", amberBg:"#1c1000",
  blue:"#3b82f6",
};

// ─── LOGO ─────────────────────────────────────────────────────────────────────
const Logo = ({ size = 56 }) => (
  <img
    src="/logo.png"
    alt="MCX"
    width={size}
    height={size}
    style={{
      objectFit: "contain",
      display:   "block",
      background:"transparent",
    }}
  />
);

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wrxpyadnllzorrrsiawo.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_2rrfRnIMort56my_pwyg1g__epLmUgB";
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── STORE GPS ────────────────────────────────────────────────────────────────
const STORE_LAT    = 40.700706;
const STORE_LNG    = -73.949821;
const STORE_RADIUS = 200;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MANAGER_PIN_KEY = "mcx_manager_pin";
const SETTINGS_KEY    = "mcx_settings";
const PAY_METHODS  = ["Cash","Check","Zelle","Store Credit"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const DEFAULT_SCHED = {
  Sunday:   {active:false,start:"09:00",end:"19:00"},
  Monday:   {active:true, start:"09:00",end:"19:00"},
  Tuesday:  {active:true, start:"09:00",end:"19:00"},
  Wednesday:{active:true, start:"09:00",end:"19:00"},
  Thursday: {active:true, start:"09:00",end:"19:00"},
  Friday:   {active:true, start:"09:00",end:"19:00"},
  Saturday: {active:false,start:"09:00",end:"19:00"},
};

// ─── LOAD / SAVE LOCAL STORAGE ────────────────────────────────────────────────
const loadSettings = () => {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
};
const saveSettings = s => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
const loadPin = () => localStorage.getItem(MANAGER_PIN_KEY) || "0000";
const savePin = p => localStorage.setItem(MANAGER_PIN_KEY, p);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const pad       = n => String(n).padStart(2,"0");
const fmtMoney  = n => `$${Number(n||0).toFixed(2)}`;
const fmtTime   = ts => { if(!ts)return"—"; const d=new Date(ts); let h=d.getHours(),m=d.getMinutes(),ap=h>=12?"PM":"AM"; h=h%12||12; return`${h}:${pad(m)} ${ap}`; };
const fmtDate   = ts => { if(!ts)return""; const d=new Date(ts); return`${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`; };
const fmt24     = t  => { if(!t)return""; const[h,m]=t.split(":").map(Number); return`${h%12||12}:${pad(m)} ${h>=12?"PM":"AM"}`; };
const hoursFrom = list => { let t=0; for(const e of list) if(e.clock_in&&e.clock_out) t+=(new Date(e.clock_out)-new Date(e.clock_in))/3600000; return t; };
const isToday   = ts => { const d=new Date(ts),n=new Date(); return d.getDate()===n.getDate()&&d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear(); };
const getSched  = w  => { if(!w.schedule)return DEFAULT_SCHED; return typeof w.schedule==="string"?JSON.parse(w.schedule):w.schedule; };
const schedSummary = s => { const active=DAYS.filter(d=>s?.[d]?.active); if(!active.length)return"No scheduled days"; const names=active.map(d=>d.slice(0,3)).join(", "); const times=active.map(d=>`${fmt24(s[d].start)}–${fmt24(s[d].end)}`); return times.every(t=>t===times[0])?`${names}  ${times[0]}`:`${names} (varied)`; };
const geoDist   = (la1,ln1,la2,ln2) => { const R=6371000,dL=(la2-la1)*Math.PI/180,dN=(ln2-ln1)*Math.PI/180; const a=Math.sin(dL/2)**2+Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dN/2)**2; return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)); };
const useNow    = () => { const[n,s]=useState(new Date()); useEffect(()=>{const id=setInterval(()=>s(new Date()),1000);return()=>clearInterval(id);},[]);return n; };

// ─── COPY-PASTE HELPER FUNCTIONS (STEP 1 & 2) ─────────────────────────────────
const getWeekRange = (date) => {
  const d = new Date(date);
  const dayOfWeek = d.getDay();
  const diffToSunday = dayOfWeek === 0 ? 0 : dayOfWeek;
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - diffToSunday);
  sunday.setHours(0, 0, 0, 0);
  const friday = new Date(sunday);
  friday.setDate(sunday.getDate() + 5);
  friday.setHours(23, 59, 59, 999);
  return { sunday, friday, sundayStr: sunday.toISOString().slice(0, 10), fridayStr: friday.toISOString().slice(0, 10) };
};

const groupPaymentsByWeek = (payments, workerId) => {
  const workerPayments = payments.filter(p => p.worker_id === workerId);
  const weekMap = {};
  workerPayments.forEach(p => {
    const { sundayStr, fridayStr } = getWeekRange(p.paid_at);
    const key = `${sundayStr}_${fridayStr}`;
    if (!weekMap[key]) {
      weekMap[key] = { sunday: sundayStr, friday: fridayStr, payments: [], total: 0, hoursWorked: 0, hoursPaid: 0 };
    }
    weekMap[key].payments.push(p);
    weekMap[key].total += Number(p.amount);
  });
  return Object.values(weekMap).sort((a, b) => b.sunday.localeCompare(a.sunday));
};

const getHoursForRange = (entries, workerId, startStr, endStr) => {
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T23:59:59");
  const filtered = entries.filter(entry => {
    if (entry.worker_id !== workerId || !entry.clock_in) return false;
    const d = new Date(entry.clock_in);
    return d >= s && d <= e;
  });
  return hoursFrom(filtered);
};

// ─── NOTIFICATION HELPERS ─────────────────────────────────────────────────────
const sendSMS = async (settings, to, body) => {
  if (!settings.twilioSid || !settings.twilioToken || !settings.twilioFrom || !to) return;
  try {
    await sb.functions.invoke("send-sms", { body: {
      accountSid: settings.twilioSid,
      authToken:  settings.twilioToken,
      from:       settings.twilioFrom,
      to, body,
    }});
  } catch(e) { console.warn("SMS error:", e); }
};

const sendEmail = async (settings, to, subject, html) => {
  if (!settings.resendKey || !settings.resendFrom || !to) return;
  try {
    await sb.functions.invoke("send-email", { body: {
      apiKey:  settings.resendKey,
      from:    settings.resendFrom,
      to, subject, html,
    }});
  } catch(e) { console.warn("Email error:", e); }
};

const paymentEmailHtml = (workerName, amount, methods, note, appUrl="") => {
  const methodRows = (methods||[]).map(m =>
    `<tr>
      <td style="padding:8px 14px;border-bottom:1px solid #f0ece4;color:#555;font-size:14px">${m.method}</td>
      <td style="padding:8px 14px;border-bottom:1px solid #f0ece4;font-weight:700;color:#222;font-size:14px;text-align:right">
        ${fmtMoney(m.amount)}${m.checkNumber?` <span style="color:#888;font-size:12px;font-weight:400">(Check #${m.checkNumber})</span>`:""}
      </td>
    </tr>`
  ).join("");
  const logoTag = appUrl
    ? `<img src="${appUrl}/logo.png" alt="MCX" style="height:56px;object-fit:contain;display:block;margin:0 auto 10px"/>`
    : `<div style="font-family:Georgia,serif;font-size:36px;font-weight:700;color:#fff;letter-spacing:-1px">mcx</div>`;
  return `<!DOCTYPE html><html><body style="font-family:-apple-system,'Segoe UI',sans-serif;background:#f5f0eb;margin:0;padding:24px">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.10)">
  <div style="background:#956342;padding:30px 32px;text-align:center">
    ${logoTag}
    <div style="color:#fff;font-size:19px;font-weight:700;font-family:Georgia,serif;letter-spacing:.5px">Payment Confirmation</div>
  </div>
  <div style="padding:28px 32px">
    <p style="color:#555;font-size:15px;margin:0 0 20px;line-height:1.6">Hi <strong style="color:#222">${workerName}</strong>, your payment has been recorded by MCX.</p>
    <div style="background:#f9f5f0;border-radius:10px;overflow:hidden;margin-bottom:20px;border:1px solid #ece8e0">
      <div style="padding:10px 14px;background:#ece8e0;font-size:11px;color:#956342;font-weight:700;letter-spacing:1px">PAYMENT BREAKDOWN</div>
      <table style="width:100%;border-collapse:collapse">${methodRows}</table>
    </div>
    <div style="background:#956342;border-radius:10px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
      <span style="color:rgba(255,255,255,.8);font-size:14px">Total Paid</span>
      <span style="color:#fff;font-size:24px;font-weight:700">${fmtMoney(amount)}</span>
    </div>
  ${note?`<p style="color:#999;font-size:13px;margin-top:14px;font-style:italic;line-height:1.5">${note}</p>`:""}
  </div>
  <div style="padding:14px 32px;background:#f9f5f0;text-align:center;font-size:12px;color:#bbb;border-top:1px solid #ece8e0">
    MCX Payroll System &nbsp;·&nbsp; This is an automated message
  </div>
</div></body></html>`;
};

// ─── CSV EXPORT ───────────────────────────────────────────────────────────────
const exportCSV = ({workers,entries,payments,reminders,from,to}) => {
  const inRange=ts=>{const d=new Date(ts);if(from&&d<new Date(from+"T00:00:00"))return false;if(to&&d>new Date(to+"T23:59:59"))return false;return true;};
  const label=from&&to?`${from}_to_${to}`:new Date().toISOString().slice(0,10);
  const rows=[["Worker","Date","Check-in","Check-out","Hours","Rate","Gross Pay","Paid","Balance","Schedule","Methods","Check #s","Alert","Alert Time"]];
  workers.forEach(w=>{
    const we=entries.filter(e=>e.worker_id===w.id&&inRange(e.clock_in));
    const wp=payments.filter(p=>p.worker_id===w.id&&inRange(p.paid_at));
    const totalHrs=hoursFrom(we),gross=totalHrs*w.rate,paid=wp.reduce((s,p)=>s+Number(p.amount),0),bal=Math.max(0,gross-paid);
    const methods=wp.flatMap(p=>(p.methods||[]).map(m=>`${m.method} ${fmtMoney(m.amount)}`)).join(" | ");
    const checks=wp.flatMap(p=>(p.methods||[]).filter(m=>m.method==="Check"&&m.checkNumber).map(m=>`#${m.checkNumber}`)).join(", ");
    const alerts=reminders.filter(r=>r.workerId===w.id);
    we.forEach((e,i)=>{
      const entryHrs=e.clock_out?((new Date(e.clock_out)-new Date(e.clock_in))/3600000).toFixed(2):"—";
      const dateStr=fmtDate(e.clock_in);
      const inStr=fmtTime(e.clock_in);
      const outStr=e.clock_out?fmtTime(e.clock_out):"Active";
      const a=alerts[i]||null;
      rows.push([i===0?w.name:"",dateStr,inStr,outStr,entryHrs,i===0?w.rate:"",i===0?fmtMoney(gross):"",i===0?fmtMoney(paid):"",i===0?fmtMoney(bal):"",i===0?schedSummary(getSched(w)):"",i===0?methods:"",i===0?checks:"",a?a.msg:"",a?`${fmtDate(a.ts)} ${fmtTime(a.ts)}`:""]);
    });
    if(!we.length)rows.push([w.name,"—","—","—","0","","","","","","","","",""]);
    rows.push(new Array(14).fill(""));
  });
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement("a"),{href:url,download:`MCX_Payroll_${label}.csv`}).click();
  URL.revokeObjectURL(url);
};  

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────
const ClockFace = ({now,dark=false}) => {
  const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const mos=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h=now.getHours(),m=now.getMinutes(),s=now.getSeconds();
  const ap=h>=12?"PM":"AM"; h=h%12||12;
  return(
    <div style={{textAlign:"center",marginBottom:20}}>
      <div style={{fontSize:44,fontFamily:"'Courier New',monospace",fontWeight:700,color:dark?"#fff":"#0a0a0a",letterSpacing:2,lineHeight:1}}>
        {pad(h)}:{pad(m)}:{pad(s)} <span style={{fontSize:20,color:"#888"}}>{ap}</span>
      </div>
      <div style={{fontSize:13,color:"#888",marginTop:4,letterSpacing:1}}>{days[now.getDay()]}, {mos[now.getMonth()]} {now.getDate()}, {now.getFullYear()}</div>
    </div>
  );
};

const Toast = ({msg,type,onClose}) => {
  useEffect(()=>{const t=setTimeout(onClose,5000);return()=>clearTimeout(t);},[onClose]);
  const bg=type==="success"?T.green:type==="warning"?"#92400e":"#1e3a8a";
  return(
    <div style={{position:"fixed",top:20,right:20,zIndex:9999,background:bg,color:"#fff",padding:"14px 20px",borderRadius:12,maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,.5)",fontSize:14,lineHeight:1.6,animation:"toastIn .3s ease"}}>
      {msg}<button onClick={onClose} style={{marginLeft:12,background:"none",border:"none",color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:16}}>✕</button>
    </div>
  );
};

const Spinner = () => (
  <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:T.brand,flexDirection:"column",gap:16}}>
    <Logo size={80}/>
    <div style={{width:36,height:36,border:`3px solid ${T.brandDark}`,borderTop:`3px solid ${T.gold}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
    <div style={{color:"rgba(255,255,255,.5)",fontSize:13,letterSpacing:2}}>LOADING…</div>
  </div>
);

const inp = (x={}) => ({width:"100%",padding:"9px 12px",background:T.dark,border:`1px solid ${T.border}`,borderRadius:8,color:"#fff",fontSize:14,boxSizing:"border-box",...x});

const Toggle = ({on,onChange}) => (
  <div onClick={onChange} style={{width:46,height:26,borderRadius:13,background:on?T.green:T.border,position:"relative",cursor:"pointer",transition:"background .2s",flexShrink:0}}>
    <div style={{position:"absolute",top:3,left:on?22:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left .2s"}}/>
  </div>
);

const SchedEditor = ({schedule,onChange}) => {
  const s=schedule||DEFAULT_SCHED;
  return(
    <div>{DAYS.map(day=>{
      const ds=s[day]||{active:false,start:"09:00",end:"19:00"};
      return(
        <div key={day} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
          <Toggle on={ds.active} onChange={()=>onChange({...s,[day]:{...ds,active:!ds.active}})}/>
          <span style={{width:94,fontSize:13,fontWeight:600,color:ds.active?"#fff":T.faint}}>{day}</span>
          {ds.active?(
            ["start","end"].map((f,i)=>(
              <span key={f} style={{display:"flex",alignItems:"center",gap:6}}>
                {i===1&&<span style={{color:T.faint,fontSize:12}}>to</span>}
                <input type="time" value={ds[f]} onChange={e=>onChange({...s,[day]:{...ds,[f]:e.target.value}})} style={{...inp({width:116,padding:"5px 8px",flex:"none"})}}/>
              </span>
            ))
          ):<span style={{fontSize:12,color:T.faint}}>Day off</span>}
        </div>
      );
    })}</div>
  );
};

const DateRange = ({from,to,onChange}) => {
  const [activeFilter, setActiveFilter] = useState(null);
  const set=(days)=>{
    setActiveFilter(days);
    if(days===null){onChange({from:"",to:""});return;}
    const t=new Date(),s=new Date();
    if(days==="month")s.setDate(1);else s.setDate(t.getDate()-days);
    onChange({from:s.toISOString().slice(0,10),to:t.toISOString().slice(0,10)});
  };
  return(
    <div style={{background:T.surface,borderRadius:12,padding:"14px 16px",border:`1px solid ${T.border}`,marginBottom:20}}>
      <div style={{fontSize:11,color:T.faint,fontWeight:700,letterSpacing:1,marginBottom:10}}>DATE RANGE FILTER</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {[["Today",0],["Last 7 days",6],["Last 30 days",29],["This month","month"],["All time",null]].map(([l,v])=>(
          <button key={l} onClick={()=>set(v)} style={{padding:"5px 12px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:600,background:activeFilter===v?T.brand:T.border,color:activeFilter===v?"#fff":T.muted,transition:"background .15s,color .15s"}}>{l}</button>
        ))}
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        {[["From","from"],["To","to"]].map(([label,field])=>(
          <div key={field} style={{flex:1,minWidth:140}}>
            <label style={{fontSize:11,color:T.faint,display:"block",marginBottom:4}}>{label}</label>
            <input type="date" value={field==="from"?from:to} onChange={e=>onChange({from,to,...{[field]:e.target.value}})} style={inp({padding:"7px 10px"})}/>
          </div>
        ))}
      </div>
      {(from||to)&&<div style={{fontSize:12,color:T.gold,marginTop:8}}>Showing: {from?fmtDate(from+"T12:00:00"):"start"} → {to?fmtDate(to+"T12:00:00"):"now"}</div>}
    </div>
  );
};

const SettingsCard = ({title,icon,children}) => (
  <div style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,marginBottom:16,overflow:"hidden"}}>
    <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:10}}>
      <span style={{fontSize:20}}>{icon}</span>
      <span style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700}}>{title}</span>
    </div>
    <div style={{padding:"18px 20px"}}>{children}</div>
  </div>
);

const SettingsField = ({label,hint,children}) => (
  <div style={{marginBottom:14}}>
    <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:3,fontWeight:700,letterSpacing:.5}}>{label}</label>
    {hint&&<div style={{fontSize:11,color:T.faint,marginBottom:5,opacity:.7}}>{hint}</div>}
    {children}
  </div>
);

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const now = useNow();
  const [screen,     setScreen]     = useState("splash");
  const [splashOut,  setSplashOut]  = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [workers,    setWorkers]    = useState([]);
  const [entries,    setEntries]    = useState([]);
  const [payments,   setPayments]   = useState([]);
  const [activeW,    setActiveW]    = useState(null);
  const [pinBuf,     setPinBuf]     = useState("");
  const [pinTarget,  setPinTarget]  = useState(null);
  const [pinErr,     setPinErr]     = useState("");
  const [toast,      setToast]      = useState(null);
  const [mTab,       setMTab]       = useState("dashboard");
  const [saving,     setSaving]     = useState(false);
  const [editWid,    setEditWid]    = useState(null);
  const [editForm,   setEditForm]   = useState({});
  const [editSched,  setEditSched]  = useState(null);
  const [addingW,    setAddingW]    = useState(false);
  const [newW,       setNewW]       = useState({name:"",pin:"",rate:15,email:"",phone:"",geo_bypass:false});
  const [newWSched,  setNewWSched]  = useState(DEFAULT_SCHED);
  const [expandSch,  setExpandSch]  = useState(null);
  const [schDraft,   setSchDraft]   = useState({});
  const [manEntry,   setManEntry]   = useState(null);
  const [reminders,  setReminders]  = useState([]);
  const [payModal,   setPayModal]   = useState(null);
  const [payRows,    setPayRows]    = useState([{method:"Cash",amount:"",checkNumber:""}]);
  const [payNote,    setPayNote]    = useState("");
  const [dateRange,  setDateRange]  = useState({from:"",to:""});
  const [geoState,   setGeoState]   = useState({status:"idle",msg:""});
  const [logMenu,    setLogMenu]    = useState(null);
  const [editEntry,  setEditEntry]  = useState(null);

  // STEP 3: State definitions for the new calculations alert flag
  const [payHourAlert, setPayHourAlert] = useState(null);

  // Settings state
  const [managerPin,  setManagerPin]  = useState(loadPin);
  const [settings,    setSettings]    = useState(loadSettings);
  const [settingsDraft, setSettingsDraft] = useState({});
  const [pinDraft,    setPinDraft]    = useState({current:"",newPin:"",confirm:""});
  const [pinChangeMsg,setPinChangeMsg]= useState("");

  const toast$ = (msg,type="info") => setToast({msg,type});
  const CSS = `*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;font-family:-apple-system,'Segoe UI',sans-serif;background:${T.brand}}button:active{transform:scale(.97)}input:focus,select:focus{outline:1px solid ${T.gold}}@keyframes popIn{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}@keyframes riseUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}@keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}@keyframes toastIn{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}@keyframes spin{to{transform:rotate(360deg)}}::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:${T.dark}}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`;

  // Splash
  useEffect(()=>{const t1=setTimeout(()=>setSplashOut(true),2400),t2=setTimeout(()=>setScreen("loading"),3000);return()=>{clearTimeout(t1);clearTimeout(t2);};},[]);

  // Load data
  const loadAll = useCallback(async()=>{
    setLoading(true);
    const[{data:ws},{data:ce},{data:pm}]=await Promise.all([
      sb.from("workers").select("*").order("created_at"),
      sb.from("clock_entries").select("*").order("clock_in"),
      sb.from("payments").select("*").order("paid_at"),
    ]);
    setWorkers(ws||[]);setEntries(ce||[]);setPayments(pm||[]);setLoading(false);
  },[]);

  useEffect(()=>{if(screen==="loading")loadAll().then(()=>setScreen("home"));},[screen,loadAll]);

  // Realtime subscription
  useEffect(()=> {
    const ch=sb.channel("rt")
      .on("postgres_changes",{event:"*",schema:"public",table:"workers"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"clock_entries"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"payments"},()=>loadAll())
      .subscribe();
    return()=>sb.removeChannel(ch);
  },[loadAll]);

  // Reminders / Shift checking loop
  useEffect(()=>{
    const h=now.getHours(),m=now.getMinutes(),s=now.getSeconds(),dn=DAYS[now.getDay()];
    const threshold=parseInt(settings.lateThreshold)||15;
    workers.forEach(w=>{
      const ds=getSched(w)[dn];if(!ds?.active)return;
      const[sh,sm]=ds.start.split(":").map(Number),[eh,em]=ds.end.split(":").map(Number);
      if(h===sh&&m===(sm+threshold)%60&&s===0){
        if(!entries.filter(e=>e.worker_id===w.id&&isToday(e.clock_in)).some(e=>!e.clock_out)){
          const msg=`⏰ ${w.name} hasn't clocked in! Shift started at ${fmt24(ds.start)}.`;
          setReminders(r=>[...r,{id:Date.now()+w.id,workerId:w.id,msg,ts:Date.now()}]);
          toast$(msg,"warning");
          if(w.phone)sendSMS(settings,w.phone,msg);
          if(w.email)sendEmail(settings,w.email,"⏰ Late Clock-In Alert",`<p>${msg}</p>`);
        }
      }
      if(h===eh&&m===em&&s===0&&entries.find(e=>e.worker_id===w.id&&isToday(e.clock_in)&&!e.clock_out)){
        const msg=`🔔 ${w.name} is still clocked in after shift end!`;
        setReminders(r=>[...r,{id:Date.now()+w.id+1,workerId:w.id,msg,ts:Date.now()}]);
        toast$(msg,"warning");
        if(w.phone)sendSMS(settings,w.phone,msg);
        if(w.email)sendEmail(settings,w.email,"🔔 Shift End Reminder",`<p>${msg}</p>`);
      }
    });
  },[now]);

  // Data Calculation helpers
  const todayE  =wid=>entries.filter(e=>e.worker_id===wid&&isToday(e.clock_in));
  const allE    =wid=>entries.filter(e=>e.worker_id===wid);
  const ci      =wid=>todayE(wid).some(e=>!e.clock_out);
  const wkHrs   =wid=>hoursFrom(allE(wid));
  const allPay  =wid=>payments.filter(p=>p.worker_id===wid);
  const paid$   =wid=>allPay(wid).reduce((s,p)=>s+Number(p.amount),0);
  const earned$ =(wid,rate)=>wkHrs(wid)*rate;
  const bal$    =(wid,rate)=>Math.max(0,earned$(wid,rate)-paid$(wid));
  const inRange =ts=>{const d=new Date(ts);if(dateRange.from&&d<new Date(dateRange.from+"T00:00:00"))return false;if(dateRange.to&&d>new Date(dateRange.to+"T23:59:59"))return false;return true;};
  const filtE   =wid=>allE(wid).filter(e=>inRange(e.clock_in));
  const filtPay =wid=>allPay(wid).filter(p=>inRange(p.paid_at));

  // Geolocation clock-in
  const geoClockIn=async wid=>{
    const w=workers.find(x=>x.id===wid);
    if(w?.geo_bypass){await doClock(wid);return;}
    if(!navigator.geolocation){toast$("Geolocation not supported.","warning");return;}
    setGeoState({status:"checking",msg:"Checking your location…"});
    navigator.geolocation.getCurrentPosition(
      async pos=>{
        const dist=geoDist(pos.coords.latitude,pos.coords.longitude,STORE_LAT,STORE_LNG);
        if(dist<=STORE_RADIUS){
          setGeoState({status:"ok",msg:`✅ Location verified (${Math.round(dist)}m)`});
          await doClock(wid);
          setTimeout(()=>setGeoState({status:"idle",msg:""}),3000);
        }else{
          setGeoState({status:"far",msg:`📍 ${Math.round(dist)}m away. Must be within ${STORE_RADIUS}m.`});
          toast$(`❌ Too far from store (${Math.round(dist)}m).`,"warning");
        }
      },
      ()=>{setGeoState({status:"denied",msg:"Location access denied."});toast$("Location access denied.","warning");},
      {enableHighAccuracy:true,timeout:10000,maximumAge:0}
    );
  };

  const doClock=async wid=>{
    setSaving(true);
    const{error}=await sb.from("clock_entries").insert({worker_id:wid,clock_in:new Date().toISOString(),clock_out:null,note:"",manual:false});
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$(`✅ ${workers.find(w=>w.id===wid)?.name} clocked IN`,"success");}
    setSaving(false);
  };

  const clockOut=async wid=>{
    setSaving(true);
    const a=todayE(wid).find(e=>!e.clock_out);if(!a){setSaving(false);return;}
    const{error}=await sb.from("clock_entries").update({clock_out:new Date().toISOString()}).eq("id",a.id);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$(`🔴 ${workers.find(w=>w.id===wid)?.name} clocked OUT`,"info");}
    setSaving(false);
  };

  // PIN keyboard submission
  const handlePin=d=>{
    const next=pinBuf+d;setPinBuf(next);
    if(next.length===4){
      setTimeout(()=>{
        if(pinTarget==="manager"){
          if(next===managerPin){setScreen("manager");setMTab("dashboard");}
          else setPinErr("Incorrect manager PIN");
        }else{
          const w=workers.find(x=>x.id===pinTarget);
          if(w&&next===w.pin){setActiveW(w);setScreen("worker");}
          else setPinErr("Incorrect PIN");
        }
        setPinBuf("");
      },200);
    }
  };

  // Worker Profiles CRUD
  const addWorker=async()=>{
    if(!newW.name||!newW.pin||newW.pin.length!==4){toast$("Name and 4-digit PIN required","warning");return;}
    setSaving(true);
    const{error}=await sb.from("workers").insert({name:newW.name,pin:newW.pin,rate:Number(newW.rate),email:newW.email,phone:newW.phone,geo_bypass:!!newW.geo_bypass,schedule:JSON.stringify(newWSched)});
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();setAddingW(false);toast$(`✅ ${newW.name} added`,"success");}
    setSaving(false);
  };

  const saveEdit=async wid=>{
    setSaving(true);
    const{error}=await sb.from("workers").update({name:editForm.name,pin:editForm.pin,rate:Number(editForm.rate),email:editForm.email,phone:editForm.phone,geo_bypass:!!editForm.geo_bypass,schedule:JSON.stringify(editSched||DEFAULT_SCHED)}).eq("id",wid);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();setEditWid(null);setEditSched(null);toast$("✅ Worker updated","success");}
    setSaving(false);
  };

  const deleteW=async(wid,name)=>{
    if(!window.confirm(`Remove ${name}?`))return;
    setSaving(true);
    const{error}=await sb.from("workers").delete().eq("id",wid);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$(`${name} removed`,"info");}
    setSaving(false);
  };

  const saveSchTab=async wid=>{
    setSaving(true);
    const{error}=await sb.from("workers").update({schedule:JSON.stringify(schDraft)}).eq("id",wid);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();setExpandSch(null);toast$("✅ Schedule saved","success");}
    setSaving(false);
  };

  // STEP 4 & 5: Enhanced Payment Modals with Multi-Row Support and Hours Validation
  const openPay=wid=>{
    const w=workers.find(x=>x.id===wid);
    setPayModal({workerId:wid});
    setPayRows([{method:"Cash",amount:bal$(wid,w.rate)>0?bal$(wid,w.rate).toFixed(2):"",checkNumber:""}]);
    setPayNote("");
    setPayHourAlert(null);
  };

  const addRow  =()=>setPayRows(r=>[...r,{method:"Cash",amount:"",checkNumber:""}]);
  const delRow  =i=>setPayRows(r=>r.filter((_,idx)=>idx!==i));
  const updRow  =(i,f,v)=>{
    setPayRows(r=>r.map((row,idx)=>idx===i?{...row,[f]:v}:row));
    setPayHourAlert(null); // Reset alerts on type modifications
  };

  const rowTotal=()=>payRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);

  const submitPay=async()=>{
    const total=rowTotal();
    if(!total||total<=0){toast$("Enter a valid amount","warning");return;}
    const {workerId}=payModal;
    const w=workers.find(x=>x.id===workerId);
    setSaving(true);

    const methods=payRows.filter(r=>parseFloat(r.amount)>0).map(r=>({
      method:r.method,
      amount:parseFloat(r.amount),
      ...(r.method==="Check"&&r.checkNumber?{checkNumber:r.checkNumber}:{})
    }));

    const{error}=await sb.from("payments").insert({
      worker_id:workerId,
      amount:total,
      methods,
      note:payNote,
      paid_at:new Date().toISOString()
    });

    if(error){
      toast$("Error: "+error.message,"warning");
      setSaving(false);
      return;
    }
    await loadAll();

    if(w?.email){
      await sendEmail(
        settings,
        w.email,
        `💵 MCX Payment Confirmation — ${fmtMoney(total)}`,
        paymentEmailHtml(w.name,total,methods,payNote,settings.appUrl||"")
      );
    }
    if(w?.phone){
      await sendSMS(settings,w.phone,`💵 Payment Recorded: ${fmtMoney(total)} processed on ${new Date().toLocaleDateString()}. Check app/email for receipt breakdown.`);
    }

    setPayModal(null);
    setPayHourAlert(null);
    toast$("✓ Payment recorded and notifications dispatched","success");
    setSaving(false);
  };

  const deletePay=async(pid,amt)=>{
    if(!window.confirm(`Delete payment of ${fmtMoney(amt)}?`))return;
    setSaving(true);
    const{error}=await sb.from("payments").delete().eq("id",pid);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$("Payment deleted","info");}
    setSaving(false);
  };

  // Manual Clock Dashboard Admin Override Hooks
  const addManualEntry=async()=>{
    if(!manEntry.date||!manEntry.inTime) {toast$("Date and Clock In time required","warning");return;}
    setSaving(true);
    const cin=new Date(`${manEntry.date}T${manEntry.inTime}:00`).toISOString();
    const cout=manEntry.outTime?new Date(`${manEntry.date}T${manEntry.outTime}:00`).toISOString():null;
    const{error}=await sb.from("clock_entries").insert({worker_id:manEntry.workerId,clock_in:cin,clock_out:cout,note:manEntry.note||"",manual:true});
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();setManEntry(null);toast$("✅ Manual entry added","success");}
    setSaving(false);
  };

  const startEditEntry=(e)=>{
    const d=new Date(e.clock_in);
    const date=d.toISOString().slice(0,10);
    const inTime=pad(d.getHours())+":"+pad(d.getMinutes());
    let outTime="";
    if(e.clock_out){
      const doout=new Date(e.clock_out);
      outTime=pad(doout.getHours())+":"+pad(doout.getMinutes());
    }
    setEditEntry({id:e.id,workerId:e.worker_id,date,inTime,outTime});
  };

  const saveEditEntry=async()=>{
    setSaving(true);
    const cin=new Date(`${editEntry.date}T${editEntry.inTime}:00`).toISOString();
    const cout=editEntry.outTime?new Date(`${editEntry.date}T${editEntry.outTime}:00`).toISOString():null;
    const{error}=await sb.from("clock_entries").update({clock_in:cin,clock_out:cout}).eq("id",editEntry.id);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();setEditEntry(null);toast$("✅ Entry updated","success");}
    setSaving(false);
  };

  const deleteEntry=async(eid)=>{
    if(!window.confirm("Delete this clock entry?"))return;
    setSaving(true);
    const{error}=await sb.from("clock_entries").delete().eq("id",eid);
    if(error)toast$("Error: "+error.message,"warning");
    else{await loadAll();toast$("Entry deleted","info");}
    setSaving(false);
  };

  // Settings configuration handler
  const saveSettingsHandler=()=>{
    setSettings(settingsDraft);
    saveSettings(settingsDraft);
    toast$("✅ App Configuration Saved","success");
  };

  const changePinHandler=()=>{
    if(!pinDraft.current||!pinDraft.newPin||!pinDraft.confirm){setPinChangeMsg("❌ Complete all fields");return;}
    if(pinDraft.current!==managerPin){setPinChangeMsg("❌ Current PIN incorrect");return;}
    if(pinDraft.newPin.length!==4||isNaN(pinDraft.newPin)){setPinChangeMsg("❌ New PIN must be 4 digits");return;}
    if(pinDraft.newPin!==pinDraft.confirm){setPinChangeMsg("❌ Confirmation mismatch");return;}
    setManagerPin(pinDraft.newPin);
    savePin(pinDraft.newPin);
    setPinDraft({current:"",newPin:"",confirm:""});
    setPinChangeMsg("✅ Manager PIN updated successfully!");
  };

  // View UI Tree Branches
  if(screen==="splash") {
    return (
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",background:T.brand,flexDirection:"column",gap:20,transition:"opacity .6s",opacity:splashOut?0:1}}>
        <style>{CSS}</style>
        <Logo size={110}/>
        <div style={{fontFamily:"Georgia,serif",fontSize:38,fontWeight:700,color:"#fff",letterSpacing:-1,animation:"popIn .5s ease"}}>mcx</div>
        <div style={{position:"absolute",bottom:40,color:"rgba(255,255,255,.3)",fontSize:11,letterSpacing:3,fontWeight:600}}>PAYROLL HUB v2.0</div>
      </div>
    );
  }

  if(screen==="loading") return <Spinner/>;

  if(screen==="home") {
    return(
      <div style={{minHeight:"100vh",background:"#f8f6f2",display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 16px"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
        <div style={{width:"100%",maxWidth:480}}>
          <div style={{textAlign:"center",marginBottom:26}}>
            <Logo size={80}/>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:30,margin:"10px 0 4px",color:"#0a0a0a",letterSpacing:-1}}>MCX Time Clock</h1>
            <p style={{color:"#bbb",fontSize:13}}>Tap your name to clock in or out</p>
          </div>
          <ClockFace now={now}/>
          <div style={{display:"grid",gap:11,marginBottom:26}}>
            {workers.map(w=>{
              const isin=ci(w.id),th=hoursFrom(todayE(w.id));
              return(
                <button key={w.id} onClick={()=>{setPinTarget(w.id);setPinBuf("");setPinErr("");setScreen("pin");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#fff",border:isin?`2px solid ${T.green}`:"2px solid #ece8e0",borderRadius:14,padding:"14px 18px",cursor:"pointer",boxShadow:isin?"0 4px 20px rgba(22,163,74,.14)":"0 2px 8px rgba(0,0,0,.05)",transition:"all .2s"}}>
                  <div style={{display:"flex",alignItems:"center",gap:13}}>
                    <div style={{width:44,height:44,borderRadius:"50%",background:isin?"#dcfce7":"#f3f0ea",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:isin?T.green:"#999"}}>{w.name.split(" ").map(n=>n[0]).join("")}</div>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:"#0a0a0a"}}>{w.name}</div>
                      <div style={{fontSize:12,color:isin?T.green:"#ccc",marginTop:2}}>{isin?`● Clocked In · ${th.toFixed(1)}h today`:"Not clocked in"}</div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    {w.geo_bypass&&<span style={{fontSize:10,color:T.amber,background:T.amberBg,padding:"2px 7px",borderRadius:10,fontWeight:700}}>🏠 Remote</span>}
                    <div style={{padding:"5px 13px",borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:.5,background:isin?T.green:"#f0ece4",color:isin?"#fff":"#aaa"}}>{isin?"IN":"OUT"}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <button onClick={()=>{setPinTarget("manager");setPinBuf("");setPinErr("");setScreen("pin");}} style={{width:"100%",padding:16,background:T.brand,color:"#fff",border:"none",borderRadius:12,fontSize:15,fontWeight:600,cursor:"pointer",letterSpacing:.5}}>Manager Login</button>
        </div>
      </div>
    );
  }

  if(screen==="pin") {
    return(
      <div style={{minHeight:"100vh",background:T.dark,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:20}}>
        <style>{CSS}</style>
        <div style={{width:"100%",maxWidth:320,textAlign:"center"}}>
          <div style={{color:T.gold,fontSize:13,fontWeight:700,letterSpacing:2,marginBottom:8}}>{pinTarget==="manager"?"ADMIN CONTROL ACCESS":"SECURE IDENTITY KEYPAD"}</div>
          <h2 style={{fontFamily:"Georgia,serif",color:"#fff",margin:"0 0 24px",fontSize:22}}>{pinTarget==="manager"?"Enter Manager PIN":workers.find(w=>w.id===pinTarget)?.name}</h2>
          <div style={{display:"flex",justifyContent:"center",gap:16,marginBottom:30}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{width:20,height:20,borderRadius:"50%",border:`2px solid ${T.borderHi}`,background:pinBuf.length>i?T.gold:"transparent",transition:"background .1s"}}/>
            ))}
          </div>
          {pinErr&&<div style={{color:T.red,fontSize:14,marginBottom:20,fontWeight:600}}>{pinErr}</div>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
            {[1,2,3,4,5,6,7,8,9].map(d=>(
              <button key={d} onClick={()=>handlePin(String(d))} style={{height:64,borderRadius:14,background:T.surface,border:`1px solid ${T.border}`,color:"#fff",fontSize:22,fontWeight:600,cursor:"pointer"}}>{d}</button>
            ))}
            <button onClick={()=>{setPinBuf("");setPinErr("");}} style={{borderRadius:14,background:"transparent",border:"none",color:T.faint,fontSize:13,fontWeight:600,cursor:"pointer"}}>Clear</button>
            <button onClick={()=>handlePin("0")} style={{height:64,borderRadius:14,background:T.surface,border:`1px solid ${T.border}`,color:"#fff",fontSize:22,fontWeight:600,cursor:"pointer"}}>0</button>
            <button onClick={()=>{setScreen("home");setActiveW(null);}} style={{borderRadius:14,background:"transparent",border:"none",color:T.muted,fontSize:14,fontWeight:600,cursor:"pointer"}}>Cancel</button>
          </div>
        </div>
      </div>
    );
  }

  if(screen==="worker" && activeW) {
    const isin=ci(activeW.id);
    return(
      <div style={{minHeight:"100vh",background:"#f8f6f2",padding:"24px 16px"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
        <div style={{maxWidth:480,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:24}}>
            <button onClick={()=>{setScreen("home");setActiveW(null);}} style={{padding:"8px 14px",background:"#f0ece4",border:"none",borderRadius:8,color:"#666",cursor:"pointer",fontSize:13,fontWeight:600}}>← Back to Terminal</button>
            <ClockFace now={now}/>
          </div>
          <div style={{background:"#fff",borderRadius:20,padding:24,boxShadow:"0 10px 30px rgba(0,0,0,.05)",border:"1px solid #ece8e0",textAlign:"center"}}>
            <span style={{fontSize:12,fontWeight:700,color:T.brand,letterSpacing:1.5}}>WORKER ACCESS PORTAL</span>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:28,margin:"6px 0 20px",color:"#0a0a0a"}}>{activeW.name}</h2>
            {geoState.msg&&<div style={{margin:"-10px auto 16px",padding:"8px 12px",borderRadius:8,background:geoState.status==="ok"?T.greenBg:geoState.status==="far"?T.amberBg:T.dark,color:geoState.status==="ok"?T.green:geoState.status==="far"?T.amber:"#bbb",fontSize:13,fontWeight:600,maxWidth:360}}>{geoState.msg}</div>}
            
            {!isin?(
              <button onClick={()=>geoClockIn(activeW.id)} disabled={saving || geoState.status==="checking"} style={{width:"100%",padding:22,background:T.green,color:"#fff",border:"none",borderRadius:16,fontSize:22,fontWeight:700,cursor:"pointer",boxShadow:"0 8px 24px rgba(22,163,74,.25)"}}>
                {geoState.status==="checking"?"Verifying Location…":saving?"Clocking In…":"▶ CLOCK IN"}
              </button>
            ):(
              <button onClick={()=>clockOut(activeW.id)} disabled={saving} style={{width:"100%",padding:22,background:T.red,color:"#fff",border:"none",borderRadius:16,fontSize:22,fontWeight:700,cursor:"pointer",boxShadow:"0 8px 24px rgba(220,38,38,.25)"}}>
                {saving?"Clocking Out…":"■ CLOCK OUT"}
              </button>
            )}

            <div style={{marginTop:28,borderTop:"1px solid #f0ece4",paddingTop:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div style={{background:"#f9f7f4",padding:14,borderRadius:12,textAlign:"left"}}>
                <div style={{fontSize:11,color:"#aaa",fontWeight:700}}>HOURS WORKED</div>
                <div style={{fontSize:20,fontWeight:700,color:"#222",marginTop:2}}>{wkHrs(activeW.id).toFixed(2)} hrs</div>
              </div>
              <div style={{background:"#f9f7f4",padding:14,borderRadius:12,textAlign:"left"}}>
                <div style={{fontSize:11,color:"#aaa",fontWeight:700}}>UNPAID BALANCE</div>
                <div style={{fontSize:20,fontWeight:700,color:T.brand,marginTop:2}}>{fmtMoney(bal$(activeW.id,activeW.rate))}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if(screen === "manager") {
    // STEP 6: Enhanced custom multi-method execution modal block inside return statement
    return(
      <div style={{minHeight:"100vh",background:T.dark,color:"#fff",display:"flex",flexDirection:"column"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

        {/* STEP 7: Automated Multi-Row Pay Render Node */}
        {(() => {
          if (!payModal) return null;
          const w = workers.find(x => x.id === payModal.workerId);
          const rt = rowTotal();
          return (
            <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:480,border:`1px solid ${T.gold}`,padding:24,maxHeight:"90vh",overflowY:"auto"}}>
                <h3 style={{margin:"0 0 4px",color:T.gold,fontFamily:"Georgia,serif",fontSize:20}}>Record Payment</h3>
                <div style={{fontSize:14,color:T.faint,marginBottom:20}}>{w?.name} · Unpaid Balance: <strong style={{color:"#fff"}}>{fmtMoney(bal$(w.id,w.rate))}</strong></div>
                
                {/* STEP 8: Weeks lookup sub-component layout inside calculation routine module */}
                <div style={{background:T.dark,borderRadius:10,padding:12,marginBottom:16,border:`1px solid ${T.border}`}}>
                  <div style={{fontSize:11,color:T.faint,fontWeight:700,marginBottom:8}}>PREVIEW PAY BY WORK WEEK</div>
                  {groupPaymentsByWeek(payments, w.id).map(week => {
                    const hrs = getHoursForRange(entries, w.id, week.sunday, week.friday);
                    const gross = hrs * w.rate;
                    const netBal = gross - week.total;
                    return (
                      <div key={week.sunday} style={{fontSize:12,padding:"6px 0",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between"}}>
                        <div>📅 <span style={{color:"#fff",fontWeight:600}}>{fmtDate(week.sunday)}</span> to <span style={{color:"#fff",fontWeight:600}}>{fmtDate(week.friday)}</span></div>
                        <div style={{textAlign:"right"}}>
                          <div>{hrs.toFixed(1)} hrs worked ({fmtMoney(gross)})</div>
                          <div style={{color:T.gold}}>Paid: {fmtMoney(week.total)} | <span style={{color:netBal > 0 ? T.amber : T.green}}>Bal: {fmtMoney(netBal)}</span></div>
                        </div>
                      </div>
                    );
                  })}
                  {groupPaymentsByWeek(payments, w.id).length === 0 && <div style={{fontSize:12,color:T.faint}}>No historic pay ranges.</div>}
                </div>

                <div style={{maxHeight:240,overflowY:"auto",marginBottom:14,paddingRight:4}}>
                  {payRows.map((row, i) => (
                    <div key={i} style={{background:T.surfaceAlt,padding:12,borderRadius:10,marginBottom:10,border:`1px solid ${T.border}`}}>
                      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                        {PAY_METHODS.map(m => (
                          <button key={m} onClick={()=>updRow(i,"method",m)} style={{padding:"7px 14px",borderRadius:8,border:"none",cursor pointer,fontSize:13,fontWeight:700,background:row.method===m?T.gold:T.border,color:row.method===m?T.dark:"#888",transition:"all .15s"}}>{m}</button>
                        ))}
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{position:"relative",flex:1}}>
                          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.faint,fontSize:15}}>$</span>
                          <input type="number" value={row.amount} min="0" step="0.01" onChange={e=>updRow(i,"amount",e.target.value)} placeholder="0.00" style={{...inp({padding:"11px 12px 11px 26px",fontSize:16})}}/>
                        </div>
                        {payRows.length>1&&<button onClick={()=>delRow(i)} style={{background:T.redBg,border:"none",color:T.red,width:36,height:36,borderRadius:8,cursor:"pointer",fontSize:18}}>✕</button>}
                      </div>
                      {row.method==="Check"&&(
                        <div style={{marginTop:10}}>
                          <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:5}}>Check Number</label>
                          <input type="text" value={row.checkNumber||""} placeholder="e.g. 1042" onChange={e=>updRow(i,"checkNumber",e.target.value)} style={inp({padding:"9px 12px"})}/>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={addRow} style={{width:"100%",padding:"9px",background:"transparent",border:`1px dashed ${T.border}`,borderRadius:8,color:T.faint,cursor:"pointer",fontSize:13,marginBottom:16}}>+ Split — Add Another Method</button>

                {/* STEP 9: Hours Validation warning overlay context row code block */}
                {payHourAlert && (
                  <div style={{background:T.redBg,color:T.red,padding:12,borderRadius:10,fontSize:13,marginBottom:14,border:`1px solid ${T.red}`,lineHeight:1.4}}>
                    ⚠️ {payHourAlert}
                  </div>
                )}

                <div style={{background:T.dark,borderRadius:12,padding:"13px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}>
                  <span style={{color:T.faint,fontSize:14}}>Total</span>
                  <div style={{textAlign: "right"}}>
                    <span style={{color:T.gold,fontSize:22,fontWeight:700}}>{fmtMoney(rt)}</span>
                  </div>
                </div>
                
                <div style={{marginBottom:20}}>
                  <label style={{fontSize:12,color:T.faint,display:"block",marginBottom:6}}>Note (optional)</label>
                  <input type="text" value={payNote} onChange={e=>setPayNote(e.target.value)} placeholder="Weekly pay, partial, bonus…" style={inp()}/>
                </div>
                
                <div style={{display:"flex",gap:10}}>
                  <button onClick={submitPay} disabled={saving || (payHourAlert !== null)} style={{flex:2,padding:14,background:(saving || payHourAlert)?T.faint:T.gold,border:"none",borderRadius:12,fontWeight:700,cursor:(saving || payHourAlert)?"not-allowed":"pointer",color:T.dark,fontSize:16}}>{saving?"Saving…":"✓ Complete Payment"}</button>
                  <button onClick={()=>{setPayModal(null);setPayHourAlert(null);}} style={{flex:1,padding:14,background:T.border,border:"none",borderRadius:12,color:"#888",cursor:"pointer",fontSize:15}}>Cancel</button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* HEADER */}
        <div style={{background:T.brand,borderBottom:`1px solid ${T.brandDark}`,padding:"14px 22px",display:"flex",alignItems:"center(),justifyContent":"space-between",flexWrap:"wrap",gap:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Logo size={36}/>
            <h1 style={{fontFamily:"Georgia,serif",fontSize:20,margin:0,letterSpacing:-.5}}>Manager Hub</h1>
          </div>
          <div style={{display:"flex",gap:6}}>
            {[["dashboard","📊 Dashboard"],["workers","👥 Workers"],["settings","⚙️ Settings"]].map(([t,label])=>(
              <button key={t} onClick={()=>setMTab(t)} style={{padding:"8px 14px",borderRadius:8,border:"none",background:mTab===t?T.gold:transparent,color:mTab===t?T.dark:"#fff",fontSize:13,fontWeight:600,cursor:"pointer"}}>{label}</button>
            ))}
            <button onClick={()=>{setScreen("home");}} style={{padding:"8px 14px",borderRadius:8,border:"none",background:T.border,color:"#bbb",fontSize:13,fontWeight:600,cursor:"pointer",marginLeft:10}}>Exit Terminal</button>
          </div>
        </div>

        {/* TABS CONTAINER */}
        <div style={{flex:1,padding:"24px 22px",maxWidth:1024,width:"100%",margin:"0 auto"}}>
          
          {/* DASHBOARD TAB */}
          {mTab==="dashboard"&&(
            <div>
              <DateRange from={dateRange.from} to={dateRange.to} onChange={setDateRange}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div style={{fontSize:13,color:T.faint,fontWeight:700}}>WORKFORCE OVERVIEW</div>
                <button onClick={()=>exportCSV({workers,entries,payments,reminders,from:dateRange.from,to:dateRange.to})} style={{background:"transparent",border:`1px solid ${T.gold}`,color:T.gold,padding:"6px 14px",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600}}>📥 Export Full CSV Report</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:16,marginBottom:24}}>
                {workers.map(w=>{
                  const we=filtE(w.id),wp=filtPay(w.id);
                  const hrs=hoursFrom(we),gross=hrs*w.rate,paid=wp.reduce((s,p)=>s+Number(p.amount),0),bal=Math.max(0,gross-paid);
                  return(
                    <div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,padding:16}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                        <div>
                          <h3 style={{fontFamily:"Georgia,serif",margin:"0 0 4px",fontSize:18,color:"#fff"}}>{w.name}</h3>
                          <div style={{fontSize:12,color:T.faint}}>${w.rate}/hr · {schedSummary(getSched(w))}</div>
                        </div>
                        <button onClick={()=>openPay(w.id)} style={{background:T.gold,color:T.dark,border:"none",borderRadius:8,padding:"6px 12px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Pay Worker</button>
                      </div>

                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,background:T.dark,padding:10,borderRadius:10,textAlign:"center",border:`1px solid ${T.border}`}}>
                        <div><div style={{fontSize:10,color:T.faint}}>HOURS</div><div style={{fontSize:14,fontWeight:700,color:"#fff",marginTop:2}}>{hrs.toFixed(1)}h</div></div>
                        <div><div style={{fontSize:10,color:T.faint}}>PAID</div><div style={{fontSize:14,fontWeight:700,color:T.green,marginTop:2}}>{fmtMoney(paid)}</div></div>
                        <div><div style={{fontSize:10,color:T.faint}}>BALANCE</div><div style={{fontSize:14,fontWeight:700,color:bal>0?T.gold:"#666",marginTop:2}}>{fmtMoney(bal)}</div></div>
                      </div>

                      <div style={{marginTop:12,display:"flex",justifyContent:"space-between"}}>
                        <button onClick={()=>setLogMenu(logMenu===w.id?null:w.id)} style={{background:"none",border:"none",color:T.muted,fontSize:12,cursor:"pointer",padding:0}}>✏️ {logMenu===w.id?"Hide logs":"View & add logs"}</button>
                        <button onClick={()=>{setManEntry({workerId:w.id,date:new Date().toISOString().slice(0,10),inTime:"09:00",outTime:"",note:""})}} style={{background:"none",border:"none",color:T.gold,fontSize:12,cursor:"pointer",padding:0}}>+ Add Manual Log</button>
                      </div>

                      {/* WORKER LOG override window section details list sub tree panel */}
                      {logMenu===w.id&&(
                        <div style={{marginTop:14,borderTop:`1px solid ${T.border}`,paddingTop:12}}>
                          <div style={{fontSize:11,color:T.gold,fontWeight:700,marginBottom:8}}>CLOCK HISTORY (FILTERED)</div>
                          {we.map(e=>(
                            <div key={e.id} style={{fontSize:12,padding:"6px 8px",background:T.surfaceAlt,borderRadius:6,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div>
                                <span style={{fontWeight:600}}>{fmtDate(e.clock_in)}</span>: {fmtTime(e.clock_in)} → {e.clock_out?fmtTime(e.clock_out):<span style={{color:T.green}}>Active</span>}
                                {e.manual&&<span style={{color:T.amber,fontSize:10,marginLeft:6}}>✍️ Manual</span>}
                              </div>
                              <div style={{display:"flex",gap:6}}>
                                <button onClick={()=>startEditEntry(e)} style={{background:"none",border:"none",color:T.muted,cursor:"pointer"}}>Edit</button>
                                <button onClick={()=>deleteEntry(e.id)} style={{background:"none",border:"none",color:T.red,cursor:"pointer"}}>Del</button>
                              </div>
                            </div>
                          ))}
                          {we.length===0&&<div style={{fontSize:12,color:T.faint,padding:"4px 0"}}>No clocks found.</div>}

                          <div style={{fontSize:11,color:T.gold,fontWeight:700,marginTop:12,marginBottom:8}}>PAYMENT LIST (FILTERED)</div>
                          {wp.map(pay=>(
                            <div key={pay.id} style={{fontSize:12,padding:"6px 8px",background:T.surfaceAlt,borderRadius:6,marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div>💵 <span style={{fontWeight:600}}>{fmtMoney(pay.amount)}</span> on {fmtDate(pay.paid_at)}</div>
                              <button onClick={()=>deletePay(pay.id,pay.amount)} style={{background:"none(),border:none",color:T.red,cursor:"pointer",fontSize:11}}>Delete</button>
                            </div>
                          ))}
                          {wp.length===0&&<div style={{fontSize:12,color:T.faint,padding:"4px 0"}}>No record history.</div>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* WORKERS TAB */}
          {mTab==="workers"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Workers</h2>
                <button onClick={()=>{setAddingW(true);setNewW({name:"",pin:"",rate:15,email:"",phone:"",geo_bypass:false});setNewWSched(DEFAULT_SCHED);}} style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>+ Add Worker</button>
              </div>

              {addingW&&(
                <div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.borderHi}`,marginBottom:16}}>
                  <h3 style={{margin:"0 0 14px",color:T.gold}}>New Worker</h3>
                  {[["Full Name","name","text"],["PIN (4 digits)","pin","text"],["Hourly Rate ($)","rate","number"],["Email (for payment receipts)","email","email"],["Phone (for SMS alerts)","phone","tel"]].map(([label,field,type])=>(
                    <div key={field} style={{marginBottom:10}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label><input type={type} value={newW[field]||""} onChange={e=>setNewW(p=>({...p,[field]:e.target.value}))} style={inp()}/></div>
                  ))}
                  <div style={{marginTop:14,marginBottom:14,padding:"12px 14px",background:T.dark,borderRadius:10,border:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div><div style={{fontSize:13,fontWeight:700}}>🏠 Remote Worker</div><div style={{fontSize:11,color:T.faint,marginTop:3}}>Bypass location check</div></div>
                    <Toggle on={!!newW.geo_bypass} onChange={()=>setNewW(p=>({...p,geo_bypass:!p.geo_bypass}))}/>
                  </div>
                  <div style={{marginBottom:8}}><label style={{fontSize:12,color:T.faint,fontWeight:700}}>SHIFT WEEKLY SCHEDULE</label></div>
                  <SchedEditor schedule={newWSched} onChange={setNewWSched}/>
                  <div style={{display:"flex",gap:10,marginTop:18}}><button onClick={addWorker} disabled={saving} style={{flex:1,padding:12,background:T.gold,border:"none(),borderRadius:10,fontWeight:700,cursor:pointer",color:T.dark}}>{saving?"Saving…":"✓ Add Worker"}</button><button onClick={()=>setAddingW(false)} style={{padding:12,background:T.border,border:"none",borderRadius:10,color:"#888",cursor:"pointer"}}>Cancel</button></div>
                </div>
              )}

              <div style={{display:"grid",gap:12}}>
                {workers.map(w=>(
                  <div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,padding:16}}>
                    {editWid===w.id?(
                      <div>
                        {[["Name","name","text"],["PIN","pin","text"],["Rate","rate","number"],["Email","email","email"],["Phone","phone","tel"]].map(([lbl,f,t])=>(
                          <div key={f} style={{marginBottom:10}}><label style={{fontSize:11,color:T.faint}}>{lbl}</label><input type={t} value={editForm[f]||""} onChange={e=>setEditForm(p=>({...p,[f]:e.target.value}))} style={inp()}/></div>
                        ))}
                        <div style={{margin:"14px 0",padding:12,background:T.dark,borderRadius:10,display:"flex(),justifyContent:space-between,alignItems:center"}}>
                          <span style={{fontSize:13}}>🏠 Remote (Bypass Location Check)</span>
                          <Toggle on={!!editForm.geo_bypass} onChange={()=>setEditForm(p=>({...p,geo_bypass:!p.geo_bypass}))}/>
                        </div>
                        <SchedEditor schedule={editSched} onChange={setEditSched}/>
                        <div style={{display:"flex",gap:8,marginTop:14}}><button onClick={()=>saveEdit(w.id)} style={{padding:"8px 14px",background:T.gold,color:T.dark,border:"none",borderRadius:8,fontWeight:700}}>Save</button><button onClick={()=>setEditWid(null)} style={{padding:"8px 14px",background:T.border,color:"#888",border:"none",borderRadius:8}}>Cancel</button></div>
                      </div>
                    ):(
                      <div style={{display:"flex(),justifyContent:space-between,alignItems:center",flexWrap:"wrap",gap:12}}>
                        <div>
                          <div style={{fontSize:18,fontWeight:700,color:"#fff"}}>{w.name} <span style={{fontSize:12,color:T.gold,marginLeft:8}}>PIN: {w.pin}</span></div>
                          <div style={{fontSize:13,color:T.faint,marginTop:4}}>💰 ${w.rate}/hr &nbsp;·&nbsp; ✉️ {w.email||"—"} &nbsp;·&nbsp; 📱 {w.phone||"—"}</div>
                          <div style={{fontSize:12,color:T.muted,marginTop:4}}>🕒 Sched: {schedSummary(getSched(w))}</div>
                        </div>
                        <div style={{display:"flex",gap:8}}>
                          <button onClick={()=>{setEditWid(w.id);setEditForm(w);setEditSched(getSched(w));}} style={{background:T.border,border:"none",color:"#fff",padding:"7px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>Edit Profile</button>
                          <button onClick={()=>deleteW(w.id,w.name)} style={{background:T.redBg,border:"none",color:T.red,padding:"7px 12px",borderRadius:6,cursor:"pointer",fontSize:12}}>Remove</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SETTINGS CONFIGURATION MANAGEMENT TAB */}
          {mTab==="settings"&&(
            <div style={{maxWidth:600}}>
              <SettingsCard title="Store Geofencing Validation Settings" icon="📍">
                <div style={{fontSize:13,color:T.faint,marginBottom:14,lineHeight:1.6}}>Specify coordinates and geographic check-in radii for verification constraints. Remote bypass configurations disregard these metrics entirely.</div>
                <div style={{display:"flex",gap:10,marginBottom:12}}>
                  <div style={{flex:1}}><label style={{fontSize:11,color:T.faint,display:"block",marginBottom:4}}>LATITUDE</label><input type="text" value={STORE_LAT} disabled style={inp({background:T.surfaceAlt,color:"#666",cursor:"not-allowed"})}/></div>
                  <div style={{flex:1}}><label style={{fontSize:11,color:T.faint,display:"block",marginBottom:4}}>LONGITUDE</label><input type="text" value={STORE_LNG} disabled style={inp({background:T.surfaceAlt,color:"#666",cursor:"not-allowed"})}/></div>
                </div>
                <SettingsField label="VERIFICATION RADIUS (METERS)" hint="Maximum checkout alignment error threshold bound. Default is 200m.">
                  <input type="number" value={STORE_RADIUS} disabled style={inp({background:T.surfaceAlt,color:"#666",cursor:"not-allowed",width:120})}/>
                </SettingsField>
              </SettingsCard>

              <SettingsCard title="Automatic Alerts Parameters" icon="⏰">
                <SettingsField label="LATE INBOUND THRESHOLD (MINUTES)" hint="Trigger standard late reminders when active staff fall past this limit.">
                  <input type="number" value={settingsDraft.lateThreshold||15} onChange={e=>setSettingsDraft(p=>({...p,lateThreshold:e.target.value}))} style={inp({width:100})}/>
                </SettingsField>
              </SettingsCard>

              <SettingsCard title="App URL (for email logo)" icon="🌐">
                <div style={{fontSize:13,color:T.faint,marginBottom:14,lineHeight:1.6}}>Your published Vercel URL. Paste it here so the MCX logo appears correctly inside payment confirmation emails sent to workers.</div>
                <SettingsField label="YOUR VERCEL URL" hint="e.g. https://mcx-payroll.vercel.app  (no trailing slash)">
                  <input type="url" value={settingsDraft.appUrl||""} onChange={e=>setSettingsDraft(p=>({...p,appUrl:e.target.value}))} placeholder="https://your-app.vercel.app" style={inp()}/>
                </SettingsField>
              </SettingsCard>

              <div style={{display:"flex",gap:12,marginTop:6}}>
                <button onClick={saveSettingsHandler} style={{flex:1,padding:"13px",background:T.gold,border:"none",borderRadius:10,fontWeight:700,cursor:"pointer",color:T.dark,fontSize:15}}>✓ Save Settings</button>
                <button onClick={()=>setSettingsDraft({...settings})} style={{padding:"13px 20px",background:T.border,border:"none",borderRadius:10,color:"#888",cursor:"pointer",fontSize:14}}>Discard</button>
              </div>
            </div>
          )}
        </div>

        {/* EXTERNAL WINDOW POPUP ROOT PORTALS */}
        {manEntry&&(
          <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center(),justifyContent":"center",padding:16}}>
            <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:400,border:`1px solid ${T.gold}`,padding:24}}>
              <h3 style={{margin:"0 0 16px",color:T.gold,fontFamily:"Georgia,serif"}}>Add Manual Clock Entry</h3>
              {[["Shift Date","date","date"],["Clock In Time","inTime","time"],["Clock Out Time (optional)","outTime","time"]].map(([label,field,type])=>(
                <div key={field} style={{marginBottom:12}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label><input type={type} value={manEntry[field]||""} onChange={ev=>setManEntry(p=>({...p,[field]:ev.target.value}))} style={inp()}/></div>
              ))}
              <div style={{marginBottom:12}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>Internal Admin Notes</label><input type="text" value={manEntry.note||""} placeholder="e.g. Forgot to clock in" onChange={ev=>setManEntry(p=>({...p,note:ev.target.value}))} style={inp()}/></div>
              <div style={{display:"flex",gap:8,marginTop:16}}><button onClick={addManualEntry} disabled={saving} style={{flex:1,padding:"10px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,color:T.dark}}>{saving?"Saving…":"Add Entry"}</button><button onClick={()=>setManEntry(null)} style={{flex:1,padding:"10px",background:T.border,border:"none",borderRadius:8,color:"#888"}}>Cancel</button></div>
            </div>
          </div>
        )}

        {editEntry&&(
          <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:420,border:`1px solid ${T.gold}`,padding:24}}>
              <h3 style={{margin:"0 0 16px",color:T.gold,fontFamily:"Georgia,serif"}}>Edit Clock Entry</h3>
              {[["Date","date","date"],["Clock In","inTime","time"],["Clock Out (optional)","outTime","time"]].map(([label,field,type])=>(
                <div key={field} style={{marginBottom:12}}><label style={{fontSize:12,color:T.faint,display:"block",marginBottom:4}}>{label}</label><input type={type} value={editEntry[field]||""} onChange={ev=>setEditEntry(p=>({...p,[field]:ev.target.value}))} style={inp()}/></div>
              ))}
              <div style={{display:"flex",gap:8,marginTop:16}}>
                <button onClick={saveEditEntry} disabled={saving} style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>{saving?"Saving…":"Save Changes"}</button>
                <button onClick={()=>setEditEntry(null)} style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
