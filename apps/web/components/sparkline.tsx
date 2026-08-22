export function Sparkline({ values, positive = true, width = 104, height = 38 }: { values: number[]; positive?: boolean; width?: number; height?: number }) {
  if (values.length < 2) return <span className="sparkline-empty" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => `${(index / (values.length - 1)) * width},${height - 4 - ((value - min) / span) * (height - 8)}`).join(" ");
  return (
    <svg className={`sparkline ${positive ? "sparkline-positive" : "sparkline-muted"}`} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Trend from ${values[0]} to ${values.at(-1)}`}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(values.length - 1) / (values.length - 1) * width} cy={height - 4 - ((values.at(-1)! - min) / span) * (height - 8)} r="2.8" fill="currentColor" />
    </svg>
  );
}
