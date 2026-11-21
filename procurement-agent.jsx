import { useState, useRef, useEffect, useMemo } from "react";

// The business profile starts empty; this text is shown as the placeholder.
const PROFILE_PLACEHOLDER = "Describe your business profile here";

// Words ignored when deriving search keywords from the business profile.
const STOP_WORDS = new Set("a an and are as at be by for from has have in is it its of on or our such that the their to we with your you us most all any can will also who which this these those company companies business businesses singapore registered based serve serves selling sell sells provide provides providing offer offers access including various other more agency agencies government customers clients sme smes products services supply supplies".split(" "));
const keywordsFromProfile = text => [...new Set((text.match(/[A-Za-z0-9][A-Za-z0-9-]+/g) || []).filter(w => !STOP_WORDS.has(w.toLowerCase())))].slice(0, 6).join(" ");

const PORTALS = [
  { id:"gebiz",       name:"GeBIZ",                 type:"Government",      desc:"Central government tenders" },
  { id:"govtech",     name:"GovTech Procurement",   type:"Government",      desc:"ICT and digital tenders" },
  { id:"sentinel",    name:"Sentinel Portal",       type:"Government",      desc:"MINDEF / SAF procurement" },
  { id:"hdb",         name:"HDB eBidding",          type:"Statutory Board", desc:"HDB supply contracts" },
  { id:"jtc",         name:"JTC Procurement",       type:"Statutory Board", desc:"Industrial estate supplies" },
  { id:"sla",         name:"SLA / Quartz",          type:"Statutory Board", desc:"Land authority contracts" },
  { id:"caas",        name:"CAAS / Changi",         type:"Statutory Board", desc:"Aviation supplies and services" },
  { id:"ariba_sg",    name:"Ariba SG",              type:"Corporate",       desc:"DBS, OCBC, Singtel and others" },
  { id:"tenderboard", name:"Tenderboard",           type:"Corporate",       desc:"Tender aggregator and alerts" },
  { id:"sesami",      name:"Sesami",                type:"Corporate",       desc:"SME-focused procurement" },
  { id:"sgh",         name:"SingHealth / NHG",      type:"Healthcare",      desc:"Hospital and healthcare supplies" },
  { id:"ntu",         name:"NTU / NUS Procurement", type:"Education",       desc:"University procurement" },
];

const CATEGORIES = ["IT Hardware & Software","Office Supplies","Corporate Gifting","Medical & Healthcare","Apparel & PPE","Retail & FMCG","Logistics & Fulfilment"];

const TABS = [
  { id:"configure", label:"Search setup" },
  { id:"run",       label:"Activity" },
  { id:"results",   label:"Opportunities" },
  { id:"draft",     label:"Draft" },
];

const STEPS = [
  { id:"preparing", label:"Prepare" },
  { id:"searching", label:"Search" },
  { id:"scoring",   label:"Score" },
  { id:"done",      label:"Complete" },
];

const FRESHNESS = [
  { id:"oneWeek",  label:"Past week" },
  { id:"oneMonth", label:"Past month" },
  { id:"oneYear",  label:"Past year" },
  { id:"noLimit",  label:"Any time" },
];

// The web domains each portal publishes on. Searches are restricted to the selected portals'
// domains, and any result from another site is discarded.
const PORTAL_HOSTS = {
  gebiz:["gebiz.gov.sg"], govtech:["tech.gov.sg"], sentinel:["mindef.gov.sg"], hdb:["hdb.gov.sg"],
  jtc:["jtc.gov.sg"], sla:["sla.gov.sg"], caas:["caas.gov.sg","changiairport.com"], ariba_sg:["ariba.com"],
  tenderboard:["tenderboard.biz"], sesami:["sesami.online","sesami.com"],
  sgh:["singhealth.com.sg","alpshealthcare.com.sg","nhg.com.sg"], ntu:["ntu.edu.sg","nus.edu.sg"],
};
// Government agencies and statutory boards publish their tenders on GeBIZ. When one of these portals
// is selected, GeBIZ's own open-tender listing is searched directly and filtered to that buyer.
// null means "every agency on GeBIZ".
const GEBIZ_AGENCY = {
  gebiz:null,
  govtech:/government technology agency|govtech/i,
  sentinel:/ministry of defence|mindef|defence science|armed forces/i,
  hdb:/housing (and|&) development board/i,
  jtc:/\bjtc\b|jurong town/i,
  sla:/singapore land authority/i,
  caas:/civil aviation authority/i,
};
const TENDER_WORDS =/\b(tender|tenders|quotation|quotations|itq|itt|rfp|rfq|rfi|bid|bids|procurement|sourcing)\b/i;

const HIGH_MATCH = 85;
const CLOSING_SOON_DAYS = 14;

const CSS = `
.pa{
  --bg:#f3f6fa; --surface:#ffffff; --border:#dce3ec; --hover:#eef3f9;
  --text:#0f1c2e; --muted:#5a687b; --subtle:#93a0b2; --ring:rgba(30,77,160,.18);
  --accent:#1e4da0; --accent-fg:#ffffff; --accent-soft:#e7eef9;
  --good:#0f766e; --warn:#a16207; --bad:#b42318;
  min-height:100vh; background:var(--bg); color:var(--text);
  font:14px/1.5 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  -webkit-font-smoothing:antialiased;
}
@media (prefers-color-scheme:dark){
  .pa{
    --bg:#0a1019; --surface:#101826; --border:#1f2b3d; --hover:#152033;
    --text:#e6ecf4; --muted:#94a3b8; --subtle:#62728a; --ring:rgba(125,166,240,.28);
    --accent:#7da6f0; --accent-fg:#0a1019; --accent-soft:#16243c;
    --good:#5fd4c4; --warn:#e3b341; --bad:#ff8a7a;
  }
}
.pa *,.pa *::before,.pa *::after{box-sizing:border-box}
.pa h1,.pa h2,.pa p{margin:0}
.pa button,.pa input,.pa select,.pa textarea{font:inherit;color:inherit}
.pa :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.pa .num{font-variant-numeric:tabular-nums;white-space:nowrap}

.pa-top{position:sticky;top:0;z-index:5;background:var(--surface);border-bottom:1px solid var(--border)}
.pa-top-in{max-width:1120px;margin:0 auto;padding:0 24px;display:flex;align-items:center;gap:32px;min-height:56px;flex-wrap:wrap}
.pa-brand{font-size:13px;font-weight:650;letter-spacing:.08em;white-space:nowrap;color:var(--accent)}
.pa-brand span{font-weight:400;letter-spacing:0;color:var(--muted);margin-left:10px}
.pa-nav{display:flex;gap:24px;flex:1;overflow-x:auto;scrollbar-width:none}
.pa-nav::-webkit-scrollbar{display:none}
.pa-tab{background:none;border:0;border-bottom:2px solid transparent;padding:18px 0 16px;color:var(--muted);cursor:pointer;white-space:nowrap;font-size:13.5px}
.pa-tab:hover{color:var(--text)}
.pa-tab[aria-current="page"]{color:var(--text);border-bottom-color:var(--accent);font-weight:500}
.pa-count{margin-left:6px;font-size:11.5px;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:1px 8px}
.pa-status{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted);white-space:nowrap}
.pa-dot{width:7px;height:7px;border-radius:50%;background:var(--subtle)}
.pa-dot.run{background:var(--warn);animation:pa-pulse 1.4s ease-in-out infinite}
.pa-dot.ok{background:var(--good)}
@keyframes pa-pulse{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.pa-dot.run{animation:none}}

.pa-main{max-width:1120px;margin:0 auto;padding:40px 24px 72px}
.pa-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:28px}
.pa-head h1{font-size:24px;font-weight:600;letter-spacing:-.015em;line-height:1.25}
.pa-head p{color:var(--muted);margin-top:4px}
.pa-actions{display:flex;gap:8px;flex-wrap:wrap}

.pa-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:16px;overflow:hidden}
.pa-card-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 20px;border-bottom:1px solid var(--border)}
.pa-card-h h2{font-size:13px;font-weight:600}
.pa-card-b{padding:20px}
.pa-narrow{max-width:820px}

.pa-lab{display:block;font-size:12.5px;font-weight:500;color:var(--muted);margin-bottom:6px}
.pa-in{width:100%;padding:9px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;outline:none;transition:border-color .15s,box-shadow .15s}
.pa-in::placeholder{color:var(--subtle)}
.pa-in:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)}
textarea.pa-in{resize:vertical;line-height:1.65;display:block}
.pa-grid3{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.pa-hint{font-size:12.5px;color:var(--muted)}

.pa-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;padding:0 14px;border:1px solid var(--border);border-radius:6px;background:var(--surface);font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;color:var(--text);white-space:nowrap;transition:border-color .15s,opacity .15s}
.pa-btn:hover:not(:disabled){border-color:var(--muted)}
.pa-btn:disabled{opacity:.4;cursor:not-allowed}
.pa-btn.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}
.pa-btn.primary:hover:not(:disabled){opacity:.86}
.pa-btn.sm{height:30px;padding:0 10px;font-size:12.5px}
.pa-link{background:none;border:0;padding:0;color:var(--muted);font-size:12.5px;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.pa-link:hover{color:var(--accent)}
.pa-table .pa-pill{color:var(--accent);background:var(--accent-soft);border-color:transparent}

.pa-ptype{font-size:12px;font-weight:500;color:var(--muted);margin:0 0 8px}
.pa-pgroup + .pa-pgroup{margin-top:20px}
.pa-pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.pa-pitem{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer}
.pa-pitem:hover{background:var(--hover)}
.pa-pitem input{margin:3px 0 0;accent-color:var(--accent)}
.pa-pitem:has(input:checked){border-color:color-mix(in srgb,var(--accent) 35%,var(--border));background:var(--accent-soft)}
.pa-pitem b{display:block;font-weight:500}
.pa-pitem small{display:block;font-size:12px;color:var(--muted)}

.pa-steps{display:flex;gap:28px;flex-wrap:wrap;margin-bottom:16px;font-size:13px;color:var(--subtle)}
.pa-step{display:flex;align-items:center;gap:8px}
.pa-step i{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:1px solid currentColor;border-radius:50%;font-size:11px}
.pa-step.on{color:var(--accent);font-weight:500}
.pa-step.past{color:var(--good)}
.pa-log{padding:16px 20px;min-height:280px;max-height:460px;overflow:auto;font:12.5px/1.9 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted)}
.pa-log time{color:var(--subtle);margin-right:14px}
.pa-log .ok{color:var(--good)}
.pa-log .warn{color:var(--warn)}
.pa-log .strong{color:var(--text)}

.pa-banner{border:1px solid var(--border);border-left:3px solid var(--bad);background:var(--surface);border-radius:6px;padding:12px 16px;margin-bottom:16px}
.pa-banner b{font-weight:600}
.pa-banner.pa-info{border-left-color:var(--accent)}

.pa-stats{display:grid;grid-template-columns:repeat(4,1fr)}
.pa-stat{padding:18px 20px;border-left:1px solid var(--border)}
.pa-stat:first-child{border-left:0}
.pa-stat span{display:block;font-size:12.5px;color:var(--muted)}
.pa-stat b{display:block;font-size:22px;font-weight:600;letter-spacing:-.01em;margin-top:2px}

.pa-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pa-toolbar select{width:auto;padding:5px 10px;font-size:13px}
.pa-tablewrap{overflow-x:auto}
.pa-table{width:100%;border-collapse:collapse}
.pa-table th{text-align:left;font-size:12px;font-weight:500;color:var(--muted);padding:10px 16px;border-bottom:1px solid var(--border);white-space:nowrap}
.pa-table th button{background:none;border:0;padding:0;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer}
.pa-table th button:hover,.pa-table th[aria-sort] button{color:var(--text)}
.pa-table td{padding:14px 16px;border-bottom:1px solid var(--border);vertical-align:top}
.pa-table tbody tr:last-child td{border-bottom:0}
.pa-row{cursor:pointer}
.pa-row:hover,.pa-row.open{background:var(--hover)}
.pa-title{font-weight:500;line-height:1.4}
.pa-sub{font-size:12.5px;color:var(--muted);margin-top:2px}
.pa-urgent{color:var(--bad)}
.pa-match{display:flex;align-items:center;gap:10px}
.pa-bar{width:56px;height:4px;border-radius:2px;background:var(--border);overflow:hidden;flex-shrink:0}
.pa-bar i{display:block;height:100%;background:var(--accent)}
.pa-rowact{display:flex;gap:6px;justify-content:flex-end}
.pa-detail td{background:var(--bg);padding:20px 16px 24px}
.pa-detail-grid{display:grid;grid-template-columns:1fr 240px;gap:32px}
.pa-detail p{line-height:1.7;max-width:70ch}
.pa-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:12.5px;margin:0}
.pa-dl dt{color:var(--muted)}
.pa-dl dd{margin:0;word-break:break-word}
.pa-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px}
.pa-pill{font-size:11.5px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:1px 9px;white-space:nowrap}
.pa-note{font-size:12.5px;color:var(--muted);margin-top:14px;max-width:80ch}

.pa-queries{border-top:1px solid var(--border)}
.pa-queries summary{padding:13px 20px;font-size:13px;font-weight:600;cursor:pointer}
.pa-queries summary .pa-hint{font-weight:400;margin-left:8px}
.pa-queries .pa-table td{padding:9px 16px;font-size:13px}
.pa-pill-on{color:var(--accent);background:var(--accent-soft);border-color:transparent}
.pa-reviewed .pa-pill{margin-right:6px}
.pa-reviewed{margin-top:16px}
.pa-reviewed summary{padding:13px 20px;font-size:13px;font-weight:600;cursor:pointer}
.pa-reviewed summary .pa-hint{font-weight:400;margin-left:8px}
.pa-reviewed ul{list-style:none;margin:0;padding:0 20px 8px}
.pa-reviewed li{padding:10px 0;border-top:1px solid var(--border)}
.pa-reviewed a{color:var(--accent);text-decoration:none;word-break:break-word}
.pa-reviewed a:hover{text-decoration:underline}
.pa-empty{padding:64px 24px;text-align:center}
.pa-empty b{display:block;font-size:15px;font-weight:600;margin-bottom:6px}
.pa-empty p{color:var(--muted);max-width:52ch;margin:0 auto 20px}
.pa-draft{min-height:340px;border:0;border-radius:0;padding:20px;line-height:1.75}
.pa-draft:focus{box-shadow:none}
.pa-foot{max-width:1120px;margin:0 auto;padding:0 24px 32px;font-size:12px;color:var(--subtle)}

@media (max-width:760px){
  .pa-top-in{gap:0 20px;padding-top:10px}
  .pa-nav{order:3;flex-basis:100%}
  .pa-status{margin-left:auto}
  .pa-main{padding:28px 16px 56px}
  .pa-grid3{grid-template-columns:1fr}
  .pa-stats{grid-template-columns:repeat(2,1fr)}
  .pa-stat:nth-child(3){border-left:0}
  .pa-stat:nth-child(n+3){border-top:1px solid var(--border)}
  .pa-hide-sm,.pa-bar{display:none}
  .pa-table th,.pa-table td{padding:12px 10px}
  .pa-table th:first-child,.pa-table td:first-child{padding-left:16px}
  .pa-table th:last-child,.pa-table td:last-child{padding-right:16px}
  .pa-detail-grid{grid-template-columns:1fr;gap:20px}
}
`;

const fmtMoney = n => (Number(n) > 0 ? `S$${Number(n).toLocaleString("en-SG")}` : "Not stated");
const daysLeft = d => { const t = Date.parse(d); return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000); };
const safeUrl = u => (typeof u === "string" && /^https?:\/\//i.test(u) ? u : null);

const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
const textOf = data => (data.content || []).filter(c => c.type === "text").map(c => c.text || "").join("");

// Reads the model's reply as a JSON array of tenders, recovering complete records if it was cut off.
function parseTenders(raw, onWarn) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("[");
  const jsonStr = start >= 0 ? cleaned.slice(start) : "";
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    onWarn("Response was incomplete; recovering the complete records");
    const salvaged = [];
    for (const m of jsonStr.matchAll(/\{[^{}]*"title"\s*:[^{}]*\}/gs)) {
      try { salvaged.push(JSON.parse(m[0])); } catch {}
    }
    if (salvaged.length === 0) throw new Error("The response could not be read as a list of tenders");
    return salvaged;
  }
}

// Search-only mode: turns a raw search result into a table row, scored by keyword overlap.
const portalForUrl = (url, portals = PORTALS) => {
  const host = hostOf(url);
  return portals.find(p => (PORTAL_HOSTS[p.id] || []).some(h => host === h || host.endsWith(`.${h}`))) || null;
};
const isSpecificPage = url => { try { const u = new URL(url); return u.pathname.replace(/\/+$/, "").length > 0 || u.search.length > 1; } catch { return false; } };

// A tender read directly from GeBIZ's listing, scored by keyword overlap when the AI has not scored it.
function tenderToRow(page, terms) {
  const t = page.tender;
  const words = [...new Set(terms.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1))];
  const hay = `${t.title} ${t.category}`.toLowerCase();
  const hits = words.filter(w => hay.includes(w.replace(/s$/, ""))).length;
  return {
    title:t.title, agency:t.agency, portal:"GeBIZ", deadline:t.deadline, budget:null, category:t.category,
    relevance:words.length ? Math.round(100 * hits / words.length) : 0,
    description:`${t.type || "Opportunity"} published on GeBIZ${t.published ? ` on ${t.published}` : ""}. Closes ${t.deadline || "on a date not stated"} ${t.closingTime}.`.trim(),
    tags:[], refNo:t.refNo, sourceUrl:t.url, aiReason:`Title matches your keyword "${t.keyword}"; not scored by AI`,
    nextStep:"Log in to GeBIZ and submit before the closing time.", isReal:true,
  };
}

function pageToRow(page, terms) {
  const host = hostOf(page.url);
  const portal = portalForUrl(page.url);
  const words = [...new Set(terms.toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1))];
  const hay = `${page.name || ""} ${page.text || ""}`.toLowerCase();
  const hits = words.filter(w => hay.includes(w)).length;
  return {
    title:page.name || page.url, agency:host, portal:portal ? portal.name : "Web", deadline:null, budget:null,
    category:"", relevance:words.length ? Math.round(100 * hits / words.length) : 0,
    description:(page.text || "").slice(0, 600), tags:[], refNo:"", sourceUrl:page.url, aiReason:"", isReal:true,
  };
}

function downloadCsv(rows) {
  const cols = ["title","agency","portal","refNo","category","budget","deadline","relevance","aiReason","nextStep","sourceUrl"];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map(r => cols.map(c => cell(r[c])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type:"text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `opportunities-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function GeekAI() {
  const [businessDesc, setBusinessDesc] = useState("");
  const [keywords, setKeywords] = useState("");
  const [selectedPortals, setSelectedPortals] = useState(PORTALS.map(p => p.id));
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState("");
  const [freshness, setFreshness] = useState("oneMonth");
  const [resultMode, setResultMode] = useState("ai");
  const [accessCode, setAccessCode] = useState(() => { try { return sessionStorage.getItem("geekai_access_code") || ""; } catch { return ""; } });
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(null);
  const [runError, setRunError] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [reviewed, setReviewed] = useState([]);
  const [runInfo, setRunInfo] = useState(null);
  const [activeTab, setActiveTab] = useState("configure");
  const [expandedKey, setExpandedKey] = useState(null);
  const [draftOpp, setDraftOpp] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filterScore, setFilterScore] = useState(0);
  const [sortBy, setSortBy] = useState("relevance");
  const [sortDir, setSortDir] = useState("desc");
  const logEndRef = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ block:"nearest" }); }, [logs]);

  const addLog = (msg, type = "info") => setLogs(prev => [...prev, { msg, type, ts:new Date().toLocaleTimeString("en-SG", { hour12:false }) }]);
  const togglePortal = id => setSelectedPortals(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  const toggleAll = () => setSelectedPortals(selectedPortals.length === PORTALS.length ? [] : PORTALS.map(p => p.id));
  const handleSort = col => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir(col === "title" || col === "portal" || col === "deadline" ? "asc" : "desc"); } };

  // All outside calls go through our own server functions (api/search.js for LangSearch,
  // api/messages.js for Claude), which hold the API keys and check the access code.
  const callApi = async (path, payload) => {
    try { sessionStorage.setItem("geekai_access_code", accessCode); } catch {}
    const res = await fetch(path, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-access-code":accessCode },
      body:JSON.stringify(payload)
    });
    let data;
    try { data = await res.json(); } catch { throw new Error(`Server returned ${res.status}`); }
    if (data.error) { const err = new Error(data.error.message); err.code = data.error.code; throw err; }
    return data;
  };

  const runAgent = async () => {
    setRunning(true); setResults([]); setLogs([]); setRunError(""); setExpandedKey(null);
    setActiveTab("run"); setPhase("preparing");
    const selPortals = PORTALS.filter(p => selectedPortals.includes(p.id));

    const searchTerms = keywords
      ? keywords
      : keywordsFromProfile(businessDesc) || businessDesc.trim().slice(0, 60);

    addLog("Search started", "strong");
    addLog(`Keywords: ${keywords || `${searchTerms} (derived from the business profile)`}`);
    addLog(`Category: ${category || "All categories"}`);
    addLog(`Budget: ${budget || "No range specified"}`);
    addLog(`Portals in scope (${selPortals.length}): ${selPortals.map(p => p.name).join(", ")}`);

    const portalList = selPortals.map(p => `${p.name} (${p.type}: ${p.desc})`).join(", ");

    const systemPrompt = `You are a Singapore procurement sourcing agent. Your job is to find REAL, currently open procurement tenders in Singapore that match the given business profile.

Use the web_search tool to search for live tenders. Search multiple times with different queries to find real results from GeBIZ, Tenderboard, Sesami, and other Singapore procurement portals.

After searching, return ONLY a raw JSON array of real tenders you found. Each object:
{
  "id": number,
  "portal": "portal short name",
  "portalId": "portal id",
  "title": "exact tender title as found",
  "agency": "exact agency name",
  "deadline": "YYYY-MM-DD or null if unknown",
  "budget": integer SGD or null,
  "category": "category string",
  "relevance": 0-100,
  "description": "what the tender is for, max 80 words",
  "tags": ["tag1","tag2","tag3"],
  "refNo": "reference number if found or empty string",
  "sourceUrl": "direct URL to the tender or portal page",
  "aiReason": "why this matches the business, max 12 words",
  "isReal": true
}

IMPORTANT: Only include tenders you actually found via search. Do not fabricate or simulate any tender. If you find none, return an empty array [].
Return only the JSON array.`;

    const userMsg = `Business Profile: ${businessDesc}
Keywords to search: ${searchTerms}
Category: ${category || "all"}
Budget preference: ${budget || "any"}
Active Portals to search: ${portalList}

Search for real open tenders in Singapore (${new Date().getFullYear()}) matching this business. Try these searches:
1. "site:gebiz.gov.sg ${searchTerms} tender ${new Date().getFullYear()}"
2. "site:tenderboard.gov.sg ${searchTerms}"
3. "Singapore government tender ${searchTerms} ${new Date().getFullYear()}"
4. "GeBIZ tender ${searchTerms} open"
5. "Sesami Singapore ${searchTerms} procurement"

Then return all real tenders found as a JSON array.`;

    const year = new Date().getFullYear();
    // Two searches per selected portal, each restricted to that portal's own domains.
    const allowedDomains = selPortals.flatMap(p => PORTAL_HOSTS[p.id] || []);
    const queries = [
      ...selPortals.map(p => ({ query:`${searchTerms} ${category} tender quotation`.replace(/\s+/g, " "), domains:PORTAL_HOSTS[p.id] || [] })),
      ...selPortals.map(p => ({ query:`open invitation to tender quotation ${year}`, domains:PORTAL_HOSTS[p.id] || [] })),
    ].filter(q => q.domains.length > 0);

    const extractPrompt = `You are a Singapore procurement sourcing analyst. You are given web search results as JSON (name, url, datePublished, text). Identify REAL procurement tenders, quotations or bid invitations from Singapore buyers that are currently open and that match the business profile.

Include a tender only if ALL of these hold:
- The page is about one specific procurement opportunity (or clearly lists it by name), not a portal home page, listing index without detail, supplier guide, FAQ, registration page, news article or policy page.
- It is not awarded, closed or cancelled, and any closing date in the text is on or after today's date.
- The text gives enough to act on: a specific title plus at least one of a reference number, a closing date, or instructions on how to respond.
- What is being bought is relevant to the business profile. Do not include a tender only because it shares a keyword.

Use only information present in the search results. Do not invent tenders, deadlines, budgets or reference numbers: use null (or an empty string for refNo) when a detail is not in the text. It is correct to return few or no tenders when the results do not contain real ones.

Return ONLY a raw JSON array containing one object for EVERY search result you were given.

For a result that does not qualify, return this short form:
{
  "isTender": false,
  "sourceUrl": "the url of the search result, copied exactly",
  "kind": "listing" if the page is a list or index of current tenders that a supplier should open to see them, otherwise "other",
  "reason": "why it does not qualify, max 15 words"
}

For a qualifying tender, return:
{
  "isTender": true,
  "id": number,
  "portal": "portal short name",
  "title": "tender title as found",
  "agency": "agency or buyer name",
  "deadline": "YYYY-MM-DD or null if unknown",
  "budget": integer SGD or null,
  "category": "category string",
  "relevance": 0-100,
  "description": "what the tender is for, max 80 words",
  "tags": ["tag1","tag2","tag3"],
  "refNo": "reference number if found or empty string",
  "sourceUrl": "the url of the search result this tender came from, copied exactly",
  "aiReason": "why this matches the business, max 12 words",
  "nextStep": "what the supplier should do next to respond, taken from the page, max 20 words",
  "isReal": true
}`;

    const brief = `Today's date: ${new Date().toISOString().slice(0,10)}
Business Profile: ${businessDesc}
Keywords: ${searchTerms}
Category: ${category || "all"}
Budget preference: ${budget || "any"}
Portals of interest: ${portalList}

Results whose text begins with "GeBIZ open tender listing" were read directly from GeBIZ's own list of open opportunities. They are confirmed real, open and specific, so always return them with "isTender": true. For these, only judge how relevant the purchase is to the business and give an honest relevance score (low when the fit is weak), and set nextStep to logging in to GeBIZ and submitting before the closing time.`;

    // Tenders read straight from GeBIZ, and which selected portal each one belongs to.
    const urlPortal = new Map();
    const resolvePortal = u => urlPortal.get(u) || portalForUrl(u, selPortals);
    const gebizPortals = selPortals.filter(p => p.id in GEBIZ_AGENCY);
    let gebizPages = [];
    let gebizDetail = [];

    let generated = [];
    let mode = "ai";
    let pages = null;
    let queryDetail = null;
    let engine = "LangSearch web search";
    try {
      setPhase("searching");

      // Step 1: search GeBIZ's own open-tender listing, which web search engines cannot see into.
      if (gebizPortals.length > 0) {
        const raw = /[,;\n]/.test(keywords) ? keywords.split(/[,;\n]+/) : searchTerms.split(/\s+/).map(w => w.replace(/(?<=[A-Za-z]{3}[^sSuUeE])s$/, ""));
        const terms = [...new Set(raw.map(s => s.trim()).filter(s => s.length >= 2))].slice(0, 5);
        try {
          addLog(`Searching GeBIZ's open tender listing directly for: ${terms.join(", ")}`);
          const g = await callApi("/api/gebiz", { keywords:terms });
          const everyAgency = gebizPortals.some(p => p.id === "gebiz");
          for (const t of g.results || []) {
            const portal = everyAgency ? gebizPortals.find(p => p.id === "gebiz") : gebizPortals.find(p => GEBIZ_AGENCY[p.id].test(t.agency));
            if (!portal) continue;
            urlPortal.set(t.url, portal);
            gebizPages.push({
              name:t.title, url:t.url, displayUrl:"gebiz.gov.sg", datePublished:t.published, tender:t,
              text:`GeBIZ open tender listing. Type: ${t.type || "not stated"}. Reference: ${t.refNo}. Agency: ${t.agency}. Category: ${t.category}. Published: ${t.published || "not stated"}. Closing on: ${t.deadline || "not stated"} ${t.closingTime}. Matched keyword: ${t.keyword}. Respond by electronic submission on GeBIZ.`,
            });
          }
          gebizDetail = (g.detail || []).map(d => ({ domains:["gebiz.gov.sg (its own open-tender search)"], query:d.keyword, pages:d.read, error:d.error, note:d.error ? "" : `${d.open} open, ${d.closed ?? "?"} closed on GeBIZ` }));
          for (const d of g.detail || []) addLog(d.error ? `GeBIZ "${d.keyword}": ${d.error}` : `GeBIZ "${d.keyword}": ${d.open} open ${d.open === 1 ? "tender" : "tenders"} (${d.closed ?? "?"} closed)${d.open > d.read ? `, first ${d.read} read` : ""}`, d.error ? "warn" : "info");
          addLog(`${gebizPages.length} open GeBIZ ${gebizPages.length === 1 ? "tender" : "tenders"} from the selected portals`, gebizPages.length ? "ok" : "info");
        } catch(e) {
          addLog(`GeBIZ direct search failed: ${e.message}`, "warn");
          gebizDetail = [{ domains:["gebiz.gov.sg (its own open-tender search)"], query:terms.join(", "), pages:0, error:e.message }];
        }
      }

      // Step 2: web search of the selected portals' sites.
      try {
        addLog(`Searching the ${selPortals.length} selected ${selPortals.length === 1 ? "portal" : "portals"} with LangSearch (${queries.length} queries)`);
        const s = await callApi("/api/search", { queries, freshness });
        pages = (s.results || []).filter(p => portalForUrl(p.url, selPortals));
        queryDetail = s.detail || null;
        addLog(`${pages.length} ${pages.length === 1 ? "page" : "pages"} found on the selected portals${s.failed ? `; ${s.failed} of ${s.queries} queries failed after retries (${s.failureReason || "unknown error"})` : ""}`, s.failed ? "warn" : "info");
      } catch(e) {
        if (e.code === "search_not_configured") {
          addLog(gebizPages.length ? "LangSearch is not set up on the server; continuing with the GeBIZ results" : "LangSearch is not set up on the server; using Claude web search instead", "warn");
          if (!gebizPages.length) engine = "Claude web search";
        } else if (gebizPages.length) {
          addLog(`Web search failed (${e.message}); continuing with the GeBIZ results`, "warn");
          pages = [];
        } else throw e;
      }
      if (gebizPages.length) { pages = [...gebizPages, ...(pages || [])]; engine = "GeBIZ direct search + LangSearch web search"; }
      queryDetail = [...gebizDetail, ...(queryDetail || [])];
      if (queryDetail.length === 0) queryDetail = null;

      if (pages === null) {
        // Fallback: let Claude run its own web searches.
        addLog("Searching public tender listings and scoring matches. This can take a few minutes.");
        const data = await callApi("/api/messages", {
          max_tokens:16000,
          system:systemPrompt,
          web_search:true,
          domains:allowedDomains,
          messages:[{role:"user",content:`${userMsg}\n\nOnly include tenders published on these domains: ${allowedDomains.join(", ")}.`}]
        });
        const searches = (data.content || []).filter(c => c.type === "server_tool_use" && c.name === "web_search").length;
        addLog(`Response received: ${searches} web ${searches === 1 ? "search" : "searches"} run`);
        generated = parseTenders(textOf(data), m => addLog(m, "warn"));
      } else if (pages.length > 0) {
        setPhase("scoring");
        try {
          addLog("Extracting tenders from the pages and scoring them against the profile");
          const data = await callApi("/api/messages", {
            max_tokens:16000,
            system:extractPrompt,
            messages:[{role:"user",content:`${brief}\n\nSearch results (JSON):\n${JSON.stringify(pages.map(({ tender, ...p }) => p))}`}]
          });
          const known = new Set(pages.map(p => p.url));
          const candidates = parseTenders(textOf(data), m => addLog(m, "warn"));
          // The model returns a verdict for every page: either a tender, or a short reason it was left out.
          const verdicts = new Map();
          for (const c of candidates) if (c && c.isTender === false && c.sourceUrl) verdicts.set(c.sourceUrl, { kind:c.kind === "listing" ? "listing" : "other", reason:String(c.reason || "") });
          const tenders = candidates.filter(c => c && c.isTender !== false && c.title);
          for (const t of tenders) if (known.has(t.sourceUrl)) verdicts.set(t.sourceUrl, { kind:"tender", reason:"" });
          pages = pages.map(p => ({ ...p, verdict:verdicts.get(p.url) || null }));
          const listings = pages.filter(p => p.verdict?.kind === "listing").length;
          addLog(`The AI model read ${pages.length} ${pages.length === 1 ? "page" : "pages"}: ${tenders.length} candidate ${tenders.length === 1 ? "tender" : "tenders"}, ${listings} tender listing ${listings === 1 ? "page" : "pages"}, ${Math.max(0, pages.length - tenders.length - listings)} not relevant`);
          generated = tenders.map(o => ({ ...o, sourceUrl:known.has(o.sourceUrl) ? o.sourceUrl : null }));
          // GeBIZ tenders keep the facts read from GeBIZ itself; the AI only supplies relevance and wording.
          const scoredUrls = new Set(generated.map(o => o.sourceUrl));
          generated = generated.map(o => {
            const t = pages.find(p => p.url === o.sourceUrl)?.tender;
            return t ? { ...o, title:t.title, agency:t.agency, refNo:t.refNo, deadline:t.deadline, category:o.category || t.category, nextStep:o.nextStep || "Log in to GeBIZ and submit before the closing time." } : o;
          });
          // Any GeBIZ tender the AI skipped is still shown, scored by keyword overlap instead.
          const skipped = pages.filter(p => p.tender && !scoredUrls.has(p.url));
          if (skipped.length) {
            addLog(`${skipped.length} GeBIZ ${skipped.length === 1 ? "tender was" : "tenders were"} not scored by the AI and ${skipped.length === 1 ? "is" : "are"} shown with a keyword score`, "warn");
            generated = [...generated, ...skipped.map(p => tenderToRow(p, searchTerms))];
            pages = pages.map(p => p.tender && !scoredUrls.has(p.url) ? { ...p, verdict:{ kind:"tender", reason:"Shown with a keyword score" } } : p);
          }
        } catch(e) {
          if (e.code !== "ai_not_configured") throw e;
          mode = "keyword";
          addLog("AI scoring is not set up on the server; showing portal pages that mention tenders, ranked by keyword overlap", "warn");
          generated = [
            ...pages.filter(p => p.tender).map(p => tenderToRow(p, searchTerms)),
            ...pages
              .filter(p => !p.tender && isSpecificPage(p.url) && TENDER_WORDS.test(`${p.name} ${p.text}`))
              .map(p => pageToRow(p, searchTerms))
              .filter(r => r.relevance > 0),
          ];
        }
      }
    } catch(e) {
      setRunError(e.message);
      addLog(`Search failed: ${e.message}`, "warn");
    }

    // Keep only tenders that link to a page on a selected portal and have not already closed.
    const valid = generated.filter(o => o && o.isReal !== false && o.title);
    const linked = valid.filter(o => resolvePortal(o.sourceUrl));
    const stillOpen = linked.filter(o => !(daysLeft(o.deadline) < 0));
    if (mode === "ai" && valid.length > stillOpen.length) {
      addLog(`${valid.length - stillOpen.length} removed: ${valid.length - linked.length} without a link to a page on a selected portal, ${linked.length - stillOpen.length} already closed`, "warn");
    }
    const scored = stillOpen
      .map((o, i) => ({ ...o, _key:i, portal:resolvePortal(o.sourceUrl).name, relevance:Math.max(0, Math.min(100, Math.round(Number(o.relevance) || 0))), tags:Array.isArray(o.tags) ? o.tags : [] }))
      .sort((a,b) => b.relevance - a.relevance);

    if (scored.length === 0) {
      addLog("No open, relevant tenders were found on the selected portals", "warn");
    } else {
      const high = scored.filter(o => o.relevance >= HIGH_MATCH).length;
      addLog(`${scored.length} ${scored.length === 1 ? "opportunity" : "opportunities"} found, ${high} high match`, "ok");
      addLog(`Top match: ${scored[0].title} (${scored[0].relevance}%)`, "ok");
    }

    setRunInfo({
      keywords: keywords ? keywords : `${searchTerms} (taken from the business profile)`,
      category: category || "All categories",
      budget: budget || "Not specified",
      freshness: FRESHNESS.find(f => f.id === freshness)?.label || freshness,
      portals: selPortals.map(p => p.name),
      domains: allowedDomains,
      engine,
      scoring: mode === "ai" ? "AI model" : "Keyword overlap only (no AI key on the server)",
      queries: queryDetail,
    });
    setResults(scored); setReviewed(pages || []); setResultMode(mode); setPhase("done"); setRunning(false); setLastRun(new Date());
    if (scored.length > 0) setActiveTab("results");
  };

  const generateDraft = async (opp) => {
    setDraftOpp(opp); setDraft(""); setDraftLoading(true); setCopied(false); setActiveTab("draft");
    try {
      const data = await callApi("/api/messages", {
        max_tokens:4000,
        system:"You are a professional bid writer for a Singapore-based company. Write formal expressions of interest following Singapore government/corporate procurement norms.",
        messages:[{role:"user", content:`Write a concise Expression of Interest for this Singapore procurement opportunity.\n\nOur Business: ${businessDesc}\nOpportunity: ${opp.title}\nAgency: ${opp.agency}\nBudget: ${Number(opp.budget) > 0 ? `SGD ${Number(opp.budget).toLocaleString()}` : "not stated"}\nRef: ${opp.refNo}\nDescription: ${opp.description}\n\n3 paragraphs: 1) Company intro & fit, 2) Capabilities & SG track record, 3) Professional closing. Under 260 words. Formal Singapore business tone.`}]
      });
      setDraft(textOf(data).trim() || "No draft was returned. Please try again.");
    } catch(e) { setDraft(`The draft could not be generated: ${e.message}`); }
    setDraftLoading(false);
  };

  const copyDraft = async () => {
    try { await navigator.clipboard.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {}
  };

  const portalTypes = [...new Set(PORTALS.map(p => p.type))];
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = r => sortBy === "deadline" ? (Date.parse(r.deadline) || Infinity)
      : sortBy === "budget" ? (Number(r.budget) || 0)
      : sortBy === "relevance" ? r.relevance
      : String(r[sortBy] ?? "").toLowerCase();
    return results.filter(r => r.relevance >= filterScore).sort((a,b) => { const av = val(a), bv = val(b); return av === bv ? 0 : (av > bv ? dir : -dir); });
  }, [results, filterScore, sortBy, sortDir]);

  const highCount = results.filter(r => r.relevance >= HIGH_MATCH).length;
  const closingSoon = results.filter(r => { const d = daysLeft(r.deadline); return d !== null && d >= 0 && d <= CLOSING_SOON_DAYS; }).length;
  const totalBudget = results.reduce((s,r) => s + (Number(r.budget) || 0), 0);
  const stepIndex = STEPS.findIndex(s => s.id === phase);
  const canRun = !running && selectedPortals.length > 0 && businessDesc.trim() && accessCode.trim();

  // Exactly what the last search used: the parameters, and every query sent with what came back.
  const searchDetailsBlock = runInfo && (
    <section className="pa-card" style={{marginTop:16}}>
      <div className="pa-card-h"><h2>Search details</h2><span className="pa-hint">What the last search used</span></div>
      <div className="pa-card-b">
        <dl className="pa-dl">
          <dt>Keywords</dt><dd>{runInfo.keywords}</dd>
          <dt>Category</dt><dd>{runInfo.category}</dd>
          <dt>Budget</dt><dd>{runInfo.budget}</dd>
          <dt>Published within</dt><dd>{runInfo.freshness}</dd>
          <dt>Portals</dt><dd>{runInfo.portals.join(", ")}</dd>
          <dt>Sites searched</dt><dd>{runInfo.domains.join(", ")}</dd>
          <dt>Search engine</dt><dd>{runInfo.engine}</dd>
          <dt>Scoring</dt><dd>{runInfo.scoring}</dd>
        </dl>
      </div>
      {runInfo.queries && (
        <details className="pa-queries">
          <summary>Queries sent <span className="pa-hint num">{runInfo.queries.length}, returning {runInfo.queries.reduce((n, q) => n + (q.pages || 0), 0)} pages before duplicates were removed</span></summary>
          <div className="pa-tablewrap">
            <table className="pa-table">
              <thead><tr><th>Site</th><th>Query</th><th>Pages</th></tr></thead>
              <tbody>
                {runInfo.queries.map((q, i) => (
                  <tr key={i}>
                    <td>{q.domains.join(", ")}</td>
                    <td>{q.query}</td>
                    <td className="num">{q.error ? <span className="pa-urgent">{q.error}</span> : q.pages}{q.note ? <span className="pa-sub"> ({q.note})</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );

  // The raw pages the search returned from the selected portals, before any AI filtering.
  const reviewedBlock = reviewed.length > 0 && (
    <details className="pa-card pa-reviewed">
      <summary>Pages reviewed <span className="pa-hint num">{reviewed.length} from the selected portals, before filtering</span></summary>
      <ul>
        {reviewed.map(p => (
          <li key={p.url}>
            {safeUrl(p.url) ? <a href={safeUrl(p.url)} target="_blank" rel="noopener noreferrer">{p.name || p.url}</a> : <span>{p.name || p.url}</span>}
            <div className="pa-sub">{[hostOf(p.url), p.datePublished ? String(p.datePublished).slice(0, 10) : null].filter(Boolean).join("  ·  ")}</div>
            {p.verdict && (
              <div className="pa-sub">
                <span className={`pa-pill ${p.verdict.kind === "other" ? "" : "pa-pill-on"}`}>{p.verdict.kind === "tender" ? "Identified as a tender" : p.verdict.kind === "listing" ? "Tender listing page: open it to see current tenders" : "Not included"}</span>
                {p.verdict.reason ? ` ${p.verdict.reason}` : ""}
              </div>
            )}
          </li>
        ))}
      </ul>
    </details>
  );

  const Th = ({ col, children, className }) => (
    <th className={className} aria-sort={sortBy === col ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => handleSort(col)}>{children}{sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button>
    </th>
  );

  const Deadline = ({ value }) => {
    const d = daysLeft(value);
    if (d === null) return <span className="pa-sub">Not stated</span>;
    return (
      <>
        <div className="num">{value}</div>
        <div className={`pa-sub ${d >= 0 && d <= CLOSING_SOON_DAYS ? "pa-urgent" : ""}`}>{d < 0 ? "Closed" : d === 0 ? "Closes today" : `${d} ${d === 1 ? "day" : "days"} left`}</div>
      </>
    );
  };

  return (
    <div className="pa">
      <style>{CSS}</style>

      <header className="pa-top">
        <div className="pa-top-in">
          <div className="pa-brand">GEEK-AI<span>Procurement Intelligence</span></div>
          <nav className="pa-nav" aria-label="Sections">
            {TABS.map(t => (
              <button key={t.id} type="button" className="pa-tab" aria-current={activeTab === t.id ? "page" : undefined} onClick={() => setActiveTab(t.id)}>
                {t.label}
                {t.id === "results" && results.length > 0 && <span className="pa-count num">{results.length}</span>}
              </button>
            ))}
          </nav>
          <div className="pa-status" role="status">
            <span className={`pa-dot ${running ? "run" : phase === "done" ? "ok" : ""}`} />
            {running ? "Searching" : phase === "done" ? "Search complete" : "Ready"}
          </div>
        </div>
      </header>

      <main className="pa-main">

        {activeTab === "configure" && (
          <div className="pa-narrow">
            <div className="pa-head">
              <div>
                <h1>Search setup</h1>
                <p>Describe the business, set the search scope, and choose the portals to cover.</p>
              </div>
            </div>

            <section className="pa-card">
              <div className="pa-card-h"><h2>Business profile</h2></div>
              <div className="pa-card-b">
                <label className="pa-lab" htmlFor="pa-profile">Used to find and score matching tenders, and to write drafts</label>
                <textarea id="pa-profile" className="pa-in" rows={4} value={businessDesc} onChange={e => setBusinessDesc(e.target.value)} placeholder={PROFILE_PLACEHOLDER} />
              </div>
            </section>

            <section className="pa-card">
              <div className="pa-card-h"><h2>Search parameters</h2><span className="pa-hint">All optional</span></div>
              <div className="pa-card-b pa-grid3">
                <div>
                  <label className="pa-lab" htmlFor="pa-keywords">Keywords</label>
                  <input id="pa-keywords" className="pa-in" placeholder="VR headsets, AI workstations" value={keywords} onChange={e => setKeywords(e.target.value)} />
                </div>
                <div>
                  <label className="pa-lab" htmlFor="pa-category">Category</label>
                  <select id="pa-category" className="pa-in" value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="">All categories</option>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="pa-lab" htmlFor="pa-budget">Budget range (SGD)</label>
                  <input id="pa-budget" className="pa-in" placeholder="50,000 to 500,000" value={budget} onChange={e => setBudget(e.target.value)} />
                </div>
                <div>
                  <label className="pa-lab" htmlFor="pa-fresh">Published within</label>
                  <select id="pa-fresh" className="pa-in" value={freshness} onChange={e => setFreshness(e.target.value)}>
                    {FRESHNESS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            </section>

            <section className="pa-card">
              <div className="pa-card-h">
                <h2>Portals <span className="pa-hint num">{selectedPortals.length} of {PORTALS.length} selected</span></h2>
                <button type="button" className="pa-link" onClick={toggleAll}>{selectedPortals.length === PORTALS.length ? "Clear all" : "Select all"}</button>
              </div>
              <div className="pa-card-b">
                {portalTypes.map(type => (
                  <div key={type} className="pa-pgroup">
                    <div className="pa-ptype">{type}</div>
                    <div className="pa-pgrid">
                      {PORTALS.filter(p => p.type === type).map(p => (
                        <label key={p.id} className="pa-pitem">
                          <input type="checkbox" checked={selectedPortals.includes(p.id)} onChange={() => togglePortal(p.id)} />
                          <span><b>{p.name}</b><small>{p.desc}</small></span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="pa-card">
              <div className="pa-card-h"><h2>Access</h2></div>
              <div className="pa-card-b">
                <label className="pa-lab" htmlFor="pa-code">Access code</label>
                <input id="pa-code" className="pa-in" type="password" autoComplete="off" style={{maxWidth:280}} placeholder="Provided by your administrator" value={accessCode} onChange={e => setAccessCode(e.target.value)} />
              </div>
            </section>

            <div className="pa-toolbar" style={{marginTop:24}}>
              <button type="button" className="pa-btn primary" onClick={runAgent} disabled={!canRun}>{running ? "Searching…" : "Run search"}</button>
              <span className="pa-hint">
                {!businessDesc.trim() ? "Describe your business profile to run a search." : !accessCode.trim() ? "Enter the access code to run a search." : selectedPortals.length === 0 ? "Select at least one portal." : "Searches the web with LangSearch, then scores each tender against the profile."}
              </span>
            </div>
          </div>
        )}

        {activeTab === "run" && (
          <div className="pa-narrow">
            <div className="pa-head">
              <div>
                <h1>Activity</h1>
                <p>Progress of the current search.</p>
              </div>
            </div>

            <div className="pa-steps">
              {STEPS.map((s, i) => (
                <div key={s.id} className={`pa-step ${stepIndex === i && phase !== "done" ? "on" : stepIndex > i || phase === "done" ? "past" : ""}`}>
                  <i>{stepIndex > i || phase === "done" ? "✓" : i + 1}</i>{s.label}
                </div>
              ))}
            </div>

            {runError && <div className="pa-banner" role="alert"><b>The search did not complete.</b> {runError}</div>}

            <section className="pa-card">
              <div className="pa-card-h"><h2>Log</h2>{running && <span className="pa-hint">In progress</span>}</div>
              <div className="pa-log" aria-live="polite">
                {logs.length === 0 && <span>No activity yet. Run a search from Search setup.</span>}
                {logs.map((log, i) => (
                  <div key={i} className={log.type}><time>{log.ts}</time>{log.msg}</div>
                ))}
                <div ref={logEndRef} />
              </div>
            </section>

            {phase === "done" && !running && (
              <div className="pa-actions">
                {results.length > 0 && <button type="button" className="pa-btn primary" onClick={() => setActiveTab("results")}>View opportunities</button>}
                <button type="button" className="pa-btn" onClick={() => setActiveTab("configure")}>Adjust search</button>
              </div>
            )}
          </div>
        )}

        {activeTab === "results" && (
          <div>
            <div className="pa-head">
              <div>
                <h1>Opportunities</h1>
                <p>{lastRun ? `Last searched ${lastRun.toLocaleString("en-SG", { dateStyle:"medium", timeStyle:"short" })}` : "Tenders matched and scored against the business profile."}</p>
              </div>
              {results.length > 0 && (
                <div className="pa-actions">
                  <button type="button" className="pa-btn" onClick={() => downloadCsv(sorted)}>Export CSV</button>
                  <button type="button" className="pa-btn" onClick={runAgent} disabled={!canRun}>Run again</button>
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <>
              <section className="pa-card pa-empty">
                <b>{phase === "done" ? "No matching tenders found" : "No results yet"}</b>
                <p>
                  {phase === "done"
                    ? "The search found no open, relevant tenders on the selected portals. Many portals show tender details only to signed-in suppliers, so they cannot be found by web search. Try broader keywords, a longer \"Published within\" period, or more portals."
                    : "Set up a search and run it to see matching opportunities here."}
                </p>
                <button type="button" className="pa-btn primary" onClick={() => setActiveTab("configure")}>{phase === "done" ? "Adjust search" : "Go to search setup"}</button>
              </section>
              {searchDetailsBlock}
              {reviewedBlock}
              </>
            ) : (
              <>
                {resultMode === "keyword" && (
                  <div className="pa-banner pa-info" role="status"><b>Search-only mode.</b> AI scoring is not set up on the server, so these are pages from the selected portals that mention tenders, ranked by how many of your keywords they contain. They have not been checked to be open, relevant tenders. Add a Gemini or Anthropic API key on the server to turn on AI scoring, deadlines, budgets and drafts.</div>
                )}
                <section className="pa-card pa-stats">
                  <div className="pa-stat"><span>Opportunities</span><b className="num">{results.length}</b></div>
                  <div className="pa-stat"><span>High match ({HIGH_MATCH}%+)</span><b className="num">{highCount}</b></div>
                  <div className="pa-stat"><span>Closing within {CLOSING_SOON_DAYS} days</span><b className="num">{closingSoon}</b></div>
                  <div className="pa-stat"><span>Total stated budget</span><b className="num">{totalBudget > 0 ? `S$${Math.round(totalBudget / 1000).toLocaleString("en-SG")}K` : "—"}</b></div>
                </section>

                <section className="pa-card">
                  <div className="pa-card-h">
                    <div className="pa-toolbar">
                      <label className="pa-hint" htmlFor="pa-min">Minimum match</label>
                      <select id="pa-min" className="pa-in" value={filterScore} onChange={e => setFilterScore(+e.target.value)}>
                        <option value={0}>Any</option>
                        <option value={50}>50%+</option>
                        <option value={70}>70%+</option>
                        <option value={HIGH_MATCH}>{HIGH_MATCH}%+</option>
                      </select>
                    </div>
                    <span className="pa-hint num">{sorted.length} of {results.length} shown</span>
                  </div>
                  <div className="pa-tablewrap">
                    <table className="pa-table">
                      <thead>
                        <tr>
                          <Th col="title">Opportunity</Th>
                          <Th col="portal" className="pa-hide-sm">Portal</Th>
                          <Th col="budget" className="pa-hide-sm">Budget</Th>
                          <Th col="deadline">Deadline</Th>
                          <Th col="relevance">Match</Th>
                          <th><span style={{position:"absolute",left:-9999}}>Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sorted.length === 0 && <tr><td colSpan={6} className="pa-sub" style={{textAlign:"center",padding:"32px 16px"}}>No opportunities at this match level.</td></tr>}
                        {sorted.map(opp => {
                          const open = expandedKey === opp._key;
                          const url = safeUrl(opp.sourceUrl);
                          return [
                            <tr key={opp._key} className={`pa-row ${open ? "open" : ""}`} onClick={() => setExpandedKey(open ? null : opp._key)}>
                              <td>
                                <div className="pa-title">{opp.title}</div>
                                <div className="pa-sub">{opp.agency}</div>
                              </td>
                              <td className="pa-hide-sm"><span className="pa-pill">{opp.portal || "—"}</span></td>
                              <td className="pa-hide-sm num">{Number(opp.budget) > 0 ? fmtMoney(opp.budget) : <span className="pa-sub">Not stated</span>}</td>
                              <td><Deadline value={opp.deadline} /></td>
                              <td>
                                <div className="pa-match"><span className="num">{opp.relevance}%</span><span className="pa-bar"><i style={{width:`${opp.relevance}%`}} /></span></div>
                              </td>
                              <td onClick={e => e.stopPropagation()}>
                                <div className="pa-rowact">
                                  {resultMode === "ai" && <button type="button" className="pa-btn sm pa-hide-sm" onClick={() => generateDraft(opp)}>Draft</button>}
                                  <button type="button" className="pa-btn sm" aria-expanded={open} onClick={() => setExpandedKey(open ? null : opp._key)}>{open ? "Hide" : "Details"}</button>
                                </div>
                              </td>
                            </tr>,
                            open && (
                              <tr key={`${opp._key}-d`} className="pa-detail">
                                <td colSpan={6}>
                                  <div className="pa-detail-grid">
                                    <div>
                                      <p>{opp.description || "No description available."}</p>
                                      {opp.aiReason && <p className="pa-sub" style={{marginTop:10}}>Why it matches: {opp.aiReason}</p>}
                                      {opp.nextStep && <p style={{marginTop:10}}><b style={{fontWeight:600}}>Next step:</b> {opp.nextStep}</p>}
                                      {opp.tags.length > 0 && <div className="pa-tags">{opp.tags.map(t => <span key={t} className="pa-pill">{t}</span>)}</div>}
                                    </div>
                                    <div>
                                      <dl className="pa-dl">
                                        <dt>Reference</dt><dd>{opp.refNo || "Not stated"}</dd>
                                        <dt>Category</dt><dd>{opp.category || "Not stated"}</dd>
                                        <dt>Portal</dt><dd>{opp.portal || "Not stated"}</dd>
                                        <dt>Budget</dt><dd className="num">{fmtMoney(opp.budget)}</dd>
                                      </dl>
                                      <div className="pa-actions" style={{marginTop:16}}>
                                        {resultMode === "ai" && <button type="button" className="pa-btn sm primary" onClick={() => generateDraft(opp)}>Draft expression of interest</button>}
                                        {url && <a className="pa-btn sm" href={url} target="_blank" rel="noopener noreferrer">Open listing ↗</a>}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          ];
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <p className="pa-note">
                  {resultMode === "ai"
                    ? "Listings and match scores are produced by an AI model from public web search. Confirm the title, deadline, budget and reference on the official portal before bidding."
                    : "These pages come only from the selected portals but have not been checked by AI, so some will not be open tenders. Open each listing to check it on the portal."}
                </p>
                {searchDetailsBlock}
                {resultMode === "ai" && reviewedBlock}
              </>
            )}
          </div>
        )}

        {activeTab === "draft" && (
          <div className="pa-narrow">
            <div className="pa-head">
              <div>
                <h1>Draft</h1>
                <p>Expression of interest for the selected opportunity.</p>
              </div>
              {draftOpp && <button type="button" className="pa-btn" onClick={() => setActiveTab("results")}>Back to opportunities</button>}
            </div>

            {!draftOpp ? (
              <section className="pa-card pa-empty">
                <b>No opportunity selected</b>
                <p>Choose Draft on any opportunity to generate an expression of interest.</p>
                <button type="button" className="pa-btn primary" onClick={() => setActiveTab("results")}>View opportunities</button>
              </section>
            ) : (
              <>
                <section className="pa-card">
                  <div className="pa-card-b">
                    <div className="pa-title" style={{fontSize:15}}>{draftOpp.title}</div>
                    <div className="pa-sub">{[draftOpp.agency, draftOpp.refNo, Number(draftOpp.budget) > 0 ? fmtMoney(draftOpp.budget) : null, draftOpp.deadline ? `Closes ${draftOpp.deadline}` : null].filter(Boolean).join("  ·  ")}</div>
                  </div>
                </section>

                <section className="pa-card">
                  <div className="pa-card-h"><h2>Expression of interest</h2><span className="pa-hint">{draftLoading ? "Drafting…" : "Editable"}</span></div>
                  <textarea className="pa-in pa-draft" aria-label="Draft text" value={draftLoading ? "" : draft} placeholder={draftLoading ? "Drafting the expression of interest…" : ""} onChange={e => setDraft(e.target.value)} disabled={draftLoading} />
                </section>

                <div className="pa-actions">
                  <button type="button" className="pa-btn primary" onClick={copyDraft} disabled={draftLoading || !draft}>{copied ? "Copied" : "Copy text"}</button>
                  <button type="button" className="pa-btn" onClick={() => generateDraft(draftOpp)} disabled={draftLoading}>Regenerate</button>
                  {safeUrl(draftOpp.sourceUrl) && <a className="pa-btn" href={safeUrl(draftOpp.sourceUrl)} target="_blank" rel="noopener noreferrer">Open listing ↗</a>}
                </div>
                <p className="pa-note">Review and edit the draft before sending. It is generated by an AI model from the listing summary and your business profile.</p>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="pa-foot">GEEK-AI Procurement Intelligence · Singapore · Search by LangSearch · AI-assisted analysis</footer>
    </div>
  );
}
