// Global map: every active system as a toggleable layer, with viewport
// presets (Country / Continent / Globe).
import { query } from "@/lib/db";
import SystemMap from "@/components/SystemMap";
import type { MapSystem } from "@/lib/types";

export const dynamic = "force-dynamic";

const SCOPES: { label: string; center: [number, number]; zoom: number }[] = [
  { label: "United States", center: [-96.5, 39.5], zoom: 3.6 },
  { label: "North America", center: [-100, 45], zoom: 2.5 },
  { label: "Globe", center: [10, 25], zoom: 1.3 },
];

export default async function ExplorePage() {
  const res = await query(
    `SELECT slug, title, manifest->'map' AS map FROM systems WHERE status = 'active' ORDER BY slug`
  );
  const systems = res.rows as unknown as MapSystem[];
  return <SystemMap systems={systems} scopes={SCOPES} />;
}
