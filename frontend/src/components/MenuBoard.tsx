import { useMemo, useState } from "react";
import type { Classification, MenuItem } from "../api";
import { gbp, pct } from "../api";
import { QUAD_GLYPH, QUADS } from "../quad";

const CSSVAR: Record<Classification, string> = {
  Star: "--star",
  Plowhorse: "--plowhorse",
  Puzzle: "--puzzle",
  Dog: "--dog",
};

type Filter = "All" | Classification;

export function MenuBoard({
  items,
  selected,
  onSelect,
}: {
  items: MenuItem[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("All");

  const shown = useMemo(
    () => (filter === "All" ? items : items.filter((i) => i.classification === filter)),
    [items, filter],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: items.length };
    QUADS.forEach((q) => (c[q] = items.filter((i) => i.classification === q).length));
    return c;
  }, [items]);

  return (
    <div>
      <div className="board-controls">
        <div className="seg">
          {(["All", ...QUADS] as Filter[]).map((f) => (
            <button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)}>
              {f === "All" ? "All" : `${QUAD_GLYPH[f as Classification]} ${f}`} ({counts[f]})
            </button>
          ))}
        </div>
        <span className="filter-note">
          {shown.length} of {items.length} items · sorted by units sold
        </span>
      </div>

      <div className="board">
        {shown.map((i) => (
          <div
            key={i.item_id}
            className={`card ${selected === i.item_id ? "selected" : ""}`}
            style={{ ["--q" as string]: `var(${CSSVAR[i.classification]})` }}
            onClick={() => onSelect(i.item_id)}
          >
            <div className="cat">{i.category}</div>
            <div className="nm">{i.name}</div>
            <div className="price-row">
              <span className="price tnum">{gbp(i.price)}</span>
              <span className="margin tnum">{gbp(i.contribution_margin)} CM · {pct(i.margin_pct, 0)}</span>
            </div>
            <div className="metrics">
              <div className="metric">
                <div className="m-lab">Units</div>
                <div className="m-val">{i.units_sold.toLocaleString()}</div>
              </div>
              <div className="metric">
                <div className="m-lab">Mix</div>
                <div className="m-val">{pct(i.menu_mix_pct, 1)}</div>
              </div>
              <div className="metric">
                <div className="m-lab">Elast.</div>
                <div className="m-val">{i.elasticity.toFixed(1)}</div>
              </div>
            </div>
            <span className="qbadge" style={{ ["--q" as string]: `var(${CSSVAR[i.classification]})` }}>
              <span className="glyph">{QUAD_GLYPH[i.classification]}</span>
              {i.classification}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
