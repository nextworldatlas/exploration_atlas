"use client";

// The one map component every system shares (spec §5). Static PMTiles carry
// geometry for all users; the personal overlay is pure feature-state recolor:
//   fetch completed component ids → map.setFeatureState({id}, {done:true})
//   paint = ["case", ["feature-state","done"], doneColor, missingColor]
// Feature id in the tiles IS the component id — that is the hinge.
import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { Protocol } from "pmtiles";
import { useMine, useToggleExperience, useToggleWishlist } from "@/lib/clientApi";
import { DEFAULT_MAP_COLORS } from "@/lib/manifest";
import type { EarnedBadgeToast, MapSystem } from "@/lib/types";

let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol("pmtiles", protocol.tile);
  protocolRegistered = true;
}

const BASEMAP = "https://tiles.openfreemap.org/styles/positron";

interface Selected {
  system: MapSystem;
  id: number;
  name: string;
}

interface HoverInfo {
  x: number;
  y: number;
  name: string;
  systemTitle: string;
  done: boolean;
}

function colorExpression(colors: NonNullable<MapSystem["map"]["colors"]>) {
  return [
    "case",
    ["boolean", ["feature-state", "done"], false],
    colors.done,
    ["boolean", ["feature-state", "wishlist"], false],
    colors.wishlist ?? DEFAULT_MAP_COLORS.wishlist,
    colors.missing,
  ];
}

const COLOR_PROP: Record<string, string> = {
  line: "line-color",
  fill: "fill-color",
  circle: "circle-color",
  symbol: "text-color", // labels recolor with completion state too
};

export interface MapScope {
  label: string;
  center: [number, number];
  zoom: number;
}

// One system's overlay: adds source+layers, syncs feature-state from /mine.
function SystemOverlay({
  map,
  system,
  visible,
  onSelect,
  onHover,
}: {
  map: maplibregl.Map;
  system: MapSystem;
  visible: boolean;
  onSelect: (sel: Selected) => void;
  onHover: (info: HoverInfo | null) => void;
}) {
  const { data: mine } = useMine(system.slug);
  const applied = useRef<Set<number>>(new Set());
  // hover handlers are bound once per system; read completion through a ref
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const layerIds = useMemo(
    () => system.map.layers.map((_, i) => `${system.slug}-${i}`),
    [system]
  );

  // source + layers
  useEffect(() => {
    const colors = system.map.colors ?? DEFAULT_MAP_COLORS;
    if (!map.getSource(system.slug)) {
      map.addSource(system.slug, {
        type: "vector",
        url: `pmtiles://${window.location.origin}${system.map.pmtilesUrl}`,
      });
    }
    for (const [i, layer] of system.map.layers.entries()) {
      const id = layerIds[i];
      if (map.getLayer(id)) continue;
      map.addLayer({
        id,
        type: layer.type,
        source: system.slug,
        "source-layer": system.map.sourceLayer,
        ...(layer.minzoom !== undefined ? { minzoom: layer.minzoom } : {}),
        ...(layer.maxzoom !== undefined ? { maxzoom: layer.maxzoom } : {}),
        paint: {
          ...(layer.paint as Record<string, unknown>),
          [COLOR_PROP[layer.type]]: colorExpression(colors),
        },
        layout: (layer.layout as Record<string, unknown>) ?? {},
      } as never);
    }
    const clickable = layerIds[0];
    const onClick = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (f?.id !== undefined) {
        onSelect({
          system,
          id: Number(f.id),
          name: String(f.properties?.name ?? "Unknown"),
        });
      }
    };
    const enter = () => (map.getCanvas().style.cursor = "pointer");
    const move = (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      const f = e.features?.[0];
      if (f?.id === undefined) return;
      onHover({
        x: e.point.x,
        y: e.point.y,
        name: String(f.properties?.name ?? "Unknown"),
        systemTitle: system.title,
        done: mineRef.current?.completed.includes(Number(f.id)) ?? false,
      });
    };
    const leave = () => {
      map.getCanvas().style.cursor = "";
      onHover(null);
    };
    map.on("click", clickable, onClick);
    map.on("mouseenter", clickable, enter);
    map.on("mousemove", clickable, move);
    map.on("mouseleave", clickable, leave);
    return () => {
      map.off("click", clickable, onClick);
      map.off("mouseenter", clickable, enter);
      map.off("mousemove", clickable, move);
      map.off("mouseleave", clickable, leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, system]);

  // visibility toggle
  useEffect(() => {
    for (const id of layerIds) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
      }
    }
  }, [map, layerIds, visible]);

  // personal overlay via feature-state
  useEffect(() => {
    if (!mine) return;
    const sync = () => {
      const next = new Map<number, { done?: boolean; wishlist?: boolean }>();
      for (const id of mine.completed) next.set(id, { done: true });
      for (const id of mine.wishlist) next.set(id, { ...next.get(id), wishlist: true });
      for (const id of applied.current) {
        if (!next.has(id)) {
          map.removeFeatureState(
            { source: system.slug, sourceLayer: system.map.sourceLayer, id },
            undefined as never
          );
        }
      }
      for (const [id, state] of next) {
        map.setFeatureState(
          { source: system.slug, sourceLayer: system.map.sourceLayer, id },
          { done: false, wishlist: false, ...state }
        );
      }
      applied.current = new Set(next.keys());
    };
    if (map.isSourceLoaded(system.slug)) sync();
    // re-apply whenever tiles (re)load — feature-state survives, but the
    // source may not have existed yet on first data arrival
    map.on("sourcedata", sync);
    return () => {
      map.off("sourcedata", sync);
    };
  }, [map, mine, system]);

  return null;
}

export default function SystemMap({
  systems,
  focus,
  height,
  scopes,
}: {
  systems: MapSystem[];
  focus?: { lng: number; lat: number; zoom?: number } | null;
  height?: string;
  // Optional viewport presets (e.g. Country / Continent / Globe on /explore).
  // The first entry is the initial view.
  scopes?: MapScope[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [visible, setVisible] = useState<Record<string, boolean>>(
    Object.fromEntries(systems.map((s) => [s.slug, true]))
  );
  const [selected, setSelected] = useState<Selected | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [toast, setToast] = useState<EarnedBadgeToast[] | null>(null);

  const first = systems[0];
  useEffect(() => {
    if (!containerRef.current) return;
    ensurePmtilesProtocol();
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: focus
        ? [focus.lng, focus.lat]
        : scopes?.[0]?.center ?? (first?.map.center as [number, number]) ?? [-40, 30],
      zoom: focus?.zoom ?? scopes?.[0]?.zoom ?? first?.map.zoom ?? 2,
      attributionControl: { compact: true },
    });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    // MapLibre reports tile/source failures through 'error' events rather than
    // throwing; surface them so a broken layer is diagnosable in the browser.
    m.on("error", (e) => {
      const w = window as unknown as { __mapErrors?: string[] };
      (w.__mapErrors ??= []).push(String(e.error?.message ?? e.error ?? e));
      console.error("[map]", e.error ?? e);
    });
    (window as unknown as { __map?: maplibregl.Map }).__map = m;
    m.on("load", () => setMap(m));
    return () => {
      setMap(null);
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (map && focus) {
      map.flyTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 6 });
    }
  }, [map, focus]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="map-shell" style={height ? { height } : undefined}>
      <div ref={containerRef} className="map-container" />
      {map &&
        systems.map((s) => (
          <SystemOverlay
            key={s.slug}
            map={map}
            system={s}
            visible={visible[s.slug] !== false}
            onSelect={setSelected}
            onHover={setHover}
          />
        ))}
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.name}</strong>
          {hover.done && <span style={{ color: "var(--done)" }}> ✓</span>}
          {systems.length > 1 && (
            <span className="muted"> · {hover.systemTitle}</span>
          )}
        </div>
      )}
      {(scopes?.length || systems.length > 1) && (
        <div className="map-panel">
          {scopes && scopes.length > 0 && (
            <select
              className="scope-select"
              defaultValue={scopes[0].label}
              onChange={(e) => {
                const scope = scopes.find((s) => s.label === e.target.value);
                if (scope && map) map.flyTo({ center: scope.center, zoom: scope.zoom });
              }}
            >
              {scopes.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {systems.length > 1 && (
            <>
              <strong className="small">Systems</strong>
              {systems.map((s) => (
                <label key={s.slug} style={{ display: "block", fontSize: "0.88rem", marginTop: 6 }}>
                  <input
                    type="checkbox"
                    checked={visible[s.slug] !== false}
                    onChange={(e) => setVisible((v) => ({ ...v, [s.slug]: e.target.checked }))}
                  />{" "}
                  {s.title}
                </label>
              ))}
            </>
          )}
        </div>
      )}
      {selected && (
        <MapPopup
          key={`${selected.system.slug}:${selected.id}`}
          selected={selected}
          onClose={() => setSelected(null)}
          onBadges={setToast}
        />
      )}
      {toast && (
        <div className="toast">
          {toast.map((b) => (
            <div key={b.slug}>
              <span style={{ fontSize: "1.2rem" }}>{b.icon}</span> Badge earned:{" "}
              <strong>{b.title}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MapPopup({
  selected,
  onClose,
  onBadges,
}: {
  selected: Selected;
  onClose: () => void;
  onBadges: (b: EarnedBadgeToast[]) => void;
}) {
  const slug = selected.system.slug;
  const { data: mine } = useMine(slug);
  const toggle = useToggleExperience(slug, onBadges);
  const wish = useToggleWishlist(slug);
  const done = mine?.completed.includes(selected.id) ?? false;
  const wishlisted = mine?.wishlist.includes(selected.id) ?? false;

  return (
    <div className="map-popup">
      <div style={{ fontWeight: 700 }}>{selected.name}</div>
      <div className="muted small" style={{ marginBottom: 8 }}>
        {selected.system.title}
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button
          className={`btn ${done ? "done" : ""}`}
          onClick={() => toggle.mutate({ id: selected.id, done })}
          disabled={toggle.isPending}
        >
          {done ? "✓ Completed" : "Mark completed"}
        </button>
        <button
          className="btn secondary"
          onClick={() => wish.mutate({ id: selected.id, wishlisted })}
        >
          {wishlisted ? "★ Wishlisted" : "☆ Wishlist"}
        </button>
        <button className="btn secondary" onClick={onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
