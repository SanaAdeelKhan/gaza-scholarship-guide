# 🌿 Gaza Scholarship Guide — v10 Platform

> AI-powered scholarship platform built specifically for Gaza students.
> Real opportunities · Visa-aware matching · Humanitarian support · Free to use.

🔗 **Live app:** https://gaza-scholarship-guide.onrender.com

---

## 📋 What is this?

The Gaza Scholarship Guide is a full-stack web application that helps Gaza students find, plan, and apply for fully-funded international scholarships. It combines:

- **AI Advisor** — powered by Mark Ashwill's v10 system (Gemini + Groq fallback), reads each student's full profile, document status, and application tracker to give personalized, executable scholarship advice
- **Scholarship Finder** — 100 real, curated opportunities matched by GPA, field, English level, and visa feasibility for Palestinian passport holders
- **Student Profile** — editable profile saved per student (name, GPA, field, English level, budget, preferred regions, circumstances)
- **Application Tracker** — Kanban pipeline: Researching → In Progress → Submitted → Interview → Decision
- **Document Checklist** — auto-syncs required documents from scholarship data, tracks readiness per student
- **Mobility Intelligence** — Palestinian passport visa feasibility map for every recommended country
- **Admin Panel** — Mark can upload files (PDF, Word, Excel, TXT), paste text, add/edit/delete scholarships, and manage the knowledge base — all changes reflect instantly for all students
- **Landing Page** — public-facing homepage aligned with Mark Ashwill's Gaza Scholarship Guide vision

---

## 🗂️ Project Structure

```
gaza-scholarship-guide/
├── public/
│   ├── index.html              # Landing page
│   ├── app.html                # Student dashboard
│   └── admin.html              # Admin panel (password protected)
├── knowledge_base/             # Mark's uploaded files (local only)
├── data/                       # JSON backups (local only)
├── server.js                   # Express server + AI proxy + MongoDB
├── import_marks_data.py        # One-time import: CSV + files → MongoDB
├── package.json
├── .env.example
├── .env                        # Your secrets (never committed)
├── .gitignore
└── README.md
```

---

## ⚡ Quick Start (WSL / Linux / Mac)

### 1. Clone the repo

```bash
git clone https://github.com/SanaAdeelKhan/gaza-scholarship-guide.git
cd gaza-scholarship-guide
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

```bash
cp .env.example .env
nano .env
```

```env
GEMINI_API_KEY=your_gemini_api_key_here       # Primary AI (PDF extraction + chat)
GROQ_API_KEY=your_groq_api_key_here           # Fallback AI + text extraction (free)
MONGODB_URI=mongodb+srv://...                  # MongoDB Atlas connection string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_admin_password
PORT=3000
```

> **Get API keys:**
> - Gemini: [aistudio.google.com](https://aistudio.google.com) → Get API Key (free)
> - Groq: [console.groq.com](https://console.groq.com) → Create API Key (free)
> - MongoDB: [mongodb.com/atlas](https://mongodb.com/atlas) → Free M0 cluster

### 4. Import Mark's scholarship data

Place Mark's files in the `knowledge_base/` folder, then run:

```bash
pip install pymongo dnspython pdfplumber openpyxl
node << 'EOF'
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const S = mongoose.model('Scholarship', new mongoose.Schema({}, { strict: false }));
  const K = mongoose.model('Knowledge',   new mongoose.Schema({}, { strict: false }));
  const schols = JSON.parse(fs.readFileSync('data/scholarships.json', 'utf8'));
  const knows  = JSON.parse(fs.readFileSync('data/knowledge.json',   'utf8'));
  await S.deleteMany({}); await K.deleteMany({});
  if (schols.length) await S.insertMany(schols);
  if (knows.length)  await K.insertMany(knows);
  console.log(`Imported ${schols.length} scholarships + ${knows.length} knowledge docs`);
  mongoose.disconnect();
});
EOF
```

### 5. Run the app

```bash
npm run dev      # Development (auto-restarts on changes)
npm start        # Production
```

### 6. Open in browser

```
Landing page:   http://localhost:3000/
Student app:    http://localhost:3000/app
Admin panel:    http://localhost:3000/admin
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | ✅ Yes | Google Gemini — PDF extraction + AI chat |
| `GROQ_API_KEY` | ✅ Yes | Groq (Llama 3.3 70B) — text extraction + chat fallback |
| `MONGODB_URI` | ✅ Yes | MongoDB Atlas connection string |
| `ADMIN_USERNAME` | ✅ Yes | Admin panel login username |
| `ADMIN_PASSWORD` | ✅ Yes | Admin panel login password |
| `PORT` | No | Server port (default: 3000) |

> ⚠️ **Never commit your `.env` file.** It's in `.gitignore` by default.

---

## 🌐 How the AI Works

All API keys are stored **only on the server** in `.env` — never exposed to the browser.

```
Student types message in AI Advisor
       ↓
Browser → POST /api/chat
  (sends: student profile + tracker + documents + message)
       ↓
Server reads live scholarships + knowledge base from MongoDB
       ↓
Builds full context: Mark's v10 system prompt
  + 100 live scholarships
  + knowledge base (essay templates, strategy guides)
  + student's personal profile, tracker, documents
       ↓
Gemini 2.0 Flash generates response
  (fallback: Groq Llama 3.3 70B if Gemini quota exceeded)
       ↓
Personalized reply displayed in app
```

### AI Modes (Mark Ashwill's v10 System)

| Mode | Trigger | Behavior |
|---|---|---|
| **Discovery** | Profile incomplete | Asks max 2 questions per turn |
| **Matching** | Profile known | Recommends 3–5 scholarships filtered by funding, field, visa, English |
| **Decision** | Options presented | Scores each option, recommends top 2–3 |
| **Execution** | Decision made | Week-by-week action plan, essay drafts, document checklist |

---

## 🛡️ Admin Panel

The admin panel at `/admin` allows Mark to:

- **Import files** — upload PDF, Word, Excel, TXT, CSV files; Gemini extracts scholarship data automatically
- **Paste text** — WhatsApp messages, emails, website copy → AI extracts and structures it
- **Add / Edit / Delete** scholarships individually
- **Manage knowledge base** — essay templates, strategy guides, matching rules fed to AI Advisor
- All changes reflect **instantly** for all students

---

## 💾 Data Storage

| Data | Storage | Persists? |
|---|---|---|
| Scholarships (100+) | MongoDB Atlas | ✅ Permanent |
| Knowledge base | MongoDB Atlas | ✅ Permanent |
| Student profile | Browser localStorage | ✅ Per device |
| Application tracker | Browser localStorage | ✅ Per device |
| Document checklist | Browser localStorage | ✅ Per device |
| Admin session | Server memory | ❌ Resets on restart (re-login) |

---

## 👥 Team

| Person | Role |
|---|---|
| **Mark Ashwill** | GPT Owner · Scholarship domain expert · Data provider |
| **Sana Adeel** | App Developer · GazaBridge creator |
| **Ebtihal Maher** | Technical PM · UX · Gaza student insight |

---

## 🚀 Deployment

Deployed on **Render** (free tier) with **MongoDB Atlas** (free M0 cluster).

**To deploy your own instance:**

1. Push to GitHub
2. Connect repo to [render.com](https://render.com)
3. Add all environment variables in Render → Environment
4. Deploy — Render auto-deploys on every `git push`

**Pending:**
- [ ] Custom domain
- [ ] Multi-student account system (currently localStorage per device)
- [ ] WhatsApp / Telegram bot integration
- [ ] Arabic language support
- [ ] Real deadline dates from Mark's dataset

---

## 📄 License

MIT — Free to use, share, and build upon for humanitarian purposes.

---

*Built with ♥ for the students of Gaza.*
