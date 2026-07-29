import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";

// GET /api/discover?near=lng,lat&limit= → nearby MISSING leaf components
// across all systems, ordered by centroid KNN (GiST <->). Optional ?bbox=.
export async function GET(req: NextRequest) {
  const userId = await getUserId();
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") ?? 20), 100);

  const near = String(sp.get("near") ?? "").split(",").map(Number);
  const hasNear = near.length === 2 && near.every(Number.isFinite);

  const args: unknown[] = [userId];
  let orderBy = "p.name";
  let bboxWhere = "";
  if (hasNear) {
    args.push(near[0], near[1]);
    orderBy = `p.centroid <-> ST_SetSRID(ST_MakePoint($2, $3), 4326)`;
  }
  if (sp.get("bbox")) {
    const [w, s, e, n] = String(sp.get("bbox")).split(",").map(Number);
    if ([w, s, e, n].every(Number.isFinite)) {
      args.push(w, s, e, n);
      bboxWhere = `AND p.centroid && ST_MakeEnvelope($${args.length - 3}, $${args.length - 2}, $${args.length - 1}, $${args.length}, 4326)`;
    }
  }
  args.push(limit);

  const res = await query(
    `SELECT c.id, p.name, p.kind, s.slug AS system_slug, s.title AS system_title,
            c.weight, c.attrs, ST_AsGeoJSON(p.centroid) AS centroid
            ${hasNear ? `, round((ST_DistanceSphere(p.centroid, ST_SetSRID(ST_MakePoint($2, $3), 4326)) / 1609.344)::numeric, 1) AS miles_away` : ""}
     FROM components c
     JOIN systems s ON s.id = c.system_id AND s.status = 'active'
     JOIN places p ON p.id = c.place_id
     WHERE c.role = 'leaf' AND p.centroid IS NOT NULL ${bboxWhere}
       AND NOT EXISTS (
         SELECT 1 FROM experiences e WHERE e.component_id = c.id AND e.user_id = $1
       )
     ORDER BY ${orderBy}
     LIMIT $${args.length}`,
    args
  );
  return NextResponse.json({ components: res.rows });
}
