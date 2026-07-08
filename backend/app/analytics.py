"""
analytics.py — Menu engineering, elasticity and what-if pricing.

Menu-engineering classification (Kasavana & Smith, 1982):
  Each item is scored on two axes and split at a threshold:
    * POPULARITY  — menu-mix %. An item is "high" popularity when its menu-mix
      share is at or above a threshold. The classic rule uses
      (1 / n_items) * 0.70 as the popularity cut-off; we also expose a simple
      median split. We default to the classic 70%-of-fair-share rule.
    * PROFITABILITY — contribution margin (GBP) vs. the menu average margin.
  Quadrants:
    STAR      high popularity, high margin  -> promote / protect
    PLOWHORSE high popularity, low  margin  -> re-engineer cost or bundle
    PUZZLE    low  popularity, high margin  -> reposition / merchandise
    DOG       low  popularity, low  margin  -> consider removing
"""
from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from . import data

QUADRANT_META = {
    "Star": {
        "label": "Star",
        "description": "High popularity, high margin. Protect placement and quality; feature prominently.",
        "action": "Promote & protect",
    },
    "Plowhorse": {
        "label": "Plowhorse",
        "description": "High popularity, low margin. Works the volume but thin. Re-engineer cost, trim portion, or attach a high-margin add-on.",
        "action": "Improve margin / bundle",
    },
    "Puzzle": {
        "label": "Puzzle",
        "description": "Low popularity, high margin. Profitable but under-sold. Reposition on the menu, rename, or merchandise.",
        "action": "Reposition & merchandise",
    },
    "Dog": {
        "label": "Dog",
        "description": "Low popularity, low margin. Drags the menu. Consider removing or reinventing.",
        "action": "Remove or reinvent",
    },
}


def classify(popularity_rule: str = "classic") -> pd.DataFrame:
    """Return the menu with engineering metrics and quadrant classification."""
    df = data.menu_items().copy()
    n = len(df)

    avg_margin = float(df["contribution_margin"].mean())

    if popularity_rule == "median":
        pop_threshold = float(df["menu_mix_pct"].median())
    else:  # classic Kasavana & Smith: 70% of an equal share
        pop_threshold = (1.0 / n) * 0.70

    df["popularity_threshold"] = pop_threshold
    df["margin_threshold"] = round(avg_margin, 4)
    df["high_popularity"] = df["menu_mix_pct"] >= pop_threshold
    df["high_margin"] = df["contribution_margin"] >= avg_margin

    def q(row):
        if row["high_popularity"] and row["high_margin"]:
            return "Star"
        if row["high_popularity"] and not row["high_margin"]:
            return "Plowhorse"
        if not row["high_popularity"] and row["high_margin"]:
            return "Puzzle"
        return "Dog"

    df["classification"] = df.apply(q, axis=1)

    # Percentile indices (0-100) power the scatter axes and hover detail.
    df["popularity_index"] = (df["menu_mix_pct"].rank(pct=True) * 100).round(1)
    df["margin_index"] = (df["contribution_margin"].rank(pct=True) * 100).round(1)
    return df


def summary() -> dict:
    df = classify()
    counts = df["classification"].value_counts().to_dict()
    return {
        "total_items": int(len(df)),
        "categories": int(df["category"].nunique()),
        "total_units_sold": int(df["units_sold"].sum()),
        "total_revenue": round(float(df["revenue"].sum()), 2),
        "total_contribution_margin": round(float(df["total_margin"].sum()), 2),
        "avg_check_margin_pct": round(float((df["total_margin"].sum() / df["revenue"].sum())), 4),
        "avg_item_price": round(float(df["price"].mean()), 2),
        "quadrant_counts": {
            k: int(counts.get(k, 0)) for k in ["Star", "Plowhorse", "Puzzle", "Dog"]
        },
        "quadrant_revenue": {
            k: round(float(df[df["classification"] == k]["revenue"].sum()), 2)
            for k in ["Star", "Plowhorse", "Puzzle", "Dog"]
        },
    }


def whatif(item_id: str, new_price: float) -> dict:
    """
    Project the impact of a price change using constant-elasticity demand.

        pct_qty_change = elasticity * pct_price_change      (log-log form)
        new_qty        = base_qty * (new_price/base_price) ** elasticity

    Unit cost is held constant (a pricing change, not a recipe change), so the
    new contribution margin is new_price - unit_cost.
    """
    df = data.menu_items()
    row = df[df["item_id"] == item_id]
    if row.empty:
        raise KeyError(item_id)
    r = row.iloc[0]

    base_price = float(r["price"])
    base_qty = float(r["units_sold"])
    unit_cost = float(r["unit_cost"])
    elasticity = float(r["elasticity"])

    new_price = float(new_price)
    pct_price_change = (new_price - base_price) / base_price

    price_ratio = new_price / base_price if base_price else 1.0
    new_qty = base_qty * (price_ratio ** elasticity)
    pct_qty_change = (new_qty - base_qty) / base_qty if base_qty else 0.0

    base_revenue = base_price * base_qty
    new_revenue = new_price * new_qty
    base_margin_unit = base_price - unit_cost
    new_margin_unit = new_price - unit_cost
    base_total_margin = base_margin_unit * base_qty
    new_total_margin = new_margin_unit * new_qty

    return {
        "item_id": item_id,
        "name": r["name"],
        "category": r["category"],
        "elasticity": elasticity,
        "base_price": round(base_price, 2),
        "new_price": round(new_price, 2),
        "pct_price_change": round(pct_price_change, 4),
        "unit_cost": round(unit_cost, 2),
        "base_units": round(base_qty, 1),
        "projected_units": round(new_qty, 1),
        "pct_units_change": round(pct_qty_change, 4),
        "base_revenue": round(base_revenue, 2),
        "projected_revenue": round(new_revenue, 2),
        "revenue_delta": round(new_revenue - base_revenue, 2),
        "base_margin": round(base_total_margin, 2),
        "projected_margin": round(new_total_margin, 2),
        "margin_delta": round(new_total_margin - base_total_margin, 2),
        "margin_delta_pct": round(
            (new_total_margin - base_total_margin) / base_total_margin, 4
        ) if base_total_margin else 0.0,
    }


def optimal_price(item_id: str, span: float = 0.40, steps: int = 41) -> dict:
    """Sweep price +/- span% and return the margin-maximising price point.

    With constant elasticity e, total margin is maximised analytically at
        p* = unit_cost * e / (e + 1)      for e < -1 (elastic)
    For inelastic items (-1 < e < 0) margin rises monotonically with price, so a
    closed-form interior optimum does not exist; we then report the top of the
    swept band and flag it. We compute the curve numerically for the UI too.
    """
    df = data.menu_items()
    r = df[df["item_id"] == item_id].iloc[0]
    base_price = float(r["price"])
    unit_cost = float(r["unit_cost"])
    elasticity = float(r["elasticity"])

    prices = np.linspace(base_price * (1 - span), base_price * (1 + span), steps)
    curve = []
    for p in prices:
        res = whatif(item_id, float(p))
        curve.append({"price": round(float(p), 2), "margin": res["projected_margin"]})

    best = max(curve, key=lambda c: c["margin"])
    interior = elasticity < -1
    p_star = None
    if interior:
        p_star = round(unit_cost * elasticity / (elasticity + 1), 2)

    return {
        "item_id": item_id,
        "name": r["name"],
        "elasticity": elasticity,
        "base_price": round(base_price, 2),
        "curve": curve,
        "best_swept_price": best["price"],
        "closed_form_optimal_price": p_star,
        "has_interior_optimum": bool(interior),
        "note": (
            "Elastic item: margin-maximising price is an interior point."
            if interior
            else "Inelastic item: margin rises with price across the tested band; "
            "cap increases by demand/positioning judgement, not just the model."
        ),
    }
