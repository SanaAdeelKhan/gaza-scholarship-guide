require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'scholarships.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readScholarships() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch(e) { return []; }
}

function writeScholarships(data) {
  if (!fs.existsSync(path.dirname(DATA_FILE))) fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
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

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', groq: !!process.env.GROQ_API_KEY, scholarships: readScholarships().length });
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === (process.env.ADMIN_USERNAME || 'admin') && password === (process.env.ADMIN_PASSWORD || 'changeme123')) {
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
    console.log(`Scholarships updated: ${req.body.length} entries`);
    res.json({ success: true, count: req.body.length });
  } catch(e) {
    res.status(500).json({ error: 'Failed to save' });
  }
});

app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });

  const scholarships = readScholarships();
  const scholData = scholarships.length > 0
    ? `\n\nLIVE SCHOLARSHIP DATABASE (${scholarships.length} verified scholarships):\n` +
      scholarships.map(s =>
        `- ${s.flag || ''} ${s.name} (${s.country}): ${s.funding === 'full' ? 'FULL FUNDED' : 'Partial'} | ` +
        `English: ${s.english_required ? s.english_min + (s.ielts_waiver ? ' waiver ok' : '') : 'Not required'} | ` +
        `Visa: ${s.visa_feasibility} | Deadline: ${s.deadline} | Fields: ${(s.fields||[]).join(',')} | ` +
        `Docs: ${(s.required_documents||[]).join('; ')} | Notes: ${s.notes || ''}`
      ).join('\n')
    : '\n\nNo scholarships in database yet.';

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [{ role: 'system', content: (systemPrompt || '') + scholData }, ...messages]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || 'Groq error' });
    res.json({ reply: data.choices?.[0]?.message?.content || 'No response.' });
  } catch(e) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

app.listen(PORT, () => {
  console.log('\n🌿 Gaza Scholarship Guide');
  console.log(`   Landing:      http://localhost:${PORT}/`);
  console.log(`   Student app:  http://localhost:${PORT}/app`);
  console.log(`   Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`   Groq key:     ${process.env.GROQ_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Scholarships: ${readScholarships().length} in database\n`);
});
