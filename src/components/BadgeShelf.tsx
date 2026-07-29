// Badge shelf: earned in color, locked greyed out. Server component.
export interface BadgeRow {
  slug: string;
  title: string;
  description: string | null;
  icon: string | null;
  earned_at: string | null;
}

export default function BadgeShelf({ badges }: { badges: BadgeRow[] }) {
  if (!badges.length) return null;
  return (
    <div className="badge-shelf">
      {badges.map((b) => (
        <div className={`badge ${b.earned_at ? "" : "locked"}`} key={b.slug}>
          <div className="icon">{b.icon ?? "🏅"}</div>
          <div className="t">{b.title}</div>
          <div className="d">{b.description}</div>
          {b.earned_at && (
            <div className="d" style={{ color: "var(--done)" }}>
              earned {new Date(b.earned_at).toLocaleDateString()}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
