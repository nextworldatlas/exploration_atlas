// Life Atlas landing: every system as a card with the visitor's progress.
import Link from "next/link";
import { getUserId } from "@/lib/user";
import { listSystemsWithProgress } from "@/lib/queries";
import CompletionBar from "@/components/CompletionBar";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  transport: "Transport",
  nature: "Nature",
  admin: "Political Geography",
  culture: "Culture",
};

export default async function Home() {
  const userId = await getUserId();
  const systems = await listSystemsWithProgress(userId);
  const categories = [...new Set(systems.map((s) => s.category))];

  return (
    <main className="page">
      <h1>Your Life Atlas</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        Don&apos;t just collect places — learn how the world is organized. Pick a
        system, mark what you&apos;ve experienced, and watch the map fill in.
      </p>

      {categories.map((cat) => (
        <section key={cat}>
          <h2>{CATEGORY_LABELS[cat] ?? cat}</h2>
          <div className="card-grid">
            {systems
              .filter((s) => s.category === cat)
              .map((s) => {
                const weighted = s.completion?.rule === "weighted";
                const detail = weighted
                  ? `${Math.round(s.completed_weight).toLocaleString()} / ${Math.round(s.total_weight).toLocaleString()} ${s.completion?.unit ?? ""}`
                  : `${s.completed_count} / ${s.total_count}`;
                return (
                  <Link className="card" href={`/s/${s.slug}`} key={s.slug}>
                    <div className="cat">{CATEGORY_LABELS[s.category] ?? s.category}</div>
                    <h3>{s.title}</h3>
                    <CompletionBar pct={s.pct} />
                    <div className="muted small">{detail}</div>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}
    </main>
  );
}
