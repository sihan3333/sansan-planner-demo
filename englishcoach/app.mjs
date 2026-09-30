import { demoApi, saveDemoState, resetDemo, demoStorageStatus, OCR_RAW } from './demo-adapter.mjs';
import { defaultState, localDate, buildQuiz, checkAnswer, recordAttempt, sampleItems, timerRemaining } from './core.mjs';
import { buildYesterdayReview, REVIEW_VERSION } from './review.mjs';
import { renderYesterdayReview } from './review-ui.mjs';

const PHASES = [
  { name: '昨日复习', label: 'RECALL & RECONNECT', title: '从昨天，开始今天。', description: '把昨天四个部分学过的内容，变成今天的选择填空。50 个单词、5 个短语、5 个句子，按实际记录抽取。', mode: 'review' },
  { name: '场景学习', label: 'ENGLISH IN REAL LIFE', title: '把生活，变成英语。', description: '核对一段示例双语笔记，从中文回想表达，再听、再读。答对的移入本轮已掌握，错题留下继续练。', mode: 'scene' },
  { name: '自由对话', label: 'LESS THINKING, MORE SPEAKING', title: '现在，聊一会儿。', description: '把刚学的表达用进一句话，体验预设示例回复，再把想记住的内容留下来。', mode: 'chat' },
  { name: '今日复盘', label: 'MAKE IT STICK', title: '让今天的收获，留下来。', description: '再回想几个今天的单词和短语，写下卡住的地方。明天的你，会从这里继续。', mode: 'recap' },
];
const TYPE_NAMES = { word: '单词', phrase: '短语', sentence: '句子', grammar: '语法' };
const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
let state, revision = 0, selectedDate = localDate(), page = 'study';
let dirty = 0, saved = 0, saving = false, saveTimer, saveError = '', conflicted = false;
let saveInFlight = null;
let libraryFilter = 'all', librarySearch = '', importState = null, apiConfig = {};
let engine = { configured: false, ready: false, status: 'unknown', model: '', detail: '预设示例回复，无模型连接' }, refreshingEngine = false;
const chatRequests = new Map(), gradingRequests = new Map();
const CHAT_TOPICS = [
  ['今天发生的小事', "I'd like to talk about something that happened today. Ask me one question to get started."],
  ['最近看的一部电影', "Let's talk about a film I watched recently. Ask me what I thought about it."],
  ['工作中想表达的观点', "I'd like to practice explaining my opinion at work. Help me start a natural conversation."],
  ['一个不太容易的决定', "I'd like to talk through a difficult decision. Ask me one question at a time."],
];
let voices = [], recognition = null, recorder = null, recordingFor = null, lastTickDay = localDate();
let uiAnswerTimer, toastTimer, renderedQueueSignature = '';
let reviewCategory = 'word', reviewPage = 0;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uuid = () => crypto.randomUUID();
const formatTime = ms => { const sec = Math.ceil(Math.max(0, ms) / 1000); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; };
const duration = index => (state.settings.durations?.[index] || [10, 15, 20, 15][index]) * 60000;
const today = () => localDate();
const previousDate = date => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 1); return localDate(d); };
const currentSession = () => ensureSession(selectedDate);
const currentPhase = () => currentSession().phases[currentSession().phase];
const sessionMinutes = index => (currentSession().phases[index].totalMs || duration(index)) / 60000;
const itemFor = id => state.items.find(item => item.id === id);
const getRemaining = phase => timerRemaining(phase.timer, Date.now());
const speechSupported = () => 'speechSynthesis' in window;
const recognitionSupported = () => false;
const mode = () => PHASES[currentSession().phase].mode;
function ensureSession(date) {
  if (!state.sessions[date]) state.sessions[date] = { phase: 0, notes: '', chatNotes: '', summary: { learned: '', hard: '', tomorrow: '' }, phases: [], finishedAt: null };
  const session = state.sessions[date];
  session.phase = Number.isInteger(session.phase) && session.phase >= 0 && session.phase < 4 ? session.phase : 0;
  session.summary ||= { learned: '', hard: '', tomorrow: '' };
  session.chat ||= { messages: [], draft: '' };
  if (!Array.isArray(session.chat.messages)) session.chat.messages = [];
  if (typeof session.chat.draft !== 'string') session.chat.draft = '';
  session.phases ||= [];
  for (let index = 0; index < 4; index++) {
    session.phases[index] ||= { timer: { remainingMs: duration(index), endsAt: null, running: false }, quiz: null, answers: {}, completedIds: [], attempts: [], startedAt: null, finishedAt: null, round: 1, totalMs: duration(index) };
    const p = session.phases[index]; p.answers ||= {}; p.completedIds ||= []; p.attempts ||= [];
  }
  return session;
}
function candidateItems(index, date = selectedDate) {
  if (index === 0) return state.items;
  if (index === 1) return state.items.filter(item => item.createdDate === date);
  if (index === 3) return state.items;
  return [];
}
function ensureQuiz(index = currentSession().phase) {
  if (index === 2) return;
  const phase = currentSession().phases[index];
  if (index === 0) {
    if (!phase.quiz || phase.review?.version !== REVIEW_VERSION) generateReview(phase);
    return;
  }
  if (!phase.quiz) {
    phase.quiz = buildQuiz(candidateItems(index), PHASES[index].mode, selectedDate);
    if (phase.quiz.length) markDirty();
  }
}
function preserveQuestionSnapshots(phase) {
  for (const attempt of phase.attempts || []) {
    const q = (phase.quiz || []).find(q => q.id === attempt.questionId);
    if (q && !attempt.questionSnapshot) attempt.questionSnapshot = { ...q };
  }
  phase.encounteredSnapshots ||= [];
  for (const q of phase.quiz || []) {
    if ((phase.encounteredIds || []).includes(q.id) || phase.answers?.[q.id]?.revealed || phase.answers?.[q.id]?.checked || (phase.completedIds || []).includes(q.id)) {
      if (!phase.encounteredSnapshots.some(saved => saved.id === q.id && saved.en === q.en)) phase.encounteredSnapshots.push({ ...q });
    }
  }
}
function generateReview(phase) {
  preserveQuestionSnapshots(phase);
  const { quiz, ...metadata } = buildYesterdayReview(state, selectedDate);
  phase.quiz = quiz;
  phase.review = { ...metadata, version: REVIEW_VERSION };
  phase.answers = {}; phase.completedIds = []; phase.encounteredIds = [];
  reviewCategory = ['word', 'phrase', 'sentence'].find(type => quiz.some(q => q.type === type)) || 'word';
  reviewPage = 0;
  markDirty();
}
function recordEncounter(q) {
  if (!q) return;
  const phase = currentPhase();
  phase.encounteredIds ||= [];
  if (!phase.encounteredIds.includes(q.id)) { phase.encounteredIds.push(q.id); markDirty(); }
}
function updateSaveLabel() { const el=document.querySelector('[data-save-status]');if(!el)return;const temporary=demoStorageStatus()==='memory';el.textContent=saveError?'保存未完成 · 内容仍在本页':saving||dirty!==saved?'正在保存演示记录…':temporary?'本页临时保存 · 刷新会重置':'已保存到本浏览器';el.classList.toggle('error',!!saveError);el.title=saveError||(temporary?'浏览器存储不可用，继续使用本页临时模式。':'仅保存本演示数据，不上传服务器'); }

function markDirty() {
  dirty++; updateSaveLabel(); clearTimeout(saveTimer);
  if (!conflicted) saveTimer = setTimeout(flushSave, 420);
}
function flushSave() {
 if (saving) return saveInFlight;
 if (saved === dirty || !state) return Promise.resolve();
 saving = true; updateSaveLabel(); const version = dirty;
 saveInFlight = Promise.resolve().then(() => {
  const result = saveDemoState(state); revision = result.revision; saved = version; saveError = '';
 }).catch(error => { saveError = error.message; }).finally(() => { saving = false; saveInFlight = null; updateSaveLabel(); });
 return saveInFlight;
}

async function saveLatestState(forReview = false) {
  clearTimeout(saveTimer);
  const pausedAction = forReview ? '尚未重新抽取题目' : '尚未展示预设回复';
  if (conflicted) throw new Error(`学习记录发生保存冲突，${pausedAction}。请先保留本页内容并解决冲突。`);
  while (saved !== dirty || saving) {
    await flushSave();
    if (conflicted) throw new Error(`学习记录发生保存冲突，${pausedAction}。请先保留本页内容并解决冲突。`);
    if (saveError) throw new Error(`最新学习记录还没有保存，${pausedAction}：${saveError}`);
    clearTimeout(saveTimer);
  }
}
function showToast(message) {
  const el = document.querySelector('#toast'); el.textContent = message; el.classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3600);
}
async function api(path, data, method = 'POST') { return demoApi(path, data, method); }

function render() {
  if (!state) return;
  if (page === 'study') ensureQuiz();
  const session = currentSession();
  app.innerHTML = `<div class="shell"><aside class="sidebar"><div class="brand"><span class="brand-mark">e.</span><div><div class="brand-title">English Hour</div><div class="brand-subtitle">你的英语一小时</div></div></div><nav class="nav-list" aria-label="主导航">${[['study', '◴', '今日学习'], ['library', '▤', '我的表达库'], ['settings', '⚙', '学习设置']].map(([id, icon, label]) => `<button class="nav-item ${page === id ? 'active' : ''}" data-action="nav" data-page="${id}" ${page === id ? 'aria-current="page"' : ''}><span class="nav-icon" aria-hidden="true">${icon}</span>${label}</button>`).join('')}</nav><div class="side-label">YOUR DAILY HOUR</div><nav class="phase-list" aria-label="学习阶段">${PHASES.map((p, i) => `<button class="phase-tab ${session.phase === i ? 'active' : ''} ${session.phases[i].finishedAt ? 'done' : ''}" data-action="phase" data-index="${i}" ${session.phase === i ? 'aria-current="step"' : ''}><span class="phase-index">${session.phases[i].finishedAt ? '✓' : String(i + 1).padStart(2, '0')}</span><div><div class="phase-name">${p.name}</div><div class="phase-time">${sessionMinutes(i)} 分钟</div></div></button>`).join('')}</nav><div class="side-bottom"><div class="local-badge"><span class="dot"></span>每天一点，真正会说</div><p class="side-foot">${state.settings.accent === 'en-GB' ? '英式英语' : '美式英语'} · ${esc(state.settings.level || 'B2-C1')}<br>演示进度保存在本浏览器<br>合成示例 · 无私人记录</p></div></aside><main class="main">${renderTopbar()}<div class="content">${renderBanner()}${page === 'study' ? renderStudy() : page === 'library' ? renderLibrary() : renderSettings()}</div></main></div>`;
  updateSaveLabel(); tickTimerDisplay();
  renderedQueueSignature = currentPhase().completedIds.join(',');
}
function renderTopbar() {
  const phase = currentPhase(); const index = currentSession().phase;
  return `<header class="topbar"><div class="top-left"><label><span class="hidden">学习日期</span><input type="date" class="date-input" data-input="date" value="${selectedDate}" aria-label="学习日期"></label><span class="save-status" data-save-status role="status">已保存到本浏览器</span></div><div class="timer-bar"><div class="timer-stack"><div class="timer-label">${PHASES[index].name} · ${sessionMinutes(index)} MIN</div><div class="timer-display" data-timer aria-label="剩余时间">${formatTime(getRemaining(phase))}</div></div><div class="timer-controls"><button class="btn" data-action="timer" data-timer-button>${phase.timer.running ? 'Ⅱ 暂停' : getRemaining(phase) <= 0 ? '已到时' : phase.startedAt ? '▷ 继续' : '▷ 开始'}</button><button class="btn secondary" data-action="next" title="完成当前部分，进入下一部分"><span class="next-label">${index === 3 ? '完成' : '下一步'}</span> ${index === 3 ? '✓' : '→'}</button></div></div><div class="timer-rail"><span data-timer-progress></span></div></header>`;
}
function renderBanner() {
 let result = `<div class="demo-guide card"><div><span class="eyebrow">TRY THE LEARNING LOOP</span><h2>把零散素材，变成每天一小时的练习。</h2><p>先试一道昨日复习，再到场景学习核对素材；把表达用进对话，最后写给明天的自己。</p></div><div class="button-row"><button class="btn small" data-action="phase" data-index="1">体验场景学习 →</button><button class="btn secondary small" data-action="demo-ocr">体验 OCR 核对</button></div><p class="demo-guide-note">昨日记录为合成示例。答对移出本轮待练，原始表达仍留在表达库。</p></div>`;
 if (selectedDate !== today()) result += `<div class="banner">正在查看 ${esc(selectedDate)} 的演示记录。<button class="text-button" data-action="today">返回今天</button></div>`;
 if (saveError) result += `<div class="banner error">浏览器暂时无法保存：${esc(saveError)}</div>`;
 return result;
}

function renderStudy() {
  const index = currentSession().phase, phaseInfo = PHASES[index];
  return `<div class="page-heading"><div><div class="eyebrow">${phaseInfo.label}</div><h1>${phaseInfo.title}</h1><p class="page-subtitle">${phaseInfo.description}</p></div><div class="heading-aside"><span class="stage-pill">PART ${String(index + 1).padStart(2, '0')} / 04</span><div style="margin-top:9px">${sessionMinutes(index)} 分钟，专注这一件事</div></div></div><div class="study-grid"><section class="canvas" aria-label="学习内容">${index === 2 ? renderChat() : `${index === 1 ? renderImportCallout() : ''}${renderQuiz()}${index === 3 ? renderSummary() : ''}`}</section><aside class="utility-column" aria-label="学习辅助">${renderNotes(index === 2 ? 'chatNotes' : 'notes')}${renderDailyPath()}${renderTip(index)}</aside></div>`;
}
function renderImportCallout() {
 return `<div class="import-callout"><span style="font-size:23px" aria-hidden="true">↥</span><div class="grow"><h3>从素材，到可以开口的表达</h3><p>体验预置 OCR 文字核对，或粘贴一小段双语笔记。确认后再加入练习。</p></div><div class="button-row"><button class="btn small secondary" data-action="demo-ocr">OCR 核对示例</button><button class="btn small secondary" data-action="import">整理双语文本</button></div></div>`;
}

function renderNotes(field) {
  const value = currentSession()[field] || '';
  return `<div class="card card-pad note-card"><div class="card-top"><h3 class="note-heading">随手记 / Notes</h3><span aria-hidden="true" class="muted">✎</span></div><p class="note-subtitle">想到什么，就写下来。</p><textarea aria-label="${field === 'chatNotes' ? '自由对话笔记' : '学习随手记'}" class="field" data-input="notes" data-field="${field}" placeholder="刚刚想说却没说出来的…&#10;一个值得记住的表达…&#10;下次还想聊的话题…">${esc(value)}</textarea><div class="note-footer"><span class="note-count" data-note-count>${value.length} 字 · 自动保存</span><button class="text-button" data-action="notes-import" data-field="${field}">加入学习 ↗</button></div></div>`;
}
function renderDailyPath() {
  return `<div class="card daily-path"><div class="section-label">今天的 60 分钟</div>${PHASES.map((phase, index) => `<div class="path-item ${index === currentSession().phase ? 'current' : ''}"><span class="path-dot"></span><span>${phase.name}</span><span class="path-duration">${sessionMinutes(index)} min ${currentSession().phases[index].finishedAt ? '✓' : ''}</span></div>`).join('')}</div>`;
}
function renderTip(index) {
  const tips = [ ['回到昨天的原文', '先根据上下文选择。听答案或查看原文会记作提示；隐藏后可以再独立重试。题目不足时按实际数量练习。'], ['把好句子留下来', '点击 ☆ 收藏有用的表达。答对后会移出本轮待练列表，原始词条始终留在表达库里。'], ['说不出来，也有收获', '把想表达的中文先记在旁边。聊完后补上英文，就能成为自己的下一份学习素材。'], ['少记一点，用熟一点', '今天的复盘最多抽取 5 道题。比起记住一大串词，能在明天用出来更重要。'] ];
  return `<div class="card tip-card"><div class="tip-title">✧ ${tips[index][0]}</div><p>${tips[index][1]}</p></div>`;
}
function quizStats(phase = currentPhase()) {
  const attempts = phase.attempts || [];
  return { attempts: attempts.length, correct: attempts.filter(x => x.correct && !x.hinted && !x.selfAssessed).length, self: attempts.filter(x => x.selfAssessed).length, total: phase.quiz?.length || 0, completed: phase.completedIds.length };
}
function renderQuiz() {
  const phase = currentPhase(), index = currentSession().phase, quiz = phase.quiz || [];
  if (index === 0) return renderYesterdayReview(phase, { category: reviewCategory, page: reviewPage });
  if (!quiz.length) {
    const isReview = index === 0;
    return `<div class="card empty-state"><div class="empty-symbol">${isReview ? '↶' : index === 3 ? '✧' : '＋'}</div><h2>${isReview ? '从你的第一份学习素材开始' : index === 3 ? '今天的收获，还等你留下' : '今天想练哪个生活场景？'}</h2><p>${isReview ? '还没有昨天的学习记录。可以导入昨天学过的内容，或先去场景学习；这里不会替你编造学习历史。' : index === 3 ? '先在复习或场景学习中完成一些练习。复盘题只从今天实际练习过的内容里抽取，不把导入素材当作已经学会。' : '体验预置 OCR 文字核对，或直接粘贴中英对照，确认后再开始练习。'}</p><div class="button-row"><button class="btn" data-action="${isReview ? 'import-yesterday' : 'import'}">${isReview ? '导入昨天的内容' : '导入学习素材'}</button><button class="btn secondary" data-action="${isReview ? 'phase' : 'sample'}" ${isReview ? 'data-index="1"' : ''}>${isReview ? '先学今天的场景' : '体验示例素材'}</button></div><button class="text-button" style="margin-top:17px" data-action="manual">手动添加一条中英表达</button></div>`;
  }
  const remaining = quiz.filter(q => !phase.completedIds.includes(q.id)); const stats = quizStats(phase);
  return `<div class="card quiz-shell"><div class="quiz-header"><div><h2>${index === 0 ? '昨日小测' : index === 3 ? '今日回想' : '我的场景练习'}</h2><p>${index === 0 ? '优先昨天的 5–6 个单词与短语 + 重点填空；间隔后回顾最近学习内容' : index === 3 ? '从今天的内容中选取，最多 5 题' : '中文回想 · 开口朗读 · 留下有用的表达'}</p></div><span class="chip">${stats.completed} / ${stats.total} 已过关</span></div><div class="progress-line"><span style="width:${stats.total ? stats.completed / stats.total * 100 : 0}%"></span></div>${remaining.length ? remaining.map((q, n) => renderQuestion(q, n + 1)).join('') : `<div class="round-complete"><div class="eyebrow">NICE WORK, KEEP SPEAKING</div><h3>这一轮，你都走过了。</h3><p class="small">${stats.self ? '包含自行判断的朗读结果；未进行音素评分。' : '继续把这些表达说一遍，让它们自然一点。'}</p><div class="stats-row"><div><div class="stat-number">${stats.attempts}</div><div class="stat-label">实际提交次数</div></div><div><div class="stat-number">${stats.correct}</div><div class="stat-label">无提示对照正确</div></div><div><div class="stat-number">${stats.completed}</div><div class="stat-label">本轮已过关</div></div></div><div class="button-row"><button class="btn secondary small" data-action="retry-round">再独立回想一轮</button><button class="btn small" data-action="next">${index === 3 ? '完成今日学习' : '进入下一部分'} →</button></div></div>`}</div>${phase.completedIds.length ? renderArchive(quiz.filter(q => phase.completedIds.includes(q.id))) : ''}<div class="review-detail">${remaining.length ? `还剩 ${remaining.length} 道待练。` : ''}查看书面答案后的正确提交会标记为「有提示」；播放发音可以正常辅助默写。跟读可自行练习，演示仅核对输入的文字。<button class="text-button" data-action="refresh-quiz">从最新素材重新生成本轮</button></div>`;
}
function renderQuestion(q, number) {
 const phase=currentPhase(), answer=phase.answers[q.id]||{}, item=itemFor(q.itemId)||q;
 const isRead=q.kind==='read', revealed=answer.revealed||answer.checked||isRead;
 return `<article class="question" data-question="${esc(q.id)}"><div class="question-heading"><div class="quiz-meta"><span class="question-number">${String(number).padStart(2,'0')}</span><span class="chip">${esc(TYPE_NAMES[item.type]||'表达')}</span><span class="chip">${isRead?'跟读 / 文字对照':q.kind==='cloze'?'重点填空':'中文 → 英文'}</span>${item.sample?'<span class="chip">示例</span>':''}${answer.hinted?'<span class="chip orange">已用提示</span>':''}</div><div class="button-row"><button class="icon-btn ${item.starred?'starred':''}" data-action="star" data-item="${esc(item.id)}" aria-label="${item.starred?'取消收藏':'收藏这个表达'}" aria-pressed="${!!item.starred}">${item.starred?'★':'☆'}</button><button class="icon-btn" data-action="speak-question" data-question="${esc(q.id)}" aria-label="播放本机发音示范">♫</button></div></div><div class="question-prompt ${isRead||q.kind==='cloze'?'english':''}">${esc(isRead?q.en||q.answer:q.prompt)}</div>${isRead?`<p class="small">${esc(item.zh)}</p><p class="small">可自行跟读，再输入句子做文字对照。演示不录音、不评分发音。</p>`:''}<div class="pronunciation">${esc(q.ipa||item.ipa||'可尝试本机英语朗读')}</div><div class="answer-row"><input class="field answer-input" autocomplete="off" autocapitalize="off" spellcheck="false" data-input="answer" data-question="${esc(q.id)}" value="${esc(answer.value||'')}" placeholder="${isRead?'输入句子，体验文字对照…':q.kind==='cloze'?'填入缺失的重点表达…':'写下你记得的英文…'}" aria-label="${esc(q.prompt)} 的英文答案"><button class="btn" data-action="check" data-question="${esc(q.id)}">核对 ↵</button></div><div class="question-footer">${!isRead?`<button class="text-button" data-action="reveal" data-question="${esc(q.id)}">${answer.revealed?'已显示参考答案':'想不起来，看看答案'}</button>`:''}<button class="text-button" data-action="slow" data-question="${esc(q.id)}">慢速听</button></div>${revealed&&!isRead?`<div class="feedback ${answer.correct&&!answer.hinted?'good':answer.checked&&!answer.correct?'':'neutral'}"><div class="answer-reveal">${esc(q.answer)}</div>${esc(answer.feedback||'看过答案会标记为有提示；可以隐藏后独立重试。')}${answer.hinted?`<div><button class="text-button" data-action="retry-question" data-question="${esc(q.id)}">隐藏答案，独立重试</button></div>`:''}</div>`:answer.feedback?`<div class="feedback ${answer.correct?'good':''}">${esc(answer.feedback)}</div>`:''}</article>`;
}

function renderArchive(questions) {
  return `<details class="card archived"><summary>本轮已过关的表达 · ${questions.length} 条</summary>${questions.map(q => { const item = itemFor(q.itemId) || q; return `<div class="archived-row"><span style="color:#86a075">✓</span><div class="grow"><div class="archived-en">${esc(item.en || q.en || q.answer)}</div><div class="archived-zh">${esc(item.zh)} ${item.ipa ? ' · ' + esc(item.ipa) : ''}</div></div><button class="icon-btn ${item.starred ? 'starred' : ''}" data-action="star" data-item="${esc(item.id)}" aria-label="收藏">${item.starred ? '★' : '☆'}</button><button class="icon-btn" data-action="speak-item" data-item="${esc(item.id)}" aria-label="播放发音">♫</button></div>`; }).join('')}</details>`;
}
function engineLabel() { return '预设回复演示'; }

function renderEngineStatus() { return '<div class="engine-status"><span class="chip orange">AI 对话流程演示</span><span>固定示例回复 · 未连接模型</span></div>'; }

async function refreshEngine() {
  if (refreshingEngine) return;
  refreshingEngine = true; render();
  try {
    const result = await api('engine', undefined, 'GET');
    engine = { ...result, configured: !!result.configured, ready: !!result.ready };
    apiConfig.configured = engine.configured;
  } catch (error) { engine = { ...engine, ready: false, status: 'error', detail: error.message }; }
  finally { refreshingEngine = false; render(); }
}
function renderChat() {
 const chat=currentSession().chat, pending=chatRequests.has(selectedDate);
 return `<div class="card private-chat"><header class="chat-head"><div><span class="chat-badge">20 MINUTES TO JUST TALK</span><h2>What’s on your mind today?</h2><p>试着把今天的表达用进一句话，再把值得记住的内容留到笔记。</p></div>${renderEngineStatus()}</header><div class="chat-connection small">这里按轮次展示预先编写的回复，不理解或分析你的输入。可输入自己的句子体验流程；内容仅留在本浏览器。</div><div class="chat-transcript" role="log" aria-label="英语对话演示记录" aria-live="polite">${chat.messages.length?chat.messages.map((message,index)=>`<article class="chat-message ${message.role==='user'?'from-user':'from-coach'}"><div class="chat-message-label">${message.role==='user'?'你 / You':'English Coach · 预设示例回复'}${message.role==='assistant'?`<button class="text-button" data-action="speak-chat" data-message="${index}">♫ 听示例</button><button class="text-button" data-action="chat-to-notes" data-message="${index}">留到笔记</button>`:''}</div><div class="chat-message-text" lang="en">${esc(message.content)}</div></article>`).join(''):'<div class="chat-welcome"><span class="empty-symbol">“</span><h3>先试着用一句话开始。</h3><p>例如：I am still on the fence about trying a new café.</p></div>'}${pending?'<div class="chat-thinking" role="status">正在展示下一条预设回复…</div>':''}</div>${chat.error?`<div class="chat-error">${esc(chat.error)}</div>`:''}<div class="chat-composer"><label class="field-label" for="chat-draft">写一句你想练的英语</label><textarea id="chat-draft" class="field" data-input="chat-draft" maxlength="2000" placeholder="Tell me about your day…">${esc(chat.draft)}</textarea><div class="chat-composer-actions"><span class="small" data-chat-count>${chat.draft.length} / 2000 · 本浏览器自动保存</span><button class="btn" data-action="send-chat" ${pending?'disabled':''}>${pending?'正在展示…':'发送并看预设示例 →'}</button></div><p class="chat-privacy">无需账号，不上传对话，不请求麦克风。计时到点会提醒，不会自动发送草稿。</p></div></div><div class="card card-pad chat-note"><div class="section-head"><h2>选一个话题开始</h2><span class="chip">点选后可修改</span></div><div class="button-row">${CHAT_TOPICS.map(([topic],i)=>`<button class="btn secondary small" data-action="topic" data-topic="${i}">${topic}</button>`).join('')}</div></div>`;
}

async function sendChat(retry = false) {
  if (mode() !== 'chat' || page !== 'study' || conflicted) return;
  const date = selectedDate, chat = currentSession().chat;
  if (chatRequests.has(date)) return;
  if (!engine.configured) return showToast('演示暂未就绪，请重新载入。草稿会保留在本浏览器。');
  if (!retry) {
    const content = chat.draft.trim();
    if (!content) return showToast('先写下你想说的话，或选择一个话题。');
    if (content.length > 2000) return showToast('每条消息请控制在 2000 字以内。');
    if (recognition) recognition.stop();
    chat.messages.push({ id: uuid(), role: 'user', content, createdAt: new Date().toISOString() });
    chat.draft = '';
  } else if (chat.messages.at(-1)?.role !== 'user') return;
  chat.error = '';
  const lastMessage = chat.messages.at(-1), request = { id: uuid(), lastMessage };
  chatRequests.set(date, request); markDirty(); render(); scrollChat();
  try {
    await saveLatestState();
    if (chatRequests.get(date) !== request || ensureSession(date).chat !== chat || chat.messages.at(-1) !== lastMessage) return;
    request.sent = true;
    const result = await api('chat', { turn: chat.messages.filter(message => message.role === 'assistant').length });
    if (chatRequests.get(date) !== request || ensureSession(date).chat !== chat || chat.messages.at(-1) !== lastMessage) return;
    if (typeof result.reply !== 'string' || !result.reply.trim()) throw new Error('预设演示回复暂不可用，请重试。');
    chat.messages.push({ id: uuid(), role: 'assistant', content: result.reply.trim(), createdAt: new Date().toISOString(), model: result.model || '' });
    engine = { ...engine, configured: true, ready: true, model: '预设示例回复', status: 'demo', detail: '未连接模型。' };
  } catch (error) {
    if (chatRequests.get(date) === request && ensureSession(date).chat === chat) {
      chat.error = error.message || '对话暂时未能完成，请重试。';
      if (request.sent) engine = { ...engine, ready: false, status: 'error', detail: '上次对话未完成，可刷新连接状态后重试。' };
    }
  } finally {
    if (chatRequests.get(date) === request) chatRequests.delete(date);
    markDirty();
    if (selectedDate === date && mode() === 'chat' && page === 'study') { render(); scrollChat(); }
  }
}
function chatContext(messages) {
  const context = messages.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 2000) }));
  while (context.length > 1 && context.reduce((sum, message) => sum + message.content.length, 0) > 8000) context.shift();
  while (context.length > 1 && context[0].role !== 'user') context.shift();
  return context;
}
function scrollChat() { const transcript = document.querySelector('.chat-transcript'); if (transcript) transcript.scrollTop = transcript.scrollHeight; }
function renderSummary() {
  const session = currentSession();
  const allAttempts = session.phases.flatMap(p => p.attempts || []), totalCorrect = allAttempts.filter(a => a.correct && !a.hinted && !a.selfAssessed).length;
  return `<div class="card summary-card"><div class="section-head"><h2>写给明天的自己</h2><span class="chip">自动保存</span></div><div class="summary-fields">${[['learned', '今天，我真正会说的', '写下 1–3 个你想在生活里用的表达…'], ['hard', '还有一点卡住的', '发音、词组、语法，或一个没说出来的想法…'], ['tomorrow', '明天，我想再试试', '一个需要重练的地方，或一个想聊的场景…']].map(([key, label, placeholder]) => `<label><span class="field-label">${label}</span><textarea class="field" data-input="summary" data-field="${key}" placeholder="${placeholder}">${esc(session.summary[key] || '')}</textarea></label>`).join('')}</div><div class="stats-row"><div><div class="stat-number">${allAttempts.length}</div><div class="stat-label">今日实际提交</div></div><div><div class="stat-number">${totalCorrect}</div><div class="stat-label">无提示对照正确</div></div><div><div class="stat-number">${Math.floor(session.phases.reduce((sum, p, i) => sum + Math.max(0, (p.totalMs || duration(i)) - getRemaining(p)), 0) / 60000)}</div><div class="stat-label">实际计时 / 分钟</div></div></div><button class="btn" data-action="finish">完成并保存今日学习 ✓</button>${session.finishedAt ? `<div class="finished-stamp">✓ 已保存今日总结 · ${esc(new Date(session.finishedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))}。仍可继续补充。</div>` : ''}</div>`;
}
function renderLibrary() {
  const filtered = state.items.filter(item => (libraryFilter === 'all' || libraryFilter === 'starred' && item.starred || item.type === libraryFilter) && (!librarySearch || `${item.en} ${item.zh} ${item.focus}`.toLowerCase().includes(librarySearch.toLowerCase())));
  return `<div class="page-heading"><div><div class="eyebrow">YOUR OWN LANGUAGE</div><h1>一点点，积累自己的表达。</h1><p class="page-subtitle">原始素材一直保留在这里。收藏实用句子，也可以补充音标和要复习的重点。</p></div><button class="btn" data-action="import">＋ 导入素材</button></div><div class="library-toolbar"><div class="filter-group">${[['all', '全部'], ['word', '单词'], ['phrase', '短语'], ['sentence', '句子'], ['grammar', '语法'], ['starred', '☆ 收藏']].map(([key, label]) => `<button class="filter ${libraryFilter === key ? 'active' : ''}" data-action="filter" data-filter="${key}">${label}</button>`).join('')}</div><input class="field search" type="search" data-input="search" value="${esc(librarySearch)}" placeholder="搜索中文或英文…" aria-label="搜索表达库"></div>${filtered.length ? `<div class="library-grid">${filtered.map(item => `<article class="card library-card"><div class="card-top"><div class="quiz-meta"><span class="chip">${esc(TYPE_NAMES[item.type] || '表达')}</span>${item.sample ? '<span class="chip orange">示例素材</span>' : ''}${item.wrongCount ? `<span class="chip red">错过 ${item.wrongCount} 次</span>` : ''}</div><button class="icon-btn ${item.starred ? 'starred' : ''}" data-action="star" data-item="${esc(item.id)}" aria-label="${item.starred ? '取消收藏' : '收藏'}" aria-pressed="${!!item.starred}">${item.starred ? '★' : '☆'}</button></div><div class="library-en">${esc(item.en)}</div><div class="library-zh">${esc(item.zh)}</div><div class="pronunciation">${esc(item.ipa || '音标待补充')}</div>${item.focus ? `<div class="small">重点 · ${esc(item.focus)}</div>` : ''}<div class="library-footer"><span>${esc(item.createdDate)} · ${(item.history || []).length} 次练习</span><div class="button-row"><button class="text-button" data-action="edit-item" data-item="${esc(item.id)}">编辑</button><button class="icon-btn" data-action="speak-item" data-item="${esc(item.id)}" aria-label="播放英语发音">♫</button></div></div></article>`).join('')}</div>` : `<div class="card empty-state"><div class="empty-symbol">▤</div><h2>${state.items.length ? '没有找到这个表达' : '你的表达库，从这里开始'}</h2><p>${state.items.length ? '试试别的关键词，或查看全部词条。' : '今天学过的单词、短语与句子，都会保存在这里。'}</p><div class="button-row"><button class="btn" data-action="manual">手动添加</button><button class="btn secondary" data-action="import">导入学习素材</button></div></div>`}`;
}
function renderSettings() {
 return `<div class="page-heading"><div><div class="eyebrow">ABOUT THIS DEMO</div><h1>一小时，让学习形成循环。</h1><p class="page-subtitle">EnglishCoach / English Hour · 个人英语学习助手公开演示</p></div></div><div class="settings-grid"><section class="card settings-card"><h2>10 + 15 + 20 + 15 分钟</h2><div class="duration-grid" style="margin:20px 0">${PHASES.map((phase,i)=>`<div><span class="field-label">${phase.name}</span><strong>${[10,15,20,15][i]} min</strong></div>`).join('')}</div><p>美式英语 · B2–C1 学习定位。计时、练习队列、表达收藏、笔记和复盘可实际操作。</p><p>计时使用实际时钟；后台或休眠不会自动暂停，可手动暂停或重置。</p><button class="btn small secondary" data-action="reset-timer" style="margin-top:15px">重置当前阶段计时</button></section><section class="card settings-card"><h2>演示与实际能力</h2><p>自由对话使用预先编写的示例回复，未连接模型。OCR 使用预置识别文字，不运行图片识别；你仍可编辑文字、核对中英配对并确认入库。</p><p>答案使用本地文字规则对照，不判断所有合理表达，不提供语义批改或发音评分。</p><p>♫ 朗读仅使用浏览器能找到的本机英语声音；没有本机声音时会提示，文字体验不受影响。</p><button class="btn small secondary" data-action="speak-text" data-text="I would like to make English part of my everyday life." style="margin-top:15px">试听本机朗读 ♫</button></section><section class="card settings-card settings-full"><h2>示例与数据</h2><p>初始表达、昨日练习、聊天及笔记全部为合成示例，不含个人学习历史。新输入和练习进度仅保存到当前浏览器的本演示专用存储，刷新后可继续。</p><p>顶部「重置体验」会清除本演示的本地修改并恢复示例，不影响其他网站数据。页面没有账号、模型密钥、上传或麦克风功能。</p></section></div>`;
}

function selectPhase(index) {
  if (index < 0 || index > 3) return;
  if (currentSession().phase !== index) { pauseTimer(); if (recorder?.state === 'recording') recorder.stop(); if (recognition) recognition.stop(); }
  currentSession().phase = index; page = 'study'; ensureQuiz(index); markDirty(); render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
function pauseTimer() {
  const phase = currentPhase();
  if (phase.timer.running) { phase.timer.remainingMs = getRemaining(phase); phase.timer.running = false; phase.timer.endsAt = null; markDirty(); }
}
function toggleTimer() {
  const phase = currentPhase();
  if (phase.timer.running) pauseTimer();
  else {
    const remaining = getRemaining(phase);
    if (remaining <= 0) { showToast('这部分已经到时。请进入下一步，或在设置里明确重置计时。'); return; }
    // One active timer per local app: other dates retain their elapsed time.
    for (const session of Object.values(state.sessions)) for (const p of session.phases || []) if (p.timer?.running) { p.timer.remainingMs = timerRemaining(p.timer, Date.now()); p.timer.running = false; p.timer.endsAt = null; }
    phase.timer.remainingMs = remaining; phase.timer.endsAt = Date.now() + remaining; phase.timer.running = true; phase.startedAt ||= new Date().toISOString(); markDirty();
  }
  render();
}
function nextPhase() {
  const index = currentSession().phase;
  pauseTimer(); currentPhase().finishedAt = new Date().toISOString();
  if (index === 3) finishSession();
  else { selectPhase(index + 1); showToast('已进入下一部分。准备好后点击「开始」。'); }
}
function finishSession() {
  pauseTimer(); currentSession().finishedAt = new Date().toISOString(); currentPhase().finishedAt = new Date().toISOString();
  markDirty(); flushSave(); render(); showToast('今天的学习记录与总结已加入保存队列。');
}
function tickTimerDisplay() {
  if (!state) return;
  const phase = currentPhase(), remain = getRemaining(phase), total = phase.totalMs || duration(currentSession().phase);
  const display = document.querySelector('[data-timer]'); if (display) { display.textContent = formatTime(remain); display.classList.toggle('ended', remain <= 0); }
  const progress = document.querySelector('[data-timer-progress]'); if (progress) progress.style.width = `${Math.max(0, Math.min(100, (total - remain) / total * 100))}%`;
  const button = document.querySelector('[data-timer-button]'); if (button) { button.disabled = remain <= 0; button.textContent = phase.timer.running ? 'Ⅱ 暂停' : remain <= 0 ? '已到时' : phase.startedAt ? '▷ 继续' : '▷ 开始'; }
  document.title = phase.timer.running ? `${formatTime(remain)} · ${PHASES[currentSession().phase].name} · EnglishCoach · 公开演示` : 'EnglishCoach · 你的英语一小时 · 公开演示';
}
function timerTick() {
  if (!state) return;
  let expired = false;
  for (const [date, session] of Object.entries(state.sessions)) for (const [index, phase] of (session.phases || []).entries()) {
    if (phase.timer?.running && timerRemaining(phase.timer, Date.now()) <= 0) {
      phase.timer.running = false; phase.timer.remainingMs = 0; phase.timer.endsAt = null; phase.elapsedAt = new Date().toISOString(); markDirty();
      if (date === selectedDate && index === currentSession().phase) expired = true;
    }
  }
  if (expired) { playBell(); showToast(`${PHASES[currentSession().phase].name}时间到了，请完成当前答案后进入下一步。`); render(); }
  if (lastTickDay !== today()) { lastTickDay = today(); showToast('日期已变化。当前笔记仍属于所选日期；点日期旁提示可返回今天。'); render(); }
  tickTimerDisplay();
}
let audioContext;
function unlockAudio() {
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume(); } catch {}
}
function playBell() {
  try {
    if (!audioContext) return;
    for (let i = 0; i < 2; i++) { const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.type = 'sine'; osc.frequency.value = i ? 784 : 587; const t = audioContext.currentTime + i * .22; gain.gain.setValueAtTime(.001, t); gain.gain.exponentialRampToValueAtTime(.12, t + .025); gain.gain.exponentialRampToValueAtTime(.001, t + .6); osc.connect(gain); gain.connect(audioContext.destination); osc.start(t); osc.stop(t + .65); }
  } catch {}
}
function findQuestion(id) { return (currentPhase().quiz || []).find(question => question.id === id); }
function getAnswer(q) { return currentPhase().answers[q.id] ||= { value: '', hinted: false, checked: false, revealed: false }; }
function speak(text, slow=false) {
 if(!speechSupported()) return showToast('当前浏览器不支持朗读；可以继续文字体验。');
 voices=speechSynthesis.getVoices();
 const voice=voices.find(v=>v.localService&&v.lang.replace('_','-')==='en-US')||voices.find(v=>v.localService&&/^en/i.test(v.lang));
 if(!voice) return showToast('没有找到本机英语声音；演示不调用在线声音，可继续文字体验。');
 const utterance=new SpeechSynthesisUtterance(text); utterance.lang=voice.lang; utterance.voice=voice; utterance.rate=slow?.72:.92;
 utterance.onerror=event=>{if(!['interrupted','canceled'].includes(event.error))showToast('本机朗读暂不可用。');};
 speechSynthesis.cancel();speechSynthesis.speak(utterance);
}

function speakQuestion(id, slow = false) { const q = findQuestion(id); if (!q) return; recordEncounter(q); if (q.kind === 'choice-cloze' && !currentPhase().completedIds.includes(q.id)) { getAnswer(q).hinted = true; markDirty(); render(); } speak(['cloze', 'choice-cloze'].includes(q.kind) ? q.answer : q.en || q.answer, slow); }
async function checkQuestion(id,override=null) {
 const q=findQuestion(id); if(!q)return;
 const phase=currentPhase(),answer=getAnswer(q),item=itemFor(q.itemId);
 if(phase.completedIds.includes(id))return;
 if(!answer.value.trim())return showToast(q.kind==='choice-cloze'?'先选择一个选项，再确认。':'先写下答案，再核对。');
 if(answer.checked&&answer.lastSubmittedValue===answer.value)return showToast('这次答案已记录，可隐藏答案后独立重试。');
 const result=q.kind==='choice-cloze'?{correct:answer.value===q.answer,feedback:answer.value===q.answer?'选择正确，与示例原文一致。':'与示例原文不一致，请核对后独立重试。'}:checkAnswer(answer.value,item||q,{expected:q.answer});
 result.feedback=result.correct?'文字对照一致。可以继续下一题。':q.kind==='choice-cloze'?result.feedback:'与参考文字不一致。演示仅做本地文字对照，其他合理表达需要人工判断。';
 Object.assign(answer,{checked:true,correct:result.correct,feedback:result.feedback,lastSubmittedValue:answer.value});
 const attempt={id:uuid(),questionId:q.id,itemId:q.itemId,date:selectedDate,mode:mode(),answer:answer.value,correct:!!result.correct,hinted:!!answer.hinted,at:new Date().toISOString(),questionSnapshot:{...q}};
 recordEncounter(q);phase.attempts.push(attempt);if(item)recordAttempt(state,item.id,attempt);
 if(result.correct&&!answer.hinted){phase.completedIds.push(q.id);showToast('已移出本轮待练；表达仍保留在表达库。');}
 else if(!result.correct){answer.revealed=true;answer.hinted=true;showToast('已保留在待练。看过答案后，可隐藏并独立重试。');}
 else showToast('这次有提示，请隐藏答案后独立重试。');
 markDirty();render();
}

async function refreshQuiz(force = false) {
  const p = currentPhase();
  if (!force && p.quiz?.length && !confirm('重新抽取本轮题目？已保存的练习记录会保留，本轮待练进度将重新生成。')) return;
  if (mode() === 'review') {
    const date = selectedDate;
    await saveLatestState(true);
    const latest = await api('state', undefined, 'GET');
    if (selectedDate !== date || currentPhase() !== p) return;
    // A remote revision can be adopted only while this page has no new local edits.
    if (dirty !== saved) return showToast('刚才的输入正在保存，请稍后重新读取。');
    if (latest.revision !== revision) { state = latest.state; revision = latest.revision; }
    const phase = currentSession().phases[0];
    generateReview(phase); phase.round = (phase.round || 1) + 1;
    markDirty(); render(); return;
  }
  preserveQuestionSnapshots(p);
  p.quiz = buildQuiz(candidateItems(currentSession().phase), mode(), selectedDate); p.completedIds = []; p.answers = {}; p.encounteredIds = []; p.round = (p.round || 1) + 1; markDirty(); render();
}
function mergeImportedIntoQuizzes(date) {
  for (const [sessionDate, session] of Object.entries(state.sessions)) for (const index of [0, 1, 3]) {
    const phase = session.phases?.[index]; if (!phase) continue;
    const relevant = index === 1 ? sessionDate === date : index === 0 ? date < sessionDate : sessionDate === date;
    if (!relevant) continue;
    if (!phase.quiz?.length) { phase.quiz = null; continue; }
    // Preserve active attempts; fresh items are added only to scene, while capped review rounds remain stable.
    if (index === 1) {
      const candidates = buildQuiz(candidateItems(index, sessionDate), PHASES[index].mode, sessionDate);
      for (const q of candidates) if (!phase.quiz.some(existing => existing.itemId === q.itemId && existing.kind === q.kind)) phase.quiz.push(q);
    }
  }
}
function openImport(options = {}) {
  if (importState && !confirm('重新打开导入会替换尚未保存的导入草稿，继续吗？')) return;
  importState = { raw: options.raw || '', date: options.date || selectedDate, rows: options.rows || [], stage: options.rows ? 'preview' : 'raw', warnings: [], busy: false, error: '', sourceId: null, imageUrl: null, editId: options.editId || null, filename: '', ai: false };
  renderImport();
}
function renderImport() {
 const data=importState;if(!data){modalRoot.innerHTML='';return;}const preview=data.stage==='preview';
 modalRoot.innerHTML=`<div class="modal-backdrop" data-backdrop><section class="modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><header class="modal-head"><div><h2 id="import-title">${data.editId?'编辑学习表达':'先核对，再加入学习'}</h2><div class="modal-step">${preview?'02 / 核对中英配对、音标和重点':'01 / 预置 OCR 示例，或粘贴双语文本'}</div></div><button class="icon-btn" data-action="close-import" aria-label="关闭导入">×</button></header><div class="modal-body"><div class="import-toolbar"><label class="field-label">素材学习日期 <input class="date-input" type="date" data-import-input="date" value="${esc(data.date)}"></label>${!preview?'<button class="btn secondary small" data-action="demo-ocr">载入 OCR 核对示例</button>':`<span class="small">${data.rows.length} 条表达 · 确认前可编辑</span>`}</div>${data.ocr?`<div class="ocr-source"><span class="eyebrow">SYNTHETIC SOURCE CARD · 合成原文</span><h3>At the café</h3><p>把这个单独放在旁边可以吗？<br><strong>Could I have this on the side?</strong></p><p>我还没有决定。<br><strong>I'm still on the fence.</strong></p><p>顺便说一下<br><strong>by the way</strong></p><div class="small">这是示例原文卡片。下方预置识别文字故意把 side 写成 slde，请先改正。</div></div>`:''}${!preview?`<div class="import-guide">${data.ocr?'OCR 流程演示：这里使用预置识别文字，不会识别图片。请对照上方原文修改 slde → side，再核对配对。':'可粘贴双语文本，或用示例体验。不会上传内容，不会生成缺失翻译。'}<br>格式：中文 | English | /音标/ | 重点</div><textarea class="field raw-text" data-import-input="raw" aria-label="素材原文" placeholder="我还没有决定。 | I'm still on the fence. | | on the fence">${esc(data.raw)}</textarea><p class="import-note">先编辑原文，再点「核对配对」。只有最后确认的内容才进入表达库。</p>`:`<div class="import-guide">中文用于出题，英文用于文字对照和朗读；重点必须出现在英文原句中。可以逐项修改，也可返回原文。</div><div class="import-rows">${data.rows.map((row,i)=>`<div class="edit-row"><div class="row-heading"><span>表达 ${i+1}</span><button class="text-button" data-action="remove-row" data-index="${i}">移除此行</button></div><div class="edit-fields"><label><span class="field-label">中文提示</span><input class="field" data-row="${i}" data-row-field="zh" value="${esc(row.zh)}"></label><label><span class="field-label">英文参考答案</span><input class="field" data-row="${i}" data-row-field="en" value="${esc(row.en)}"></label></div><div class="edit-details"><label><span class="field-label">类型</span><select class="field" data-row="${i}" data-row-field="type">${Object.entries(TYPE_NAMES).map(([key,label])=>`<option value="${key}" ${row.type===key?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="field-label">音标（可选）</span><input class="field" data-row="${i}" data-row-field="ipa" value="${esc(row.ipa||'')}"></label><label><span class="field-label">句中重点（可选）</span><input class="field" data-row="${i}" data-row-field="focus" value="${esc(row.focus||'')}"></label><label class="check-label"><input type="checkbox" data-row="${i}" data-row-field="starred" ${row.starred?'checked':''}>收藏</label></div></div>`).join('')}</div><button class="btn secondary small" style="margin-top:18px" data-action="add-row">＋ 添加空白行</button>`}${data.warnings.length?`<div class="banner" style="margin-top:16px">${data.warnings.map(w=>esc(w)).join('<br>')}</div>`:''}${data.error?`<p class="form-error" role="alert">${esc(data.error)}</p>`:''}</div><footer class="modal-footer"><p>本地文字配对 · 确认前请核对示例</p><div class="button-row">${preview?`<button class="btn secondary" data-action="import-back">返回原文</button><button class="btn" data-action="confirm-import">${data.editId?'保存修改':'确认加入学习'} →</button>`:'<button class="btn secondary" data-action="manual-row">手动配对</button><button class="btn" data-action="extract">核对配对 →</button>'}</div></footer></section></div>`;
}

async function extractImport(useAI = false) {
  if (!importState) return;
  const draft = importState;
  if (!importState.raw.trim() && !(useAI && importState.sourceId)) { importState.error = '请先粘贴内容或上传图片，也可以点击「手动配对」。'; renderImport(); return; }
  importState.busy = true; importState.error = ''; renderImport();
  try {
    const result = await api('extract', { text: importState.raw });
    if (importState !== draft) return;
    importState.rows = (result.items || []).map(item => ({ ...item, ...(importState.ocr ? { sample: true } : {}) })); importState.warnings = result.warnings || []; importState.ai = useAI; importState.stage = 'preview';
    if (!importState.rows.length) { importState.rows = [blankItem()]; importState.warnings.push('没有找到完整的中英配对，请对照原文手动填写。'); }
  } catch (error) { if (importState === draft) importState.error = error.message; }
  finally { if (importState === draft) { importState.busy = false; renderImport(); } }
}
function blankItem() { return { id: uuid(), zh: '', en: '', type: 'phrase', ipa: '', focus: '', starred: false, history: [], wrongCount: 0 }; }
function confirmImport() {
  const data = importState; if (!data) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) { data.error = '请选择这份素材的学习日期。'; renderImport(); return; }
  if (!data.rows.length) { data.error = '请至少填写一条表达。'; renderImport(); return; }
  for (const [index, row] of data.rows.entries()) {
    if (!row.zh?.trim() || !row.en?.trim()) { data.error = `第 ${index + 1} 条缺少中文或英文，请先完成配对。`; renderImport(); return; }
    if (row.focus?.trim() && !row.en.toLowerCase().includes(row.focus.trim().toLowerCase())) { data.error = `第 ${index + 1} 条的重点不在英文原句里，请核对，或先留空。`; renderImport(); return; }
  }
  const rows = data.rows.map(row => ({ ...row, id: row.id || uuid(), zh: row.zh.trim(), en: row.en.trim(), ipa: (row.ipa || '').trim(), focus: (row.focus || '').trim(), type: row.type || 'phrase', starred: !!row.starred, createdDate: data.date, history: row.history || [], wrongCount: row.wrongCount || 0, ...(data.sourceId ? { sourceId: data.sourceId } : {}) }));
  if (data.editId) {
    const index = state.items.findIndex(item => item.id === data.editId);
    if (index >= 0) { rows[0].id = data.editId; state.items[index] = { ...state.items[index], ...rows[0] }; }
  } else state.items.push(...rows);
  mergeImportedIntoQuizzes(data.date);
  const editMode = !!data.editId; const date = data.date;
  closeImport(true); markDirty(); render(); showToast(editMode ? '表达已更新。已生成的试题会保持原题；需要时可重新生成。' : `${rows.length} 条表达已加入 ${date} 的学习素材。`);
}
function closeImport(force=false) { if(!force&&importState&&(importState.raw.trim()||importState.rows.some(row=>row.zh||row.en))&&!confirm('关闭会丢弃本次尚未确认的草稿，继续吗？'))return;importState=null;modalRoot.innerHTML=''; }

function useSample() {
  const demo = sampleItems(selectedDate);
  openImport({ date: selectedDate, rows: demo });
  importState.warnings = ['这是用于体验功能的示例素材，不代表你已经学过。确认加入后，会明确标记为「示例素材」。']; renderImport();
}

function openOcrDemo(){if(importState&&!confirm('用示例替换尚未确认的整理草稿，继续吗？'))return;importState=null;openImport({raw:OCR_RAW});importState.ocr=true;importState.warnings=['预置 OCR 文字含一个演示用错误：请把 slde 改为 side。'];renderImport();}

async function handleAction(button) {
  const action = button.dataset.action, id = button.dataset.question, itemId = button.dataset.item;
  unlockAudio();
  switch (action) {
    case 'nav': if (recognition) recognition.stop(); if (recorder?.state === 'recording') recorder.stop(); page = button.dataset.page; render(); break;
    case 'phase': selectPhase(Number(button.dataset.index)); break;
    case 'timer': toggleTimer(); break;
    case 'next': nextPhase(); break;
    case 'finish': finishSession(); break;
    case 'today': pauseTimer(); if (recognition) recognition.stop(); selectedDate = today(); ensureSession(selectedDate); render(); break;
    case 'check': await checkQuestion(id); break;
    case 'review-category': reviewCategory = button.dataset.category; reviewPage = 0; render(); break;
    case 'review-page': reviewPage = Number(button.dataset.page) || 0; render(); break;
    case 'review-choice': { const q = findQuestion(id); if (!q || q.kind !== 'choice-cloze') break; const option = q.options[Number(button.dataset.option)]; if (option === undefined) break; getAnswer(q).value = option; markDirty(); render(); break; }
    case 'check-local': { const q = findQuestion(id); if (q) await checkQuestion(id, { ...checkAnswer(getAnswer(q).value, itemFor(q.itemId) || q, { expected: q.answer }), local: true }); break; }
    case 'reveal': { const q = findQuestion(id); if (!q) break; recordEncounter(q); const answer = getAnswer(q); answer.hinted = true; answer.revealed = true; markDirty(); render(); break; }
    case 'retry-question': { const q = findQuestion(id); if (!q) break; const answer = getAnswer(q); Object.assign(answer, { value: '', hinted: false, revealed: false, checked: false, feedback: '', correct: false }); markDirty(); render(); break; }
    case 'star': { const item = itemFor(itemId); if (!item) break; item.starred = !item.starred; markDirty(); render(); break; }
    case 'speak-question': speakQuestion(id); break;
    case 'slow': speakQuestion(id, true); break;
    case 'speak-item': { const item = itemFor(itemId); if (item) speak(item.en); break; }
    case 'speak-text': speak(button.dataset.text); break;
    case 'retry-round': await refreshQuiz(true); break;
    case 'refresh-quiz': await refreshQuiz(); break;
    case 'import': openImport(); break;
    case 'demo-ocr': openOcrDemo(); break;
    case 'reset-demo': if (confirm('重置本演示？只会清除本演示在浏览器中的练习、对话和笔记，并恢复示例。')) { await flushSave(); clearTimeout(saveTimer); dirty = saved; resetDemo(); location.reload(); } break;
    case 'import-yesterday': openImport({ date: previousDate(selectedDate) }); break;
    case 'manual': openImport({ rows: [blankItem()] }); break;
    case 'sample': useSample(); break;
    case 'notes-import': { const text = currentSession()[button.dataset.field] || ''; openImport({ raw: text }); break; }
    case 'edit-item': { const item = itemFor(itemId); if (item) openImport({ rows: [{ ...item }], date: item.createdDate, editId: item.id }); break; }
    case 'filter': libraryFilter = button.dataset.filter; render(); break;
    case 'close-import': closeImport(); break;
    case 'extract': await extractImport(); break;
    case 'manual-row': importState.stage = 'preview'; importState.rows = [blankItem()]; importState.error = ''; renderImport(); break;
    case 'add-row': importState.rows.push(blankItem()); renderImport(); break;
    case 'remove-row': importState.rows.splice(Number(button.dataset.index), 1); renderImport(); break;
    case 'import-back': importState.stage = 'raw'; importState.error = ''; renderImport(); break;
    case 'confirm-import': confirmImport(); break;
    case 'send-chat': await sendChat(); break;
    case 'retry-chat': await sendChat(true); break;
    case 'refresh-engine': await refreshEngine(); break;
    case 'speak-chat': { const message = currentSession().chat.messages[Number(button.dataset.message)]; if (message?.role === 'assistant') speak(message.content); break; }
    case 'chat-to-notes': { const message = currentSession().chat.messages[Number(button.dataset.message)]; if (message?.role === 'assistant') { currentSession().chatNotes = (currentSession().chatNotes || '') + ((currentSession().chatNotes || '') ? '\n\n' : '') + message.content; markDirty(); render(); showToast('回应已留到右侧笔记，可以继续整理。'); } break; }
    case 'topic': { const topic = CHAT_TOPICS[Number(button.dataset.topic)]; if (!topic) break; const chat = currentSession().chat, draft = chat.draft.trim() ? `${chat.draft}\n\n${topic[1]}` : topic[1]; if (draft.length > 2000) { showToast('草稿已接近字数限制，请先整理当前内容。'); break; } if (recognition) recognition.stop(); chat.draft = draft; markDirty(); render(); document.querySelector('[data-input="chat-draft"]')?.focus(); break; }
    case 'reload': if (!state || confirm('重新载入会放弃本页尚未保存的改动。确定已复制需要保留的内容吗？')) { dirty = saved; location.reload(); } break;
    case 'retry-save': markDirty(); await flushSave(); showToast(saveError ? '仍未保存：' + saveError : '保存请求已完成。'); break;
    case 'reset-timer': if (confirm('重置当前阶段计时？本阶段会重新从完整时间开始，练习内容与答案保持不变。')) { const p = currentPhase(); p.timer = { remainingMs: p.totalMs || duration(currentSession().phase), endsAt: null, running: false }; p.startedAt = null; p.finishedAt = null; markDirty(); render(); showToast('当前阶段计时已重置。'); } break;
  }
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-action]'); if (!button || button.disabled) return;
  event.preventDefault(); Promise.resolve(handleAction(button)).catch(error => { console.error(error); showToast(error.message || '操作未完成，请重试。'); });
});
document.addEventListener('input', event => {
  const element = event.target;
  if (element.dataset.importInput && importState) { importState[element.dataset.importInput] = element.value; importState.error = ''; return; }
  if (element.dataset.rowField && importState) { const row = importState.rows[Number(element.dataset.row)]; if (row) row[element.dataset.rowField] = element.type === 'checkbox' ? element.checked : element.value; return; }
  switch (element.dataset.input) {
    case 'answer': { const q = findQuestion(element.dataset.question); if (q) { getAnswer(q).value = element.value; markDirty(); } break; }
    case 'notes': { currentSession()[element.dataset.field] = element.value; currentPhase().notes = element.value; const count = element.closest('.note-card')?.querySelector('[data-note-count]'); if (count) count.textContent = `${element.value.length} 字 · 自动保存`; markDirty(); break; }
    case 'chat-draft': { currentSession().chat.draft = element.value; const count = document.querySelector('[data-chat-count]'); if (count) count.textContent = `${element.value.length} / 2000 · 草稿自动保存`; markDirty(); break; }
    case 'summary': currentSession().summary[element.dataset.field] = element.value; markDirty(); break;
    case 'search': { librarySearch = element.value; clearTimeout(uiAnswerTimer); uiAnswerTimer = setTimeout(() => { const selection = element.selectionStart; render(); const input = document.querySelector('[data-input="search"]'); input?.focus(); try { input?.setSelectionRange(selection, selection); } catch {} }, 250); break; }
  }
});
document.addEventListener('change', event => {
  const element = event.target;
  if (element.dataset.input === 'date' && element.value) { pauseTimer(); if (recorder?.state === 'recording') recorder.stop(); if (recognition) recognition.stop(); selectedDate = element.value; ensureSession(selectedDate); markDirty(); render(); }
  
  if (element.dataset.rowField && importState) { const row = importState.rows[Number(element.dataset.row)]; if (row) row[element.dataset.rowField] = element.type === 'checkbox' ? element.checked : element.value; }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.target.dataset.input === 'answer') { event.preventDefault(); checkQuestion(event.target.dataset.question); }
  if (event.key === 'Escape' && importState) closeImport();
});
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!form.dataset.form) return;
  event.preventDefault();
  const values = new FormData(form);
  if (form.dataset.form === 'settings') {
    const durations = [0, 1, 2, 3].map(index => Number(values.get(`duration${index}`)));
    if (durations.some(value => !Number.isInteger(value) || value < 1) || durations.reduce((sum, value) => sum + value, 0) !== 60) { const message = form.querySelector('[data-settings-message]'); message.textContent = '请填写正整数分钟，四部分总计必须为 60 分钟。'; message.className = 'form-error'; return; }
    Object.assign(state.settings, { durations, accent: values.get('accent'), level: values.get('level'), voice: values.get('voice') });
    for (const session of Object.values(state.sessions)) {
      if ((session.phases || []).some(p => p.startedAt || p.finishedAt)) continue;
      for (const [index, p] of (session.phases || []).entries()) { p.timer = { remainingMs: durations[index] * 60000, endsAt: null, running: false }; p.totalMs = durations[index] * 60000; }
    }
    markDirty(); render(); showToast('学习设置已更新，总计仍是 60 分钟。');

  }
});
window.addEventListener('beforeunload', event => {
  if (dirty !== saved || recordingFor || chatRequests.size || gradingRequests.size) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); else timerTick(); });
window.addEventListener('focus', () => { if (state) timerTick(); });
if (speechSupported()) { voices = speechSynthesis.getVoices(); speechSynthesis.addEventListener('voiceschanged', () => { voices = speechSynthesis.getVoices(); if (page === 'settings') render(); }); }
async function init() {
  try {
    const results = await Promise.allSettled([api('state', undefined, 'GET'), api('config', undefined, 'GET'), api('engine', undefined, 'GET')]);
    if (results[0].status !== 'fulfilled') throw results[0].reason;
    const data = results[0].value, defaults = defaultState();
    state = { ...defaults, ...data.state, settings: { ...defaults.settings, ...(data.state?.settings || {}) }, items: Array.isArray(data.state?.items) ? data.state.items : [], sessions: data.state?.sessions || {} };
    revision = data.revision; apiConfig = results[1].status === 'fulfilled' ? results[1].value : {};
    engine = results[2].status === 'fulfilled' ? results[2].value : { configured: false, ready: false, status: 'error', model: '', detail: '预设演示暂未就绪，请重新载入。' };
    apiConfig.configured = !!engine.configured;
    const session = ensureSession(selectedDate);
    for (const existing of Object.values(state.sessions)) for (const [index, p] of (existing.phases || []).entries()) p.totalMs ||= duration(index);
    markDirty(); timerTick(); render(); setInterval(timerTick, 300);
  } catch (error) {
    app.innerHTML = `<div class="loading"><div class="card card-pad" style="max-width:520px;margin:24px"><span class="brand-mark">e.</span><h2 style="margin:19px 0 10px">暂时无法打开演示</h2><p class="small" style="line-height:1.9">请刷新页面重试；已有演示记录不会在这里被主动覆盖。</p><p class="form-error">${esc(error.message)}</p><button class="btn" data-action="reload">重新连接</button></div></div>`;
  }
}
init();
