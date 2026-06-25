# 🎓 MathsWithSD — Backend API Service

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D%2018.0.0-blue.svg)](https://nodejs.org/)
[![Express Version](https://img.shields.io/badge/express-v5.2.1-green.svg)](https://expressjs.com/)
[![MongoDB Mongoose](https://img.shields.io/badge/mongoose-v9.6.1-red.svg)](https://mongoosejs.com/)
[![Security Hardened](https://img.shields.io/badge/security-hardened-orange.svg)](#security-features)

This is the high-performance core backend API for **MathsWithSD**, a comprehensive dual-application ecosystem designed to revolutionize how students prepare for mathematics exams and how teachers manage evaluations. The backend provides secure API services, JWT authentication, cohort management, a distributed worker pipeline for image processing, and an advanced Mathpix OCR integration for mathematical formula ingestion.

---

## 🚀 Key Features

*   **Secure 3-Tier Authentication**: Standard JWT-based registration and logins for students with role-based access control (RBAC), and an automated passwordless authentication override for authorized teachers.
*   **Mathpix AI OCR Ingestion Pipeline**: Ingestion endpoint capable of accepting physical camera scans of math questions, processing them, extracting math and text via Mathpix OCR, and returning parsed LaTeX equations.
*   **Distributed Background Workers**: Support for distributed jobs (heartbeats, queues, locking mechanisms) to process CPU-intensive image tasks safely and perform data-tier cleanups.
*   **MongoDB Performance Optimization**: Self-healing optimization routines that automatically compile indexes, normalize missing fields, and audit schemas.
*   **Real-time Capabilities**: Built-in support for WebSockets (`ws`) to synchronize exam timers and real-time leaderboards.
*   **Robust Security Hardening**: Protection against common web threats via helmet, mongo-sanitize, rate-limiting, XSS mitigation, and secure CORS validation.

---

## 🛠️ Technology Stack

*   **Core**: Node.js & Express (v5.2.1)
*   **Database**: MongoDB & Mongoose (v9.6.1)
*   **Caching & Queueing**: Redis (`ioredis` v5.11.0)
*   **Authentication**: JSON Web Tokens (`jsonwebtoken` v9.0.3) & bcrypt hashing
*   **Image Processing**: Sharp (v0.34.5) & Cloudinary API (v2.10.0)
*   **WebSockets**: ws (v8.21.0)

---

## 📁 Repository Structure

```
math-app-backend/
├── public/                 # Static assets and public-facing files
├── src/
│   ├── config/             # Database connection setups (direct vs. SRV fallback) & server configs
│   ├── controllers/        # Express route handlers (auth, ocr, exams, student progress, etc.)
│   ├── middleware/         # Auth verification, role gates, safety/validation filters, rate-limiters
│   ├── migrations/         # Migration files for schema changes and data upgrades
│   ├── models/             # Mongoose schemas (Student, Exam, Attempt, ocrarchives, etc.)
│   ├── routes/             # API v1 routes mapping definitions
│   ├── scripts/            # Database indexing, optimizations, and seeding tools
│   ├── services/           # Core business logic (OCR pipelines, grading, user auto-provisioning)
│   ├── utils/              # Helper modules, network IP detection, custom error boundaries
│   ├── workers/            # Distributed worker processes and watchdog reaper logic
│   └── server.js           # Server startup script
├── test/                   # Comprehensive backend automated test suite
├── .env.example            # Sample environment variables file
├── package.json            # Scripts, project details, and dependencies configuration
└── README.md               # Backend documentation
```

---

## ⚙️ Setup & Installation

### Prerequisites

Ensure you have the following installed on your machine:
*   **Node.js** (v18 or higher)
*   **npm** (v9 or higher)
*   **MongoDB** (running locally or a MongoDB Atlas URI)
*   **Redis** (optional, required if using distributed caching/queue features)

### Installation Steps

1.  **Clone & Navigate**:
    ```bash
    cd math-app-backend
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Configure Environment Variables**:
    Copy the sample configuration file to create your local `.env`:
    ```bash
    cp .env.example .env
    ```
    Open `.env` and fill in your details:
    ```env
    PORT=5000
    MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/?appName=Cluster0
    MONGODB_URI_DIRECT=mongodb://<username>:<password>@host1:27017,host2:27017/?replicaSet=atlas-shard
    MONGODB_DB_NAME=MathswithSD_DB
    JWT_SECRET=your_super_secret_jwt_key
    GEMINI_API_KEY=your_gemini_api_key
    MATHPIX_APP_ID=your_mathpix_app_id
    MATHPIX_APP_KEY=your_mathpix_app_key
    CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@cloud_name
    ```

4.  **Initialize & Optimize Database**:
    Run the optimization script to auto-generate recommended indexes and normalize schema constraints:
    ```bash
    npm run optimize:db
    ```

5.  **Seed Teacher Admin Account**:
    Create the default authorized teacher profile in the database:
    ```bash
    npm run seed:teacher
    ```

6.  **Start the Server**:
    *   **Development mode (hot reload)**:
        ```bash
        npm run dev
        ```
    *   **Production mode**:
        ```bash
        npm start
        ```
    The server will boot up and start listening on port `5000` (or your configured `PORT`).

---

## 🛡️ Security Features

The backend incorporates standard security protocols to protect educational data:
*   **Three-Tier Authorization Pipeline**:
    1.  **Token Validation Layer** (`authMiddleware.js`): Checks token format, expiration, and extracts claims.
    2.  **Role Authorization Gate** (`roleMiddleware.js`): Enforces granular access levels (Student vs. Teacher/Admin).
    3.  **Ownership / Service Layer Validation**: Prevents student privilege escalation and restricts students from accessing other users' test submissions.
*   **Input Sanitization**: Strict filtering of NoSQL query strings (`express-mongo-sanitize`) and XSS prevention (`xss-clean`).
*   **Header Hardening**: Utilizes `helmet` to apply secure HTTP headers and control cache directives.
*   **Rate Limiting**: Throttles rapid API requests (`express-rate-limit`) to mitigate denial-of-service attempts.

---

## 📡 API Reference Index

Here is a summary of the core endpoints exposed by the service:

| Method | Endpoint | Description | Auth Scope |
| :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/student/signup` | Registers a new student account | Public |
| **POST** | `/api/v1/student/login` | Authenticates a student & returns JWT | Public |
| **POST** | `/api/v1/student/teacher-login` | Passwordless login check for hardcoded teacher | Public |
| **GET** | `/api/v1/student/me` | Fetches active student profile information | Student |
| **GET** | `/api/v1/tests` | Lists student's available/assigned exams | Student |
| **POST** | `/api/v1/testResponse/start` | Initiates an exam attempt (starts timer) | Student |
| **POST** | `/api/v1/testResponse/submit` | Submits answers and locks exam attempt | Student |
| **GET** | `/api/v1/testResponse/:attemptId`| Retrives details of a specific assessment attempt | Student (Own only) |
| **GET** | `/api/v1/announcements` | Fetches announcements for a student's class | Student |
| **POST** | `/api/v1/scan` | Submits image to Mathpix AI OCR for LaTeX parser | Teacher / Admin |

---

## 👥 Credits

*   **Created by**: [Kalpajit](https://github.com)
*   **Inspired by**: [Debosmit](https://github.com), [Rupam](https://github.com)
*   **Special Thanks**: Soumen Sir, Swagata

---

## 📄 License

This repository is licensed under the [ISC License](LICENSE).
