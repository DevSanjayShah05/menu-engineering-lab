import { useEffect, useState } from "react";
import "./theme.css";
import "./app.css";
import { api, gbp, pct } from "./api";
import type { MenuItem, Metadata, Pair, Recommendation, Summary } from "./api";
import { QuadrantChart } from "./components/QuadrantChart";
import { MenuBoard } from "./components/MenuBoard";
import { ComboPanel } from "./components/ComboPanel";
import { WhatIfSimulator } from "./components/WhatIfSimulator";

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(
    () => localStorage.getItem("mm-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  );
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mm-theme", theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

export default function App() {
  const [theme, toggle] = useTheme();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [m, s, md, r, p] = await Promise.all([
          api.menu(),
          api.summary(),
          api.metadata(),
          api.recommendations(12),
          api.pairs(10),
        ]);
        setMenu(m.items);
        setSummary(s);
        setMeta(md);
        setRecs(r.recommendations);
        setPairs(p.pairs);
        setOnline(true);
      } catch {
        setOnline(false);
      }
    })();
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <div className="brandmark">M</div>
        <div className="brandtitle">
          <h1>Menu Matrix</h1>
          <p>Restaurant Menu Engineering &amp; Price Elasticity Lab</p>
        </div>
        <div className="topbar-spacer" />
        <div className="provchip">
          <span className={`dot ${online === false ? "off" : ""}`} />
          {meta ? (
            <span><b>{meta.source_name.split("(")[0].trim()}</b> · {meta.total_baskets_raw.toLocaleString()} real baskets</span>
          ) : (
            <span>connecting…</span>
          )}
        </div>
        <button className="iconbtn" onClick={toggle} title="Toggle theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </div>

      {online === false && (
        <div className="offline-banner">
          <b>API not reachable.</b> Start the backend: <code>cd backend &amp;&amp; uvicorn app.main:app --port 8000</code>{" "}
          (or set <code>VITE_API_URL</code>). The dashboard renders live from the FastAPI service.
        </div>
      )}

      {summary && (
        <div className="kpis">
          <Kpi lab="Menu items" val={summary.total_items.toString()} sub={`${summary.categories} categories`} />
          <Kpi lab="Units sold" val={summary.total_units_sold.toLocaleString()} sub="real POS line items" />
          <Kpi lab="Revenue" val={gbp(summary.total_revenue, 0)} sub="modelled pricing" />
          <Kpi lab="Contribution" val={gbp(summary.total_contribution_margin, 0)} sub={`${pct(summary.avg_check_margin_pct, 0)} margin`} />
          <Kpi lab="Stars" val={summary.quadrant_counts.Star.toString()} sub="high pop · high margin" accent="--star" />
          <Kpi lab="Dogs" val={summary.quadrant_counts.Dog.toString()} sub="review or cut" accent="--dog" />
        </div>
      )}

      <div className="section-title">
        <h2>Menu-engineering matrix</h2>
        <span>Kasavana &amp; Smith quadrants — popularity (menu-mix) vs. contribution margin</span>
      </div>
      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <h2>Stars · Plowhorses · Puzzles · Dogs</h2>
            <p>Each dot is a menu item positioned by popularity and margin percentile. Hover the legend to isolate a quadrant.</p>
          </div>
          <div className="panel-body">
            {menu.length > 0 ? (
              <QuadrantChart items={menu} selected={selected} onSelect={setSelected} />
            ) : (
              <div className="skeleton">Loading matrix…</div>
            )}
          </div>
        </div>
        {menu.length > 0 && <WhatIfSimulator items={menu} />}
      </div>

      <div className="section-title">
        <h2>Menu board</h2>
        <span>Every priced item with live classification — click a card to spotlight it on the matrix</span>
      </div>
      {menu.length > 0 ? (
        <MenuBoard items={menu} selected={selected} onSelect={setSelected} />
      ) : (
        <div className="skeleton">Loading menu…</div>
      )}

      <div className="section-title">
        <h2>Basket intelligence</h2>
        <span>Market-basket analysis over real transactions for upsell &amp; combo design</span>
      </div>
      <div style={{ maxWidth: 720 }}>
        <ComboPanel recs={recs} pairs={pairs} />
      </div>

      {meta && <Methodology meta={meta} />}
    </div>
  );
}

function Kpi({ lab, val, sub, accent }: { lab: string; val: string; sub?: string; accent?: string }) {
  return (
    <div className="kpi">
      <div className="lab">{lab}</div>
      <div className="val" style={accent ? { color: `var(${accent})` } : undefined}>{val}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

function Methodology({ meta }: { meta: Metadata }) {
  return (
    <div className="panel methods">
      <div className="panel-head">
        <h2>Data sources &amp; methodology</h2>
        <p>Full transparency on what is real versus modelled.</p>
      </div>
      <div className="panel-body">
        <p>
          <span className="tag real">REAL</span>
          Popularity, menu-mix and every basket co-occurrence come straight from{" "}
          <b>{meta.source_name}</b> ({meta.period}) — {meta.total_baskets_raw.toLocaleString()} genuine POS baskets,{" "}
          {meta.priced_line_items.toLocaleString()} priced line items across {meta.priced_menu_items} items.
        </p>
        <h3>Modelled operational layer (why)</h3>
        <p>
          <span className="tag model">MODELLED</span>
          The raw log carries no prices or costs, so an operational layer is attached to run classic menu engineering:
        </p>
        <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
          <li><b>Price</b> — {meta.modelled_fields.price}.</li>
          <li><b>Food cost %</b> — {meta.modelled_fields.food_cost_pct}.</li>
          <li><b>Elasticity</b> — {meta.modelled_fields.elasticity}.</li>
        </ul>
        <p style={{ marginTop: 12 }}>
          This hybrid is standard, defensible practice when transaction-level POS data is public but pricing is not.
          Popularity and basket analytics stand entirely on real data; margin and what-if projections layer explicit,
          documented assumptions on top. Source:{" "}
          <a href={meta.source_url} target="_blank" rel="noreferrer">POS transaction CSV</a>.
        </p>
      </div>
    </div>
  );
}
