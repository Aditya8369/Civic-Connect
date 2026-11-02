<div align="center">

# 🏙️ Civic-Connect
### *Next-Generation Civic Intelligence & Municipal Grievance Redressal*

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=1,12,24&height=220&section=header&text=Civic-Connect&fontSize=64&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Empowering%20Communities%20Through%20Transparent%20Issue%20Resolution&descFontSize=20&descAlignY=58&descAlign=50" alt="Civic-Connect Banner" width="100%" />
</p>

<!-- Live & Tech Badges -->
<p align="center">
  <a href="https://civic-connect-enim.vercel.app/"><img src="https://img.shields.io/badge/Live_Demo-Vercel_Edge-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/React_19-Modern_SPA-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React 19" /></a>
  <a href="https://vitejs.dev/"><img src="https://img.shields.io/badge/Vite_8-Blazing_HMR-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite 8" /></a>
  <a href="https://tailwindcss.com/"><img src="https://img.shields.io/badge/Tailwind_v4-Tailored_Theme-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" /></a>
  <a href="https://firebase.google.com/"><img src="https://img.shields.io/badge/Firebase-Realtime_Firestore-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase" /></a>
  <a href="https://github.com/chhavikant03/Civic-Connect"><img src="https://img.shields.io/badge/Open_Source-WOCS_2026-brightgreen?style=for-the-badge&logo=github" alt="Open Source" /></a>
</p>

<!-- Navigation Matrix Bar -->
<p align="center">
  <b><a href="#-interactive-demo--visual-tour">Visual Tour</a></b> •
  <b><a href="#-key-features">Key Capabilities</a></b> •
  <b><a href="#-architecture-blueprint">Architecture</a></b> •
  <b><a href="#-live-lifecycle-state-machine">Lifecycle</a></b> •
  <b><a href="#-comprehensive-documentation-library">5 Master Manuals</a></b> •
  <b><a href="#-quickstart-guide">Quickstart</a></b> •
  <b><a href="#-security-audit--advisories">Security</a></b> •
  <b><a href="#-project-leadership--mentorship">Leadership</a></b>
</p>

<p align="center">
  <sub>Bridging citizens and local municipalities with real-time grievance tracking, sequential ticket indexing (<code>CMP-YYYY-XXXX</code>), geolocation tagging, and automated administrative triage.</sub>
</p>

</div>

## 🌿 Why Civic-Connect Matters

> *"A city works best when every resident has a voice that gets heard, and every municipal worker has the clarity to act."*

Most neighborhood issues—a broken streetlight on a dark lane, an overflowing dumpster near a school, or a water pipeline leak—often go unnoticed not because nobody cares, but because traditional reporting channels are fragmented, slow, and opaque. Citizens file grievances into black holes, never knowing if anyone received them. Municipal teams receive disorganized reports without accurate location coordinates or photo evidence.

**Civic-Connect bridges this gap with humanity, clarity, and speed:**
- **For Everyday Citizens:** Snap a photo, drop an automated GPS pin, describe what's wrong, and watch your issue progress step-by-step from dispatch to completion with zero guesswork.
- **For Municipal Field Teams:** Triage incoming concerns instantly, assign certified field crew members with direct contacts, and record real-time resolution notes with photos upon completion.
- **For Community Advocates & Mentors:** Build trust through total transparency, accountability metrics, and an active open-source ecosystem where contributors continuously elevate civic life.

---

## 🎬 Interactive Demo & Visual Tour

<div align="center">

```mermaid
flowchart LR
    A["📱 Citizen Logs Issue<br/>(/report)"] -->|"Geo-Tag Coordinates & Category"| B["⚡ Cloud Firestore<br/>(Atomic Transaction CMP-2026-XXXX)"]
    B -->|"Real-Time Push Listener"| C["🏢 Municipal Admin Desk<br/>(/admin/reports)"]
    C -->|"Assign Worker & Department"| D["👷 Field Worker Dispatched<br/>(Phone + Work Order)"]
    D -->|"Log Resolution Notes"| E["✅ Ticket Resolved<br/>(Live Citizen Notification)"]

    style A fill:#0284c7,stroke:#0369a1,stroke-width:2px,color:#fff
    style B fill:#f59e0b,stroke:#d97706,stroke-width:2px,color:#fff
    style C fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style D fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff
    style E fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
```

</div>

---

## 🌟 Key Features

<table width="100%">
  <tr>
    <td width="33%" valign="top">
      <div align="center">
        <img src="https://img.shields.io/badge/GPS_Tagged-Location-blue?style=for-the-badge&logo=google-maps&logoColor=white" /><br/><br/>
      </div>
      <h4>📍 Geo-Tagged Grievances</h4>
      <p>Report public infrastructure defects with browser geolocation coordinates (latitude/longitude) and human-readable landmarks.</p>
    </td>
    <td width="33%" valign="top">
      <div align="center">
        <img src="https://img.shields.io/badge/Sequential_ID-CMP--2026-purple?style=for-the-badge&logo=firebase&logoColor=white" /><br/><br/>
      </div>
      <h4>🔢 Atomic Sequential IDs</h4>
      <p>Guaranteed monotonic counter transactions automatically generate clean civic ticket numbers formatted as <code>CMP-YYYY-XXXX</code>.</p>
    </td>
    <td width="33%" valign="top">
      <div align="center">
        <img src="https://img.shields.io/badge/Real--Time-Live_Sync-emerald?style=for-the-badge&logo=databricks&logoColor=white" /><br/><br/>
      </div>
      <h4>⚡ Instant Push Alerts</h4>
      <p>Continuous Firestore <code>onSnapshot</code> listeners power unread notification counters, navbar badges, and dynamic reactive toasts.</p>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <div align="center">
        <img src="https://img.shields.io/badge/Admin_Triage-Department-indigo?style=for-the-badge&logo=windows&logoColor=white" /><br/><br/>
      </div>
      <h4>📊 Municipal Triage Desk</h4>
      <p>Multi-field filtering across 8 categories, 5 departments (Roads, Water, Sanitation, Electricity, Safety), and status indicators.</p>
    </td>
    <td width="33%" valign="top">
      <div align="center">
        <img src="https://img.shields.io/badge/Field_Worker-Dispatch-orange?style=for-the-badge&logo=aircall&logoColor=white" /><br/><br/>
      </div>
      <h4>👷 Field Worker Dispatch</h4>
      <p>Assign field technicians with validated contact numbers (<code>+91 XXXXXXXXXX</code>) directly linked to municipal departments.</p>
    </td>
    <td width="33%" valign="top">
      <div align="center">
        <img src="https://img.shields.io/badge/UI_Aesthetics-Radix_%2B_Framer-pink?style=for-the-badge&logo=framer&logoColor=white" /><br/><br/>
      </div>
      <h4>🌓 Modern Accessible UI</h4>
      <p>Accessible Radix UI dialogs, smooth Framer Motion layout transitions, mobile drawer navigation, and dark/light mode toggle.</p>
    </td>
  </tr>
</table>

---

## 🏗️ Architecture Blueprint

Civic-Connect follows a client-direct Backend-as-a-Service (BaaS) architecture:

```mermaid
flowchart TB
    subgraph ClientZone ["Browser Single-Page Application (React 19 + Vite 8)"]
        UI["Modern UI Layer<br/>(Tailwind v4, Radix Headless, Framer Motion)"]
        Contexts["State Contexts<br/>(AuthContext, ThemeContext)"]
        Router["Declarative Router<br/>(AppRoutes + ProtectedRoute RBAC)"]
    end

    subgraph Boundary ["Zero-Trust Boundary (TLS / HTTPS)"]
        WireProtocol["Firebase WebChannel Wire"]
    end

    subgraph FirebaseCore ["Google Cloud Firebase Platform"]
        AuthCore["Firebase Authentication<br/>(Identity Provider & Tokens)"]
        FirestoreDB[("Cloud Firestore<br/>(issues, users, notifications, counters)")]
        StorageBucket["Cloud Storage<br/>(Attachment Assets Bucket)"]
    end

    UI --> Contexts
    UI --> Router
    Router --> WireProtocol
    WireProtocol <-->|Session Tokens & Claims| AuthCore
    WireProtocol <-->|onSnapshot Listeners & Mutations| FirestoreDB
    WireProtocol -.->|Unused Object Store| StorageBucket

    style ClientZone fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#fff
    style Boundary fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#94a3b8
    style FirebaseCore fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#fff
```

---

## 🔄 Live Lifecycle State Machine

Complaints advance through an accountable state machine:

```mermaid
stateDiagram-v2
    [*] --> Pending : Citizen Submits (/report)
    
    Pending --> InProgress : Admin Assigns Dept & Worker
    Pending --> Rejected : Out of Jurisdiction / Invalid
    Pending --> Cancelled : Citizen Deletes (Self-Service)
    
    InProgress --> Resolved : Work Verified & Notes Saved
    InProgress --> OnHold : Weather Delay / Parts Needed
    OnHold --> InProgress : Work Resumed
    
    Resolved --> Reopened : Citizen Appeals within 7 Days
    Reopened --> InProgress : Technician Re-dispatched
    
    Resolved --> [*] : Closed Permanently
    Rejected --> [*] : Closed Permanently
    Cancelled --> [*] : Closed Permanently
```

---

## 📖 Comprehensive Documentation Library

Our documentation is strictly organized into **5 master manuals** in [`docs/`](docs/documentation-hub.md) to eliminate fragmentation:

<div align="center">

```
docs/
├── documentation-hub.md           # 🧭 Manual 1: Documentation Hub, Vision, Personas & Glossary
├── architecture-and-data.md       # 🏗️ Manual 2: System Architecture, BaaS Trust & Firestore Schemas
├── features-and-workflows.md      # ⚡ Manual 3: Capability Matrix, State Machine & User Journeys
├── security-quality-and-issues.md # 🛡️ Manual 4: Threat Model, RBAC, Known Issues Register (CC-001..011)
└── operations-and-roadmap.md      # 🚀 Manual 5: Local Dev, Emulators, Deployment, Roadmap & PR Rules
```

</div>

| Manual | Target Audience | Primary Coverage |
|---|---|---|
| **[Manual 1: Documentation Hub](docs/documentation-hub.md)** | Newcomers & Evaluators | Mission, problem statement, citizen/admin responsibilities, terminology glossary, reading matrix. |
| **[Manual 2: Architecture & Data](docs/architecture-and-data.md)** | Architects & Engineers | BaaS trust boundaries, sequence diagrams with failure paths, complete Firestore schemas, indexes, ADRs. |
| **[Manual 3: Features & Workflows](docs/features-and-workflows.md)** | Product Teams & QA | 20+ feature status audit, complaint state machine, worker dispatch journeys, UI/UX and accessibility. |
| **[Manual 4: Security & Quality](docs/security-quality-and-issues.md)** | Security Reviewers & QA | Threat model, production Firestore rules, confirmed defects register (`CC-001` to `CC-011`), test cases. |
| **[Manual 5: Operations & Roadmap](docs/operations-and-roadmap.md)** | Maintainers & Contributors | Local setup, Firebase emulators, SPA rewrites, cloud budget controls, phased roadmap, PR guidelines. |

---

## 🚀 Quickstart Guide

Get the project running on your local machine in under 3 minutes:

### Prerequisites
- **Node.js:** v18.0.0 or higher (`node -v`)
- **Package Manager:** `npm` v9+ (`npm -v`)
- **Git:** v2.30+

```bash
# 1. Clone your fork of the repository
git clone https://github.com/chhavikant03/Civic-Connect.git
cd Civic-Connect

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env

# 4. Start the development server
npm run dev
```

Visit **[http://localhost:5173](http://localhost:5173)** in your browser.

---

## 🛡️ Security Audit & Advisories

An independent architectural review established the following security register:

| ID | Severity | Finding Summary | Impact | Action Required |
|---|---|---|---|---|
| **CC-001** | `Critical` | Hardcoded admin credentials embedded in `AuthPage.jsx`. | Administrative account takeover. | Remove hardcoded email/password. |
| **CC-002** | `Critical` | User registration accepts caller-supplied `role` string. | Self-elevation to administrator. | Enforce roles via Custom Claims. |
| **CC-003** | `High` | Missing version-controlled `firestore.rules` in repository. | Database access unverified in Git. | Commit rules to project root. |
| **CC-004** | `High` | Issue created before notification failure triggers error toast. | Duplicate ticket submission. | Wrap operations in `writeBatch`. |
| **CC-005** | `High` | Live snapshot listener overwrites unsaved resolution notes. | Loss of uncommitted draft notes. | Guard textarea with dirty-state check. |

*Read complete remediation blueprints and test cases in **[Manual 4: Security & Quality](docs/security-quality-and-issues.md)**.*

---

## 👥 Project Leadership & Mentorship

<div align="center">

<table>
  <thead>
    <tr>
      <th align="center">Leadership Role</th>
      <th align="center">Name</th>
      <th align="center">Affiliation & Connect</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><b>Project Mentor</b></td>
      <td align="center"><b>Kartik Chilkoti</b></td>
      <td align="center">
        <a href="https://github.com/chhavikant03/Civic-Connect"><img src="https://img.shields.io/badge/Project_Mentor-WOCS_2026-6366F1?style=for-the-badge&logo=target&logoColor=white" alt="Mentor Badge" /></a>
      </td>
    </tr>
    <tr>
      <td align="center"><b>Project Admin & Creator</b></td>
      <td align="center"><b>Chhavi Kant</b></td>
      <td align="center">
        <a href="https://github.com/chhavikant03"><img src="https://img.shields.io/badge/GitHub-chhavikant03-181717?style=for-the-badge&logo=github&logoColor=white" alt="GitHub" /></a>&nbsp;
        <a href="https://www.linkedin.com/in/chhavi-kant-959bb1306/"><img src="https://img.shields.io/badge/LinkedIn-Chhavi_Kant-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn" /></a>
      </td>
    </tr>
  </tbody>
</table>

</div>

---

## 🤝 Contributing

We welcome open-source contributions from participants of **Winter of Code Social (WOCS)** and the global developer community!

1. **Find an Issue:** Browse our [GitHub Issues](https://github.com/chhavikant03/Civic-Connect/issues).
2. **Get Assigned:** Comment on the issue and wait for official maintainer assignment.
3. **Follow Standards:** Branch naming (`feature/*`, `fix/*`), Conventional Commits (`feat:`, `fix:`), and run `npm run lint`.
4. **Submit PR:** Open a Pull Request targeting `main` with clear screenshots and test evidence.

*See complete contribution guidelines in **[Manual 5: Operations & Roadmap](docs/operations-and-roadmap.md)**.*

---

<div align="center">

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=1,12,24&height=120&section=footer" alt="Footer Banner" width="100%" />
</p>

⭐ **If you find Civic-Connect inspiring, consider giving this repository a star!** ⭐  
*Together, let's build cleaner, safer, and more connected communities.* 🏙️

</div>
