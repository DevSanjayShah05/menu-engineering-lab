"""
basket.py — Market-basket analysis on the REAL transaction log.

Uses FP-Growth (mlxtend) to mine frequent itemsets and association rules from
the actual baskets, then turns the strongest rules into plain-language
attachment / upsell recommendations for front-of-house.

All co-occurrence here is genuine: it comes straight from real POS baskets.
"""
from __future__ import annotations

import functools
from typing import List

import pandas as pd
from mlxtend.frequent_patterns import association_rules, fpgrowth
from mlxtend.preprocessing import TransactionEncoder

from . import data


@functools.lru_cache(maxsize=1)
def _onehot() -> pd.DataFrame:
    tx = data.transactions()
    baskets = tx.groupby("transaction_id")["name"].apply(list).tolist()
    te = TransactionEncoder()
    arr = te.fit_transform(baskets)
    return pd.DataFrame(arr, columns=te.columns_)


@functools.lru_cache(maxsize=32)
def rules(min_support: float = 0.01, min_confidence: float = 0.05,
          max_len: int = 3) -> pd.DataFrame:
    onehot = _onehot()
    freq = fpgrowth(onehot, min_support=min_support, use_colnames=True, max_len=max_len)
    if freq.empty:
        return pd.DataFrame()
    rl = association_rules(freq, metric="confidence", min_threshold=min_confidence)
    if rl.empty:
        return rl
    rl["antecedents"] = rl["antecedents"].apply(lambda s: sorted(s))
    rl["consequents"] = rl["consequents"].apply(lambda s: sorted(s))
    # Only single-item consequents make clean "attach X" recommendations.
    rl = rl[rl["consequents"].apply(len) == 1]
    rl = rl.sort_values(["lift", "confidence"], ascending=False).reset_index(drop=True)
    return rl


def recommendations(min_support: float = 0.01, min_confidence: float = 0.05,
                    limit: int = 15) -> List[dict]:
    rl = rules(min_support=min_support, min_confidence=min_confidence)
    if rl.empty:
        return []
    out = []
    for _, r in rl.head(limit).iterrows():
        ante = list(r["antecedents"])
        cons = list(r["consequents"])[0]
        out.append({
            "if_buys": ante,
            "recommend": cons,
            "support": round(float(r["support"]), 4),
            "confidence": round(float(r["confidence"]), 4),
            "lift": round(float(r["lift"]), 3),
            "message": _phrase(ante, cons, float(r["confidence"]), float(r["lift"])),
        })
    return out


def _phrase(ante: List[str], cons: str, conf: float, lift: float) -> str:
    joined = " + ".join(ante)
    strength = "strongly" if lift >= 1.5 else "more often than average"
    return (f"Guests buying {joined} take {cons} {strength} "
            f"({conf*100:.0f}% attach rate, lift {lift:.2f}). "
            f"Prompt or bundle {cons} at the point of sale.")


def top_pairs(limit: int = 12) -> List[dict]:
    """Highest-lift two-item combinations for a combo board."""
    rl = rules(min_support=0.005, min_confidence=0.02)
    if rl.empty:
        return []
    seen = set()
    out = []
    for _, r in rl.iterrows():
        pair = tuple(sorted(set(r["antecedents"]) | set(r["consequents"])))
        if len(pair) != 2 or pair in seen:
            continue
        seen.add(pair)
        out.append({
            "items": list(pair),
            "support": round(float(r["support"]), 4),
            "confidence": round(float(r["confidence"]), 4),
            "lift": round(float(r["lift"]), 3),
        })
        if len(out) >= limit:
            break
    return out
