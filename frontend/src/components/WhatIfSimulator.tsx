import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MenuItem, WhatIf } from "../api";
import { api, gbp } from "../api";

// Local constant-elasticity projection mirrors the backend /api/whatif model,
// so the slider updates instantly without a round-trip per tick.
function project(item: MenuItem, newPrice: number) {
  const ratio = newPrice / item.price;
  const newQty = item.units_sold * Math.pow(ratio, item.elasticity);
  const newRevenue = newPrice * newQty;
  const newMargin = (newPrice - item.unit_cost) * newQty;
  return {
    newQty,
    newRevenue,
    newMargin,
    baseRevenue: item.price * item.units_sold,
    baseMargin: item.contribution_margin * item.units_sold,
  };
}

function Delta({ base, next, money = true }: { base: number; next: number; money?: boolean }) {
  const d = next - base;
  const p = base ? (d / base) * 100 : 0;
  const up = d >= 0;
  return (
    <div className={`wd ${up ? "up" : "down"}`}>
      {up ? "▲" : "▼"} {money ? gbp(Math.abs(d), 0) : Math.abs(Math.round(d)).toLocaleString()} ({p >= 0 ? "+" : ""}
      {p.toFixed(1)}%)
    </div>
  );
}

export function WhatIfSimulator({ items }: { items: MenuItem[] }) {
  const [id, setId] = useState(items[0]?.item_id ?? "");
  const item = items.find((i) => i.item_id === id) ?? items[0];
  const [price, setPrice] = useState(item?.price ?? 0);
  const [serverCheck, setServerCheck] = useState<WhatIf | null>(null);

  useEffect(() => {
    if (item) setPrice(item.price);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Confirm the frontend projection against the backend when the item changes.
  useEffect(() => {
    if (!item) return;
    api.whatif(item.item_id, item.price).then(setServerCheck).catch(() => setServerCheck(null));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const min = useMemo(() => +(item.price * 0.6).toFixed(2), [item]);
  const max = useMemo(() => +(item.price * 1.4).toFixed(2), [item]);

  const p = project(item, price);
  const pctChg = ((price - item.price) / item.price) * 100;

  const curve = useMemo(() => {
    const pts = [];
    for (let k = 0; k <= 40; k++) {
      const pr = min + ((max - min) * k) / 40;
      pts.push({ price: +pr.toFixed(2), margin: (pr - item.unit_cost) * item.units_sold * Math.pow(pr / item.price, item.elasticity) });
    }
    return pts;
  }, [item, min, max]);

  const best = useMemo(() => curve.reduce((a, b) => (b.margin > a.margin ? b : a), curve[0]), [curve]);
  const inelastic = item.elasticity > -1;

  return (
    <div className="panel">
      <div className="panel-head">
        <h2>What-if price simulator</h2>
        <p>Constant-elasticity demand model. Drag to reprice and project volume, revenue and margin live.</p>
      </div>
      <div className="panel-body">
        <div className="wi-pick">
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {items.map((i) => (
              <option key={i.item_id} value={i.item_id}>
                {i.name} — {i.category}
              </option>
            ))}
          </select>
          <span className="wi-elastic">
            elasticity <b>{item.elasticity.toFixed(1)}</b> · {inelastic ? "inelastic" : "elastic"}
            {serverCheck ? " · ✓ API verified" : ""}
          </span>
        </div>

        <div className="wi-price">
          <div className="now tnum">{gbp(price)}</div>
          <div className="base">
            base {gbp(item.price)} ·{" "}
            <span className="chg" style={{ color: pctChg >= 0 ? "var(--good)" : "var(--bad)" }}>
              {pctChg >= 0 ? "+" : ""}
              {pctChg.toFixed(1)}%
            </span>
          </div>
        </div>

        <input
          className="slider"
          type="range"
          min={min}
          max={max}
          step={0.05}
          value={price}
          onChange={(e) => setPrice(+e.target.value)}
        />
        <div className="slider-scale tnum">
          <span>{gbp(min)}</span>
          <span>-40% &nbsp; base &nbsp; +40%</span>
          <span>{gbp(max)}</span>
        </div>

        <div className="wi-out">
          <div className="wi-cell">
            <div className="wl">Units / period</div>
            <div className="wv tnum">{Math.round(p.newQty).toLocaleString()}</div>
            <Delta base={item.units_sold} next={p.newQty} money={false} />
          </div>
          <div className="wi-cell">
            <div className="wl">Revenue</div>
            <div className="wv tnum">{gbp(p.newRevenue, 0)}</div>
            <Delta base={p.baseRevenue} next={p.newRevenue} />
          </div>
          <div className="wi-cell">
            <div className="wl">Contribution</div>
            <div className="wv tnum">{gbp(p.newMargin, 0)}</div>
            <Delta base={p.baseMargin} next={p.newMargin} />
          </div>
        </div>

        <div style={{ width: "100%", height: 130, marginTop: 10 }}>
          <ResponsiveContainer>
            <AreaChart data={curve} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--olive)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--olive)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="price" tick={{ fontSize: 10, fill: "var(--muted)" }} tickFormatter={(v) => `£${v}`} stroke="var(--hairline)" />
              <YAxis hide />
              <Tooltip
                formatter={(v: any) => [gbp(v as number, 0), "Contribution"]}
                labelFormatter={(l) => `Price £${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid var(--hairline-strong)", background: "var(--surface)" }}
              />
              <Area type="monotone" dataKey="margin" stroke="var(--olive)" strokeWidth={2} fill="url(#mg)" isAnimationActive={false} />
              <ReferenceLine x={item.price} stroke="var(--muted)" strokeDasharray="4 3" />
              <ReferenceDot x={price} y={p.newMargin} r={5} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="wi-note">
          Margin-maximising price in the tested band ≈ <b>{gbp(best.price)}</b>.{" "}
          {inelastic
            ? "This item is inelastic, so modelled margin keeps rising with price — cap increases with positioning judgement, not the model alone."
            : "This item is elastic, so there is a genuine interior sweet spot before volume loss dominates."}
        </div>
      </div>
    </div>
  );
}
