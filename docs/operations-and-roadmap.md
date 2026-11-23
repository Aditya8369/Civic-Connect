# Operations, Deployment & Roadmap

This manual provides complete developer setup instructions, emulator configurations, deployment rules, the engineering roadmap, and contributing standards for Civic-Connect.

---

## 1. Local Development & Emulator Guide

### 1.1 Prerequisites
- **Node.js:** v20.19+ (or v22.12+), as required by the current Vite toolchain.
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
The application connects to local emulators when enabled in `.env` ([`services.js`](../src/firebase/services.js)):

```env
VITE_USE_EMULATORS=true
```

- **Auth Emulator:** `http://localhost:9099`
- **Firestore Emulator:** `localhost:8080`
- **Storage Emulator:** `localhost:9199`

Start the emulators with the repository script:
```bash
npm run emulators:start
```

Use `npm run emulators:seed` to load local demo data. See the root [README](../README.md) for the demo accounts and emulator ports.

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
Administrative report tables use cursor-based pages, while search and export fetches are bounded. Review query limits when adding new collection listeners, and configure **Google Cloud Budget Alerts** for the Firebase project.

---

## 3. Engineering Implementation Roadmap

The roadmap below reflects remaining work identified in the current known-findings audit. Completed items are recorded in [Security, Quality Assurance & Findings Audit](security-quality-and-issues.md).

1. **Notification privacy (CC-006):** Add per-administrator read receipts so one administrator marking an alert read does not clear it for the rest of the admin team.
2. **Profile photos (CC-011):** Connect the profile photo control to a file picker, validate and upload the image, and display the saved photo accessibly.
3. **Keep security evidence current:** Update the rules tests and this manual whenever authentication, authorization, or data access behavior changes.

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
