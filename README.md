# ⚡ PlanForge AI — Intelligent Project Planning

> **AI-powered project planning tool that converts BRD / SOW documents into complete, Jira-ready project plans — inside Google Apps Script.**

![License](https://img.shields.io/badge/license-MIT-blue) ![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-orange) ![AI](https://img.shields.io/badge/AI-Gemini-purple)

---

## 🚀 What It Does

PlanForge AI reads your project documents and generates a fully structured plan in one click:

- **Upload a BRD** (.docx) or **SOW + ARB** (PDF pair)
- Gemini AI extracts requirements and produces Epics, Stories, Subtasks, Sprints, RAID Log, and Test Cases
- Everything renders in an interactive dashboard — Gantt chart, resource planner, capacity model, risk radar, and more
- Export to Excel or push directly to Jira

---

## ✨ Features

| Feature | Description |
|---|---|
| 📄 **BRD Mode** | Upload a single `.docx` Business Requirements Document |
| 📑 **SOW + ARB Mode** | Upload Statement of Work + Architecture Review Board PDFs |
| 🔄 **Jira Import** | Pull an existing Jira project into the dashboard |
| 📊 **Live Dashboard** | 6-tab analytics hub: Overview, Sprints, RAID, Tests, Health, Charts |
| 📅 **Gantt Chart** | Interactive timeline — By Sprint, By Epic, or Full WBS |
| 👥 **Resource Planner** | FTE scenario analysis with comparison table and visual timeline bars |
| 🔀 **Parallel Work Analysis** | AI recommendations for concurrent epic execution |
| ⚙️ **Capacity Planner** | Sprint-level utilisation with WBS story breakdown |
| 🚀 **Velocity Tracker** | Sprint velocity trends and smart completion estimator |
| 🎯 **AI Risk Radar** | Spider chart scoring 6 project health dimensions |
| 🗂️ **Full WBS** | Hierarchical Epic → Story → Subtask breakdown with acceptance criteria |
| 📎 **Excel Export** | Full plan as a formatted Excel workbook |
| ✅ **Two-Level Approval** | PM + Solution Architect review workflow before Jira push |
| 💾 **Shared Drive** | Auto-save and reload plans from Google Shared Drive |

---

## 🛠️ Setup

### Prerequisites

- A Google account with access to **Google Apps Script**
- A **Gemini API key** (free at [aistudio.google.com](https://aistudio.google.com))
- Optional: Jira account with API token for push/import features

### Installation

1. **Create a new Google Apps Script project**
   - Go to [script.google.com](https://script.google.com) → New Project

2. **Add the HTML file**
   - Create a file named `Index.html` and paste the contents of `index.html` from this repo

3. **Add the server-side script**
   - In `Code.gs`, implement the backend functions listed in [Backend Functions](#backend-functions)

4. **Deploy as a Web App**
   - Click **Deploy → New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Access: **Anyone** (or restrict to your org)

5. **Configure API Keys**
   - Open the deployed app
   - Expand the **Gemini API Keys** panel
   - Paste your two Gemini API keys and click **Save Keys**

---

## 🔑 Backend Functions

The frontend calls these `google.script.run` functions. Implement them in `Code.gs`:

| Function | Description |
|---|---|
| `saveApiKeys(key1, key2)` | Stores keys in User Properties |
| `getApiKeys()` | Returns `{ key1Saved, key2Saved }` |
| `processBRD(base64, name, type, start, end)` | Processes BRD file with Gemini AI |
| `processSOWandARB(b64SOW, nameSOW, b64ARB, nameARB, start, end)` | Processes SOW + ARB pair |
| `reGeneratePlanWithComments(planId, comments)` | Re-runs AI generation with reviewer feedback |
| `getExistingPlans()` | Lists saved plans from Google Sheets |
| `loadExistingPlan(planId)` | Loads a saved plan by ID |
| `exportPlanToExcelFromUI(planId)` | Builds and returns an Excel download URL |
| `getJiraProjects()` | Lists available Jira projects |
| `pushToJiraFromUI(planId, projectKey, l1, l1c, l2, l2c)` | Creates Jira issues from plan |
| `importFromJira(projectKey, options)` | Imports an existing Jira project |
| `savePlanToSharedDrive(planId, path)` | Saves plan JSON to a Shared Drive folder |
| `getAPIUsage()` | Returns token usage stats per key |
| `sendApprovalEmail(planId)` | Sends approval notification email |

---

## 📋 Plan Schema

The AI returns a JSON object with this structure:

```json
{
  "projectName": "string",
  "epics": [
    {
      "summary": "string",
      "description": "string",
      "stories": [
        {
          "summary": "string",
          "description": "string",
          "storyPoints": 5,
          "acceptanceCriteria": ["string"],
          "subtasks": [
            { "summary": "string", "storyPoints": 2 }
          ]
        }
      ]
    }
  ],
  "sprints": [
    {
      "sprintNumber": 1,
      "goal": "string",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD",
      "totalStoryPoints": 40,
      "storyKeys": ["string"]
    }
  ],
  "raidLog": {
    "risks": [{ "description": "string", "mitigation": "string" }],
    "assumptions": ["string"],
    "dependencies": [{ "description": "string", "owner": "string" }],
    "issues": ["string"]
  },
  "testCases": [
    {
      "title": "string",
      "type": "positive | negative | edge",
      "precondition": "string",
      "steps": ["string"],
      "expectedResult": "string"
    }
  ]
}
```

---

## 🔒 Security

- API keys are stored in **Google User Properties** — never exposed to other users
- The Jira push action requires a **password confirmation** before executing
- Two-level (PM + Solution Architect) approval is required before any Jira push
- All file content is processed server-side within your own Google account

---

## 🏗️ Architecture

```
Browser (HTML/CSS/JS)
    │
    │  google.script.run()
    ▼
Google Apps Script (Code.gs)
    ├── Gemini API  ──→  Plan generation / test case generation
    ├── Google Sheets  ──→  Plan persistence
    ├── Google Drive  ──→  Shared plan storage
    └── Jira REST API  ──→  Push issues / import project
```

---

## 📸 Sections Overview

- **Upload & Generate** — Mode selector, API key panel, file dropzone, progress steps
- **Live Dashboard** — Metrics, RAID summary, test coverage, charts
- **Gantt + WBS** — Sprint/Epic/WBS views with today marker
- **Resource Planner** — Role FTE config, scenario slider, comparison table, parallel work swimlane
- **Capacity Planner** — Team size inputs, sprint utilisation table, WBS story breakdown
- **Velocity & Estimator** — Bar chart, avg/peak/low velocity cards, risk-buffered completion date
- **Risk Radar** — Radar chart across 6 health dimensions
- **Sprint Plan** — Sprint cards with goals, dates, story points
- **Epics & Stories** — Collapsible epic/story tree with acceptance criteria
- **RAID Log** — Four-column risk / assumption / dependency / issue log
- **Test Cases** — Table with positive / negative / edge case coverage
- **Review & Approve** — Two-level approval form with re-generate option

---

## 📦 Dependencies

All loaded via CDN — no build step required:

- [Chart.js 4.4.0](https://www.chartjs.org/) — charts and radar
- [Plus Jakarta Sans + Inter + JetBrains Mono](https://fonts.google.com/) — typography

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT — see [LICENSE](LICENSE) for details.

---

## 🙋 FAQ

**Q: Do I need to pay for Gemini API?**
The free tier at [aistudio.google.com](https://aistudio.google.com) is sufficient for most plans. Two separate keys are used to spread token load across plan generation and test case generation.

**Q: Can I use this without Jira?**
Yes. The Excel export and Shared Drive save/load work independently of Jira.

**Q: How long does generation take?**
Typically 60–120 seconds depending on document length and Gemini API latency.

**Q: Can I reload a previously generated plan?**
Yes — use the **Load / Edit Existing Plan** panel at the top. Plans are stored in Google Sheets under your account.
