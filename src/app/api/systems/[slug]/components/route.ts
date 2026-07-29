import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/systems/:slug/components
// Filters: ?container=<place-slug> ?mine=1 ?missing=1 ?bbox=w,s,e,n ?q=
// Paginated: ?limit= (≤500) &offset=
export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const userId = await getUserId();
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 200), 500);
  const offset = Math.max(Number(sp.get("offset") ?? 0), 0);

  const where: string[] = ["s.slug = $1", "c.role = 'leaf'"];
  const args: unknown[] = [slug, userId]; // $1 slug, $2 userId, filters appended
  if (sp.get("container")) {
    args.push(sp.get("container"));
    where.push(`cp.slug = $${args.length}`);
  }
  if (sp.get("q")) {
    args.push(`%${sp.get("q")}%`);
    where.push(`p.name ILIKE $${args.length}`);
  }
  if (sp.get("bbox")) {
    const [w, s, e, n] = String(sp.get("bbox")).split(",").map(Number);
    if ([w, s, e, n].every(Number.isFinite)) {
      args.push(w, s, e, n);
      where.push(
        `p.geom && ST_MakeEnvelope($${args.length - 3}, $${args.length - 2}, $${args.length - 1}, $${args.length}, 4326)`
      );
    }
  }
  if (sp.get("mine")) where.push(`e.id IS NOT NULL`);
  if (sp.get("missing")) where.push(`e.id IS NULL`);
  args.push(limit, offset);

  const res = await query(
    `SELECT c.id, c.role, c.weight, c.attrs, c.display_order,
            p.name, p.slug AS place_slug,
            cp.slug AS container_slug, cp.name AS container_name,
            cc.attrs->>'group' AS container_group,
            (e.id IS NOT NULL) AS done,
            e.experienced_on, e.note,
            (w.user_id IS NOT NULL) AS wishlisted
     FROM components c
     JOIN systems s ON s.id = c.system_id
     JOIN places p ON p.id = c.place_id
     LEFT JOIN components cc ON cc.id = c.container_component_id
     LEFT JOIN places cp ON cp.id = cc.place_id
     LEFT JOIN experiences e ON e.component_id = c.id AND e.user_id = $2
     LEFT JOIN wishlist w ON w.component_id = c.id AND w.user_id = $2
     WHERE ${where.join(" AND ")}
     ORDER BY cp.slug NULLS FIRST, c.display_order NULLS LAST, p.name
     LIMIT $${args.length - 1} OFFSET $${args.length}`,
    args
  );
  return NextResponse.json({ components: res.rows, limit, offset });
}
