// /me — the cross-system Life Atlas dashboard.
import Link from "next/link";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";
import { listSystemsWithProgress } from "@/lib/queries";
import CompletionBar from "@/components/CompletionBar";
import BadgeShelf, { type BadgeRow } from "@/components/BadgeShelf";
import NearbyMissing from "@/components/NearbyMissing";
import AccountPanel from "@/components/AccountPanel";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const userId = await getUserId();
  const systems = await listSystemsWithProgress(userId);

  const badges = await query(
    `SELECT b.slug, b.title, b.description, b.icon, ub.earned_at
     FROM badges b
     LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = $1
     ORDER BY (ub.earned_at IS NULL), b.slug`,
    [userId]
  );
  const earned = badges.rows.filter((b) => b.earned_at).length;

  const recent = await query(
    `SELECT e.component_id, e.created_at, p.name, s.slug AS system_slug, s.title AS system_title
     FROM experiences e
     JOIN components c ON c.id = e.component_id
     JOIN places p ON p.id = c.place_id
     JOIN systems s ON s.id = c.system_id
     WHERE e.user_id = $1
     ORDER BY e.created_at DESC
     LIMIT 8`,
    [userId]
  );

  const wishlist = await query(
    `SELECT w.component_id, p.name, s.slug AS system_slug, s.title AS system_title
     FROM wishlist w
     JOIN components c ON c.id = w.component_id
     JOIN places p ON p.id = c.place_id
     JOIN systems s ON s.id = c.system_id
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC
     LIMIT 20`,
    [userId]
  );

  const totalDone = systems.reduce((n, s) => n + Number(s.completed_count), 0);

  return (
    <main className="page">
      <h1>My Atlas</h1>
      <div className="stat-row">
        <AccountPanel />
      </div>
      <div className="stat-row">
        <div className="stat">
          <div className="n">{totalDone}</div>
          <div className="l">places experienced</div>
        </div>
        <div className="stat">
          <div className="n">{earned}</div>
          <div className="l">of {badges.rows.length} badges</div>
        </div>
        <div className="stat">
          <div className="n">{systems.filter((s) => Number(s.pct) > 0).length}</div>
          <div className="l">systems started</div>
        </div>
      </div>

      <h2>Systems</h2>
      {systems.map((s) => (
        <Link href={`/s/${s.slug}/progress`} key={s.slug} style={{ display: "block" }}>
          <CompletionBar pct={Number(s.pct)} label={s.title} />
        </Link>
      ))}

      <h2>Badges</h2>
      <BadgeShelf badges={badges.rows as BadgeRow[]} />

      {wishlist.rows.length > 0 && (
        <>
          <h2>Wishlist</h2>
          <div className="row-list">
            {wishlist.rows.map((w) => (
              <Link
                className="row"
                key={w.component_id}
                href={`/s/${w.system_slug}/map?focus=${w.component_id}`}
              >
                <span className="grow">★ {w.name}</span>
                <span className="muted small">{w.system_title}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {recent.rows.length > 0 && (
        <>
          <h2>Recent</h2>
          <div className="row-list">
            {recent.rows.map((r) => (
              <div className="row" key={`${r.component_id}-${r.created_at}`}>
                <span className="grow">✓ {r.name}</span>
                <span className="muted small">{r.system_title}</span>
                <span className="muted small">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Discover</h2>
      <NearbyMissing />
    </main>
  );
}
