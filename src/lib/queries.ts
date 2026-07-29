// Server-component query helpers (serving plane, read-only).
import { query } from "./db";
import type { SystemManifest } from "./manifest";

export interface SystemRecord {
  id: number;
  slug: string;
  title: string;
  category: string;
  manifest: SystemManifest;
  total_count: number;
  container_count: number;
  total_weight: number;
}

export async function getSystem(slug: string): Promise<SystemRecord | null> {
  const res = await query(
    `SELECT s.id, s.slug, s.title, s.category, s.manifest,
            count(c.id) FILTER (WHERE c.role = 'leaf')::int AS total_count,
            count(c.id) FILTER (WHERE c.role = 'container')::int AS container_count,
            COALESCE(sum(c.weight) FILTER (WHERE c.role = 'leaf'), 0)::float AS total_weight
     FROM systems s
     LEFT JOIN components c ON c.system_id = s.id
     WHERE s.slug = $1 AND s.status = 'active'
     GROUP BY s.id`,
    [slug]
  );
  return (res.rows[0] as SystemRecord | undefined) ?? null;
}

export async function listSystemsWithProgress(userId: string) {
  const res = await query(
    `SELECT s.slug, s.title, s.category,
            s.manifest->'completion' AS completion,
            s.manifest->'map'->'colors' AS colors,
            count(c.id) FILTER (WHERE c.role = 'leaf')::int AS total_count,
            COALESCE(p.completed_count, 0)::int AS completed_count,
            COALESCE(p.completed_weight, 0)::float AS completed_weight,
            COALESCE(sum(c.weight) FILTER (WHERE c.role = 'leaf'), 0)::float AS total_weight,
            COALESCE(p.pct, 0)::float AS pct
     FROM systems s
     LEFT JOIN components c ON c.system_id = s.id
     LEFT JOIN user_system_progress p ON p.system_id = s.id AND p.user_id = $1
     WHERE s.status = 'active'
     GROUP BY s.id, p.completed_count, p.completed_weight, p.pct
     ORDER BY s.category, s.slug`,
    [userId]
  );
  return res.rows;
}

export async function getUserSystemProgress(userId: string, systemId: number) {
  const res = await query(
    `SELECT completed_count::int, total_count::int,
            completed_weight::float, total_weight::float, pct::float
     FROM user_system_progress WHERE user_id = $1 AND system_id = $2`,
    [userId, systemId]
  );
  return res.rows[0] ?? null;
}

export async function getSystemContent(systemId: number, tab: string) {
  const res = await query(
    `SELECT tab, block_order, kind, body, source, review_status
     FROM content_blocks
     WHERE subject_type = 'system' AND subject_id = $1 AND tab = $2
     ORDER BY block_order`,
    [systemId, tab]
  );
  return res.rows;
}
