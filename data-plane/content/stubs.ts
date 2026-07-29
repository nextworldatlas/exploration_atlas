// Content pipeline, step 0: every (system, learnTab) gets at least one block.
// Editorial copy below is source='editorial', review_status='reviewed'; any
// tab without content receives an explicit review_status='stub' block so the
// Learn renderer shows a clean "coming soon" instead of a blank. A system
// launch is never blocked on content.
import { pool } from "../lib/db";
import type { SystemManifest } from "../../src/lib/manifest";

// Hand-written overview/history copy for the MVP systems. LLM-drafted prose
// (source='llm', review_status='draft') plugs into the same table offline;
// the request path only ever reads content_blocks.
const EDITORIAL: Record<string, Partial<Record<string, string[]>>> = {
  "us-interstates": {
    overview: [
      "The Dwight D. Eisenhower National System of Interstate and Defense Highways is the largest public works project in history: roughly 48,000 miles of controlled-access highway knitting the continental United States into a single drivable network.",
      "This atlas tracks it the way road-trippers experience it — route by route, state by state. Each segment you mark is real mileage: complete I-90 in Washington and you've banked about 300 miles of the system. Progress here is measured in miles driven, not checkboxes.",
    ],
    history: [
      "Authorized by the Federal-Aid Highway Act of 1956 under President Eisenhower, the system was inspired in part by the 1919 Army convoy that took 62 days to cross the country, and by the German autobahn network Eisenhower saw during World War II.",
      "Even-numbered routes run east–west (I-10 south, I-90 north); odd-numbered routes run north–south (I-5 west, I-95 east). Three-digit interstates are spurs (odd first digit) or loops (even first digit) of their parent route.",
    ],
    engineering: [
      "Interstate design standards are national: full control of access, minimum 12-foot lanes, 10-foot right shoulders, and design speeds of 50–70 mph. Every bridge over an interstate must clear 16 feet — a defense requirement, so military transporters can pass beneath.",
    ],
  },
  "national-parks": {
    overview: [
      "Sixty-three areas of the United States carry the full 'National Park' designation — a list that runs from the coral reefs of American Samoa to the arctic valleys of Gates of the Arctic, and from the 0.09-square-mile Gateway Arch to Wrangell–St. Elias, larger than Switzerland.",
      "Marking a park here means you've set foot in it. The map shows real congressional boundaries; the Learn tabs cover the geology, ecology, and history that make each park worth the drive.",
    ],
    history: [
      "Yellowstone became the world's first national park in 1872, 'dedicated and set apart as a public park or pleasuring-ground for the benefit and enjoyment of the people.' The National Park Service followed in 1916 under the Organic Act, with its famous dual mandate: conserve the scenery and leave it unimpaired, while providing for its enjoyment.",
    ],
  },
  countries: {
    overview: [
      "The world's political map counts just under 200 sovereign states — plus dependencies, territories, and places whose status is a good dinner-table argument. This system tracks them all as one life list.",
      "Marking a country means you've been there. As your map fills in, cross-system queries start to pay off: the atlas knows which national parks, highways, and metros sit inside the countries you've visited.",
    ],
    geography: [
      "Countries here follow Natural Earth's admin-0 boundaries, the de facto cartographic standard for world maps. Boundaries are shown as commonly recognized; disputed territories follow Natural Earth's point of view of the map's primary audience.",
    ],
  },
  "us-states": {
    overview: [
      "Fifty states, from Delaware (first to ratify, 1787) to Hawaii (fiftieth, 1959). 'All fifty' is the classic American travel list — and the backbone of this atlas, since parks, interstates, and nearly everything else hang geographically off the states.",
    ],
    history: [
      "The union grew in waves: the original thirteen colonies, the Louisiana Purchase states, the Mexican Cession, and finally Alaska and Hawaii in 1959. Each state's shape tells a story — straight survey lines in the West, rivers and watersheds in the East.",
    ],
  },
};

async function main() {
  const systems = await pool.query(`SELECT id, slug, manifest FROM systems WHERE status = 'active'`);
  let editorial = 0;
  let stubs = 0;

  for (const sys of systems.rows) {
    const manifest = sys.manifest as SystemManifest;
    for (const tab of manifest.learnTabs) {
      const paragraphs = EDITORIAL[sys.slug]?.[tab];
      if (paragraphs) {
        // Idempotent: replace this tab's editorial blocks wholesale.
        await pool.query(
          `DELETE FROM content_blocks
           WHERE subject_type = 'system' AND subject_id = $1 AND tab = $2 AND source = 'editorial'`,
          [sys.id, tab]
        );
        for (const [i, text] of paragraphs.entries()) {
          await pool.query(
            `INSERT INTO content_blocks (subject_type, subject_id, tab, block_order, kind, body, source, review_status)
             VALUES ('system', $1, $2, $3, 'prose', $4::jsonb, 'editorial', 'reviewed')`,
            [sys.id, tab, i, JSON.stringify({ text })]
          );
          editorial++;
        }
      }
      const existing = await pool.query(
        `SELECT 1 FROM content_blocks
         WHERE subject_type = 'system' AND subject_id = $1 AND tab = $2
           AND review_status <> 'stub'
         LIMIT 1`,
        [sys.id, tab]
      );
      if (!existing.rowCount) {
        await pool.query(
          `INSERT INTO content_blocks (subject_type, subject_id, tab, block_order, kind, body, source, review_status)
           SELECT 'system', $1, $2, 0, 'prose', $3::jsonb, NULL, 'stub'
           WHERE NOT EXISTS (
             SELECT 1 FROM content_blocks
             WHERE subject_type = 'system' AND subject_id = $1 AND tab = $2
           )`,
          [
            sys.id,
            tab,
            JSON.stringify({
              text: `The ${tab} chapter for this system hasn't been written yet.`,
            }),
          ]
        );
        stubs++;
      }
    }
  }
  console.log(`content: ${editorial} editorial blocks, ${stubs} stub tabs ensured`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
