# Menu Matrix — Restaurant Menu Engineering & Price Elasticity Lab

An internal restaurant-ops analytics tool that applies classic **menu
engineering** (the Stars / Plowhorses / Puzzles / Dogs matrix), **market
basket analysis** for combo and upsell design, and **price elasticity /
what-if pricing** to a real point-of-sale transaction log.

Built as one of a set of portfolio projects targeting Restaurant Analytics
roles. It's designed to read like a tool an ops or analytics team would
actually use to decide what to promote, re-price, re-engineer, or cut — not a
tutorial demo.

> **Screenshots:** add exported PNGs to `docs/screenshots/` and reference them
> here (e.g. `![Menu matrix](docs/screenshots/matrix.png)`). Not included in
> this environment.

---

## Data Sources & Methodology

This is the hardest domain to find genuinely public, transaction-level POS
data for — most restaurant datasets are either synthetic tutorials or sit
behind a login/API key. Below is a full, honest accounting of what in this
project is **real** and what is **modeled**, and why.

### REAL — direct from a real bakery-cafe's POS log

The transactional backbone of this project is **["The Bread Basket" bakery
transaction log](https://raw.githubusercontent.com/prasertcbs/basic-dataset/master/bread%20basket.csv)**
(also mirrored from Kaggle: [`mittalvasu95/the-bread-basket`](https://www.kaggle.com/datasets/mittalvasu95/the-bread-basket)),
a genuine point-of-sale export from a real bakery-café in Edinburgh, UK,
covering **30 Oct 2016 – 9 Apr 2017**. It contains **9,464 real transactions**
made up of item-level line entries — no synthetic generator, no API key, no
login wall.

Everything downstream of raw transaction counting is **real, unmodified data**:

- **Popularity / units sold** — the exact count of how many times each item
  appears across real baskets.
- **Menu-mix %** — each item's real share of total units sold.
- **Basket co-occurrence** — which items were actually bought together in the
  same real transaction, used directly as input to the market-basket model.
- **Every association rule, attach rate, lift, and combo recommendation**
  surfaced in the app is mined (via FP-Growth) from these real baskets. These
  are not invented — e.g. the strongest real rule in the data is
  *Coke → Sandwich* (lift ≈ 3.7), discovered from actual co-purchases.

### MODELED — an explicit, documented operational layer

The raw POS log is a **transaction-item log only** — it contains no prices,
costs, or margins. To run classic menu engineering (which requires a
profitability axis) an operational layer had to be attached. This is standard,
defensible practice when granular POS data is public but pricing is not —
**but it is modeled, and it is labeled as such everywhere it appears in the
app** (menu cards, the methodology panel, and the API's `/api/metadata`
endpoint).

| Field | What it is | Why this approach |
|---|---|---|
| **Price** | Real-world-plausible published GBP cafe/bakery menu prices, assigned per item (e.g. Coffee £2.45, Sandwich £4.50, Spanish Brunch £8.50). | Calibrated to typical UK independent café pricing for each item type — not arbitrary. |
| **Food cost %** | Category-level benchmarks from published foodservice references: beverages ~15–25%, bakery ~30–35%, savoury/prepared meals ~30–38%, retail/grocery items ~25–45%. | These are the industry-standard ranges cited in restaurant cost-accounting literature; applying them by category (rather than one flat number) keeps contribution margin defensible per item type. |
| **Contribution margin** | `price − (price × food_cost_pct)`, computed per item. | Direct, standard menu-engineering definition — this part is pure arithmetic on the two modeled inputs above. |
| **Price elasticity** | Category-level coefficients (e.g. hot drinks −0.5 "inelastic/habitual" → retail/grocery −1.3 "elastic/substitutable"), drawn from the published range typically cited for restaurant demand elasticity. | The dataset has **one observed price per item** (because price itself is modeled, not observed with real variation), so elasticity **cannot be statistically regressed** from this data — there's no price variance to regress against. Rather than fabricate a false regression, the app uses explicit, sourced category assumptions and **says so directly in the UI**. |

**Bottom line:** popularity and every basket/combo insight in this app stand
entirely on real sales data from a real bakery. Margin and price-elasticity
projections layer clearly-documented, industry-benchmarked assumptions on top,
because the source data has no cost or pricing fields to draw from. Nothing
modeled is presented as observed.

### Processed dataset

The repo ships a small processed dataset (~1–2 MB) rather than re-fetching or
committing the raw file:

- `backend/data/menu_items.csv` — 46 priced menu items with real
  popularity/units-sold metrics plus the modeled price/cost/elasticity layer.
- `backend/data/transactions.csv` — 9,361 real baskets × priced items, used
  for market-basket mining.
- `backend/data/metadata.json` — machine-readable provenance (source URL,
  period, real vs. modeled field list) — also served at `/api/metadata`.

Regenerate from the live source at any time:

```bash
cd backend/etl
python build_dataset.py
```

---

## Architecture

```
menu-engineering-lab/
├── backend/                  FastAPI service (Python)
│   ├── app/
│   │   ├── main.py           API routes
│   │   ├── analytics.py      menu-engineering classification, what-if pricing
│   │   ├── basket.py         FP-Growth market-basket mining (mlxtend)
│   │   └── data.py           processed-dataset loader
│   ├── etl/
│   │   └── build_dataset.py  fetches real POS log, attaches modeled layer
│   ├── data/                 processed CSV/JSON the API reads (committed)
│   └── requirements.txt
└── frontend/                 React + TypeScript + Vite
    └── src/
        ├── App.tsx            page shell, KPI strip, methodology panel
        ├── api.ts             typed API client
        └── components/
            ├── QuadrantChart.tsx    Stars/Plowhorses/Puzzles/Dogs scatter
            ├── MenuBoard.tsx        menu-board card grid
            ├── ComboPanel.tsx       attachment/combo recommendations
            └── WhatIfSimulator.tsx  live price slider + margin projection
```

**Backend — analytical methods**

1. **Menu engineering classification** (`analytics.classify`) — Kasavana &
   Smith (1982) quadrants. Popularity threshold uses the classic "70% of an
   equal fair-share" rule (`(1/n_items) × 0.70`); profitability threshold is
   the menu's average contribution margin. Each item lands in Star /
   Plowhorse / Puzzle / Dog based on which side of both thresholds it falls
   on. A median-split rule is also available via `?popularity_rule=median`.
2. **Market basket analysis** (`basket.py`) — FP-Growth frequent itemset
   mining (via `mlxtend`) over one-hot-encoded real baskets, followed by
   association-rule generation (support/confidence/lift), filtered to
   single-item consequents for clean "if buys X, attach Y" recommendations.
3. **Price elasticity & what-if** (`analytics.whatif`, `analytics.optimal_price`) —
   constant-elasticity demand projection:
   `new_qty = base_qty × (new_price / base_price) ^ elasticity`. Unit food
   cost is held constant (a pricing change, not a recipe change), so new
   margin = `(new_price − unit_cost) × new_qty`. A price sweep additionally
   reports the margin-maximizing price in the tested band, and — for elastic
   items (`elasticity < -1`) — the closed-form interior optimum
   `p* = unit_cost × e / (e + 1)`.

**Frontend — visual identity**

Warm, parchment/menu-board palette (not the blue/grey of a finance dashboard):
card-grid-heavy menu board, an interactive quadrant scatter (hover a legend
pill to isolate a class, click a card or point to spotlight an item across
both views), a combo/attachment panel, and a live what-if slider with an
embedded margin curve. Categorical colors for the four quadrants were run
through a CVD-safety / contrast validator for both light and dark mode.

---

## Setup & run

### Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# processed data is already committed under backend/data/ — to regenerate:
# cd etl && python build_dataset.py && cd ..

uvicorn app.main:app --reload --port 8000
```

API docs: `http://localhost:8000/docs`
Health check: `http://localhost:8000/api/health`

### Frontend (React + TypeScript + Vite)

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

By default the frontend calls `http://localhost:8000`. Override with a
`.env` file in `frontend/`:

```
VITE_API_URL=http://localhost:8000
```

Production build:

```bash
npm run build         # outputs to frontend/dist
```

---

## API reference

| Endpoint | Description |
|---|---|
| `GET /api/health` | Liveness check |
| `GET /api/metadata` | Dataset provenance — real vs. modeled fields |
| `GET /api/summary` | Portfolio-level KPIs and quadrant counts |
| `GET /api/menu?popularity_rule=classic\|median` | Full menu with classification & thresholds |
| `GET /api/quadrant-meta` | Labels/descriptions/recommended actions per quadrant |
| `GET /api/basket/recommendations` | FP-Growth attachment recommendations |
| `GET /api/basket/pairs` | Highest-lift two-item combos |
| `POST /api/whatif` | `{item_id, new_price}` → projected volume/revenue/margin impact |
| `GET /api/whatif/{item_id}/curve` | Margin-vs-price sweep + optimal price |

---

## Limitations & TODOs

- **Elasticity is an assumption, not an estimate.** The source data has no
  price variation to regress against; category coefficients are a documented
  placeholder for a real historical-price-change dataset, which most
  restaurants don't publish.
- **Price/cost layer is illustrative**, calibrated to plausible UK café
  pricing rather than this specific bakery's actual menu board.
- Basket analysis quality is bounded by the real dataset's scope — one
  bakery-café, ~6 months, no customer/loyalty ID, no day-part/weather
  covariates beyond what's in the raw log.
- No persistence/auth layer — this is a read-only analytics service over a
  static processed dataset, not a live POS integration.
- Screenshots are not included in this environment; see the placeholder note
  at the top of this file.
