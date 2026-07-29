// Shared client/server row shapes for the generic UI components.
import type { SystemManifest } from "./manifest";

export interface SystemSummary {
  slug: string;
  title: string;
  category: string;
  completion: SystemManifest["completion"];
  colors?: { done: string; missing: string; wishlist?: string };
  total_count: number;
  completed_count: number;
  completed_weight: string | number;
  total_weight: string | number;
  pct: string | number;
}

export interface MapSystem {
  slug: string;
  title: string;
  map: SystemManifest["map"];
}

export interface ComponentRow {
  id: number;
  role: string;
  weight: string | number;
  attrs: Record<string, unknown>;
  name: string;
  place_slug: string;
  container_slug: string | null;
  container_name: string | null;
  container_group: string | null; // e.g. the continent a region belongs to
  done: boolean;
  wishlisted: boolean;
}

export interface ContentBlock {
  tab: string;
  block_order: number;
  kind: string;
  body: Record<string, unknown>;
  source: string | null;
  review_status: string;
}

export interface EarnedBadgeToast {
  slug: string;
  title: string;
  icon: string | null;
}
