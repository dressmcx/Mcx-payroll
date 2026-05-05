import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// THEME / DESIGN TOKENS  ← change any value here to update the whole app
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  brand:        "#956342",   // primary brand / background color
  brandDark:    "#7a4f32",   // darker shade for hover / borders
  brandLight:   "#b8875e",   // lighter tint
  gold:         "#c9a96e",   // accent gold
  dark:         "#0f0a07",   // deepest dark (was pure black)
  surface:      "#1a1008",   // card background
  surfaceAlt:   "#150d06",   // alternate row
  border:       "#2e1e10",   // subtle border
  borderBright: "#3d2a15",   // brighter border
  text:         "#ffffff",
  textMuted:    "#a07855",
  textFaint:    "#6b4e35",
  green:        "#16a34a",
  greenBg:      "#052e16",
  red:          "#dc2626",
  redBg:        "#2d0a0a",
  amber:        "#f59e0b",
  amberBg:      "#1c1000",
  blue:         "#3b82f6",
};

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://fhizktontdsgzpeeaxyh.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_TIuO7fd0NDW8OwBphR6Mkw_JnIFeaea";
const sb           = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const MANAGER_PIN = "0000";
const PAY_METHODS = ["Cash", "Check", "Zelle", "Store Credit"];
const DAYS_OF_WEEK = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// Default schedule applied when a worker has no custom schedule set
const DEFAULT_SCHEDULE = {
  Sunday:    { active: false, start: "09:00", end: "19:00" },
  Monday:    { active: true,  start: "09:00", end: "19:00" },
  Tuesday:   { active: true,  start: "09:00", end: "19:00" },
  Wednesday: { active: true,  start: "09:00", end: "19:00" },
  Thursday:  { active: true,  start: "09:00", end: "19:00" },
  Friday:    { active: true,  start: "09:00", end: "19:00" },
  Saturday:  { active: false, start: "09:00", end: "19:00" },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const pad      = (n) => String(n).padStart(2, "0");
const fmtMoney = (n) => `$${Number(n || 0).toFixed(2)}`;

const fmtTime = (ts) => {
  if (!ts) return "—";
  const d = new Date(ts);
  let h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${pad(m)} ${ap}`;
};

const fmtDate = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
};

const fmtTime24toDisplay = (t24) => {
  if (!t24) return "";
  const [h, m] = t24.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${pad(m)} ${ap}`;
};

const hoursFromEntries = (list) => {
  let t = 0;
  for (const e of list)
    if (e.clock_in && e.clock_out)
      t += (new Date(e.clock_out) - new Date(e.clock_in)) / 3600000;
  return t;
};

const isToday = (ts) => {
  const d = new Date(ts), n = new Date();
  return d.getDate()===n.getDate() && d.getMonth()===n.getMonth() && d.getFullYear()===n.getFullYear();
};

const useNow = () => {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
};

// Summarise a worker's schedule as a short readable string
const schedSummary = (sched) => {
  const active = DAYS_OF_WEEK.filter(d => sched?.[d]?.active);
  if (!active.length) return "No scheduled days";
  const short = active.map(d => d.slice(0,3)).join(", ");
  const times = active.map(d => `${fmtTime24toDisplay(sched[d].start)}–${fmtTime24toDisplay(sched[d].end)}`);
  const allSame = times.every(t => t === times[0]);
  return allSame ? `${short}  ${times[0]}` : short + " (varied)";
};

// ─────────────────────────────────────────────────────────────────────────────
// EXCEL EXPORT  (pure JS, no external lib needed)
// ─────────────────────────────────────────────────────────────────────────────
const exportToExcel = ({ workers, clockEntries, payments, reminders }) => {
  // Build CSV rows (opens perfectly in Excel)
  const rows = [];

  // Header
  rows.push([
    "Worker Name", "Total Hours", "Hourly Rate", "Gross Pay",
    "Total Paid", "Balance Due",
    "Schedule Summary",
    "Payment Method(s)", "Check Number(s)",
    "Alert Message", "Alert Timestamp",
  ]);

  workers.forEach(w => {
    const allE    = clockEntries.filter(e => e.worker_id === w.id);
    const allP    = payments.filter(p => p.worker_id === w.id);
    const hrs     = hoursFromEntries(allE);
    const earned  = hrs * w.rate;
    const paid    = allP.reduce((s,p)=>s+Number(p.amount),0);
    const bal     = Math.max(0, earned - paid);
    const sched   = w.schedule ? (typeof w.schedule==="string" ? JSON.parse(w.schedule) : w.schedule) : DEFAULT_SCHEDULE;
    const schedStr= schedSummary(sched);

    const methodStr = allP.flatMap(p =>
      (p.methods||[]).map(m => `${m.method} ${fmtMoney(m.amount)}`)
    ).join(" | ");

    const checkNums = allP.flatMap(p =>
      (p.methods||[]).filter(m=>m.method==="Check"&&m.checkNumber).map(m=>`#${m.checkNumber}`)
    ).join(", ");

    const workerAlerts = reminders.filter(r => r.workerId === w.id);

    if (workerAlerts.length === 0) {
      rows.push([
        w.name, hrs.toFixed(2), w.rate, fmtMoney(earned),
        fmtMoney(paid), fmtMoney(bal),
        schedStr, methodStr, checkNums,
        "", "",
      ]);
    } else {
      workerAlerts.forEach((alert, i) => {
        rows.push([
          i===0 ? w.name : "",
          i===0 ? hrs.toFixed(2) : "",
          i===0 ? w.rate : "",
          i===0 ? fmtMoney(earned) : "",
          i===0 ? fmtMoney(paid) : "",
          i===0 ? fmtMoney(bal) : "",
          i===0 ? schedStr : "",
          i===0 ? methodStr : "",
          i===0 ? checkNums : "",
          alert.msg,
          fmtDate(alert.ts) + " " + fmtTime(alert.ts),
        ]);
      });
    }

    // Blank separator row
    rows.push(new Array(11).fill(""));
  });

  // Convert to CSV string
  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(",")
  ).join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `MCX_Payroll_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

// ─────────────────────────────────────────────────────────────────────────────
// SHARED UI COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
const MCXLogo = ({ size = 56, light = false }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
    <ellipse cx="110" cy="90" rx="75" ry="32" transform="rotate(-30 110 90)"
      stroke={T.gold} strokeWidth="3.5" fill="none" opacity="0.75"/>
    <ellipse cx="110" cy="100" rx="55" ry="22" transform="rotate(-30 110 100)"
      stroke={T.gold} strokeWidth="2" fill="none" opacity="0.4"/>
    <text x="28" y="135" fontFamily="Georgia, serif" fontSize="88" fontWeight="700"
      fill={light ? "#fff" : "#0a0a0a"} letterSpacing="-2">mcx</text>
  </svg>
);

const ClockWidget = ({ now, dark = false }) => {
  const days   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
  const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return (
    <div style={{ textAlign:"center", marginBottom:20 }}>
      <div style={{ fontSize:44, fontFamily:"'Courier New',monospace", fontWeight:700,
        color: dark ? "#fff" : "#0a0a0a", letterSpacing:2, lineHeight:1 }}>
        {pad(h)}:{pad(m)}:{pad(s)} <span style={{fontSize:20,color:"#888"}}>{ap}</span>
      </div>
      <div style={{ fontSize:13, color:"#888", marginTop:4, letterSpacing:1 }}>
        {days[now.getDay()]}, {months[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
      </div>
    </div>
  );
};

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  const bg = type==="success" ? T.green : type==="warning" ? "#92400e" : "#1e3a8a";
  return (
    <div style={{ position:"fixed", top:20, right:20, zIndex:9999, background:bg,
      color:"#fff", padding:"14px 20px", borderRadius:12, maxWidth:340,
      boxShadow:"0 8px 32px rgba(0,0,0,.5)", fontSize:14, lineHeight:1.5,
      animation:"toastIn .3s cubic-bezier(.34,1.2,.64,1)" }}>
      {msg}
      <button onClick={onClose} style={{marginLeft:12,background:"none",border:"none",
        color:"rgba(255,255,255,.6)",cursor:"pointer",fontSize:16}}>✕</button>
    </div>
  );
};

const Spinner = () => (
  <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
    minHeight:"100vh", background:T.brand, flexDirection:"column", gap:16 }}>
    <MCXLogo size={60} light/>
    <div style={{ width:36, height:36, border:`3px solid ${T.brandDark}`,
      borderTop:`3px solid ${T.gold}`, borderRadius:"50%",
      animation:"spin 1s linear infinite" }}/>
    <div style={{ color:"rgba(255,255,255,.5)", fontSize:13, letterSpacing:2 }}>LOADING…</div>
  </div>
);

// Input style helper for dark forms
const inp = (extra={}) => ({
  width:"100%", padding:"9px 12px", background:T.dark,
  border:`1px solid ${T.border}`, borderRadius:8,
  color:"#fff", fontSize:14, boxSizing:"border-box", ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// WORKER SCHEDULE EDITOR  (per-worker, full week)
// ─────────────────────────────────────────────────────────────────────────────
const ScheduleEditor = ({ schedule, onChange }) => {
  const sched = schedule || DEFAULT_SCHEDULE;
  return (
    <div>
      {DAYS_OF_WEEK.map(day => {
        const ds = sched[day] || { active:false, start:"09:00", end:"19:00" };
        return (
          <div key={day} style={{ display:"flex", alignItems:"center", gap:10,
            padding:"8px 0", borderBottom:`1px solid ${T.border}` }}>
            {/* Toggle */}
            <button onClick={() => onChange({...sched, [day]:{...ds, active:!ds.active}})}
              style={{ width:42, height:24, borderRadius:12, border:"none", cursor:"pointer",
                background: ds.active ? T.green : T.border,
                position:"relative", transition:"background .2s", flexShrink:0 }}>
              <div style={{ position:"absolute", top:3, left: ds.active?20:3,
                width:18, height:18, borderRadius:"50%", background:"#fff",
                transition:"left .2s" }}/>
            </button>
            <span style={{ width:90, fontSize:13, fontWeight:600,
              color: ds.active ? "#fff" : T.textFaint }}>{day}</span>
            {ds.active ? (
              <>
                <input type="time" value={ds.start}
                  onChange={e => onChange({...sched, [day]:{...ds,start:e.target.value}})}
                  style={{...inp({width:120, padding:"5px 8px"}), flex:"none"}}/>
                <span style={{color:T.textFaint, fontSize:13}}>to</span>
                <input type="time" value={ds.end}
                  onChange={e => onChange({...sched, [day]:{...ds,end:e.target.value}})}
                  style={{...inp({width:120, padding:"5px 8px"}), flex:"none"}}/>
              </>
            ) : (
              <span style={{fontSize:12, color:T.textFaint}}>Day off</span>
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

  const [screen,       setScreen]       = useState("splash");
  const [splashOut,    setSplashOut]    = useState(false);
  const [loading,      setLoading]      = useState(true);

  // Supabase data
  const [workers,      setWorkers]      = useState([]);
  const [clockEntries, setClockEntries] = useState([]);
  const [payments,     setPayments]     = useState([]);

  // UI
  const [activeWorker, setActiveWorker] = useState(null);
  const [pinBuf,       setPinBuf]       = useState("");
  const [pinTarget,    setPinTarget]    = useState(null);
  const [pinErr,       setPinErr]       = useState("");
  const [toast,        setToast]        = useState(null);
  const [mTab,         setMTab]         = useState("dashboard");
  const [editWid,      setEditWid]      = useState(null);
  const [editForm,     setEditForm]     = useState({});
  const [editSched,    setEditSched]    = useState(null);   // schedule being edited in Workers tab
  const [addingW,      setAddingW]      = useState(false);
  const [newW,         setNewW]         = useState({name:"",pin:"",rate:15,email:"",phone:""});
  const [newWSched,    setNewWSched]    = useState(DEFAULT_SCHEDULE);
  const [manEntry,     setManEntry]     = useState(null);
  const [reminders,    setReminders]    = useState([]);
  const [payModal,     setPayModal]     = useState(null);
  const [payRows,      setPayRows]      = useState([{method:"Cash",amount:"",checkNumber:""}]);
  const [payNote,      setPayNote]      = useState("");
  const [saving,       setSaving]       = useState(false);

  // Schedule tab — which worker's schedule is expanded
  const [expandedSchedWid, setExpandedSchedWid] = useState(null);
  const [schedDraft,       setSchedDraft]       = useState({});

  const showToast = (msg, type="info") => setToast({msg, type});

  // ── SPLASH ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t1 = setTimeout(() => setSplashOut(true), 2400);
    const t2 = setTimeout(() => setScreen("loading"), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  // ── LOAD DATA ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const [{ data: ws }, { data: ce }, { data: pm }] = await Promise.all([
      sb.from("workers").select("*").order("created_at"),
      sb.from("clock_entries").select("*").order("clock_in"),
      sb.from("payments").select("*").order("paid_at"),
    ]);
    setWorkers(ws || []);
    setClockEntries(ce || []);
    setPayments(pm || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (screen === "loading") loadAll().then(() => setScreen("home"));
  }, [screen, loadAll]);

  // ── REAL-TIME ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const ch = sb.channel("realtime-all")
      .on("postgres_changes",{event:"*",schema:"public",table:"workers"},      ()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"clock_entries"},()=>loadAll())
      .on("postgres_changes",{event:"*",schema:"public",table:"payments"},     ()=>loadAll())
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [loadAll]);

  // ── REMINDERS ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
    const todayName = DAYS_OF_WEEK[now.getDay()];

    workers.forEach(w => {
      const sched = w.schedule
        ? (typeof w.schedule==="string" ? JSON.parse(w.schedule) : w.schedule)
        : DEFAULT_SCHEDULE;
      const ds = sched[todayName];
      if (!ds?.active) return;

      const [startH, startM] = ds.start.split(":").map(Number);
      const [endH,   endM  ] = ds.end.split(":").map(Number);

      // Late clock-in: 15 min after their scheduled start
      if (h === startH && m === startM + 15 && s === 0) {
        const todayIn = clockEntries.filter(e => e.worker_id===w.id && isToday(e.clock_in));
        if (!todayIn.some(e => !e.clock_out)) {
          const msg = `⏰ ${w.name} hasn't clocked in! Shift started at ${fmtTime24toDisplay(ds.start)}.`;
          setReminders(r => [...r, {id:Date.now()+w.id, workerId:w.id, msg, ts:Date.now()}]);
          showToast(msg, "warning");
        }
      }
      // Forgot to clock out
      if (h === endH && m === endM && s === 0) {
        const active = clockEntries.find(e => e.worker_id===w.id && isToday(e.clock_in) && !e.clock_out);
        if (active) {
          const msg = `🔔 ${w.name} is still clocked in! Shift ended at ${fmtTime24toDisplay(ds.end)}.`;
          setReminders(r => [...r, {id:Date.now()+w.id+1, workerId:w.id, msg, ts:Date.now()}]);
          showToast(msg, "warning");
        }
      }
    });
  }, [now]);

  // ── DATA HELPERS ──────────────────────────────────────────────────────────
  const workerTodayEntries = (wid) => clockEntries.filter(e => e.worker_id===wid && isToday(e.clock_in));
  const workerAllEntries   = (wid) => clockEntries.filter(e => e.worker_id===wid);
  const isClockedIn        = (wid) => workerTodayEntries(wid).some(e => !e.clock_out);
  const weeklyHrs          = (wid) => hoursFromEntries(workerAllEntries(wid));
  const workerPayments     = (wid) => payments.filter(p => p.worker_id===wid);
  const totalPaid          = (wid) => workerPayments(wid).reduce((s,p)=>s+Number(p.amount),0);
  const weeklyOwed         = (wid,rate) => weeklyHrs(wid)*rate;
  const balanceDue         = (wid,rate) => Math.max(0, weeklyOwed(wid,rate)-totalPaid(wid));
  const getSchedule        = (w) => w.schedule
    ? (typeof w.schedule==="string" ? JSON.parse(w.schedule) : w.schedule)
    : DEFAULT_SCHEDULE;

  // ── CLOCK ─────────────────────────────────────────────────────────────────
  const clockIn = async (wid) => {
    setSaving(true);
    const { error } = await sb.from("clock_entries").insert({
      worker_id:wid, clock_in:new Date().toISOString(), clock_out:null, note:"", manual:false,
    });
    if (error) showToast("Error clocking in: "+error.message,"warning");
    else { await loadAll(); showToast(`✅ ${workers.find(w=>w.id===wid)?.name} clocked IN at ${fmtTime(Date.now())}`,"success"); }
    setSaving(false);
  };

  const clockOut = async (wid) => {
    setSaving(true);
    const active = workerTodayEntries(wid).find(e=>!e.clock_out);
    if (!active) { setSaving(false); return; }
    const { error } = await sb.from("clock_entries").update({clock_out:new Date().toISOString()}).eq("id",active.id);
    if (error) showToast("Error clocking out: "+error.message,"warning");
    else { await loadAll(); showToast(`🔴 ${workers.find(w=>w.id===wid)?.name} clocked OUT at ${fmtTime(Date.now())}`,"info"); }
    setSaving(false);
  };

  // ── PIN ───────────────────────────────────────────────────────────────────
  const handlePin = (d) => {
    const next = pinBuf + d;
    setPinBuf(next);
    if (next.length === 4) {
      setTimeout(() => {
        if (pinTarget==="manager") {
          if (next===MANAGER_PIN) { setScreen("manager"); setMTab("dashboard"); }
          else setPinErr("Incorrect manager PIN");
        } else {
          const w = workers.find(x=>x.id===pinTarget);
          if (w && next===w.pin) { setActiveWorker(w); setScreen("worker"); }
          else setPinErr("Incorrect PIN");
        }
        setPinBuf("");
      }, 200);
    }
  };

  // ── WORKER CRUD ───────────────────────────────────────────────────────────
  const addWorker = async () => {
    if (!newW.name || !newW.pin || newW.pin.length!==4) {
      showToast("Name and 4-digit PIN required","warning"); return;
    }
    setSaving(true);
    const { error } = await sb.from("workers").insert({
      name:newW.name, pin:newW.pin, rate:Number(newW.rate),
      email:newW.email, phone:newW.phone,
      schedule: JSON.stringify(newWSched),
    });
    if (error) showToast("Error: "+error.message,"warning");
    else { await loadAll(); setAddingW(false); showToast(`✅ ${newW.name} added`,"success"); }
    setSaving(false);
  };

  const saveWorkerEdit = async (wid) => {
    setSaving(true);
    const { error } = await sb.from("workers").update({
      name:editForm.name, pin:editForm.pin, rate:Number(editForm.rate),
      email:editForm.email, phone:editForm.phone,
      schedule: JSON.stringify(editSched || DEFAULT_SCHEDULE),
    }).eq("id",wid);
    if (error) showToast("Error: "+error.message,"warning");
    else { await loadAll(); setEditWid(null); setEditSched(null); showToast("✅ Worker updated","success"); }
    setSaving(false);
  };

  const deleteWorker = async (wid,name) => {
    if (!window.confirm(`Remove ${name}? This will also delete all their clock entries and payments.`)) return;
    setSaving(true);
    const { error } = await sb.from("workers").delete().eq("id",wid);
    if (error) showToast("Error: "+error.message,"warning");
    else { await loadAll(); showToast(`${name} removed`,"info"); }
    setSaving(false);
  };

  // Save schedule from Schedule tab
  const saveScheduleFromTab = async (wid) => {
    setSaving(true);
    const { error } = await sb.from("workers")
      .update({ schedule: JSON.stringify(schedDraft) })
      .eq("id", wid);
    if (error) showToast("Error: "+error.message,"warning");
    else { await loadAll(); setExpandedSchedWid(null); showToast("✅ Schedule saved","success"); }
    setSaving(false);
  };

  // ── PAYMENT ───────────────────────────────────────────────────────────────
  const openPayModal = (wid) => {
    const w   = workers.find(x=>x.id===wid);
    const bal = balanceDue(wid,w.rate);
    setPayModal({workerId:wid});
    setPayRows([{method:"Cash", amount: bal>0 ? bal.toFixed(2) : "", checkNumber:""}]);
    setPayNote("");
  };
  const addPayRow    = () => setPayRows(r=>[...r,{method:"Cash",amount:"",checkNumber:""}]);
  const removePayRow = (i) => setPayRows(r=>r.filter((_,idx)=>idx!==i));
  const updatePayRow = (i,f,v) => setPayRows(r=>r.map((row,idx)=>idx===i?{...row,[f]:v}:row));
  const payRowTotal  = () => payRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0);

  const submitPayment = async () => {
    const total = payRowTotal();
    if (!total||total<=0) { showToast("Enter a valid amount","warning"); return; }
    const {workerId} = payModal;
    setSaving(true);
    const { error } = await sb.from("payments").insert({
      worker_id: workerId,
      amount: total,
      methods: payRows
        .filter(r=>parseFloat(r.amount)>0)
        .map(r=>({
          method: r.method,
          amount: parseFloat(r.amount),
          ...(r.method==="Check" && r.checkNumber ? {checkNumber: r.checkNumber} : {}),
        })),
      note: payNote,
      paid_at: new Date().toISOString(),
    });
    if (error) showToast("Error: "+error.message,"warning");
    else { await loadAll(); showToast(`✅ Payment of ${fmtMoney(total)} recorded`,"success"); setPayModal(null); }
    setSaving(false);
  };

  // ── MANUAL ENTRY ──────────────────────────────────────────────────────────
  const saveManEntry = async () => {
    if (!manEntry) return;
    const {workerId,date,inTime,outTime} = manEntry;
    const inTs  = new Date(`${date}T${inTime}`).toISOString();
    const outTs = outTime ? new Date(`${date}T${outTime}`).toISOString() : null;
    setSaving(true);
    const { error } = await sb.from("clock_entries").insert({
      worker_id:workerId, clock_in:inTs, clock_out:outTs, note:"Manual entry", manual:true,
    });
    if (error) showToast("Error: "+error.message,"warning");
    else { await loadAll(); setManEntry(null); showToast("✅ Manual entry saved","success"); }
    setSaving(false);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ── SPLASH ─────────────────────────────────────────────────────────────
  if (screen==="splash") return (
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

  if (screen==="loading"||loading) return <><style>{CSS}</style><Spinner/></>;

  // ── PIN PAD ────────────────────────────────────────────────────────────
  if (screen==="pin") return (
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

  // ── HOME ───────────────────────────────────────────────────────────────
  if (screen==="home") return (
    <div style={{minHeight:"100vh",background:"#f8f6f2",display:"flex",flexDirection:"column",alignItems:"center",padding:"28px 16px"}}>
      <style>{CSS}</style>
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      <div style={{width:"100%",maxWidth:480}}>
        <div style={{textAlign:"center",marginBottom:26}}>
          <MCXLogo size={80}/>
          <h1 style={{fontFamily:"Georgia,serif",fontSize:30,margin:"10px 0 4px",color:"#0a0a0a",letterSpacing:-1}}>MCX Time Clock</h1>
          <p style={{color:"#bbb",fontSize:13}}>Tap your name to clock in or out</p>
        </div>
        <ClockWidget now={now}/>
        <div style={{display:"grid",gap:11,marginBottom:26}}>
          {workers.map(w=>{
            const ci=isClockedIn(w.id), todH=hoursFromEntries(workerTodayEntries(w.id));
            return (
              <button key={w.id} onClick={()=>{setPinTarget(w.id);setPinBuf("");setPinErr("");setScreen("pin");}}
                style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  background:"#fff",border:ci?`2px solid ${T.green}`:"2px solid #ece8e0",
                  borderRadius:14,padding:"14px 18px",cursor:"pointer",
                  boxShadow:ci?"0 4px 20px rgba(22,163,74,.14)":"0 2px 8px rgba(0,0,0,.05)",transition:"all .2s"}}>
                <div style={{display:"flex",alignItems:"center",gap:13}}>
                  <div style={{width:44,height:44,borderRadius:"50%",
                    background:ci?"#dcfce7":"#f3f0ea",display:"flex",alignItems:"center",
                    justifyContent:"center",fontSize:16,fontWeight:700,color:ci?T.green:"#999"}}>
                    {w.name.split(" ").map(n=>n[0]).join("")}
                  </div>
                  <div style={{textAlign:"left"}}>
                    <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:"#0a0a0a"}}>{w.name}</div>
                    <div style={{fontSize:12,color:ci?T.green:"#ccc",marginTop:2}}>
                      {ci?`● Clocked In · ${todH.toFixed(1)}h today`:"Not clocked in"}
                    </div>
                  </div>
                </div>
                <div style={{padding:"5px 13px",borderRadius:20,fontSize:11,fontWeight:700,letterSpacing:.5,
                  background:ci?T.green:"#f0ece4",color:ci?"#fff":"#aaa"}}>{ci?"IN":"OUT"}</div>
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

  // ── WORKER SCREEN ─────────────────────────────────────────────────────
  if (screen==="worker"&&activeWorker) {
    const ci=isClockedIn(activeWorker.id);
    const todayE=workerTodayEntries(activeWorker.id);
    const todH=hoursFromEntries(todayE), wkH=weeklyHrs(activeWorker.id);
    const active=todayE.find(e=>!e.clock_out);
    const sched=getSchedule(activeWorker);
    const todayName=DAYS_OF_WEEK[now.getDay()];
    const ds=sched[todayName];
    return (
      <div style={{minHeight:"100vh",background:ci?"#f0fdf4":"#f8f6f2",display:"flex",
        flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 16px",position:"relative"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
        <button onClick={()=>{setScreen("home");setActiveWorker(null);}}
          style={{position:"absolute",top:24,left:24,background:"none",border:"none",cursor:"pointer",fontSize:22,color:"#bbb"}}>←</button>
        <div style={{width:"100%",maxWidth:380,textAlign:"center"}}>
          <MCXLogo size={46}/>
          <div style={{width:88,height:88,borderRadius:"50%",margin:"16px auto 10px",
            background:ci?"#dcfce7":"#f3f0ea",display:"flex",alignItems:"center",
            justifyContent:"center",fontSize:30,fontWeight:700,
            color:ci?T.green:"#aaa",border:ci?`3px solid ${T.green}`:"3px solid #e5e0d5"}}>
            {activeWorker.name.split(" ").map(n=>n[0]).join("")}
          </div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:24,margin:"0 0 4px",color:"#0a0a0a"}}>{activeWorker.name}</h2>
          <div style={{fontSize:13,color:ci?T.green:"#ccc",marginBottom:18,fontWeight:600}}>
            {ci?`● CLOCKED IN since ${fmtTime(active?.clock_in)}`:"○ NOT CLOCKED IN"}
          </div>
          <ClockWidget now={now}/>
          <div style={{display:"flex",gap:10,marginBottom:20}}>
            {[{label:"Today",value:`${todH.toFixed(2)}h`},{label:"This Week",value:`${wkH.toFixed(2)}h`},
              {label:"Est. Pay",value:fmtMoney(wkH*activeWorker.rate)}].map(s=>(
              <div key={s.label} style={{flex:1,background:"#fff",borderRadius:12,padding:"12px 8px",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:17,fontWeight:700,color:"#0a0a0a"}}>{s.value}</div>
                <div style={{fontSize:11,color:"#bbb",marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>
          {ds?.active && (
            <div style={{background:"#fff",borderRadius:12,padding:"10px 16px",marginBottom:20,
              fontSize:13,color:"#888",textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              🕒 Today's shift: <strong style={{color:"#0a0a0a"}}>{fmtTime24toDisplay(ds.start)} – {fmtTime24toDisplay(ds.end)}</strong>
            </div>
          )}
          {!ci?(
            <button onClick={()=>clockIn(activeWorker.id)} disabled={saving}
              style={{width:"100%",padding:20,background:saving?"#aaa":T.green,color:"#fff",border:"none",
                borderRadius:16,fontSize:20,fontWeight:700,cursor:saving?"wait":"pointer",
                boxShadow:`0 8px 28px rgba(22,163,74,.38)`,letterSpacing:.5,
                display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
              <span style={{fontSize:26}}>●</span>{saving?"Saving…":"CLOCK IN"}
            </button>
          ):(
            <button onClick={()=>clockOut(activeWorker.id)} disabled={saving}
              style={{width:"100%",padding:20,background:saving?"#aaa":T.red,color:"#fff",border:"none",
                borderRadius:16,fontSize:20,fontWeight:700,cursor:saving?"wait":"pointer",
                boxShadow:`0 8px 28px rgba(220,38,38,.38)`,letterSpacing:.5,
                display:"flex",alignItems:"center",justifyContent:"center",gap:10}}>
              <span style={{fontSize:26}}>■</span>{saving?"Saving…":"CLOCK OUT"}
            </button>
          )}
          {todayE.length>0&&(
            <div style={{marginTop:20,background:"#fff",borderRadius:12,padding:16,textAlign:"left",boxShadow:"0 2px 8px rgba(0,0,0,.06)"}}>
              <div style={{fontWeight:700,fontSize:12,marginBottom:10,color:"#0a0a0a",letterSpacing:.5}}>TODAY'S LOG</div>
              {todayE.map((e,i)=>(
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

  // ── MANAGER ───────────────────────────────────────────────────────────
  if (screen==="manager") {
    const totalIn     =workers.filter(w=>isClockedIn(w.id)).length;
    const totalEarned =workers.reduce((s,w)=>s+weeklyOwed(w.id,w.rate),0);
    const totalPaidAll=workers.reduce((s,w)=>s+totalPaid(w.id),0);
    const totalWkHrs  =workers.reduce((s,w)=>s+weeklyHrs(w.id),0);

    const TABS=[
      {id:"dashboard",label:"Dashboard"},
      {id:"payroll",  label:"Payroll"},
      {id:"workers",  label:"Workers"},
      {id:"logs",     label:"Logs"},
      {id:"schedule", label:"Schedule"},
      {id:"alerts",   label:`Alerts${reminders.length>0?` (${reminders.length})`:""}`},
    ];

    return (
      <div style={{minHeight:"100vh",background:T.dark,color:"#fff"}}>
        <style>{CSS}</style>
        {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}

        {/* ══ PAYMENT MODAL ══ */}
        {payModal&&(()=>{
          const w=workers.find(x=>x.id===payModal.workerId);
          const bal=balanceDue(w.id,w.rate), rt=payRowTotal();
          return (
            <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.85)",
              display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
              <div style={{background:T.surface,borderRadius:20,width:"100%",maxWidth:500,
                border:`1px solid ${T.gold}`,maxHeight:"92vh",overflowY:"auto"}}>
                <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,
                  display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:21,fontWeight:700}}>Record Payment</div>
                    <div style={{fontSize:13,color:T.textMuted,marginTop:3}}>{w.name}</div>
                  </div>
                  <button onClick={()=>setPayModal(null)}
                    style={{background:T.border,border:"none",color:"#888",width:34,height:34,borderRadius:"50%",cursor:"pointer",fontSize:18}}>✕</button>
                </div>
                <div style={{padding:"20px 24px"}}>
                  {/* Summary */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:22}}>
                    {[{label:"Earned",value:fmtMoney(weeklyOwed(w.id,w.rate)),c:T.gold},
                      {label:"Paid",  value:fmtMoney(totalPaid(w.id)),c:"#4ade80"},
                      {label:"Balance",value:fmtMoney(bal),c:bal>0?T.red:"#4ade80"}].map(s=>(
                      <div key={s.label} style={{background:T.dark,borderRadius:12,padding:"13px 10px",textAlign:"center",border:`1px solid ${T.border}`}}>
                        <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.value}</div>
                        <div style={{fontSize:11,color:T.textFaint,marginTop:3}}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{fontSize:12,color:T.textFaint,fontWeight:700,letterSpacing:1,marginBottom:10}}>PAYMENT METHOD(S)</div>

                  {payRows.map((row,i)=>(
                    <div key={i} style={{marginBottom:14,padding:"12px 14px",background:T.dark,borderRadius:10,border:`1px solid ${T.border}`}}>
                      {/* Method buttons */}
                      <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap"}}>
                        {PAY_METHODS.map(m=>(
                          <button key={m} onClick={()=>updatePayRow(i,"method",m)}
                            style={{padding:"7px 14px",borderRadius:8,border:"none",cursor:"pointer",
                              fontSize:13,fontWeight:700,transition:"all .15s",
                              background:row.method===m?T.gold:T.border,
                              color:row.method===m?T.dark:"#888"}}>{m}</button>
                        ))}
                      </div>
                      {/* Amount */}
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <div style={{position:"relative",flex:1}}>
                          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.textFaint,fontSize:15}}>$</span>
                          <input type="number" value={row.amount} min="0" step="0.01"
                            onChange={e=>updatePayRow(i,"amount",e.target.value)} placeholder="0.00"
                            style={{...inp({padding:"11px 12px 11px 26px",fontSize:16})}}/>
                        </div>
                        {payRows.length>1&&<button onClick={()=>removePayRow(i)}
                          style={{background:T.redBg,border:"none",color:T.red,width:36,height:36,borderRadius:8,cursor:"pointer",fontSize:18}}>✕</button>}
                      </div>
                      {/* Check number field — only shows when method is Check */}
                      {row.method==="Check"&&(
                        <div style={{marginTop:10}}>
                          <label style={{fontSize:12,color:T.textFaint,display:"block",marginBottom:5}}>Check Number</label>
                          <input type="text" value={row.checkNumber||""} placeholder="e.g. 1042"
                            onChange={e=>updatePayRow(i,"checkNumber",e.target.value)}
                            style={{...inp({padding:"9px 12px"})}}/>
                        </div>
                      )}
                    </div>
                  ))}

                  <button onClick={addPayRow}
                    style={{width:"100%",padding:"9px",background:"transparent",border:`1px dashed ${T.border}`,
                      borderRadius:8,color:T.textFaint,cursor:"pointer",fontSize:13,marginBottom:16}}>
                    + Split Payment — Add Another Method
                  </button>

                  <div style={{background:T.dark,borderRadius:12,padding:"13px 18px",marginBottom:16,
                    display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${T.border}`}}>
                    <span style={{color:T.textFaint,fontSize:14}}>Total Being Recorded</span>
                    <span style={{color:T.gold,fontSize:22,fontWeight:700}}>{fmtMoney(rt)}</span>
                  </div>

                  <div style={{marginBottom:20}}>
                    <label style={{fontSize:12,color:T.textFaint,display:"block",marginBottom:6}}>Note (optional)</label>
                    <input type="text" value={payNote} onChange={e=>setPayNote(e.target.value)}
                      placeholder="e.g. Weekly pay, partial, bonus…" style={inp()}/>
                  </div>

                  <div style={{display:"flex",gap:10}}>
                    <button onClick={submitPayment} disabled={saving}
                      style={{flex:2,padding:14,background:saving?T.textFaint:T.gold,border:"none",
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

        {/* Header */}
        <div style={{background:T.brand,borderBottom:`1px solid ${T.brandDark}`,
          padding:"14px 22px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
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
              style={{background:T.brandDark,border:"none",color:"rgba(255,255,255,.7)",
                padding:"7px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>← Exit</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:2,padding:"14px 22px 0",overflowX:"auto",borderBottom:`1px solid ${T.border}`}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setMTab(t.id)}
              style={{padding:"8px 16px",borderRadius:"8px 8px 0 0",border:"none",cursor:"pointer",
                fontSize:13,fontWeight:600,whiteSpace:"nowrap",
                background:mTab===t.id?T.surface:"transparent",
                color:mTab===t.id?T.gold:T.textFaint,
                borderBottom:mTab===t.id?`2px solid ${T.gold}`:"2px solid transparent"}}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{padding:"22px",maxWidth:960,margin:"0 auto"}}>

          {/* ── DASHBOARD ── */}
          {mTab==="dashboard"&&(
            <div>
              <ClockWidget now={now} dark/>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginBottom:24}}>
                {[
                  {label:"Workers",     value:workers.length,                              icon:"👥"},
                  {label:"Clocked In",  value:totalIn,                                     icon:"✅",c:T.green},
                  {label:"Weekly Hrs",  value:`${totalWkHrs.toFixed(1)}h`,                 icon:"⏱"},
                  {label:"Total Earned",value:fmtMoney(totalEarned),                       icon:"💵",c:T.gold},
                  {label:"Total Paid",  value:fmtMoney(totalPaidAll),                      icon:"✓", c:"#4ade80"},
                  {label:"Outstanding", value:fmtMoney(Math.max(0,totalEarned-totalPaidAll)),icon:"⚠️",c:T.red},
                ].map(k=>(
                  <div key={k.label} style={{background:T.surface,borderRadius:14,padding:"16px 14px",border:`1px solid ${T.border}`}}>
                    <div style={{fontSize:22,marginBottom:6}}>{k.icon}</div>
                    <div style={{fontSize:22,fontWeight:700,color:k.c||"#fff",fontFamily:"Georgia,serif"}}>{k.value}</div>
                    <div style={{fontSize:11,color:T.textFaint,marginTop:3}}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.border}`,fontSize:11,color:T.textFaint,fontWeight:700,letterSpacing:1}}>WORKER SUMMARY</div>
                <div style={{overflowX:"auto"}}>
                  <table style={{width:"100%",borderCollapse:"collapse",minWidth:560}}>
                    <thead>
                      <tr style={{background:T.dark}}>
                        {["Name","Status","Hrs","Earned","Paid","Balance",""].map(h=>(
                          <th key={h} style={{padding:"9px 14px",fontSize:11,color:T.textFaint,fontWeight:700,letterSpacing:.5,textAlign:"left"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {workers.map((w,i)=>{
                        const ci=isClockedIn(w.id),wh=weeklyHrs(w.id);
                        const earned=weeklyOwed(w.id,w.rate),paid=totalPaid(w.id),bal=balanceDue(w.id,w.rate);
                        return (
                          <tr key={w.id} style={{borderTop:`1px solid ${T.border}`,background:i%2===0?T.surface:T.surfaceAlt}}>
                            <td style={{padding:"11px 14px",fontFamily:"Georgia,serif",fontSize:14,fontWeight:600}}>{w.name}</td>
                            <td style={{padding:"11px 14px"}}>
                              <span style={{padding:"3px 9px",borderRadius:20,fontSize:11,fontWeight:700,
                                background:ci?T.greenBg:T.border,color:ci?"#4ade80":T.textFaint}}>
                                {ci?"● IN":"○ OUT"}
                              </span>
                            </td>
                            <td style={{padding:"11px 14px",color:"#aaa",fontSize:13}}>{wh.toFixed(1)}h</td>
                            <td style={{padding:"11px 14px",color:T.gold,fontSize:13}}>{fmtMoney(earned)}</td>
                            <td style={{padding:"11px 14px",color:"#4ade80",fontSize:13}}>{fmtMoney(paid)}</td>
                            <td style={{padding:"11px 14px",fontSize:13,fontWeight:700,color:bal>0?T.red:"#4ade80"}}>{fmtMoney(bal)}</td>
                            <td style={{padding:"11px 14px"}}>
                              <button onClick={()=>openPayModal(w.id)}
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

          {/* ── PAYROLL ── */}
          {mTab==="payroll"&&(
            <div>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:22,marginBottom:20}}>Payroll & Payments</h2>
              <div style={{display:"grid",gap:16}}>
                {workers.map(w=>{
                  const wh=weeklyHrs(w.id),earned=weeklyOwed(w.id,w.rate),paid=totalPaid(w.id),bal=balanceDue(w.id,w.rate);
                  const hist=workerPayments(w.id).slice().reverse();
                  return (
                    <div key={w.id} style={{background:T.surface,borderRadius:16,border:`1px solid ${T.border}`,overflow:"hidden"}}>
                      <div style={{padding:"18px 22px",borderBottom:`1px solid ${T.border}`,
                        display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
                        <div>
                          <div style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700}}>{w.name}</div>
                          <div style={{fontSize:12,color:T.textFaint,marginTop:3}}>{wh.toFixed(2)} hrs · ${w.rate}/hr</div>
                        </div>
                        <div style={{display:"flex",gap:14,alignItems:"center"}}>
                          <div style={{textAlign:"right"}}>
                            <div style={{fontSize:11,color:T.textFaint}}>Balance Due</div>
                            <div style={{fontSize:24,fontWeight:700,color:bal>0?T.red:"#4ade80"}}>{fmtMoney(bal)}</div>
                          </div>
                          <button onClick={()=>openPayModal(w.id)}
                            style={{padding:"11px 22px",background:T.gold,border:"none",borderRadius:10,color:T.dark,fontWeight:700,cursor:"pointer",fontSize:14}}>
                            Pay Worker
                          </button>
                        </div>
                      </div>
                      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`}}>
                        {[{label:"Earned",value:fmtMoney(earned),c:T.gold},{label:"Paid",value:fmtMoney(paid),c:"#4ade80"},
                          {label:"Owed",value:fmtMoney(bal),c:bal>0?T.red:"#4ade80"}].map((s,i)=>(
                          <div key={s.label} style={{flex:1,padding:"12px 16px",borderRight:i<2?`1px solid ${T.border}`:"none",background:T.dark}}>
                            <div style={{fontSize:17,fontWeight:700,color:s.c}}>{s.value}</div>
                            <div style={{fontSize:11,color:T.textFaint,marginTop:2}}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      {hist.length>0?(
                        <div style={{padding:"14px 22px"}}>
                          <div style={{fontSize:11,color:T.textFaint,fontWeight:700,letterSpacing:1,marginBottom:10}}>PAYMENT HISTORY</div>
                          {hist.map(p=>(
                            <div key={p.id} style={{padding:"10px 0",borderBottom:`1px solid ${T.dark}`,
                              display:"flex",justifyContent:"space-between",alignItems:"flex-start",fontSize:13}}>
                              <div>
                                <div style={{marginBottom:4}}>
                                  {(p.methods||[]).map((m,mi)=>(
                                    <span key={mi} style={{marginRight:10}}>
                                      <span style={{color:T.gold,fontWeight:700}}>{m.method}</span>
                                      <span style={{color:T.textFaint}}> {fmtMoney(m.amount)}</span>
                                      {m.method==="Check"&&m.checkNumber&&
                                        <span style={{color:T.blue,fontSize:12}}> #{m.checkNumber}</span>}
                                    </span>
                                  ))}
                                </div>
                                {p.note&&<div style={{color:T.textFaint,fontSize:12}}>{p.note}</div>}
                              </div>
                              <div style={{textAlign:"right",flexShrink:0,marginLeft:16}}>
                                <div style={{color:"#4ade80",fontWeight:700}}>{fmtMoney(p.amount)}</div>
                                <div style={{color:T.textFaint,fontSize:11,marginTop:2}}>{fmtDate(p.paid_at)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ):(
                        <div style={{padding:"16px 22px",color:T.textFaint,fontSize:13}}>No payments recorded yet.</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── WORKERS ── */}
          {mTab==="workers"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Workers</h2>
                <button onClick={()=>{setAddingW(true);setNewW({name:"",pin:"",rate:15,email:"",phone:""});setNewWSched(DEFAULT_SCHEDULE);}}
                  style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>
                  + Add Worker
                </button>
              </div>

              {addingW&&(
                <div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.borderBright}`,marginBottom:16}}>
                  <h3 style={{margin:"0 0 14px",color:T.gold}}>New Worker</h3>
                  {[["Full Name","name","text"],["PIN (4 digits)","pin","text"],["Hourly Rate ($)","rate","number"],
                    ["Email (optional)","email","email"],["Phone (optional)","phone","tel"]].map(([label,field,type])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <label style={{fontSize:12,color:T.textFaint,display:"block",marginBottom:4}}>{label}</label>
                      <input type={type} value={newW[field]} onChange={e=>setNewW(p=>({...p,[field]:e.target.value}))} style={inp()}/>
                    </div>
                  ))}
                  <div style={{marginTop:16,marginBottom:8}}>
                    <label style={{fontSize:12,color:T.textFaint,fontWeight:700,letterSpacing:1}}>SCHEDULE</label>
                  </div>
                  <ScheduleEditor schedule={newWSched} onChange={setNewWSched}/>
                  <div style={{display:"flex",gap:8,marginTop:14}}>
                    <button onClick={addWorker} disabled={saving}
                      style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>
                      {saving?"Saving…":"Save Worker"}
                    </button>
                    <button onClick={()=>setAddingW(false)}
                      style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              )}

              <div style={{display:"grid",gap:10}}>
                {workers.map(w=>(
                  <div key={w.id} style={{background:T.surface,borderRadius:14,padding:"14px 18px",
                    border:`1px solid ${T.border}`,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                    {editWid===w.id?(
                      <div style={{flex:1}}>
                        {[["Name","name","text"],["PIN (4 digits)","pin","text"],["Rate ($/hr)","rate","number"],
                          ["Email","email","email"],["Phone","phone","tel"]].map(([label,field,type])=>(
                          <div key={field} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                            <label style={{fontSize:11,color:T.textFaint,width:90}}>{label}</label>
                            <input type={type} value={editForm[field]||""} onChange={e=>setEditForm(p=>({...p,[field]:e.target.value}))}
                              style={{...inp({flex:1,width:"auto"})}}/>
                          </div>
                        ))}
                        <div style={{marginTop:14,marginBottom:8}}>
                          <label style={{fontSize:12,color:T.textFaint,fontWeight:700,letterSpacing:1}}>SCHEDULE</label>
                        </div>
                        <ScheduleEditor schedule={editSched} onChange={setEditSched}/>
                        <div style={{display:"flex",gap:8,marginTop:12}}>
                          <button onClick={()=>saveWorkerEdit(w.id)} disabled={saving}
                            style={{flex:1,padding:"8px",background:T.gold,border:"none",borderRadius:6,fontWeight:700,cursor:"pointer",color:T.dark}}>
                            {saving?"Saving…":"Save Changes"}
                          </button>
                          <button onClick={()=>{setEditWid(null);setEditSched(null);}}
                            style={{flex:1,padding:"8px",background:T.border,border:"none",borderRadius:6,color:"#888",cursor:"pointer"}}>Cancel</button>
                        </div>
                      </div>
                    ):(
                      <>
                        <div style={{flex:1}}>
                          <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:700}}>{w.name}</div>
                          <div style={{fontSize:12,color:T.textFaint,marginTop:3}}>
                            PIN: ••••  ·  ${w.rate}/hr
                            {w.email?`  ·  ${w.email}`:""}
                          </div>
                          <div style={{fontSize:11,color:T.textFaint,marginTop:4,opacity:.7}}>
                            📅 {schedSummary(getSchedule(w))}
                          </div>
                        </div>
                        <div style={{display:"flex",gap:8,flexShrink:0,marginLeft:10}}>
                          <button onClick={()=>{
                            setEditWid(w.id);
                            setEditForm({name:w.name,pin:w.pin,rate:w.rate,email:w.email||"",phone:w.phone||""});
                            setEditSched(getSchedule(w));
                          }} style={{padding:"6px 14px",background:T.border,border:"none",borderRadius:6,color:"#aaa",cursor:"pointer",fontSize:13}}>Edit</button>
                          <button onClick={()=>deleteWorker(w.id,w.name)}
                            style={{padding:"6px 10px",background:T.redBg,border:"none",borderRadius:6,color:T.red,cursor:"pointer",fontSize:13}}>✕</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── LOGS ── */}
          {mTab==="logs"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Clock Logs</h2>
                <button onClick={()=>setManEntry({workerId:workers[0]?.id,date:new Date().toISOString().slice(0,10),inTime:"09:00",outTime:""})}
                  style={{background:T.gold,border:"none",color:T.dark,padding:"9px 18px",borderRadius:8,cursor:"pointer",fontWeight:700}}>
                  + Manual Entry
                </button>
              </div>
              {manEntry&&(
                <div style={{background:T.surface,borderRadius:14,padding:20,border:`1px solid ${T.gold}`,marginBottom:18}}>
                  <h3 style={{margin:"0 0 14px",color:T.gold}}>Manual Clock Entry</h3>
                  <div style={{marginBottom:10}}>
                    <label style={{fontSize:12,color:T.textFaint,display:"block",marginBottom:4}}>Worker</label>
                    <select value={manEntry.workerId} onChange={e=>setManEntry(p=>({...p,workerId:e.target.value}))}
                      style={inp()}>
                      {workers.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  {[["Date","date","date"],["Clock In Time","inTime","time"],["Clock Out Time (optional)","outTime","time"]].map(([label,field,type])=>(
                    <div key={field} style={{marginBottom:10}}>
                      <label style={{fontSize:12,color:T.textFaint,display:"block",marginBottom:4}}>{label}</label>
                      <input type={type} value={manEntry[field]} onChange={e=>setManEntry(p=>({...p,[field]:e.target.value}))} style={inp()}/>
                    </div>
                  ))}
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={saveManEntry} disabled={saving}
                      style={{flex:1,padding:"9px",background:T.gold,border:"none",borderRadius:8,fontWeight:700,cursor:"pointer",color:T.dark}}>
                      {saving?"Saving…":"Save Entry"}
                    </button>
                    <button onClick={()=>setManEntry(null)}
                      style={{flex:1,padding:"9px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
                  </div>
                </div>
              )}
              {workers.map(w=>{
                const all=workerAllEntries(w.id).slice().reverse();
                if(!all.length) return null;
                return (
                  <div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${T.border}`,marginBottom:14,overflow:"hidden"}}>
                    <div style={{padding:"12px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span style={{fontFamily:"Georgia,serif",fontWeight:700,fontSize:15}}>{w.name}</span>
                      <span style={{fontSize:12,color:T.textFaint}}>{all.length} entries</span>
                    </div>
                    {all.map((e,i)=>(
                      <div key={i} style={{padding:"10px 18px",borderBottom:`1px solid ${T.dark}`,display:"flex",justifyContent:"space-between",fontSize:13}}>
                        <span style={{color:T.textFaint}}>{fmtDate(e.clock_in)}</span>
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

          {/* ── SCHEDULE ── */}
          {mTab==="schedule"&&(
            <div>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:22,marginBottom:6}}>Worker Schedules</h2>
              <p style={{color:T.textFaint,fontSize:13,marginBottom:20}}>
                Set a custom weekly schedule for each worker. Reminders fire based on their individual schedule.
              </p>
              <div style={{display:"grid",gap:14}}>
                {workers.map(w=>{
                  const sched=getSchedule(w);
                  const isOpen=expandedSchedWid===w.id;
                  return (
                    <div key={w.id} style={{background:T.surface,borderRadius:14,border:`1px solid ${isOpen?T.gold:T.border}`,overflow:"hidden",transition:"border-color .2s"}}>
                      <div style={{padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer"}}
                        onClick={()=>{
                          if(isOpen){setExpandedSchedWid(null);}
                          else{setExpandedSchedWid(w.id);setSchedDraft(sched);}
                        }}>
                        <div>
                          <div style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700}}>{w.name}</div>
                          <div style={{fontSize:12,color:T.textFaint,marginTop:4}}>📅 {schedSummary(sched)}</div>
                        </div>
                        <div style={{color:T.gold,fontSize:20}}>{isOpen?"▲":"▼"}</div>
                      </div>
                      {isOpen&&(
                        <div style={{padding:"0 20px 20px",borderTop:`1px solid ${T.border}`}}>
                          <div style={{marginTop:16}}>
                            <ScheduleEditor schedule={schedDraft} onChange={setSchedDraft}/>
                          </div>
                          <div style={{display:"flex",gap:10,marginTop:16}}>
                            <button onClick={()=>saveScheduleFromTab(w.id)} disabled={saving}
                              style={{flex:1,padding:"10px",background:T.gold,border:"none",borderRadius:8,
                                fontWeight:700,cursor:"pointer",color:T.dark,fontSize:14}}>
                              {saving?"Saving…":"✓ Save Schedule"}
                            </button>
                            <button onClick={()=>setExpandedSchedWid(null)}
                              style={{flex:1,padding:"10px",background:T.border,border:"none",borderRadius:8,color:"#888",cursor:"pointer"}}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── ALERTS ── */}
          {mTab==="alerts"&&(
            <div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:10}}>
                <h2 style={{fontFamily:"Georgia,serif",fontSize:22,margin:0}}>Alerts & Reminders</h2>
                <div style={{display:"flex",gap:10}}>
                  <button
                    onClick={()=>exportToExcel({workers,clockEntries,payments,reminders})}
                    style={{padding:"9px 18px",background:T.green,border:"none",borderRadius:8,
                      color:"#fff",fontWeight:700,cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:6}}>
                    ⬇ Export to Excel
                  </button>
                  {reminders.length>0&&(
                    <button onClick={()=>setReminders([])}
                      style={{background:T.border,border:"none",color:"#888",padding:"9px 14px",borderRadius:8,cursor:"pointer",fontSize:13}}>
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {reminders.length===0?(
                <div style={{background:T.surface,borderRadius:14,padding:40,border:`1px solid ${T.border}`,textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:10}}>✅</div>
                  <div style={{color:T.textFaint}}>No alerts. All workers are on schedule.</div>
                  <div style={{fontSize:13,color:T.textFaint,marginTop:10,opacity:.6}}>
                    You can still export a full payroll report using the button above.
                  </div>
                </div>
              ):(
                <div style={{display:"grid",gap:10}}>
                  {reminders.slice().reverse().map(r=>{
                    const w=workers.find(x=>x.id===r.workerId);
                    return (
                      <div key={r.id} style={{background:T.amberBg,borderRadius:12,padding:"14px 18px",
                        border:`1px solid #3a2800`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <div>
                          <div style={{fontSize:14,color:T.amber,marginBottom:3}}>{r.msg}</div>
                          <div style={{fontSize:11,color:T.textFaint}}>{fmtDate(r.ts)} {fmtTime(r.ts)}</div>
                          {w&&<div style={{fontSize:11,color:T.textFaint,marginTop:2}}>Worker: {w.name}</div>}
                        </div>
                        <button onClick={()=>setReminders(p=>p.filter(x=>x.id!==r.id))}
                          style={{background:"none",border:"none",color:T.textFaint,cursor:"pointer",fontSize:18,paddingLeft:12}}>✕</button>
                      </div>
                    );
                  })}
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
