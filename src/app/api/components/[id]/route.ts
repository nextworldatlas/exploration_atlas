import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/components/:id → detail + facts + component content blocks
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const userId = await getUserId();
  const res = await query(
    `SELECT c.id, c.role, c.weight, c.attrs, s.slug AS system_slug, s.title AS system_title,
            p.id AS place_id, p.name, p.slug AS place_slug, p.kind,
            ST_AsGeoJSON(p.centroid) AS centroid,
            cp.slug AS container_slug, cp.name AS container_name,
            (e.id IS NOT NULL) AS done, e.experienced_on, e.note,
            (w.user_id IS NOT NULL) AS wishlisted
     FROM components c
     JOIN systems s ON s.id = c.system_id
     JOIN places p ON p.id = c.place_id
     LEFT JOIN components cc ON cc.id = c.container_component_id
     LEFT JOIN places cp ON cp.id = cc.place_id
     LEFT JOIN experiences e ON e.component_id = c.id AND e.user_id = $2
     LEFT JOIN wishlist w ON w.component_id = c.id AND w.user_id = $2
     WHERE c.id = $1`,
    [id, userId]
  );
  if (!res.rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  const facts = await query(
    `SELECT key, value, source FROM facts WHERE subject_type = 'component' AND subject_id = $1`,
    [id]
  );
  const blocks = await query(
    `SELECT tab, block_order, kind, body, source, review_status
     FROM content_blocks
     WHERE subject_type = 'component' AND subject_id = $1
     ORDER BY tab, block_order`,
    [id]
  );
  return NextResponse.json({ ...res.rows[0], facts: facts.rows, blocks: blocks.rows });
}
