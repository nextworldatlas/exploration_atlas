// Generic Learn renderer: content_blocks.kind → renderer. Adding a system adds
// zero renderer code (spec §7). Server component — pure presentation.
import type { ContentBlock } from "@/lib/types";

function Prose({ body }: { body: Record<string, unknown> }) {
  return <p>{String(body.text ?? "")}</p>;
}

function FactList({ body }: { body: Record<string, unknown> }) {
  const items = (body.items ?? []) as { label: string; value: unknown }[];
  return (
    <div className="factlist">
      {items.map((f, i) => (
        <div className="fact" key={i}>
          <div className="k">{f.label}</div>
          <div className="v">{formatValue(f.value)}</div>
        </div>
      ))}
    </div>
  );
}

function Timeline({ body }: { body: Record<string, unknown> }) {
  const events = (body.events ?? []) as { date: string; text: string }[];
  return (
    <ul>
      {events.map((e, i) => (
        <li key={i}>
          <strong>{e.date}</strong> — {e.text}
        </li>
      ))}
    </ul>
  );
}

function Stat({ body }: { body: Record<string, unknown> }) {
  return (
    <div className="stat">
      <div className="n">{formatValue(body.value)}</div>
      <div className="l">{String(body.label ?? "")}</div>
    </div>
  );
}

function formatValue(v: unknown): string {
  if (typeof v === "number") return v.toLocaleString();
  return String(v ?? "");
}

export default function LearnTabRenderer({ blocks }: { blocks: ContentBlock[] }) {
  if (!blocks.length) {
    return <div className="stub-note">This chapter hasn&apos;t been written yet.</div>;
  }
  return (
    <div className="prose">
      {blocks.map((block, i) => {
        if (block.review_status === "stub") {
          return (
            <div className="stub-note" key={i}>
              {String(block.body.text ?? "Coming soon.")}
            </div>
          );
        }
        switch (block.kind) {
          case "prose":
            return <Prose key={i} body={block.body} />;
          case "factlist":
            return <FactList key={i} body={block.body} />;
          case "timeline":
            return <Timeline key={i} body={block.body} />;
          case "stat":
            return <Stat key={i} body={block.body} />;
          default:
            return null; // gallery / map_embed arrive with later content work
        }
      })}
    </div>
  );
}
