# Next World Atlas — working notes for Claude

README.md is the source of truth for architecture, setup, the design system,
and deployment. This file holds the rules and gotchas that are easy to trip on.

## Rules (from the build spec — non-negotiable)

- **No per-system logic in app code.** Never branch on a system slug. If a
  system needs different behaviour, add a manifest field.
- **Manifests describe shape; the theme owns colour.** Map completion colours
  and label halos live in `DEFAULT_MAP_COLORS` / `LABEL_HALO`, not in
  manifests. Missing = line blue, done = marker orange, wishlist = dimension cyan.
- **Two hierarchies stay separate:** `places.parent_id` is geographic;
  `components.container_component_id` is system composition.
- **PMTiles feature id = `component_id`**, always. The personal overlay
  recolours by feature-state on that id.
- **Importers are idempotent**, keyed on `places.external_ids`.
- **`experiences` is authoritative**; `user_system_progress` is a rebuildable
  cache (`npm run rebuild:progress`).
- **Data plane never runs in a request path** — no importer, Wikidata, or tile
  work inside a route handler.

## Product decisions the user made

- Interstates: **mainline (1–2 digit) routes only, one leaf per whole freeway**
  (not split by state), weighted by miles, labelled on the map.
- Every checklist is ordered **largest first** (area or length), set at import.
- Countries mirror the user's **Vision Atlas hierarchy**: continent →
  world region → country, from `data-plane/seed/vision-atlas-regions.csv`.
  Countries the CSV spreads over several regions sit directly under their continent.
- Visual design follows the **Blueprint · Field Survey** style guide (README → Design).

## Gotchas

- **Never run `next build` while `next dev` is running** — it overwrites
  `.next` and the dev server starts failing with `Cannot find module './NNN.js'`.
  Fix: stop dev, delete `.next`, restart.
- **Blank map during automated verification is usually not a bug.** Hidden or
  backgrounded tabs pause `requestAnimationFrame`, so MapLibre never renders
  or requests tiles. Route rAF through `setTimeout` or use a visible window.
- **Production database is Supabase** (reached via its pooler). Do not point
  local development at it — it holds real user accounts and progress.
- **Pending:** production `systems.manifest` rows still carry obsolete
  `map.colors` and a white `text-halo-color`. Harmless (the code ignores them)
  but re-run `npm run seed:systems` against production to clean them up.
- Hostinger-specific deploy gotchas (env var `%` escaping, ignored Range
  requests) are in README → Deployment.
