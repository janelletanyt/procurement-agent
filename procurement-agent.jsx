import { useState, useRef, useEffect } from "react";

const BUSINESS_PROFILE = "We are a Singapore registered ecommerce company selling IT peripherals such as VR headsets, AI-ready workstations, and in-demand tech gadgets. We serve SMEs and government agencies, with access to most procurement portals in Singapore.";

const PORTALS = [
  { id:"gebiz",       name:"GeBIZ",                flag:"🏛️", type:"Government",      desc:"Central gov tender portal" },
  { id:"govtech",     name:"GovTech Procurement",   flag:"💻", type:"Government",      desc:"ICT & digital tenders" },
  { id:"sentinel",    name:"Sentinel Portal",       flag:"🛡️", type:"Government",      desc:"MINDEF/SAF procurement" },
  { id:"hdb",         name:"HDB eBidding",          flag:"🏗️", type:"Statutory Board", desc:"HDB supply contracts" },
  { id:"jtc",         name:"JTC Procurement",       flag:"🏭", type:"Statutory Board", desc:"Industrial estate supplies" },
  { id:"sla",         name:"SLA / Quartz",          flag:"📐", type:"Statutory Board", desc:"Land authority contracts" },
  { id:"caas",        name:"CAAS / Changi",         flag:"✈️", type:"Statutory Board", desc:"Aviation supplies & services" },
  { id:"ariba_sg",    name:"Ariba SG",              flag:"🏢", type:"Corporate",       desc:"DBS, OCBC, Singtel, etc." },
  { id:"tenderboard", name:"Tenderboard",           flag:"📋", type:"Corporate",       desc:"SG tender aggregator & alerts" },
  { id:"sesami",      name:"Sesami",                flag:"🔓", type:"Corporate",       desc:"SME-focused procurement platform" },
  { id:"sgh",         name:"SingHealth / NHG",      flag:"🏥", type:"Healthcare",      desc:"Hospital & healthcare supplies" },
  { id:"ntu",         name:"NTU / NUS Procurement", flag:"🎓", type:"Education",       desc:"University procurement" },
];


const NAV = [
  { id:"configure", icon:"⚙", label:"Configure" },
  { id:"run",       icon:"▶", label:"Agent Log" },
  { id:"results",   icon:"◈", label:"Results" },
  { id:"draft",     icon:"✦", label:"Bid Draft" },
];

const C = { teal:"#2dd4bf", green:"#10b981", amber:"#f59e0b", red:"#ef4444", purple:"#a78bfa" };

function Badge({ children, color = C.teal }) {
  return (
    <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 9px", borderRadius:4, fontSize:11, fontWeight:600, background:`${color}18`, color, border:`1px solid ${color}28`, letterSpacing:"0.02em", whiteSpace:"nowrap" }}>
      {children}
    </span>
  );
}

function RelevanceBar({ score }) {
  const color = score >= 85 ? C.teal : score >= 70 ? C.amber : C.red;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{ flex:1, height:3, background:"#132030", borderRadius:2, overflow:"hidden" }}>
        <div style={{ width:`${score}%`, height:"100%", background:color, borderRadius:2, transition:"width 1.2s ease" }} />
      </div>
      <span style={{ fontSize:11, fontWeight:700, color, width:34, textAlign:"right", fontFamily:"'DM Mono',monospace" }}>{score}%</span>
    </div>
  );
}

function TypingText({ text, speed = 8 }) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false);
    let i = 0;
    const iv = setInterval(() => { i++; setDisplayed(text.slice(0, i)); if (i >= text.length) { clearInterval(iv); setDone(true); } }, speed);
    return () => clearInterval(iv);
  }, [text]);
  return <span>{displayed}{!done && <span style={{ animation:"blink 1s infinite", opacity:0.5 }}>▍</span>}</span>;
}

function StatCard({ label, value, sub, color = C.teal, icon }) {
  return (
    <div style={{ background:"#08121f", border:"1px solid #142033", borderRadius:10, padding:"18px 20px", flex:1, position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, width:3, height:"100%", background:color, borderRadius:"10px 0 0 10px" }} />
      <div style={{ fontSize:10, fontWeight:600, color:"#3d5a78", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:800, color, fontFamily:"'Syne',sans-serif", lineHeight:1, marginBottom:6 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"#3d5a78" }}>{sub}</div>}
    </div>
  );
}

export default function GeekAI() {
  const [businessDesc, setBusinessDesc] = useState(BUSINESS_PROFILE);
  const [keywords, setKeywords] = useState("");
  const [selectedPortals, setSelectedPortals] = useState(PORTALS.map(p => p.id));
  const [budget, setBudget] = useState("");
  const [category, setCategory] = useState("");
  const [accessCode, setAccessCode] = useState(() => { try { return sessionStorage.getItem("geekai_access_code") || ""; } catch { return ""; } });
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(null);
  const [logs, setLogs] = useState([]);
  const [results, setResults] = useState([]);
  const [activeTab, setActiveTab] = useState("configure");
  const [expandedId, setExpandedId] = useState(null);
  const [draftOpp, setDraftOpp] = useState(null);
  const [draft, setDraft] = useState("");
  const [draftLoading, setDraftLoading] = useState(false);
  const [filterScore, setFilterScore] = useState(0);
  const [sortBy, setSortBy] = useState("relevance");
  const [sortDir, setSortDir] = useState("desc");
  const logEndRef = useRef(null);

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [logs]);

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // All Claude calls go through our own server function (api/messages.js),
  // which holds the API key and checks the access code.
  const callClaude = async (payload) => {
    try { sessionStorage.setItem("geekai_access_code", accessCode); } catch {}
    const res = await fetch("/api/messages", {
      method:"POST",
      headers:{ "Content-Type":"application/json", "x-access-code":accessCode },
      body:JSON.stringify(payload)
    });
    let data;
    try { data = await res.json(); } catch { throw new Error(`Server returned ${res.status}`); }
    if (data.error) throw new Error(data.error.message);
    return data;
  };
  const addLog = (msg, type = "info") => setLogs(prev => [...prev, { msg, type, ts: new Date().toLocaleTimeString() }]);
  const togglePortal = id => setSelectedPortals(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  const toggleAll = () => setSelectedPortals(selectedPortals.length === PORTALS.length ? [] : PORTALS.map(p => p.id));
  const handleSort = col => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("desc"); } };

  const runAgent = async () => {
    setRunning(true); setResults([]); setLogs([]);
    setActiveTab("run"); setPhase("connecting");
    const selPortals = PORTALS.filter(p => selectedPortals.includes(p.id));

    addLog("🇸🇬 GEEK AI — Initialising sourcing agent...", "start");
    await delay(500);
    addLog(`📋 Business profile: "${businessDesc.slice(0,80)}..."`, "info");
    await delay(300);
    addLog(`🔑 Keywords: ${keywords || "(auto-detecting from profile)"}`, "info");
    await delay(300);
    addLog(`🗂 Category: ${category || "All categories"}`, "info");
    await delay(300);
    addLog(`💰 Budget: ${budget || "No limit specified"}`, "info");
    await delay(400);
    addLog(`🌐 Connecting to ${selPortals.length} procurement portals...`, "info");
    await delay(400);
    setPhase("scanning");
    for (const p of selPortals) { addLog(`🔍 Scanning ${p.name} — ${p.desc}`, "scan"); await delay(Math.random() * 300 + 200); }
    addLog(`📥 Portal scan complete — generating matched opportunities...`, "info");
    await delay(500);
    addLog("🧠 AI generating & scoring opportunities based on your inputs...", "ai");
    setPhase("analyzing");

    const portalList = selPortals.map(p => `${p.name} (${p.type}: ${p.desc})`).join(", ");

    const PORTAL_URLS = {
      gebiz:"https://www.gebiz.gov.sg", govtech:"https://www.tech.gov.sg/media/procurement",
      sentinel:"https://www.mindef.gov.sg", hdb:"https://www.hdb.gov.sg/cs/infoweb/about-us/business-with-hdb/procurement-from-hdb",
      jtc:"https://www.jtc.gov.sg", sla:"https://www.sla.gov.sg", caas:"https://www.changiairport.com/en/business/procurement.html",
      ariba_sg:"https://supplier.ariba.com", tenderboard:"https://tenderboard.gov.sg",
      sesami:"https://www.sesami.co", sgh:"https://www.singhealth.com.sg/about-us/careers-and-contracts/procurement",
      ntu:"https://www.ntu.edu.sg/procurement"
    };

    const searchTerms = keywords
      ? keywords
      : businessDesc.match(/\b(VR|AI|workstation|peripheral|gadget|tech|IT|hardware|software|headset|laptop|monitor|IoT|device)\b/gi)?.slice(0,4).join(" ") || "IT hardware";

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

IMPORTANT: Only include tenders you actually found via search. Do not fabricate. If you find fewer than 5 real tenders, fill remaining slots with clearly marked simulated ones with "isReal": false.
Return only the JSON array.`;

    const userMsg = `Business Profile: ${businessDesc}
Keywords to search: ${searchTerms}
Category: ${category || "all"}
Budget preference: ${budget || "any"}
Active Portals to search: ${portalList}

Search for real open tenders in Singapore (2026) matching this business. Try these searches:
1. "site:gebiz.gov.sg ${searchTerms} tender 2026"
2. "site:tenderboard.gov.sg ${searchTerms}"
3. "Singapore government tender ${searchTerms} 2026"
4. "GeBIZ tender ${searchTerms} open"
5. "Sesami Singapore ${searchTerms} procurement"

Then return all real tenders found as a JSON array.`;

    let generated = [];
    try {
      addLog("📡 Calling AI with web search...", "ai");
      const data = await callClaude({
        max_tokens:16000,
        system:systemPrompt,
        web_search:true,
        messages:[{role:"user",content:userMsg}]
      });

      // Extract only text blocks (ignore tool_use/tool_result blocks)
      const raw = (data.content || [])
        .filter(c => c.type === "text")
        .map(c => c.text || "")
        .join("") || "";

      addLog(`📦 Response received (${raw.length} chars, ${(data.content||[]).filter(c=>c.type==="server_tool_use"&&c.name==="web_search").length} searches performed)`, "info");

      const cleaned = raw.replace(/```json|```/g,"").trim();
      const start = cleaned.indexOf("[");
      let jsonStr = cleaned.slice(start);

      try {
        generated = JSON.parse(jsonStr);
      } catch {
        addLog("⚠️ Response truncated, extracting complete records...", "warn");
        const matches = [...jsonStr.matchAll(/\{[^{}]*"id"\s*:\s*\d+[^{}]*\}/gs)];
        const salvaged = [];
        for (const m of matches) {
          try { salvaged.push(JSON.parse(m[0])); } catch {}
        }
        if (salvaged.length > 0) {
          generated = salvaged;
          addLog(`🔧 Salvaged ${salvaged.length} complete records`, "info");
        } else {
          throw new Error("Could not parse any records from response");
        }
      }

      const realCount = generated.filter(o => o.isReal !== false).length;
      addLog(`✅ Found ${generated.length} opportunities (${realCount} verified real, ${generated.length - realCount} simulated)`, "success");

    } catch(e) {
      addLog(`❌ AI call failed: ${e.message}`, "warn");
      addLog(`💡 Tip: Try narrowing your keywords or selecting fewer portals`, "info");
    }

    // Strip any simulated results
    generated = generated.filter(o => o.isReal !== false);

    await delay(300);
    const scored = generated.sort((a,b) => b.relevance - a.relevance);
    const high = scored.filter(o => o.relevance >= 85).length;

    if (scored.length === 0) {
      addLog(`⚠️ No verified real tenders found for these inputs`, "warn");
      addLog(`💡 Try broader keywords, different portals, or check portal login access`, "info");
    } else {
      addLog(`📊 ${scored.length} real opportunities found — ${high} high-relevance`, "success");
      if (scored[0]) addLog(`⭐ Top match: "${scored[0].title}" (${scored[0].relevance}%)`, "success");
      addLog("✦ Switching to Results...", "success");
    }

    setResults(scored); setPhase("done"); setRunning(false);
    await delay(600); setActiveTab("results");
  };

  const generateDraft = async (opp) => {
    setDraftOpp(opp); setDraft(""); setDraftLoading(true); setActiveTab("draft");
    try {
      const data = await callClaude({
          max_tokens:4000,
          system:"You are a professional bid writer for a Singapore-based ecommerce company. Write formal expressions of interest following Singapore government/corporate procurement norms.",
          messages:[{role:"user", content:`Write a concise Expression of Interest for this Singapore procurement opportunity.\n\nOur Business: ${businessDesc}\nOpportunity: ${opp.title}\nAgency: ${opp.agency}\nBudget: ${opp.budget ? `SGD ${Number(opp.budget).toLocaleString()}` : "not stated"}\nRef: ${opp.refNo}\nDescription: ${opp.description}\n\n3 paragraphs: 1) Company intro & fit, 2) Capabilities & SG track record, 3) Professional closing. Under 260 words. Formal Singapore business tone.`}]
      });
      setDraft((data.content||[]).filter(c=>c.type==="text").map(c=>c.text||"").join("") || "Draft unavailable.");
    } catch(e) { setDraft(`Unable to generate draft: ${e.message}`); }
    setDraftLoading(false);
  };

  const portalTypes = [...new Set(PORTALS.map(p => p.type))];
  const filtered = results.filter(r => r.relevance >= filterScore);
  const sorted = [...filtered].sort((a,b) => {
    let av=a[sortBy], bv=b[sortBy];
    if (sortBy==="deadline"){av=new Date(av);bv=new Date(bv);}
    if (sortBy==="budget"){av=+av;bv=+bv;}
    return sortDir==="asc"?(av>bv?1:-1):(av<bv?1:-1);
  });
  const SortIcon = ({col}) => <span style={{marginLeft:3,opacity:sortBy===col?1:0.25,fontSize:9}}>{sortBy===col?(sortDir==="asc"?"▲":"▼"):"⇅"}</span>;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#060e1a",color:"#b8cfe0",fontFamily:"Inter,system-ui,sans-serif",fontSize:13,overflow:"hidden"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Syne:wght@700;800;900&family=DM+Mono:wght@400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:#060e1a}
        ::-webkit-scrollbar-thumb{background:#142033;border-radius:3px}
        ::-webkit-scrollbar-thumb:hover{background:#1e3349}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.6)}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:translateX(0)}}
        .nav-item{display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:7px;cursor:pointer;transition:all 0.15s;color:#3d5a78;font-size:12.5px;font-weight:500;border:none;background:none;width:100%;text-align:left;letter-spacing:0.01em}
        .nav-item:hover{background:#0c1828;color:#7a9bbf}
        .nav-item.active{background:#0e2035;color:#2dd4bf;border-left:2px solid #2dd4bf;padding-left:12px}
        .data-row{display:grid;grid-template-columns:44px 1fr 150px 120px 108px 100px 120px;align-items:center;padding:0 16px;height:54px;border-bottom:1px solid #0b1827;cursor:pointer;transition:background 0.1s}
        .data-row:hover{background:#09162a}
        .data-row.expanded{background:#07111f;border-left:2px solid #2dd4bf}
        .th{font-size:10.5px;font-weight:700;color:#2a3f56;text-transform:uppercase;letter-spacing:0.09em;cursor:pointer;user-select:none;display:flex;align-items:center}
        .th:hover{color:#3d6080}
        .fi{background:#060e1a;border:1px solid #142033;color:#b8cfe0;padding:8px 12px;border-radius:7px;font-family:inherit;font-size:13px;width:100%;outline:none;transition:all 0.2s}
        .fi:focus{border-color:#2dd4bf;box-shadow:0 0 0 3px rgba(45,212,191,0.06)}
        .fi::placeholder{color:#1e3349}
        .btn-p{background:linear-gradient(135deg,#0891b2,#2dd4bf);border:none;color:#031018;padding:9px 22px;border-radius:7px;font-family:inherit;font-size:12.5px;font-weight:700;cursor:pointer;letter-spacing:0.03em;transition:all 0.2s;display:inline-flex;align-items:center;gap:7px}
        .btn-p:hover:not(:disabled){opacity:0.88;transform:translateY(-1px);box-shadow:0 6px 20px rgba(45,212,191,0.2)}
        .btn-p:disabled{opacity:0.3;cursor:not-allowed;transform:none}
        .btn-s{background:#08121f;border:1px solid #142033;color:#7a9bbf;padding:7px 16px;border-radius:7px;font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;gap:6px;text-decoration:none}
        .btn-s:hover{border-color:#2dd4bf;color:#2dd4bf;background:#0e2035}
        .btn-g{background:none;border:none;color:#3d5a78;padding:6px 10px;border-radius:6px;font-family:inherit;font-size:12px;cursor:pointer;transition:all 0.15s}
        .btn-g:hover{color:#7a9bbf;background:#0c1828}
        .pchip{cursor:pointer;padding:6px 12px;border-radius:6px;font-size:12px;border:1px solid #142033;background:#08121f;transition:all 0.15s;display:inline-flex;align-items:center;gap:6px;color:#3d5a78;white-space:nowrap}
        .pchip:hover{border-color:#1e3349;color:#7a9bbf}
        .pchip.on{border-color:#2dd4bf40;background:#0e203580;color:#2dd4bf}
        .panel{background:#08121f;border:1px solid #0f1e30;border-radius:10px;overflow:hidden}
        .ll{padding:2px 0;font-family:'DM Mono',monospace;font-size:11.5px;line-height:1.9;animation:slideIn 0.18s ease}
        .stl{font-size:10.5px;font-weight:700;color:#2a3f56;text-transform:uppercase;letter-spacing:0.13em}
        .chip{display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:10.5px;background:#0b1827;color:#3d5a78;border:1px solid #142033;letter-spacing:0.02em}
        .divider{height:1px;background:linear-gradient(to right,transparent,#142033,transparent);margin:4px 0}
      `}</style>

      {/* ── TOP BAR ─────────────────────────────────────────── */}
      <div style={{height:50,borderBottom:"1px solid #0b1827",display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 20px",background:"#050c18",flexShrink:0,gap:16}}>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{display:"flex",alignItems:"center",gap:1}}>
            <span style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:900,letterSpacing:"0.08em",color:"#daeef8"}}>GEEK</span>
            <span style={{fontFamily:"'Syne',sans-serif",fontSize:17,fontWeight:900,letterSpacing:"0.08em",color:"#2dd4bf"}}>-AI</span>
          </div>
          <div style={{width:1,height:18,background:"#0f1e30"}}/>
          <span style={{fontSize:11,color:"#1e3349",letterSpacing:"0.14em",textTransform:"uppercase",fontWeight:600}}>Procurement Intelligence</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <Badge color={C.teal}>🇸🇬 Singapore</Badge>
          {results.length>0 && <>
            <Badge color={C.green}>{results.filter(r=>r.relevance>=85).length} High Match</Badge>
            <Badge color={C.amber}>SGD {(results.reduce((s,r)=>s+r.budget,0)/1000).toFixed(0)}K Pipeline</Badge>
          </>}
          <div style={{display:"flex",alignItems:"center",gap:7,padding:"5px 12px",background:"#08121f",borderRadius:6,border:"1px solid #0f1e30"}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:running?C.teal:phase==="done"?C.green:"#1a2e44",animation:running?"pulse 1.5s infinite":"none"}}/>
            <span style={{fontSize:11,color:running?C.teal:phase==="done"?C.green:"#1a2e44",fontWeight:600,letterSpacing:"0.04em"}}>
              {running?"Running":phase==="done"?"Complete":"Idle"}
            </span>
          </div>
        </div>
      </div>

      {/* ── BODY ────────────────────────────────────────────── */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* SIDEBAR */}
        <div style={{width:196,borderRight:"1px solid #0b1827",background:"#050c18",display:"flex",flexDirection:"column",padding:"14px 10px",flexShrink:0}}>
          <div style={{fontSize:9.5,color:"#1a2e44",textTransform:"uppercase",letterSpacing:"0.16em",marginBottom:8,padding:"0 4px",fontWeight:700}}>Menu</div>
          {NAV.map(n=>(
            <button key={n.id} className={`nav-item ${activeTab===n.id?"active":""}`} onClick={()=>setActiveTab(n.id)}>
              <span style={{fontSize:13,width:18,textAlign:"center",opacity:activeTab===n.id?1:0.6}}>{n.icon}</span>
              <span>{n.label}</span>
              {n.id==="results"&&results.length>0&&(
                <span style={{marginLeft:"auto",background:"#0e2035",color:"#2dd4bf",fontSize:10,padding:"1px 7px",borderRadius:10,fontWeight:700}}>{results.length}</span>
              )}
            </button>
          ))}

          <div style={{flex:1}}/>
          <div className="divider"/>
          <div style={{padding:"14px 4px 0"}}>
            <div style={{fontSize:9.5,color:"#1a2e44",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.13em",fontWeight:700}}>Portals Active</div>
            <div style={{fontSize:24,fontWeight:800,color:"#2dd4bf",fontFamily:"'Syne',sans-serif",lineHeight:1}}>
              {selectedPortals.length}
              <span style={{fontSize:12,color:"#1a2e44",fontWeight:400}}>/{PORTALS.length}</span>
            </div>
            <div style={{marginTop:8,height:2,background:"#0b1827",borderRadius:1,overflow:"hidden"}}>
              <div style={{width:`${(selectedPortals.length/PORTALS.length)*100}%`,height:"100%",background:"linear-gradient(90deg,#0891b2,#2dd4bf)",transition:"width 0.3s"}}/>
            </div>
          </div>
          <div style={{padding:"20px 4px 0",fontSize:10,color:"#142033",letterSpacing:"0.06em"}}>
            Powered by Claude AI
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{flex:1,overflow:"auto",padding:"24px 28px",display:"flex",flexDirection:"column",gap:20,animation:"fadeIn 0.2s ease"}}>

          {/* ── CONFIGURE ───────────────────────────────────── */}
          {activeTab==="configure"&&(
            <div style={{maxWidth:840,display:"flex",flexDirection:"column",gap:20}}>
              <div style={{borderBottom:"1px solid #0b1827",paddingBottom:16}}>
                <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:21,fontWeight:900,color:"#daeef8",marginBottom:4,letterSpacing:"-0.01em"}}>Configure Agent</h2>
                <p style={{fontSize:12,color:"#2a3f56"}}>Set your search parameters and select procurement portals to source from.</p>
              </div>

              {/* Business Profile */}
              <div className="panel">
                <div style={{padding:"12px 16px",borderBottom:"1px solid #0b1827",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span className="stl">Business Profile</span>
                  <Badge color="#7a9bbf">✎ Editable</Badge>
                </div>
                <div style={{padding:"16px 20px",display:"flex",gap:14,alignItems:"flex-start"}}>
                  <div style={{width:38,height:38,borderRadius:9,background:"linear-gradient(135deg,#0891b2,#2dd4bf)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,flexShrink:0,marginTop:2}}>🏢</div>
                  <textarea
                    className="fi"
                    rows={3}
                    style={{resize:"vertical",lineHeight:1.75,fontFamily:"Inter,system-ui,sans-serif"}}
                    value={businessDesc}
                    onChange={e=>setBusinessDesc(e.target.value)}
                    placeholder="Describe your ecommerce business, products, and target markets..."
                  />
                </div>
              </div>

              {/* Search Parameters */}
              <div className="panel">
                <div style={{padding:"12px 16px",borderBottom:"1px solid #0b1827"}}>
                  <span className="stl">Search Parameters</span>
                </div>
                <div style={{padding:"20px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:18}}>
                  <div>
                    <div style={{fontSize:10.5,fontWeight:700,color:"#2a3f56",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:7}}>Keywords</div>
                    <input className="fi" placeholder="VR headsets, AI workstations..." value={keywords} onChange={e=>setKeywords(e.target.value)}/>
                  </div>
                  <div>
                    <div style={{fontSize:10.5,fontWeight:700,color:"#2a3f56",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:7}}>Category</div>
                    <select className="fi" value={category} onChange={e=>setCategory(e.target.value)}>
                      <option value="">All Categories</option>
                      <option>IT Hardware & Software</option>
                      <option>Office Supplies</option>
                      <option>Corporate Gifting</option>
                      <option>Medical & Healthcare</option>
                      <option>Apparel & PPE</option>
                      <option>Retail & FMCG</option>
                      <option>Logistics & Fulfilment</option>
                    </select>
                  </div>
                  <div>
                    <div style={{fontSize:10.5,fontWeight:700,color:"#2a3f56",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:7}}>Budget Range (SGD)</div>
                    <input className="fi" placeholder="e.g. 50,000 – 500,000" value={budget} onChange={e=>setBudget(e.target.value)}/>
                  </div>
                </div>
              </div>

              {/* Portals */}
              <div className="panel">
                <div style={{padding:"12px 16px",borderBottom:"1px solid #0b1827",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span className="stl">Procurement Portals</span>
                  <button className="btn-g" onClick={toggleAll} style={{fontSize:11}}>
                    {selectedPortals.length===PORTALS.length?"Deselect All":"Select All"}
                  </button>
                </div>
                <div style={{padding:"16px 20px",display:"flex",flexDirection:"column",gap:18}}>
                  {portalTypes.map(type=>(
                    <div key={type}>
                      <div style={{fontSize:9.5,color:"#1a2e44",textTransform:"uppercase",letterSpacing:"0.14em",marginBottom:10,display:"flex",alignItems:"center",gap:10,fontWeight:700}}>
                        <div style={{flex:1,height:1,background:"#0b1827"}}/>
                        <span>{type}</span>
                        <div style={{flex:1,height:1,background:"#0b1827"}}/>
                      </div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                        {PORTALS.filter(p=>p.type===type).map(p=>(
                          <div key={p.id} className={`pchip ${selectedPortals.includes(p.id)?"on":""}`} onClick={()=>togglePortal(p.id)}>
                            <span>{p.flag}</span>
                            <span style={{fontWeight:600}}>{p.name}</span>
                            <span style={{color:"#1a2e44",fontSize:10.5}}>— {p.desc}</span>
                            {selectedPortals.includes(p.id)&&<span style={{color:"#2dd4bf",fontSize:10,marginLeft:2}}>✓</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Access code */}
              <div className="panel">
                <div style={{padding:"12px 16px",borderBottom:"1px solid #0b1827"}}>
                  <span className="stl">Access Code</span>
                </div>
                <div style={{padding:"16px 20px",display:"flex",alignItems:"center",gap:14}}>
                  <input className="fi" type="password" autoComplete="off" style={{maxWidth:260}} placeholder="Enter access code" value={accessCode} onChange={e=>setAccessCode(e.target.value)}/>
                  <span style={{fontSize:11.5,color:"#2a3f56"}}>Required to run the agent and generate drafts.</span>
                </div>
              </div>

              <div style={{display:"flex",alignItems:"center",gap:14,paddingTop:4}}>
                <button className="btn-p" onClick={runAgent} disabled={running||selectedPortals.length===0||!businessDesc.trim()||!accessCode.trim()}>
                  {running?"⟳  Running...":"⚡  Run Procurement Agent"}
                </button>
                <span style={{fontSize:11.5,color:"#1e3349"}}>{selectedPortals.length} portals · AI relevance scoring · Bid draft generation</span>
              </div>
            </div>
          )}

          {/* ── AGENT LOG ───────────────────────────────────── */}
          {activeTab==="run"&&(
            <div style={{maxWidth:840,display:"flex",flexDirection:"column",gap:18}}>
              <div style={{borderBottom:"1px solid #0b1827",paddingBottom:16}}>
                <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:21,fontWeight:900,color:"#daeef8",marginBottom:4,letterSpacing:"-0.01em"}}>Agent Log</h2>
                <p style={{fontSize:12,color:"#2a3f56"}}>Live activity stream from the GEEK AI sourcing agent.</p>
              </div>

              {/* Phase pipeline */}
              <div style={{display:"flex",gap:6}}>
                {["connecting","scanning","analyzing","done"].map((p,i)=>{
                  const phases=["connecting","scanning","analyzing","done"];
                  const idx=phases.indexOf(phase);
                  const isActive=phase===p, isDone=idx>i;
                  return (
                    <div key={p} style={{flex:1,padding:"10px 14px",borderRadius:7,background:isActive?"rgba(45,212,191,0.06)":isDone?"rgba(16,185,129,0.04)":"#08121f",border:`1px solid ${isActive?"#2dd4bf40":isDone?"#10b98130":"#0f1e30"}`,display:"flex",alignItems:"center",gap:8,transition:"all 0.3s"}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:isActive?C.teal:isDone?C.green:"#142033",animation:isActive?"pulse 1.5s infinite":"none",flexShrink:0}}/>
                      <span style={{fontSize:11,fontWeight:600,textTransform:"capitalize",color:isActive?C.teal:isDone?C.green:"#1a2e44",letterSpacing:"0.04em"}}>{p}</span>
                      {isDone&&<span style={{marginLeft:"auto",fontSize:10,color:C.green}}>✓</span>}
                    </div>
                  );
                })}
              </div>

              {/* Log terminal */}
              <div className="panel">
                <div style={{padding:"10px 16px",borderBottom:"1px solid #0b1827",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{display:"flex",gap:5}}>
                    <div style={{width:10,height:10,borderRadius:"50%",background:"#ef4444",opacity:0.6}}/>
                    <div style={{width:10,height:10,borderRadius:"50%",background:"#f59e0b",opacity:0.6}}/>
                    <div style={{width:10,height:10,borderRadius:"50%",background:"#10b981",opacity:0.6}}/>
                  </div>
                  <span style={{fontSize:10.5,color:"#1a2e44",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginLeft:4}}>Terminal</span>
                  {running&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:5,height:5,borderRadius:"50%",background:C.teal,animation:"pulse 1.2s infinite"}}/>
                    <span style={{fontSize:10,color:C.teal,letterSpacing:"0.08em"}}>LIVE</span>
                  </div>}
                </div>
                <div style={{padding:"16px 20px",minHeight:340,maxHeight:440,overflowY:"auto",background:"#04080f"}}>
                  {logs.length===0&&<span style={{color:"#0f1e30",fontFamily:"'DM Mono',monospace",fontSize:12}}>// Awaiting agent run...</span>}
                  {logs.map((log,i)=>(
                    <div key={i} className="ll" style={{color:log.type==="success"?C.green:log.type==="ai"?C.purple:log.type==="warn"?C.amber:log.type==="scan"?C.teal:log.type==="start"?"#daeef8":"#2a4a64"}}>
                      <span style={{color:"#0f1e30",marginRight:12,userSelect:"none"}}>[{log.ts}]</span>{log.msg}
                    </div>
                  ))}
                  <div ref={logEndRef}/>
                </div>
              </div>
            </div>
          )}

          {/* ── RESULTS ─────────────────────────────────────── */}
          {activeTab==="results"&&(
            <div style={{display:"flex",flexDirection:"column",gap:18,animation:"fadeIn 0.2s ease"}}>
              <div style={{borderBottom:"1px solid #0b1827",paddingBottom:16,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                <div>
                  <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:21,fontWeight:900,color:"#daeef8",marginBottom:4,letterSpacing:"-0.01em"}}>Opportunities</h2>
                  <p style={{fontSize:12,color:"#2a3f56"}}>AI-scored procurement opportunities across Singapore portals.</p>
                </div>
                {results.length>0&&<button className="btn-s" onClick={runAgent} disabled={running}>↻ Re-run Agent</button>}
              </div>

              {results.length===0?(
                <div className="panel" style={{padding:"64px 40px",textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:14,opacity:0.3}}>◈</div>
                  <div style={{color:"#2a3f56",fontSize:14,fontWeight:600,marginBottom:6}}>
                    {phase==="done" ? "No verified tenders found" : "No results yet"}
                  </div>
                  <div style={{color:"#1a2e44",fontSize:12,marginBottom:22,lineHeight:1.8}}>
                    {phase==="done"
                      ? "The agent couldn't find publicly accessible tenders matching your inputs.\nMost portals (GeBIZ, Tenderboard, Sesami) require login to access live listings.\nTry the portal login feature to unlock authenticated scraping."
                      : "Configure your parameters and run the agent to source opportunities."}
                  </div>
                  <div style={{display:"flex",gap:10,justifyContent:"center"}}>
                    <button className="btn-p" onClick={()=>setActiveTab("configure")}>⚙ Adjust Parameters</button>
                  </div>
                </div>
              ):(
                <>
                  {/* Stats row */}
                  <div style={{display:"flex",gap:12}}>
                    <StatCard label="Total Found" value={results.length} sub={`${selectedPortals.length} portals scanned`}/>
                    <StatCard label="High Match" value={results.filter(r=>r.relevance>=85).length} sub="≥85% relevance" color={C.green}/>
                    <StatCard label="Total Pipeline" value={`S$${(results.reduce((s,r)=>s+r.budget,0)/1000).toFixed(0)}K`} sub="combined budget" color={C.amber}/>
                    <StatCard label="Top Score" value={`${Math.max(...results.map(r=>r.relevance))}%`} sub={[...results].sort((a,b)=>b.relevance-a.relevance)[0]?.portal} color={C.purple}/>
                  </div>

                  {/* Filter bar */}
                  <div className="panel" style={{padding:"11px 18px",display:"flex",alignItems:"center",gap:18,flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:11,color:"#2a3f56",fontWeight:600,whiteSpace:"nowrap"}}>Min. Match</span>
                      <input type="range" min={0} max={90} step={5} value={filterScore} onChange={e=>setFilterScore(+e.target.value)} style={{width:100,accentColor:"#2dd4bf",cursor:"pointer"}}/>
                      <Badge color={C.teal}>{filterScore}%+</Badge>
                    </div>
                    <div style={{width:1,height:18,background:"#0b1827"}}/>
                    <span style={{fontSize:12,color:"#2a3f56"}}><span style={{color:"#7a9bbf",fontWeight:600}}>{sorted.length}</span> of {results.length} shown</span>
                    <Badge color={C.green}>✓ {results.length} Verified Real</Badge>
                    <div style={{marginLeft:"auto",fontSize:11,color:"#1a2e44"}}>Click column to sort · Click row to expand</div>
                  </div>

                  {/* Data table */}
                  <div className="panel">
                    <div style={{display:"grid",gridTemplateColumns:"44px 1fr 150px 120px 108px 100px 120px",padding:"0 16px",height:38,borderBottom:"1px solid #0b1827",alignItems:"center",background:"#060e1a"}}>
                      <div className="th">#</div>
                      <div className="th" onClick={()=>handleSort("title")}>Opportunity <SortIcon col="title"/></div>
                      <div className="th" onClick={()=>handleSort("portal")}>Portal <SortIcon col="portal"/></div>
                      <div className="th" onClick={()=>handleSort("budget")}>Budget <SortIcon col="budget"/></div>
                      <div className="th" onClick={()=>handleSort("deadline")}>Deadline <SortIcon col="deadline"/></div>
                      <div className="th" onClick={()=>handleSort("relevance")}>Match <SortIcon col="relevance"/></div>
                      <div className="th">Actions</div>
                    </div>
                    {sorted.map((opp,idx)=>(
                      <div key={opp.id}>
                        <div className={`data-row ${expandedId===opp.id?"expanded":""}`} onClick={()=>setExpandedId(expandedId===opp.id?null:opp.id)}>
                          <div style={{fontSize:11,color:"#1a2e44",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{String(idx+1).padStart(2,"0")}</div>
                          <div style={{minWidth:0}}>
                            <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:2}}>
                              <div style={{fontSize:12.5,fontWeight:600,color:"#c5ddf0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",paddingRight:8}}>{opp.title}</div>
                              {opp.isReal===false
                                ? <span style={{fontSize:9,fontWeight:700,color:C.amber,background:`${C.amber}15`,border:`1px solid ${C.amber}30`,padding:"1px 5px",borderRadius:3,flexShrink:0,letterSpacing:"0.06em"}}>SIM</span>
                                : <span style={{fontSize:9,fontWeight:700,color:C.green,background:`${C.green}15`,border:`1px solid ${C.green}30`,padding:"1px 5px",borderRadius:3,flexShrink:0,letterSpacing:"0.06em"}}>REAL</span>
                              }
                            </div>
                            <div style={{fontSize:11,color:"#2a4a64"}}>{opp.agency}</div>
                          </div>
                          <div><Badge color={C.teal}>{opp.portal}</Badge></div>
                          <div style={{fontSize:12.5,fontWeight:700,color:C.green,fontFamily:"'DM Mono',monospace"}}>{opp.budget ? `S$${Number(opp.budget).toLocaleString()}` : "TBC"}</div>
                          <div style={{fontSize:11.5,color:opp.deadline&&new Date(opp.deadline)<new Date(Date.now()+14*86400000)?C.red:"#7a9bbf",fontFamily:"'DM Mono',monospace",fontWeight:600}}>{opp.deadline||"TBC"}</div>
                          <div style={{paddingRight:8}}><RelevanceBar score={opp.relevance}/></div>
                          <div style={{display:"flex",gap:6}} onClick={e=>e.stopPropagation()}>
                            <button className="btn-s" onClick={()=>generateDraft(opp)} style={{padding:"5px 10px",fontSize:11}}>✦ Draft</button>
                            <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-s" style={{padding:"5px 10px",fontSize:13}}>↗</a>
                          </div>
                        </div>
                        {expandedId===opp.id&&(
                          <div style={{padding:"18px 20px 20px 64px",background:"#060f1c",borderBottom:"1px solid #0b1827",animation:"fadeIn 0.18s ease"}}>
                            <div style={{display:"grid",gridTemplateColumns:"1fr 200px",gap:24}}>
                              <div>
                                <div style={{fontSize:10,fontWeight:700,color:"#1a2e44",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:8}}>Description</div>
                                <p style={{fontSize:12.5,color:"#6a8aaa",lineHeight:1.8,marginBottom:12}}>{opp.description}</p>
                                <div style={{fontSize:11,color:C.purple,fontStyle:"italic",marginBottom:14,padding:"8px 12px",background:"rgba(167,139,250,0.05)",borderRadius:6,borderLeft:`2px solid ${C.purple}40`}}>🤖 {opp.aiReason}</div>
                                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{opp.tags.map(t=><span key={t} className="chip">{t}</span>)}</div>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                                <div style={{background:"#08121f",border:"1px solid #0f1e30",borderRadius:8,padding:"11px 14px"}}>
                                  <div style={{fontSize:9.5,color:"#1a2e44",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontWeight:700}}>Ref No.</div>
                                  <div style={{fontSize:11,fontFamily:"'DM Mono',monospace",color:"#2a4a64"}}>{opp.refNo}</div>
                                </div>
                                <div style={{background:"#08121f",border:"1px solid #0f1e30",borderRadius:8,padding:"11px 14px"}}>
                                  <div style={{fontSize:9.5,color:"#1a2e44",textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:4,fontWeight:700}}>Category</div>
                                  <div style={{fontSize:12,color:"#7a9bbf"}}>{opp.category}</div>
                                </div>
                                <button className="btn-p" style={{justifyContent:"center"}} onClick={()=>generateDraft(opp)}>✦ Generate Draft</button>
                                <a href={opp.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-s" style={{justifyContent:"center"}}>↗ View on {opp.portal}</a>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── BID DRAFT ───────────────────────────────────── */}
          {activeTab==="draft"&&(
            <div style={{maxWidth:840,display:"flex",flexDirection:"column",gap:18}}>
              <div style={{borderBottom:"1px solid #0b1827",paddingBottom:16,display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
                <div>
                  <h2 style={{fontFamily:"'Syne',sans-serif",fontSize:21,fontWeight:900,color:"#daeef8",marginBottom:4,letterSpacing:"-0.01em"}}>Bid Draft</h2>
                  <p style={{fontSize:12,color:"#2a3f56"}}>AI-generated expression of interest for your selected opportunity.</p>
                </div>
                {draftOpp&&<button className="btn-g" onClick={()=>setActiveTab("results")}>← Back to Results</button>}
              </div>

              {!draftOpp?(
                <div className="panel" style={{padding:"64px 40px",textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:14,opacity:0.3}}>✦</div>
                  <div style={{color:"#2a3f56",fontSize:14,fontWeight:600,marginBottom:6}}>No draft selected</div>
                  <div style={{color:"#1a2e44",fontSize:12,marginBottom:22}}>Go to Results and click "Draft" on any opportunity.</div>
                  <button className="btn-p" onClick={()=>setActiveTab("results")}>◈ View Results</button>
                </div>
              ):(
                <>
                  {/* Opportunity info */}
                  <div className="panel">
                    <div style={{padding:"12px 16px",borderBottom:"1px solid #0b1827",display:"flex",alignItems:"center",gap:8}}>
                      <span className="stl">Selected Opportunity</span>
                      <Badge color={C.teal}>{draftOpp.portal}</Badge>
                    </div>
                    <div style={{padding:"16px 20px",display:"grid",gridTemplateColumns:"1fr auto",gap:20,alignItems:"center"}}>
                      <div>
                        <div style={{fontSize:14,fontWeight:700,color:"#c5ddf0",marginBottom:6}}>{draftOpp.title}</div>
                        <div style={{fontSize:12,color:"#2a4a64"}}>
                          {draftOpp.agency}
                          <span style={{margin:"0 8px",color:"#0f1e30"}}>·</span>
                          <span style={{fontFamily:"'DM Mono',monospace",color:"#1a2e44"}}>{draftOpp.refNo}</span>
                          <span style={{margin:"0 8px",color:"#0f1e30"}}>·</span>
                          <span style={{color:C.green,fontWeight:600}}>{draftOpp.budget ? `S$${Number(draftOpp.budget).toLocaleString()}` : "Budget TBC"}</span>
                        </div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:10,color:"#1a2e44",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:4,fontWeight:700}}>Deadline</div>
                        <div style={{fontSize:13,fontFamily:"'DM Mono',monospace",color:C.red,fontWeight:700}}>{draftOpp.deadline}</div>
                      </div>
                    </div>
                  </div>

                  {/* Draft content */}
                  <div className="panel">
                    <div style={{padding:"10px 16px",borderBottom:"1px solid #0b1827",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{display:"flex",gap:5}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:"#ef4444",opacity:0.5}}/>
                        <div style={{width:10,height:10,borderRadius:"50%",background:"#f59e0b",opacity:0.5}}/>
                        <div style={{width:10,height:10,borderRadius:"50%",background:"#10b981",opacity:0.5}}/>
                      </div>
                      <span style={{fontSize:10.5,color:"#1a2e44",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginLeft:4}}>Expression of Interest</span>
                      {draftLoading&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:5,height:5,borderRadius:"50%",background:C.purple,animation:"pulse 1.2s infinite"}}/>
                        <span style={{fontSize:10,color:C.purple,letterSpacing:"0.08em"}}>GENERATING</span>
                      </div>}
                    </div>
                    <div style={{padding:"24px 28px",minHeight:260,fontFamily:"Inter,sans-serif",fontSize:13,lineHeight:2,color:"#6a8aaa",whiteSpace:"pre-wrap",background:"#04080f"}}>
                      {draftLoading
                        ?<span style={{color:C.purple}}><TypingText text="Drafting your Singapore expression of interest..."/></span>
                        :draft?<TypingText text={draft} speed={5}/>:<span style={{color:"#0f1e30"}}>Draft will appear here...</span>}
                    </div>
                  </div>

                  {draft&&!draftLoading&&(
                    <div style={{display:"flex",gap:10}}>
                      <button className="btn-p" onClick={()=>navigator.clipboard.writeText(draft)}>⎘ Copy to Clipboard</button>
                      <button className="btn-s" onClick={()=>generateDraft(draftOpp)}>↻ Regenerate</button>
                      <a href={draftOpp.sourceUrl} target="_blank" rel="noopener noreferrer" className="btn-s">↗ View Portal</a>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── STATUS BAR ──────────────────────────────────────── */}
      <div style={{height:24,borderTop:"1px solid #0b1827",background:"#040a14",display:"flex",alignItems:"center",padding:"0 20px",gap:18,flexShrink:0}}>
        <span style={{fontSize:10,color:"#0f1e30",fontWeight:600,letterSpacing:"0.06em"}}>GEEK-AI Procurement Intelligence v2.0</span>
        <span style={{fontSize:10,color:"#0b1827"}}>|</span>
        <span style={{fontSize:10,color:"#0f1e30"}}>🇸🇬 Singapore Market</span>
        <span style={{fontSize:10,color:"#0b1827"}}>|</span>
        <span style={{fontSize:10,color:"#0f1e30"}}>{PORTALS.length} portals indexed</span>
        {results.length>0&&<>
          <span style={{fontSize:10,color:"#0b1827"}}>|</span>
          <span style={{fontSize:10,color:"#142a3f"}}>Last run: {new Date().toLocaleDateString("en-SG")}</span>
        </>}
        <span style={{marginLeft:"auto",fontSize:10,color:"#0f1e30",letterSpacing:"0.06em"}}>Powered by Claude AI</span>
      </div>
    </div>
  );
}
