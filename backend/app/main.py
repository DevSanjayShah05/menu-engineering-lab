"""
Menu Matrix API — Restaurant Menu Engineering & Price Elasticity Lab.

FastAPI service exposing menu-engineering classification, market-basket
attachment recommendations, and live what-if price simulation over a real
bakery-cafe POS transaction log.
"""
from __future__ import annotations

import math

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import analytics, basket, data

app = FastAPI(
    title="Menu Matrix API",
    description="Restaurant Menu Engineering & Price Elasticity Lab",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _clean(obj):
    """Recursively replace NaN/inf so responses are valid JSON."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: _clean(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_clean(v) for v in obj]
    return obj


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "menu-matrix"}


@app.get("/api/metadata")
def get_metadata():
    return data.metadata()


@app.get("/api/summary")
def get_summary():
    return _clean(analytics.summary())


@app.get("/api/quadrant-meta")
def get_quadrant_meta():
    return analytics.QUADRANT_META


@app.get("/api/menu")
def get_menu(popularity_rule: str = Query("classic", pattern="^(classic|median)$")):
    df = analytics.classify(popularity_rule=popularity_rule)
    cols = [
        "item_id", "name", "category", "price", "unit_cost", "contribution_margin",
        "margin_pct", "food_cost_pct", "units_sold", "menu_mix_pct", "revenue",
        "total_margin", "elasticity", "classification", "popularity_index",
        "margin_index", "high_popularity", "high_margin",
    ]
    thresholds = {
        "popularity_threshold": float(df["popularity_threshold"].iloc[0]),
        "margin_threshold": float(df["margin_threshold"].iloc[0]),
        "popularity_rule": popularity_rule,
    }
    items = _clean(df[cols].to_dict(orient="records"))
    return {"thresholds": thresholds, "items": items}


@app.get("/api/basket/recommendations")
def get_recommendations(
    min_support: float = Query(0.01, gt=0, le=1),
    min_confidence: float = Query(0.05, gt=0, le=1),
    limit: int = Query(15, ge=1, le=100),
):
    return {"recommendations": basket.recommendations(min_support, min_confidence, limit)}


@app.get("/api/basket/pairs")
def get_pairs(limit: int = Query(12, ge=1, le=50)):
    return {"pairs": basket.top_pairs(limit)}


class WhatIfRequest(BaseModel):
    item_id: str = Field(..., examples=["itm_001"])
    new_price: float = Field(..., gt=0, examples=[2.75])


@app.post("/api/whatif")
def post_whatif(req: WhatIfRequest):
    try:
        return _clean(analytics.whatif(req.item_id, req.new_price))
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown item_id: {req.item_id}")


@app.get("/api/whatif/{item_id}/curve")
def get_curve(item_id: str, span: float = Query(0.40, gt=0, le=0.9)):
    try:
        return _clean(analytics.optimal_price(item_id, span=span))
    except (KeyError, IndexError):
        raise HTTPException(status_code=404, detail=f"Unknown item_id: {item_id}")
