const TYPES = new Set(['word', 'phrase', 'sentence', 'grammar']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const hasChinese = text => /\p{Script=Han}/u.test(text);
const hasEnglish = text => /[A-Za-z]/.test(text);
const newId = () => globalThis.crypto.randomUUID();

export function localDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError('Invalid date');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function defaultState() {
  return {
    schemaVersion: 1,
    settings: { accent: 'en-US', level: 'B2-C1', durations: [10, 15, 20, 15] },
    items: [],
    sessions: {},
  };
}

const stripNumber = text => text.replace(/^\s*(?:[-*•]\s+|\d+[.)、：:]\s*)/, '').trim();
const isIpa = text => /^(?:\/[^/]+\/|\[[^\]]+\])$/.test(text) && !hasChinese(text);
const typeLabels = { word: 'word', phrase: 'phrase', sentence: 'sentence', grammar: 'grammar', 单词: 'word', 词汇: 'word', 短语: 'phrase', 句子: 'sentence', 语法: 'grammar' };
function removeLabel(value) {
  return value.replace(/^(?:中文|英文|English|Chinese|音标|IPA|重点|focus)\s*[:：]\s*/i, '').trim();
}
function getEntry(zh, english, ipa = '', focus = '', explicitType = '') {
  let en = removeLabel(english).trim();
  const label = en.match(/^\[?(word|phrase|sentence|grammar|单词|词汇|短语|句子|语法)\]?\s*[:：]\s*/i);
  if (label) { explicitType = typeLabels[label[1].toLowerCase()]; en = en.slice(label[0].length); }
  const highlights = [...en.matchAll(/\*\*([^*]+)\*\*/g)].map(match => match[1].trim()).filter(Boolean);
  en = en.replace(/\*\*([^*]+)\*\*/g, '$1').trim();
  focus = removeLabel(focus || highlights[0] || '').replace(/\*\*/g, '').trim();
  const tokens = en.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || [];
  const type = TYPES.has(explicitType) ? explicitType : tokens.length === 1 ? 'word' : (tokens.length > 5 || /[.!?]$/.test(en) || focus) ? 'sentence' : 'phrase';
  return { id: newId(), type, zh: removeLabel(zh).trim(), en, ipa: removeLabel(ipa).trim(), focus, starred: false, createdDate: localDate(), history: [], wrongCount: 0 };
}

/** Parse explicit bilingual material only. Missing translations are reported, never generated. */
export function parseText(text = '') {
  const items = [];
  const warnings = [];
  let pending = null;
  const flush = () => {
    if (pending) warnings.push(`第 ${pending.line} 行未找到对应的中英文：${pending.text.slice(0, 90)}`);
    pending = null;
  };
  const append = (zh, en, ipa = '', focus = '', line = 0) => {
    const item = getEntry(zh, en, ipa, focus);
    if (!item.zh || !hasChinese(item.zh) || !item.en || !hasEnglish(item.en) || hasChinese(item.en)) {
      warnings.push(`第 ${line} 行中英文配对不清楚，请按「中文 | English | /音标/ | 重点」检查。`);
      return;
    }
    if (item.focus && !item.en.toLowerCase().includes(item.focus.toLowerCase())) warnings.push(`第 ${line} 行重点「${item.focus}」未出现在英文原句中，请检查。`);
    items.push(item);
  };
  String(text).replace(/\r\n?/g, '\n').split('\n').forEach((raw, index) => {
    const line = index + 1;
    const value = stripNumber(raw);
    if (!value || /^#{1,6}\s/.test(value) || /^[-:|\s]{3,}$/.test(value)) return;
    let fields = value.includes('|') ? value.split('|') : value.includes('\t') ? value.split('\t') : null;
    if (fields) {
      while (fields.length && !fields[0].trim()) fields.shift();
      while (fields.length && !fields[fields.length - 1].trim()) fields.pop();
      fields = fields.map(removeLabel);
      if (/^(中文|Chinese)$/i.test(fields[0]) && /^(英文|English)$/i.test(fields[1] || '')) return;
      if (/^(英文|English)$/i.test(fields[0]) && /^(中文|Chinese)$/i.test(fields[1] || '')) return;
      flush();
      if (fields.length < 2) { warnings.push(`第 ${line} 行缺少中英文配对。`); return; }
      const [left, right, ipa = '', focus = ''] = fields;
      if (hasChinese(left) && hasEnglish(right) && !hasChinese(right)) append(left, right, ipa, focus, line);
      else if (hasChinese(right) && hasEnglish(left) && !hasChinese(left)) append(right, left, ipa, focus, line);
      else warnings.push(`第 ${line} 行中英文配对不清楚，请检查。`);
      if (fields.length > 4) warnings.push(`第 ${line} 行超过 4 列，多余列未导入。`);
      return;
    }
    const content = removeLabel(value);
    if (isIpa(content)) {
      if (pending) pending.ipa = content;
      else if (items.length && !items.at(-1).ipa) items.at(-1).ipa = content;
      else warnings.push(`第 ${line} 行音标没有对应词条。`);
      return;
    }
    const language = hasChinese(content) ? 'zh' : hasEnglish(content) ? 'en' : null;
    if (!language) { warnings.push(`第 ${line} 行无法识别为中英文词条：${content.slice(0, 90)}`); return; }
    if (pending && pending.language !== language) {
      append(language === 'zh' ? content : pending.text, language === 'en' ? content : pending.text, pending.ipa || '', '', pending.line);
      pending = null;
    } else {
      flush();
      pending = { language, text: content, line, ipa: '' };
    }
  });
  flush();
  const seen = new Set();
  const unique = items.filter(item => {
    const key = `${normalizeAnswer(item.en)}\u0000${item.zh}`;
    if (seen.has(key)) { warnings.push(`重复词条已合并：${item.en}`); return false; }
    seen.add(key); return true;
  });
  return { items: unique, warnings };
}

const CONTRACTIONS = {
  "can't": 'can not', cannot: 'can not', "won't": 'will not', "shan't": 'shall not',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "isn't": 'is not',
  "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not', "haven't": 'have not',
  "hasn't": 'has not', "hadn't": 'had not', "wouldn't": 'would not', "couldn't": 'could not',
  "shouldn't": 'should not', "mustn't": 'must not', "needn't": 'need not',
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "he'll": 'he will', "she'll": 'she will',
  "we'll": 'we will', "they'll": 'they will', "let's": 'let us',
};
export function normalizeAnswer(value = '') {
  return String(value).normalize('NFKC').toLowerCase().trim()
    .replace(/[’‘`]/g, "'")
    .replace(/^'(.*)'$/s, '$1')
    .replace(/\b[a-z]+(?:'[a-z]+)?\b/g, token => CONTRACTIONS[token] || token)
    // Apostrophes inside contractions or possessives carry meaning: its !== it's.
    .replace(/[\p{P}\p{S}]/gu, mark => mark === "'" ? mark : ' ')
    .replace(/\s+/g, ' ').trim();
}

export function checkAnswer(answer, item, options = {}) {
  const expected = String(options.expected ?? item?.en ?? '');
  const candidates = [expected, ...(options.alternatives ?? item?.alternatives ?? [])];
  const normalizedAnswer = normalizeAnswer(answer);
  const correct = Boolean(normalizedAnswer) && candidates.some(candidate => normalizedAnswer === normalizeAnswer(candidate));
  return {
    correct, normalizedAnswer, expected,
    feedback: correct ? '表达匹配。再跟读一遍，巩固发音。' : normalizedAnswer ? '和参考表达不一致。请核对拼写、词序和语法；其他合理表达可在连接模型后通过 AI 复核。' : '先填写答案，再检查。',
  };
}

const STOP_WORDS = new Set('a an the i you he she it we they this that these those am is are was were be been being to of for in on at by as and or but if then than with from have has had do does did can could would should will may might must not my your his her its our their me him us them what which who how where when please get got let'.split(' '));
export function createCloze(item) {
  const en = String(item?.en || '');
  const focus = String(item?.focus || '').trim();
  if (focus) {
    const escaped = focus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`(?<![A-Za-z])${escaped}(?![A-Za-z])`, 'i').exec(en);
    if (match) return { prompt: en.slice(0, match.index) + '_____' + en.slice(match.index + match[0].length), answer: match[0] };
  }
  const matches = [...en.matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)];
  if (matches.length < 4) return null;
  const chosen = matches.filter(match => match[0].length >= 4 && !STOP_WORDS.has(match[0].toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length || a.index - b.index)[0];
  if (!chosen) return null;
  return { prompt: en.slice(0, chosen.index) + '_____' + en.slice(chosen.index + chosen[0].length), answer: chosen[0] };
}

function previousDate(date) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return localDate(value);
}
function datesFor(item) {
  return [item.createdDate, item.lastPracticed, ...(item.history || []).map(attempt => attempt.date)]
    .filter(date => typeof date === 'string' && DATE_PATTERN.test(date));
}
function unresolvedError(item) {
  // A correct answer after hearing/seeing a hint does not resolve an earlier failure.
  const decisive = (item.history || []).filter(attempt => attempt.correct === false || (attempt.correct === true && !attempt.hinted)).at(-1);
  return decisive ? decisive.correct === false : Number(item.wrongCount) > 0 && item.mastered !== true;
}
function priority(item) {
  return (unresolvedError(item) ? 100 + Math.min(20, Number(item.wrongCount) || 0) : 0) + (item.starred ? 20 : 0) + (item.focus ? 15 : 0);
}
function ordered(items) {
  return [...items].sort((a, b) => priority(b) - priority(a) || String(a.en).localeCompare(String(b.en), 'en'));
}
function question(item, mode, kind) {
  const cloze = kind === 'cloze' ? createCloze(item) : null;
  if (kind === 'cloze' && !cloze) return null;
  return {
    id: `${mode}:${item.id}:${kind}`, itemId: item.id, kind,
    prompt: kind === 'cloze' ? cloze.prompt : kind === 'read' ? item.en : item.zh,
    answer: kind === 'cloze' ? cloze.answer : item.en,
    en: item.en, zh: item.zh || '', type: item.type, focus: item.focus || '', ipa: item.ipa || '',
  };
}

export function buildQuiz(items, mode = 'review', date = localDate()) {
  if (!DATE_PATTERN.test(date)) throw new TypeError('Quiz date must be YYYY-MM-DD');
  const valid = (items || []).filter(item => item?.id && item.en && item.zh);
  let pool;
  if (mode === 'scene') {
    pool = valid.filter(item => item.createdDate === date);
    return pool.map(item => question(item, mode, ['sentence', 'grammar'].includes(item.type) ? 'read' : 'recall'));
  }
  if (mode === 'review') {
    // An import from today cannot become yesterday's material through a future or malformed history entry.
    const earlier = valid.filter(item => item.createdDate < date && datesFor(item).some(value => value < date));
    const yesterday = previousDate(date);
    pool = earlier.filter(item => datesFor(item).includes(yesterday));
    if (!pool.length) {
      const mostRecent = earlier.flatMap(datesFor).filter(value => value < date).sort().at(-1);
      pool = mostRecent ? earlier.filter(item => datesFor(item).includes(mostRecent)) : [];
    }
    pool = ordered([...new Map([...pool, ...earlier.filter(unresolvedError)].map(item => [item.id, item])).values()]);
    const vocabulary = pool.filter(item => ['word', 'phrase'].includes(item.type)).slice(0, 6).map(item => question(item, mode, 'recall'));
    const clozes = pool.filter(item => ['sentence', 'grammar'].includes(item.type)).map(item => question(item, mode, 'cloze')).filter(Boolean).slice(0, 2);
    return [...vocabulary, ...clozes];
  }
  if (mode === 'recap') {
    pool = ordered(valid.filter(item => item.lastPracticed === date || item.learnedDate === date || (item.history || []).some(attempt => attempt.date === date)));
    return pool.map(item => question(item, mode, ['sentence', 'grammar'].includes(item.type) ? 'cloze' : 'recall')).filter(Boolean).slice(0, 5);
  }
  throw new TypeError(`Unknown quiz mode: ${mode}`);
}

export function recordAttempt(state, itemId, { date = localDate(), mode = 'scene', answer = '', correct, hinted = false } = {}) {
  const item = state.items.find(candidate => candidate.id === itemId);
  if (!item) return null;
  if (typeof correct !== 'boolean') throw new TypeError('An attempt needs an explicit correct boolean');
  if (!DATE_PATTERN.test(date)) throw new TypeError('Attempt date must be YYYY-MM-DD');
  const mastered = correct && !hinted;
  const attempt = { date, mode, answer: String(answer), correct, hinted: Boolean(hinted), mastered, at: new Date().toISOString() };
  if (!Array.isArray(item.history)) item.history = [];
  item.history.push(attempt);
  item.lastPracticed = date;
  item.mastered = mastered;
  item.wrongCount = Math.max(0, Number(item.wrongCount) || 0) + (correct ? 0 : 1);
  return item;
}

export function timerRemaining(timer, now = Date.now()) {
  if (!timer) return 0;
  const remaining = timer.running && Number.isFinite(timer.endsAt) ? timer.endsAt - now : Number(timer.remainingMs) || 0;
  return Math.max(0, remaining);
}

/** Clearly marked examples; never injected into historical review automatically. */
export function sampleItems(date = localDate()) {
  const rows = [
    ['无咖啡因咖啡', 'decaf', '/ˈdiːkæf/', '', 'word'],
    ['续杯；补充装', 'refill', '/ˈriːfɪl/', '', 'word'],
    ['用完；售罄', 'run out of', '/rʌn aʊt əv/', '', 'phrase'],
    ['由店家免费招待', 'on the house', '/ɑn ðə haʊs/', '', 'phrase'],
    ['租房押金', 'security deposit', '/sɪˈkjʊrəti dɪˈpɑzɪt/', '', 'phrase'],
    ['正常磨损', 'wear and tear', '/wer ən ter/', '', 'phrase'],
    ['可以把这个单独放在旁边吗？', 'Would it be possible to get this on the side?', '', 'on the side', 'sentence'],
    ['你能说明一下房租包含哪些水电等公用事业费用吗？', 'Could you clarify which utilities are included in the rent?', '', 'are included', 'sentence'],
  ];
  return rows.map(([zh, en, ipa, focus, type]) => ({ ...getEntry(zh, en, ipa, focus, type), createdDate: date, sample: true, sourceId: 'sample-everyday-english' }));
}
