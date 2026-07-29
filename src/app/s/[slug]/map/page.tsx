// System map: static PMTiles + the user's feature-state overlay.
// ?focus=<componentId> flies to that component (search / discover deep links).
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getSystem } from "@/lib/queries";
import SystemMap from "@/components/SystemMap";

export const dynamic = "force-dynamic";

export default async function SystemMapPage(ctx: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const { slug } = await ctx.params;
  const { focus } = await ctx.searchParams;
  const system = await getSystem(slug);
  if (!system) notFound();

  let focusPoint: { lng: number; lat: number; zoom?: number } | null = null;
  if (focus && /^\d+$/.test(focus)) {
    const res = await query(
      `SELECT ST_X(p.centroid) AS lng, ST_Y(p.centroid) AS lat
       FROM components c JOIN places p ON p.id = c.place_id
       WHERE c.id = $1 AND c.system_id = $2`,
      [focus, system.id]
    );
    if (res.rows[0]) {
      focusPoint = { lng: res.rows[0].lng, lat: res.rows[0].lat, zoom: 6 };
    }
  }

  return (
    <SystemMap
      systems={[{ slug: system.slug, title: system.title, map: system.manifest.map }]}
      focus={focusPoint}
    />
  );
}
