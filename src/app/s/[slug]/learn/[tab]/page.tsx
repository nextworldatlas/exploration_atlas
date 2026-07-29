// Generic Learn tab: pills from manifest.learnTabs, blocks from content_blocks.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSystem, getSystemContent } from "@/lib/queries";
import LearnTabRenderer from "@/components/LearnTabRenderer";
import SystemTabs from "../../SystemTabs";
import type { ContentBlock } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LearnTabPage(ctx: {
  params: Promise<{ slug: string; tab: string }>;
}) {
  const { slug, tab } = await ctx.params;
  const system = await getSystem(slug);
  if (!system) notFound();
  if (!system.manifest.learnTabs.includes(tab)) notFound();

  const blocks = (await getSystemContent(system.id, tab)) as ContentBlock[];

  return (
    <main className="page">
      <h1>{system.title}</h1>
      <SystemTabs slug={slug} firstLearnTab={system.manifest.learnTabs[0]} />
      <div className="tabs">
        {system.manifest.learnTabs.map((t) => (
          <Link key={t} href={`/s/${slug}/learn/${t}`} className={t === tab ? "active" : ""}>
            {t}
          </Link>
        ))}
      </div>
      <LearnTabRenderer blocks={blocks} />
    </main>
  );
}
