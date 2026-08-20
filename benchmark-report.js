// Apollo Design — comprehensive performance benchmark
// Measures page-load assets, API latency, payload sizes, and throughput.
const BASE = 'http://localhost:5180';
const API = 'http://localhost:5010';
const RUNS = 10;

const results = {};

function fmtBytes(b) {
  if (b >= 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + ' MB';
  if (b >= 1024) return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtMs(ms) {
  return ms.toFixed(2) + ' ms';
}

async function timeIt(url, options = {}, runs = RUNS) {
  const times = [];
  const sizes = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const res = await fetch(url, options);
    const body = await res.arrayBuffer();
    const elapsed = performance.now() - start;
    times.push(elapsed);
    sizes.push(body.byteLength);
  }
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p50 = times[Math.floor(times.length * 0.5)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const size = sizes[0]; // same every run
  return { avg, p50, p95, min: times[0], max: times[times.length - 1], size };
}

async function main() {
  console.log('=== Apollo Design Performance Benchmark ===\n');

  // ---- Frontend / page-load path ----
  console.log('--- FRONTEND (page load path) ---');
  results['HTML shell'] = await timeIt(BASE + '/', {}, 5);
  results['JS bundle (uncompressed)'] = await timeIt(BASE + '/assets/index-CFkc-44J.js', {}, 5);
  results['CSS bundle'] = await timeIt(BASE + '/assets/index-CWL3Am1C.css', {}, 5);

  // ---- Backend API ----
  console.log('--- BACKEND API (via nginx on :5180) ---');
  results['GET /api/health'] = await timeIt(API + '/api/health');
  results['GET /api/projects (list all)'] = await timeIt(API + '/api/projects');

  // Get a real project ID
  const projectsRes = await fetch(API + '/api/projects');
  const projects = await projectsRes.json();
  const pid = projects.find((p) => p.preview && p.preview.elements.length > 0)?.id || projects[0]?.id;
  console.log('Using project ID for detail tests:', pid);

  results['GET /api/projects/:id'] = await timeIt(`${API}/api/projects/${pid}`);
  results['GET /api/projects/:id/versions'] = await timeIt(`${API}/api/projects/${pid}/versions`);

  // Images search
  results['GET /api/images/search?q=space'] = await timeIt(`${API}/api/images/search?q=space&per_page=8`);

  // ---- Print ----
  console.log('\n=== RESULTS ===\n');
  const rows = Object.entries(results).map(([name, r]) => ({
    name,
    avg: fmtMs(r.avg),
    p50: fmtMs(r.p50),
    p95: fmtMs(r.p95),
    min: fmtMs(r.min),
    max: fmtMs(r.max),
    size: fmtBytes(r.size),
  }));
  console.table(rows);

  // Summaries
  console.log('\n=== KEY FINDINGS ===\n');
  for (const [name, r] of Object.entries(results)) {
    if (!name.includes('search')) {
      console.log(`${name}: avg ${fmtMs(r.avg)} | p50 ${fmtMs(r.p50)} | p95 ${fmtMs(r.p95)} | payload ${fmtBytes(r.size)}`);
    }
  }
}

main().catch((e) => {
  console.error('Benchmark failed:', e.message);
  process.exit(1);
});