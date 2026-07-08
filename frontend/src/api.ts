// Typed client for the Menu Matrix API.
const BASE = (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

export type Classification = "Star" | "Plowhorse" | "Puzzle" | "Dog";

export interface MenuItem {
  item_id: string;
  name: string;
  category: string;
  price: number;
  unit_cost: number;
  contribution_margin: number;
  margin_pct: number;
  food_cost_pct: number;
  units_sold: number;
  menu_mix_pct: number;
  revenue: number;
  total_margin: number;
  elasticity: number;
  classification: Classification;
  popularity_index: number;
  margin_index: number;
  high_popularity: boolean;
  high_margin: boolean;
}

export interface MenuResponse {
  thresholds: {
    popularity_threshold: number;
    margin_threshold: number;
    popularity_rule: string;
  };
  items: MenuItem[];
}

export interface Summary {
  total_items: number;
  categories: number;
  total_units_sold: number;
  total_revenue: number;
  total_contribution_margin: number;
  avg_check_margin_pct: number;
  avg_item_price: number;
  quadrant_counts: Record<Classification, number>;
  quadrant_revenue: Record<Classification, number>;
}

export interface Recommendation {
  if_buys: string[];
  recommend: string;
  support: number;
  confidence: number;
  lift: number;
  message: string;
}

export interface Pair {
  items: string[];
  support: number;
  confidence: number;
  lift: number;
}

export interface WhatIf {
  item_id: string;
  name: string;
  category: string;
  elasticity: number;
  base_price: number;
  new_price: number;
  pct_price_change: number;
  unit_cost: number;
  base_units: number;
  projected_units: number;
  pct_units_change: number;
  base_revenue: number;
  projected_revenue: number;
  revenue_delta: number;
  base_margin: number;
  projected_margin: number;
  margin_delta: number;
  margin_delta_pct: number;
}

export interface Metadata {
  source_name: string;
  source_url: string;
  source_kaggle: string;
  period: string;
  currency: string;
  total_baskets_raw: number;
  priced_menu_items: number;
  priced_line_items: number;
  baskets_used_for_basket_analysis: number;
  real_fields: string[];
  modelled_fields: Record<string, string>;
  category_elasticity: Record<string, number>;
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return r.json();
}

export const api = {
  base: BASE,
  summary: () => get<Summary>("/api/summary"),
  metadata: () => get<Metadata>("/api/metadata"),
  menu: (rule = "classic") => get<MenuResponse>(`/api/menu?popularity_rule=${rule}`),
  quadrantMeta: () =>
    get<Record<Classification, { label: string; description: string; action: string }>>(
      "/api/quadrant-meta",
    ),
  recommendations: (limit = 12) =>
    get<{ recommendations: Recommendation[] }>(
      `/api/basket/recommendations?min_support=0.008&min_confidence=0.05&limit=${limit}`,
    ),
  pairs: (limit = 10) => get<{ pairs: Pair[] }>(`/api/basket/pairs?limit=${limit}`),
  whatif: async (item_id: string, new_price: number): Promise<WhatIf> => {
    const r = await fetch(`${BASE}/api/whatif`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_id, new_price }),
    });
    if (!r.ok) throw new Error(`whatif ${r.status}`);
    return r.json();
  },
};

export const gbp = (n: number, dp = 2) =>
  `£${n.toLocaleString("en-GB", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const num = (n: number) => n.toLocaleString("en-GB");
export const pct = (n: number, dp = 1) => `${(n * 100).toFixed(dp)}%`;

export const QUAD_COLOR: Record<Classification, string> = {
  Star: "var(--star)",
  Plowhorse: "var(--plowhorse)",
  Puzzle: "var(--puzzle)",
  Dog: "var(--dog)",
};
export const QUAD_WASH: Record<Classification, string> = {
  Star: "var(--star-wash)",
  Plowhorse: "var(--plowhorse-wash)",
  Puzzle: "var(--puzzle-wash)",
  Dog: "var(--dog-wash)",
};
