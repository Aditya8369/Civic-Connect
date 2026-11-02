# System Architecture & Data Model

This manual covers the complete architectural design, client-to-cloud trust boundaries, failure paths, and Cloud Firestore database schema for Civic-Connect.

---

## 1. System Architecture

Civic-Connect is architected as a pure client-side Single-Page Application (SPA) interfacing directly with Google Cloud's Firebase platform without an intermediate application server.

```mermaid
flowchart TB
    subgraph Browser ["Client Web Browser"]
        ReactApp["React 19 SPA (Vite 8 Bundled)"]
        Contexts["State Contexts (AuthContext, ThemeContext)"]
        Router["React Router DOM v6 (AppRoutes)"]
        UIComponents["UI Layer (Tailwind v4, Radix UI, Framer Motion)"]
    end

    subgraph FirebaseServices ["Firebase Cloud BaaS"]
        FirebaseAuth["Firebase Authentication (Identity Provider)"]
        Firestore["Cloud Firestore (Real-Time NoSQL Document DB)"]
        FirebaseStorage["Firebase Cloud Storage (Object Store - Initialized)"]
    end

    ReactApp --> Contexts
    ReactApp --> Router
    Router --> UIComponents
    
    Contexts <-->|Tokens & User State| FirebaseAuth
    UIComponents <-->|Reads & onSnapshot Subscriptions| Firestore
    UIComponents -.->|Unused Object Storage| FirebaseStorage
```

### Component Hierarchy & Providers
1. **Entry Point (`main.jsx`):** Renders the root `<App />` component into the DOM.
2. **Context Providers (`App.jsx`):**
   - `ThemeProvider`: Toggles dark/light mode and synchronizes with browser `localStorage`.
   - `AuthProvider`: Listens to `onAuthStateChanged`, caches user roles from Firestore `users/{uid}`, and provides `login()`, `register()`, and `logout()`.
3. **Route Protection (`ProtectedRoute.jsx`):** Intercepts unauthorized route navigation by validating `user.role === requiredRole`.

---

## 2. Trust Boundaries & Security Architecture

Civic-Connect operates across a **Zero-Trust Client Boundary**:

```mermaid
flowchart LR
    subgraph UntrustedZone ["Untrusted Execution (Client Browser)"]
        BrowserUI["Civic-Connect React UI"]
        MemoryState["In-Memory State & LocalStorage"]
    end

    subgraph Boundary ["Network Boundary (TLS / HTTPS)"]
        FirebaseWire["Firebase WebChannel Protocol"]
    end

    subgraph TrustedZone ["Google Cloud Firebase Platform"]
        AuthCore["Firebase Authentication"]
        RuleEngine["Firestore Security Rules Engine"]
        DatabaseEngine["Cloud Firestore DB Engine"]
    end

    BrowserUI -->|Arbitrary Mutation Requests| FirebaseWire
    FirebaseWire --> AuthCore
    FirebaseWire --> RuleEngine
    RuleEngine -->|Authorized Mutations Only| DatabaseEngine
```

> [!CAUTION]
> **Fundamental Security Principle:**
> React route guards (`<ProtectedRoute requiredRole="admin">`) govern only what the browser displays. **They provide zero database authorization.** In the absence of server-side `firestore.rules`, malicious users can directly call Firestore APIs to modify any document.

---

## 3. Complaint Submission Pipeline & Failure Paths

The submission of a new complaint involves three distinct sequential calls:

```mermaid
sequenceDiagram
    autonumber
    actor Citizen as Citizen
    participant RP as ReportPage.jsx
    participant Gen as complaintId.js
    participant FS as Cloud Firestore
    participant Notif as notifications.js

    Citizen->>RP: Clicks "Submit Complaint"
    RP->>RP: Validates category, title, description, address
    alt Validation Fails
        RP-->>Citizen: toast.error("Please fill in all required fields")
    else Validation Passes
        RP->>Gen: generateComplaintId()
        Gen->>FS: runTransaction: read & increment counters/issueCounter
        alt Counter Transaction Fails
            FS-->>Gen: Abort Transaction
            RP-->>Citizen: toast.error("Failed to submit complaint")
        else Counter Transaction Succeeds
            Gen-->>RP: Returns "CMP-2026-XXXX"
            RP->>FS: addDoc("issues", { complaintId, title, ... })
            alt Issue Insertion Fails
                FS-->>RP: Permission / Network Error
                RP-->>Citizen: toast.error("Failed to submit complaint")
                Note over Gen,FS: Counter incremented, leaving sequence gap!
            else Issue Insertion Succeeds
                RP->>Notif: createNotification({ recipientRole: 'admin', ... })
                alt Notification Insertion Fails
                    FS-->>Notif: Write Error
                    Notif-->>RP: Exception thrown
                    RP-->>Citizen: toast.error("Failed to submit complaint")
                    Note over RP,FS: CRITICAL: Issue exists in DB, but citizen sees failure!
                else Notification Insertion Succeeds
                    RP-->>Citizen: toast.success("Complaint submitted successfully!")
                    RP->>Citizen: navigate('/my-reports')
                end
            end
        end
    end
```

---

## 4. Cloud Firestore Data Schema

```mermaid
erDiagram
    USERS ||--o{ ISSUES : "reports (reportedBy)"
    USERS ||--o{ NOTIFICATIONS : "receives (recipientUid)"
    ISSUES ||--o{ NOTIFICATIONS : "triggers (issueId)"
    COUNTERS ||--|| ISSUES : "sequences"

    USERS {
        string uid PK "Firebase Auth UID"
        string name "User full name"
        string email "User email address"
        string role "'citizen' | 'admin'"
        timestamp createdAt "Registration timestamp"
    }

    ISSUES {
        string id PK "20-char Firestore Document ID"
        string complaintId "Sequential ticket ID (CMP-YYYY-XXXX)"
        string title "Complaint summary"
        string description "Detailed problem text"
        string category "One of 8 civic categories"
        string address "Street address or landmark"
        number latitude "GPS latitude (optional)"
        number longitude "GPS longitude (optional)"
        string status "'Pending' | 'In Progress' | 'Resolved'"
        string department "Assigned municipal department"
        string reportedBy FK "UID of complainant (users/{uid})"
        string resolutionNotes "Administrative closure remarks"
        map assignedWorker "Worker details: { name, phone, assignedAt }"
        timestamp createdAt "Creation timestamp"
        timestamp updatedAt "Last update timestamp"
    }

    NOTIFICATIONS {
        string id PK "Auto-generated document ID"
        string recipientUid FK "Citizen UID (null for admin)"
        string recipientRole "'admin' | 'citizen'"
        string senderUid FK "Sender UID or empty string"
        string issueId "Complaint ticket ID"
        string type "'new_complaint' | 'status_update'"
        string title "Alert header"
        string message "Alert explanation"
        boolean read "Unread status indicator"
        timestamp createdAt "Creation timestamp"
    }

    COUNTERS {
        string id PK "Document: counters/issueCounter"
        number lastNumber "Highest assigned sequential integer"
    }
```

### Collection Specifications

#### 1. `users` (`users/{uid}`)
- Document ID matches the Firebase Auth `user.uid`.
- Fields: `name` (string), `email` (string), `role` (`'citizen'` or `'admin'`), `createdAt` (timestamp).
- *Vulnerability Note:* Roles are currently assigned directly by the client during signup.

#### 2. `issues` (`issues/{documentId}`)
- Stores all civic complaints.
- Fields: `complaintId` (`CMP-YYYY-XXXX`), `title`, `description`, `category`, `address`, `latitude`, `longitude`, `status`, `department`, `reportedBy`, `resolutionNotes`, `assignedWorker`, `createdAt`, `updatedAt`.
- Index Requirements: Composite index on `reportedBy` (Ascending) + `createdAt` (Descending).

#### 3. `notifications` (`notifications/{id}`)
- Dispatches alerts to citizens and municipal staff.
- Fields: `recipientUid`, `recipientRole`, `senderUid`, `issueId`, `type`, `title`, `message`, `read`, `createdAt`.
- Index Requirements: Composite index on `recipientRole` (Ascending) + `read` (Ascending).

#### 4. `counters` (`counters/issueCounter`)
- Atomic ticket counter.
- Field: `lastNumber` (monotonically increasing integer).

---

## 5. Architectural Decision Records (ADRs)

### ADR-0001: Client-Direct BaaS with Firebase (Accepted)
- **Context:** Rapid development of a real-time civic portal without backend infrastructure maintenance.
- **Decision:** Use Firebase Auth and Cloud Firestore directly from the browser.
- **Consequences:** Low hosting overhead, instantaneous real-time UI updates, but requires rigorous Firestore Security Rules to prevent client tampering.

### ADR-0002: Serverless Cloud Functions for Atomic Ingestion (Proposed)
- **Context:** Multi-step client writes risk sequence gaps and duplicate tickets upon network dropouts.
- **Decision:** Migrate complaint creation and role assignments to Firebase Cloud Functions (2nd Gen) with atomic transactions and Custom Auth Claims.
