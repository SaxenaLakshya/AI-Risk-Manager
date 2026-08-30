# Risk/OS

**The operating system for merchant return-risk decisions.**

Built for the RazorPay Buildathon — **Track 02: AI Risk Manager**.

> Stop the merchant losing money to fraud, returns and chargebacks. Build a working detector, verifier, or auto-responder for one class of loss, with measured precision and recall on a held-out test set.

Risk/OS is a **return-risk scorer**: every order is scored on arrival, confident calls clear instantly, and anything ambiguous — by the model's own uncertainty, or by a customer's history — gets a second opinion from an LLM before it reaches a human. The vendor always makes the final call.

---

## Why this approach

Most return/fraud scorers stop at "here's a number." Risk/OS is built around a simple observation: **a classifier that only sees the current order is blind to the customer's pattern.** A wardrobing repeat-offender's 6th return can look perfectly clean in isolation — full evidence, intact packaging — while their 90% lifetime return rate tells the real story. So the system doesn't just threshold a confidence score; it checks history *before* deciding whether a case needs a second look, and escalates even confident predictions when a customer's track record says otherwise.

---

## Architecture

```
Order submitted
      │
      ▼
┌─────────────────┐
│  1. Model        │  XGBoost + AdaBoost ensemble → risk class + confidence
└─────────────────┘
      │
      ▼
┌─────────────────┐
│  2. History check │  Return rate + prior abuse flags, pulled regardless
└─────────────────┘     of model confidence
      │
      ▼
  Confident AND clean history?
      │                    │
     Yes                   No
      │                    │
      ▼                    ▼
┌──────────────┐   ┌─────────────────────┐
│ Rule-based    │   │  3. SLM review       │  Groq (openai/gpt-oss-20b) reasons
│ summary       │   │  over full context    │  over order + retrieved history,
│ (free, instant)│  └─────────────────────┘  returns rationale + recommendation
└──────────────┘            │
      │                     ▼
      │            Uncertain / escalated → queued for a vendor
      │                     │
      ▼                     ▼
┌─────────────────────────────────┐
│  4. Vendor decision              │  Human approves/rejects + assigns
│                                   │  the verified label
└─────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  5. Feedback loop                 │  Decision + model's original call
│                                   │  written back to history — the next
│                                   │  lookup for this customer sees it
└─────────────────────────────────┘
```

**Defense-only by design:** the system flags, scores, and recommends. It never auto-blocks or auto-approves a return without a human-reviewable path, and it doesn't expose model thresholds or weights that could help someone game the scorer.

---

## What's in the box

| Layer | What it does |
|---|---|
| **Classical model** | XGBoost + AdaBoost soft-voting ensemble, trained on order/customer features, classifies into `Legitimate`, `Policy Abuser`, `Fraudulent Return`, `Wardrobing` |
| **History override** | Even a confident prediction gets escalated to the SLM if the customer's lifetime return rate exceeds a threshold or they have prior flagged returns |
| **SLM review** | Groq-hosted `openai/gpt-oss-20b` reasons over the order plus the customer's retrieved order/return history, returning a rationale, a recommended action, and a key risk factor |
| **Vendor dashboard** | Password-gated queue showing every case that needs a human decision, with the full evidence trail (model probabilities, SLM reasoning, customer history) |
| **Public submission form** | Anyone can file a return request; confident cases resolve instantly, uncertain ones are queued for vendor review |
| **Feedback loop** | Every vendor decision — plus what the model/SLM said at the time — is written back to the historical database, closing the loop for future scoring |
| **Sync metrics** | Live comparison of the model/SLM's call against what the vendor actually decided, surfaced as a confusion matrix on the performance page |

---

## Tech stack

**Backend:** Python, FastAPI, XGBoost, AdaBoost (scikit-learn), pandas, SQLAlchemy, Groq API
**Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, react-hook-form
**Database:** Supabase (Postgres)
**LLM:** Groq — `openai/gpt-oss-20b`

---

## Project structure

```
.
├── app.py                    # FastAPI backend — scoring, vendor decisions, metrics
├── get_history.py            # Customer history retrieval from Postgres
├── slm_review.py             # Groq SLM prompt + review logic
├── confident_summary.py      # Free rule-based summaries for confident cases
├── requirements.txt
├── artifacts/                # Trained model files
│   ├── preprocessor.pkl
│   ├── xgb_model.json
│   ├── ada_model.pkl
│   └── label_map.pkl
├── data/                     # Synthetic + Kaggle-derived historical data
│   ├── customers.csv
│   ├── orders.csv
│   └── returns.csv
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx              # Home — pipeline overview
        │   ├── queue/page.tsx        # Vendor review queue
        │   ├── performance/page.tsx  # Model metrics + vendor sync
        │   ├── login/page.tsx        # Vendor password gate
        │   └── submit-request/page.tsx  # Public return-request form
        ├── components/Nav.tsx
        └── lib/
            ├── api.ts        # Backend API client
            └── auth.ts       # Lightweight vendor session gate
```

---

## Setup

### Backend

```bash
pip install -r requirements.txt
```

Create a `.env` file:

```
DB_USER=postgres.xxxxxxxxxxxx
DB_PASSWORD=your_supabase_password
DB_HOST=aws-0-<region>.pooler.supabase.com
DB_PORT=6543
DB_NAME=postgres
GROQ_API_KEY=your_groq_key
```

Set up Supabase tables (`customers`, `orders`, `returns`, `pending_requests`) — schema in `data/schema.sql`.

```bash
uvicorn app:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
```

Create `.env.local`:

```
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_VENDOR_PASSWORD=your_chosen_password
```

```bash
npm run dev
```

---

## Model performance

Held-out test set, 12,000 orders:

| Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Legitimate | 0.99 | 1.00 | 1.00 | 8,412 |
| Policy Abuser | 0.99 | 0.95 | 0.97 | 1,439 |
| Fraudulent Return | 0.99 | 0.97 | 0.98 | 1,222 |
| Wardrobing | 0.94 | 0.97 | 0.95 | 927 |

**Macro avg:** precision 0.98, recall 0.97, F1 0.97 · **Accuracy:** 0.99

Wardrobing has the smallest support and lowest precision of the four classes — the class most worth watching as the system sees more real-world data.

> **Known gap:** the confusion matrix and cost-weighted false-positive analysis are scaffolded on the performance page but not yet populated with final numbers — see `compute_confusion_matrix.py` to generate them. This is the most important piece left to finish against the track's "honest metrics including false-positive cost" bar.

---

## API endpoints

| Endpoint | Purpose |
|---|---|
| `POST /score-order` | Score an order, no persistence |
| `POST /submit-order` | Score an order; queues it if uncertain |
| `GET /pending-requests` | Fetch the vendor review queue |
| `POST /vendor-decision` | Record a vendor's approve/reject decision |
| `GET /sync-metrics` | Model-vs-vendor agreement, for the performance page |
| `GET /health` | Health check |

---

## What we'd build next

- Persist a `pending_requests` retention policy and audit trail
- Real backend-checked vendor authentication (current gate is demo-grade)
- RAG-style retrieval of similar past cases (not just this customer's history) to ground the SLM further
- A/B comparison of model-alone vs. model+SLM precision/recall on live traffic, not just held-out test data
