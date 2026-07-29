"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

interface SearchResult {
  systems: { slug: string; title: string }[];
  components: { id: number; name: string; system_slug: string; system_title: string; done: boolean }[];
}

export default function SearchBox() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const { data } = useQuery<SearchResult>({
    queryKey: ["search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async () => (await fetch(`/api/search?q=${encodeURIComponent(debounced)}`)).json(),
  });

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        type="search"
        placeholder="Search places…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        style={{ width: 220 }}
      />
      {open && data && (data.systems.length > 0 || data.components.length > 0) && (
        <div
          className="map-panel"
          style={{ position: "absolute", top: "110%", right: 0, left: "auto", width: 300 }}
        >
          {data.systems.map((s) => (
            <Link
              key={s.slug}
              href={`/s/${s.slug}`}
              style={{ display: "block", padding: "0.3rem 0" }}
              onClick={() => setOpen(false)}
            >
              🗂 {s.title}
            </Link>
          ))}
          {data.components.map((c) => (
            <Link
              key={c.id}
              href={`/s/${c.system_slug}/map?focus=${c.id}`}
              style={{ display: "block", padding: "0.3rem 0" }}
              onClick={() => setOpen(false)}
            >
              {c.done ? "✅" : "⬜"} {c.name}{" "}
              <span className="muted small">{c.system_title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
