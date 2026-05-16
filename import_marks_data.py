#!/usr/bin/env python3
"""
Run this once from ~/gaza-scholarship-guide:
  python3 import_marks_data.py

It will:
1. Parse gaza_scholarship_dataset_100.csv → scholarships.json (100 real scholarships)
2. Read all knowledge text files → knowledge.json (AI Advisor context)
"""

import csv, json, os, re

BASE = os.path.dirname(os.path.abspath(__file__))
KB   = os.path.join(BASE, 'knowledge_base')
DATA = os.path.join(BASE, 'data')
os.makedirs(DATA, exist_ok=True)

# ── Country → flag emoji map ──────────────────
FLAGS = {
    'usa': '🇺🇸', 'united states': '🇺🇸', 'uk': '🇬🇧', 'united kingdom': '🇬🇧',
    'ireland': '🇮🇪', 'germany': '🇩🇪', 'france': '🇫🇷', 'turkey': '🇹🇷',
    'türkiye': '🇹🇷', 'hungary': '🇭🇺', 'malaysia': '🇲🇾', 'china': '🇨🇳',
    'japan': '🇯🇵', 'south korea': '🇰🇷', 'korea': '🇰🇷', 'russia': '🇷🇺',
    'canada': '🇨🇦', 'australia': '🇦🇺', 'new zealand': '🇳🇿', 'norway': '🇳🇴',
    'sweden': '🇸🇪', 'finland': '🇫🇮', 'denmark': '🇩🇰', 'netherlands': '🇳🇱',
    'belgium': '🇧🇪', 'switzerland': '🇨🇭', 'austria': '🇦🇹', 'italy': '🇮🇹',
    'spain': '🇪🇸', 'portugal': '🇵🇹', 'poland': '🇵🇱', 'czech republic': '🇨🇿',
    'czechia': '🇨🇿', 'slovakia': '🇸🇰', 'romania': '🇷🇴', 'bulgaria': '🇧🇬',
    'greece': '🇬🇷', 'cyprus': '🇨🇾', 'malta': '🇲🇹', 'croatia': '🇭🇷',
    'serbia': '🇷🇸', 'ukraine': '🇺🇦', 'egypt': '🇪🇬', 'jordan': '🇯🇴',
    'lebanon': '🇱🇧', 'morocco': '🇲🇦', 'tunisia': '🇹🇳', 'algeria': '🇩🇿',
    'libya': '🇱🇾', 'sudan': '🇸🇩', 'qatar': '🇶🇦', 'kuwait': '🇰🇼',
    'saudi arabia': '🇸🇦', 'uae': '🇦🇪', 'united arab emirates': '🇦🇪',
    'bahrain': '🇧🇭', 'oman': '🇴🇲', 'yemen': '🇾🇪', 'iraq': '🇮🇶',
    'iran': '🇮🇷', 'pakistan': '🇵🇰', 'india': '🇮🇳', 'bangladesh': '🇧🇩',
    'indonesia': '🇮🇩', 'thailand': '🇹🇭', 'vietnam': '🇻🇳', 'philippines': '🇵🇭',
    'singapore': '🇸🇬', 'taiwan': '🇹🇼', 'brazil': '🇧🇷', 'argentina': '🇦🇷',
    'mexico': '🇲🇽', 'colombia': '🇨🇴', 'chile': '🇨🇱', 'peru': '🇵🇪',
    'south africa': '🇿🇦', 'nigeria': '🇳🇬', 'kenya': '🇰🇪', 'ethiopia': '🇪🇹',
    'ghana': '🇬🇭', 'tanzania': '🇹🇿', 'uganda': '🇺🇬', 'senegal': '🇸🇳',
    'multiple': '🌍', 'global': '🌍', 'various': '🌍', 'international': '🌍',
    'europe': '🇪🇺', 'european': '🇪🇺',
}

def get_flag(country):
    c = (country or '').lower().strip()
    for k, v in FLAGS.items():
        if k in c:
            return v
    return '🌍'

def slug(name):
    return re.sub(r'[^a-z0-9-]', '', re.sub(r'\s+', '-', (name or '').lower()))[:60]

def parse_funding(coverage):
    c = (coverage or '').lower()
    if 'partial' in c or 'tuition only' in c:
        return 'partial'
    return 'full'

def parse_english(notes, name):
    text = ((notes or '') + ' ' + (name or '')).lower()
    if 'ielts' in text or 'toefl' in text or 'english proficiency' in text:
        if 'waiver' in text or 'no ielts' in text or 'not required' in text:
            return False, None, True
        if 'b2' in text or '6.5' in text or '6.0' in text:
            return True, 'B2', False
        if 'b1' in text or '5.5' in text:
            return True, 'B1', False
        return True, 'B2', False
    return False, None, True

def parse_visa(country, relevance):
    c = (country or '').lower()
    r = (relevance or '').lower()
    if any(x in c for x in ['turkey', 'türkiye', 'jordan', 'malaysia', 'pakistan', 'egypt', 'morocco', 'qatar', 'kuwait', 'uae', 'saudi']):
        return 'high'
    if any(x in c for x in ['hungary', 'germany', 'ireland', 'france', 'netherlands', 'china', 'russia', 'indonesia']):
        return 'moderate'
    if any(x in c for x in ['usa', 'united states', 'uk', 'united kingdom', 'australia', 'canada']):
        return 'low'
    if 'very high' in r or 'high' in r:
        return 'moderate'
    return 'moderate'

def parse_level(degree):
    d = (degree or '').lower()
    levels = []
    if any(x in d for x in ["bachelor", "undergrad", "undergraduate", "bsc", "ba "]):
        levels.append('undergraduate')
    if any(x in d for x in ["master", "graduate", "msc", "ma ", "postgrad", "taught"]):
        levels.append('graduate')
    if any(x in d for x in ["phd", "doctoral", "doctorate", "research"]):
        levels.append('phd')
    if any(x in d for x in ["all", "any", "various", "multiple"]):
        levels = ['undergraduate', 'graduate', 'phd']
    return levels if levels else ['graduate']

def parse_fields(best_for, notes):
    text = ((best_for or '') + ' ' + (notes or '')).lower()
    if any(x in text for x in ['engineer', 'stem', 'science', 'technology', 'math', 'comput']):
        if any(x in text for x in ['medicine', 'medical', 'health']):
            return ['engineering', 'science', 'it', 'medicine']
        return ['engineering', 'science', 'it']
    if any(x in text for x in ['medicine', 'medical', 'health', 'nursing', 'pharma']):
        return ['medicine', 'health']
    if any(x in text for x in ['humanities', 'social', 'arts', 'law', 'political']):
        return ['humanities', 'social']
    return ['all']

def parse_gaza_specific(relevance, target, name):
    text = ((relevance or '') + ' ' + (target or '') + ' ' + (name or '')).lower()
    return 'very high' in text or 'gaza' in text or 'palestin' in text

# ── 1. IMPORT CSV → scholarships.json ────────
csv_path = None
for f in os.listdir(KB):
    if 'dataset_100' in f.lower() and f.endswith('.csv'):
        csv_path = os.path.join(KB, f)
        break

if not csv_path:
    print("❌ CSV file not found in knowledge_base/")
    exit(1)

scholarships = []
with open(csv_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        name    = (row.get('Opportunity_Name') or '').strip()
        country = (row.get('Country_or_Region') or '').strip()
        degree  = (row.get('Degree_Level') or '').strip()
        coverage= (row.get('Coverage_Type') or '').strip()
        target  = (row.get('Target_Group') or '').strip()
        relevance=(row.get('Gaza_or_Palestinian_Relevance') or '').strip()
        best_for= (row.get('Best_For') or '').strip()
        url     = (row.get('Source_URL') or '').strip()
        verified= (row.get('Verification_Status') or '').strip()
        notes   = (row.get('Notes') or '').strip()
        provider= (row.get('Provider') or '').strip()

        if not name:
            continue

        eng_req, eng_min, waiver = parse_english(notes, name)
        levels  = parse_level(degree)
        fields  = parse_fields(best_for, notes)
        funding = parse_funding(coverage)
        visa    = parse_visa(country, relevance)
        gaza_sp = parse_gaza_specific(relevance, target, name)

        s = {
            'id':                slug(name),
            'name':              name,
            'country':           country,
            'flag':              get_flag(country),
            'provider':          provider,
            'funding':           funding,
            'covers':            coverage,
            'fields':            fields,
            'level':             levels,
            'english_required':  eng_req,
            'english_min':       eng_min,
            'ielts_waiver':      waiver,
            'visa_feasibility':  visa,
            'deadline':          'Check website',
            'gpa_min':           70,
            'link':              url,
            'required_documents':['Passport', 'Academic transcripts', 'Personal statement'],
            'notes':             notes or best_for,
            'visa_notes':        '',
            'gaza_specific':     gaza_sp,
            'verified':          'verified' in verified.lower(),
            'last_updated':      '2026-05-16',
            'target_group':      target,
            'degree_level':      degree,
        }
        scholarships.append(s)

out_path = os.path.join(DATA, 'scholarships.json')
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(scholarships, f, indent=2, ensure_ascii=False)

print(f"✅ Imported {len(scholarships)} scholarships → data/scholarships.json")

# ── 2. IMPORT KNOWLEDGE FILES → knowledge.json ─
knowledge_files = [
    'Scholarship_Essay_Templates_War_Affected_Students (1).pdf',
    'Scholarship_Application_Playbook (1).txt',
    'Student_Profile_Strategies (1).txt',
    'Gaza_Scholarship_Strategy_Engine (2).pdf',
    'Scholarship_Matching_Rules (1).pdf',
    'Displacement_Documentation_Guide (1).txt',
]

knowledge_texts = []

for fname in knowledge_files:
    fpath = os.path.join(KB, fname)
    if not os.path.exists(fpath):
        print(f"⚠️  Skipping {fname} — not found")
        continue

    ext = fname.lower().split('.')[-1]

    if ext == 'txt':
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read().strip()
        if text:
            knowledge_texts.append({'source': fname, 'content': text})
            print(f"✅ Read text: {fname} ({len(text)} chars)")

    elif ext == 'pdf':
        # Try to extract with pdfplumber or pypdf
        try:
            import pdfplumber
            with pdfplumber.open(fpath) as pdf:
                text = '\n'.join(p.extract_text() or '' for p in pdf.pages).strip()
            if text:
                knowledge_texts.append({'source': fname, 'content': text})
                print(f"✅ Read PDF: {fname} ({len(text)} chars)")
        except ImportError:
            try:
                from pypdf import PdfReader
                reader = PdfReader(fpath)
                text = '\n'.join(p.extract_text() or '' for p in reader.pages).strip()
                if text:
                    knowledge_texts.append({'source': fname, 'content': text})
                    print(f"✅ Read PDF: {fname} ({len(text)} chars)")
            except ImportError:
                print(f"⚠️  Can't read PDF {fname} — install pdfplumber: pip install pdfplumber --break-system-packages")

# Also read the xlsx knowledge files
xlsx_knowledge = [
    'Palestinian_Friendly_Universities (1).xlsx',
    'Need_Met_Universities_International (1).xlsx',
    'scholarship_probability_calculator (1).xlsx',
    'gaza_scholarship_gpt_build_kit (1).xlsx',
]

try:
    import openpyxl
    for fname in xlsx_knowledge:
        fpath = os.path.join(KB, fname)
        if not os.path.exists(fpath):
            continue
        try:
            wb = openpyxl.load_workbook(fpath, read_only=True, data_only=True)
            rows_text = []
            for sheet in wb.sheetnames:
                ws = wb[sheet]
                for row in ws.iter_rows(values_only=True):
                    if any(cell is not None for cell in row):
                        rows_text.append('\t'.join(str(c) if c is not None else '' for c in row))
            text = f"[Sheet: {fname}]\n" + '\n'.join(rows_text[:200])  # limit rows
            if text.strip():
                knowledge_texts.append({'source': fname, 'content': text})
                print(f"✅ Read Excel: {fname}")
        except Exception as e:
            print(f"⚠️  Could not read {fname}: {e}")
except ImportError:
    print("⚠️  openpyxl not installed — skipping Excel knowledge files")
    print("    Run: pip install openpyxl --break-system-packages")

# Save knowledge.json
knowledge_path = os.path.join(DATA, 'knowledge.json')
with open(knowledge_path, 'w', encoding='utf-8') as f:
    json.dump(knowledge_texts, f, indent=2, ensure_ascii=False)

print(f"\n✅ Saved {len(knowledge_texts)} knowledge documents → data/knowledge.json")
print(f"\n🎉 Done! Restart server with: npm run dev")
print(f"   Then check localhost:3000/api/health to verify scholarship count")
