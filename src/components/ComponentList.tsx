"use client";

// Generic leaf list with mark-complete checkboxes. Groups by the composition
// tree when the system has one — up to two levels (continent → region for
// countries); systems without containers render flat.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMine, useToggleExperience, useToggleWishlist } from "@/lib/clientApi";
import type { ComponentRow, EarnedBadgeToast } from "@/lib/types";

export default function ComponentList({
  slug,
  weightUnit,
}: {
  slug: string;
  weightUnit?: string;
}) {
  const [q, setQ] = useState("");
  const [toast, setToast] = useState<EarnedBadgeToast[] | null>(null);
  const { data } = useQuery<{ components: ComponentRow[] }>({
    queryKey: ["components", slug, q],
    queryFn: async () =>
      (
        await fetch(
          `/api/systems/${slug}/components?limit=500${q ? `&q=${encodeURIComponent(q)}` : ""}`
        )
      ).json(),
  });
  const { data: mine } = useMine(slug);
  const toggle = useToggleExperience(slug, (b) => {
    setToast(b);
    setTimeout(() => setToast(null), 5000);
  });
  const wish = useToggleWishlist(slug);

  if (!data) return <p className="muted">Loading components…</p>;

  // Up to two grouping levels from the composition tree:
  //   container_group (e.g. continent) → container_name (e.g. region) → rows.
  // A container without a 'group' attr IS the top level (federations sit
  // directly under their continent); no container at all means a flat list.
  const rows = data.components;
  const sections = new Map<string, Map<string, ComponentRow[]>>();
  for (const row of rows) {
    const top = row.container_group ?? row.container_name ?? "";
    const sub = row.container_group ? (row.container_name ?? "") : "";
    if (!sections.has(top)) sections.set(top, new Map());
    const subs = sections.get(top)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(row);
  }

  return (
    <div>
      <input
        type="search"
        placeholder="Filter by name…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ width: "100%", maxWidth: 360 }}
      />
      <div className="row-list">
        {[...sections.entries()].map(([section, subs]) => {
          const sectionRows = [...subs.values()].flat();
          return (
            <div key={section || "_root"}>
              {section && (
                <div className="row section-header">
                  {section}
                  <span className="muted small">
                    {sectionRows.filter((i) => isDone(i, mine?.completed)).length}/
                    {sectionRows.length}
                  </span>
                </div>
              )}
              {[...subs.entries()].map(([sub, items]) => (
                <div key={sub || "_direct"}>
                  {sub && (
                    <div className="row" style={{ background: "var(--bg-hover)", fontWeight: 700 }}>
                      {sub}
                      <span className="muted small">
                        {items.filter((i) => isDone(i, mine?.completed)).length}/{items.length}
                      </span>
                    </div>
                  )}
                  {items.map((row) => {
              const done = isDone(row, mine?.completed);
              const wishlisted = mine?.wishlist.includes(Number(row.id)) ?? row.wishlisted;
              return (
                <div className="row" key={row.id}>
                  <button
                    className={`check ${done ? "on" : ""}`}
                    aria-label={done ? "Unmark" : "Mark completed"}
                    onClick={() => toggle.mutate({ id: Number(row.id), done })}
                  >
                    ✓
                  </button>
                  <span className="grow">{row.name}</span>
                  {weightUnit && (
                    <span className="muted small">
                      {Number(row.weight).toLocaleString()} {weightUnit}
                    </span>
                  )}
                  <button
                    className="check"
                    style={wishlisted ? { color: "var(--warn)", borderColor: "var(--warn)" } : {}}
                    aria-label="Toggle wishlist"
                    onClick={() => wish.mutate({ id: Number(row.id), wishlisted })}
                  >
                    ★
                  </button>
                </div>
              );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
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

function isDone(row: ComponentRow, completed?: number[]) {
  return completed ? completed.includes(Number(row.id)) : row.done;
}
