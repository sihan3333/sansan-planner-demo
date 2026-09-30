/** Yesterday-only, source-grounded practice. All selection runs locally. */
export const REVIEW_VERSION = 1;

const MODES = ['review', 'scene', 'chat', 'recap'];
const LIMITS = { word: 50, phrase: 5, sentence: 5 };
const STOP = new Set(`a an the i you he she it we they this that these those am is are was were be been being to of for in on at by as and or but if then than with from have has had do does did can could would should will may might must not my your his her its our their me him us them what which who how where when why please very also just so too yes no all any some each other more most much many such only own into about over under out up down off again here there now been i've i'm i'll i'd you're you've you'll you'd he's she's it's we're we've we'll we'd they're they've they'll they'd don't doesn't didn't isn't aren't wasn't weren't won't can't cannot couldn't wouldn't shouldn't haven't hasn't hadn't let's`.split(/\s+/));
// Only expressions actually present in yesterday's text become candidates.
const COLLOCATIONS = [
  'on the other hand', 'as far as I know', 'as a result', 'at the same time', 'in the long run', 'in the short term', 'from my perspective', 'in my opinion', 'to some extent', 'in terms of', 'in addition to', 'in order to', 'in spite of', 'on behalf of', 'with regard to', 'when it comes to', 'for the time being', 'by the way', 'as soon as possible', 'so far so good', 'first of all', 'at least', 'at first', 'in advance', 'on time', 'in time', 'in fact', 'for instance', 'for example', 'after all', 'as well as', 'rather than', 'even though', 'due to', 'according to',
  'look forward to', 'looking forward to', 'look into', 'looking into', 'come up with', 'came up with', 'keep in mind', 'bear in mind', 'take into account', 'take advantage of', 'make a difference', 'make sense', 'makes sense', 'make sure', 'pay attention to', 'get along with', 'get used to', 'used to', 'deal with', 'dealing with', 'figure out', 'figured out', 'find out', 'found out', 'run out of', 'ran out of', 'put off', 'put together', 'bring up', 'brought up', 'carry out', 'work out', 'worked out', 'set up', 'turn out', 'turned out', 'point out', 'pointed out', 'follow up', 'follow through', 'catch up', 'keep up with', 'give up', 'gave up', 'take care of', 'take part in', 'take place', 'depend on', 'depends on', 'focus on', 'focused on', 'rely on', 'based on', 'responsible for', 'familiar with', 'aware of', 'interested in', 'concerned about',
  'on the fence', 'on the house', 'on the side', 'wear and tear', 'security deposit', 'public transport', 'public transportation', 'customer service', 'critical thinking', 'decision making', 'problem solving', 'learning curve', 'long term', 'short term', 'pros and cons', 'trial and error', 'a sense of', 'a wide range of', 'a great deal of', 'a couple of', 'a lack of', 'a variety of', 'step by step', 'face to face', 'once in a while', 'more or less',
].sort((a, b) => b.length - a.length);
const WORD_BANK = ['consideration', 'consequence', 'perspective', 'reliable', 'relevant', 'reasonable', 'practical', 'precise', 'priority', 'context', 'evidence', 'approach', 'purpose', 'pattern', 'challenge', 'benefit', 'concern', 'solution', 'progress', 'process', 'resource', 'result', 'request', 'response', 'option', 'opportunity', 'decision', 'discussion', 'development', 'experience', 'expectation', 'explanation', 'improvement', 'influence', 'requirement', 'responsibility', 'recommendation', 'clarify', 'confirm', 'compare', 'consider', 'develop', 'describe', 'evaluate', 'explain', 'identify', 'improve', 'include', 'maintain', 'manage', 'notice', 'organize', 'prepare', 'provide', 'recognize', 'recommend', 'reduce', 'reflect', 'require', 'resolve', 'respond', 'support', 'understand', 'available', 'appropriate', 'consistent', 'effective', 'efficient', 'flexible', 'important', 'independent', 'necessary', 'specific', 'significant', 'similar', 'successful', 'temporary', 'uncertain', 'carefully', 'clearly', 'eventually', 'frequently', 'gradually', 'probably', 'recently', 'usually'];
const PHRASE_BANK = ['in the long run', 'on the other hand', 'at the same time', 'as a result', 'in advance', 'in my opinion', 'keep in mind', 'take into account', 'look forward to', 'come up with', 'pay attention to', 'on the side', 'in terms of', 'a wide range of', 'for the time being', 'make a difference', 'take care of', 'deal with', 'figure out', 'work out', 'follow up', 'based on', 'due to', 'according to'];

const text = value => typeof value === 'string' ? value.trim() : '';
const normalize = value => text(value).normalize('NFKC').toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = value => [...text(value).matchAll(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g)];
const keyFor = value => normalize(value).replace(/-/g, ' ');
const array = value => Array.isArray(value) ? value : [];
function hash(value) {
  let valueHash = 2166136261;
  for (let index = 0; index < value.length; index++) { valueHash ^= value.charCodeAt(index); valueHash = Math.imul(valueHash, 16777619); }
  return (valueHash >>> 0).toString(36);
}
function previousDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new TypeError('Review date must be YYYY-MM-DD');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new TypeError('Review date must be a real calendar date');
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}
const boundary = value => new RegExp(`(?<![A-Za-z])${text(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`, 'ig');
function matching(value, target) { return text(value).match(boundary(target)) || []; }
function blank(value, target) { return text(value).replace(boundary(target), '_____'); }
function sourceIdentity(source) { return `${source.mode}:${source.sourceId}`; }
function uniqueSources(sources) { return [...new Map(sources.map(source => [sourceIdentity(source), source])).values()]; }
function englishSegments(value) {
  return text(value).split(/[\r\n]+|[\p{Script=Han}]+/u).flatMap(line =>
    (line.match(/[A-Za-z][A-Za-z0-9’'“”"(),:;.!?\s/\-]*/g) || []).flatMap(part => part.split(/(?<=[.!?])\s+(?=[A-Za-z“"'])|;\s*/))
  ).map(segment => segment.trim().replace(/^[\s\d.)-]+/, '').trim()).filter(segment => /[A-Za-z]/.test(segment));
}
function isSentence(value, explicit = false) {
  const count = tokens(value).length;
  return count >= (explicit ? 4 : 5) && count <= 70 && (explicit || /[.!?]$/.test(value) || /\b(?:am|is|are|was|were|have|has|had|will|would|should|could|can|must|need|needs|want|wants|think|feel|seem|seems)\b/i.test(value));
}
function significant(token) {
  const value = keyFor(token);
  return value.length >= 3 && value.length <= 30 && !STOP.has(value) && !/^(?:https?|www|com|org|html|json)$/.test(value);
}
function wordDifficulty(value) {
  const plain = keyFor(value).replace(/[^a-z]/g, '');
  const syllables = (plain.match(/[aeiouy]+/g) || []).length;
  return Math.min(3, Math.max(0, plain.length - 5) / 3) + Math.min(1.5, Math.max(0, syllables - 2) / 2);
}
function metadata(item, sourceDate) {
  const history = array(item?.history).filter(attempt => typeof attempt?.date === 'string' && attempt.date <= sourceDate);
  return { starred: !!item?.starred, wrongCount: history.filter(attempt => attempt.correct === false).length };
}

/** Collect saved encounters, never infer learning from import dates or unsent drafts. */
function collectSources(state, sourceDate) {
  const items = array(state?.items), itemMap = new Map(items.filter(item => item?.id).map(item => [item.id, item]));
  const session = state?.sessions?.[sourceDate] || {}, records = new Map(), coveredItems = new Set();
  let hasStudyRecords = false;
  function add(en, { zh = '', type = '', focus = '', itemId = '', mode = 'notes', sourceId, starred = false, wrongCount = 0, targetErrors = {}, note = false } = {}) {
    en = text(en); if (en) hasStudyRecords = true; if (!/[A-Za-z]/.test(en)) return;
    const key = keyFor(en); if (!key) return;
    const source = { mode, date: sourceDate, sourceId: sourceId || `${mode}:${hash(key)}`, ...(note ? { note: true } : {}) };
    let record = records.get(key);
    if (!record) { record = { en, zh: '', types: new Set(), focuses: new Set(), itemIds: new Set(), sources: [], starred: false, wrongCount: 0, targetErrors: new Map() }; records.set(key, record); }
    if (text(zh) && !record.zh) record.zh = text(zh);
    if (type) record.types.add(type);
    if (focus && matching(en, focus).length) record.focuses.add(text(focus));
    if (itemId) record.itemIds.add(itemId);
    record.sources = uniqueSources([...record.sources, source]);
    record.starred ||= starred;
    record.wrongCount = Math.max(record.wrongCount, wrongCount);
    for (const [target, count] of Object.entries(targetErrors)) record.targetErrors.set(target, Math.max(record.targetErrors.get(target) || 0, count));
  }
  function addQuestion(question, phaseIndex, fallbackId = '', failedAttempts = 0) {
    if (!question || typeof question !== 'object') return;
    const id = text(question.itemId), item = itemMap.get(text(question.sourceItemId) || id);
    // Use the saved question text even when the editable expression library has changed.
    const en = text(question.en) || text(question.answer) || text(item?.en);
    if (!en) return;
    const sameItemText = item && keyFor(item.en) === keyFor(en);
    const focus = text(question.focus) || (/cloze/.test(question.kind || '') ? text(question.answer) : '') || (sameItemText ? text(item?.focus) : '');
    const actualId = text(question.sourceItemId) || (id && !id.startsWith('review-source:') ? id : '');
    if (actualId) coveredItems.add(actualId);
    const targetError = /cloze/.test(question.kind || '') ? keyFor(question.answer) : '';
    const prior = metadata(item, sourceDate);
    add(en, { zh: text(question.zh) || (sameItemText ? text(item.zh) : ''), type: text(question.type) || (sameItemText ? text(item.type) : ''), focus, itemId: actualId, mode: MODES[phaseIndex], sourceId: `phase:${phaseIndex}:question:${text(question.id) || fallbackId || hash(en)}:${hash(en)}`, ...prior, wrongCount: Math.max(prior.wrongCount, targetError ? 0 : failedAttempts), targetErrors: targetError ? { [targetError]: failedAttempts } : {} });
  }
  for (const phaseIndex of [0, 1, 3]) {
    const phase = session.phases?.[phaseIndex]; if (!phase || typeof phase !== 'object') continue;
    const quizzes = array(phase.quiz), attempts = array(phase.attempts), snapshotIds = new Set();
    if (attempts.some(attempt => attempt && typeof attempt === 'object')) hasStudyRecords = true;
    const failures = questionId => attempts.filter(attempt => attempt?.questionId === questionId && attempt.correct === false).length;
    const encountered = new Set([...array(phase.completedIds), ...array(phase.encounteredIds), ...attempts.map(attempt => attempt?.questionId)]);
    for (const [index, snapshot] of array(phase.encounteredSnapshots).entries()) {
      if (snapshot && typeof snapshot === 'object') { addQuestion(snapshot, phaseIndex, String(index), failures(snapshot.id)); if (snapshot.id) snapshotIds.add(snapshot.id); }
    }
    for (const [index, attempt] of attempts.entries()) {
      const snapshot = attempt?.questionSnapshot || attempt?.question || attempt?.snapshot;
      if (snapshot && typeof snapshot === 'object') { addQuestion(snapshot, phaseIndex, attempt.questionId || String(index), failures(attempt.questionId || snapshot.id)); snapshotIds.add(attempt.questionId || snapshot.id); }
    }
    for (const question of quizzes) {
      if (!question || snapshotIds.has(question.id)) continue;
      const answer = phase.answers?.[question.id];
      if (encountered.has(question.id) || answer?.checked || answer?.revealed || answer?.recognized || answer?.recorded) addQuestion(question, phaseIndex, '', failures(question.id));
    }
    if (text(phase.notes)) add(phase.notes, { mode: MODES[phaseIndex], sourceId: `phase:${phaseIndex}:notes`, note: true });
  }
  if (text(session.phases?.[2]?.notes)) add(session.phases[2].notes, { mode: 'chat', sourceId: 'phase:2:notes', note: true });
  // Legacy records may contain item histories without a session question snapshot.
  for (const item of items) {
    if (!item?.id || coveredItems.has(item.id) || (text(item.createdDate) && item.createdDate > sourceDate)) continue;
    const history = array(item.history).filter(attempt => attempt?.date === sourceDate);
    if (!history.length && item.learnedDate !== sourceDate && item.lastPracticed !== sourceDate) continue;
    hasStudyRecords = true;
    const modes = [...new Set(history.map(attempt => MODES.includes(attempt.mode) ? attempt.mode : 'scene'))];
    if (!modes.length) modes.push('scene');
    for (const mode of modes) add(item.en, { zh: item.zh, type: item.type, focus: item.focus, itemId: item.id, mode, sourceId: `item:${item.id}`, ...metadata(item, sourceDate) });
  }
  for (const [index, message] of array(session.chat?.messages).entries()) {
    if (message?.role === 'user' || message?.role === 'assistant') add(message.content, { mode: 'chat', sourceId: `chat:${text(message.id) || index}` });
  }
  if (text(session.notes)) add(session.notes, { mode: 'notes', sourceId: 'session:notes', note: true });
  if (text(session.chatNotes)) add(session.chatNotes, { mode: 'chat', sourceId: 'session:chatNotes', note: true });
  for (const field of ['learned', 'hard', 'tomorrow']) if (text(session.summary?.[field])) add(session.summary[field], { mode: 'recap', sourceId: `summary:${field}`, note: true });
  return { records: [...records.values()], hasStudyRecords };
}

function makeCandidates(records) {
  const candidates = { word: new Map(), phrase: new Map(), sentence: new Map() };
  function add(type, answer, en, record, occurrenceCount = 1) {
    answer = text(answer); en = text(en);
    if (!answer || !matching(en, answer).length) return;
    const key = type === 'sentence' ? keyFor(en) : keyFor(answer);
    let entry = candidates[type].get(key);
    if (!entry) { entry = { key, type, answer, contexts: [], records: new Map(), sources: [], itemIds: new Set(), starred: false, wrongCount: 0 }; candidates[type].set(key, entry); }
    entry.contexts.push({ en, answer, zh: record.zh, sentence: isSentence(en, record.types.has('sentence') || record.types.has('grammar')), explicit: record.types.has(type) && keyFor(record.en) === keyFor(en) });
    const significantSources = record.sources.filter(source => !source.note);
    const appearances = Math.max(1, new Set(significantSources.map(sourceIdentity)).size);
    const recordKey = keyFor(record.en);
    entry.records.set(recordKey, Math.max(entry.records.get(recordKey) || 0, occurrenceCount * appearances));
    entry.sources = uniqueSources([...entry.sources, ...record.sources]);
    for (const id of record.itemIds) entry.itemIds.add(id);
    entry.starred ||= record.starred;
    entry.wrongCount = Math.max(entry.wrongCount, record.wrongCount, record.targetErrors.get(keyFor(answer)) || 0);
  }
  for (const record of records) {
    const segments = englishSegments(record.en);
    const wordCounts = new Map();
    for (const match of tokens(record.en)) if (significant(match[0])) wordCounts.set(keyFor(match[0]), (wordCounts.get(keyFor(match[0])) || 0) + 1);
    for (const segment of segments) {
      const seenWords = new Set();
      for (const match of tokens(segment)) {
        const token = match[0], key = keyFor(token);
        if (!significant(token) || seenWords.has(key)) continue;
        seenWords.add(key); add('word', token, segment, record, wordCounts.get(key) || 1);
      }
      const expressions = new Set([...record.focuses, ...COLLOCATIONS.filter(phrase => matching(segment, phrase).length)]);
      if (record.types.has('phrase') && tokens(record.en).length >= 2 && tokens(record.en).length <= 9) expressions.add(record.en);
      for (const expression of expressions) {
        if (tokens(expression).length < 2 || tokens(expression).length > 10) continue;
        const found = matching(segment, expression);
        if (found.length) add('phrase', found[0], segment, record, matching(record.en, expression).length);
      }
      if (!isSentence(segment, record.types.has('sentence') || record.types.has('grammar'))) continue;
      const focus = [...record.focuses].find(value => matching(segment, value).length && tokens(value).length < tokens(segment).length);
      const collocation = [...expressions].find(value => matching(segment, value).length && tokens(value).length >= 2 && tokens(value).length < tokens(segment).length);
      const contentWord = tokens(segment).filter(match => significant(match[0])).sort((a, b) => wordDifficulty(b[0]) - wordDifficulty(a[0]) || b[0].length - a[0].length || a.index - b.index)[0]?.[0];
      const answer = focus || collocation || contentWord;
      if (answer) add('sentence', matching(segment, answer)[0], segment, record);
    }
  }
  return Object.fromEntries(Object.entries(candidates).map(([type, entries]) => [type, [...entries.values()].map(entry => {
    entry.contexts.sort((a, b) => Number(b.sentence) - Number(a.sentence) || Number(!!b.zh) - Number(!!a.zh) || Number(b.explicit) - Number(a.explicit) || a.en.length - b.en.length || a.en.localeCompare(b.en, 'en'));
    const context = entry.contexts[0];
    const frequency = [...entry.records.values()].reduce((sum, value) => sum + value, 0);
    const difficulty = entry.type === 'word' ? wordDifficulty(context.answer) : Math.min(4, tokens(context.answer).length / 2 + wordDifficulty(context.answer) / 3);
    const weight = 1 + Math.log2(1 + frequency) * 2 + difficulty + (entry.starred ? 2 : 0) + Math.min(4, entry.wrongCount);
    const reasons = [frequency > 1 ? `昨日原文出现 ${frequency} 次` : '来自昨日学习记录'];
    if (difficulty >= 1.5) reasons.push(entry.type === 'word' ? '词形较长，适合加强记忆' : '适合结合上下文回想');
    if (entry.starred) reasons.push('你收藏过的表达');
    if (entry.wrongCount) reasons.push('相关表达有答错记录');
    return { ...entry, answer: context.answer, en: context.en, zh: blank(context.zh, context.answer), frequency, weight, reasons };
  }).filter(entry => /[A-Za-z]/.test(blank(entry.en, entry.answer)) || /\p{L}/u.test(entry.zh))]));
}

function randomUnit(random) {
  const value = Number(random());
  return Number.isFinite(value) ? Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, value)) : 0.5;
}
function sampleWeighted(pool, count, random) {
  return pool.map(candidate => ({ candidate, rank: -Math.log(randomUnit(random)) / candidate.weight })).sort((a, b) => a.rank - b.rank || a.candidate.key.localeCompare(b.candidate.key, 'en')).slice(0, count).map(entry => entry.candidate);
}
function choices(candidate, pools, random) {
  const answer = candidate.answer, count = tokens(answer).length;
  const bank = count > 1 ? PHRASE_BANK : WORD_BANK;
  const all = [...pools[candidate.type].map(entry => entry.answer), ...(count > 1 ? pools.phrase : pools.word).map(entry => entry.answer), ...bank];
  const unique = [...new Map(all.filter(value => keyFor(value) !== keyFor(answer) && (tokens(value).length > 1) === (count > 1)).map(value => [keyFor(value), value])).values()];
  const suffix = value => keyFor(value).match(/(?:tion|ment|ness|ity|ing|ed|ly|able|ive|ous)$/)?.[0] || '';
  unique.sort((a, b) => Number(suffix(b) === suffix(answer)) - Number(suffix(a) === suffix(answer)) || Math.abs(tokens(a).length - count) - Math.abs(tokens(b).length - count) || Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length) || a.localeCompare(b, 'en'));
  const matchCase = value => /^[A-Z]/.test(answer) ? value[0].toUpperCase() + value.slice(1) : value[0].toLowerCase() + value.slice(1);
  const options = [answer, ...unique.slice(0, 3).map(matchCase)];
  for (let index = options.length - 1; index > 0; index--) { const pick = Math.floor(randomUnit(random) * (index + 1)); [options[index], options[pick]] = [options[pick], options[index]]; }
  return options;
}

export function buildYesterdayReview(state, date, { random = Math.random } = {}) {
  if (typeof random !== 'function') throw new TypeError('random must be a function');
  const sourceDate = previousDate(date), { records, hasStudyRecords } = collectSources(state, sourceDate), pools = makeCandidates(records);
  const counts = { word: 0, phrase: 0, sentence: 0 }, available = Object.fromEntries(Object.entries(pools).map(([type, pool]) => [type, pool.length]));
  const sourceCounts = { review: 0, scene: 0, chat: 0, recap: 0, notes: 0 };
  for (const record of records) for (const mode of new Set(record.sources.map(source => source.mode))) sourceCounts[mode]++;
  const quiz = [];
  for (const type of ['word', 'phrase', 'sentence']) {
    for (const candidate of sampleWeighted(pools[type], LIMITS[type], random)) {
      const id = `review:${sourceDate}:${type}:${hash(`${candidate.key}|${keyFor(candidate.answer)}`)}`;
      const sourceItemId = [...candidate.itemIds].sort()[0];
      const exactItemId = [...candidate.itemIds].sort().find(itemId => {
        const item = array(state?.items).find(value => value?.id === itemId);
        return item && keyFor(item.en) === keyFor(type === 'sentence' ? candidate.en : candidate.answer) && (item.type === type || type === 'sentence' && item.type === 'grammar');
      });
      const options = choices(candidate, pools, random);
      if (options.length < 2) continue;
      quiz.push({ id, itemId: exactItemId || `review-source:${sourceDate}:${type}:${hash(candidate.key)}`, ...(sourceItemId ? { sourceItemId } : {}), kind: 'choice-cloze', type, prompt: blank(candidate.en, candidate.answer), answer: candidate.answer, en: candidate.en, zh: candidate.zh, options, sources: candidate.sources, frequency: candidate.frequency, reasons: candidate.reasons });
      counts[type]++;
    }
  }
  return { version: REVIEW_VERSION, quiz, sourceDate, counts, available, sourceCounts, targets: { ...LIMITS }, selectionMethod: 'local-weighted-random', sourceRecordCount: records.length, hasStudyRecords };
}
