// System progress: rollup stats, per-container bars, system badges,
// "finish what you started" suggestions.
import { notFound } from "next/navigation";
import { query } from "@/lib/db";
import { getUserId } from "@/lib/user";
import { getSystem, getUserSystemProgress } from "@/lib/queries";
import CompletionBar from "@/components/CompletionBar";
import BadgeShelf, { type BadgeRow } from "@/components/BadgeShelf";
import SystemTabs from "../SystemTabs";

export const dynamic = "force-dynamic";

export default async function ProgressPage(ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const system = await getSystem(slug);
  if (!system) notFound();
  const userId = await getUserId();
  const progress = await getUserSystemProgress(userId, system.id);
  const weighted = system.manifest.completion.rule === "weighted";
  const unit = system.manifest.completion.unit ?? "";

  interface ContainerRow {
    name: string;
    slug: string;
    total_count: number;
    completed_count: number;
    total_weight: number;
    completed_weight: number;
  }
  const containers = await query<ContainerRow>(
    `SELECT p.name, p.slug,
            count(leaf.id)::int AS total_count,
            count(e.id)::int AS completed_count,
            COALESCE(sum(leaf.weight), 0)::float AS total_weight,
            COALESCE(sum(leaf.weight) FILTER (WHERE e.id IS NOT NULL), 0)::float AS completed_weight
     FROM components cc
     JOIN places p ON p.id = cc.place_id
     JOIN components leaf ON leaf.container_component_id = cc.id AND leaf.role = 'leaf'
     LEFT JOIN experiences e ON e.component_id = leaf.id AND e.user_id = $1
     WHERE cc.system_id = $2 AND cc.role = 'container'
     GROUP BY p.name, p.slug, cc.display_order
     ORDER BY cc.display_order NULLS LAST, p.name`,
    [userId, system.id]
  );

  const badgeSlugs = system.manifest.badges ?? [];
  const badges = badgeSlugs.length
    ? await query(
        `SELECT b.slug, b.title, b.description, b.icon, ub.earned_at
         FROM badges b
         LEFT JOIN user_badges ub ON ub.badge_id = b.id AND ub.user_id = $1
         WHERE b.slug = ANY($2)
         ORDER BY (ub.earned_at IS NULL), b.slug`,
        [userId, badgeSlugs]
      )
    : { rows: [] };

  const rows = containers.rows.map((c) => ({
    ...c,
    pct: weighted
      ? c.total_weight > 0
        ? (c.completed_weight / c.total_weight) * 100
        : 0
      : c.total_count > 0
        ? (c.completed_count / c.total_count) * 100
        : 0,
  }));
  const started = rows.filter((c) => c.pct > 0 && c.pct < 100);
  const suggestions = [...started].sort((a, b) => b.pct - a.pct).slice(0, 5);

  return (
    <main className="page">
      <h1>{system.title}</h1>
      <SystemTabs slug={slug} firstLearnTab={system.manifest.learnTabs[0]} />

      <CompletionBar pct={progress?.pct ?? 0} />
      <div className="stat-row">
        <div className="stat">
          <div className="n">{progress?.completed_count ?? 0}</div>
          <div className="l">of {system.total_count} completed</div>
        </div>
        {weighted && (
          <div className="stat">
            <div className="n">
              {Math.round(progress?.completed_weight ?? 0).toLocaleString()}
            </div>
            <div className="l">
              of {Math.round(system.total_weight).toLocaleString()} {unit}
            </div>
          </div>
        )}
        <div className="stat">
          <div className="n">{(progress?.pct ?? 0).toFixed(1)}%</div>
          <div className="l">complete</div>
        </div>
      </div>

      {badges.rows.length > 0 && (
        <>
          <h2>Badges</h2>
          <BadgeShelf badges={badges.rows as BadgeRow[]} />
        </>
      )}

      {suggestions.length > 0 && (
        <>
          <h2>Finish what you started</h2>
          {suggestions.map((c) => (
            <CompletionBar
              key={c.slug}
              pct={c.pct}
              label={c.name}
              detail={
                weighted
                  ? `${Math.round(c.completed_weight).toLocaleString()} / ${Math.round(c.total_weight).toLocaleString()} ${unit}`
                  : `${c.completed_count} / ${c.total_count}`
              }
            />
          ))}
        </>
      )}

      {rows.length > 0 && (
        <>
          <h2>
            By {system.manifest.hierarchy.find((h) => h.role === "container")?.kind.replace(/_/g, " ") ?? "container"}
          </h2>
          {rows.map((c) => (
            <CompletionBar
              key={c.slug}
              pct={c.pct}
              label={c.name}
              detail={
                weighted
                  ? `${Math.round(c.completed_weight).toLocaleString()} / ${Math.round(c.total_weight).toLocaleString()} ${unit}`
                  : `${c.completed_count} / ${c.total_count}`
              }
            />
          ))}
        </>
      )}
    </main>
  );
}
