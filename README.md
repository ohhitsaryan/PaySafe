# PaySafe

PaySafe is an AI-powered consumer security system containing a **FastAPI backend** and a **React + Tailwind CSS Chrome Extension (MV3)** that automatically detects e-commerce fraud, intercepts deceptive recurring billing traps, and automates PayPal buyer disputes.

---

## Quick Start for Evaluation

### Option A: Run via Docker

1. **Clone the repository & configure environment variables:**
   ```bash
   cp .env.example backend/.env
   # Add your GEMINI_API_KEY and PayPal Sandbox credentials to backend/.env
   ```

2. **Launch the backend container:**
   ```bash
   docker compose up --build
   ```
   *The FastAPI server will be live and healthy at `http://localhost:8000/api/health`.*

---

### Option B: Run Locally with Python

```bash
cd backend
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

---

## Load the Chrome Extension (Manifest V3)

1. Open Google Chrome and navigate to `chrome://extensions`.
2. Toggle **Developer mode** in the top right corner.
3. Click **Load unpacked** and select the [`extension/dist`](./extension/dist) folder.
4. *(Optional developer build)*: If you want to rebuild the extension source:
   ```bash
   cd extension
   npm install
   npm run build
   ```

---

## Testing the Protection & Dispute Flow

1. Open [`tests/test_scam.html`](./tests/test_scam.html) in your browser.
2. The PaySafe content script automatically scans the page text.
3. The AI flags the deceptive 8px fine-print recurring subscription ($89.99/month disguised as a $99 MacBook).
4. PaySafe replaces the insecure checkout button with a **"Protected Checkout by PaySafe"** button linked to a PayPal Sandbox flow.
5. Click the PaySafe extension icon in the toolbar to inspect the real-time **Risk Score Gauge** and **AI Threat Breakdown**.

---

## Repository Structure

```
PaySafe/
├── .env.example             # Safe placeholder template for root
├── .dockerignore            # Excludes caches, venvs, and secrets from Docker builds
├── .gitignore               # Strict ignore rules for node_modules, .env, __pycache__
├── docker-compose.yml       # Production-ready Compose setup with health checks
│
├── backend/
│   ├── Dockerfile           # Optimized Python 3.12-slim build with curl
│   ├── .dockerignore        # Backend-specific build exclusions
│   ├── .env.example         # Template environment file
│   ├── main.py              # FastAPI app (/api/health, /api/analyze, /api/dispute)
│   ├── ai_service.py        # Gemini-powered checkout threat analysis
│   ├── paypal_service.py    # PayPal Sandbox Orders v2 & Disputes v1 integration
│   └── requirements.txt     # Python dependencies
│
├── extension/
│   ├── public/              # Manifest V3, background SW, and content script
│   │   ├── manifest.json
│   │   ├── background.js
│   │   ├── content_script.js
│   │   └── icons/           # Scaled icon assets (16x16, 48x48, 128x128)
│   ├── src/                 # React popup UI with circular SVG risk gauge
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── dist/                # Pre-built extension bundle ready to load in Chrome
│   ├── package.json
│   └── vite.config.js
│
└── tests/
    └── test_scam.html       # Isolated scam demonstration fixture
```

---

## API Specification

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service liveness health check probe |
| `POST` | `/api/analyze` | Scans page text for traps; returns risk score & secure PayPal link |
| `POST` | `/api/dispute` | Formulates AI evidence claim and submits PayPal Sandbox dispute |
