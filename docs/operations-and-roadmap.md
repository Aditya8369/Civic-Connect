# Operations, Deployment & Roadmap

This manual provides complete developer setup instructions, emulator configurations, deployment rules, the engineering roadmap, and contributing standards for Civic-Connect.

---

## 1. Local Development & Emulator Guide

### 1.1 Prerequisites
- **Node.js:** v18.0.0+ (v20+ LTS recommended).
- **Package Manager:** `npm` v9+ (or `pnpm`).
- **Firebase CLI:** `npm install -g firebase-tools` (for emulators).

### 1.2 Step-by-Step Setup
```bash
# 1. Clone the repository
git clone https://github.com/chhavikant03/Civic-Connect.git
cd Civic-Connect

# 2. Install dependencies
npm install

# 3. Create .env file with development credentials
cp .env.example .env

# 4. Start the Vite development server
npm run dev
```

### 1.3 Local Firebase Emulators
The application natively connects to local emulators when enabled in `.env` ([`services.js:12`](file:///d:/civic-connect/Civic-Connect/src/firebase/services.js#L12)):

```env
VITE_USE_EMULATORS=true
```

- **Auth Emulator:** `http://localhost:9099`
- **Firestore Emulator:** `localhost:8080`
- **Storage Emulator:** `localhost:9199`

Start the emulators with:
```bash
firebase emulators:start
```

---

## 2. Production Deployment & Operations

### 2.1 Static Single-Page Application (SPA) Build
```bash
npm run build
```
Compiled assets are output to `dist/`.

### 2.2 Client-Side Routing Rewrite Rules
Because routing is managed by `react-router-dom`, edge hosts must rewrite all non-file requests to `/index.html`.

- **Vercel (`vercel.json`):**
  ```json
  {
    "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
  }
  ```

- **Firebase Hosting (`firebase.json`):**
  ```json
  {
    "hosting": {
      "public": "dist",
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    }
  }
  ```

### 2.3 Cost Controls & Budget Alerts
Because administrative pages currently use unbounded `onSnapshot` queries, maintainers must configure **Google Cloud Budget Alerts** to prevent billing surprises from runaway document reads.

---

## 3. Engineering Implementation Roadmap

```
Phase 1: Security & Auth Integrity (P0)
   ├── Remove hardcoded admin password from AuthPage.jsx (CC-001)
   ├── Commit firestore.rules and firebase.json to Git (CC-003)
   └── Lock down role modifications via Custom Auth Claims (CC-002)

Phase 2: Reliability & Data Integrity (P1)
   ├── Atomic write batch for issue submission & notifications (CC-004)
   └── Protect unsaved resolution notes from live snapshot overwrites (CC-005)

Phase 3: Operational Accountability (P1)
   ├── True event audit trail sub-collection (issues/{id}/events) (CC-009)
   └── Status lifecycle expansion (Rejection reasons & 7-day citizen reopen)

Phase 4: Usability & Persistence (P2)
   ├── Wire Citizen Profile & Admin Settings forms to Firestore (CC-007)
   └── Interactive OpenStreetMap / Leaflet coordinate pin drop

Phase 5: Performance & Scale (P3)
   └── Cursor-based pagination on administrative complaint tables (CC-008)
```

---

## 4. Contributing Standards & Workflow

1. **Issue Assignment:** Comment on an open issue and wait for formal assignment before opening a pull request.
2. **Branching:** Create a feature branch from latest `main`:
   - `feature/short-description`
   - `fix/short-description`
3. **Commit Messages:** Follow Conventional Commits:
   - `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `test:`
4. **Validation Checklist Before PR:**
   - [ ] Run `npm run lint` (zero warnings).
   - [ ] Run `npm run build` (confirm successful bundle in `dist/`).
   - [ ] Confirm no secrets, tokens, or personal phone numbers are included.
