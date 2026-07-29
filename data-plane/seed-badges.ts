// Badges are data: one row per badge, evaluated by the generic engine in
// src/lib/badges.ts. New badge = new row here. Idempotent on slug.
import { pool } from "./lib/db";
import type { BadgeRule } from "../src/lib/badges";

interface BadgeSeed {
  slug: string;
  title: string;
  description: string;
  icon: string;
  rule: BadgeRule;
}

const BADGES: BadgeSeed[] = [
  // — US Interstates —
  {
    slug: "interstate-first",
    title: "On-Ramp",
    description: "Drive your first interstate segment.",
    icon: "🛣️",
    rule: { type: "first", system: "us-interstates" },
  },
  {
    slug: "interstate-1000mi",
    title: "Road Warrior",
    description: "Drive 1,000 miles of the Interstate Highway System.",
    icon: "🚗",
    rule: { type: "weight", system: "us-interstates", gte: 1000 },
  },
  {
    slug: "interstate-coast-to-coast",
    title: "Coast to Coast",
    description: "Complete a transcontinental interstate end to end (I-10, I-40, I-70, I-80, or I-90).",
    icon: "🌉",
    rule: {
      type: "set",
      system: "us-interstates",
      scope: "container",
      anyOf: ["i-10", "i-40", "i-70", "i-80", "i-90"],
    },
  },
  // — National Parks —
  {
    slug: "parks-first",
    title: "First Trailhead",
    description: "Visit your first national park.",
    icon: "🥾",
    rule: { type: "first", system: "national-parks" },
  },
  {
    slug: "parks-10",
    title: "Junior Ranger",
    description: "Visit 10 national parks.",
    icon: "🏞️",
    rule: { type: "count", system: "national-parks", gte: 10 },
  },
  {
    slug: "parks-all",
    title: "The Sixty-Three",
    description: "Visit every US national park.",
    icon: "🐻",
    rule: { type: "set", system: "national-parks", scope: "system" },
  },
  // — Countries —
  {
    slug: "countries-first",
    title: "Passport Stamped",
    description: "Visit your first country.",
    icon: "🛂",
    rule: { type: "first", system: "countries" },
  },
  {
    slug: "countries-10",
    title: "Globetrotter",
    description: "Visit 10 countries.",
    icon: "✈️",
    rule: { type: "count", system: "countries", gte: 10 },
  },
  {
    slug: "countries-25",
    title: "World Wanderer",
    description: "Visit 25 countries.",
    icon: "🧭",
    rule: { type: "count", system: "countries", gte: 25 },
  },
  {
    slug: "countries-50",
    title: "Century Club Half",
    description: "Visit 50 countries.",
    icon: "🌍",
    rule: { type: "count", system: "countries", gte: 50 },
  },
  // — US States —
  {
    slug: "states-first",
    title: "Home State",
    description: "Mark your first US state.",
    icon: "📍",
    rule: { type: "first", system: "us-states" },
  },
  {
    slug: "states-10",
    title: "Regional",
    description: "Visit 10 US states.",
    icon: "🗺️",
    rule: { type: "count", system: "us-states", gte: 10 },
  },
  {
    slug: "states-25",
    title: "Halfway There",
    description: "Visit 25 US states.",
    icon: "🎯",
    rule: { type: "count", system: "us-states", gte: 25 },
  },
  {
    slug: "states-all",
    title: "All Fifty",
    description: "Visit all 50 US states.",
    icon: "🏆",
    rule: { type: "set", system: "us-states", scope: "system" },
  },
];

async function main() {
  for (const b of BADGES) {
    await pool.query(
      `INSERT INTO badges (slug, title, description, rule, icon)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (slug) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         rule = EXCLUDED.rule,
         icon = EXCLUDED.icon`,
      [b.slug, b.title, b.description, JSON.stringify(b.rule), b.icon]
    );
  }
  console.log(`seeded ${BADGES.length} badges`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
