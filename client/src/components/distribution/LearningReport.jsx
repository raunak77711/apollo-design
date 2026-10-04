import { useEffect, useState } from 'react';
import { distributionApi } from '../../api/distribution.js';

/** Published performance, rolled up by funnel stage, hook type, archetype and platform — "LEARN" in the loop. */
function Group({ title, rows }) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="font-mono text-2xs uppercase tracking-[0.14em] text-ink-3">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center justify-between text-[13px]">
            <span className="text-ink-2">{String(r.key).replace(/-/g, ' ')} <span className="text-ink-3">×{r.count}</span></span>
            <span className="font-mono text-ink">{(r.totals.views ?? 0).toLocaleString()} views</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LearningReport({ batchId }) {
  const [report, setReport] = useState(null);
  useEffect(() => { distributionApi.learning(batchId).then(setReport).catch(() => setReport(null)); }, [batchId]);

  if (!report) return null;
  if (!report.publishedCount) return <p className="text-sm text-ink-3">Nothing published yet — this fills in once a short actually goes out and analytics come back.</p>;

  return (
    <section>
      <h2 className="font-mono text-2xs uppercase tracking-[0.2em] text-ink-3">Learn ({report.publishedCount} published)</h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Group title="By funnel stage" rows={report.byFunnelStage} />
        <Group title="By hook type" rows={report.byHookType} />
        <Group title="By format" rows={report.byArchetype} />
        <Group title="By platform" rows={report.byPlatform} />
      </div>
    </section>
  );
}
