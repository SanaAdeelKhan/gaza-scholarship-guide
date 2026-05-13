require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const XLSX = require('xlsx');
const mammoth = require('mammoth');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'scholarships.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.xlsx', '.xls', '.docx', '.doc', '.txt', '.csv'];
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.includes(ext) ? cb(null, true) : cb(new Error('File type not supported'));
  }
});

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// ── Helpers ──────────────────────────────────
function readScholarships() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return []; }
}

function writeScholarships(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const validTokens = new Set();

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const token = auth.split(' ')[1];
  if (!validTokens.has(token)) return res.status(401).json({ error: 'Invalid or expired token' });
  next();
}

async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.txt' || ext === '.csv') {
    return fs.readFileSync(filePath, 'utf8');
  }
  if (ext === '.xlsx' || ext === '.xls') {
    const wb = XLSX.readFile(filePath);
    return wb.SheetNames.map(name => {
      const sheet = wb.Sheets[name];
      return `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`;
    }).join('\n\n');
  }
  if (ext === '.docx' || ext === '.doc') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return null; // PDF handled directly by Gemini
}

const EXTRACTION_PROMPT = `You are a scholarship data extractor for the Gaza Scholarship Guide.

Extract ALL scholarships from the provided content and return ONLY a valid JSON array with no explanation, no markdown, no code blocks.

For each scholarship extract these exact fields:
{
  "id": "unique-slug",
  "name": "Full scholarship name",
  "country": "Country name",
  "flag": "🏳️ flag emoji",
  "funding": "full" or "partial",
  "covers": "what it covers",
  "fields": ["all"] or specific fields,
  "level": ["undergraduate","graduate","phd"],
  "english_required": true/false,
  "english_min": "B2" or null,
  "ielts_waiver": true/false,
  "visa_feasibility": "high","moderate","low",
  "deadline": "deadline string",
  "gpa_min": 60,
  "link": "url or empty string",
  "required_documents": ["doc1","doc2"],
  "notes": "notes for Gaza students",
  "visa_notes": "visa info",
  "gaza_specific": true/false,
  "verified": false,
  "last_updated": "2026-05-13"
}

Return ONLY the JSON array starting with [ and ending with ].`;

// ── Routes ────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    gemini: !!process.env.GEMINI_API_KEY,
    scholarships: readScholarships().length,
    version: '2.0.0'
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

app.get('/api/scholarships', (req, res) => res.json(readScholarships()));
app.get('/api/admin/scholarships', authMiddleware, (req, res) => res.json(readScholarships()));

app.post('/api/admin/scholarships', authMiddleware, (req, res) => {
  try {
    if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array' });
    writeScholarships(req.body);
    res.json({ success: true, count: req.body.length });
  } catch(e) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

// ── File Upload + Gemini Extraction ──────────
app.post('/api/admin/extract-files', authMiddleware, upload.array('files', 10), async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const allExtracted = [];

    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      let result;

      if (ext === '.pdf') {
        // Send PDF directly to Gemini
        const pdfData = fs.readFileSync(file.path);
        const base64 = pdfData.toString('base64');
        const geminiResult = await model.generateContent([
          { inlineData: { data: base64, mimeType: 'application/pdf' } },
          EXTRACTION_PROMPT
        ]);
        result = geminiResult.response.text();
      } else {
        // Extract text first, then send to Gemini
        const text = await extractTextFromFile(file.path, file.originalname);
        if (!text) { console.log(`Skipping ${file.originalname}`); continue; }
        const geminiResult = await model.generateContent([
          EXTRACTION_PROMPT,
          `\n\nCONTENT FROM FILE "${file.originalname}":\n${text}`
        ]);
        result = geminiResult.response.text();
      }

      // Parse JSON from Gemini response
      let cleaned = result.trim()
        .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) allExtracted.push(...parsed);

      // Cleanup uploaded file
      fs.unlinkSync(file.path);
    }

    res.json({ success: true, extracted: allExtracted, count: allExtracted.length });

  } catch(e) {
    console.error('Extraction error:', e.message);
    // Cleanup files on error
    req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch(err) {} });
    res.status(500).json({ error: e.message || 'Extraction failed' });
  }
});

// ── Gemini Chat (replaces Groq) ──────────────
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const scholarships = readScholarships();
  const scholData = scholarships.length > 0
    ? `\n\nLIVE SCHOLARSHIP DATABASE (${scholarships.length} verified scholarships):\n` +
      scholarships.map(s =>
        `- ${s.flag || ''} ${s.name} (${s.country}): ${s.funding === 'full' ? 'FULL FUNDED' : 'Partial'} | ` +
        `English: ${s.english_required ? s.english_min + (s.ielts_waiver ? ' waiver ok' : '') : 'Not required'} | ` +
        `Visa: ${s.visa_feasibility} | Deadline: ${s.deadline} | Fields: ${(s.fields || []).join(',')} | ` +
        `Docs: ${(s.required_documents || []).join('; ')} | Notes: ${s.notes || ''}`
      ).join('\n')
    : '\n\nNo scholarships in database yet. Ask admin to add scholarship data.';

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: (systemPrompt || '') + scholData
    });

    // Build chat history (all but last message)
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const chat = model.startChat({ history });
    const lastMsg = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMsg.content);
    res.json({ reply: result.response.text() });

  } catch(e) {
    console.error('Chat error:', e.message);
    res.status(500).json({ error: 'AI error: ' + e.message });
  }
});

// ── Text Import via Gemini ───────────────────
app.post('/api/admin/extract-text', authMiddleware, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent([
      EXTRACTION_PROMPT,
      `\n\nTEXT TO EXTRACT FROM:\n${text}`
    ]);
    let cleaned = result.response.text().trim()
      .replace(/^```json\n?/, '').replace(/^```\n?/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    res.json({ success: true, extracted: Array.isArray(parsed) ? parsed : [parsed] });
  } catch(e) {
    res.status(500).json({ error: e.message || 'Extraction failed' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log('\n🌿 Gaza Scholarship Guide v2.0');
  console.log(`   Landing:      http://localhost:${PORT}/`);
  console.log(`   Student app:  http://localhost:${PORT}/app`);
  console.log(`   Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`   Gemini:       ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Scholarships: ${readScholarships().length} in database\n`);
});
