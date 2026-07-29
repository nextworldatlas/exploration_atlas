// System Overview: stats + overview content + full component checklist.
import { notFound } from "next/navigation";
import { getUserId } from "@/lib/user";
import {
  getSystem,
  getSystemContent,
  getUserSystemProgress,
} from "@/lib/queries";
import CompletionBar from "@/components/CompletionBar";
import LearnTabRenderer from "@/components/LearnTabRenderer";
import ComponentList from "@/components/ComponentList";
import SystemTabs from "./SystemTabs";
import type { ContentBlock } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SystemOverview(ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const system = await getSystem(slug);
  if (!system) notFound();

  const userId = await getUserId();
  const progress = await getUserSystemProgress(userId, system.id);
  const blocks = (await getSystemContent(system.id, "overview")) as ContentBlock[];
  const weighted = system.manifest.completion.rule === "weighted";
  const unit = system.manifest.completion.unit ?? "";

  return (
    <main className="page">
      <div className="cat muted small" style={{ textTransform: "uppercase" }}>
        {system.category}
      </div>
      <h1>{system.title}</h1>
      <SystemTabs slug={slug} firstLearnTab={system.manifest.learnTabs[0]} />

      <CompletionBar pct={progress?.pct ?? 0} />
      <div className="stat-row">
        <div className="stat">
          <div className="n">{progress?.completed_count ?? 0}</div>
          <div className="l">completed of {system.total_count}</div>
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
        {system.container_count > 0 && (
          <div className="stat">
            <div className="n">{system.container_count}</div>
            <div className="l">{system.manifest.hierarchy[0].kind.replace(/_/g, " ")}s</div>
          </div>
        )}
      </div>

      <LearnTabRenderer blocks={blocks} />

      <h2>Checklist</h2>
      <ComponentList slug={slug} weightUnit={weighted ? unit : undefined} />
    </main>
  );
}
