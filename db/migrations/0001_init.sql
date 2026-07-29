CREATE EXTENSION IF NOT EXISTS postgis;

-- ============ SHARED PLACE GRAPH ============
CREATE TABLE places (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind          TEXT NOT NULL,                 -- 'country','us_state','national_park','interstate','interstate_segment'
  slug          TEXT UNIQUE,
  name          TEXT NOT NULL,
  external_ids  JSONB NOT NULL DEFAULT '{}',   -- natural keys for idempotent import
  parent_id     BIGINT REFERENCES places(id),  -- GEOGRAPHIC containment
  geom          GEOMETRY(Geometry, 4326),      -- point/line/polygon; nullable for abstract nodes
  centroid      GEOMETRY(Point, 4326),
  bbox          GEOMETRY(Polygon, 4326),
  attrs         JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX places_geom_idx ON places USING GIST (geom);
CREATE INDEX places_centroid_idx ON places USING GIST (centroid);
CREATE INDEX places_kind_idx ON places (kind);
CREATE INDEX places_parent_idx ON places (parent_id);
CREATE INDEX places_external_ids_idx ON places USING GIN (external_ids);
CREATE INDEX places_fts_idx ON places USING GIN (to_tsvector('simple', name));

-- fast subtree / ancestor queries across the shared graph
CREATE TABLE place_closure (
  ancestor_id   BIGINT NOT NULL REFERENCES places(id),
  descendant_id BIGINT NOT NULL REFERENCES places(id),
  depth         INT NOT NULL,
  PRIMARY KEY (ancestor_id, descendant_id)
);
CREATE INDEX place_closure_desc_idx ON place_closure (descendant_id);

-- ============ SYSTEMS (MANIFEST-DRIVEN) ============
CREATE TABLE systems (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug       TEXT UNIQUE NOT NULL,
  title      TEXT NOT NULL,
  category   TEXT NOT NULL,          -- 'transport','nature','admin','culture'
  manifest   JSONB NOT NULL,
  status     TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ COMPONENTS (system membership + composition tree) ============
CREATE TABLE components (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  system_id              BIGINT NOT NULL REFERENCES systems(id),
  place_id               BIGINT NOT NULL REFERENCES places(id),
  container_component_id BIGINT REFERENCES components(id),   -- SYSTEM composition tree
  role                   TEXT NOT NULL DEFAULT 'leaf',       -- 'leaf' | 'container'
  weight                 NUMERIC NOT NULL DEFAULT 1,         -- e.g. segment miles
  display_order          INT,
  attrs                  JSONB NOT NULL DEFAULT '{}',
  UNIQUE (system_id, place_id)
);
CREATE INDEX components_system_idx ON components (system_id);
CREATE INDEX components_container_idx ON components (container_component_id);
CREATE INDEX components_place_idx ON components (place_id);

-- ============ USER PROGRESS ============
CREATE TABLE experiences (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        UUID NOT NULL,
  component_id   BIGINT NOT NULL REFERENCES components(id),
  type           TEXT NOT NULL DEFAULT 'completed',  -- future: 'summited','flown','lived'
  experienced_on DATE,
  note           TEXT,
  source         TEXT NOT NULL DEFAULT 'self',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, component_id, type)
);
CREATE INDEX experiences_user_component_idx ON experiences (user_id, component_id);
CREATE INDEX experiences_component_idx ON experiences (component_id);

-- denormalized rollup, updated on experience write; rebuildable cache
CREATE TABLE user_system_progress (
  user_id          UUID NOT NULL,
  system_id        BIGINT NOT NULL REFERENCES systems(id),
  completed_count  INT NOT NULL DEFAULT 0,
  total_count      INT NOT NULL DEFAULT 0,
  completed_weight NUMERIC NOT NULL DEFAULT 0,
  total_weight     NUMERIC NOT NULL DEFAULT 0,
  pct              NUMERIC NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, system_id)
);

CREATE TABLE wishlist (
  user_id      UUID NOT NULL,
  component_id BIGINT NOT NULL REFERENCES components(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, component_id)
);

-- ============ EDUCATIONAL CONTENT ============
CREATE TABLE content_blocks (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subject_type  TEXT NOT NULL,        -- 'system' | 'component'
  subject_id    BIGINT NOT NULL,
  tab           TEXT NOT NULL,        -- 'overview','history','geography','engineering','ecology','culture','facts','timeline'
  block_order   INT NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL,        -- 'prose','timeline','factlist','gallery','stat','map_embed'
  body          JSONB NOT NULL,
  locale        TEXT NOT NULL DEFAULT 'en',
  source        TEXT,                 -- 'wikidata','wikipedia','editorial','llm'
  review_status TEXT NOT NULL DEFAULT 'stub',  -- 'stub' | 'draft' | 'reviewed'
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX content_blocks_subject_idx ON content_blocks (subject_type, subject_id, tab, block_order);

CREATE TABLE facts (   -- structured Wikidata pulls, feed both Learn tabs and badges
  subject_type TEXT NOT NULL,
  subject_id   BIGINT NOT NULL,
  key          TEXT NOT NULL,        -- 'inception','area_km2','elevation_m','governing_body'
  value        JSONB NOT NULL,
  source       TEXT NOT NULL DEFAULT 'wikidata',
  PRIMARY KEY (subject_type, subject_id, key)
);

-- ============ GAMIFICATION ============
CREATE TABLE badges (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  rule        JSONB NOT NULL,        -- {"type":"count","system":"national-parks","gte":10}
  icon        TEXT
);
CREATE TABLE user_badges (
  user_id   UUID NOT NULL,
  badge_id  BIGINT NOT NULL REFERENCES badges(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);
