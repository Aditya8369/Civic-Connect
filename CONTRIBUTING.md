# 🤝 Contributing to Civic-Connect

Thank you for your interest in contributing to **Civic Connect**! We are excited to welcome open-source contributors participating in **Winter of Code Social (WOCS)**.

Please take a moment to review these guidelines to ensure a smooth and collaborative contribution process.

---

## 💻 Getting Started & Local Setup

Follow these steps to set up Civic-Connect on your local machine.

### Step 1: Fork the Repository

Click the **Fork** button at the top-right corner of the [Civic-Connect Repository](https://github.com/chhavikant03/Civic-Connect).

### Step 2: Clone Your Fork

Replace `YOUR-USERNAME` with your GitHub username.

```bash
git clone https://github.com/YOUR-USERNAME/Civic-Connect.git
cd Civic-Connect
```

### Step 3: Install Dependencies

Install the required project dependencies:

```bash
npm install
```

### Step 4: Configure Environment Variables

Create a `.env` file in the root directory of the project and add the following Firebase configuration:

```env
VITE_FIREBASE_API_KEY=your_sandbox_api_key
VITE_FIREBASE_AUTH_DOMAIN=civicconnect-dev.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=civicconnect-dev
VITE_FIREBASE_STORAGE_BUCKET=civicconnect-dev.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

**Where to find the credentials?**

Authorized development credentials are available in the pinned discussions under the repository's **GitHub Discussions** tab.

> ⚠️ Do not commit your `.env` file or private credentials to your fork or pull requests.

### Step 5: Start the Development Server

Run the following command:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser to access the application.

---

## 📌 Issue Claiming & Assignment

To maintain transparency and avoid duplicate efforts, please follow our issue assignment process:

1. **Browse Issues:** Explore the open issues under the repository's Issues tab.
2. **Express Interest:** Comment on the issue you wish to work on, explaining your interest.
3. **Wait for Assignment:** Do not begin implementation or submit a pull request until a Project Admin has officially assigned the issue to you.
4. **Stay Active:** If an assigned issue receives no progress update for 3 days, it may be reassigned to another contributor.

---

## 🌿 Contribution Workflow

Once an issue has been assigned to you, follow these steps:

### 1. Sync Your Main Branch

Make sure your local repository is up to date:

```bash
git checkout main
git pull origin main
```

### 2. Create a Feature Branch

Create a separate branch for your contribution.

For new features:

```bash
git checkout -b feature/issue-title
```

For bug fixes:

```bash
git checkout -b fix/issue-title
```

### 3. Develop & Test

- Implement the assigned changes.
- Follow the existing project structure and coding conventions.
- Test your changes locally.
- Ensure that your changes do not break existing functionality.

---

## 📝 Commit Message Conventions

We follow the **Conventional Commits** standard to maintain a clean and understandable commit history.

| Prefix | Description | Example |
|---|---|---|
| `feat:` | Introduces a new feature | `feat: add geo-location filter` |
| `fix:` | Fixes a bug | `fix: resolve auth redirect loop` |
| `docs:` | Updates documentation | `docs: update environment setup` |
| `refactor:` | Improves code without changing functionality | `refactor: simplify complaint filtering` |
| `style:` | Makes formatting or styling changes | `style: improve dashboard spacing` |

**Example commit:**

```bash
git add .
git commit -m "feat: implement real-time status update badge for complaints"
```

---

## 🔀 Pull Request (PR) Guidelines

Once your changes are complete and tested:

### 1. Push Your Feature Branch

Push your branch to your GitHub fork:

```bash
git push origin feature/issue-title
```

### 2. Open a Pull Request

Navigate to the original [Civic-Connect Repository](https://github.com/chhavikant03/Civic-Connect) and create a Pull Request targeting the `main` branch.

### 3. Complete the PR Description

Make sure your Pull Request includes:

- **Issue Reference:** Link the assigned issue (e.g., `Closes #12`).
- **Summary:** Provide a brief explanation of the changes made.
- **Testing:** Mention the tests performed and their results.
- **Screenshots:** Include screenshots wherever applicable to demonstrate UI changes.

### 4. Wait for Review

The Project Admin will review your Pull Request and may request changes before approving and merging it.

---

## 💬 Getting Support

Need help or have questions? We're happy to help!

- **Discord:** Join the Code Social Discord Server and ask questions in the dedicated Civic-Connect project forum under `#find-a-project`.
- **GitHub Discussions:** Use the repository's Discussions tab for questions, suggestions, and broader feature discussions.

---

## 🎉 Thank You for Contributing!

Every contribution, whether it's a bug fix, a new feature, documentation improvement, or UI enhancement, helps make Civic-Connect better.

We appreciate your time and effort in building a more transparent and connected civic ecosystem.

**Happy Coding! 🚀**

---

## Firebase Emulator Setup

Civic-Connect uses the Firebase Emulator Suite for local development and testing. This allows contributors to work with Authentication, Firestore, Cloud Functions, and Cloud Storage without accessing production Firebase services.

### Prerequisites

- Node.js 22
- Java Development Kit (JDK) 21
- npm

### 1. Install Dependencies

From the project root, run:

```bash
npm install
```

The postinstall script automatically creates a local `.env` file from `.env.example` if one does not already exist.

Ensure that `VITE_USE_EMULATORS=true` is set in your `.env` file.

### 2. Start Firebase Emulators

Open a terminal in the project root and run:

```bash
npm run emulators:start
```

The following services will be available:

| Service | Local URL |
|---|---|
| Emulator UI | http://127.0.0.1:4000 |
| Authentication | http://127.0.0.1:9099 |
| Firestore | http://127.0.0.1:8080 |
| Cloud Functions | http://127.0.0.1:5001 |
| Cloud Storage | http://127.0.0.1:9199 |

Keep this terminal running while using the emulators.

### 3. Seed Demo Data

Open a second terminal in the project root and run:

```bash
npm run emulators:seed
```

This command creates three demo Authentication accounts, ten municipal complaints, complaint timeline events, and notifications in the local emulators.

The seed script only permits demo Firebase project IDs and local emulator hosts.

### 4. Run the Application

Open another terminal and run:

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

### 5. Default Test Credentials

All demo accounts use the following password:

`CivicConnect123!`

| Role | Email |
|---|---|
| Admin | admin@civicconnect.dev |
| Department Officer | officer@civicconnect.dev |
| Citizen | citizen@civicconnect.dev |

These credentials are intended for local emulator testing only. Never use them in a production environment.

### 6. Stop the Emulators

Press `Ctrl + C` in the terminal running the Firebase Emulator Suite.

**Important:** Do not commit your local `.env` file, private credentials, or production service account keys.
