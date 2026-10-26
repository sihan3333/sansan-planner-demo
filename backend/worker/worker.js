// 三三作息簿 · 数据后端线上版（Cloudflare Worker + D1）
// 和 ../app.py 接口一致：
//   POST /api/events  接收使用事件
//   GET  /api/stats   汇总成看板指标
//   GET  /dashboard   数据看板页面
// 模拟数据按「最后一天 = 今天」整体平移日期，所以看板一直有最近 14 天的样例可看。
import DASHBOARD from '../dashboard.html';

const EVENT_TYPES = new Set([
  'ai_request', 'ai_no_ops', 'plan_shown', 'plan_applied', 'plan_cancelled', 'plan_undone',
  'edit_after_ai', 'activity_toggled', 'day_snapshot', 'suggestion_accepted', 'suggestion_dismissed',
]);
const MAX_BODY = 64 * 1024;
const MAX_EVENTS = 50;
const DAY_MS = 86400000;

const nowIso = () => new Date().toISOString().slice(0, 19) + '+00:00';
const ratio = (a, b) => (b ? Math.round((a / b) * 10000) / 10000 : null);

function cors(req, env) {
  const origin = req.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

async function postEvents(req, env) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ detail: 'too_large' }, 413);
  let body;
  try { body = JSON.parse(raw); } catch (e) { return json({ detail: 'bad_json' }, 400); }
  const anonId = String((body && body.anon_id) || '').slice(0, 64);
  const events = body && body.events;
  if (!anonId || !Array.isArray(events) || !events.length || events.length > MAX_EVENTS) return json({ detail: 'bad_events' }, 400);
  // 线上不接受模拟数据，模拟数据只由部署脚本写入
  if (anonId.startsWith('sim-')) return json({ detail: 'bad_events' }, 400);

  const received = nowIso();
  const stmts = [];
  for (const e of events) {
    if (!e || typeof e !== 'object' || !EVENT_TYPES.has(e.type)) continue;
    const data = e.data && typeof e.data === 'object' && !Array.isArray(e.data) ? e.data : {};
    const ts = String(e.ts || received).slice(0, 40);
    if (e.type === 'day_snapshot') {
      if (typeof data.date !== 'string' || !Array.isArray(data.items)) continue;
      stmts.push(env.DB.prepare(
        `INSERT INTO day_snapshots (anon_id, date, items, updated_at, simulated) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(anon_id, date) DO UPDATE SET items=excluded.items, updated_at=excluded.updated_at`
      ).bind(anonId, data.date.slice(0, 10), JSON.stringify(data.items), ts));
    } else {
      stmts.push(env.DB.prepare(
        'INSERT INTO events (anon_id, type, ts, received_at, simulated, data) VALUES (?, ?, ?, ?, 0, ?)'
      ).bind(anonId, e.type, ts, received, JSON.stringify(data)));
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ stored: stmts.length });
}

// 把模拟数据整体平移，让最后一天落在今天
async function simShiftMs(env) {
  const r = await env.DB.prepare('SELECT MAX(date) AS d FROM day_snapshots WHERE simulated = 1').first();
  if (!r || !r.d) return 0;
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  return Math.max(0, Math.round((today - Date.parse(r.d)) / DAY_MS)) * DAY_MS;
}
const shiftTs = (ts, ms) => (ms ? new Date(Date.parse(ts) + ms).toISOString().slice(0, 19) + '+00:00' : ts);

async function stats(url, env) {
  const days = Math.max(1, Math.min(parseInt(url.searchParams.get('days') || '30', 10) || 30, 365));
  const includeSim = url.searchParams.get('include_sim') === 'true';
  const sinceMs = Date.now() - days * DAY_MS;
  const since = new Date(sinceMs).toISOString();
  const sinceDate = since.slice(0, 10);
  const shift = includeSim ? await simShiftMs(env) : 0;
  const simSince = new Date(sinceMs - shift).toISOString();
  const simSinceDate = simSince.slice(0, 10);

  const [evRes, snapRes, cntRes] = await env.DB.batch([
    env.DB.prepare(
      includeSim
        ? 'SELECT id, anon_id, type, ts, simulated, data FROM events WHERE (simulated = 0 AND ts >= ?) OR (simulated = 1 AND ts >= ?)'
        : 'SELECT id, anon_id, type, ts, simulated, data FROM events WHERE simulated = 0 AND ts >= ? AND ts >= ?'
    ).bind(since, simSince),
    env.DB.prepare(
      includeSim
        ? 'SELECT anon_id, date, items, simulated FROM day_snapshots WHERE (simulated = 0 AND date >= ?) OR (simulated = 1 AND date >= ?)'
        : 'SELECT anon_id, date, items, simulated FROM day_snapshots WHERE simulated = 0 AND date >= ? AND date >= ?'
    ).bind(sinceDate, simSinceDate),
    env.DB.prepare('SELECT simulated, COUNT(*) AS n FROM events GROUP BY simulated'),
  ]);

  const evs = evRes.results
    .map((r) => ({ ...r, ts: r.simulated ? shiftTs(r.ts, shift) : r.ts, data: JSON.parse(r.data) }))
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const byType = {};
  for (const e of evs) (byType[e.type] = byType[e.type] || []).push(e);
  const n = (t) => (byType[t] || []).length;

  const requests = byType.ai_request || [];
  const srcCount = {};
  for (const e of requests) { const s = e.data.source || 'unknown'; srcCount[s] = (srcCount[s] || 0) + 1; }
  const llm = Object.entries(srcCount).filter(([k]) => k === 'DeepSeek' || k === 'Claude').reduce((a, [, v]) => a + v, 0);
  const lat = requests.map((e) => e.data.latency_ms).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const p50 = lat.length ? lat[Math.floor(lat.length / 2)] : null;

  const ids = (t) => new Set((byType[t] || []).map((e) => e.data.plan_id));
  const applied = ids('plan_applied');
  const edited = new Set([...ids('edit_after_ai')].filter((x) => applied.has(x)));
  const undone = new Set([...ids('plan_undone')].filter((x) => applied.has(x)));
  const kept = [...applied].filter((x) => !edited.has(x) && !undone.has(x)).length;

  const kpis = {
    users: new Set(evs.map((e) => e.anon_id)).size,
    requests: requests.length,
    plans_shown: n('plan_shown'),
    plans_applied: applied.size,
    adoption_rate: ratio(applied.size, n('plan_shown')),
    undo_rate: ratio(undone.size, applied.size),
    edit_after_rate: ratio(edited.size, applied.size),
    clean_success_rate: ratio(kept, n('plan_shown')),
    not_understood_rate: ratio(n('ai_no_ops'), requests.length),
    llm_share: ratio(llm, requests.length),
    fallback_rate: ratio(srcCount['local-fallback'] || 0, requests.length),
    latency_p50_ms: p50,
    suggestion_accept_rate: ratio(n('suggestion_accepted'), n('suggestion_accepted') + n('suggestion_dismissed')),
    suggestions_acted: n('suggestion_accepted') + n('suggestion_dismissed'),
  };

  const daily = {};
  for (const e of evs) {
    const k = e.ts.slice(0, 10);
    const d = (daily[k] = daily[k] || { date: k, requests: 0, shown: 0, applied: 0 });
    if (e.type === 'ai_request') d.requests++;
    else if (e.type === 'plan_shown') d.shown++;
    else if (e.type === 'plan_applied') d.applied++;
  }
  for (const d of Object.values(daily)) d.adoption_rate = ratio(d.applied, d.shown);

  const catStat = {}, slotStat = {}, actStat = {};
  for (const s of snapRes.results) {
    for (const it of JSON.parse(s.items)) {
      if (!it || typeof it !== 'object' || it.cat === 'sleep' || it.start === it.end) continue;
      if (it.due === false) continue;
      const done = it.done ? 1 : 0;
      const h = parseInt(String(it.start || '0:0').split(':')[0], 10) || 0;
      const slot = h < 12 ? '上午' : h < 18 ? '下午' : '晚上';
      for (const [table, key] of [[catStat, it.cat || 'other'], [slotStat, slot], [actStat, it.name || '']]) {
        const t = (table[key] = table[key] || { total: 0, done: 0 });
        t.total++; t.done += done;
      }
    }
  }
  for (const table of [catStat, slotStat, actStat]) for (const v of Object.values(table)) v.rate = ratio(v.done, v.total);
  const weakest = Object.entries(actStat)
    .filter(([, v]) => v.total >= 3)
    .map(([k, v]) => ({ name: k, ...v }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
    .slice(0, 5);

  const labels = { plan_cancelled: '取消', plan_undone: '撤销', ai_no_ops: '没听懂', edit_after_ai: '应用后手动修改' };
  const bad = evs.filter((e) => labels[e.type]).map((e) => ({
    id: e.id, kind: labels[e.type], ts: e.ts, text: e.data.text || '', source: e.data.source || '',
    detail: e.data.name || e.data.reply || '', simulated: !!e.simulated,
  })).slice(-30).reverse();

  let simN = 0, realN = 0;
  for (const r of cntRes.results) { if (r.simulated) simN += r.n; else realN += r.n; }
  return json({
    range_days: days, include_sim: includeSim, event_counts: { real: realN, simulated: simN }, kpis,
    sources: srcCount, daily: Object.values(daily).sort((a, b) => (a.date < b.date ? -1 : 1)),
    completion_by_cat: catStat, completion_by_slot: slotStat, weakest_activities: weakest, bad_cases: bad,
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const h = cors(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (url.pathname === '/') return Response.redirect(url.origin + '/dashboard', 302);
    if (url.pathname === '/dashboard') return new Response(DASHBOARD, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/api/health') return json({ ok: true }, 200, h);
    if (url.pathname === '/api/events' && req.method === 'POST') { const r = await postEvents(req, env); for (const [k, v] of Object.entries(h)) r.headers.set(k, v); return r; }
    if (url.pathname === '/api/stats' && req.method === 'GET') return stats(url, env);
    return json({ detail: 'not_found' }, 404, h);
  },
};
