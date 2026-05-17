with open('public/app.html', 'r') as f:
    content = f.read()

old = """IMPORTANT INSTRUCTIONS:
- You already have this student's full profile above — DO NOT ask for info already provided.
- Skip MODE 1 DISCOVERY for fields already known. Go directly to MODE 2 MATCHING.
- Use the live scholarship database provided by the server (100 real scholarships).
- Always refer to the student by name if provided.
- Be specific — mention actual scholarship names, deadlines, match reasons based on their field and GPA.
- Respond in English unless asked for Arabic.`"""

new = """;

  // Check if profile is complete
  const hasProfile = !!(p.name && p.field && p.gpa);

  if (!hasProfile) {
    return `PROFILE STATUS: INCOMPLETE. This student has NOT filled in their profile yet.
DO NOT give personalized scholarship matches.
Tell them to go to My Profile page and fill in their details first.
You may show 3-4 general Gaza-suitable scholarships as examples only, clearly labeled as general suggestions.`;
  }

  return `PROFILE STATUS: COMPLETE. Use all data below. Go directly to MODE 2 MATCHING.
DO NOT ask for any information already listed below.

STUDENT DATA:
- Name: ${p.name}
- Field: ${p.field}
- GPA: ${p.gpa}
- English: ${p.english}
- IELTS: ${p.ielts}
- Location: ${p.location || 'Gaza'}
- Funding needed: ${p.funding}
- Target regions: ${p.regions}
- Budget: ${p.budget}
- Circumstances: ${p.circumstances}
- Humanitarian status: ${p.humanitarian}

APPLICATION TRACKER (${tracker.length} applications):
${trackerSummary}

DOCUMENTS (${ready} ready / ${partial} partial / ${missing} missing):
${docSummary}

MATCHING INSTRUCTIONS:
- Match from the live 100-scholarship database to THIS student exact profile above
- Prioritize: visa feasibility + field match + English requirement + deadline urgency
- If documents are missing, mention which ones are needed for recommended scholarships
- If student already applied somewhere in tracker, acknowledge and focus on remaining options
- Always name actual scholarships with deadlines and match reasons
- Respond in English unless asked for Arabic.`"""

if old in content:
    content = content.replace(old, new)
    print("Fixed!")
else:
    print("Not found")
    idx = content.find("IMPORTANT INSTRUCTIONS")
    print(repr(content[idx:idx+300]))

with open('public/app.html', 'w') as f:
    f.write(content)
