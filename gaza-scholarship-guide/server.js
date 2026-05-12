require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    groq: !!process.env.GROQ_API_KEY,
    version: '1.0.0'
  });
});

// ── Groq API proxy ────────────────────────────────────────
// The API key never reaches the browser — it stays here on the server
app.post('/api/chat', async (req, res) => {
  const { messages, systemPrompt } = req.body;

  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: 'GROQ_API_KEY not set. Check your .env file.' });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request. messages array required.' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ]
      })
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      console.error('Groq API error:', data);
      return res.status(groqRes.status).json({ error: data.error?.message || 'Groq API error' });
    }

    res.json({ reply: data.choices?.[0]?.message?.content || 'No response generated.' });

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── Routes ────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n🌿 Gaza Scholarship Guide');
  console.log(`   Running at: http://localhost:${PORT}`);
  console.log(`   Landing:    http://localhost:${PORT}/`);
  console.log(`   App:        http://localhost:${PORT}/app`);
  console.log(`   Groq key:   ${process.env.GROQ_API_KEY ? '✅ Set' : '❌ Missing — check .env'}`);
  console.log('');
});
