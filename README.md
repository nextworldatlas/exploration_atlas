# Next World Atlas

A **Life Atlas**: you don't collect places you've visited — you progressively
experience and learn how the world is organized, through structured real-world
systems (interstates, national parks, countries, states, and eventually metros,
peaks, airlines…).

Built from `next-world-atlas-build-spec.md`. Four systems ship at MVP, chosen
to prove the generic engine across shapes:

| System | Shape | Completion rule |
|---|---|---|
| US Interstate Highways | line | **weighted** — % of interstate miles driven (mainline freeways, one trackable unit per route, labeled on the map) |
| US National Parks | polygon | count (the 63) |
| Countries of the World | polygon | count — composition tree mirrors the GeoVision/Vision Atlas hierarchy: continent → region → country (`data-plane/seed/vision-atlas-regions.csv`); multi-region federations sit directly under their continent |
| US States | polygon | count (the 50) |

**No system-specific code exists anywhere in the app.** A system is a manifest
row (`data-plane/manifests/*.json`) plus imported data. Adding a fifth system
requires zero migrations and zero new components.

## Architecture

Three planes, kept separate (spec §1):

- **Serving** — Next.js App Router. Server Components read Postgres; client
  islands (MapLibre map, checklists) talk to REST route handlers under
  `src/app/api`. Anonymous cookie identity (`src/middleware.ts`); experiences
  are keyed by UUID so real auth can land later without schema changes.
- **Storage** — Postgres + PostGIS (`db/migrations`), object storage stand-in:
  `public/tiles/*.pmtiles`.
- **Data plane** — `data-plane/`: importers, tile builds, content jobs. Runs
  offline, **never in a request path**.

### The core abstraction (spec §2)

- `places` — shared geographic graph; `places.parent_id` is *geographic*
  containment (park ⊂ state ⊂ country). `place_closure` caches subtree queries.
- `systems` — a manifest (validated by `src/lib/manifest.ts` before insert).
- `components` — `(system, place)` membership; `container_component_id` is the
  *system-composition* tree for multi-level systems. The two hierarchies are
  deliberately separate. Leaves carry a `display_order` ranked descending by
  size/length at import.
- `experiences` — the user's marks. Source of truth. `user_system_progress` is
  a derived cache (`npm run rebuild:progress` rebuilds it from scratch).

### The map (spec §5)

Per system: PostGIS → GeoJSON → vector tiles (geojson-vt + vt-pbf → MBTiles →
`go-pmtiles convert`) → `public/tiles/{slug}.pmtiles`. **Every tile feature's
id is its `component_id`** — the personal overlay fetches the user's completed
ids (`/api/systems/:slug/mine`) and recolors via `map.setFeatureState`. No
per-user tiles, ever. Hovering any feature shows a name tooltip; clicking
opens the mark-complete popup. `/explore` adds Country / Continent / Globe
viewport presets above the per-system layer toggles. In production with tippecanoe available:
`tippecanoe -o {slug}.pmtiles -l components --use-attribute-for-id=…` is the
equivalent build; the Node pipeline exists so the whole build runs anywhere.

## Getting started

Requires Node 20.11+ and a PostGIS 3.x database.

```bash
npm install
npm run db:start          # portable dev cluster in .dev/ (see below), port 5433
npm run db:migrate        # schema
npm run seed:systems      # validate + upsert manifests
npm run seed:badges
npm run import:countries  # Natural Earth admin-0 + admin-1 (also US states)
npm run import:parks      # NPS boundaries for the 63 parks
npm run import:interstates# NE 10m roads → mainline route × state segments
npm run tiles:build       # all systems → public/tiles/*.pmtiles
npm run content:stubs     # editorial + stub Learn blocks
npm run content:facts     # Wikidata SPARQL → facts + factlist blocks
npm run dev               # http://localhost:3000
```

### The dev database

`.dev/` holds a portable PostgreSQL 17 + PostGIS 3.6 (no admin install, data in
`.dev/pgdata`, port 5433). It is not committed. To recreate it on another
machine: unzip the EDB "binaries" archive for PostgreSQL 17 into `.dev/pg`,
unzip the OSGeo PostGIS bundle over it, then
`.dev/pg/bin/initdb -D .dev/pgdata -U postgres -A trust` and `npm run db:start`.
Or point `DATABASE_URL` at any PostGIS database and skip all of that.
`go-pmtiles` lives at `.dev/bin/go-pmtiles/pmtiles.exe` (or on PATH).

## Data plane commands

| Command | What it does |
|---|---|
| `npm run import:*` | Idempotent importers, keyed on stable external ids (ISO codes, NPS unit codes, route numbers). Re-running updates, never duplicates. The interstates importer also prunes out-of-scope data (3-digit spurs, legacy per-state segments). |
| `npm run tiles:build [slug]` | Rebuild PMTiles for one or all systems. |
| `npm run content:stubs` | Ensure every (system, learn-tab) has content; unwritten tabs get an explicit `stub` block. |
| `npm run content:facts` | Batched Wikidata SPARQL → `facts` table + deterministic factlist blocks. |
| `npm run rebuild:progress` | Rebuild all `user_system_progress` from `experiences` (progress is derived, never authoritative). |
| `npm run rebuild:closure` | Rebuild `place_closure` from `places.parent_id`. |

LLM-drafted prose plugs in as another offline job writing `content_blocks`
rows with `source='llm', review_status='draft'`; the Learn renderer already
distinguishes `stub` / `draft` / `reviewed`.

## Adding a system (the whole point)

1. Write `data-plane/manifests/<slug>.json` — hierarchy, completion rule,
   learn tabs, map layers. `npm run seed:systems` validates it (invalid
   manifests cannot enter the DB).
2. Write an importer that upserts `places` + `components` keyed on external
   ids (helpers in `data-plane/importers/lib.ts`).
3. `npm run tiles:build <slug>`, `npm run content:stubs`.

No migrations. No app code. If you're tempted to branch on
`slug === 'my-system'` anywhere in `src/`, stop and put it in the manifest.

## Guardrails (spec §12)

- Never write per-system logic in application code.
- `places.parent_id` (geographic) and `components.container_component_id`
  (system composition) stay separate.
- PMTiles feature id = `component_id`, always.
- Content and geometry generation are offline — no Wikidata/LLM/tile work in
  request handlers.
- Importers are idempotent, keyed on `external_ids`.
- `experiences` is authoritative; progress is a rebuildable cache.
- Every manifest passes the validator before insert.
- A new system must require zero migrations.

## Roadmap state

- **Phase 0 & 1 — done.** Generic engine end-to-end for all four systems:
  import → tiles → map with personal overlay → self-reported completion →
  per-system Overview / Map / Learn / Progress.
- **Phase 2 — done at MVP depth.** Wikidata facts + editorial/stub Learn tabs,
  badge engine (count / weight / set / first rules as data), nearby-missing
  discovery (PostGIS KNN), search.
- **Phase 3 — done at MVP depth.** `/me` cross-system dashboard, wishlist,
  finish-what-you-started suggestions.
- **v2+** — friends/comparison, imports & verification (flight history, GPS),
  point systems (airports, peaks), finer interstate segmentation (by state or
  exit — the schema already supports it via `container_component_id`),
  ISO-3166-2 worldwide.
