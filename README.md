# 🌿 Gaza Scholarship Guide — v10 Platform

> AI-powered scholarship platform built specifically for Gaza students.
> Real opportunities · Visa-aware matching · Humanitarian support · Free to use.

---

## 📋 What is this?

The Gaza Scholarship Guide is a full-stack web application that helps Gaza students find, plan, and apply for fully-funded international scholarships. It combines:

- **AI Advisor** — powered by Groq (Llama 3.3 70B), reads each student's profile and gives personalized, executable scholarship advice
- **Scholarship Finder** — curated, fully-funded opportunities matched by GPA, field, English level, visa feasibility
- **Student Profile** — editable, saved locally per student
- **Application Tracker** — Kanban pipeline from research to decision
- **Document Checklist** — tracks readiness and suggests substitutions for missing docs
- **Mobility Intelligence** — Palestinian passport visa feasibility for every recommended country
- **Landing Page** — public-facing homepage matching Mark Ashwill's Gaza Scholarship Guide vision

---

## 🗂️ Project Structure

```
gaza-scholarship-guide/
├── public/
│   ├── index.html        # Landing page
│   └── app.html          # Main dashboard app
├── server.js             # Express server + Groq API proxy
├── package.json
├── .env.example          # Environment variable template
├── .env                  # Your secrets (never committed to git)
├── .gitignore
└── README.md
```

---

## ⚡ Quick Start (WSL / Linux / Mac)

### 1. Clone the repo
```bash
git clone https://github.com/YOUR_USERNAME/gaza-scholarship-guide.git
cd gaza-scholarship-guide
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
cp .env.example .env
```

Now open `.env` and add your Groq API key:
```bash
nano .env
```

```env
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

> **Get a free Groq API key:** Go to [console.groq.com](https://console.groq.com) → Sign up → Create API Key → Copy it

### 4. Run the app
```bash
npm run dev      # Development (auto-restarts on changes)
# or
npm start        # Production
```

### 5. Open in browser
```
Landing page:  http://localhost:3000/
App dashboard: http://localhost:3000/app
```

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | ✅ Yes | Free API key from [console.groq.com](https://console.groq.com) |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |

> ⚠️ **Never commit your `.env` file.** It's in `.gitignore` by default.

---

## 🌐 How the AI Works

The Groq API key is stored **only on the server** in `.env` — it never reaches the browser. The flow is:

```
Student types message
       ↓
Browser → POST /api/chat (sends profile + message)
       ↓
Server reads GROQ_API_KEY from .env → calls Groq API
       ↓
Groq (Llama 3.3 70B) generates response
       ↓
Server returns reply → displayed in app
```

This means the API key is always safe, even when sharing the app publicly.

---

## 👥 Team

| Person | Role |
|---|---|
| **Mark Ashwill** | GPT Owner · Scholarship domain expert |
| **Sana Adeel** | App Developer · GazaBridge creator |
| **Ebtihal Maher** | Technical PM · UX · Gaza student insight |

---

## 🚀 Deployment (coming soon)

- [ ] Deploy to Railway / Render (free tier)
- [ ] Custom domain
- [ ] Multi-student account system
- [ ] WhatsApp / Telegram bot integration
- [ ] Arabic language support

---

## 📄 License

MIT — Free to use, share, and build upon for humanitarian purposes.

---

*Built with ♥ for the students of Gaza.*
