"""Data access layer — loads the processed dataset once at import time."""
from __future__ import annotations

import functools
import json
import os

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


@functools.lru_cache(maxsize=1)
def menu_items() -> pd.DataFrame:
    df = pd.read_csv(os.path.join(DATA_DIR, "menu_items.csv"))
    return df


@functools.lru_cache(maxsize=1)
def transactions() -> pd.DataFrame:
    return pd.read_csv(os.path.join(DATA_DIR, "transactions.csv"))


@functools.lru_cache(maxsize=1)
def metadata() -> dict:
    with open(os.path.join(DATA_DIR, "metadata.json")) as f:
        return json.load(f)
