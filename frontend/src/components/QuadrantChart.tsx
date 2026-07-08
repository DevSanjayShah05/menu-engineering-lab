import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Classification, MenuItem } from "../api";
import { gbp } from "../api";
import { QUAD_GLYPH, QUADS } from "../quad";

const CSSVAR: Record<Classification, string> = {
  Star: "--star",
  Plowhorse: "--plowhorse",
  Puzzle: "--puzzle",
  Dog: "--dog",
};

function useVar(name: string) {
  return useMemo(() => {
    if (typeof window === "undefined") return "#888";
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
  }, [name]);
}

export function QuadrantChart({
  items,
  selected,
  onSelect,
}: {
  items: MenuItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [active, setActive] = useState<Classification | null>(null);

  const colors = {
    Star: useVar("--star"),
    Plowhorse: useVar("--plowhorse"),
    Puzzle: useVar("--puzzle"),
    Dog: useVar("--dog"),
  } as Record<Classification, string>;
  const grid = useVar("--hairline");
  const axis = useVar("--muted");

  const n = items.length || 1;
  const xSplit = (items.filter((i) => !i.high_popularity).length / n) * 100;
  const ySplit = (items.filter((i) => !i.high_margin).length / n) * 100;

  const counts = useMemo(() => {
    const c: Record<Classification, number> = { Star: 0, Plowhorse: 0, Puzzle: 0, Dog: 0 };
    items.forEach((i) => (c[i.classification] += 1));
    return c;
  }, [items]);

  return (
    <div>
      <div style={{ width: "100%", height: 380 }}>
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 16, right: 20, bottom: 34, left: 8 }}>
            <defs />
            {/* faint quadrant washes */}
            <ReferenceArea x1={xSplit} x2={100} y1={ySplit} y2={100} fill={colors.Star} fillOpacity={0.05} />
            <ReferenceArea x1={xSplit} x2={100} y1={0} y2={ySplit} fill={colors.Plowhorse} fillOpacity={0.05} />
            <ReferenceArea x1={0} x2={xSplit} y1={ySplit} y2={100} fill={colors.Puzzle} fillOpacity={0.05} />
            <ReferenceArea x1={0} x2={xSplit} y1={0} y2={ySplit} fill={colors.Dog} fillOpacity={0.05} />
            <CartesianGrid stroke={grid} strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="popularity_index"
              domain={[0, 100]}
              name="Popularity"
              tick={{ fill: axis, fontSize: 11 }}
              stroke={grid}
              label={{ value: "Popularity percentile →", position: "bottom", offset: 12, fill: axis, fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="margin_index"
              domain={[0, 100]}
              name="Margin"
              tick={{ fill: axis, fontSize: 11 }}
              stroke={grid}
              label={{ value: "Contribution-margin percentile →", angle: -90, position: "insideLeft", offset: 18, fill: axis, fontSize: 12 }}
            />
            <ZAxis type="number" dataKey="z" range={[70, 480]} />
            <ReferenceLine x={xSplit} stroke={axis} strokeDasharray="5 4" />
            <ReferenceLine y={ySplit} stroke={axis} strokeDasharray="5 4" />
            <Tooltip cursor={false} content={<QuadTip />} />
            <Scatter
              data={items.map((i) => ({
                ...i,
                z: Math.sqrt(i.units_sold),
              }))}
              isAnimationActive={false}
              onClick={(d: any) => onSelect(d?.item_id === selected ? null : d?.item_id)}
            >
              {items.map((i) => {
                const dim = active && i.classification !== active;
                const sel = selected === i.item_id;
                return (
                  <Cell
                    key={i.item_id}
                    fill={colors[i.classification]}
                    fillOpacity={dim ? 0.12 : sel ? 1 : 0.82}
                    stroke={sel ? "var(--ink)" : "var(--surface)"}
                    strokeWidth={sel ? 2 : 1}
                    style={{ cursor: "pointer" }}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="quad-legend">
        {QUADS.map((q) => (
          <button
            key={q}
            className={`quad-pill ${active && active !== q ? "dim" : ""}`}
            onMouseEnter={() => setActive(q)}
            onMouseLeave={() => setActive(null)}
            onClick={() => setActive(active === q ? null : q)}
          >
            <span className="sw" style={{ background: `var(${CSSVAR[q]})` }} />
            <span className="glyph">{QUAD_GLYPH[q]}</span>
            <b>{q}</b>
            <span className="ct">{counts[q]}</span>
          </button>
        ))}
        <span style={{ fontSize: 11, color: "var(--muted)", alignSelf: "center", marginLeft: 4 }}>
          bubble size = units sold · click a point to inspect
        </span>
      </div>
    </div>
  );
}

function QuadTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d: MenuItem = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="nm">{d.name}</div>
      <div className="row" style={{ marginBottom: 6 }}>
        <span className="badge-inline" style={{ color: `var(${CSSVAR[d.classification]})` }}>
          {QUAD_GLYPH[d.classification]} {d.classification}
        </span>
        <span style={{ color: "var(--muted)" }}>{d.category}</span>
      </div>
      <div className="row"><span>Price</span><b>{gbp(d.price)}</b></div>
      <div className="row"><span>Contribution margin</span><b>{gbp(d.contribution_margin)}</b></div>
      <div className="row"><span>Units sold</span><b>{d.units_sold.toLocaleString()}</b></div>
      <div className="row"><span>Menu mix</span><b>{(d.menu_mix_pct * 100).toFixed(2)}%</b></div>
    </div>
  );
}
