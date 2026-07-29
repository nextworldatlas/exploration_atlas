export default function CompletionBar({
  pct,
  label,
  detail,
}: {
  pct: number;
  label?: string;
  detail?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number(pct) || 0));
  return (
    <div className="bar-row" title={detail}>
      {label !== undefined && (
        <span className="bar-label small" style={{ width: 150 }}>
          {label}
        </span>
      )}
      <div className="bar">
        <div style={{ width: `${clamped}%` }} />
      </div>
      <span className="pct">{clamped.toFixed(clamped > 0 && clamped < 1 ? 1 : 0)}%</span>
    </div>
  );
}
