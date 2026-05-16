require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE      = path.join(__dirname, 'data', 'scholarships.json');
const KNOWLEDGE_FILE = path.join(__dirname, 'data', 'knowledge.json');
const UPLOAD_DIR     = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Multer ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.xlsx','.xls','.docx','.doc','.txt','.csv','.odt','.rtf','.pptx','.ppt','.md'];
    allowed.includes(path.extname(file.originalname).toLowerCase()) ? cb(null, true) : cb(new Error('File type not supported'));
  }
});

// ── Gemini ────────────────────────────────────
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

async function callGemini(parts) {
  const MODELS = ['gemini-2.5-flash-preview-05-20','gemini-2.0-flash','gemini-2.0-flash'];
  let lastError;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(parts);
      return result.response.text();
    } catch(e) { lastError = e; }
  }
  throw lastError || new Error('All Gemini models failed');
}

// ── Groq ──────────────────────────────────────
async function extractWithGroq(text, filename) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');
  const prompt = EXTRACTION_PROMPT + `\n\nCONTENT FROM "${filename}":\n${text}\n\nReturn ONLY the JSON array.`;
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', max_tokens: 4000,
      messages: [
        { role: 'system', content: 'You are a JSON extractor. Return ONLY valid JSON array, no markdown.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || 'Groq error');
  let reply = data.choices?.[0]?.message?.content || '[]';
  reply = reply.replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/```$/,'').trim();
  return JSON.parse(reply);
}

// ── Data helpers ──────────────────────────────
function readScholarships() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch(e) { return []; }
}
function writeScholarships(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}
function readKnowledge() {
  try { return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, 'utf8')); } catch(e) { return []; }
}
function writeKnowledge(data) {
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// ── Auth ──────────────────────────────────────
const validTokens = new Set();
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  if (!validTokens.has(auth.split(' ')[1])) return res.status(401).json({ error: 'Invalid or expired token' });
  next();
}

// ── File text extraction ──────────────────────
async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const MAX_CHARS = 12000;
  let text = null;
  if (['.txt','.csv','.md'].includes(ext)) {
    text = fs.readFileSync(filePath, 'utf8');
  } else if (['.xlsx','.xls'].includes(ext)) {
    const wb = XLSX.readFile(filePath);
    text = wb.SheetNames.map(n => `Sheet: ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n');
  } else if (['.docx','.doc','.odt','.rtf'].includes(ext)) {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value;
  } else if (['.pptx','.ppt'].includes(ext)) {
    try { const r = await mammoth.extractRawText({ path: filePath }); text = r.value; }
    catch(e) { text = 'Could not extract text from presentation.'; }
  }
  if (text && text.length > MAX_CHARS) text = text.slice(0, MAX_CHARS) + '\n[... truncated ...]';
  return text;
}

// ── Extraction prompt ─────────────────────────
const EXTRACTION_PROMPT = `You are a scholarship data extractor for the Gaza Scholarship Guide.

Extract ALL scholarships from the content and return ONLY a valid JSON array — no markdown, no explanation.

Each scholarship must have these exact fields:
{
  "id": "unique-slug",
  "name": "Full scholarship name",
  "country": "Country",
  "flag": "flag emoji",
  "funding": "full" or "partial",
  "covers": "what it covers",
  "fields": ["all"] or ["engineering","science"],
  "level": ["undergraduate","graduate","phd"],
  "english_required": true/false,
  "english_min": "B2" or null,
  "ielts_waiver": true/false,
  "visa_feasibility": "high","moderate","low",
  "deadline": "deadline string",
  "gpa_min": 60,
  "link": "url or empty string",
  "required_documents": ["Passport","Transcripts"],
  "notes": "notes for Gaza/Palestinian students",
  "visa_notes": "visa tips",
  "gaza_specific": true/false,
  "verified": false,
  "last_updated": "2026-05-16"
}

Return [] if no scholarships found. Start with [ end with ].`;

// ── Mark's v10 system prompt ──────────────────
const MARK_SYSTEM_PROMPT = `
🌍 GAZA SCHOLARSHIP GUIDE — SYSTEM v10 (ADAPTIVE EXECUTION ENGINE)

IDENTITY: Gaza-focused scholarship decision engine and execution coach.
Goal: help students secure fully funded, realistic, executable study-abroad pathways.
Prioritizes mobility + funding reality over prestige.

CORE GOAL: Maximize FULLY FUNDED + EXECUTABLE admission.
Success = student reaches: admission + funding + ability to travel.

MODE ARCHITECTURE — detect user state and switch automatically:

MODE 1 DISCOVERY: Collect minimum viable data WITHOUT overwhelm.
Ask MAX 2 questions per turn.
Collect: Major, Budget, English/test status, GPA, Location (inside Gaza/outside), Passport/travel ability, Urgency.
If missing → assume + label clearly. EXIT when 3+ key variables known.

MODE 2 MATCHING: Apply filters in order:
1. Budget (FULL FUNDING LOCK) 2. Major 3. English feasibility 4. Mobility feasibility 5. Timing
Eliminate: Partial funding traps, Visa-impossible countries, Test-inaccessible options.
Output: 3–5 HIGH-FIT programs ONLY.

MODE 3 DECISION: Score each option.
Recommend TOP 2–3. Force decision: Focus OR diversify.

MODE 4 EXECUTION:
THIS WEEK: Create accounts, Start applications, Gather documents.
NEXT 2-4 WEEKS: Essays, Recommendations, Submissions.
NEXT 1-3 MONTHS: Interviews, Tracking.
Always include: What to say, Mistakes to avoid.

MOBILITY INTELLIGENCE: Always assess Inside Gaza? Passport? Embassy access?
HIGH RISK → prioritize: Turkey, Hungary, Germany, Malaysia. Avoid US/UK unless exceptional.

FUNDING SAFETY LOCK: Budget < $5K → ONLY Full-ride, Government, Humanitarian. AUTO-REJECT partial.

PROBABILITY ENGINE — Score /100:
Academics 30, Funding 25, Eligibility 20, English 10, Mobility 10, Timing 5.
Verdict: VIABLE / RISKY / TRAP.

DOCUMENT RECOVERY: Missing docs → suggest school letters, NGO documents, email admissions.

ESSAY ENGINE: Extract Hardship, Action, Impact, Goals.
Build: resilience + leadership + future. NOT trauma-only.
Write FULL usable essay drafts when asked.

TIMING: Label OPEN NOW / NEXT CYCLE / LATE / EMERGENCY.

After each response: "Do you want next step or refine options?"
Always end with one CTA: Start my plan / Build my school list / Fix my profile / Essay strategy / Explain this step.

This AI IS: a decision engine, an execution coach, a realistic pathway builder.
`;

// ── Routes ────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    scholarships: readScholarships().length,
    knowledge_docs: readKnowledge().length,
    version: '2.2.0'
  });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === (process.env.ADMIN_USERNAME || 'admin') &&
      password === (process.env.ADMIN_PASSWORD || 'changeme123')) {
    const token = Buffer.from(`${Date.now()}-${Math.random()}`).toString('base64');
    validTokens.add(token);
    setTimeout(() => validTokens.delete(token), 8 * 60 * 60 * 1000);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false });
  }
});

// ── Public (student app reads these) ─────────
app.get('/api/scholarships', (req, res) => res.json(readScholarships()));

// ── Admin ─────────────────────────────────────
app.get('/api/admin/scholarships', authMiddleware, (req, res) => res.json(readScholarships()));
app.get('/api/admin/knowledge',    authMiddleware, (req, res) => res.json(readKnowledge()));

app.post('/api/admin/scholarships', authMiddleware, (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array' });
    writeScholarships(req.body);
    res.json({ success: true, count: req.body.length });
  } catch(e) { res.status(500).json({ error: 'Failed to save' }); }
});

app.post('/api/admin/knowledge', authMiddleware, (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array' });
    writeKnowledge(req.body);
    res.json({ success: true, count: req.body.length });
  } catch(e) { res.status(500).json({ error: 'Failed to save knowledge' }); }
});

// ── Extract files ─────────────────────────────
app.post('/api/admin/extract-files', authMiddleware, upload.array('files', 25), async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const allExtracted = [];
  let processed = 0;

  try {
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      console.log(`\n[${processed+1}/${req.files.length}] ${file.originalname}`);
      try {
        let extracted = [];
        if (ext === '.pdf') {
          const base64 = fs.readFileSync(file.path).toString('base64');
          const raw = await callGemini([
            { inlineData: { data: base64, mimeType: 'application/pdf' } },
            EXTRACTION_PROMPT
          ]);
          let cleaned = raw.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/```$/,'').trim();
          const parsed = JSON.parse(cleaned);
          extracted = Array.isArray(parsed) ? parsed : [];
        } else {
          const text = await extractTextFromFile(file.path, file.originalname);
          if (!text || text.trim().length < 10) { processed++; continue; }
          const isPlain = ['.txt','.csv','.md'].includes(ext);
          if (isPlain && process.env.GROQ_API_KEY) {
            extracted = await extractWithGroq(text, file.originalname);
          } else {
            const raw = await callGemini([EXTRACTION_PROMPT, `\n\nFILE "${file.originalname}":\n${text}`]);
            let cleaned = raw.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/```$/,'').trim();
            const parsed = JSON.parse(cleaned);
            extracted = Array.isArray(parsed) ? parsed : [];
          }
        }
        console.log(`  → ${extracted.length} scholarship(s)`);
        allExtracted.push(...extracted);
      } catch(e) {
        console.error(`  Error: ${e.message}`);
      } finally {
        try { fs.unlinkSync(file.path); } catch(e) {}
        processed++;
      }
    }
    res.json({ success: true, extracted: allExtracted, count: allExtracted.length });
  } catch(e) {
    req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(err) {} });
    res.status(500).json({ error: e.message });
  }
});

// ── Extract text ──────────────────────────────
app.post('/api/admin/extract-text', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 10) return res.status(400).json({ error: 'No text provided' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  try {
    let extracted;
    if (process.env.GROQ_API_KEY) {
      try { extracted = await extractWithGroq(text, 'pasted-text'); }
      catch(e) {
        const raw = await callGemini([EXTRACTION_PROMPT, `\n\nTEXT:\n${text}`]);
        extracted = JSON.parse(raw.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/```$/,'').trim());
      }
    } else {
      const raw = await callGemini([EXTRACTION_PROMPT, `\n\nTEXT:\n${text}`]);
      extracted = JSON.parse(raw.trim().replace(/^```json\n?/,'').replace(/^```\n?/,'').replace(/```$/,'').trim());
    }
    if (!Array.isArray(extracted)) extracted = [extracted].filter(Boolean);
    res.json({ success: true, extracted, count: extracted.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── AI Chat ───────────────────────────────────
// Reads BOTH scholarships.json AND knowledge.json → AI knows everything admin uploaded
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const scholarships = readScholarships();
  const knowledge    = readKnowledge();

  // All scholarships injected so AI can recommend them accurately
  const scholSection = scholarships.length > 0
    ? `\n\n═══ LIVE SCHOLARSHIP DATABASE (${scholarships.length} scholarships) ═══\n` +
      scholarships.map(s =>
        `▸ ${s.flag||'🎓'} ${s.name} (${s.country}) | ${s.funding==='full'?'FULL FUNDED':'Partial'}` +
        ` | English: ${s.english_required?(s.english_min||'Required')+(s.ielts_waiver?' (waiver ok)':''):'NOT REQUIRED'}` +
        ` | Visa: ${s.visa_feasibility} | Deadline: ${s.deadline}` +
        ` | Fields: ${(s.fields||['all']).join(',')} | Level: ${(s.level||[]).join(',')}` +
        ` | Docs needed: ${(s.required_documents||[]).join('; ')}` +
        ` | Notes: ${s.notes||''} | Link: ${s.link||''}`
      ).join('\n')
    : '\n\nNo scholarships in database yet — admin needs to upload data.';

  // Knowledge base: essay templates, strategy guides, playbook etc.
  const knowledgeSection = knowledge.length > 0
    ? '\n\n═══ KNOWLEDGE BASE (admin uploaded) ═══\n' +
      knowledge.map(k => `\n--- ${k.source} ---\n${k.content}`).join('\n')
    : '';

  // Student profile sent from app.html
  const profileSection = systemPrompt
    ? 'STUDENT PROFILE IS ALREADY COMPLETE — BEGIN IN MODE 2 MATCHING, NOT MODE 1 DISCOVERY.\n' +
      'DO NOT ASK FOR ANY INFORMATION LISTED BELOW. USE IT DIRECTLY.\n\n' +
      systemPrompt +
      '\n\nThe profile above is complete and verified. Skip all discovery questions. ' +
      'Immediately recommend the top 3-5 scholarships from the database that match this student.'
    : '';

  // Scholarships get full context, knowledge gets trimmed to fit Groq's window
  // Priority: profile > Mark's prompt > ALL scholarships > knowledge (trimmed)
  const baseSystem = profileSection + '\n\n' + MARK_SYSTEM_PROMPT + scholSection;
  const remainingChars = 28000 - baseSystem.length;
  const trimmedKnowledge = remainingChars > 500
    ? knowledgeSection.slice(0, remainingChars)
    : '';
  const fullSystem = baseSystem + trimmedKnowledge;

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: fullSystem
    });
    const history = messages.slice(0,-1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(messages[messages.length-1].content);
    res.json({ reply: result.response.text() });
  } catch(e) {
    console.error('Chat error:', e.message);
    if (process.env.GROQ_API_KEY) {
      try {
        console.log('  Falling back to Groq for chat...');
        const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            max_tokens: 1500,
            messages: [
              { role: 'system', content: fullSystem.slice(0, 24000) },
              ...messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))
            ]
          })
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error?.message || 'Groq error');
        console.log('  Used Groq fallback successfully');
        return res.json({ reply: data.choices?.[0]?.message?.content || 'No response' });
      } catch(groqErr) {
        console.error('Groq fallback failed:', groqErr.message);
      }
    }
    res.status(500).json({ error: 'AI error: ' + e.message });
  }
});

// ── Pages ─────────────────────────────────────
app.get('/',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n🌿 Gaza Scholarship Guide v2.2');
  console.log(`   http://localhost:${PORT}/app   — Student app`);
  console.log(`   http://localhost:${PORT}/admin — Admin panel`);
  console.log(`   Gemini:         ${process.env.GEMINI_API_KEY ? '✅' : '❌ MISSING'}`);
  console.log(`   Groq:           ${process.env.GROQ_API_KEY   ? '✅' : '⚠️  not set'}`);
  console.log(`   Scholarships:   ${readScholarships().length}`);
  console.log(`   Knowledge docs: ${readKnowledge().length}`);
  if (readScholarships().length === 0) console.log(`\n   ⚠️  No scholarships! Run: python3 import_marks_data.py`);
  console.log('');
});
