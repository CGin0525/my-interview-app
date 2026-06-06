import { useState, useEffect } from "react";

const GEMINI_API_KEY = "YOUR_API_KEY"; // ← 替换成你的 Gemini API Key
const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const db = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

async function ai(messages, sys, onStream) {
  // 将 Claude 格式的 messages 转换为 Gemini 格式
  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
    contents,
    generationConfig: { maxOutputTokens: 3000 },
  };

  const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // Gemini 免费层不支持流式，用 onStream 模拟一次性回调
  if (onStream) onStream(text);
  return text;
}

function parseJSON(raw) { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }

const uid = () => Date.now() + Math.random();
const sStar = (n) => "⭐".repeat(n) + "☆".repeat(3 - n);
const CAT_C = { "技术攻坚": "#6366f1", "产品思维": "#0ea5e9", "数据分析": "#8b5cf6", "协作沟通": "#10b981", "问题解决": "#f59e0b", "创新优化": "#ec4899", "领导力": "#ef4444", "其他": "#94a3b8" };
const STATUS_C = { "草稿": "#94a3b8", "进行中": "#3b82f6", "待补充": "#ef4444", "完整可用": "#10b981" };
const S_LABEL = { 1: "低含金量", 2: "中含金量", 3: "高含金量" };
const S_BG = { 1: "#fffbeb", 2: "#eff6ff", 3: "#f0fdf4" };
const S_CLR = { 1: "#d97706", 2: "#3b82f6", 3: "#10b981" };
const CATS = ["技术攻坚", "产品思维", "数据分析", "协作沟通", "问题解决", "创新优化", "领导力", "其他"];
const STATUSES = ["草稿", "进行中", "待补充", "完整可用"];

const EMPTY = {
  id: null, title: "", category: "产品思维", difficulty: "中", keywords: [], summary: "", status: "草稿",
  star: { situation: "", task: "", action: "", result: "" },
  dataMetrics: { name: "", formula: "", before: "", after: "" },
  role: "", collaborators: "", reflection: "", iterations: [], excludedOptions: "",
  interviewTips: "", applicableQuestions: [], coreCompetencyTags: [],
  score: 0, pendingItems: [], pendingDate: "", gaps: [], source: "manual",
};

function hydrate(raw) {
  const p = { ...EMPTY, ...raw, star: { ...EMPTY.star, ...(raw.star || {}) }, dataMetrics: { ...EMPTY.dataMetrics, ...(raw.dataMetrics || {}) }, iterations: raw.iterations || [], pendingItems: raw.pendingItems || [], gaps: [], applicableQuestions: raw.applicableQuestions || [], keywords: raw.keywords || [], coreCompetencyTags: raw.coreCompetencyTags || [] };
  p.gaps = diagnose(p);
  return p;
}

function diagnose(p) {
  const g = [];
  const s = p.star || {};
  if (!s.situation || s.situation.length < 20) g.push({ field: "S-背景", q: "业务背景缺少规模信息，面试官必问：你们的 DAU / 用户量 / 业务体量大概是多少？", key: "situation" });
  if (!s.task || s.task.length < 15) g.push({ field: "T-任务", q: "任务描述太模糊，面试官会追问：你具体负责什么？你的 KPI 是什么？", key: "task" });
  if (!s.action || s.action.length < 30) g.push({ field: "A-行动", q: "行动细节不足，面试官必问：你个人做了什么判断？你的方法论是什么？", key: "action" });
  if (!p.excludedOptions || p.excludedOptions.length < 10) g.push({ field: "A-排他决策", q: "缺方案对比，面试官必问：你为什么不选另一个方案？有哪些思路被你排除了？", key: "excludedOptions" });
  if (!s.result || s.result.length < 15) g.push({ field: "R-结果", q: "结果模糊，面试官会追问：上线后数据提升了多少？具体指标是什么？", key: "result" });
  if (!p.dataMetrics?.name || !p.dataMetrics?.before || !p.dataMetrics?.after) g.push({ field: "R-量化数据", q: "缺具体数字，面试官会追问：有没有量化数据？哪怕是估算值？", key: "dataMetrics" });
  if (!p.reflection || p.reflection.length < 10) g.push({ field: "复盘反思", q: "缺复盘，面试官必问：如果重来一次你会怎么做？有什么教训？", key: "reflection" });
  if (!p.collaborators || p.collaborators.length < 5) g.push({ field: "协作推动", q: "缺协作描述，面试官会追问：你是怎么推动跨部门配合的？遇到什么阻力？", key: "collaborators" });
  return g;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [projects, setProjects] = useState(() => db.get("projects") || []);
  const [view, setView] = useState("home");
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stream, setStream] = useState("");
  const [activeTab, setActiveTab] = useState("star");
  const [mockQs, setMockQs] = useState([]);
  const [jdText, setJdText] = useState("");
  const [jdRes, setJdRes] = useState(null);
  const [ivSession, setIvSession] = useState(null);
  const [chatIn, setChatIn] = useState("");
  const [docIn, setDocIn] = useState("");
  const [jsonIn, setJsonIn] = useState("");
  const [fStatus, setFStatus] = useState("全部");
  const [fCat, setFCat] = useState("全部");
  const [notif, setNotif] = useState(null);
  const [mergeSugg, setMergeSugg] = useState([]);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [gapAns, setGapAns] = useState({});
  const [importTab, setImportTab] = useState("chat");

  useEffect(() => { db.set("projects", projects); }, [projects]);

  const toast = (msg, type = "ok") => { setNotif({ msg, type }); setTimeout(() => setNotif(null), 3500); };

  const save = (p) => {
    const proj = { ...p, id: p.id || uid(), gaps: diagnose(p) };
    setProjects(prev => !p.id ? [proj, ...prev] : prev.map(x => x.id === proj.id ? proj : x));
    setSel(proj);
    toast(!p.id ? "项目已创建 ✓" : "已保存 ✓");
  };

  const del = (id) => { setProjects(prev => prev.filter(x => x.id !== id)); setView("home"); toast("已删除", "err"); };

  const openDetail = (p) => { setSel(p); setView("detail"); setActiveTab("star"); setMockQs([]); };

  const pendingCnt = projects.filter(p => p.status === "待补充").length;
  const gapCnt = projects.reduce((a, p) => a + (p.gaps?.length || 0), 0);

  // ── Import: Chat ─────────────────────────────────────────────────────────────
  const importChat = async () => {
    if (!chatIn.trim()) return;
    setLoading(true); setStream("");
    const sys = `你是面试素材提炼专家，专注中国互联网大厂产品/策略/运营秋招。
分析对话，识别所有独立素材单元。切割标准（宁可多切不要漏）：
- 一个改进建议或产品想法 = 一条
- 一个反身性思考或复盘 = 一条  
- 一个独立的判断-行动-结果闭环 = 一条
- 同一项目里的不同决策点也要拆开
严格JSON输出，不要代码块标记：
{"projects":[{"title":"","category":"产品思维","difficulty":"中","keywords":[],"summary":"30字内","star":{"situation":"","task":"","action":"详细，含排除的方案","result":""},"excludedOptions":"","dataMetrics":{"name":"","formula":"","before":"","after":""},"role":"","collaborators":"","reflection":"","interviewTips":"","applicableQuestions":[],"coreCompetencyTags":[],"score":1}],"extraction_note":"切了几条、理由"}`;
    try {
      const raw = await ai([{ role: "user", content: `分析这段对话，提炼所有面试素材：\n\n${chatIn}` }], sys, setStream);
      const parsed = parseJSON(raw);
      const newPs = (parsed.projects || []).map(p => ({ ...hydrate(p), id: uid(), source: "chat" }));
      if (!newPs.length) { toast("未识别到有效素材", "err"); setLoading(false); return; }
      setProjects(prev => [...newPs, ...prev]);
      toast(`✓ 导入 ${newPs.length} 条素材`);
      setView("home"); setStream(""); setChatIn("");
    } catch (e) { toast("解析失败：" + e.message, "err"); }
    setLoading(false);
  };

  // ── Import: Doc ──────────────────────────────────────────────────────────────
  const importDoc = async () => {
    if (!docIn.trim()) return;
    setLoading(true); setStream("");
    const sys = `你是面试素材提炼专家。分析飞书文档，提炼所有独立素材。切割标准同对话导入：宁可多切，不要遗漏任何一个有意义的项目单元。
严格JSON输出，不要代码块标记：
{"projects":[{"title":"","category":"产品思维","difficulty":"中","keywords":[],"summary":"30字内","star":{"situation":"","task":"","action":"","result":""},"excludedOptions":"","dataMetrics":{"name":"","formula":"","before":"","after":""},"role":"","collaborators":"","reflection":"","interviewTips":"","applicableQuestions":[],"coreCompetencyTags":[],"score":1}],"extraction_note":"切了几条、理由"}`;
    try {
      const raw = await ai([{ role: "user", content: `分析飞书文档内容：\n\n${docIn}` }], sys, setStream);
      const parsed = parseJSON(raw);
      const newPs = (parsed.projects || []).map(p => ({ ...hydrate(p), id: uid(), source: "doc" }));
      if (!newPs.length) { toast("未识别到有效素材", "err"); setLoading(false); return; }
      setProjects(prev => [...newPs, ...prev]);
      toast(`✓ 导入 ${newPs.length} 条素材`);
      setView("home"); setStream(""); setDocIn("");
    } catch (e) { toast("解析失败：" + e.message, "err"); }
    setLoading(false);
  };

  // ── Import: JSON ─────────────────────────────────────────────────────────────
  const importJSON = () => {
    if (!jsonIn.trim()) return;
    try {
      const parsed = parseJSON(jsonIn);
      const arr = parsed.projects || (Array.isArray(parsed) ? parsed : [parsed]);
      const newPs = arr.map(p => ({ ...hydrate(p), id: uid(), source: "skill_json" }));
      setProjects(prev => [...newPs, ...prev]);
      toast(`✓ 从 JSON 导入 ${newPs.length} 条`);
      setView("home"); setJsonIn("");
    } catch { toast("JSON 格式错误，请检查", "err"); }
  };

  // ── Smart Merge ──────────────────────────────────────────────────────────────
  const analyzeMerge = async () => {
    if (projects.length < 2) { toast("素材库少于2条，无需合并分析", "warn"); return; }
    setMergeLoading(true);
    const sys = `你是面试素材整合专家。分析素材库，找出「其实是同一件事」的素材对，建议合并。
判断标准：项目名称相似、时间相关、核心业务逻辑重叠、明显是同一个工作项目的不同维度记录。
合并策略：哪个字段更详细/更有数据就取哪个，对话的决策思考 vs 文档的量化数据都要保留。
严格JSON输出：
{"suggestions":[{"ids":["id1","id2"],"reason":"为什么判断是同一件事","mergedTitle":"合并后的标题","mergedSummary":"合并后的摘要","strategy":"哪边的哪个字段更好，保留建议","confidence":"高|中|低"}]}`;
    try {
      const raw = await ai([{ role: "user", content: `素材库：${JSON.stringify(projects.map(p => ({ id: p.id, title: p.title, summary: p.summary, category: p.category, source: p.source, situation: p.star?.situation?.slice(0, 80), keywords: p.keywords })))}` }], sys);
      const parsed = parseJSON(raw);
      setMergeSugg(parsed.suggestions || []);
      if (!parsed.suggestions?.length) toast("未发现重叠素材，素材库已经很整洁 ✓");
    } catch { toast("分析失败", "err"); }
    setMergeLoading(false);
  };

  const executeMerge = async (sugg) => {
    const toMerge = projects.filter(p => sugg.ids.includes(String(p.id)));
    if (toMerge.length < 2) return;
    setMergeLoading(true);
    const sys = `你是面试素材整合专家。将多条素材合并为一条高质量素材。
合并原则：
1. 哪个字段更完整、更有数据、更有决策细节，就取哪个版本
2. 对话来源的决策思考/排除方案 优先保留
3. 文档来源的量化数据/具体结果 优先保留
4. 两边都有的内容，融合而不是截断
5. 合并后重新评估含金量评分

严格JSON输出（单个project对象）：
{"title":"","category":"","difficulty":"","keywords":[],"summary":"","star":{"situation":"","task":"","action":"","result":""},"excludedOptions":"","dataMetrics":{"name":"","formula":"","before":"","after":""},"role":"","collaborators":"","reflection":"","interviewTips":"","applicableQuestions":[],"coreCompetencyTags":[],"score":1}`;
    try {
      const raw = await ai([{ role: "user", content: `合并以下素材：\n${JSON.stringify(toMerge)}` }], sys);
      const merged = parseJSON(raw);
      const mergedProj = { ...hydrate(merged), id: uid(), source: "merged", iterations: [], pendingItems: [] };
      setProjects(prev => [mergedProj, ...prev.filter(p => !sugg.ids.includes(String(p.id)))]);
      setMergeSugg(prev => prev.filter(s => s !== sugg));
      toast("✓ 合并完成，已自动诊断缺口");
      openDetail(mergedProj);
    } catch { toast("合并失败", "err"); }
    setMergeLoading(false);
  };

  // ── Gap Fill ─────────────────────────────────────────────────────────────────
  const fillGap = async (proj, gap) => {
    const ans = gapAns[proj.id + gap.field];
    if (!ans?.trim()) return;
    setLoading(true);
    const sys = `你是面试素材优化专家。根据用户的补充信息，将其融合进现有素材的对应字段，使内容更完整、更有面试含金量。
只输出更新后的完整project JSON对象，不要代码块标记。保持其他字段不变，只优化相关字段。`;
    try {
      const raw = await ai([{ role: "user", content: `现有素材：${JSON.stringify(proj)}\n\n用户针对「${gap.field}」的补充：${ans}\n\n请将补充融合进素材，重新评估score（1-3）。` }], sys);
      const updated = parseJSON(raw);
      const newProj = { ...hydrate(updated), id: proj.id, source: proj.source, iterations: proj.iterations, pendingItems: proj.pendingItems };
      save(newProj);
      setGapAns(prev => { const n = { ...prev }; delete n[proj.id + gap.field]; return n; });
      toast(`✓「${gap.field}」已融合，含金量重新评估`);
    } catch { toast("融合失败", "err"); }
    setLoading(false);
  };

  // ── Mock Questions ───────────────────────────────────────────────────────────
  const genMock = async (proj) => {
    setLoading(true);
    const sys = `你是中国互联网大厂（字节/腾讯/阿里/美团）产品/策略/运营岗面试官。
基于候选人项目，生成5个最可能被追问的行为面试问题 + AI推荐答案。
严格JSON输出：{"questions":[{"q":"问题","a":"推荐答案200字内，含数据、判断、复盘"}]}`;
    try {
      const raw = await ai([{ role: "user", content: `项目：${JSON.stringify(proj)}` }], sys);
      const parsed = parseJSON(raw);
      setMockQs(parsed.questions || []);
    } catch { toast("生成失败", "err"); }
    setLoading(false);
  };

  // ── JD Analysis ──────────────────────────────────────────────────────────────
  const analyzeJD = async () => {
    if (!jdText.trim()) return;
    setLoading(true);
    const sys = `你是资深HR和职业顾问，专注中国互联网大厂秋招。分析JD，匹配候选人素材库。
严格JSON输出：{"company":"","role":"","coreRequirements":[""],"keyCompetencies":[""],"interviewFocus":"100字内","topQuestions":["q1","q2","q3","q4","q5"],"matchedProjectIds":[]}`;
    try {
      const raw = await ai([{ role: "user", content: `JD：\n${jdText}\n\n素材库：${JSON.stringify(projects.map(p => ({ id: p.id, title: p.title, category: p.category, summary: p.summary, coreCompetencyTags: p.coreCompetencyTags, keywords: p.keywords })))}` }], sys);
      const parsed = parseJSON(raw);
      const matched = projects.filter(p => parsed.matchedProjectIds?.includes(p.id) || parsed.matchedProjectIds?.includes(String(p.id))).slice(0, 3);
      if (!matched.length) {
        const fallback = projects.filter(p => parsed.keyCompetencies?.some(c => p.category?.includes(c.slice(0, 2)) || p.keywords?.some(k => c.includes(k)))).slice(0, 3);
        setJdRes({ ...parsed, matchedProjects: fallback });
      } else {
        setJdRes({ ...parsed, matchedProjects: matched });
      }
    } catch { toast("分析失败", "err"); }
    setLoading(false);
  };

  const startIV = async () => {
    if (!jdRes) return;
    setLoading(true);
    const ctx = jdRes.matchedProjects?.map(p => `【${p.title}】${p.summary} | A: ${p.star?.action?.slice(0, 50)} | R: ${p.star?.result?.slice(0, 40)}`).join("\n");
    const sys = `你是${jdRes.company || "大厂"}${jdRes.role || "产品"}岗面试官，正在进行行为面试。候选人素材：\n${ctx}\n每次只问一个问题，根据回答决定追问还是推进。语气专业友好。`;
    const firstQ = jdRes.topQuestions?.[0] || "请先做一下自我介绍，重点介绍你的实习经历。";
    setIvSession({ messages: [{ role: "assistant", content: firstQ }], sys });
    setView("iv");
    setLoading(false);
  };

  const sendIV = async (msg) => {
    if (!msg.trim() || !ivSession) return;
    const msgs = [...ivSession.messages, { role: "user", content: msg }];
    setIvSession(p => ({ ...p, messages: msgs }));
    setLoading(true);
    try {
      const reply = await ai(msgs, ivSession.sys);
      setIvSession(p => ({ ...p, messages: [...msgs, { role: "assistant", content: reply }] }));
    } catch { toast("网络错误", "err"); }
    setLoading(false);
  };

  // ── File Upload ──────────────────────────────────────────────────────────────
  const handleFile = (e, setter) => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ev => setter(ev.target.result);
    r.readAsText(f);
  };

  const filtered = projects.filter(p => (fStatus === "全部" || p.status === fStatus) && (fCat === "全部" || p.category === fCat));

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Noto Serif SC',Georgia,serif", minHeight: "100vh", background: "#f8f7f4", color: "#1a1a2e" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=DM+Mono&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:#d1cbbf;border-radius:3px}
        textarea,input,select{font-family:inherit}
        .card{background:#fff;border:1px solid #e8e3db;border-radius:12px;transition:all .18s}
        .card-hover:hover{border-color:#c9c0b0;box-shadow:0 4px 18px rgba(0,0,0,.08);transform:translateY(-2px)}
        .btn{border:none;cursor:pointer;font-family:inherit;border-radius:8px;transition:all .14s;font-size:13px}
        .bp{background:#1a1a2e;color:#fff;padding:9px 18px}.bp:hover{background:#2d2d4e}.bp:disabled{opacity:.5;cursor:not-allowed}
        .bs{background:#f0ede8;color:#1a1a2e;padding:8px 14px}.bs:hover{background:#e8e3db}
        .bd{background:#fef2f2;color:#ef4444;padding:7px 13px}.bd:hover{background:#fee2e2}
        .bw{background:#fffbeb;color:#d97706;padding:7px 13px}.bw:hover{background:#fef3c7}
        .tab{padding:7px 14px;border-radius:6px;cursor:pointer;font-size:13px;font-family:inherit;border:none;background:transparent;color:#6b7280;transition:all .13s}
        .tab.on{background:#1a1a2e;color:#fff}.tab:hover:not(.on){background:#f0ede8}
        textarea{width:100%;border:1px solid #e8e3db;border-radius:8px;padding:11px;font-size:13px;color:#1a1a2e;background:#fafaf8;resize:vertical;outline:none;line-height:1.6}
        textarea:focus{border-color:#1a1a2e;background:#fff}
        input[type=text],input[type=date]{border:1px solid #e8e3db;border-radius:8px;padding:8px 11px;font-size:13px;color:#1a1a2e;background:#fafaf8;outline:none;width:100%}
        input:focus{border-color:#1a1a2e;background:#fff}
        select{border:1px solid #e8e3db;border-radius:8px;padding:8px 11px;font-size:13px;color:#1a1a2e;background:#fafaf8;outline:none;font-family:inherit;cursor:pointer}
        .tag{display:inline-flex;align-items:center;gap:3px;padding:3px 9px;border-radius:20px;font-size:11px}
        .nav{display:flex;align-items:center;gap:7px;padding:9px 13px;border-radius:8px;cursor:pointer;font-size:14px;transition:all .13s;color:#4b5563}
        .nav:hover{background:#f0ede8;color:#1a1a2e}.nav.on{background:#1a1a2e;color:#fff}
        .fl{font-size:11px;color:#9ca3af;margin-bottom:5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase}
        .stitle{font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:13px;padding-bottom:7px;border-bottom:2px solid #f0ede8}
        .bub-ai{background:#f0ede8;border-radius:12px 12px 12px 2px;padding:11px 15px;max-width:75%;font-size:13px;line-height:1.6}
        .bub-me{background:#1a1a2e;color:#fff;border-radius:12px 12px 2px 12px;padding:11px 15px;max-width:75%;font-size:13px;line-height:1.6;margin-left:auto}
        .pulse{animation:pulse 1s infinite}@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
        .notif{position:fixed;top:18px;right:18px;z-index:9999;padding:11px 18px;border-radius:10px;font-size:13px;font-weight:600;box-shadow:0 4px 18px rgba(0,0,0,.13);animation:si .25s ease}
        @keyframes si{from{transform:translateX(80px);opacity:0}to{transform:translateX(0);opacity:1}}
        .src-badge{font-size:10px;padding:2px 7px;border-radius:10px;font-family:'DM Mono',monospace}
        .merge-card{border:2px dashed #e8e3db;border-radius:12px;padding:18px;background:#fafaf8;transition:all .18s}
        .merge-card:hover{border-color:#1a1a2e}
        .gap-item{background:#fffbeb;border:1px solid #fde68a;border-radius:9px;padding:14px;margin-bottom:10px}
        .progress-bar{height:4px;border-radius:2px;background:#e8e3db;overflow:hidden;margin-top:6px}
        .progress-fill{height:100%;border-radius:2px;background:linear-gradient(90deg,#10b981,#3b82f6);transition:width .3s}
      `}</style>

      {notif && (
        <div className="notif" style={{ background: notif.type === "err" ? "#fef2f2" : notif.type === "warn" ? "#fffbeb" : "#f0fdf4", color: notif.type === "err" ? "#ef4444" : notif.type === "warn" ? "#d97706" : "#10b981", border: `1px solid ${notif.type === "err" ? "#fecaca" : notif.type === "warn" ? "#fde68a" : "#bbf7d0"}` }}>
          {notif.msg}
        </div>
      )}

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* ── Sidebar ── */}
        <div style={{ width: 215, background: "#fff", borderRight: "1px solid #e8e3db", padding: "22px 14px", display: "flex", flexDirection: "column", gap: 3, position: "fixed", top: 0, bottom: 0, left: 0, overflowY: "auto" }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em" }}>面试素材库</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>秋招备战工具</div>
          </div>

          <div className={`nav ${view === "home" ? "on" : ""}`} onClick={() => setView("home")}>
            🗂 素材库
            {pendingCnt > 0 && <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>{pendingCnt}</span>}
          </div>

          <div style={{ fontSize: 11, color: "#9ca3af", padding: "10px 13px 3px", letterSpacing: ".05em", fontWeight: 600 }}>导入素材</div>
          <div className={`nav ${view === "import" ? "on" : ""}`} onClick={() => { setView("import"); setImportTab("chat"); setStream(""); }}>
            📥 导入素材
          </div>

          <div style={{ fontSize: 11, color: "#9ca3af", padding: "10px 13px 3px", letterSpacing: ".05em", fontWeight: 600 }}>分析工具</div>
          <div className={`nav ${view === "merge" ? "on" : ""}`} onClick={() => { setView("merge"); setMergeSugg([]); }}>
            🔀 智能合并
            {projects.length >= 2 && <span style={{ marginLeft: "auto", fontSize: 10, color: "#9ca3af" }}>分析重叠</span>}
          </div>
          <div className={`nav ${view === "jd" ? "on" : ""}`} onClick={() => setView("jd")}>
            🎯 JD 解读
          </div>

          <div style={{ marginTop: "auto", padding: "12px 0", borderTop: "1px solid #f0ede8" }}>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>共 {projects.length} 个项目</div>
            <div style={{ fontSize: 11, color: "#10b981", marginTop: 2 }}>完整可用 {projects.filter(p => p.status === "完整可用").length}</div>
            {gapCnt > 0 && <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 2 }}>待诊断补充 {gapCnt} 项</div>}
          </div>
        </div>

        {/* ── Main ── */}
        <div style={{ marginLeft: 215, flex: 1, padding: "30px 38px", maxWidth: "calc(100vw - 215px)" }}>

          {/* HOME */}
          {view === "home" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>素材库</h1>
                  <p style={{ color: "#6b7280", fontSize: 13, marginTop: 3 }}>管理你的实习项目与面试素材</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn bs" onClick={() => { setView("merge"); setMergeSugg([]); }}>🔀 智能合并</button>
                  <button className="btn bp" onClick={() => { setSel({ ...EMPTY }); setView("detail"); setActiveTab("star"); setMockQs([]); }}>+ 手动新建</button>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ width: "auto" }}>
                  {["全部", ...STATUSES].map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={fCat} onChange={e => setFCat(e.target.value)} style={{ width: "auto" }}>
                  {["全部", ...CATS].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>

              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: "70px 0", color: "#9ca3af" }}>
                  <div style={{ fontSize: 44, marginBottom: 14 }}>📋</div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>还没有素材</div>
                  <div style={{ fontSize: 13, marginTop: 6 }}>从左侧「导入素材」开始</div>
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 18 }}>
                  {filtered.map(p => {
                    const gapN = p.gaps?.length || 0;
                    const completion = Math.max(0, 100 - gapN * 12);
                    return (
                      <div key={p.id} className="card card-hover" style={{ padding: 18, cursor: "pointer" }} onClick={() => openDetail(p)}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                          <span className="tag" style={{ background: (CAT_C[p.category] || "#94a3b8") + "20", color: CAT_C[p.category] || "#94a3b8" }}>{p.category}</span>
                          <span className="tag" style={{ background: STATUS_C[p.status] + "18", color: STATUS_C[p.status] }}>
                            {p.status === "待补充" ? "🔴 " : ""}{p.status}
                          </span>
                          {p.source && <span className="src-badge" style={{ background: "#f0ede8", color: "#9ca3af" }}>{p.source === "chat" ? "💬" : p.source === "doc" ? "📄" : p.source === "skill_json" ? "⚡" : p.source === "merged" ? "🔀" : "✏️"}</span>}
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{p.title || "未命名"}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5, marginBottom: 10 }}>{p.summary || "暂无摘要"}</div>

                        {/* Completion bar */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#9ca3af" }}>完整度</span>
                          <span style={{ fontSize: 10, color: "#9ca3af" }}>{completion}%</span>
                        </div>
                        <div className="progress-bar"><div className="progress-fill" style={{ width: completion + "%" }} /></div>

                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 10 }}>
                          {(p.keywords || []).slice(0, 3).map(k => <span key={k} className="tag" style={{ background: "#f0ede8", color: "#6b7280" }}>{k}</span>)}
                          {p.score > 0 && <span style={{ marginLeft: "auto", fontSize: 12 }}>{sStar(p.score)}</span>}
                        </div>

                        {gapN > 0 && (
                          <div style={{ marginTop: 9, fontSize: 11, color: "#f59e0b", background: "#fffbeb", padding: "5px 9px", borderRadius: 5 }}>
                            ⚠️ {gapN} 项缺口待补充
                          </div>
                        )}
                        {p.pendingItems?.length > 0 && (
                          <div style={{ marginTop: 5, fontSize: 11, color: "#ef4444", background: "#fef2f2", padding: "5px 9px", borderRadius: 5 }}>
                            🔴 {p.pendingItems.length} 项待跟进
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* IMPORT */}
          {view === "import" && (
            <div style={{ maxWidth: 740 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>导入素材</h1>
              <div style={{ display: "flex", gap: 5, background: "#f0ede8", padding: 4, borderRadius: 9, width: "fit-content", marginBottom: 24 }}>
                {[["chat", "💬 Claude 对话"], ["doc", "📄 飞书文档"], ["json", "⚡ 「总结今天」JSON"]].map(([k, label]) => (
                  <button key={k} className={`tab ${importTab === k ? "on" : ""}`} onClick={() => setImportTab(k)}>{label}</button>
                ))}
              </div>

              {importTab === "chat" && (
                <div className="card" style={{ padding: 22 }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14, lineHeight: 1.6 }}>
                    粘贴与 Claude 的对话内容，AI 会识别所有独立素材单元并分别建卡。<br />
                    <strong>会重点保留</strong>：决策判断、排除的方案、个人思考过程。
                  </div>
                  <div className="fl">对话内容</div>
                  <textarea value={chatIn} onChange={e => setChatIn(e.target.value)} rows={12} placeholder="粘贴对话内容……&#10;&#10;AI 会自动切割成多条独立素材，宁可多切不漏" />
                  {stream && <div style={{ marginTop: 10, padding: 10, background: "#fafaf8", border: "1px solid #e8e3db", borderRadius: 7, fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", maxHeight: 120, overflowY: "auto" }}><span className="pulse">●</span> {stream.slice(-200)}</div>}
                  <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                    <button className="btn bp" onClick={importChat} disabled={loading || !chatIn.trim()}>{loading ? "提炼中…" : "🪄 AI 提炼素材"}</button>
                    <button className="btn bs" onClick={() => setChatIn("")}>清空</button>
                  </div>
                </div>
              )}

              {importTab === "doc" && (
                <div className="card" style={{ padding: 22 }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14, lineHeight: 1.6 }}>
                    上传飞书导出的 .md / .txt 文件，或直接粘贴文档内容。<br />
                    导入后会自动检测与现有素材的重叠，进入「智能合并」处理。
                  </div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", background: "#f0ede8", borderRadius: 8, cursor: "pointer", fontSize: 13, marginBottom: 12 }}>
                    📁 上传文件
                    <input type="file" accept=".md,.txt,.docx" onChange={e => handleFile(e, setDocIn)} style={{ display: "none" }} />
                  </label>
                  <div className="fl">文档内容</div>
                  <textarea value={docIn} onChange={e => setDocIn(e.target.value)} rows={12} placeholder="粘贴飞书文档内容，或上传文件后自动填入……" />
                  {stream && <div style={{ marginTop: 10, padding: 10, background: "#fafaf8", border: "1px solid #e8e3db", borderRadius: 7, fontSize: 11, fontFamily: "'DM Mono',monospace", color: "#6b7280", maxHeight: 120, overflowY: "auto" }}><span className="pulse">●</span> {stream.slice(-200)}</div>}
                  <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                    <button className="btn bp" onClick={importDoc} disabled={loading || !docIn.trim()}>{loading ? "解析中…" : "🪄 AI 解析素材"}</button>
                    <button className="btn bs" onClick={() => setDocIn("")}>清空</button>
                  </div>
                </div>
              )}

              {importTab === "json" && (
                <div className="card" style={{ padding: 22 }}>
                  <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 14, lineHeight: 1.6 }}>
                    在 Claude 对话里说「<strong>总结今天</strong>」，Claude 会输出结构化 JSON，直接粘贴到这里即可一键导入。<br />
                    这是最快的工作流：对话结束 → 触发 Skill → 复制 JSON → 粘贴导入。
                  </div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#374151" }}>
                    <strong style={{ color: "#10b981" }}>新版 Skill 已升级</strong>：会识别对话里所有独立素材单元，宁可多切不漏，输出多条 project。
                  </div>
                  <div className="fl">JSON 内容</div>
                  <textarea value={jsonIn} onChange={e => setJsonIn(e.target.value)} rows={12} placeholder='粘贴「总结今天」输出的 JSON……&#10;&#10;格式：{"projects":[{...},{...}]}' style={{ fontFamily: "'DM Mono',monospace", fontSize: 12 }} />
                  <div style={{ display: "flex", gap: 9, marginTop: 14 }}>
                    <button className="btn bp" onClick={importJSON} disabled={!jsonIn.trim()}>⚡ 一键导入</button>
                    <button className="btn bs" onClick={() => setJsonIn("")}>清空</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MERGE */}
          {view === "merge" && (
            <div style={{ maxWidth: 740 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>🔀 智能合并</h1>
              <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 24 }}>AI 分析素材库，找出「其实是同一件事」的素材对，确认后智能合并并诊断缺口</p>

              {!mergeSugg.length ? (
                <div>
                  <div className="card" style={{ padding: 22, marginBottom: 18 }}>
                    <div className="stitle">合并原则</div>
                    <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.8 }}>
                      <div>🔹 <strong>对话来源</strong>的决策思考、排除方案 → 优先保留到 Action 层</div>
                      <div>🔹 <strong>文档来源</strong>的量化数据、具体结果 → 优先保留到 Result 层</div>
                      <div>🔹 哪边字段更完整更详细，就取哪边</div>
                      <div>🔹 合并后自动诊断缺口，生成待补充清单</div>
                    </div>
                  </div>
                  <button className="btn bp" onClick={analyzeMerge} disabled={mergeLoading || projects.length < 2} style={{ fontSize: 14, padding: "11px 24px" }}>
                    {mergeLoading ? "分析中…" : "🔍 开始智能分析"}
                  </button>
                  {projects.length < 2 && <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>需要至少 2 条素材才能分析</div>}
                </div>
              ) : (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                    <div style={{ fontSize: 14, color: "#6b7280" }}>发现 <strong style={{ color: "#1a1a2e" }}>{mergeSugg.length}</strong> 组可能重叠的素材</div>
                    <button className="btn bs" onClick={() => { setMergeSugg([]); }}>重新分析</button>
                  </div>

                  {mergeSugg.map((sugg, i) => {
                    const ps = projects.filter(p => sugg.ids.includes(String(p.id)));
                    return (
                      <div key={i} className="merge-card" style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 700, background: sugg.confidence === "高" ? "#dcfce7" : sugg.confidence === "中" ? "#dbeafe" : "#fef3c7", color: sugg.confidence === "高" ? "#10b981" : sugg.confidence === "中" ? "#3b82f6" : "#d97706", padding: "2px 8px", borderRadius: 10 }}>
                              {sugg.confidence}置信度
                            </span>
                            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 7 }}>{sugg.reason}</div>
                          </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                          {ps.map(p => (
                            <div key={p.id} style={{ background: "#fff", border: "1px solid #e8e3db", borderRadius: 8, padding: 12 }}>
                              <div style={{ display: "flex", gap: 5, marginBottom: 6 }}>
                                <span className="src-badge" style={{ background: "#f0ede8", color: "#9ca3af" }}>{p.source === "chat" ? "💬 对话" : p.source === "doc" ? "📄 文档" : p.source === "skill_json" ? "⚡ JSON" : "✏️ 手动"}</span>
                              </div>
                              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>{p.summary}</div>
                            </div>
                          ))}
                        </div>

                        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "9px 12px", marginBottom: 12, fontSize: 12, color: "#374151" }}>
                          <strong>合并策略：</strong>{sugg.strategy}
                        </div>

                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn bp" onClick={() => executeMerge(sugg)} disabled={mergeLoading}>
                            {mergeLoading ? "合并中…" : "✓ 确认合并"}
                          </button>
                          <button className="btn bs" onClick={() => setMergeSugg(prev => prev.filter((_, j) => j !== i))}>跳过</button>
                        </div>
                      </div>
                    );
                  })}

                  {mergeSugg.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "#10b981", fontSize: 15, fontWeight: 600 }}>✓ 所有重叠已处理完成</div>}
                </div>
              )}
            </div>
          )}

          {/* JD */}
          {view === "jd" && (
            <div style={{ maxWidth: 780 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>🎯 JD 解读 & 面试模拟</h1>
              <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 22 }}>粘贴岗位 JD，AI 分析能力要求、匹配素材、生成模拟面试</p>

              {!jdRes ? (
                <div className="card" style={{ padding: 22 }}>
                  <div className="fl">岗位 JD</div>
                  <textarea value={jdText} onChange={e => setJdText(e.target.value)} rows={12} placeholder="粘贴完整 JD……&#10;&#10;例如：字节跳动 抖音 策略产品经理 校招&#10;岗位职责：…&#10;任职要求：…" />
                  <button className="btn bp" style={{ marginTop: 14 }} onClick={analyzeJD} disabled={loading || !jdText.trim()}>{loading ? "分析中…" : "🔍 解读 JD"}</button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="card" style={{ padding: 22 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>{jdRes.company} · {jdRes.role}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{jdRes.interviewFocus}</div>
                      </div>
                      <button className="btn bs" onClick={() => { setJdRes(null); setJdText(""); }}>重新输入</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                      <div>
                        <div className="fl">核心能力要求</div>
                        {jdRes.coreRequirements?.map((r, i) => <div key={i} style={{ fontSize: 13, marginBottom: 5, display: "flex", gap: 7 }}><span style={{ fontWeight: 700 }}>{i + 1}.</span>{r}</div>)}
                      </div>
                      <div>
                        <div className="fl">高频问题预测</div>
                        {jdRes.topQuestions?.map((q, i) => <div key={i} style={{ fontSize: 12, padding: "6px 10px", background: "#f8f7f4", borderRadius: 6, marginBottom: 5, borderLeft: "3px solid #1a1a2e" }}>{q}</div>)}
                      </div>
                    </div>
                  </div>

                  {jdRes.matchedProjects?.length > 0 && (
                    <div className="card" style={{ padding: 22 }}>
                      <div className="stitle">📌 推荐素材（静态总览）</div>
                      {jdRes.matchedProjects.map(p => (
                        <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: "1px solid #f0ede8" }}>
                          <span className="tag" style={{ background: (CAT_C[p.category] || "#94a3b8") + "20", color: CAT_C[p.category] || "#94a3b8", whiteSpace: "nowrap" }}>{p.category}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.title}</div>
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{p.summary}</div>
                          </div>
                          <button className="btn bs" style={{ fontSize: 11, whiteSpace: "nowrap" }} onClick={() => openDetail(p)}>查看详情</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="card" style={{ padding: 22, textAlign: "center" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>进入对话式模拟面试</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>AI 扮演 {jdRes.company} 面试官，结合你的素材逐题追问</div>
                    <button className="btn bp" style={{ fontSize: 14, padding: "11px 26px" }} onClick={startIV} disabled={loading}>{loading ? "准备中…" : "🎤 开始模拟面试"}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INTERVIEW */}
          {view === "iv" && ivSession && (
            <div style={{ maxWidth: 700 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <button className="btn bs" onClick={() => setView("jd")}>← 返回</button>
                <h1 style={{ fontSize: 20, fontWeight: 700 }}>模拟面试</h1>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{jdRes?.company} · {jdRes?.role}</span>
              </div>
              <div className="card" style={{ overflow: "hidden" }}>
                <div style={{ background: "#1a1a2e", padding: "12px 18px", color: "#fff", fontSize: 12 }}>🎤 行为面试进行中 — 回答后面试官会追问或推进</div>
                <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14, maxHeight: "62vh", overflowY: "auto" }}>
                  {ivSession.messages.map((m, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                      <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 3 }}>{m.role === "user" ? "你" : "面试官"}</div>
                      <div className={m.role === "user" ? "bub-me" : "bub-ai"}>{m.content}</div>
                    </div>
                  ))}
                  {loading && <div style={{ fontSize: 12, color: "#9ca3af" }}>面试官思考中 <span className="pulse">●</span></div>}
                </div>
                <IVInput onSend={sendIV} disabled={loading} />
              </div>
            </div>
          )}

          {/* DETAIL */}
          {view === "detail" && sel && (
            <ProjectDetail
              project={sel}
              onSave={save}
              onDelete={del}
              onBack={() => setView("home")}
              mockQs={mockQs}
              onGenMock={() => genMock(sel)}
              loading={loading}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              onFillGap={fillGap}
              gapAns={gapAns}
              setGapAns={setGapAns}
              toast={toast}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Interview Input ───────────────────────────────────────────────────────────
function IVInput({ onSend, disabled }) {
  const [v, setV] = useState("");
  const send = () => { if (v.trim()) { onSend(v); setV(""); } };
  return (
    <div style={{ padding: "14px 20px", borderTop: "1px solid #e8e3db", display: "flex", gap: 10 }}>
      <textarea value={v} onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="输入你的回答…（Enter 发送，Shift+Enter 换行）" rows={2} style={{ flex: 1 }} disabled={disabled} />
      <button className="btn bp" onClick={send} disabled={disabled || !v.trim()} style={{ alignSelf: "flex-end" }}>发送</button>
    </div>
  );
}

// ── Project Detail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, onSave, onDelete, onBack, mockQs, onGenMock, loading, activeTab, setActiveTab, onFillGap, gapAns, setGapAns, toast }) {
  const [p, setP] = useState(() => ({ ...EMPTY, ...project, star: { ...EMPTY.star, ...(project.star || {}) }, dataMetrics: { ...EMPTY.dataMetrics, ...(project.dataMetrics || {}) }, keywords: project.keywords || [], coreCompetencyTags: project.coreCompetencyTags || [], iterations: project.iterations || [], pendingItems: project.pendingItems || [], applicableQuestions: project.applicableQuestions || [], gaps: project.gaps || [] }));
  const [kwIn, setKwIn] = useState("");
  const [tagIn, setTagIn] = useState("");
  const [iterIn, setIterIn] = useState("");
  const [pendIn, setPendIn] = useState("");

  useEffect(() => {
    setP({ ...EMPTY, ...project, star: { ...EMPTY.star, ...(project.star || {}) }, dataMetrics: { ...EMPTY.dataMetrics, ...(project.dataMetrics || {}) }, keywords: project.keywords || [], coreCompetencyTags: project.coreCompetencyTags || [], iterations: project.iterations || [], pendingItems: project.pendingItems || [], applicableQuestions: project.applicableQuestions || [], gaps: project.gaps || [] });
  }, [project.id]);

  const u = (f, v) => setP(prev => ({ ...prev, [f]: v }));
  const us = (f, v) => setP(prev => ({ ...prev, star: { ...prev.star, [f]: v } }));
  const um = (f, v) => setP(prev => ({ ...prev, dataMetrics: { ...prev.dataMetrics, [f]: v } }));

  const gaps = diagnose(p);
  const completion = Math.max(0, 100 - gaps.length * 12);

  const TABS = [
    { k: "star", label: "STAR 结构" },
    { k: "data", label: "📊 数据" },
    { k: "mock", label: "💬 追问" },
    { k: "status", label: "📋 状态" },
  ];

  return (
    <div style={{ maxWidth: 840 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <button className="btn bs" onClick={onBack}>← 返回</button>
        <input type="text" value={p.title} onChange={e => u("title", e.target.value)} placeholder="项目标题" style={{ flex: 1, fontSize: 20, fontWeight: 700, border: "none", background: "transparent", padding: 0, outline: "none" }} />
        <button className="btn bp" onClick={() => onSave(p)}>保存</button>
        {p.id && <button className="btn bd" onClick={() => { if (confirm("确认删除？")) onDelete(p.id); }}>删除</button>}
      </div>

      {/* Meta */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select value={p.category} onChange={e => u("category", e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
        <select value={p.difficulty} onChange={e => u("difficulty", e.target.value)}>{["高", "中", "低"].map(d => <option key={d}>{d}</option>)}</select>
        <select value={p.status} onChange={e => u("status", e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select>
        {p.score > 0 && <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 20, background: S_BG[p.score], color: S_CLR[p.score], fontWeight: 600 }}>{sStar(p.score)} {S_LABEL[p.score]}</span>}
        <span style={{ fontSize: 11, color: "#9ca3af" }}>完整度 {completion}%</span>
      </div>

      {/* Completion bar */}
      <div className="progress-bar" style={{ marginBottom: 18 }}><div className="progress-fill" style={{ width: completion + "%" }} /></div>

      {/* Summary */}
      <div className="card" style={{ padding: 14, marginBottom: 18 }}>
        <div className="fl">一句话摘要</div>
        <input type="text" value={p.summary} onChange={e => u("summary", e.target.value)} placeholder="30字内，提炼核心价值" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "#f0ede8", padding: 4, borderRadius: 9, width: "fit-content", marginBottom: 18 }}>
        {TABS.map(t => (
          <button key={t.k} className={`tab ${activeTab === t.k ? "on" : ""}`} onClick={() => setActiveTab(t.k)}>
            {t.label}
            {t.k === "status" && gaps.length > 0 && <span style={{ marginLeft: 4, background: "#ef4444", color: "#fff", borderRadius: 10, padding: "0 5px", fontSize: 10 }}>{gaps.length}</span>}
          </button>
        ))}
      </div>

      {/* ── STAR ── */}
      {activeTab === "star" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { k: "situation", label: "S — Situation 背景", hint: "业务背景 + 你的角色 + 数据规模", rows: 3 },
            { k: "task", label: "T — Task 任务", hint: "具体目标和你的职责", rows: 2 },
            { k: "action", label: "A — Action 行动（最重要）", hint: "你个人做了什么，体现判断力和方法论", rows: 6 },
            { k: "result", label: "R — Result 结果", hint: "量化结果 + 业务影响", rows: 3 },
          ].map(({ k, label, hint, rows }) => (
            <div key={k} className="card" style={{ padding: 18, borderLeft: k === "action" ? "4px solid #0ea5e9" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{hint}</div>
              </div>
              <textarea value={p.star[k]} onChange={e => us(k, e.target.value)} rows={rows} placeholder={hint} />
            </div>
          ))}

          <div className="card" style={{ padding: 18, borderLeft: "4px solid #6366f1" }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>🚫 排除的方案及原因</div>
            <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 8 }}>大厂必问：「你为什么不选另一个方案？」</div>
            <textarea value={p.excludedOptions} onChange={e => u("excludedOptions", e.target.value)} rows={3} placeholder="方案A被排除，因为……；方案B的问题在于……" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="fl">你的角色</div>
              <input type="text" value={p.role} onChange={e => u("role", e.target.value)} placeholder="独立负责 / 主导设计 / 参与执行" />
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="fl">协作对象</div>
              <input type="text" value={p.collaborators} onChange={e => u("collaborators", e.target.value)} placeholder="与技术、运营、数据团队协作" />
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>🔄 复盘反思</div>
            <textarea value={p.reflection} onChange={e => u("reflection", e.target.value)} rows={3} placeholder="如果重来一次，你会怎么做？有哪些改进空间？" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="card" style={{ padding: 14 }}>
              <div className="fl">关键词 <span style={{ fontSize: 10, fontWeight: 400 }}>（点击删除）</span></div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                {p.keywords.map((k, i) => <span key={i} className="tag" style={{ background: "#f0ede8", color: "#6b7280", cursor: "pointer" }} onClick={() => u("keywords", p.keywords.filter((_, j) => j !== i))}>{k} ×</span>)}
              </div>
              <input type="text" value={kwIn} onChange={e => setKwIn(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && kwIn.trim()) { u("keywords", [...p.keywords, kwIn.trim()]); setKwIn(""); } }} placeholder="输入后回车添加" />
            </div>
            <div className="card" style={{ padding: 14 }}>
              <div className="fl">核心能力标签</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 7 }}>
                {p.coreCompetencyTags.map((t, i) => <span key={i} className="tag" style={{ background: "#dbeafe", color: "#3b82f6", cursor: "pointer" }} onClick={() => u("coreCompetencyTags", p.coreCompetencyTags.filter((_, j) => j !== i))}>{t} ×</span>)}
              </div>
              <input type="text" value={tagIn} onChange={e => setTagIn(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && tagIn.trim()) { u("coreCompetencyTags", [...p.coreCompetencyTags, tagIn.trim()]); setTagIn(""); } }} placeholder="输入后回车添加" />
            </div>
          </div>
        </div>
      )}

      {/* ── DATA ── */}
      {activeTab === "data" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card" style={{ padding: 20, borderLeft: "4px solid #10b981" }}>
            <div className="stitle">📊 核心数据指标</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>面试官必问：「你的数据结果是什么？指标怎么定义的？」</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[["name", "指标名称", "用户留存率 / GMV / DAU"], ["formula", "计算方式", "次日留存 = 次日活跃 / 新增"], ["before", "上线前数值", "32%"], ["after", "上线后数值", "41%（+9pct）"]].map(([k, label, ph]) => (
                <div key={k}>
                  <div className="fl">{label}</div>
                  <input type="text" value={p.dataMetrics[k]} onChange={e => um(k, e.target.value)} placeholder={ph} />
                </div>
              ))}
            </div>
            {(!p.dataMetrics.name || !p.dataMetrics.before || !p.dataMetrics.after) && (
              <div style={{ marginTop: 14, padding: "9px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 7, fontSize: 12, color: "#d97706" }}>
                ⚠️ 数据不完整 — 影响含金量评分，请补充量化指标
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div className="stitle">💡 面试建议</div>
            <textarea value={p.interviewTips} onChange={e => u("interviewTips", e.target.value)} rows={3} placeholder="注意点、追问方向、如何引导话题" />
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div className="stitle">🎯 适用面试问题</div>
            {p.applicableQuestions.map((q, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 7 }}>
                <span style={{ color: "#9ca3af", fontSize: 12, minWidth: 18 }}>{i + 1}.</span>
                <input type="text" value={q} onChange={e => { const qs = [...p.applicableQuestions]; qs[i] = e.target.value; u("applicableQuestions", qs); }} style={{ flex: 1 }} />
                <button className="btn bd" style={{ padding: "3px 8px" }} onClick={() => u("applicableQuestions", p.applicableQuestions.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <button className="btn bs" style={{ fontSize: 12 }} onClick={() => u("applicableQuestions", [...p.applicableQuestions, ""])}>+ 添加</button>
          </div>
        </div>
      )}

      {/* ── MOCK ── */}
      {activeTab === "mock" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, color: "#6b7280" }}>AI 生成 5 个大厂高频追问 + 推荐答案</div>
            <button className="btn bp" onClick={onGenMock} disabled={loading}>{loading ? "生成中…" : "🤖 生成追问"}</button>
          </div>
          {!mockQs.length && !loading && (
            <div style={{ textAlign: "center", padding: "50px 0", color: "#9ca3af" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>💬</div>
              <div>点击「生成追问」，AI 基于此项目生成大厂高频追问 + 推荐回答</div>
            </div>
          )}
          {mockQs.map((item, i) => (
            <div key={i} className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ background: "#1a1a2e", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 9, lineHeight: 1.4 }}>{item.q}</div>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 7, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, marginBottom: 5 }}>AI 推荐答案</div>
                    <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{item.a}</div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── STATUS ── */}
      {activeTab === "status" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Gap Diagnosis */}
          {gaps.length > 0 && (
            <div className="card" style={{ padding: 20, borderLeft: "4px solid #f59e0b" }}>
              <div className="stitle">🩺 缺口诊断（{gaps.length} 项未达高含金量标准）</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
                以下是面试官<strong>必定追问</strong>但你的素材目前还缺少的部分。补充后 AI 自动融合，含金量重新评分。
              </div>
              {gaps.map((gap, gi) => (
                <div key={gi} className="gap-item">
                  <span style={{ fontSize: 11, fontWeight: 700, background: "#fef3c7", color: "#d97706", padding: "2px 8px", borderRadius: 10 }}>{gap.field}</span>
                  <div style={{ fontSize: 13, color: "#92400e", margin: "8px 0 10px", lineHeight: 1.5 }}>
                    面试官会追问：「{gap.q}」
                  </div>
                  <textarea
                    value={gapAns[p.id + gap.field] || ""}
                    onChange={e => setGapAns(prev => ({ ...prev, [p.id + gap.field]: e.target.value }))}
                    placeholder="在这里补充你的答案……"
                    rows={2}
                  />
                  <button className="btn bp" style={{ marginTop: 7, padding: "6px 13px", fontSize: 12 }} onClick={() => onFillGap(p, gap)} disabled={loading || !gapAns[p.id + gap.field]?.trim()}>
                    {loading ? "融合中…" : "✓ 融合补充，重新评分"}
                  </button>
                </div>
              ))}
            </div>
          )}
          {gaps.length === 0 && (
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "18px 20px", fontSize: 14, color: "#10b981", fontWeight: 600 }}>
              ✓ 所有维度完整，这是一条高含金量素材！
            </div>
          )}

          {/* Pending */}
          <div className="card" style={{ padding: 18 }}>
            <div className="stitle">⏳ 待跟进事项</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>记录还在等待的信息（上线数据、同事反馈、迭代结果），会在卡片上显示红点</div>
            {p.pendingItems.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 7, alignItems: "center", padding: "7px 10px", background: "#fffbeb", borderRadius: 6, marginBottom: 6, fontSize: 13 }}>
                <span style={{ color: "#f59e0b" }}>⏳</span>
                <span style={{ flex: 1 }}>{item}</span>
                <button className="btn bs" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => { const items = p.pendingItems.filter((_, j) => j !== i); u("pendingItems", items); if (!items.length) u("status", "进行中"); }}>已完成</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
              <input type="text" value={pendIn} onChange={e => setPendIn(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && pendIn.trim()) { u("pendingItems", [...p.pendingItems, pendIn.trim()]); u("status", "待补充"); setPendIn(""); } }} placeholder="等待上线数据 / 等待 leader 反馈 / 等待 A/B 结果" style={{ flex: 1 }} />
              <button className="btn bp" onClick={() => { if (pendIn.trim()) { u("pendingItems", [...p.pendingItems, pendIn.trim()]); u("status", "待补充"); setPendIn(""); } }}>添加</button>
            </div>
            {p.pendingItems.length > 0 && (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
                <span style={{ fontSize: 12, color: "#6b7280" }}>预计补充日期：</span>
                <input type="date" value={p.pendingDate || ""} onChange={e => u("pendingDate", e.target.value)} style={{ width: "auto" }} />
              </div>
            )}
          </div>

          {/* Iterations */}
          <div className="card" style={{ padding: 18 }}>
            <div className="stitle">🔄 迭代记录</div>
            {p.iterations.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0ede8", fontSize: 13 }}>
                <span style={{ fontSize: 10, color: "#9ca3af", fontFamily: "'DM Mono',monospace", paddingTop: 2, whiteSpace: "nowrap" }}>{it.date}</span>
                <span style={{ flex: 1, lineHeight: 1.5 }}>{it.content}</span>
                <button className="btn bd" style={{ padding: "2px 7px", fontSize: 11 }} onClick={() => u("iterations", p.iterations.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              <textarea value={iterIn} onChange={e => setIterIn(e.target.value)} placeholder="记录新的迭代或反馈……" rows={2} style={{ flex: 1 }} />
              <button className="btn bp" style={{ alignSelf: "flex-end" }} onClick={() => { if (iterIn.trim()) { u("iterations", [...p.iterations, { date: new Date().toLocaleDateString("zh-CN"), content: iterIn.trim() }]); setIterIn(""); } }}>添加</button>
            </div>
          </div>

          {/* Score */}
          <div className="card" style={{ padding: 18 }}>
            <div className="stitle">⭐ 含金量评分</div>
            <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.9, marginBottom: 13 }}>
              <div>✓ 有量化数据（指标名 + 前后数值）→ +1分</div>
              <div>✓ 有排他决策（说明了排除哪些方案）→ +1分</div>
              <div>✓ 有迭代复盘（同事反馈 / 上线结果）→ +1分</div>
            </div>
            <div style={{ display: "flex", gap: 7 }}>
              {[1, 2, 3].map(s => (
                <button key={s} className="btn" style={{ flex: 1, padding: "9px 0", background: p.score === s ? "#1a1a2e" : "#f0ede8", color: p.score === s ? "#fff" : "#6b7280", fontSize: 12 }} onClick={() => u("score", s)}>
                  {sStar(s)}<br /><span style={{ fontSize: 10 }}>{S_LABEL[s]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button className="btn bp" style={{ padding: "11px 28px", fontSize: 14 }} onClick={() => onSave(p)}>{p.id ? "保存更新" : "创建项目"}</button>
      </div>
    </div>
  );
}


