import type { Pair, Recommendation } from "../api";

export function ComboPanel({
  recs,
  pairs,
}: {
  recs: Recommendation[];
  pairs: Pair[];
}) {
  const maxLift = Math.max(1, ...recs.map((r) => r.lift));
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>Attachment & combo recommendations</h2>
        <p>FP-Growth association rules mined from real baskets. Lift &gt; 1 means the pair sells together more than chance.</p>
      </div>
      <div className="panel-body">
        {recs.length === 0 && <div className="skeleton">No rules at current thresholds.</div>}
        {recs.map((r, idx) => (
          <div className="rec" key={idx}>
            <div className="rline">
              {r.if_buys.map((it) => (
                <span className="chiptok" key={it}>{it}</span>
              ))}
              <span className="arrow">→ attach</span>
              <span className="chiptok rec-to">{r.recommend}</span>
            </div>
            <div className="rmeta">
              <span>Attach rate <b>{(r.confidence * 100).toFixed(0)}%</b></span>
              <span>Lift <b>{r.lift.toFixed(2)}</b></span>
              <span>Support <b>{(r.support * 100).toFixed(2)}%</b></span>
            </div>
            <div className="liftbar" style={{ width: `${(r.lift / maxLift) * 100}%` }} />
          </div>
        ))}

        {pairs.length > 0 && (
          <>
            <h3 style={{ fontSize: 12.5, margin: "18px 0 10px", color: "var(--ink)" }}>
              Highest-affinity pairs
            </h3>
            <div className="pairs">
              {pairs.map((p, i) => (
                <span className="pairtok" key={i}>
                  {p.items.join(" + ")}
                  <span className="lift">×{p.lift.toFixed(1)}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
