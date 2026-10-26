// 三三作息簿 · App 原型 v1（Figma 开发插件）
// 视觉沿用网页版：墨绿主色、米色背景、衬线体日期、8 种分类色。
// 运行后在「三三作息簿 App 原型」页生成 21 屏：V1.0 14 屏、V1.1 3 屏、V1.2 4 屏，每屏下方附设计说明。
// 免费版一个文件最多 3 页：同名页面存在就清空复用，不新建。

const C = {
  accent: '#6B9136', accentDark: '#4E6E24', accentLight: '#EAF1DC', accentLight2: '#D5E4BC',
  ink: '#1F2A17', ink2: '#6C7660', ink3: '#9CA48D', line: '#E6E0CC', bg: '#FAF6E8', card: '#FFFDF5', white: '#FFFFFF',
  danger: '#B2503F', dangerLight: '#F3E1DC', warn: '#B98F2E', warnLight: '#F6ECD2', dark: '#152009',
  learn: '#38538C', work: '#345F26', exercise: '#6C8F3D', life: '#BD6873', care: '#7D5D99', commute: '#C17A3A', sleep: '#5F7F9B'
};
const COLOR_NAMES = {
  accent: '品牌/主色', accentDark: '品牌/深色', accentLight: '品牌/浅色-1', accentLight2: '品牌/浅色-2',
  ink: '文字/主要', ink2: '文字/次要', ink3: '文字/弱', line: '中性/描边', bg: '中性/页面背景', card: '中性/卡片', white: '中性/白',
  danger: '功能/警示', dangerLight: '功能/警示-浅', warn: '功能/提醒', warnLight: '功能/提醒-浅', dark: '中性/深色',
  learn: '分类/学习', work: '分类/工作', exercise: '分类/运动', life: '分类/生活', care: '分类/护理', commute: '分类/通勤', sleep: '分类/睡眠'
};
// [字号, 是否加粗, 样式名, 是否衬线]
const TS = {
  date: [30, 1, '日期 30', 1], h1: [22, 1, '大标题 22'], h2: [17, 1, '小标题 17'], body: [15, 0, '正文 15'],
  bodyB: [15, 1, '正文加粗 15'], small: [13, 0, '说明 13'], smallB: [13, 1, '说明加粗 13'], tiny: [11, 0, '标注 11'],
  btn: [16, 1, '按钮 16'], big: [56, 1, '大数字 56', 1], clock: [64, 0, '锁屏时间 64']
};
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  close: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="4"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  chart: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-6"/><path d="M21 20H3"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>'
};
const SHADOW = [{ type: 'DROP_SHADOW', color: { r: 0.08, g: 0.13, b: 0.04, a: 0.07 }, offset: { x: 0, y: 4 }, radius: 14, spread: 0, visible: true, blendMode: 'NORMAL' }];

const V = 'app-v1';
const PAGE = '三三作息簿 App 原型';
const COL = 470;
const ROWS = { A: 300, B: 1560, C: 2820 };

let F = null, EFF = null;
const VARS = {}, STY = {}, pending = [], links = [], S = {};

function rgb(h) { const n = parseInt(h.slice(1), 16); return { r: (n >> 16 & 255) / 255, g: (n >> 8 & 255) / 255, b: (n & 255) / 255 }; }
function solid(h, a) {
  let p = { type: 'SOLID', color: rgb(h) };
  if (a !== undefined) p.opacity = a;
  const v = VARS[h];
  if (v && a === undefined) { try { p = figma.variables.setBoundVariableForPaint(p, 'color', v); } catch (e) { } }
  return [p];
}
async function pickFonts() {
  const all = await figma.listAvailableFontsAsync();
  const pick = fams => {
    for (const fam of fams) {
      const st = all.filter(f => f.fontName.family === fam).map(f => f.fontName.style);
      if (!st.length) continue;
      const r = st.find(s => /^(Regular|Normal)$/i.test(s)) || st[0];
      const b = st.find(s => /^(Semibold|SemiBold)$/i.test(s)) || st.find(s => /^Bold$/i.test(s)) || st.find(s => /Bold|Medium/i.test(s)) || r;
      return { r: { family: fam, style: r }, b: { family: fam, style: b } };
    }
    return null;
  };
  const sans = pick(['PingFang SC', 'Noto Sans SC', 'Source Han Sans SC', 'Source Han Sans CN', 'Microsoft YaHei']);
  if (!sans) throw new Error('没有找到中文字体');
  const serif = pick(['Noto Serif SC', 'Source Han Serif SC', 'Source Han Serif CN', 'SimSun', 'Songti SC']) || sans;
  return { r: sans.r, b: sans.b, sr: serif.r, sb: serif.b };
}
function setupVars() {
  try {
    const col = figma.variables.createVariableCollection('三三作息簿 ' + V + ' 颜色');
    const mode = col.modes[0].modeId;
    for (const k of Object.keys(C)) {
      const v = figma.variables.createVariable(COLOR_NAMES[k], col, 'COLOR');
      v.setValueForMode(mode, rgb(C[k]));
      VARS[C[k]] = v;
    }
  } catch (e) { console.warn('颜色变量创建失败', e); }
}
const fontOf = st => { const [, b, , serif] = TS[st]; return serif ? (b ? F.sb : F.sr) : (b ? F.b : F.r); };
function setupStyles() {
  for (const k of Object.keys(TS)) {
    try {
      const s = figma.createTextStyle();
      s.name = V + '/' + TS[k][2];
      s.fontName = fontOf(k); s.fontSize = TS[k][0];
      s.lineHeight = { value: 140, unit: 'PERCENT' };
      STY[k] = s;
    } catch (e) { }
  }
  try { EFF = figma.createEffectStyle(); EFF.name = V + '/卡片阴影'; EFF.effects = SHADOW; } catch (e) { EFF = null; }
}

// ---------- 积木 ----------
function box(name, o = {}) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = o.dir || 'VERTICAL';
  f.itemSpacing = o.gap || 0;
  const p = o.pad === undefined ? 0 : o.pad;
  const [t, r, b, l] = Array.isArray(p) ? p : [p, p, p, p];
  f.paddingTop = t; f.paddingRight = r; f.paddingBottom = b; f.paddingLeft = l;
  f.primaryAxisSizingMode = 'AUTO'; f.counterAxisSizingMode = 'AUTO';
  f.primaryAxisAlignItems = o.align || 'MIN'; f.counterAxisAlignItems = o.cross || 'MIN';
  f.fills = o.fill ? solid(o.fill, o.alpha) : [];
  f.cornerRadius = o.radius || 0;
  f.clipsContent = false;
  if (o.stroke) { f.strokes = solid(o.stroke); f.strokeWeight = o.strokeW || 1; f.strokeAlign = 'INSIDE'; if (o.dash) f.dashPattern = [4, 4]; }
  return f;
}
function fixed(f, w, h) { f.primaryAxisSizingMode = 'FIXED'; f.counterAxisSizingMode = 'FIXED'; f.resize(w, h); return f; }
function txt(s, st, color = C.ink, align = 'LEFT') {
  const t = figma.createText();
  t.fontName = fontOf(st); t.characters = s; t.fontSize = TS[st][0];
  t.lineHeight = { value: 140, unit: 'PERCENT' };
  t.fills = solid(color); t.textAlignHorizontal = align;
  t.name = s.replace(/\n/g, ' ').slice(0, 20) || '空白';
  if (STY[st]) pending.push(t.setTextStyleIdAsync(STY[st].id).catch(() => { }));
  return t;
}
function put(parent, child, w = 'FILL', tall = false) {
  if (child.type === 'TEXT' && w === 'FILL') child.textAutoResize = 'HEIGHT';
  parent.appendChild(child);
  if (w) child.layoutSizingHorizontal = w;
  if (tall) child.layoutSizingVertical = 'FILL';
  return child;
}
function ico(name, color, size, sw) {
  const n = figma.createNodeFromSvg(`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw || 2}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`);
  n.name = '图标/' + name; n.resize(size, size);
  return n;
}
function shade(n) { n.effects = SHADOW; if (EFF) pending.push(n.setEffectStyleIdAsync(EFF.id).catch(() => { })); return n; }
const spacer = p => put(p, box('留白'), 'FILL', true);
const link = (n, to) => { links.push([n, to]); return n; };
function row(p, name, gap, cross) { const r = box(name, { dir: 'HORIZONTAL', gap: gap === undefined ? 8 : gap, cross: cross || 'CENTER' }); put(p, r); return r; }
function col(p, name, gap) { const c = box(name, { gap: gap || 0 }); put(p, c); return c; }
function circ(name, size, fill, child) {
  const f = fixed(box(name, { fill, radius: size / 2, align: 'CENTER', cross: 'CENTER' }), size, size);
  if (child) put(f, child, child.type === 'TEXT' ? 'HUG' : null);
  return f;
}
function card(name, o = {}) {
  const f = box(name, { gap: o.gap === undefined ? 10 : o.gap, pad: o.pad === undefined ? 14 : o.pad, fill: o.fill || C.card, radius: o.radius || 14, dir: o.dir, cross: o.cross, stroke: o.stroke, dash: o.dash });
  if (!o.fill || o.fill === C.card) shade(f);
  return f;
}
// 按钮：primary 主色 / light 浅绿 / line 描边 / danger 浅红
function btn(label, kind, h, icon, w) {
  const K = { primary: [C.accent, C.white, null], light: [C.accentLight, C.accentDark, null], line: [C.card, C.ink, C.line], danger: [C.dangerLight, C.danger, null], dark: [C.dark, C.white, null] }[kind];
  const f = fixed(box('按钮/' + label, { dir: 'HORIZONTAL', gap: 6, pad: [0, 12, 0, 12], fill: K[0], radius: 12, align: 'CENTER', cross: 'CENTER', stroke: K[2] }), w || 200, h || 48);
  if (icon) put(f, ico(icon, K[1], 18), null);
  put(f, txt(label, 'btn', K[1], 'CENTER'), 'HUG');
  return f;
}
function chip(label, theme, icon) {
  const T = { green: [C.accentLight, C.accentDark], gray: ['#EFEBDD', C.ink2], warn: [C.warnLight, C.warn], red: [C.dangerLight, C.danger], learn: ['#E3E9F5', C.learn] }[theme];
  const f = box('标签/' + label, { dir: 'HORIZONTAL', gap: 4, pad: [3, 8, 3, 8], fill: T[0], radius: 6, cross: 'CENTER' });
  if (icon) put(f, ico(icon, T[1], 12, 2.4), null);
  put(f, txt(label, 'tiny', T[1]), 'HUG');
  return f;
}
function divider(p) { const r = figma.createRectangle(); r.name = '分割线'; r.resize(10, 1); r.fills = solid(C.line); p.appendChild(r); r.layoutSizingHorizontal = 'FILL'; return r; }
function bar(p, w, h, color, name) { const r = figma.createRectangle(); r.name = name || '色条'; r.resize(w, h); r.cornerRadius = Math.min(w, h) / 2; r.fills = solid(color); p.appendChild(r); return r; }
function progress(p, frac, color) {
  const f = fixed(box('进度条', { dir: 'HORIZONTAL', fill: C.line, radius: 4 }), 300, 8);
  put(p, f);
  const r = figma.createRectangle(); r.resize(Math.max(8, 300 * frac), 8); r.cornerRadius = 4; r.fills = solid(color || C.accent);
  f.appendChild(r); r.layoutSizingHorizontal = 'FIXED';
  return f;
}
function aiTag() { return chip('AI', 'green', 'sparkle'); }

// ---------- 页面骨架 ----------
function statusBar(dark) {
  const c = dark ? C.white : C.ink;
  const b = fixed(box('状态栏', { dir: 'HORIZONTAL', pad: [0, 24, 0, 30], align: 'SPACE_BETWEEN', cross: 'CENTER' }), 390, 44);
  put(b, txt('9:41', 'smallB', c), 'HUG');
  const right = box('信号/Wi-Fi/电量', { dir: 'HORIZONTAL', gap: 6, cross: 'CENTER' });
  put(b, right, 'HUG');
  const sig = figma.createNodeFromSvg(`<svg width="18" height="12" viewBox="0 0 18 12" fill="${c}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>`);
  sig.name = '信号'; put(right, sig, null);
  const wifi = figma.createNodeFromSvg(`<svg width="16" height="12" viewBox="0 0 16 12" fill="${c}"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.3-1.4A10.5 10.5 0 0 0 8 .3 10.5 10.5 0 0 0 .7 3.2L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.8 6.8 0 0 0 8 3.9a6.8 6.8 0 0 0-4.7 1.8l1.3 1.4C5.5 6.3 6.7 5.8 8 5.8zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.5l1.5-1.6c-.4-.4-.9-.6-1.5-.6z"/></svg>`);
  wifi.name = 'Wi-Fi'; put(right, wifi, null);
  const batt = fixed(box('电量', { fill: c, radius: 4, align: 'CENTER', cross: 'CENTER' }), 27, 14);
  put(right, batt, null);
  put(batt, txt('76', 'tiny', dark ? C.dark : C.bg, 'CENTER'), 'HUG');
  return b;
}
function navBar(title, o = {}) {
  const b = fixed(box('导航栏', { dir: 'HORIZONTAL', pad: [0, 12, 0, 12], cross: 'CENTER' }), 390, 48);
  const l = fixed(box('左侧', { dir: 'HORIZONTAL', gap: 2, cross: 'CENTER' }), 90, 40);
  put(b, l, null);
  if (o.back) { put(l, ico('back', C.ink, 22), null); put(l, txt('返回', 'body'), 'HUG'); }
  put(b, txt(title, 'h2', C.ink, 'CENTER'));
  const r = fixed(box('右侧', { dir: 'HORIZONTAL', align: 'MAX', cross: 'CENTER' }), 90, 40);
  put(b, r, null);
  if (o.right) put(r, o.right, o.right.layoutMode && o.right.layoutMode !== 'NONE' ? 'HUG' : null);
  return { b, l };
}
function tabBar(active) {
  const bar = box('标签栏', { dir: 'HORIZONTAL', pad: [8, 8, 24, 8], fill: C.card });
  bar.strokes = solid(C.line); bar.strokeAlign = 'INSIDE'; bar.strokeTopWeight = 1; bar.strokeBottomWeight = 0; bar.strokeLeftWeight = 0; bar.strokeRightWeight = 0;
  const items = {};
  for (const [n, i] of [['今天', 'calendar'], ['收件箱', 'inbox'], ['学习', 'book'], ['我的', 'user']]) {
    const on = n === active;
    const it = fixed(box('标签/' + n, { gap: 2, align: 'CENTER', cross: 'CENTER' }), 90, 44);
    put(bar, it, 'FILL');
    put(it, ico(i, on ? C.accent : C.ink3, 22, on ? 2.2 : 1.8), null);
    put(it, txt(n, 'tiny', on ? C.accent : C.ink3, 'CENTER'), 'HUG');
    items[n] = it;
  }
  return { bar, items };
}
function note(x, y, s) {
  const t = txt('设计说明：' + s, 'small', C.ink2);
  t.textAutoResize = 'HEIGHT'; t.resize(390, t.height); t.x = x; t.y = y; t.name = '设计说明';
  figma.currentPage.appendChild(t);
}
function screen(key, name, colIdx, rowKey, o = {}) {
  const x = colIdx * COL, y = ROWS[rowKey];
  const s = fixed(box(name, { fill: o.bg || C.bg }), 390, 844);
  s.x = x; s.y = y; s.clipsContent = true;
  figma.currentPage.appendChild(s);
  S[key] = s;
  put(s, statusBar(!!o.dark));
  let nav = null;
  if (o.nav) { nav = navBar(o.nav, o); put(s, nav.b); }
  const body = box('内容', { gap: o.gap || 12, pad: o.pad || [8, 16, 16, 16] });
  put(s, body, 'FILL', true);
  let tab = null;
  if (o.tab) { tab = tabBar(o.tab); put(s, tab.bar); }
  return { s, body, nav, tab };
}
function rowTitle(s, y) {
  const t = txt(s, 'h1'); t.x = 0; t.y = y; figma.currentPage.appendChild(t);
}

// ---------- 作息簿零件 ----------
function aiInput(p, placeholder) {
  const f = box('一句话输入', { dir: 'HORIZONTAL', gap: 8, pad: [10, 10, 10, 14], fill: C.card, radius: 14, cross: 'CENTER', stroke: C.accentLight2 });
  put(p, f);
  put(f, ico('sparkle', C.accent, 18), null);
  put(f, txt(placeholder || '一句话改日程、记进度、加任务', 'small', C.ink3));
  put(f, circ('语音', 34, C.accentLight, ico('mic', C.accentDark, 18)), null);
  return f;
}
// 时间轴一行：时间、分类色条、标题、右侧状态
function tickCircle(on) {
  const c = fixed(box(on ? '已勾' : '未勾', { fill: on ? C.accent : C.white, radius: 11, align: 'CENTER', cross: 'CENTER', stroke: on ? C.accent : C.line, strokeW: 2 }), 22, 22);
  if (on) put(c, ico('check', C.white, 14, 3), null);
  return c;
}
function slot(p, time, title, cat, right, sub, dim, tick) {
  const r = box(time + ' ' + title, { dir: 'HORIZONTAL', gap: 10, pad: [9, 0, 9, 0], cross: 'CENTER' });
  put(p, r);
  if (tick !== undefined) put(r, tick === 'free' ? fixed(box('空', {}), 22, 22) : tickCircle(tick), null);
  const t = fixed(box('时间', { cross: 'MIN' }), 44, 20);
  put(r, t, null);
  put(t, txt(time, 'small', C.ink3), 'HUG');
  bar(r, 4, 34, cat);
  const c = col(r, '文字');
  put(c, txt(title, 'bodyB', dim ? C.ink3 : C.ink));
  if (sub) put(c, txt(sub, 'tiny', C.ink2));
  if (right) put(r, right, right.layoutMode && right.layoutMode !== 'NONE' ? 'HUG' : null);
  return r;
}
function sheetHeader(p, title, sub) {
  const h = col(p, '标题', 2);
  put(h, txt(title, 'h1'));
  if (sub) put(h, txt(sub, 'small', C.ink2));
}
// 预览清单：[类型, 内容]
function preview(p, items, title) {
  const c = card(title || '预览', { gap: 8 });
  put(p, c);
  const head = row(c, '标题', 6);
  put(head, txt(title || '会这样改', 'h2'));
  put(head, aiTag(), 'HUG');
  for (const [k, v] of items) {
    const r = row(c, k + v, 8, 'MIN');
    put(r, chip(k, k === '移出' ? 'red' : k === '压缩' ? 'warn' : k === '新增' ? 'green' : 'gray'), 'HUG');
    put(r, txt(v, 'small'));
  }
  return c;
}
function confirmBar(p, ok, no) {
  const r = row(p, '确认', 10);
  put(r, btn(no || '取消', 'line', 50), 'FILL');
  put(r, btn(ok || '确认改', 'primary', 50, 'check'), 'FILL');
  return r;
}
function phoneWallpaper(s) { s.fills = [{ type: 'GRADIENT_LINEAR', gradientTransform: [[0.6, 0.8, 0], [-0.8, 0.6, 0.6]], gradientStops: [{ position: 0, color: { ...rgb('#2E4A1E'), a: 1 } }, { position: 1, color: { ...rgb('#0E1A0A'), a: 1 } }] }]; }
function notif(p, title, text, actions) {
  const n = box('通知/' + title, { gap: 6, pad: 14, fill: C.white, alpha: 0.86, radius: 18 });
  put(p, n);
  const h = row(n, '来源', 6);
  put(h, circ('图标', 20, C.accent, ico('calendar', C.white, 12)), null);
  put(h, txt('三三作息簿 · 现在', 'tiny', C.ink2));
  put(n, txt(title, 'bodyB'));
  put(n, txt(text, 'small', C.ink));
  if (actions) {
    const a = row(n, '操作', 6);
    for (const [label, kind] of actions) put(a, btn(label, kind, 36, null, 80), 'FILL');
  }
  return n;
}

// ---------- V1.0 ----------
function buildV10() {
  let s, body, nav, tab;
  // ① 今天
  ({ s, body, tab } = screen('Today', 'A1 今天', 0, 'A', { tab: '今天',
    note: '首页回答三件事：现在该做什么、今天还剩什么、想改就说一句。时间轴每一项右侧显示计划还是实际，已完成的写实际时间。' }));
  const head = row(body, '日期', 8, 'CENTER');
  put(head, ico('back', C.ink2, 22), null);
  const dc = col(head, '日期文字');
  dc.counterAxisAlignItems = 'CENTER';
  put(dc, txt('10月26日', 'date', C.ink, 'CENTER'), 'HUG');
  put(dc, txt('星期一 · 今天', 'small', C.ink2, 'CENTER'), 'HUG');
  put(head, ico('right', C.ink2, 22), null);
  const hr = row(body, '记录与日期', 8);
  put(hr, chip('记录 4/5 项', 'green', 'check'), 'HUG');
  spacer(hr);
  const dp = box('跳到某天', { dir: 'HORIZONTAL', gap: 4, pad: [3, 8, 3, 8], fill: C.card, radius: 8, stroke: C.line, cross: 'CENTER' });
  put(hr, dp, 'HUG');
  put(dp, txt('2026/10/26', 'tiny', C.ink2), 'HUG'); put(dp, ico('calendar', C.ink2, 12), null);
  const now = card('现在', { fill: C.dark, gap: 8, pad: 16 });
  put(body, now);
  put(now, txt('现在 · 20:00–20:45', 'tiny', C.accentLight2));
  put(now, txt('英语听力', 'h1', C.white));
  const nr = row(now, '操作', 8);
  link(put(nr, btn('完成', 'primary', 40, 'check'), 'FILL'), 'Actual');
  link(put(nr, btn('被打断了', 'light', 40), 'FILL'), 'Interrupt');
  link(aiInput(body), 'Preview');
  const quick = row(body, '快捷', 6);
  link(put(quick, btn('排明天', 'light', 30, null, 70), null), 'PlanDay');
  link(put(quick, btn('随手记', 'light', 30, null, 70), null), 'Voice');
  put(quick, btn('⟳ 没做完的往后排', 'light', 30, null, 140), null);
  const tl = card('时间轴', { gap: 0, pad: [4, 14, 4, 14] });
  put(body, tl);
  slot(tl, '07:00', '起床、洗漱、早餐', C.life, chip('07:10–08:05', 'warn'), null, false, true);
  slot(tl, '09:00', '上午学习：编程课', C.learn, chip('09:12–11:40', 'warn'), null, false, true);
  slot(tl, '12:00', '午饭、午休', C.life, chip('没记录', 'gray'), null, false, false);
  slot(tl, '13:30', '下午工作', C.work, chip('13:30–17:40', 'green'), null, false, true);
  slot(tl, '20:00', '英语听力', C.learn, chip('进行中', 'learn'), null, false, false);
  slot(tl, '20:45', '散步', C.exercise, chip('待开始', 'gray'), null, false, false);

  // ② 到点通知
  ({ s, body } = screen('Notify', 'A2 到点通知', 1, 'A', { dark: true, pad: [40, 14, 16, 14], gap: 14,
    note: '一个活动只推 1 条：开始时问「开始了吗」，顺带问上一项做完没有，不再单独推结束。只有标了提醒的活动才推，每天最多 8 条，睡眠时段不推。' }));
  phoneWallpaper(s);
  put(body, txt('20:00', 'clock', C.white, 'CENTER'));
  put(body, txt('10月26日 星期一', 'body', C.white, 'CENTER'));
  spacer(body);
  link(notif(body, '英语听力 20:00–20:45，开始了吗？', '上一项「下午工作」做完了吗？', [['开始', 'primary'], ['晚 15 分钟', 'line'], ['跳过', 'line']]), 'Reply');
  notif(body, '今天的核对', '还有 2 项没记录，睡前花 30 秒勾一下？');

  // ③ 通知里直接回复
  ({ s, body } = screen('Reply', 'A3 通知里直接回复', 2, 'A', { dark: true, pad: [40, 14, 16, 14], gap: 14,
    note: '长按通知直接回一句话，和 App 里的一句话改日程是同一个入口；改完通知里给出结果，并留撤销入口，App 里 7 秒内也可撤销。' }));
  phoneWallpaper(s);
  put(body, txt('20:01', 'clock', C.white, 'CENTER'));
  spacer(body);
  notif(body, '英语听力 20:00–20:45，开始了吗？', '上一项「下午工作」做完了吗？');
  const inp = box('回复输入', { dir: 'HORIZONTAL', gap: 8, pad: [12, 12, 12, 14], fill: C.white, radius: 16, cross: 'CENTER' });
  put(body, inp);
  put(inp, txt('今晚不听了，改成复习一小时', 'body'));
  put(inp, circ('发送', 32, C.accent, ico('right', C.white, 18)), null);
  const done = box('结果', { gap: 4, pad: 14, fill: C.accentLight, radius: 16 });
  put(body, done);
  put(done, txt('已改好', 'bodyB', C.accentDark));
  put(done, txt('20:00–21:00 英语听力改成复习，下午工作记为已完成。', 'small'));
  put(done, txt('撤销', 'smallB', C.accentDark));

  // ④ 计划 vs 实际
  ({ s, body, nav } = screen('Actual', 'A4 计划 vs 实际', 3, 'A', { nav: '计划 vs 实际', back: true,
    note: '实际时间来自通知里的开始、App 和小组件里的打勾、晚间核对。没记录的不猜，单独标出来，也不计入后面的优化统计。' }));
  link(nav.l, 'Today');
  const sum = card('概览', { dir: 'HORIZONTAL', gap: 0, pad: [14, 8, 14, 8] });
  put(body, sum);
  for (const [n, l] of [['4/5', '有记录'], ['80%', '按计划完成'], ['+52', '分钟偏差']]) {
    const c = box(l, { gap: 2, cross: 'CENTER' }); put(sum, c);
    put(c, txt(n, 'h1', C.accentDark, 'CENTER'), 'HUG'); put(c, txt(l, 'tiny', C.ink2, 'CENTER'), 'HUG');
  }
  const cmp = card('对比', { gap: 10 });
  put(body, cmp);
  const hdr = row(cmp, '表头', 8);
  put(hdr, txt('活动', 'smallB', C.ink2)); put(hdr, txt('计划', 'smallB', C.ink2), 'HUG'); put(hdr, txt('实际', 'smallB', C.ink2), 'HUG');
  for (const [a, p, r, t] of [['起床、洗漱、早餐', '07:00–08:00', '07:10–08:05', 'warn'], ['上午学习：编程课', '09:00–11:30', '09:12–11:40', 'warn'], ['午饭、午休', '12:00–13:30', '没记录', 'gray'], ['下午工作', '13:30–17:30', '13:30–17:40', 'green'], ['晚饭', '18:00–19:00', '18:05–18:50', 'green']]) {
    divider(cmp);
    const r2 = row(cmp, a, 8);
    put(r2, txt(a, 'body')); put(r2, txt(p, 'small', C.ink2), 'HUG'); put(r2, chip(r, t), 'HUG');
  }
  const tip = card('小结', { fill: C.accentLight, gap: 4 });
  put(body, tip);
  put(tip, txt('偏差最大：上午学习：编程课，偏了 22 分钟', 'bodyB'));

  // ⑤ 晚间核对
  ({ s, body, nav } = screen('Evening', 'A5 晚间核对', 4, 'A', { nav: '今天的核对', back: true,
    note: '每天只推 1 条，把没记录的活动列成清单批量勾选，30 秒内完成；不想核对可以直接关掉，不会追问。' }));
  link(nav.l, 'Today');
  sheetHeader(body, '还有 2 项没记录', '勾一下就好');
  const ev = card('清单', { gap: 12 });
  put(body, ev);
  for (const [t, cat, st] of [['午饭、午休 12:00–13:30', C.life, 0], ['散步 20:45–21:30', C.exercise, 1]]) {
    const r = row(ev, t, 8);
    bar(r, 4, 28, cat);
    put(r, txt(t, 'body'));
    const seg = box('选项', { dir: 'HORIZONTAL', gap: 4 }); put(r, seg, 'HUG');
    ['做了', '没做', '改时间'].forEach((l, i) => put(seg, chip(l, i === st ? (i === 1 ? 'red' : 'green') : 'gray'), 'HUG'));
  }
  spacer(body);
  link(put(body, btn('一起确认', 'primary', 52, 'check')), 'Today');

  // ⑥ 一句话改日程预览
  ({ s, body, nav } = screen('Preview', 'A6 一句话改日程', 5, 'A', { nav: '一句话改日程', back: true,
    note: '大模型只把这句话翻译成操作；时间怎么排由规则决定：已开始、已完成和睡觉时间不动，空档先吸收，放不下再压缩。确认才写入，7 秒内可撤销。' }));
  link(nav.l, 'Today');
  const said = box('原话', { pad: 14, fill: C.dark, radius: 14 });
  put(body, said);
  put(said, txt('晚上九点到十点加个复习，散步不去了', 'body', C.white));
  preview(body, [['新增', '21:00–22:00 复习'], ['移出', '20:45–21:30 散步']]);
  spacer(body);
  link(confirmBar(body), 'Today');

  // ⑦ 语音随手记
  ({ s, body, nav } = screen('Voice', 'A7 语音随手记', 6, 'A', { nav: '随手记', back: true,
    note: '语音用手机系统识别转成文字，只把文字发给模型。随手记改的是实际记录，后面的计划按顺延规则让位，同样先预览。' }));
  link(nav.l, 'Today');
  spacer(body);
  const mic = col(body, '正在听', 12);
  mic.counterAxisAlignItems = 'CENTER';
  const mc = circ('麦克风', 120, C.accentLight, ico('mic', C.accentDark, 52));
  mc.strokes = solid(C.accentLight2); mc.strokeWeight = 12; mc.strokeAlign = 'OUTSIDE';
  put(mic, mc, null);
  put(mic, txt('“刚才晚饭多吃了半小时，后面都顺延”', 'h2', C.ink, 'CENTER'), 'HUG');
  put(mic, txt('松开就整理', 'small', C.ink2, 'CENTER'), 'HUG');
  spacer(body);
  preview(body, [['调整', '英语听力 20:00 → 20:30'], ['调整', '散步 20:45 → 21:15'], ['调整', '睡前阅读 22:00 → 22:15']]);
  link(confirmBar(body), 'Today');

  // ⑧ 一句话排一天
  ({ s, body, nav } = screen('PlanDay', 'A8 一句话排一天', 0, 'B', { nav: '排明天', back: true,
    note: 'AI 把一句话拆成任务、估计时长；规则把任务放进明天模板的空档，冲突按优先级让位。估计时长旁边标「AI 估计」，用户可以直接改。' }));
  link(nav.l, 'Today');
  const s2 = box('原话', { pad: 14, fill: C.dark, radius: 14 });
  put(body, s2);
  put(s2, txt('明天要健身一小时、取快递', 'body', C.white));
  const tasks = card('拆出来的任务', { gap: 8 });
  put(body, tasks);
  const th = row(tasks, '标题', 6); put(th, txt('拆成 2 件事', 'h2')); put(th, aiTag(), 'HUG');
  for (const [t, d, c] of [['健身', '1 小时', C.exercise], ['取快递', '15 分钟', C.life]]) {
    const r = row(tasks, t, 8); bar(r, 4, 22, c); put(r, txt(t, 'body')); put(r, chip(d + ' · AI 估计', 'gray'), 'HUG');
  }
  const plan = card('排进明天', { gap: 0, pad: [6, 14, 6, 14] });
  put(body, plan);
  slot(plan, '17:30', '取快递', C.life, chip('新增', 'green'));
  slot(plan, '19:00', '健身', C.exercise, chip('新增', 'green'));
  spacer(body);
  link(confirmBar(body, '排进明天'), 'Today');

  // ⑨ 任务收件箱
  ({ s, body, tab } = screen('Inbox', 'A9 任务收件箱', 1, 'B', { tab: '收件箱',
    note: '想到就丢进来，不用马上决定什么时候做。AI 估计时长和类别，规则按截止日和空档给出建议，一键放进去；也可以拖到某一天。' }));
  link(tab.items['今天'], 'Today');
  const ih = row(body, '标题', 8);
  put(ih, txt('收件箱', 'date')); put(ih, chip('4 件', 'gray'), 'HUG');
  aiInput(body, '想到什么就丢进来，比如：周五前交实验报告');
  for (const [t, due, sug, c] of [['交实验报告', '周五截止', '周三 15:00–17:00 空档', C.learn], ['给导师回邮件', '今天', '今天 17:10–17:30', C.work], ['买洗衣液', '不急', '周六上午采购时顺便', C.life]]) {
    const k = card(t, { gap: 8 });
    put(body, k);
    const r = row(k, '标题', 8); bar(r, 4, 20, c); put(r, txt(t, 'bodyB')); put(r, chip(due, due === '今天' ? 'warn' : 'gray'), 'HUG');
    const r2 = row(k, '建议', 8);
    put(r2, ico('sparkle', C.accent, 14), null);
    put(r2, txt('建议放在 ' + sug, 'small', C.ink2));
    put(r2, btn('放进去', 'light', 32, null, 76), null);
  }

  // ⑩ 被打断一键重排
  ({ s, body, nav } = screen('Interrupt', 'A10 被打断一键重排', 2, 'B', { nav: '被打断了', back: true,
    note: '沿用网页版的顺延规则：已完成和睡觉时间不动，空档先吸收，放不下时先压缩运动、护理，再压缩学习，最后才移出重要性低的。' }));
  link(nav.l, 'Today');
  sheetHeader(body, '耽误了多久？', '后面的安排会往后让');
  const opts = row(body, '时长', 8);
  ['15 分钟', '30 分钟', '45 分钟', '1 小时'].forEach((l, i) => put(opts, btn(l, i === 2 ? 'primary' : 'line', 44, null, 80), 'FILL'));
  preview(body, [['调整', '英语听力 20:00 → 20:45'], ['调整', '散步 20:45 → 21:30'], ['调整', '睡前阅读 22:00 → 22:15'], ['压缩', '睡前阅读 45 → 30 分钟']], '后面会这样让');
  spacer(body);
  link(confirmBar(body, '这样排'), 'Today');

  // ⑪ 桌面小组件
  ({ s, body } = screen('Widget', 'A11 桌面小组件', 3, 'B', { dark: true, pad: [24, 18, 16, 18], gap: 18,
    note: '中号组件显示现在该做和下一项，可以直接打勾；小号组件显示今日学习进度。打勾直接写入实际记录，不用打开 App。' }));
  phoneWallpaper(s);
  const wm = box('中号组件', { gap: 10, pad: 16, fill: C.bg, radius: 22 });
  put(body, wm);
  put(wm, txt('现在 · 20:00–20:45', 'tiny', C.ink2));
  const wr = row(wm, '现在', 8);
  bar(wr, 4, 26, C.learn); put(wr, txt('英语听力', 'h2')); put(wr, circ('打勾', 32, C.accent, ico('check', C.white, 18, 2.6)), null);
  divider(wm);
  const wn = row(wm, '下一项', 8);
  put(wn, txt('下一项', 'tiny', C.ink2), 'HUG'); put(wn, txt('20:45 散步', 'smallB'));
  const ws = row(body, '小组件', 18);
  const small = fixed(box('小号组件', { gap: 6, pad: 14, fill: C.bg, radius: 22 }), 160, 160);
  put(ws, small, null);
  put(small, txt('今日学习', 'tiny', C.ink2));
  put(small, txt('1/3', 'big', C.accentDark));
  put(small, txt('上午学习：编程课', 'tiny', C.ink2));
  const apps = fixed(box('应用图标', { dir: 'HORIZONTAL', gap: 14, cross: 'MIN' }), 160, 160);
  apps.layoutWrap = 'WRAP'; apps.counterAxisSpacing = 14;
  put(ws, apps, null);
  for (const c of ['#D9A24A', '#4A88D9', '#D96A4A', C.accent]) { const a = fixed(box('图标', { fill: c, radius: 16 }), 64, 64); put(apps, a, null); }

  // ⑫ 基础模板
  ({ s, body, tab } = screen('Template', 'A12 基础模板', 4, 'B', { tab: '我的', nav: '基础模板',
    note: '新的一天按模板生成。每项可以单独设提醒；铃铛亮的才会推送，提醒总数实时显示，超过每天上限时提示。' }));
  const lim = card('提醒', { fill: C.accentLight, dir: 'HORIZONTAL', gap: 8, cross: 'CENTER' });
  put(body, lim);
  put(lim, ico('bell', C.accentDark, 18), null); put(lim, txt('每天提醒 4 条，上限 8 条', 'smallB', C.accentDark));
  const tp = card('模板', { gap: 0, pad: [6, 14, 6, 14] });
  put(body, tp);
  for (const [t, n, c, on] of [['07:00', '起床、洗漱、早餐', C.life, 0], ['09:00', '上午学习：编程课', C.learn, 1], ['12:00', '午饭、午休', C.life, 0], ['13:30', '下午工作', C.work, 1], ['18:00', '晚饭', C.life, 0], ['20:00', '英语听力', C.learn, 1], ['20:45', '散步', C.exercise, 0], ['22:00', '睡前阅读', C.learn, 1]]) {
    slot(tp, t, n, c, ico('bell', on ? C.accent : C.line, 18, on ? 2.4 : 2));
  }

  // ⑬ 学习项目
  ({ s, body, tab } = screen('Projects', 'A13 学习项目', 5, 'B', { tab: '学习', nav: '学习项目', right: ico('plus', C.accent, 22),
    note: '每天目标由规则算：剩余量 ÷ 剩余天数。打勾关联的活动会自动推进度；落后时提醒，给出提高每天目标或推迟截止两个选项。' }));
  link(tab.items['收件箱'], 'Inbox');
  for (const [t, p, d, frac, c, warn] of [['编程入门视频课', '8/30 集', '每天 1 集 · 11月10日截止', 0.27, C.learn, '照现在的速度会差 7 集'], ['一本小说', '96/320 页', '每天 20 页 · 11月07日截止', 0.3, C.learn], ['核心词汇', '420/1500 个', '每天 50 个 · 11月25日截止', 0.28, C.learn]]) {
    const k = card(t, { gap: 8 });
    put(body, k);
    const r = row(k, '标题', 8); bar(r, 4, 20, c); put(r, txt(t, 'bodyB')); put(r, txt(p, 'smallB', C.accentDark), 'HUG');
    progress(k, frac, c);
    put(k, txt(d, 'small', C.ink2));
    if (warn) { const w = row(k, '落后', 6); put(w, chip(warn, 'warn'), 'HUG'); }
    const ka = row(k, '操作', 8);
    put(ka, btn('记进度', 'light', 30, null, 70), null);
    link(put(ka, btn('编辑', 'line', 30, null, 56), null), 'ProjEdit');
  }

  // ⑭ 首次使用与数据授权
  ({ s, body } = screen('Welcome', 'A14 首次使用与数据授权', 6, 'B', { pad: [24, 18, 18, 18], gap: 14,
    note: '数据默认存在手机里，不需要账号。三项授权分别说明用途，都可以不开：不开通知就靠打勾和晚间核对，不开统计就只在本机统计。' }));
  put(body, txt('三三作息簿', 'date', C.accentDark));
  put(body, txt('记录、优化、帮你安排每一天。\n日程默认只存在你的手机里。', 'body', C.ink2));
  for (const [i, t, d, on] of [['bell', '通知', '只提醒你标了铃铛的活动，每天最多 8 条，睡觉时不打扰', 1], ['mic', '语音识别', '在手机上转成文字，只把文字发给 AI', 1], ['chart', '匿名使用统计', '帮我们改进 AI；不含日程原文，可以随时关掉', 0]]) {
    const k = card(t, { dir: 'HORIZONTAL', gap: 12, cross: 'CENTER' });
    put(body, k);
    put(k, circ('图标', 40, C.accentLight, ico(i, C.accentDark, 20)), null);
    const c = col(k, '文字', 2); put(c, txt(t, 'bodyB')); put(c, txt(d, 'small', C.ink2));
    const tg = fixed(box('开关', { dir: 'HORIZONTAL', pad: 2, fill: on ? C.accent : C.line, radius: 13, align: on ? 'MAX' : 'MIN', cross: 'CENTER' }), 44, 26);
    put(tg, circ('圆点', 22, C.white), null); put(k, tg, null);
  }
  spacer(body);
  link(put(body, btn('从模板开始', 'primary', 52)), 'Template');
  put(body, txt('也可以先用示例数据看看', 'small', C.accentDark, 'CENTER'));
}

// ---------- V1.1 ----------
function buildV11() {
  let s, body, nav;
  ({ s, body, nav } = screen('Weekly', 'B1 每周报告', 0, 'C', { nav: '上周小结', back: true,
    note: '数字由规则统计，AI 只负责写成人话和给出可能的原因，原因标明是推测。建议采纳前同样先预览；报告写明数据覆盖了多少。' }));
  const st = card('数字', { dir: 'HORIZONTAL', gap: 0, pad: [14, 8, 14, 8] });
  put(body, st);
  for (const [n, l] of [['76%', '按计划完成'], ['86%', '有记录'], ['11.5h', '学习时长']]) {
    const c = box(l, { gap: 2, cross: 'CENTER' }); put(st, c);
    put(c, txt(n, 'h1', C.accentDark, 'CENTER'), 'HUG'); put(c, txt(l, 'tiny', C.ink2, 'CENTER'), 'HUG');
  }
  const ai = card('AI 小结', { gap: 8 });
  put(body, ai);
  const ah = row(ai, '标题', 6); put(ah, txt('这一周', 'h2')); put(ah, aiTag(), 'HUG');
  put(ai, txt('上午的学习基本都按时完成；午饭后的工作有 4 天推迟 30 分钟以上，可能是午饭后容易犯困。', 'body'));
  const sg = card('建议', { gap: 8 });
  put(body, sg);
  put(sg, txt('下周模板可以这样改', 'h2'));
  for (const t of ['下午工作改到 14:00 开始，午休多留半小时', '散步 7 天里删了 5 天，改成每周 3 次']) {
    const r = row(sg, t, 8); put(r, txt(t, 'small')); put(r, btn('采纳', 'light', 30, null, 60), null);
  }

  ({ s, body, nav } = screen('Energy', 'B2 精力时段', 1, 'C', { nav: '精力时段', back: true,
    note: '高效时段按近 2 周打勾的准时程度和完成率算，不靠模型猜；难的学习建议挪到高效时段，挪动同样先预览。' }));
  sheetHeader(body, '你的高效时段', '最近 14 天，按准时开始和完成率算');
  const hm = card('热力', { gap: 8 });
  put(body, hm);
  const hr = row(hm, '小时', 3, 'MAX');
  const vals = [0.3, 0.7, 0.95, 0.9, 0.6, 0.35, 0.3, 0.5, 0.65, 0.55, 0.4, 0.45, 0.6, 0.5, 0.3];
  vals.forEach(v => { const r = figma.createRectangle(); r.resize(18, 20 + v * 100); r.cornerRadius = 4; r.fills = solid(v > 0.8 ? C.accent : v > 0.5 ? C.accentLight2 : C.line); hr.appendChild(r); });
  const lb = row(hm, '刻度', 8); lb.primaryAxisAlignItems = 'SPACE_BETWEEN';
  ['08', '12', '16', '20', '22'].forEach(t => put(lb, txt(t, 'tiny', C.ink3), 'HUG'));
  const best = card('结论', { fill: C.accentLight, gap: 6 });
  put(body, best);
  put(best, txt('09:00–11:30 最高效', 'h2', C.accentDark));
  put(best, txt('睡前阅读现在排在 22:00，那时完成率只有 55%。', 'small'));
  put(best, btn('挪到 09:00 试一周', 'primary', 44));

  ({ s, body, nav } = screen('Estimate', 'B3 时长校准与目标可行性', 2, 'C', { nav: '新建', back: true,
    note: '时长校准：AI 判断任务属于哪一类，规则用实际记录算这类任务的平均时长。可行性：按最近实际每天可用的学习时间算能不能按期完成，模型不参与计算。' }));
  const t1 = card('时长校准', { gap: 8 });
  put(body, t1);
  put(t1, txt('写周报 · 1 小时', 'bodyB'));
  const tw = row(t1, '提示', 6); put(tw, ico('clock', C.warn, 16), null); put(tw, txt('你最近 5 次写报告平均用了 1 小时 35 分', 'small', C.warn));
  const tb = row(t1, '按钮', 8); put(tb, btn('按 1.5 小时排', 'primary', 38), 'FILL'); put(tb, btn('还是 1 小时', 'line', 38), 'FILL');
  const t2 = card('目标可行性', { gap: 8 });
  put(body, t2);
  put(t2, txt('机器学习课 · 113 集 · 12月20日截止', 'bodyB'));
  put(t2, txt('按你最近每天实际学 1.2 小时，预计 12月28日学完，晚 8 天。', 'small'));
  progress(t2, 0.78, C.warn);
  const tb2 = row(t2, '按钮', 8); put(tb2, btn('每天 3 集', 'light', 38), 'FILL'); put(tb2, btn('推迟到 12/28', 'line', 38), 'FILL');
}

// ---------- V1.2 ----------
function buildV12() {
  let s, body, nav;
  ({ s, body, nav } = screen('Screenshot', 'C1 截图导入', 3, 'C', { nav: '从截图添加', back: true,
    note: '看图模型只读出时间和事项，日期换算和排进去由规则完成，先预览再写入；截图只用于这一次识别，不保存。' }));
  const shot = card('截图', { fill: '#EDE8D6', gap: 6, pad: 14 });
  put(body, shot);
  put(shot, txt('课题组群通知', 'tiny', C.ink2));
  const bub = box('消息', { pad: 12, fill: C.white, radius: 12 }); put(shot, bub);
  put(bub, txt('各位同学：本周四下午 3 点组会改到 302 会议室；周五晚 8 点前提交周报。', 'small'));
  preview(body, [['新增', '周四 10/29 15:00–16:00 组会 · 302'], ['新增', '收件箱：周五 20:00 前交周报']], '读出了 2 件事');
  spacer(body);
  confirmBar(body, '添加');

  ({ s, body, nav } = screen('Review', 'C2 每晚复盘', 4, 'C', { nav: '1 分钟复盘', back: true,
    note: '每晚设定时间问一次，最多 3 个问题，可以跳过；AI 把回答整理成当天小结，进入每周报告。' }));
  // 聊天气泡：固定宽度 280，自己的回答靠右
  const q = (t, me) => {
    const line = box('一行', { dir: 'HORIZONTAL', align: me ? 'MAX' : 'MIN' });
    put(body, line);
    const b = box(me ? '我的回答' : 'AI 提问', { pad: 12, fill: me ? C.accent : C.card, radius: 14 });
    put(line, b, null);
    b.layoutSizingHorizontal = 'FIXED'; b.resize(280, b.height);
    put(b, txt(t, 'body', me ? C.white : C.ink));
    return b;
  };
  q('今天最满意的一件事是什么？');
  q('上午把编程课连上了两集', true);
  q('下午学习推迟了 40 分钟，是因为什么？');
  q('午饭后太困了', true);
  const sm = card('今天的小结', { fill: C.accentLight, gap: 6 });
  put(body, sm);
  const smh = row(sm, '标题', 6); put(smh, txt('今天的小结', 'h2')); put(smh, aiTag(), 'HUG');
  put(sm, txt('上午状态好，编程课超额 1 集；午饭后犯困导致学习推迟。明天可以试试把学习放在上午。', 'small'));

  ({ s, body, nav } = screen('Goal', 'C3 目标拆解', 5, 'C', { nav: '定个目标', back: true,
    note: 'AI 拆出学习项目草稿，每天目标仍由规则按截止日算；确认后才建项目，之后和普通学习项目一样跟踪。' }));
  const g = box('原话', { pad: 14, fill: C.dark, radius: 14 });
  put(body, g);
  put(g, txt('三个月雅思到 7 分', 'body', C.white));
  const gp = card('拆解', { gap: 10 });
  put(body, gp);
  const gh = row(gp, '标题', 6); put(gh, txt('拆成 4 个学习项目', 'h2')); put(gh, aiTag(), 'HUG');
  for (const [t, d] of [['听力', '剑桥真题 32 套 · 每天 1 套 · 1月25日截止'], ['阅读', '真题 32 篇 · 每天 1 篇'], ['写作', '大小作文各 24 篇 · 每 2 天 1 篇'], ['口语', '题库 3 个月 · 每天 30 分钟']]) {
    const r = row(gp, t, 8); bar(r, 4, 32, C.learn);
    const c = col(r, '文字'); put(c, txt(t, 'bodyB')); put(c, txt(d, 'tiny', C.ink2));
  }
  put(body, txt('每天约 2.5 小时，按你最近的空闲时间排得下', 'small', C.accentDark));
  spacer(body);
  confirmBar(body, '创建 4 个项目');

  ({ s, body, nav } = screen('Focus', 'C4 专注计时', 6, 'C', { nav: '专注', back: true, bg: C.dark, dark: true,
    note: '开始学习时计时，结束时实际时长自动写入记录；关联了学习项目的活动自动推进度。计时期间不推其他提醒。' }));
  nav.b.findAll(n => n.type === 'TEXT').forEach(n => { n.fills = solid(C.white); });
  nav.b.findAll(n => n.type === 'VECTOR').forEach(n => { n.strokes = solid(C.white); });
  spacer(body);
  const fc = col(body, '计时', 10); fc.counterAxisAlignItems = 'CENTER';
  const ring = figma.createFrame(); ring.name = '计时环'; ring.resize(220, 220); ring.fills = []; ring.clipsContent = false;
  const e1 = figma.createEllipse(); e1.resize(220, 220); e1.fills = solid(C.accentDark); e1.arcData = { startingAngle: 0, endingAngle: 2 * Math.PI, innerRadius: 0.9 }; ring.appendChild(e1);
  const e2 = figma.createEllipse(); e2.resize(220, 220); e2.fills = solid(C.accentLight2); e2.arcData = { startingAngle: -Math.PI / 2, endingAngle: -Math.PI / 2 + 2 * Math.PI * 0.64, innerRadius: 0.9 }; ring.appendChild(e2);
  const tt = txt('16:02', 'big', C.white, 'CENTER'); ring.appendChild(tt); tt.x = (220 - tt.width) / 2; tt.y = (220 - tt.height) / 2;
  put(fc, ring, null);
  put(fc, txt('编程入门视频课 第 9 集', 'h2', C.white, 'CENTER'), 'HUG');
  put(fc, chip('完成后 学编程 +1 集', 'green'), 'HUG');
  spacer(body);
  const fb = row(body, '按钮', 10);
  put(fb, btn('暂停', 'line', 50, 'pause'), 'FILL'); put(fb, btn('结束并记录', 'primary', 50, 'check'), 'FILL');
}

async function clearOld(keep) {
  const mine = s => s.name.startsWith(V + '/');
  for (const s of await figma.getLocalTextStylesAsync()) if (mine(s)) s.remove();
  for (const s of await figma.getLocalEffectStylesAsync()) if (mine(s)) s.remove();
  try { for (const c of await figma.variables.getLocalVariableCollectionsAsync()) if (c.name === '三三作息簿 ' + V + ' 颜色') c.remove(); } catch (e) { }
}

// ---------- 我的日程：编辑与数据 ----------
function formRow(p, label, value, ph, w) {
  const r = row(p, label, 8);
  const l = fixed(box('标签', { cross: 'MIN', align: 'CENTER' }), 64, 32); put(r, l, null);
  put(l, txt(label, 'small', C.ink2), 'HUG');
  const f = fixed(box('输入框', { dir: 'HORIZONTAL', pad: [0, 10, 0, 10], fill: C.white, radius: 8, stroke: C.line, cross: 'CENTER' }), w || 200, 34);
  put(r, f, w ? null : 'FILL');
  put(f, txt(value || ph || '', 'small', value ? C.ink : C.ink3));
  return r;
}
function buildMore() {
  let s, body, nav, tab;
  // A15 今天（往下滑）：发现了几件事、今日学习、添加活动
  ({ s, body, tab } = screen('TodayMore', 'A15 今天（往下滑）', 7, 'A', { tab: '今天' }));
  const sg = card('发现了几件事', { gap: 10 });
  put(body, sg);
  put(sg, txt('发现了几件事', 'h2'));
  const sg1 = col(sg, '落后', 6);
  put(sg1, txt('「编程入门视频课」照每天 1 集，到截止还会差 6 集。', 'small'));
  const sa1 = row(sg1, '操作', 6); put(sa1, btn('每天提到 1.5 集', 'primary', 30, null, 120), null); put(sa1, btn('推迟到 11月16日', 'line', 30, null, 120), null); put(sa1, btn('忽略', 'line', 30, null, 50), null);
  divider(sg);
  const sg2 = col(sg, '模板建议', 6);
  put(sg2, txt('最近 10 天里，有 7 天你都删掉了「散步」。', 'small'));
  const sa2 = row(sg2, '操作', 6); put(sa2, btn('从模板里删掉', 'primary', 30, null, 110), null); put(sa2, btn('忽略', 'line', 30, null, 50), null);
  const ls = card('今日学习', { gap: 8 });
  put(body, ls);
  const lh = row(ls, '标题', 8); put(lh, txt('今日学习', 'h2')); put(lh, txt('1/3 完成', 'tiny', C.ink3), 'HUG');
  progress(ls, 0.33, C.accent);
  const lc = row(ls, '学习项', 6);
  put(lc, chip('✓ 上午学习：编程课', 'green'), 'HUG'); put(lc, chip('○ 英语听力', 'gray'), 'HUG'); put(lc, chip('○ 睡前阅读', 'gray'), 'HUG');
  const tl2 = card('时间轴', { gap: 0, pad: [4, 14, 4, 14] });
  put(body, tl2);
  slot(tl2, '22:00', '睡前阅读', C.learn, chip('待开始', 'gray'), '完成后进度 +20', false, false);
  const sub = row(tl2, '细分', 8); sub.paddingLeft = 32; sub.paddingBottom = 8;
  put(sub, tickCircle(true), null); put(sub, txt('读第 8 章', 'small'));
  const fb = row(body, '底部操作', 8);
  link(put(fb, btn('＋ 添加活动', 'line', 34, null, 110), null), 'EditAct');
  put(fb, btn('用模板覆盖这天', 'line', 34, null, 130), null);

  // A16 添加活动
  ({ s, body, nav } = screen('EditAct', 'A16 添加活动', 8, 'A', { nav: '添加活动', back: true }));
  link(nav.l, 'Today');
  const f1 = card('表单', { gap: 10 });
  put(body, f1);
  formRow(f1, '名称', '复习高数');
  const kr = row(f1, '类型', 8); const kl = fixed(box('标签', { align: 'CENTER' }), 64, 28); put(kr, kl, null); put(kl, txt('类型', 'small', C.ink2), 'HUG');
  put(kr, chip('时间段', 'green'), 'HUG'); put(kr, chip('时间点', 'gray'), 'HUG');
  const tr = row(f1, '时间', 8); const tlb = fixed(box('标签', { align: 'CENTER' }), 64, 28); put(tr, tlb, null); put(tlb, txt('时间', 'small', C.ink2), 'HUG');
  for (const [i, t] of [[0, '15:00'], [1, '16:00']]) { if (i) put(tr, txt('到', 'small', C.ink2), 'HUG'); const tf = fixed(box('时间', { dir: 'HORIZONTAL', pad: [0, 10, 0, 10], fill: C.white, radius: 8, stroke: C.line, cross: 'CENTER' }), 86, 32); put(tr, tf, null); put(tf, txt(t, 'small'), 'HUG'); }
  const cr = row(f1, '分类', 6); cr.layoutWrap = 'WRAP'; cr.counterAxisSpacing = 6;
  const cl = fixed(box('标签', { align: 'CENTER' }), 64, 24); put(cr, cl, null); put(cl, txt('分类', 'small', C.ink2), 'HUG');
  for (const [n, c] of [['学习', C.learn], ['工作', C.work], ['运动', C.exercise], ['生活', C.life], ['护理', C.care], ['通勤', C.commute]]) {
    const cc = box('分类/' + n, { dir: 'HORIZONTAL', gap: 4, pad: [2, 8, 2, 8], fill: n === '学习' ? C.accentLight : C.white, radius: 10, stroke: n === '学习' ? C.accent : C.line, cross: 'CENTER' });
    put(cr, cc, 'HUG'); const dot = figma.createEllipse(); dot.resize(8, 8); dot.fills = solid(c); cc.appendChild(dot); put(cc, txt(n, 'tiny', C.ink), 'HUG');
  }
  formRow(f1, '所属大类', '', '可选，同大类合并统计');
  formRow(f1, '关联项目', '不关联');
  const rr = row(f1, '提醒', 8); const rl = fixed(box('标签', { align: 'CENTER' }), 64, 28); put(rr, rl, null); put(rl, txt('提醒', 'small', C.ink2), 'HUG');
  const tg = fixed(box('开关', { dir: 'HORIZONTAL', pad: 2, fill: C.accent, radius: 13, align: 'MAX', cross: 'CENTER' }), 44, 26); put(tg, circ('圆点', 22, C.white), null); put(rr, tg, null);
  const sb = card('细分安排', { gap: 8 });
  put(body, sb);
  const sbh = row(sb, '标题', 8); put(sbh, txt('细分安排', 'h2')); put(sbh, btn('＋ 加一项', 'light', 28, null, 76), null);
  formRow(sb, '第 1 项', '做 10 道题');
  spacer(body);
  const eb = row(body, '按钮', 10);
  link(put(eb, btn('取消', 'line', 50), 'FILL'), 'Today');
  link(put(eb, btn('保存', 'primary', 50), 'FILL'), 'Today');

  // A17 新建学习项目
  ({ s, body, nav } = screen('ProjEdit', 'A17 新建学习项目', 9, 'A', { nav: '新建学习项目', back: true }));
  link(nav.l, 'Projects');
  const f2 = card('表单', { gap: 10 });
  put(body, f2);
  formRow(f2, '名称', '机器学习课');
  formRow(f2, '所属大类', '学编程');
  formRow(f2, '总量', '113');
  formRow(f2, '单位', '集');
  formRow(f2, '已经完成', '0');
  formRow(f2, '每天目标', '', '填了截止日可以留空');
  formRow(f2, '截止日', '2026/12/20');
  const tip = card('提示', { fill: C.accentLight, gap: 4 });
  put(body, tip);
  put(tip, txt('按截止日算，每天 2.5 集', 'smallB', C.accentDark));
  spacer(body);
  const pb = row(body, '按钮', 10);
  link(put(pb, btn('取消', 'line', 50), 'FILL'), 'Projects');
  link(put(pb, btn('保存', 'primary', 50), 'FILL'), 'Projects');

  // A18 数据
  ({ s, body, nav } = screen('Data', 'A18 数据', 10, 'A', { nav: '数据', back: true }));
  for (const [t, d, b, k] of [['备份', '把模板、每天的日程、学习项目和收件箱存成一个文件。', '导出备份文件', 'primary'], ['恢复', '用之前导出的备份文件覆盖现在的数据。', '选择备份文件', 'line'], ['示例数据', '清空现在的数据，换回示例数据。', '恢复示例数据', 'line']]) {
    const c = card(t, { gap: 8 });
    put(body, c);
    put(c, txt(t, 'h2')); put(c, txt(d, 'small', C.ink2)); put(c, btn(b, k, 44));
  }
}

async function main() {
  F = await pickFonts();
  for (const f of [F.r, F.b, F.sr, F.sb]) await figma.loadFontAsync(f);
  let page = figma.root.children.find(p => p.name === PAGE);
  if (page) { await figma.setCurrentPageAsync(page); for (const n of [...page.children]) n.remove(); }
  else { page = figma.createPage(); page.name = PAGE; await figma.setCurrentPageAsync(page); }
  await clearOld(page);
  page.backgrounds = [{ type: 'SOLID', color: rgb('#E4E0D2') }];
  setupVars(); setupStyles();

  rowTitle('记录与安排', ROWS.A - 80);
  buildV10();
  buildMore();
  rowTitle('复盘、优化与更多工具', ROWS.C - 80);
  buildV11();
  buildV12();

  await Promise.all(pending);
  let fails = 0;
  for (const [node, to] of links) {
    try { await node.setReactionsAsync([{ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', destinationId: S[to].id, navigation: 'NAVIGATE', transition: null, preserveScrollPosition: false }] }]); }
    catch (e) { fails++; }
  }
  try { page.flowStartingPoints = [{ nodeId: S.Welcome.id, name: '首次使用' }, { nodeId: S.Today.id, name: '今天' }, { nodeId: S.Notify.id, name: '到点通知' }]; } catch (e) { }
  figma.viewport.scrollAndZoomIntoView(page.children);
  figma.closePlugin('三三作息簿 App 原型已生成：25 屏' + (fails ? `（${fails} 个跳转没设上）` : ''));
}
main().catch(async e => {
  // 出错时把原因写在画布上，方便排查
  try {
    const t = figma.createText();
    await figma.loadFontAsync(t.fontName);
    t.characters = '生成失败：' + (e && e.stack ? e.stack : e);
    t.fontSize = 24; t.x = 0; t.y = -400; t.name = '错误信息';
    figma.currentPage.appendChild(t);
  } catch (_) { }
  figma.closePlugin('生成失败：' + (e && e.message ? e.message : e));
});
