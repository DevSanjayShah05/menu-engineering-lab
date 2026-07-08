import type { Classification } from "./api";

export const QUADS: Classification[] = ["Star", "Plowhorse", "Puzzle", "Dog"];

export const QUAD_GLYPH: Record<Classification, string> = {
  Star: "★",
  Plowhorse: "▬",
  Puzzle: "?",
  Dog: "▽",
};

export const QUAD_ACTION: Record<Classification, string> = {
  Star: "Promote & protect",
  Plowhorse: "Improve margin / bundle",
  Puzzle: "Reposition & merchandise",
  Dog: "Remove or reinvent",
};
