"use client";

// "What's near me that I haven't done?" — PostGIS KNN over centroids of
// leaves with no experience row (spec §6 discovery).
import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

interface DiscoverRow {
  id: number;
  name: string;
  kind: string;
  system_slug: string;
  system_title: string;
  miles_away?: string;
}

export default function NearbyMissing() {
  const [pos, setPos] = useState<{ lng: number; lat: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isFetching } = useQuery<{ components: DiscoverRow[] }>({
    queryKey: ["discover", pos],
    enabled: !!pos,
    queryFn: async () =>
      (await fetch(`/api/discover?near=${pos!.lng},${pos!.lat}&limit=12`)).json(),
  });

  const locate = () => {
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (p) => setPos({ lng: p.coords.longitude, lat: p.coords.latitude }),
      () => setError("Couldn't get your location.")
    );
  };

  return (
    <div>
      {!pos && (
        <button className="btn secondary" onClick={locate}>
          📍 Find missing places near me
        </button>
      )}
      {error && <p className="muted small">{error}</p>}
      {isFetching && <p className="muted small">Searching nearby…</p>}
      {data && (
        <div className="row-list">
          {data.components.map((c) => (
            <Link
              className="row"
              key={`${c.system_slug}-${c.id}`}
              href={`/s/${c.system_slug}/map?focus=${c.id}`}
            >
              <span className="grow">{c.name}</span>
              <span className="muted small">{c.system_title}</span>
              {c.miles_away && <span className="muted small">{c.miles_away} mi</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
