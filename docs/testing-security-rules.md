# Testing Firebase Security Rules (Issue #254)

This guide documents the multi-principal security rules testing architecture, local test execution, and CI pipeline for Civic-Connect.

---

## 1. Architecture Overview

Civic-Connect secures all database records and storage assets through declarative Firestore and Storage security rules:
- `firestore.rules`: Enforces role-based access control, ownership verification, immutable audit logs, rate-limited upvoting/endorsements, and bounded profile/feedback updates.
- `storage.rules`: Enforces MIME type whitelists, strict path isolation (`complaint-photos/`, `complaint-audio/`, `resolution-feedback/`), and precise byte size ceilings ($5\text{ MB}$ for photos, $10\text{ MB}$ for voice notes).

The security test suites are implemented with Vitest and `@firebase/rules-unit-testing`, executing directly against local Firebase Emulators (Auth, Firestore, Storage) with zero network dependencies.

---

## 2. Prerequisites

- **Node.js**: `v22.x` (or supported LTS version)
- **Java**: Java 17 or higher (required by the Firebase Emulator suite to run local Firestore and Storage emulators)
- **Firebase CLI**: `firebase-tools` (automatically invoked on demand via `npx firebase-tools@13.35.1` by the test runner)

---

## 3. Emulator Ports & Network Topology

The local emulator test runner binds to the following standard loopback ports:

| Emulator | Port | Loopback Endpoint | Purpose |
| :--- | :---: | :--- | :--- |
| **Firestore** | `8080` | `127.0.0.1:8080` | Document security rules enforcement |
| **Auth** | `9099` | `127.0.0.1:9099` | JWT token decoding and custom claims |
| **Storage** | `9199` | `127.0.0.1:9199` | Blob upload, size, and MIME validation |

---

## 4. Running Security Rules Tests

### Run All Security Rules Tests (Firestore + Storage)
Starts Auth, Firestore, and Storage emulators, runs both test suites, and cleans up processes automatically:

```bash
npm run test:security
```

### Run Storage Rules Tests Only
Runs only the comprehensive Storage security rules suite:

```bash
npm run test:storage-rules
```

### Run Tests Manually Against Pre-running Emulators
If you already have emulators running via `npm run emulators:start`:

```bash
npx vitest run --config vitest.rules.config.js
```

Or run an individual test file:

```bash
npx vitest run --config vitest.rules.config.js tests/rules/storage.rules.test.js
npx vitest run --config vitest.rules.config.js tests/rules/firestore.rules.test.js
```

---

## 5. Security Rules Test Scenarios & Multi-Principal Matrix

The test suites verify authorization boundaries across 5 distinct principals:
1. **Unauthenticated (`anon`)**: Denied access to private collections and all write operations.
2. **Citizen Owner (`citizen-alice`)**: Allowed to submit complaints, manage owned drafts, upload evidence, and submit timely appeals.
3. **Citizen Non-Owner (`citizen-bob`)**: Denied modifying or deleting another citizen's complaints, evidence, or feedback.
4. **Municipal Department Officer (`officer-dan`)**: Enforces department-specific scope; denied admin operations and unauthorized profile modifications.
5. **Super Admin (`superadmin-eve` / `admin-carol`)**: Verified via custom claims (`request.auth.token.role == 'admin'` / `admin: true`) and Firestore fallback; permitted to perform status transitions, view all feedback, and execute deletions.

### Storage Byte Boundary Checks
- **Photos (`complaint-photos/`)**:
  - Maximum allowed size: $5\text{ MB} = 5 \times 1024 \times 1024 = 5,242,880\text{ bytes}$.
  - Tests verify valid images at boundary, and reject files at $5,242,881\text{ bytes}$ ($5\text{ MB} + 1\text{ byte}$).
  - Enforces MIME types `image/jpeg` and `image/png`.
- **Voice Notes (`complaint-audio/`)**:
  - Maximum allowed size: $10\text{ MB} = 10 \times 1024 \times 1024 = 10,485,760\text{ bytes}$.
  - Tests verify audio files up to $10\text{ MB}$, and reject files exceeding $10\text{ MB}$.
  - Enforces MIME types `audio/webm`, `audio/mp4`, `audio/ogg`, etc.

---

## 6. Cross-Platform Emulator Runner Architecture

The test runner script (`scripts/run-emulator-tests.mjs`) is written in native Node.js and avoids shell-specific commands:
- **Port Checking**: Checks ports 8080, 9099, and 9199 using `node:net.createConnection`. Exits with an actionable diagnostic if any port is already in use.
- **Process Spawning**: Uses `node:child_process.spawn` to start emulators with `singleProjectMode`.
- **Health Checks**: Bounded polling loops query the emulator endpoints until ready (60-second timeout).
- **Process Cleanup**:
  - On Windows, executes `taskkill /pid <pid> /T /F` to terminate the entire process tree (preventing orphaned Java emulator processes).
  - On Linux/macOS, spawns a detached process group and terminates the group via `process.kill(-pid, 'SIGKILL')`.
  - Signal listeners catch `SIGINT` (Ctrl+C) and `SIGTERM` to guarantee clean process release.

---

## 7. Troubleshooting Common Issues

### Port Already Occupied
- **Symptom**: `[Runner] Error: One or more required emulator ports are already in use: Port 8080 (Firestore)`
- **Solution**: Check for existing running emulator processes. On Windows PowerShell:
  ```powershell
  Get-Process -Name java -ErrorAction SilentlyContinue | Stop-Process -Force
  ```
  On Linux/macOS:
  ```bash
  killall java
  ```

### Missing Java Environment
- **Symptom**: `[Runner] Error: Java is required for Firebase Emulators but was not found in PATH.`
- **Solution**: Install OpenJDK / Temurin JDK 17 or 21 and ensure `java` is in your system's PATH.

---

## 8. CI Pipeline Integration

GitHub Actions executes the security rules suite automatically in `.github/workflows/ci.yml`:
- Job Name: `security-rules` (Firebase Security Rules Matrix)
- Triggers: Pushes and Pull Requests targeting `main`.
- Environment: Ubuntu Latest, Node.js 22, Temurin JDK 21.
- Caching: Caches npm dependencies and Firebase emulator binaries at `~/.cache/firebase/emulators`.
- Execution: Runs `npm run test:security`.
