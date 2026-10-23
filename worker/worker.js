// 三三作息簿 · AI 中转（Cloudflare Worker）
// 网页是纯静态的（GitHub Pages），不能把 DeepSeek 的 API Key 写进前端。
// 这个 Worker 替网页保管 Key：网页把提示词发过来，Worker 转给 DeepSeek，再把 JSON 结果返回。
//
// 需要在 Worker 的 Settings → Variables 里配置：
//   DEEPSEEK_API_KEY  （Secret）DeepSeek 的 API Key
//   ALLOWED_ORIGINS   允许调用的网页地址，多个用逗号分隔，例如
//                     https://sihan3333.github.io,http://localhost:8000

const MAX_PROMPT = 8000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || ''),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const reply = (status, body) => new Response(JSON.stringify(body), {
      status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'method_not_allowed' });
    if (!allowed.includes(origin)) return reply(403, { error: 'origin_not_allowed' });

    let prompt;
    try { ({ prompt } = await request.json()); } catch { return reply(400, { error: 'bad_json' }); }
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > MAX_PROMPT) {
      return reply(400, { error: 'bad_prompt' });
    }

    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0,
        max_tokens: 800,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: '你只输出一个 JSON 对象，不输出任何解释文字。' },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!r.ok) return reply(502, { error: 'upstream_' + r.status });

    const data = await r.json();
    try {
      return reply(200, { result: JSON.parse(data.choices[0].message.content) });
    } catch {
      return reply(502, { error: 'invalid_model_json' });
    }
  },
};
