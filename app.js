'use strict';

// This isolated public demo contains only invented examples. No personal app data is read.
const STORAGE_KEY = 'sansan_public_fictional_demo_v1';
const CATEGORIES = { study: '课程学习', reading: '阅读', practice: '项目练习', other: '其他' };
const $ = (id) => document.getElementById(id);
const uid = () => `demo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));
const numberText = (value) => Number(value.toFixed(1)).toLocaleString('zh-CN');
function localDate(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function validDate(value) { const d = new Date(`${value}T12:00:00`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(d.valueOf()) && localDate(d) === value; }
function minuteOf(time) { const m = /^(\d{2}):(\d{2})$/.exec(time); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : NaN; }
function makeSeed() {
  const templates = [
    { id: 'example-course', title: '整理一节示例课程', start: '09:30', end: '10:10', category: 'study', projectId: '', amount: 1 },
    { id: 'example-reading', title: '阅读示例材料', start: '10:30', end: '11:00', category: 'reading', projectId: 'example-pages', amount: 8 },
    { id: 'example-practice', title: '完成一个项目小练习', start: '14:00', end: '15:00', category: 'practice', projectId: 'example-practice-plan', amount: 1 },
    { id: 'example-review', title: '写下今天的一点收获', start: '16:00', end: '16:20', category: 'other', projectId: '', amount: 1 }
  ];
  const day = templates.map((a, i) => ({ ...a, id: uid(), done: i === 0 }));
  return { version: 1, templates, days: { [localDate()]: day }, projects: [
    { id: 'example-pages', name: '一份阅读小计划', unit: '页', total: 80, daily: 8, manual: 16 },
    { id: 'example-practice-plan', name: '示例项目练习册', unit: '次', total: 12, daily: 1, manual: 3 }
  ] };
}
function validActivity(a) { return a && typeof a.id === 'string' && typeof a.title === 'string' && a.title.length <= 60 && Number.isFinite(minuteOf(a.start)) && minuteOf(a.end) > minuteOf(a.start) && Object.hasOwn(CATEGORIES, a.category) && typeof a.projectId === 'string' && Number.isFinite(a.amount) && a.amount > 0; }
function validState(s) { return s && s.version === 1 && Array.isArray(s.templates) && s.templates.every(validActivity) && Array.isArray(s.projects) && s.projects.every(p => typeof p.id === 'string' && typeof p.name === 'string' && p.name.length <= 40 && typeof p.unit === 'string' && p.unit.length <= 10 && [p.total, p.daily, p.manual].every(Number.isFinite) && p.total > 0 && p.daily > 0 && p.manual >= 0) && s.days && typeof s.days === 'object' && !Array.isArray(s.days) && Object.entries(s.days).every(([date, activities]) => validDate(date) && Array.isArray(activities) && activities.every(a => validActivity(a) && typeof a.done === 'boolean')); }
let storageWarning = false;
let state;
try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); state = validState(saved) ? saved : makeSeed(); } catch { state = makeSeed(); storageWarning = true; }
let selectedDate = localDate();
let currentTab = 'today';
let activityEdit = null;
let projectEdit = null;
let toastTimer;
function notify(message) { $('status').textContent = message; $('status').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('status').classList.remove('show'), 3500); }
function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { storageWarning = true; notify('浏览器未允许保存；本次操作仍可体验，关闭页面后不会保留。'); } }
function ensureDay(date) { if (!Object.hasOwn(state.days, date)) { state.days[date] = state.templates.map(a => ({ ...clone(a), id: uid(), done: false })); save(); } return state.days[date]; }
function credited(projectId) { return Object.values(state.days).flat().reduce((sum, a) => sum + (a.done && a.projectId === projectId ? a.amount : 0), 0); }
function projectProgress(project) { return project.manual + credited(project.id); }
function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function actionButton(label, action, id, extra = '') { const button = el('button', `small-action ${extra}`, label); button.type = 'button'; button.dataset.action = action; button.dataset.id = id; return button; }
function emptyState(title, note) { const box = el('div', 'empty-state'); box.append(el('span', '', '✧'), el('strong', '', title), el('p', '', note)); return box; }
function renderActivities(container, activities, isTemplate = false) {
  container.replaceChildren();
  if (!activities.length) { container.append(emptyState(isTemplate ? '给模板添一件小事' : '今天还有很多留白', '点击上方添加按钮，试着安排一个虚构活动。')); return; }
  for (const a of [...activities].sort((x, y) => minuteOf(x.start) - minuteOf(y.start))) {
    const card = el('article', `activity-card${a.done && !isTemplate ? ' is-done' : ''}`);
    if (isTemplate) card.append(el('span', 'template-marker', '✧'));
    else { const check = el('button', 'check-button', a.done ? '✓' : ''); check.type = 'button'; check.dataset.action = 'toggle'; check.dataset.id = a.id; check.setAttribute('aria-label', `${a.done ? '取消完成' : '标记完成'}：${a.title}`); check.setAttribute('aria-pressed', String(a.done)); card.append(check); }
    const time = el('div', 'activity-time', `${a.start} – ${a.end}`); time.append(el('span', 'activity-duration', `${minuteOf(a.end) - minuteOf(a.start)} 分钟`)); card.append(time);
    const main = el('div', 'activity-main'); main.append(el('h3', 'activity-title', a.title));
    const meta = el('div', 'activity-meta'); meta.append(el('span', `category-chip ${a.category}`, CATEGORIES[a.category]));
    const project = state.projects.find(p => p.id === a.projectId); if (project) meta.append(el('span', '', `${project.name} · ${numberText(a.amount)} ${project.unit}`));
    main.append(meta); card.append(main);
    const actions = el('div', 'activity-actions'); actions.append(actionButton('编辑', 'edit', a.id), actionButton('删除', 'delete', a.id, 'danger')); card.append(actions); container.append(card);
  }
}
function renderToday() {
  const activities = ensureDay(selectedDate), completed = activities.filter(a => a.done).length;
  $('selected-date').value = selectedDate;
  const d = new Date(`${selectedDate}T12:00:00`);
  $('day-heading').textContent = selectedDate === localDate() ? '今天的小计划' : `${d.getMonth() + 1} 月 ${d.getDate()} 日的小计划`;
  $('day-subtitle').textContent = `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()]} · 虚构示例`;
  $('day-completed').textContent = `${completed} / ${activities.length}`;
  $('day-progress').style.width = `${activities.length ? completed / activities.length * 100 : 0}%`;
  $('day-progress-note').textContent = completed && completed === activities.length ? '这一页的小计划，都完成了。' : '一步一步来就很好。';
  $('day-minutes').textContent = `${activities.reduce((sum, a) => sum + minuteOf(a.end) - minuteOf(a.start), 0)} 分钟`;
  renderActivities($('day-list'), activities);
}
function renderProjects() {
  const list = $('project-list'); list.replaceChildren();
  if (!state.projects.length) { list.append(emptyState('从一个小目标开始', '创建一个虚构项目，体验进度如何一点点积累。')); return; }
  state.projects.forEach((p, index) => {
    const complete = projectProgress(p), remaining = Math.max(0, p.total - complete), percent = Math.min(100, complete / p.total * 100);
    const card = el('article', 'project-card'), top = el('div', 'project-top'), actions = el('div', 'activity-actions');
    actions.append(actionButton('编辑', 'edit', p.id), actionButton('删除', 'delete', p.id, 'danger')); top.append(el('span', 'project-symbol', index % 2 ? '✧' : '▤'), actions); card.append(top, el('h3', '', p.name));
    const label = el('div', 'project-progress-label'); label.append(el('span', '', `${numberText(complete)} / ${numberText(p.total)} ${p.unit}`), el('span', '', `${Math.round(percent)}%`)); card.append(label);
    const track = el('div', 'progress-track'), fill = el('span'); fill.style.width = `${percent}%`; track.append(fill); card.append(track);
    const stats = el('div', 'project-stats'), daily = el('div'), days = el('div');
    const dailyValue = el('strong', '', numberText(p.daily)); dailyValue.append(el('small', '', `${p.unit} / 天`)); daily.append(el('span', '', '每日小目标'), dailyValue);
    const daysValue = el('strong', '', String(Math.ceil(Number((remaining / p.daily).toFixed(8))))); daysValue.append(el('small', '', '天')); days.append(el('span', '', '预计还需要'), daysValue); stats.append(daily, days); card.append(stats);
    card.append(el('p', 'project-note', remaining ? `还剩 ${numberText(remaining)} ${p.unit}，按自己的节奏继续。` : '这个小目标，已经完成了。')); list.append(card);
  });
}
function render() { renderToday(); renderActivities($('template-list'), state.templates, true); renderProjects(); }
function showTab(tab, focus = false) {
  currentTab = tab;
  document.querySelectorAll('[data-tab]').forEach(button => { const active = button.dataset.tab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; if (active && focus) button.focus(); });
  ['today', 'template', 'projects'].forEach(name => { $(`panel-${name}`).hidden = name !== tab; }); render();
}
function changeDate(date) { if (!validDate(date)) { $('selected-date').value = selectedDate; notify('请选择有效日期。'); return; } selectedDate = date; render(); }
function shiftDate(offset) { const d = new Date(`${selectedDate}T12:00:00`); d.setDate(d.getDate() + offset); changeDate(localDate(d)); }
function openActivity(isTemplate, id = null) {
  const items = isTemplate ? state.templates : ensureDay(selectedDate), item = items.find(a => a.id === id);
  activityEdit = { isTemplate, id, date: selectedDate }; $('activity-form').reset(); $('activity-error').textContent = '';
  $('activity-dialog-title').textContent = `${item ? '编辑' : '添加'}${isTemplate ? '模板' : ''}活动`;
  $('activity-title').value = item?.title || ''; $('activity-start').value = item?.start || '17:00'; $('activity-end').value = item?.end || '17:30'; $('activity-category').value = item?.category || 'study';
  const select = $('activity-project'); select.replaceChildren(); const none = el('option', '', '不关联项目'); none.value = ''; select.append(none);
  for (const p of state.projects) { const option = el('option', '', p.name); option.value = p.id; select.append(option); }
  select.value = item?.projectId || ''; $('activity-amount').value = item?.amount || 1; updateAmount(); $('activity-dialog').showModal(); $('activity-title').focus();
}
function updateAmount() { const p = state.projects.find(p => p.id === $('activity-project').value); $('activity-amount-label').hidden = !p; $('activity-amount').required = Boolean(p); $('activity-unit-help').textContent = p ? `单位：${p.unit}。将活动标记完成后，计入这个项目。` : ''; }
function openProject(id = null) {
  const p = state.projects.find(p => p.id === id); projectEdit = id; $('project-form').reset(); $('project-error').textContent = ''; $('project-dialog-title').textContent = p ? '编辑学习项目' : '新建学习项目';
  $('project-name').value = p?.name || ''; $('project-unit').value = p?.unit || '页'; $('project-total').value = p?.total || 30; $('project-daily').value = p?.daily || 3; $('project-manual').value = p?.manual || 0;
  $('project-credit-note').textContent = p ? `日程已另外计入 ${numberText(credited(p.id))} ${p.unit}，无需重复登记。` : '日程中的已完成活动会另外计入，无需重复登记。'; $('project-dialog').showModal(); $('project-name').focus();
}
function activityAction(event, isTemplate) {
  const button = event.target.closest('button[data-action]'); if (!button) return;
  const items = isTemplate ? state.templates : ensureDay(selectedDate), index = items.findIndex(a => a.id === button.dataset.id); if (index < 0) return;
  if (button.dataset.action === 'edit') { openActivity(isTemplate, items[index].id); return; }
  if (button.dataset.action === 'delete') { if (!confirm(`删除“${items[index].title}”？${isTemplate ? '已创建的日程不受影响。' : '这项活动的完成记录也会移除。'}`)) return; items.splice(index, 1); }
  if (button.dataset.action === 'toggle' && !isTemplate) { items[index].done = !items[index].done; }
  save(); render();
}

document.querySelector('.tabs').addEventListener('click', event => { const button = event.target.closest('[data-tab]'); if (button) showTab(button.dataset.tab); });
document.querySelector('.tabs').addEventListener('keydown', event => { const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']; if (!keys.includes(event.key)) return; event.preventDefault(); const names = ['today', 'template', 'projects']; let i = names.indexOf(currentTab); i = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (i + (event.key === 'ArrowRight' ? 1 : 2)) % 3; showTab(names[i], true); });
$('selected-date').addEventListener('change', event => changeDate(event.target.value)); $('prev-day').addEventListener('click', () => shiftDate(-1)); $('next-day').addEventListener('click', () => shiftDate(1)); $('go-today').addEventListener('click', () => changeDate(localDate()));
$('add-activity').addEventListener('click', () => openActivity(false)); $('add-template').addEventListener('click', () => openActivity(true)); $('add-project').addEventListener('click', () => openProject());
$('day-list').addEventListener('click', event => activityAction(event, false)); $('template-list').addEventListener('click', event => activityAction(event, true)); $('activity-project').addEventListener('change', updateAmount);
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
$('apply-template').addEventListener('click', () => { if (!confirm(`用当前模板覆盖 ${selectedDate} 的全部活动？当天的自定义修改和完成记录将被替换，关联项目进度也会重新计算。`)) return; state.days[selectedDate] = state.templates.map(a => ({ ...clone(a), id: uid(), done: false })); save(); render(); notify('这一天已换成当前模板，其他日期未改变。'); });
$('reset-demo').addEventListener('click', () => { if (!confirm('恢复全部虚构示例？本演示中的修改会被清除；不会影响其他网站或个人版数据。')) return; state = makeSeed(); selectedDate = localDate(); try { localStorage.removeItem(STORAGE_KEY); } catch {} save(); showTab('today'); notify('已恢复虚构示例。'); });
$('activity-form').addEventListener('submit', event => {
  event.preventDefault(); const title = $('activity-title').value.trim(), start = $('activity-start').value, end = $('activity-end').value, projectId = $('activity-project').value, amount = projectId ? Number($('activity-amount').value) : 1;
  if (!title || title.length > 60) { $('activity-error').textContent = '请填写 1–60 个字的活动名称。'; return; }
  if (!Number.isFinite(minuteOf(start)) || !Number.isFinite(minuteOf(end)) || minuteOf(end) <= minuteOf(start)) { $('activity-error').textContent = '结束时间需晚于开始时间，请检查小时与分钟。'; return; }
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) { $('activity-error').textContent = '完成量需大于 0，且不超过 100000。'; return; }
  const items = activityEdit.isTemplate ? state.templates : ensureDay(activityEdit.date), index = items.findIndex(a => a.id === activityEdit.id);
  if (items.some(a => a.id !== activityEdit.id && minuteOf(start) < minuteOf(a.end) && minuteOf(end) > minuteOf(a.start)) && !confirm('这个时间与已有活动重叠，仍要保存吗？')) return;
  const item = { id: index >= 0 ? items[index].id : uid(), title, start, end, category: $('activity-category').value, projectId, amount };
  if (!activityEdit.isTemplate) item.done = index >= 0 ? items[index].done : false;
  if (index >= 0) items[index] = item; else items.push(item);
  save(); render(); $('activity-dialog').close(); notify(activityEdit.isTemplate ? '模板已保存，已有日期保持原样。' : '活动已保存。');
});
$('project-form').addEventListener('submit', event => {
  event.preventDefault(); const name = $('project-name').value.trim(), unit = $('project-unit').value.trim(), total = Number($('project-total').value), daily = Number($('project-daily').value), manual = Number($('project-manual').value);
  if (!name || !unit || name.length > 40 || unit.length > 10) { $('project-error').textContent = '请填写有效的项目名称和计量单位。'; return; }
  if (![total, daily, manual].every(Number.isFinite) || total <= 0 || daily <= 0 || manual < 0 || [total, daily, manual].some(n => n > 100000)) { $('project-error').textContent = '总量和每日目标需大于 0；完成量不能为负，数值不能超过 100000。'; return; }
  const index = state.projects.findIndex(p => p.id === projectEdit), p = { id: index >= 0 ? projectEdit : uid(), name, unit, total, daily, manual };
  if (index >= 0) state.projects[index] = p; else state.projects.push(p);
  save(); render(); $('project-dialog').close(); notify('学习项目已保存。');
});
$('project-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]'); if (!button) return; const index = state.projects.findIndex(p => p.id === button.dataset.id); if (index < 0) return;
  if (button.dataset.action === 'edit') { openProject(state.projects[index].id); return; }
  if (button.dataset.action === 'delete' && confirm(`删除“${state.projects[index].name}”？日程和模板活动会保留，并取消与这个项目的关联。`)) { const id = state.projects[index].id; state.projects.splice(index, 1); for (const a of [...state.templates, ...Object.values(state.days).flat()]) if (a.projectId === id) a.projectId = ''; save(); render(); notify('项目已删除，活动仍保留。'); }
});
render(); save();
if (storageWarning) notify('当前浏览器可能无法保存数据，可以继续体验临时演示。');
