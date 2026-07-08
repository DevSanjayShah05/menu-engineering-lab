"""
build_dataset.py — Menu Matrix ETL
==================================

Transforms the REAL "The Bread Basket" point-of-sale transaction log (a real
artisan bakery-cafe in Edinburgh, UK) into the processed dataset that the
Menu Matrix API reads.

WHAT IS REAL
------------
* Every transaction and every item line in `bread basket.csv` is a genuine POS
  record from the bakery (~9,400 baskets, Oct 2016 - Apr 2017). Therefore item
  POPULARITY (units sold), MENU MIX %, and BASKET CO-OCCURRENCE (used for the
  market-basket / attachment analysis) are all derived from real sales.

WHAT IS MODELLED (and why)
--------------------------
The raw log contains no prices or costs (it is a transaction-item log only), so
to run classic menu-engineering we attach an operational cost layer:
* PRICE  — real-world-plausible published GBP cafe menu prices for each item.
* FOOD COST % — category benchmarks from published foodservice references
  (beverages ~15-25%, bakery ~30-35%, prepared/savoury ~30-38%). These give a
  defensible CONTRIBUTION MARGIN per item (price x (1 - food_cost_pct)).
* PRICE ELASTICITY — category-level coefficients from the published restaurant
  demand-elasticity range (roughly -0.5 habitual drinks to -1.3 discretionary
  retail). The single-price dataset has no price variation, so elasticity CANNOT
  be regressed from it; it is an explicit, documented assumption used to power
  the what-if simulator. This is stated plainly in the README and the API.

Run:  python build_dataset.py
Outputs to ../data/: menu_items.csv, transactions.csv, metadata.json
"""
from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, "..", "data")
RAW_URL = "https://raw.githubusercontent.com/prasertcbs/basic-dataset/master/bread%20basket.csv"
RAW_CACHE = os.path.join(HERE, "_raw_bread_basket.csv")

# ---------------------------------------------------------------------------
# The operational menu layer (see module docstring for the real-vs-modelled
# breakdown). Keyed by the item label exactly as it appears in the POS log.
# price_gbp: published-plausible cafe price. food_cost_pct: category benchmark.
# ---------------------------------------------------------------------------
CATEGORY_ELASTICITY = {
    "Hot Drinks": -0.5,       # habitual, inelastic
    "Cold Drinks": -0.9,
    "Bakery": -0.8,
    "Cakes & Desserts": -1.1,  # discretionary indulgence
    "Savoury & Meals": -0.7,
    "Retail & Grocery": -1.3,  # easily substituted
}

# item -> (category, price_gbp, food_cost_pct)
MENU = {
    # Hot Drinks
    "Coffee": ("Hot Drinks", 2.45, 0.20),
    "Tea": ("Hot Drinks", 2.00, 0.15),
    "Hot chocolate": ("Hot Drinks", 2.80, 0.22),
    # Cold Drinks
    "Juice": ("Cold Drinks", 2.50, 0.25),
    "Coke": ("Cold Drinks", 1.80, 0.30),
    "Mineral water": ("Cold Drinks", 1.50, 0.20),
    "Smoothies": ("Cold Drinks", 3.20, 0.30),
    # Bakery
    "Bread": ("Bakery", 2.20, 0.30),
    "Pastry": ("Bakery", 2.30, 0.32),
    "Medialuna": ("Bakery", 2.10, 0.30),
    "Muffin": ("Bakery", 2.40, 0.33),
    "Scone": ("Bakery", 2.20, 0.30),
    "Baguette": ("Bakery", 2.60, 0.32),
    "Focaccia": ("Bakery", 3.20, 0.34),
    "Farm House": ("Bakery", 3.00, 0.32),
    "Toast": ("Bakery", 2.50, 0.28),
    "Alfajores": ("Bakery", 2.00, 0.35),
    # Cakes & Desserts
    "Cake": ("Cakes & Desserts", 3.80, 0.35),
    "Brownie": ("Cakes & Desserts", 2.60, 0.33),
    "Cookies": ("Cakes & Desserts", 1.80, 0.30),
    "Truffles": ("Cakes & Desserts", 3.50, 0.38),
    "Fudge": ("Cakes & Desserts", 2.80, 0.36),
    "Tiffin": ("Cakes & Desserts", 2.40, 0.34),
    "Bakewell": ("Cakes & Desserts", 2.80, 0.35),
    "Victorian Sponge": ("Cakes & Desserts", 3.80, 0.36),
    "Jammie Dodgers": ("Cakes & Desserts", 1.60, 0.32),
    # Savoury & Meals
    "Sandwich": ("Savoury & Meals", 4.50, 0.35),
    "Soup": ("Savoury & Meals", 4.20, 0.30),
    "Salad": ("Savoury & Meals", 5.50, 0.33),
    "Frittata": ("Savoury & Meals", 5.00, 0.34),
    "Chicken Stew": ("Savoury & Meals", 6.50, 0.35),
    "Spanish Brunch": ("Savoury & Meals", 8.50, 0.38),
    "Tartine": ("Savoury & Meals", 5.50, 0.34),
    "Scandinavian": ("Savoury & Meals", 4.80, 0.35),
    "Eggs": ("Savoury & Meals", 3.50, 0.30),
    "Granola": ("Savoury & Meals", 3.80, 0.32),
    "Hearty & Seasonal": ("Savoury & Meals", 7.50, 0.36),
    "Keeping It Local": ("Savoury & Meals", 7.00, 0.36),
    "The Nomad": ("Savoury & Meals", 7.50, 0.37),
    "Vegan Feast": ("Savoury & Meals", 8.00, 0.36),
    "Vegan mincepie": ("Savoury & Meals", 3.20, 0.34),
    "Empanadas": ("Savoury & Meals", 4.00, 0.35),
    # Retail & Grocery
    "Jam": ("Retail & Grocery", 3.00, 0.25),
    "Honey": ("Retail & Grocery", 4.50, 0.40),
    "Muesli": ("Retail & Grocery", 3.50, 0.30),
    "Crisps": ("Retail & Grocery", 1.20, 0.45),
}

NON_ITEMS = {"NONE", "", "ADJUSTMENT"}


def fetch_raw() -> pd.DataFrame:
    if not os.path.exists(RAW_CACHE):
        print(f"Downloading real POS log from {RAW_URL}")
        urllib.request.urlretrieve(RAW_URL, RAW_CACHE)
    df = pd.read_csv(RAW_CACHE)
    df["Item"] = df["Item"].astype(str).str.strip()
    df = df[~df["Item"].str.upper().isin(NON_ITEMS)]
    return df


def build():
    raw = fetch_raw()
    total_baskets = raw["Transaction"].nunique()

    # Keep only priced menu items for the engineering analysis.
    menu_df = raw[raw["Item"].isin(MENU.keys())].copy()

    # --- item-level real metrics -------------------------------------------
    units = menu_df.groupby("Item").size().rename("units_sold")
    baskets_with = menu_df.groupby("Item")["Transaction"].nunique().rename("baskets_with_item")
    items = pd.concat([units, baskets_with], axis=1).reset_index()

    items["category"] = items["Item"].map(lambda x: MENU[x][0])
    items["price"] = items["Item"].map(lambda x: round(MENU[x][1], 2))
    items["food_cost_pct"] = items["Item"].map(lambda x: MENU[x][2])
    items["unit_cost"] = (items["price"] * items["food_cost_pct"]).round(2)
    items["contribution_margin"] = (items["price"] - items["unit_cost"]).round(2)
    items["margin_pct"] = (items["contribution_margin"] / items["price"]).round(4)
    items["elasticity"] = items["category"].map(CATEGORY_ELASTICITY)

    total_units = int(items["units_sold"].sum())
    items["menu_mix_pct"] = (items["units_sold"] / total_units).round(5)
    items["revenue"] = (items["units_sold"] * items["price"]).round(2)
    items["total_margin"] = (items["units_sold"] * items["contribution_margin"]).round(2)

    items = items.rename(columns={"Item": "name"})
    items = items.sort_values("units_sold", ascending=False).reset_index(drop=True)
    items.insert(0, "item_id", ["itm_%03d" % i for i in range(1, len(items) + 1)])

    # --- processed transaction log (menu items only) for market basket -----
    tx = menu_df[["Transaction", "Item"]].drop_duplicates().rename(
        columns={"Transaction": "transaction_id", "Item": "name"}
    )
    tx = tx.merge(items[["item_id", "name"]], on="name", how="left")
    tx = tx.sort_values(["transaction_id", "name"]).reset_index(drop=True)

    os.makedirs(DATA_DIR, exist_ok=True)
    items.to_csv(os.path.join(DATA_DIR, "menu_items.csv"), index=False)
    tx.to_csv(os.path.join(DATA_DIR, "transactions.csv"), index=False)

    metadata = {
        "source_name": "The Bread Basket (Edinburgh, UK) POS transaction log",
        "source_url": RAW_URL,
        "source_kaggle": "https://www.kaggle.com/datasets/mittalvasu95/the-bread-basket",
        "period": "2016-10-30 to 2017-04-09",
        "currency": "GBP",
        "total_baskets_raw": int(total_baskets),
        "priced_menu_items": int(len(items)),
        "priced_line_items": int(items["units_sold"].sum()),
        "baskets_used_for_basket_analysis": int(tx["transaction_id"].nunique()),
        "real_fields": ["units_sold", "baskets_with_item", "menu_mix_pct",
                        "basket co-occurrence / association rules"],
        "modelled_fields": {
            "price": "real-world-plausible published GBP cafe prices",
            "food_cost_pct": "published category benchmarks (bev 15-25%, bakery 30-35%, savoury 30-38%)",
            "elasticity": "category-level coefficients from published restaurant demand-elasticity range (-0.5 to -1.3); cannot be regressed from single-price data",
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "category_elasticity": CATEGORY_ELASTICITY,
    }
    with open(os.path.join(DATA_DIR, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"Wrote {len(items)} menu items, {len(tx)} transaction-item rows, "
          f"{tx['transaction_id'].nunique()} baskets.")
    print(f"Total real line items priced: {total_units}")


if __name__ == "__main__":
    build()
