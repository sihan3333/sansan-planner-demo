// 三三作息簿 App 版 Demo
// 示例数据、模拟时间，带引导情景；页面刷新后回到示例数据。
// 理解一句话和排程复用 engine.html 里的同一套规则（隐藏 iframe 加载，只计算不写入）。
(function(){
  'use strict';
  var $ = function(s){ return document.querySelector(s); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  var toMin = function(t){ var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); };
  var hhmm = function(m){ m = Math.max(0, Math.min(1440, Math.round(m))); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  var clone = function(o){ return JSON.parse(JSON.stringify(o)); };
  var uid = function(){ return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };
  var CATS = [['learn', '学习'], ['work', '工作'], ['exercise', '运动'], ['life', '生活'], ['care', '护理'], ['commute', '通勤'], ['wake', '苏醒'], ['sleep', '睡眠']];
  var CAT = {sleep:'--sleep', wake:'--wake', life:'--life', exercise:'--exercise', learn:'--learn', work:'--work', commute:'--commute', care:'--care'};
  var color = function(a){ return 'var(' + (CAT[a.cat] || '--learn') + ')'; };
  var WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  var AI_ENDPOINT = 'https://sansan-ai.sihanzheng68.workers.dev';
  var PUSH_LIMIT = 8, EVENING = 21 * 60 + 45;
  // 示例的一天：[名称, 开始, 结束, 分类, 关联学习项目, 完成一次推进多少]
  var TEMPLATE = [
    ['睡觉', '00:00', '07:00', 'sleep'], ['起床、洗漱、早餐', '07:00', '08:00', 'life'], ['上午学习：编程课', '09:00', '11:30', 'learn', 'demo-coding', 1],
    ['午饭、午休', '12:00', '13:30', 'life'], ['下午工作', '13:30', '17:30', 'work'], ['晚饭', '18:00', '19:00', 'life'],
    ['英语听力', '20:00', '20:45', 'learn', 'demo-words', 50], ['散步', '20:45', '21:30', 'exercise'], ['睡前阅读', '22:00', '22:45', 'learn', 'demo-book', 20], ['睡觉', '23:00', '24:00', 'sleep']
  ];
  var SAMPLE_INBOX = [
    {id:'i1', title:'交实验报告', due:'周五截止', minutes:120, cat:'learn'},
    {id:'i2', title:'给导师回邮件', due:'今天', minutes:20, cat:'work'},
    {id:'i3', title:'买洗衣液', due:'不急', minutes:15, cat:'life'}
  ];
  var CHEERS = ['今天真棒！', '了不起，今天满分！', '学习力爆棚的一天！', '坚持就是胜利！', '今天的你闪闪发光！', '圆满的一天，为自己鼓掌！', '一步一步，你真的在变好。'];

  var E = null, S = null, toastTimer;

  // ---------- 匿名使用数据：发到线上数据后端（backend/worker），不记录身份信息；「我的 → 提醒与隐私」可以关掉 ----------
  var EVENTS_ENDPOINT = 'https://sansan-data.sihanzheng68.workers.dev/api/events';
  var STATS_OFF = 'zuoxibu_stats_off';
  var ANON_ID = (function(){
    var t = (location.search.match(/[?&]tester=([\w-]{1,20})/) || [])[1];
    if(t) return 'tester-' + t;
    try{
      var v = localStorage.getItem('zuoxibu_anon_id');
      if(!v){ v = 'u-' + Math.random().toString(36).slice(2, 10); localStorage.setItem('zuoxibu_anon_id', v); }
      return v;
    }catch(e){ return 'u-anon'; }
  })();
  var statsOn = function(){ try{ return localStorage.getItem(STATS_OFF) !== '1'; }catch(e){ return true; } };
  var eventQueue = [], eventTimer = null, snapTimer = null;
  function track(type, payload){
    if(!S || !S.perm.stats) return;
    eventQueue.push({type:type, ts:new Date().toISOString(), data:payload || {}});
    clearTimeout(eventTimer); eventTimer = setTimeout(flushEvents, 800);
  }
  function flushEvents(){
    if(!eventQueue.length) return;
    var batch = eventQueue.splice(0, 50);
    try{ fetch(EVENTS_ENDPOINT, {method:'POST', headers:{'Content-Type':'text/plain'}, body:JSON.stringify({anon_id:ANON_ID, events:batch}), keepalive:true}).catch(function(){}); }catch(e){}
  }
  window.addEventListener('pagehide', flushEvents);
  function snapshot(key){
    clearTimeout(snapTimer);
    snapTimer = setTimeout(function(){
      var list = S.days[key]; if(!list || key > S.today) return;
      var nowM = key === S.today ? now() : 1440;
      track('day_snapshot', {date:key, items:list.map(function(a){ return {name:a.name, cat:a.cat, start:a.start, end:a.end, done:isComplete(a), due:toMin(a.end) <= nowM}; })});
    }, 1500);
  }
  function noteManualEdit(){
    if(S.lastApplied && Date.now() - S.lastApplied.at < 5 * 60000){ track('edit_after_ai', {plan_id:S.lastApplied.id}); S.lastApplied = null; }
  }

  var tplFrom = function(rows){ return rows.map(function(r){ return {id:uid(), name:r[0], start:r[1], end:r[2], cat:r[3], kind:'range', group:'', projectId:r[4] || '', amount:r[5] || 0, done:false, subs:[]}; }); };
  var defaultRemind = function(tpl){ var o = {}; tpl.forEach(function(a){ if(a.cat === 'learn' || a.cat === 'work') o[a.name] = true; }); return o; };
  function baseState(){
    return {min:0, today:E.today(), sel:E.today(), template:[], days:{}, projects:[], inbox:[], remind:{}, actual:{}, perm:{notify:true, voice:true, stats:statsOn()},
            dismissed:{}, notifs:[], pushed:0, snooze:{}, view:'app', screen:'today', plan:null, undo:null, flash:{}, reply:null, evening:{}, busy:false, msg:'',
            edit:null, projEdit:null, progFor:null, split:null, dayText:'', voiceText:'', voiceMsg:'', listening:false, sc:'remind', step:0};
  }
  function freshDemo(sc){
    S = baseState();
    S.template = tplFrom(TEMPLATE); S.days = {}; S.projects = clone(E.sample().projects); S.inbox = clone(SAMPLE_INBOX);
    S.remind = defaultRemind(S.template); S.min = 19 * 60 + 50; S.sc = sc || 'remind';
    // 今天 19:50 之前已经发生的实际记录（示例）；午饭没记录
    var seed = {'起床、洗漱、早餐':['07:10','08:05'], '上午学习：编程课':['09:12','11:40'], '下午工作':['13:30','17:40'], '晚饭':['18:05','18:50']};
    dayList(S.today).forEach(function(a){ if(seed[a.name]) setRec(S.today, a, {status:'done', start:seed[a.name][0], end:seed[a.name][1]}, true); });
  }
  var now = function(){ return S.min; };

  // ---------- 一天的数据 ----------
  function cloneTpl(){ return S.template.map(function(a){ return {id:uid(), name:a.name, start:a.start, end:a.end, cat:a.cat, kind:a.kind || 'range', group:a.group || '', projectId:a.projectId || '', amount:a.amount || 0, done:false, subs:(a.subs || []).map(function(s){ return {id:uid(), name:s.name, start:s.start, end:s.end, done:false}; })}; }); }
  function dayList(key){ if(!S.days[key]){ S.days[key] = cloneTpl(); } return S.days[key]; }
  var sortDay = function(list){ list.sort(function(a, b){ return toMin(a.start) - toMin(b.start); }); return list; };
  var tracked = function(a){ return a.cat !== 'sleep' && a.kind !== 'point'; };
  var isComplete = function(a){ return !!a && (a.done || !!(a.subs && a.subs.length && a.subs.every(function(s){ return s.done; }))); };
  var findIn = function(list, id){ return list.filter(function(a){ return a.id === id; })[0]; };
  var recOf = function(key, a){ return S.actual[key] && S.actual[key][a.id]; };
  function setRec(key, a, rec, silentDone){
    S.actual[key] = S.actual[key] || {};
    if(rec) S.actual[key][a.id] = rec; else delete S.actual[key][a.id];
    if(rec && rec.status === 'done') a.done = true;
    if(rec && rec.status === 'skip') a.done = false;
    if(!rec) a.done = false;
  }
  function statusOf(a, key){
    key = key || S.sel;
    var r = recOf(key, a);
    if(isComplete(a)) return 'done';
    if(r && r.status === 'running') return 'running';
    if(r && r.status === 'skip') return 'skip';
    if(key < S.today) return 'none';
    if(key > S.today) return 'todo';
    return toMin(a.end) <= now() ? 'none' : (toMin(a.start) <= now() ? 'due' : 'todo');
  }
  function current(){ var t = now(); return dayList(S.today).filter(function(a){ return tracked(a) && toMin(a.start) <= t && t < toMin(a.end); })[0]; }
  function nextOne(){ var t = now(); return dayList(S.today).filter(function(a){ return tracked(a) && toMin(a.start) > t; })[0]; }
  function coverage(key){
    key = key || S.today;
    var t = key === S.today ? now() : 1440;
    var past = dayList(key).filter(function(a){ return tracked(a) && toMin(a.end) <= t; });
    return {past:past.length, rec:past.filter(function(a){ return isComplete(a) || recOf(key, a); }).length};
  }
  function finish(key, a){
    // 正在做的按现在结束；事后补勾的、或者还没到结束时间就勾掉的，按实际情况：已过结束时间就记计划时间
    var r = recOf(key, a), t = now(), running = r && r.status === 'running';
    var end = key === S.today && (running || t < toMin(a.end)) ? hhmm(Math.max(t, toMin((r && r.start) || a.start))) : a.end;
    setRec(key, a, {status:'done', start:(r && r.start) || a.start, end:end});
    celebrate(key);
  }
  function toggle(key, a){
    if(isComplete(a)){ a.subs.forEach(function(s){ s.done = false; }); setRec(key, a, null); }
    else finish(key, a);
    track('activity_toggled', {date:key, name:a.name, cat:a.cat, start:a.start, end:a.end, done:isComplete(a), at:hhmm(now())});
    snapshot(key);
  }
  function credited(pid){
    var sum = 0;
    Object.keys(S.days).forEach(function(k){ S.days[k].forEach(function(a){ if(a.projectId === pid && a.amount > 0 && isComplete(a)) sum += +a.amount; }); });
    return Math.round(sum * 100) / 100;
  }
  var progressOf = function(p){ return Math.round((+p.current + credited(p.id)) * 100) / 100; };
  var daysLeft = function(dl){ return Math.max(1, Math.round((new Date(dl + 'T00:00') - new Date(S.today + 'T00:00')) / 86400000) + 1); };
  var dateOf = function(key){ var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  var keyOf = function(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var shiftKey = function(key, n){ var d = dateOf(key); d.setDate(d.getDate() + n); return keyOf(d); };

  // ---------- 今日学习与庆祝 ----------
  function learnGroups(key){
    var groups = [], by = {};
    dayList(key).filter(function(a){ return a.cat === 'learn'; }).forEach(function(a){
      var k = a.group || a.name;
      if(!by[k]){ by[k] = {label:k, done:0, total:0}; groups.push(by[k]); }
      if(a.subs && a.subs.length){ by[k].total += a.subs.length; by[k].done += a.done ? a.subs.length : a.subs.filter(function(s){ return s.done; }).length; }
      else { by[k].total++; if(a.done) by[k].done++; }
    });
    return groups;
  }
  var allLearnDone = {};
  function celebrate(key){
    var g = learnGroups(key), all = g.length && g.every(function(x){ return x.done === x.total; });
    if(all && !allLearnDone[key]){ S.cheer = CHEERS[Math.floor(Math.random() * CHEERS.length)]; setTimeout(function(){ S.cheer = null; render(); }, 3200); }
    allLearnDone[key] = all;
  }

  // ---------- 时间与提醒 ----------
  function tick(to){
    while(S.min < to){ S.min++; checkReminders(); }
    render();
  }
  function checkReminders(){
    var t = now(), list = dayList(S.today);
    list.forEach(function(a){
      if(!tracked(a) || !S.remind[a.name] || recOf(S.today, a) || isComplete(a)) return;
      if((S.snooze[a.id] || toMin(a.start)) === t) pushStart(a);
    });
    if(t === EVENING) pushEvening();
  }
  function pushStart(a){
    if(S.pushed >= PUSH_LIMIT) return;
    S.pushed++;
    var prev = dayList(S.today).filter(function(b){ var r = recOf(S.today, b); return tracked(b) && S.remind[b.name] && toMin(b.start) < toMin(a.start) && !isComplete(b) && (!r || r.status === 'running'); }).pop();
    S.notifs = S.notifs.filter(function(n){ return n.type !== 'start'; });
    S.notifs.unshift({type:'start', id:a.id, prev:prev ? prev.id : null, at:now()});
    S.view = 'lock'; S.reply = null; emit('notify');
  }
  function pushEvening(){
    S.notifs.unshift({type:'evening', at:now()});
    S.view = 'lock'; emit('evening');
  }

  // ---------- 引擎 ----------
  var data = function(view){ return {day:dayList(S.sel), template:S.template, projects:S.projects, days:S.days, dayKey:S.sel, view:view || 'day'}; };
  function understand(text, title, then){
    text = (text || '').trim();
    if(!text || S.busy) return;
    S.busy = true; S.msg = '正在理解你的意思…'; render();
    var t0 = Date.now(), view = S.screen === 'template' ? 'template' : 'day';
    E.understand(text, data(view), now()).then(function(res){
      S.busy = false; S.msg = '';
      res = clone(res);
      track('ai_request', {text:text, source:res.source, view:view, n_ops:res.changes.length, reply:res.reply || '', latency_ms:Date.now() - t0});
      if(!res.changes.length){
        track('ai_no_ops', {text:text, source:res.source, reply:res.reply || ''});
        S.msg = res.warnings.join(' ') || res.reply || '没找到要改的内容，换个说法试试。'; render(); return;
      }
      if(then) return then(res);
      openPlan(text, title || '一句话改日程', res);
    });
  }
  function openPlan(text, title, res, back, extra){
    S.plan = {id:uid(), text:text, title:title, res:res, back:back || (S.screen === 'plan' ? 'today' : S.screen), extra:extra || {}};
    S.view = 'app'; S.screen = 'plan';
    track('plan_shown', {plan_id:S.plan.id, text:text, source:res.source, n_changes:res.changes.length});
    emit('plan'); render();
  }
  function applyRes(res, planId, text){
    var before = {days:clone(S.days), template:clone(S.template), projects:clone(S.projects)};
    var flash = {};
    res.changes.forEach(function(c){ if(c.id) flash[c.id] = true; });
    Object.keys(res.days).forEach(function(k){
      var old = S.days[k] || [], done = {};
      old.forEach(function(a){ done[a.id] = a; });
      // 规则返回的列表里保留原来的完成状态和细分
      S.days[k] = sortDay(res.days[k].map(function(a){ var o = done[a.id]; if(o){ a.done = o.done; a.subs = o.subs || a.subs || []; } a.subs = a.subs || []; return a; }));
    });
    if(res.template) S.template = sortDay(res.template);
    if(res.projects) S.projects = res.projects;
    S.flash = flash;
    S.lastApplied = {id:planId, at:Date.now()};
    track('plan_applied', {plan_id:planId, text:text, source:res.source, n_changes:res.changes.length});
    setTimeout(function(){ S.flash = {}; render(); }, 2500);
    toast('已更新 ' + res.changes.length + ' 项', function(){
      S.days = before.days; S.template = before.template; S.projects = before.projects;
      track('plan_undone', {plan_id:planId, text:text}); render();
    });
  }
  var CHG = {add:'新增', move:'调整', shrink:'压缩', remove:'删除', drop:'移出', done:'完成', undone:'取消完成', 'proj-add':'新项目', 'proj-progress':'记进度', 'proj-update':'改项目', 'proj-remove':'删项目'};

  // 拆任务：大模型拆成任务和时长，失败时按顿号拆、给默认时长
  function splitTasks(text){
    var prompt = '把下面这句话里要做的事拆成任务，估计每件事要多少分钟，并归类（learn 学习 / work 工作 / exercise 运动 / life 生活）。只输出 JSON：{"tasks":[{"name":"","minutes":0,"cat":""}]}\n原话：' + text;
    var local = function(){
      var body = text.replace(/^(明天|今天|后天)?(要|得|需要)?/, '');
      return body.split(/[、，,和还有]+/).map(function(s){ return s.trim(); }).filter(Boolean).map(function(n){
        var cat = /复习|学|背|课|读/.test(n) ? 'learn' : /健身|跑|运动|散步/.test(n) ? 'exercise' : /会|报告|邮件|工作/.test(n) ? 'work' : 'life';
        return {name:n, minutes: cat === 'learn' ? 120 : cat === 'exercise' ? 60 : cat === 'work' ? 60 : 15, cat:cat};
      });
    };
    return fetch(AI_ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({prompt:prompt})})
      .then(function(r){ if(!r.ok) throw 0; return r.json(); })
      .then(function(j){
        var t = (j.result && j.result.tasks || []).filter(function(x){ return x && x.name && x.minutes > 0; });
        if(!t.length) throw 0;
        return {tasks:t.map(function(x){ return {name:String(x.name).slice(0, 20), minutes:Math.min(240, Math.round(x.minutes / 5) * 5), cat:CAT[x.cat] ? x.cat : 'life'}; }), src:'DeepSeek'};
      }).catch(function(){ return {tasks:local(), src:'local'}; });
  }

  // ---------- 渲染零件 ----------
  var IC = {
    cal:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    inbox:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/></svg>',
    book:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    user:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    mic:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><path d="M12 17v5"/></svg>',
    back:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 18l-6-6 6-6"/></svg>',
    fwd:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>',
    check:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>',
    bell:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    right:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>',
    plus:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
  };
  var STATUS_ICONS = '<span class="sicons"><svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>' +
    '<svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor"><path d="M8 2.2c2.3 0 4.4.9 6 2.4l1.3-1.4A10.5 10.5 0 0 0 8 .3 10.5 10.5 0 0 0 .7 3.2L2 4.6a8.6 8.6 0 0 1 6-2.4zm0 3.6c1.3 0 2.5.5 3.4 1.3l1.3-1.4A6.8 6.8 0 0 0 8 3.9a6.8 6.8 0 0 0-4.7 1.8l1.3 1.4C5.5 6.3 6.7 5.8 8 5.8zm0 3.5c-.6 0-1.1.2-1.5.6L8 11.5l1.5-1.6c-.4-.4-.9-.6-1.5-.6z"/></svg>' +
    '<span class="batt"><b>76</b></span></span>';
  var sbar = function(dark){ return '<div class="sbar' + (dark ? ' dark' : '') + '"><span>' + hhmm(now()) + '</span>' + STATUS_ICONS + '</div>'; };
  var nav = function(title, back, right){ return '<div class="nav"><div class="l">' + (back ? '<button data-go="' + back + '" class="row">' + IC.back + '返回</button>' : '') + '</div><b>' + esc(title) + '</b><div class="r">' + (right || '') + '</div></div>'; };
  var tabs = function(on){
    return '<div class="tabbar">' + [['today', IC.cal, '今天'], ['inbox', IC.inbox, '收件箱'], ['projects', IC.book, '学习'], ['me', IC.user, '我的']].map(function(t){
      return '<button data-go="' + t[0] + '" class="' + (t[0] === on ? 'on' : '') + '">' + t[1] + '<span>' + t[2] + '</span></button>';
    }).join('') + '</div>';
  };
  var chip = function(t, k){ return '<span class="chip ' + (k || '') + '">' + esc(t) + '</span>'; };
  function statusChip(a, key){
    var r = recOf(key, a), st = statusOf(a, key);
    if(st === 'done'){
      if(r && r.start && r.end){ var late = toMin(r.start) - toMin(a.start), over = toMin(r.end) - toMin(a.end); return chip(r.start + '–' + r.end, late >= 10 || over >= 15 ? 'warn' : 'green'); }
      return chip('已完成', 'green');
    }
    if(st === 'running') return chip('进行中 · ' + r.start + ' 开始', 'learn');
    if(st === 'skip') return chip('跳过', 'red');
    if(st === 'none') return chip('没记录');
    if(st === 'due') return chip('该开始了', 'warn');
    return chip(S.remind[a.name] ? '🔔 待开始' : '待开始');
  }
  function slotRow(a, key, overlap){
    var st = statusOf(a, key), r = recOf(key, a);
    var late = st === 'done' && r && r.start ? toMin(r.start) - toMin(a.start) : 0;
    var sub = late >= 10 ? '晚开始 ' + late + ' 分钟' : (a.projectId && a.amount ? '完成后进度 +' + a.amount : '');
    var subs = (a.subs || []).map(function(s){
      return '<div class="subrow"><button class="tickbox sm ' + (s.done || a.done ? 'on' : '') + '" data-subtick="' + a.id + '|' + s.id + '">' + IC.check + '</button><span class="grow">' + esc(s.name) + '</span><span class="xs">' + s.start + '–' + s.end + '</span></div>';
    }).join('');
    return '<div class="slot' + (S.flash[a.id] ? ' flash' : '') + (st === 'skip' ? ' dim' : '') + '"><button class="tickbox ' + (st === 'done' ? 'on' : '') + '" data-tick="' + a.id + '" title="打勾">' + IC.check + '</button>' +
      '<span class="t">' + a.start + '</span><span class="bar" style="background:' + color(a) + '"></span>' +
      '<div class="grow" data-edit="' + a.id + '"><b>' + esc(a.name) + (overlap ? ' <span class="ovl">⚠ 时间重叠</span>' : '') + '</b>' + (sub ? '<div class="xs">' + esc(sub) + '</div>' : '') + '</div>' + statusChip(a, key) + '</div>' + subs;
  }
  function timeline(key){
    var list = sortDay(dayList(key)), out = [], lastEnd = null;
    var items = list.filter(function(a){ return a.cat !== 'sleep'; });
    items.forEach(function(a, i){
      var s = toMin(a.start);
      if(lastEnd != null && s - lastEnd >= 60) out.push('<div class="slot free"><span class="tickbox ghost"></span><span class="t">' + hhmm(lastEnd) + '</span><span class="xs grow">空闲 ' + (Math.round((s - lastEnd) / 30) / 2) + ' 小时</span></div>');
      var overlap = items.some(function(b, j){ return j !== i && b.kind !== 'point' && a.kind !== 'point' && toMin(b.start) < toMin(a.end) && toMin(a.start) < toMin(b.end); });
      out.push(a.kind === 'point' ? '<div class="slot point"><span class="tickbox ghost"></span><span class="t">' + a.start + '</span><span class="dot" style="background:' + color(a) + '"></span><span class="grow" data-edit="' + a.id + '">' + esc(a.name) + '</span></div>' : slotRow(a, key, overlap));
      lastEnd = Math.max(lastEnd || 0, toMin(a.end));
    });
    return out.join('') || '<div class="sm" style="padding:16px 0">这一天还没有安排</div>';
  }
  function changeRow(c){
    var rng = function(p){ return hhmm(p[0]) + '–' + hhmm(p[1]); };
    var time = c.time != null ? esc(c.time) : c.type === 'add' ? rng(c.after) : c.after ? '<s>' + rng(c.before) + '</s> → ' + rng(c.after) : '<s>' + rng(c.before) + '</s>';
    var where = c.dateKey && c.dateKey !== S.sel ? ' · ' + E.dayLabel(c.dateKey) : c.scope === 'template' ? ' · 基础模板' : c.scope === 'project' ? ' · 学习项目' : '';
    return '<div class="pv"><span class="plan-tag tag-' + c.type + '">' + (CHG[c.type] || c.type) + '</span><div class="grow"><b>' + esc(c.name) + '</b><span class="xs">' + esc(where) + '</span><div class="sm">' + time + (c.note ? ' · ' + esc(c.note) : '') + '</div></div></div>';
  }

  // ---------- 发现了几件事 ----------
  function suggestions(){
    if(S.sel !== S.today) return [];
    var list = [];
    try{ list = E.suggestions(data()); }catch(e){ list = []; }
    return list.filter(function(s){ var d = S.dismissed[s.id]; return !d || Date.now() - d > 7 * 86400000; }).slice(0, 3);
  }
  function suggestHTML(){
    var items = suggestions(); if(!items.length) return '';
    return '<div class="card"><div class="row"><span class="h2 grow">发现了几件事</span></div>' + items.map(function(s){
      if(s.kind === 'behind'){
        var b = s.info, u = s.unit;
        return '<div class="sg warn"><div class="sm">「' + esc(s.name) + '」照每天 ' + s.dailyTarget + ' ' + esc(u) + '，到截止还会<b>差 ' + b.gap + ' ' + esc(u) + '</b>。</div><div class="row wrap">' +
          '<button class="btn primary sm" data-sg="daily|' + esc(s.id) + '|' + s.projectId + '|' + b.newDaily + '">每天提到 ' + b.newDaily + ' ' + esc(u) + '</button>' +
          '<button class="btn line sm" data-sg="deadline|' + esc(s.id) + '|' + s.projectId + '|' + b.newDeadline + '">推迟到 ' + esc(s.deadlineLabel) + '</button>' +
          '<button class="btn line sm" data-sg="ignore|' + esc(s.id) + '">忽略</button></div></div>';
      }
      return '<div class="sg"><div class="sm">' + s.text + '</div><div class="row wrap"><button class="btn primary sm" data-sg="tpl|' + esc(s.id) + '">' + esc(s.label) + '</button><button class="btn line sm" data-sg="ignore|' + esc(s.id) + '">忽略</button></div></div>';
    }).join('') + '</div>';
  }

  // ---------- 屏 ----------
  var SCREENS = {};
  SCREENS.today = function(){
    var key = S.sel, isToday = key === S.today, d = dateOf(key), cv = coverage(key);
    var head = '<div class="row" style="align-items:flex-end"><button class="iconbtn" data-day="-1">' + IC.back + '</button><div class="grow" style="text-align:center"><div class="date">' + (d.getMonth() + 1) + '月' + d.getDate() + '日</div><div class="sm">' + WEEK[d.getDay()] + (isToday ? ' · 今天' : ' · ' + esc(E.dayLabel(key))) + '</div></div><button class="iconbtn" data-day="1">' + IC.fwd + '</button></div>' +
      '<div class="row">' + (isToday ? chip('记录 ' + cv.rec + '/' + cv.past + ' 项', 'green') : '<button class="btn light sm" data-day="0">回到今天</button>') + '<span class="grow"></span><input type="date" class="datepick" value="' + key + '" data-jump></div>';
    var nowCard = '';
    if(isToday){
      var cur = current(), nx = nextOne(), r = cur && recOf(key, cur);
      nowCard = cur ? '<div class="now" id="nowCard"><span class="xs">现在 · ' + cur.start + '–' + cur.end + '</span><span class="h1">' + esc(cur.name) + '</span><div class="two">' +
        (isComplete(cur) ? '<span class="chip green">已完成' + (r && r.end ? ' ' + r.end : '') + '</span>' :
          r && r.status === 'running' ? '<button class="btn primary" data-act="finish" data-id="' + cur.id + '">' + IC.check + '完成</button>' :
          '<button class="btn primary" data-act="start" data-id="' + cur.id + '">开始</button>') +
        '<button class="btn light" data-go="interrupt">被打断了</button></div></div>'
        : '<div class="now"><span class="xs">现在没有安排</span><span class="h1">' + (nx ? '下一项 ' + nx.start + ' ' + esc(nx.name) : '今天的安排都结束了') + '</span></div>';
    }
    var groups = learnGroups(key), ld = groups.filter(function(g){ return g.done === g.total; }).length;
    var learn = groups.length ? '<div class="card"><div class="row"><span class="h2 grow">今日学习</span><span class="xs">' + ld + '/' + groups.length + ' 完成</span></div><div class="prog"><i style="width:' + Math.round(ld / groups.length * 100) + '%;background:var(--accent)"></i></div><div class="chips">' +
      groups.map(function(g){ var all = g.done === g.total; return '<span class="lchip ' + (all ? 'on' : '') + '">' + (all ? '✓' : g.done ? '◐' : '○') + ' ' + esc(g.label) + (!all && g.total > 1 ? ' (' + g.done + '/' + g.total + ')' : '') + '</span>'; }).join('') + '</div></div>' : '';
    return sbar() + '<div class="body">' + head + nowCard +
      '<div class="input"><span style="color:var(--accent)">✦</span><input id="aiText" placeholder="一句话改日程、记进度、加任务"><button class="mic" data-go="voice" title="语音随手记">' + IC.mic + '</button></div>' +
      '<div class="row wrap"><button class="btn light sm" data-go="planDay">排明天</button><button class="btn light sm" data-go="voice">随手记</button>' + (isToday ? '<button class="btn light sm" data-act="replan">⟳ 没做完的往后排</button>' : '') + '</div>' +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      suggestHTML() + learn +
      '<div class="card" style="padding:4px 14px">' + timeline(key) + '</div>' +
      '<div class="row wrap"><button class="btn line sm" data-act="add">' + IC.plus + '添加活动</button><button class="btn line sm" data-act="overwrite">用模板覆盖这天</button></div>' +
      '</div>' + tabs('today');
  };
  SCREENS.plan = function(){
    var p = S.plan, res = p.res;
    return sbar() + nav(p.title, p.back) + '<div class="body"><div class="said">' + esc(p.text) + '</div>' +
      '<div class="card"><div class="row"><span class="h2 grow">会这样改</span>' + chip('AI', 'green ai') + '</div>' + res.changes.map(changeRow).join('') + '</div>' +
      (res.warnings.length ? '<div class="card warnc sm">' + esc(res.warnings.join(' ')) + '</div>' : '') +
      '<div style="flex:1"></div><div class="two"><button class="btn line" data-act="cancelPlan">取消</button><button class="btn primary" data-act="apply">' + IC.check + '确认改</button></div></div>';
  };
  SCREENS.voice = function(){
    return sbar() + nav('随手记', 'today') + '<div class="body" style="align-items:center;text-align:center"><div style="height:40px"></div>' +
      '<div style="width:130px;height:130px;border-radius:50%;background:var(--accent-l);box-shadow:0 0 0 12px var(--accent-l2);display:grid;place-items:center;color:var(--accent-dark)">' + IC.mic.replace(/18/g, '54') + '</div>' +
      '<div class="h2" style="margin-top:18px">' + (S.listening ? '正在听…说完再按一下' : '说一句发生了什么') + '</div>' +
      (S.voiceText ? '<div class="said" style="margin-top:12px">' + esc(S.voiceText) + '</div>' : '') +
      (S.voiceMsg ? '<div class="card warnc sm" style="margin-top:12px;text-align:left">' + esc(S.voiceMsg) + '</div>' : '') +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      '<div style="flex:1"></div><button class="btn primary full" data-act="listen">' + IC.mic + (S.listening ? '说完了' : '按一下开始说') + '</button></div>';
  };
  SCREENS.interrupt = function(){
    return sbar() + nav('被打断了', 'today') + '<div class="body"><div class="h1">耽误了多久？</div><div class="sm">后面的安排会往后让</div>' +
      '<div class="two">' + [15, 30, 45, 60].map(function(m){ return '<button class="btn line" data-delay="' + m + '">' + (m === 60 ? '1 小时' : m + '分钟') + '</button>'; }).join('') + '</div>' +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') + '</div>';
  };
  SCREENS.planDay = function(){
    var t = S.split, DUR = [15, 30, 45, 60, 90, 120, 150, 180];
    return sbar() + nav('排明天', 'today') + '<div class="body">' +
      '<div class="input"><input id="dayText" placeholder="明天要做什么，说一句" value="' + esc(S.dayText || '') + '"><button class="btn primary sm" data-act="split">拆一下</button></div>' +
      (t ? '<div class="card"><div class="row"><span class="h2 grow">拆成 ' + t.tasks.length + ' 件事</span>' + chip(t.src === 'DeepSeek' ? 'AI' : '本地规则', 'green ai') + '</div>' + t.tasks.map(function(x, i){
          return '<div class="row"><span class="bar" style="height:22px;background:var(' + CAT[x.cat] + ')"></span><span class="grow">' + esc(x.name) + '</span><select data-dur="' + i + '">' + DUR.map(function(m){ return '<option ' + (m === x.minutes ? 'selected' : '') + ' value="' + m + '">' + m + ' 分钟</option>'; }).join('') + (DUR.indexOf(x.minutes) < 0 ? '<option selected value="' + x.minutes + '">' + x.minutes + ' 分钟</option>' : '') + '</select>' + chip('AI 估计') + '</div>';
        }).join('') + '</div><button class="btn primary full" data-act="placeDay">排进明天</button>' : '') +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') + '</div>';
  };
  SCREENS.inbox = function(){
    return sbar() + '<div class="body"><div class="row"><span class="date grow">收件箱</span>' + chip(S.inbox.length + ' 件') + '</div>' +
      '<div class="input"><span style="color:var(--accent)">✦</span><input id="inboxText" placeholder="想到什么就丢进来，比如：周五前交实验报告"><button class="btn primary sm" data-act="inboxAdd">放进来</button></div>' +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      S.inbox.map(function(x){
        return '<div class="card"><div class="row"><span class="bar" style="height:20px;background:var(' + (CAT[x.cat] || '--life') + ')"></span><b class="grow">' + esc(x.title) + '</b>' + chip(x.due || '不急', x.due === '今天' ? 'warn' : '') + '<button class="xbtn" data-inboxdel="' + x.id + '" title="删除">×</button></div>' +
          '<div class="row sm"><span>约 ' + x.minutes + ' 分钟</span><span class="grow"></span><button class="btn light sm" data-place="' + x.id + '">找个空档</button></div></div>';
      }).join('') + (S.inbox.length ? '' : '<div class="sm" style="text-align:center;padding:30px">收件箱空了</div>') + '</div>' + tabs('inbox');
  };
  SCREENS.projects = function(){
    var cats = [];
    S.projects.forEach(function(p){ var c = p.category || '其他'; if(cats.indexOf(c) < 0) cats.push(c); });
    return sbar() + nav('学习项目', null, '<button data-act="projAdd" class="iconbtn">' + IC.plus + '</button>') + '<div class="body">' + (S.projects.length ? '' : '<div class="sm" style="text-align:center;padding:30px">还没有学习项目，点右上角＋新建</div>') +
      cats.map(function(c){
        return '<div class="xs" style="margin-top:4px">' + esc(c) + '</div>' + S.projects.filter(function(p){ return (p.category || '其他') === c; }).map(function(p){
          var cur = progressOf(p), left = Math.max(0, p.total - cur), dl = p.deadline ? daysLeft(p.deadline) : null;
          var behind = dl && p.dailyTarget > 0 && p.dailyTarget * dl < left;
          return '<div class="card"><div class="row"><span class="bar" style="height:20px;background:var(--learn)"></span><b class="grow" data-projedit="' + p.id + '">' + esc(p.name) + '</b><b style="color:var(--accent-dark)">' + cur + '/' + p.total + ' ' + esc(p.unit || '个') + '</b></div>' +
            '<div class="prog"><i style="width:' + Math.min(100, Math.round(cur / p.total * 100)) + '%"></i></div><div class="sm">' + (p.dailyTarget ? '每天 ' + p.dailyTarget + ' ' + esc(p.unit || '个') : '没设每天目标') + (p.deadline ? ' · ' + E.shortDate(p.deadline) + '截止 · 还剩 ' + dl + ' 天' : '') + (left <= 0 ? ' · 已完成 🎉' : '') + '</div>' +
            (behind ? '<div>' + chip('照现在的速度会差 ' + Math.ceil(left - p.dailyTarget * dl) + ' ' + (p.unit || '个'), 'warn') + '</div>' : '') +
            (S.progFor === p.id ? '<div class="row"><input type="number" min="0" step="0.5" id="progN" class="field" placeholder="这次完成了多少"><button class="btn primary sm" data-act="progSave" data-id="' + p.id + '">记上</button></div>' : '<div class="row"><button class="btn light sm" data-prog="' + p.id + '">记进度</button><button class="btn line sm" data-projedit="' + p.id + '">编辑</button></div>') + '</div>';
        }).join('');
      }).join('') + '</div>' + tabs('projects');
  };
  SCREENS.projEdit = function(){
    var f = S.projEdit;
    var row = function(k, label, type, ph){ return '<label class="frow"><span>' + label + '</span><input class="field" data-pf="' + k + '" type="' + (type || 'text') + '" value="' + esc(f[k] == null ? '' : f[k]) + '" placeholder="' + (ph || '') + '"></label>'; };
    return sbar() + nav(f.id ? '编辑学习项目' : '新建学习项目', 'projects') + '<div class="body"><div class="card">' +
      row('name', '名称', 'text', '例如：机器学习课') + row('category', '所属大类', 'text', '例如：英语、学编程') + row('total', '总量', 'number') + row('unit', '单位', 'text', '集、页、个') +
      row('current', '已经完成', 'number') + row('dailyTarget', '每天目标', 'number', '填了截止日可以留空') + row('deadline', '截止日', 'date') + '</div>' +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      '<div style="flex:1"></div><div class="two">' + (f.id ? '<button class="btn line" data-act="projDel">删除</button>' : '<button class="btn line" data-go="projects">取消</button>') + '<button class="btn primary" data-act="projSave">保存</button></div></div>';
  };
  SCREENS.edit = function(){
    var f = S.edit.draft, isTpl = S.edit.scope === 'template';
    var title = (S.edit.id ? '编辑' : '添加') + (isTpl ? '模板里的活动' : '活动');
    var subs = (f.subs || []).map(function(s, i){
      return '<div class="row"><input class="field" data-sf="' + i + '|name" value="' + esc(s.name) + '" placeholder="细分名称"><input class="field t" type="time" data-sf="' + i + '|start" value="' + s.start + '"><input class="field t" type="time" data-sf="' + i + '|end" value="' + s.end + '"><button class="xbtn" data-subdel="' + i + '">×</button></div>';
    }).join('');
    return sbar() + nav(title, S.edit.back) + '<div class="body"><div class="card">' +
      '<label class="frow"><span>名称</span><input class="field" data-ef="name" value="' + esc(f.name) + '" placeholder="例如：复习、开会"></label>' +
      '<div class="frow"><span>类型</span><div class="seg"><button data-kind="range" class="' + (f.kind !== 'point' ? 'on g' : '') + '">时间段</button> <button data-kind="point" class="' + (f.kind === 'point' ? 'on g' : '') + '">时间点</button></div></div>' +
      '<div class="frow"><span>时间</span><input class="field t" type="time" data-ef="start" value="' + f.start + '">' + (f.kind === 'point' ? '' : '<span>到</span><input class="field t" type="time" data-ef="end" value="' + f.end + '">') + '</div>' +
      '<div class="frow"><span>分类</span><div class="chips">' + CATS.map(function(c){ return '<button class="catchip ' + (f.cat === c[0] ? 'on' : '') + '" data-cat="' + c[0] + '"><i style="background:var(' + CAT[c[0]] + ')"></i>' + c[1] + '</button>'; }).join('') + '</div></div>' +
      '<label class="frow"><span>所属大类</span><input class="field" data-ef="group" value="' + esc(f.group) + '" placeholder="可选，同大类合并统计"></label>' +
      '<div class="frow"><span>关联项目</span><select class="field" data-ef="projectId"><option value="">不关联</option>' + S.projects.map(function(p){ return '<option value="' + p.id + '" ' + (f.projectId === p.id ? 'selected' : '') + '>' + esc(p.name) + '</option>'; }).join('') + '</select>' +
        (f.projectId ? '<input class="field t" type="number" min="0" step="0.5" data-ef="amount" value="' + (f.amount || '') + '" placeholder="完成一次推进">' : '') + '</div>' +
      '<div class="frow"><span>提醒</span><button class="toggle ' + (S.remind[f.name] ? 'on' : '') + '" data-act="remindToggle"><i></i></button></div></div>' +
      (f.kind === 'point' ? '' : '<div class="card"><div class="row"><span class="h2 grow">细分安排</span><button class="btn light sm" data-act="subAdd">' + IC.plus + '加一项</button></div>' + (subs || '<div class="xs">大块活动可以再拆成几项，分别打勾</div>') + '</div>') +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      '<div style="flex:1"></div><div class="two">' + (S.edit.id ? '<button class="btn line" data-act="editDel">删除</button>' : '<button class="btn line" data-go="' + S.edit.back + '">取消</button>') + '<button class="btn primary" data-act="editSave">保存</button></div></div>';
  };
  SCREENS.me = function(){
    var item = function(go, t, s){ return '<button class="slot" data-go="' + go + '" style="width:100%;text-align:left"><div class="grow"><b>' + t + '</b><div class="xs">' + s + '</div></div>' + IC.right + '</button>'; };
    return sbar() + nav('我的') + '<div class="body">' +
      '<div class="card" style="padding:4px 14px">' + item('actual', '计划 vs 实际', '今天记录了什么、偏差在哪') + item('evening', '今天的核对', '把没记录的活动批量勾一下') + item('template', '基础模板', '新的一天按模板生成；设置提醒') + item('welcome', '提醒与隐私', '通知、语音、匿名统计') + item('data', '数据', '备份、恢复、示例数据') + '</div>' +
      '<div class="h2">复盘与优化</div><div class="card" style="padding:4px 14px">' + item('weekly', '每周报告', '最近 7 天的完成情况') + item('energy', '精力时段', '你的高效时段') + item('estimate', '时长校准与目标可行性', '按实际记录校准') + '</div>' +
      '<div class="h2">更多工具</div><div class="card" style="padding:4px 14px">' + item('shot', '截图导入', '课表、群通知读成日程') + item('review', '每晚 1 分钟复盘', '最多 3 个问题') + item('goal', '目标拆解', '长期目标拆成学习项目') + item('focus', '专注计时', '结束时自动记录') + '</div></div>' + tabs('me');
  };
  SCREENS.actual = function(){
    var key = S.today, cv = coverage(key), t = now(), past = dayList(key).filter(function(a){ return tracked(a) && toMin(a.start) <= t; });
    var done = past.filter(function(a){ return statusOf(a, key) === 'done'; });
    var dev = 0, worst = null;
    done.forEach(function(a){ var r = recOf(key, a); if(!r || !r.start) return; var d = Math.abs(toMin(r.start) - toMin(a.start)) + Math.max(0, toMin(r.end) - toMin(a.end)); dev += d; if(!worst || d > worst.d) worst = {a:a, d:d}; });
    return sbar() + nav('计划 vs 实际', 'me') + '<div class="body"><div class="card stat3"><div><b>' + cv.rec + '/' + cv.past + '</b><span class="xs">有记录</span></div><div><b>' + (cv.past ? Math.round(done.length / Math.max(cv.past, 1) * 100) : 0) + '%</b><span class="xs">按计划完成</span></div><div><b>+' + dev + '</b><span class="xs">分钟偏差</span></div></div>' +
      '<div class="card" style="padding:6px 14px"><div class="row xs"><span class="grow">活动</span><span style="width:84px">计划</span><span style="width:90px">实际</span></div>' + past.map(function(a){
        var r = recOf(key, a), st = statusOf(a, key);
        return '<div class="slot"><span class="bar" style="background:' + color(a) + '"></span><span class="grow">' + esc(a.name) + '</span><span class="sm" style="width:84px">' + a.start + '–' + a.end + '</span><span style="width:90px">' + (st === 'done' ? (r && r.start ? chip(r.start + '–' + r.end, toMin(r.start) - toMin(a.start) >= 10 ? 'warn' : 'green') : chip('已完成', 'green')) : st === 'running' ? chip('进行中', 'learn') : st === 'skip' ? chip('跳过', 'red') : chip('没记录')) + '</span></div>';
      }).join('') + '</div>' +
      (worst && worst.d ? '<div class="card soft"><b>偏差最大：' + esc(worst.a.name) + '，偏了 ' + worst.d + ' 分钟</b></div>' : '') + '</div>';
  };
  SCREENS.evening = function(){
    var key = S.today, t = now(), list = dayList(key).filter(function(a){ return tracked(a) && toMin(a.end) <= t && !isComplete(a) && !recOf(key, a); });
    return sbar() + nav('今天的核对', 'today') + '<div class="body"><div class="h1">还有 ' + list.length + ' 项没记录</div><div class="sm">勾一下就好</div>' +
      '<div class="card">' + list.map(function(a){
        var v = S.evening[a.id] || '';
        return '<div class="row"><span class="bar" style="height:26px;background:' + color(a) + '"></span><div class="grow"><b>' + esc(a.name) + '</b><div class="xs">' + a.start + '–' + a.end + '</div></div><span class="seg">' +
          '<button data-ev="' + a.id + '|done" class="' + (v === 'done' ? 'on g' : '') + '">做了</button> <button data-ev="' + a.id + '|skip" class="' + (v === 'skip' ? 'on r' : '') + '">没做</button></span></div>';
      }).join('') + (list.length ? '' : '<div class="sm">今天都记录好了</div>') + '</div><div style="flex:1"></div>' +
      '<button class="btn primary full" data-act="evening">' + IC.check + '一起确认</button></div>';
  };
  SCREENS.template = function(){
    var n = S.template.filter(function(a){ return S.remind[a.name] && tracked(a); }).length;
    return sbar() + nav('基础模板', 'me', '<button data-act="tplAdd" class="iconbtn">' + IC.plus + '</button>') + '<div class="body"><div class="card ' + (n > PUSH_LIMIT ? 'warnc' : 'soft') + ' row">' + IC.bell + '<b>每天提醒 ' + n + ' 条，上限 ' + PUSH_LIMIT + ' 条</b></div>' +
      '<div class="input"><span style="color:var(--accent)">✦</span><input id="aiText" placeholder="一句话改模板，比如：以后每天早上加20分钟冥想"></div>' +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      '<div class="card" style="padding:4px 14px">' + sortDay(S.template).filter(function(a){ return a.cat !== 'sleep'; }).map(function(a){
        return '<div class="slot"><span class="t">' + a.start + '</span><span class="bar" style="background:' + color(a) + '"></span><b class="grow" data-tpledit="' + a.id + '">' + esc(a.name) + '</b><button data-bell="' + esc(a.name) + '" style="color:' + (S.remind[a.name] ? 'var(--accent)' : 'var(--line)') + '">' + IC.bell + '</button></div>';
      }).join('') + '</div></div>';
  };
  SCREENS.welcome = function(){
    var t = function(k, title, sub){ return '<div class="card row"><div class="grow"><b>' + title + '</b><div class="sm">' + sub + '</div></div><button class="toggle ' + (S.perm[k] ? 'on' : '') + '" data-perm="' + k + '"><i></i></button></div>'; };
    return sbar() + nav('提醒与隐私', 'me') + '<div class="body"><div class="sm" style="font-size:14px">日程默认只存在你的手机里，不需要账号。</div>' +
      t('notify', '通知', '只提醒你标了铃铛的活动，每天最多 8 条，睡觉时不打扰') + t('voice', '语音识别', '在手机上转成文字，只把文字发给 AI') + t('stats', '匿名使用统计', '记录操作和你对 AI 说的话，用来改进 AI；不含身份信息，可以随时关掉') + '</div>';
  };
  SCREENS.data = function(){
    return sbar() + nav('数据', 'me') + '<div class="body"><div class="card"><b>备份</b><div class="sm">把模板、每天的日程、学习项目和收件箱存成一个文件。</div><button class="btn primary" data-act="export">导出备份文件</button></div>' +
      '<div class="card"><b>恢复</b><div class="sm">用之前导出的备份文件覆盖现在的数据。</div><label class="btn line">选择备份文件<input type="file" accept=".json,application/json" data-import hidden></label></div>' +
      '<div class="card"><b>示例数据</b><div class="sm">清空现在的数据，换回示例数据。</div><button class="btn line" data-act="resetSample">恢复示例数据</button></div></div>';
  };
  SCREENS.weekly = function(){
    var keys = []; for(var i = 7; i >= 1; i--) keys.push(shiftKey(S.today, -i));
    var tot = 0, done = 0, rec = 0, learnMin = 0;
    keys.forEach(function(k){ (S.days[k] || []).filter(tracked).forEach(function(a){ tot++; if(isComplete(a)){ done++; if(a.cat === 'learn') learnMin += toMin(a.end) - toMin(a.start); } if(isComplete(a) || recOf(k, a)) rec++; }); });
    var tpl = suggestions().filter(function(s){ return s.kind === 'template'; });
    return sbar() + nav('最近 7 天', 'me') + '<div class="body"><div class="card stat3"><div><b>' + (tot ? Math.round(done / tot * 100) : 0) + '%</b><span class="xs">按计划完成</span></div><div><b>' + (tot ? Math.round(rec / tot * 100) : 0) + '%</b><span class="xs">有记录</span></div><div><b>' + Math.round(learnMin / 6) / 10 + 'h</b><span class="xs">学习时长</span></div></div>' +
      '<div class="card"><span class="h2">模板可以这样改</span>' + (tpl.length ? tpl.map(function(s){ return '<div class="row sm"><span class="grow">' + s.text + '</span><button class="btn light sm" data-sg="tpl|' + esc(s.id) + '">采纳</button></div>'; }).join('') : '<div class="sm">这一周没有发现需要改的地方。</div>') + '</div></div>';
  };
  SCREENS.energy = function(){
    var v = [0.3, 0.7, 0.95, 0.9, 0.6, 0.35, 0.3, 0.5, 0.65, 0.55, 0.4, 0.45, 0.6, 0.5, 0.3];
    return sbar() + nav('精力时段', 'me') + '<div class="body"><div class="h1">你的高效时段</div><div class="sm">最近 14 天，按准时开始和完成率算</div>' +
      '<div class="card"><div class="heat">' + v.map(function(x){ return '<i style="height:' + (20 + x * 100) + 'px;background:' + (x > 0.8 ? 'var(--accent)' : x > 0.5 ? 'var(--accent-l2)' : 'var(--line)') + '"></i>'; }).join('') + '</div><div class="row xs"><span class="grow">08</span><span class="grow">12</span><span class="grow">16</span><span class="grow">20</span><span>22</span></div></div>' +
      '<div class="card soft"><b style="color:var(--accent-dark)">09:00–11:30 最高效</b><span class="sm">睡前阅读现在排在 22:00，那时完成率只有 55%。</span><button class="btn primary">挪到 09:00 试一周</button></div></div>';
  };
  SCREENS.estimate = function(){
    return sbar() + nav('新建', 'me') + '<div class="body"><div class="card"><b>写周报 · 1 小时</b><div class="sm" style="color:var(--warn)">你最近 5 次写报告平均用了 1 小时 35 分</div><div class="two"><button class="btn primary">按 1.5 小时排</button><button class="btn line">还是 1 小时</button></div></div>' +
      '<div class="card"><b>机器学习课 · 113 集 · 12月20日截止</b><div class="sm">按你最近每天实际学 1.2 小时，预计 12月28日学完，晚 8 天。</div><div class="prog"><i style="width:78%;background:var(--warn)"></i></div><div class="two"><button class="btn light">每天 3 集</button><button class="btn line">推迟到 12/28</button></div></div></div>';
  };
  SCREENS.shot = function(){
    return sbar() + nav('从截图添加', 'me') + '<div class="body"><div class="card" style="background:#EDE8D6"><span class="xs">课题组群通知</span><div style="background:#fff;border-radius:12px;padding:10px">各位同学：本周四下午 3 点组会改到 302 会议室；周五晚 8 点前提交周报。</div></div>' +
      '<div class="card"><div class="row"><span class="h2 grow">读出了 2 件事</span>' + chip('AI', 'green ai') + '</div><div class="pv"><span class="plan-tag tag-add">新增</span>周四 15:00–16:00 组会 · 302</div><div class="pv"><span class="plan-tag tag-add">新增</span>收件箱：周五 20:00 前交周报</div></div></div>';
  };
  SCREENS.review = function(){
    return sbar() + nav('1 分钟复盘', 'me') + '<div class="body"><div class="bubble">今天最满意的一件事是什么？</div><div class="bubble me">上午把编程课连上了两集</div><div class="bubble">下午学习推迟了 40 分钟，是因为什么？</div><div class="bubble me">午饭后太困了</div>' +
      '<div class="card soft"><div class="row"><span class="h2 grow">今天的小结</span>' + chip('AI', 'green ai') + '</div><span class="sm">上午状态好，编程课超额 1 集；午饭后犯困导致学习推迟。明天可以试试把学习放在上午。</span></div></div>';
  };
  SCREENS.goal = function(){
    return sbar() + nav('定个目标', 'me') + '<div class="body"><div class="said">三个月雅思到 7 分</div><div class="card"><div class="row"><span class="h2 grow">拆成 4 个学习项目</span>' + chip('AI', 'green ai') + '</div>' +
      [['听力', '剑桥真题 32 套 · 每天 1 套'], ['阅读', '真题 32 篇 · 每天 1 篇'], ['写作', '大小作文各 24 篇 · 每 2 天 1 篇'], ['口语', '题库 3 个月 · 每天 30 分钟']].map(function(x){ return '<div class="row"><span class="bar" style="height:30px;background:var(--learn)"></span><div><b>' + x[0] + '</b><div class="xs">' + x[1] + '</div></div></div>'; }).join('') +
      '</div><div class="sm" style="color:var(--accent-dark)">每天约 2.5 小时，按你最近的空闲时间排得下。</div></div>';
  };
  SCREENS.focus = function(){
    return sbar(true) + '<div class="nav" style="color:#fff"><div class="l"><button data-go="me" class="row">' + IC.back + '返回</button></div><b>专注</b><div class="r"></div></div><div class="body" style="align-items:center;justify-content:center;gap:16px">' +
      '<div class="ring" style="background:conic-gradient(var(--accent-l2) 0 64%,var(--accent-dark) 64% 100%);"><div class="ring" style="width:186px;height:186px;background:var(--dark)"><span>16:02</span></div></div><b style="color:#fff">编程入门视频课 第 9 集</b>' + chip('完成后 学编程 +1 集', 'green') +
      '<div class="two" style="width:100%;margin-top:30px"><button class="btn line">暂停</button><button class="btn primary">结束并记录</button></div></div>';
  };
  SCREENS.focus.dark = true;

  // ---------- 锁屏与桌面（锁屏只在演示里） ----------
  function lockHTML(){
    var d = new Date();
    var cards = S.notifs.map(function(n){
      if(n.type === 'result') return '<div class="notif"><span class="src"><i></i>三三作息簿 · ' + hhmm(n.at) + '</span><b>' + esc(n.title) + '</b><span class="sm">你回复：' + esc(n.said) + '</span><div class="card soft sm"><b>已改好</b>' + esc(n.result) + (n.undone ? ' 已撤销' : ' <button class="btn sm light" data-act="undoReply">撤销</button>') + '</div></div>';
      if(n.type === 'evening') return '<div class="notif"><span class="src"><i></i>三三作息簿 · ' + hhmm(n.at) + '</span><b>今天的核对</b><span class="sm">还有 ' + (coverage().past - coverage().rec) + ' 项没记录，睡前花 30 秒勾一下？</span><button class="btn primary sm" data-act="openEvening">去核对</button></div>';
      var a = findIn(dayList(S.today), n.id); if(!a) return '';
      var p = n.prev && findIn(dayList(S.today), n.prev), r = recOf(S.today, a);
      var reply = S.reply === n.id ? '<div class="input" style="background:#fff"><input id="replyText" placeholder="回一句话，比如：今晚不听了，改成复习一小时"><button class="btn primary sm" data-act="reply" data-id="' + a.id + '">发送</button></div>' : '';
      return '<div class="notif"><span class="src"><i></i>三三作息簿 · ' + hhmm(n.at) + '</span><b>' + esc(a.name) + ' ' + a.start + '–' + a.end + '，开始了吗？</b>' +
        (p ? '<div class="row sm"><span class="grow">上一项「' + esc(p.name) + '」做完了吗？</span>' + (isComplete(p) ? chip('已记做完', 'green') : '<button class="btn sm light" data-act="prevDone" data-id="' + p.id + '">做完了</button>') + '</div>' : '') +
        (r || isComplete(a) ? chip(r && r.status === 'running' ? '已开始 ' + r.start : '已记录', 'green') :
          '<div class="two"><button class="btn primary sm" data-act="nStart" data-id="' + a.id + '">开始</button><button class="btn line sm" data-act="nLater" data-id="' + a.id + '">晚 15 分钟</button><button class="btn line sm" data-act="nSkip" data-id="' + a.id + '">跳过</button></div>') +
        (S.reply === n.id ? '' : '<button class="sm" style="text-align:left;color:var(--accent-dark)" data-act="openReply" data-id="' + a.id + '">长按回复一句话 ›</button>') + reply + '</div>';
    }).join('');
    return sbar(true) + '<div class="body" style="gap:12px"><div class="lockclock">' + hhmm(now()) + '</div><div class="lockdate">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '</div><div style="flex:1"></div>' +
      (cards || '<div class="xs" style="text-align:center;color:#fff;opacity:.7">没有通知</div>') + (S.busy ? '<div class="xs" style="color:#fff">正在理解…</div>' : '') + '</div>';
  }
  function homeHTML(){
    var cur = current(), nx = nextOne(), g = learnGroups(S.today), gd = g.filter(function(x){ return x.done === x.total; });
    return sbar(true) + '<div class="body" style="gap:18px;padding-top:20px"><div class="widget"><span class="xs">' + (cur ? '现在 · ' + cur.start + '–' + cur.end : '现在没有安排') + '</span>' +
      (cur ? '<div class="row"><span class="bar" style="height:26px;background:' + color(cur) + '"></span><b class="grow" style="font-size:17px">' + esc(cur.name) + '</b>' + (isComplete(cur) ? chip('已完成', 'green') : '<button class="tick" data-act="widgetDone" data-id="' + cur.id + '">' + IC.check + '</button>') + '</div>' : '') +
      '<div class="row sm" style="border-top:1px solid var(--line);padding-top:8px"><span class="xs">下一项</span><b>' + (nx ? nx.start + ' ' + esc(nx.name) : '没有了') + '</b></div></div>' +
      '<div class="row" style="gap:18px;align-items:flex-start"><div class="widget" style="width:150px;height:150px"><span class="xs">今日学习</span><span style="font:600 46px var(--serif);color:var(--accent-dark)">' + gd.length + '/' + g.length + '</span><span class="xs">' + esc(gd.map(function(x){ return x.label; }).slice(0, 2).join('、') || '还没开始') + '</span></div>' +
      '<div class="appicons"><i style="background:#D9A24A"></i><i style="background:#4A88D9"></i><i style="background:#D96A4A"></i><i style="background:var(--accent);display:grid;place-items:center;color:#fff;font:600 22px var(--serif)" data-view="app">簿</i></div></div></div>';
  }

  // ---------- 引导情景（只在体验演示） ----------
  var SC = {
    remind: {title:'① 到点提醒，记下实际', steps:[
      {text:'现在是晚上 19:50，「英语听力」20:00 开始。点【快进到 20:00】。', ff:'20:00', wait:'notify'},
      {text:'手机锁屏收到提醒。点通知里的【开始】。', target:'[data-act=nStart]', wait:'started'},
      {text:'实际开始时间记下了。点上方的【App】回到 App。', target:'[data-view=app]', wait:'view:app'},
      {text:'首页「现在」卡片显示英语听力进行中。假设听完了，点【完成】。', target:'[data-act=finish]', wait:'finished'},
      {text:'点底部【我的】→【计划 vs 实际】，看看今天记了什么。', target:'[data-go=me]', then:'[data-go=actual]', wait:'go:actual'},
      {text:'🎉 计划和实际并排对比，今天做了什么一目了然。', end:true}
    ]},
    say: {title:'② 一句话改日程', steps:[
      {text:'在首页输入框说一句话。也可以点下方的示例【晚上九点到十点加个复习，散步不去了】。', target:'[data-ex=say]', wait:'plan'},
      {text:'先看会怎么改，确认前什么都不会改。点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'🎉 时间轴更新了，改动的项会高亮；7 秒内可以撤销。', end:true}
    ]},
    interrupt: {title:'③ 被打断一键重排', steps:[
      {text:'先点【快进到 20:00】，在锁屏通知里点【开始】。', ff:'20:00', wait:'started'},
      {text:'点上方【App】回到首页。', target:'[data-view=app]', wait:'view:app'},
      {text:'假设临时来了电话。点「现在」卡片里的【被打断了】。', target:'[data-go=interrupt]', wait:'go:interrupt'},
      {text:'选耽误了多久。点【45 分钟】。', target:'[data-delay="45"]', wait:'plan'},
      {text:'后面的安排往后让。点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'🎉 完成，后面的安排都顺好了。', end:true}
    ]},
    inbox: {title:'④ 收件箱与排明天', steps:[
      {text:'点底部【收件箱】。', target:'[data-go=inbox]', wait:'go:inbox'},
      {text:'想到就丢进来。点「给导师回邮件」的【找个空档】。', target:'[data-place=i2]', wait:'plan'},
      {text:'点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'再试试一句话排一天。回到【今天】，点【排明天】。', target:'[data-go=today]', then:'[data-go=planDay]', wait:'go:planDay'},
      {text:'点下方示例填入一句话，再点【拆一下】。', target:'[data-ex=day]', wait:'split'},
      {text:'时长可以改。点【排进明天】。', target:'[data-act=placeDay]', wait:'plan'},
      {text:'点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'🎉 完成，明天的空档都排上了。', end:true}
    ]},
    reply: {title:'⑤ 通知里直接回复', steps:[
      {text:'点【快进到 20:00】。', ff:'20:00', wait:'notify'},
      {text:'这次不想听英语了。点通知里的【长按回复一句话】。', target:'[data-act=openReply]', wait:'openReply'},
      {text:'输入一句话后点发送，或者点下方示例【今晚不听了，改成复习一小时】。', target:'[data-ex=reply]', wait:'replied'},
      {text:'🎉 不打开 App 就改好了，通知里留有撤销入口。', end:true}
    ]},
    evening: {title:'⑥ 晚间核对', steps:[
      {text:'点【快进到 21:45】。', ff:'21:45', wait:'evening'},
      {text:'收到「今天的核对」。点【去核对】。', target:'[data-act=openEvening]', wait:'go:evening'},
      {text:'逐项选做了或没做，然后点【一起确认】。', target:'[data-act=evening]', wait:'evening:done'},
      {text:'🎉 核对好了，今天的记录更完整了。', end:true}
    ]},
    free: {title:'自由体验', steps:[]}
  };
  function emit(ev){ var st = SC[S.sc].steps[S.step]; if(st && st.wait === ev) S.step++; }
  function examplesHTML(){
    var ex = [];
    if(S.view === 'lock' && S.reply) ex = [['reply', '今晚不听了，改成复习一小时'], ['reply', '英语听力推迟半小时']];
    else if(S.view === 'app' && S.screen === 'today') ex = [['say', '晚上九点到十点加个复习，散步不去了'], ['say', '今晚加一小时复习'], ['say', '以后每天早上加20分钟冥想']];
    else if(S.view === 'app' && S.screen === 'voice') ex = [['voice', '刚才晚饭多吃了半小时，后面都顺延']];
    else if(S.view === 'app' && S.screen === 'planDay') ex = [['day', '明天要健身一小时、取快递']];
    else if(S.view === 'app' && S.screen === 'inbox') ex = [['inbox', '周五前交实验报告']];
    if(!ex.length) return '';
    return '<div class="examples"><span>试试这些说法：</span>' + ex.map(function(x){ return '<button data-ex="' + x[0] + '" data-text="' + esc(x[1]) + '">' + esc(x[1]) + '</button>'; }).join('') + '</div>';
  }
  function guideHTML(){
    var sc = SC[S.sc], st = sc.steps[S.step];
    var tabsH = Object.keys(SC).map(function(k){ return '<button class="sc ' + (k === S.sc ? 'on' : '') + '" data-sc="' + k + '">' + SC[k].title + '</button>'; }).join('');
    var box = S.sc === 'free' ? '<p>随意操作：用下面的按钮推进时间；「我的」里能看到所有页面。</p>'
      : '<div class="stepno">第 ' + (S.step + 1) + ' 步 / 共 ' + sc.steps.length + ' 步</div><p>' + st.text + '</p>' + (st.ff ? '<button class="primary" data-ff="' + st.ff + '" id="g-ff">⏩ 快进到 ' + st.ff + '</button>' : '') + (st.end ? '<button class="primary" data-act="restart">↺ 再来一遍</button>' : '');
    return '<div class="sc-row">' + tabsH + '</div><div class="stepbox">' + box + '</div>' + examplesHTML() + '<div class="timebar"><span>🕗 现在 <b>' + hhmm(S.min) + '</b></span><button data-plus="15">+15 分钟</button><button data-ff="21:45">晚间核对 21:45</button><button data-act="restart">↺ 重新开始</button></div>';
  }

  // ---------- 渲染 ----------
  function render(){
    if(!S) return;
    $('#guide').innerHTML = guideHTML();
    var views = [['app', 'App'], ['lock', '锁屏通知' + (S.notifs.length ? ' · ' + S.notifs.length : '')], ['home', '桌面小组件']];
    $('#viewbar').innerHTML = views.map(function(v){ return '<button data-view="' + v[0] + '" class="' + (S.view === v[0] ? 'on' : '') + '">' + v[1] + '</button>'; }).join('');
    var scr = $('#screen'), body = scr.querySelector('.body'), keep = body ? body.scrollTop : 0;
    var active = document.activeElement, focusId = active && scr.contains(active) && active.id, focusVal = focusId ? active.value : null;
    var html, dark = false;
    if(S.view === 'lock'){ html = lockHTML(); dark = true; }
    else if(S.view === 'home'){ html = homeHTML(); dark = true; }
    else { html = (SCREENS[S.screen] || SCREENS.today)(); dark = !!(SCREENS[S.screen] || {}).dark; }
    if(S.cheer) html += '<div class="cheer"><div class="burst">🎆</div><b>' + esc(S.cheer) + '</b><span>今天的学习都完成了</span></div>';
    scr.className = 'screen' + (dark ? ' wall' : '');
    scr.style.background = S.screen === 'focus' && S.view === 'app' ? 'var(--dark)' : '';
    scr.innerHTML = html;
    var nb = scr.querySelector('.body');
    if(nb && S.lastScreen === S.view + S.screen + S.sel) nb.scrollTop = keep;
    S.lastScreen = S.view + S.screen + S.sel;
    if(focusId){ var el = document.getElementById(focusId); if(el){ el.focus(); if(focusVal != null && el.value !== focusVal) el.value = focusVal; } }
    var st = SC[S.sc].steps[S.step]; if(st && st.target){ var t = document.querySelector(st.then && S.view === 'app' && S.screen === st.target.slice(9, -1) ? st.then : st.target); if(t) t.classList.add('pulse'); }
  }
  function toast(msg, undo){
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button>撤销</button>' : '');
    t.hidden = false;
    if(undo) t.querySelector('button').onclick = function(){ undo(); t.hidden = true; };
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.hidden = true; }, undo ? 7000 : 3000);
  }
  function go(screen){ S.view = 'app'; S.screen = screen; S.msg = ''; if(screen !== 'today' && screen !== 'plan') S.progFor = null; emit('go:' + screen); render(); }
  function start(sc){
    freshDemo(sc);
    $('#toast').hidden = true;
    render();
  }

  // ---------- 编辑 ----------
  function openEdit(scope, id){
    var list = scope === 'template' ? S.template : dayList(S.sel), a = id && findIn(list, id);
    var t = now(), st = Math.ceil(t / 30) * 30;
    S.edit = {scope:scope, id:id || null, back:scope === 'template' ? 'template' : 'today',
              draft:a ? clone(a) : {name:'', kind:'range', start:hhmm(Math.min(st, 1380)), end:hhmm(Math.min(st + 60, 1440)), cat:'learn', group:'', projectId:'', amount:0, subs:[], done:false}};
    S.edit.draft.subs = S.edit.draft.subs || [];
    S.edit.oldName = a ? a.name : null;
    go('edit');
  }
  function saveEdit(){
    var e = S.edit, f = e.draft;
    f.name = (f.name || '').trim();
    if(!f.name){ S.msg = '先填个名称。'; return render(); }
    if(!/^\d\d:\d\d$/.test(f.start) || (f.kind !== 'point' && (!/^\d\d:\d\d$/.test(f.end) || toMin(f.end) <= toMin(f.start)))){ S.msg = '结束时间要晚于开始时间。'; return render(); }
    if(f.kind === 'point') f.end = f.start;
    f.subs = (f.subs || []).filter(function(s){ return (s.name || '').trim(); }).map(function(s){ return {id:s.id || uid(), name:s.name.trim(), start:s.start || f.start, end:s.end || f.end, done:!!s.done}; });
    f.amount = f.projectId ? +f.amount || 0 : 0;
    var list = e.scope === 'template' ? S.template : dayList(S.sel);
    if(e.id){ var i = list.findIndex(function(a){ return a.id === e.id; }); if(i >= 0) list[i] = f; }
    else { f.id = uid(); list.push(f); }
    if(e.oldName && e.oldName !== f.name && S.remind[e.oldName]){ S.remind[f.name] = true; delete S.remind[e.oldName]; }
    sortDay(list);
    if(e.scope === 'day'){ noteManualEdit(); snapshot(S.sel); toast('已保存「' + f.name + '」'); }
    S.edit = null; go(e.back);
  }

  // ---------- 交互 ----------
  document.addEventListener('click', function(e){
    if(!S) return;
    var ex = e.target.closest('[data-ex]');
    if(ex){
      var k = ex.dataset.ex, tx = ex.dataset.text;
      if(k === 'say' || k === 'voice') return understand(tx, k === 'voice' ? '随手记' : '一句话改日程');
      if(k === 'reply') return sendReply(S.reply, tx);
      if(k === 'day'){
        var di = $('#dayText'); if(di) di.value = tx; S.dayText = tx;
        ex.classList.remove('pulse'); var sb = document.querySelector('[data-act=split]'); if(sb) sb.classList.add('pulse');
        return;
      }
      if(k === 'inbox'){ var ii = $('#inboxText'); if(ii) ii.value = tx; return; }
    }
    var el = e.target.closest('[data-act],[data-go],[data-view],[data-sc],[data-ff],[data-plus],[data-delay],[data-place],[data-bell],[data-perm],[data-ev],[data-tick],[data-subtick],[data-edit],[data-tpledit],[data-day],[data-sg],[data-cat],[data-kind],[data-subdel],[data-prog],[data-projedit],[data-inboxdel]');
    if(!el) return;
    var d = el.dataset;
    if(d.sc) return start(d.sc);
    if(d.view){ S.view = d.view; emit('view:' + d.view); return render(); }
    if(d.go) return go(d.go);
    if(d.ff) return tick(toMin(d.ff));
    if(d.plus) return tick(S.min + (+d.plus));
    if(d.day != null){ S.sel = d.day === '0' ? S.today : shiftKey(S.sel, +d.day); S.msg = ''; return render(); }
    if(d.delay){
      var res0 = clone(E.plan([{op:'delay', minutes:+d.delay}], Object.assign(data(), {dayKey:S.today, day:dayList(S.today)}), now()));
      if(!res0.changes.length){ S.msg = '后面没有需要让位的安排。'; return render(); }
      S.sel = S.today;
      return openPlan('耽误了 ' + d.delay + ' 分钟，后面顺延', '被打断了', res0, 'interrupt');
    }
    if(d.place) return placeInbox(d.place);
    if(d.inboxdel){ S.inbox = S.inbox.filter(function(x){ return x.id !== d.inboxdel; }); return render(); }
    if(d.bell){ S.remind[d.bell] = !S.remind[d.bell]; return render(); }
    if(d.perm){
      S.perm[d.perm] = !S.perm[d.perm];
      if(d.perm === 'stats') try{ localStorage.setItem(STATS_OFF, S.perm.stats ? '0' : '1'); }catch(err){}
      return render();
    }
    if(d.ev){ var pp = d.ev.split('|'); S.evening[pp[0]] = S.evening[pp[0]] === pp[1] ? '' : pp[1]; return render(); }
    if(d.tick){ var ta = findIn(dayList(S.sel), d.tick); if(ta){ toggle(S.sel, ta); noteManualEdit(); } return render(); }
    if(d.subtick){
      var sp = d.subtick.split('|'), pa = findIn(dayList(S.sel), sp[0]), sb = pa && pa.subs.filter(function(s){ return s.id === sp[1]; })[0];
      if(sb){ if(pa.done){ pa.done = false; pa.subs.forEach(function(s){ s.done = true; }); } sb.done = !sb.done; if(isComplete(pa)) finish(S.sel, pa); else if(recOf(S.sel, pa) && recOf(S.sel, pa).status === 'done') setRec(S.sel, pa, null); }
      return render();
    }
    if(d.edit) return openEdit('day', d.edit);
    if(d.tpledit) return openEdit('template', d.tpledit);
    if(d.cat){ S.edit.draft.cat = d.cat; return render(); }
    if(d.kind){ S.edit.draft.kind = d.kind; return render(); }
    if(d.subdel){ S.edit.draft.subs.splice(+d.subdel, 1); return render(); }
    if(d.prog){ S.progFor = d.prog; render(); var pn = $('#progN'); if(pn) pn.focus(); return; }
    if(d.projedit){ var pr = S.projects.filter(function(p){ return p.id === d.projedit; })[0]; S.projEdit = clone(pr); return go('projEdit'); }
    if(d.sg) return onSuggestion(d.sg.split('|'));
    switch(d.act){
      case 'restart': return start(S.sc);
      case 'start': setRec(S.today, findIn(dayList(S.today), d.id), {status:'running', start:hhmm(now())}); emit('started'); break;
      case 'finish': finish(S.today, findIn(dayList(S.today), d.id)); emit('finished'); toast('已完成，实际时间已记录'); break;
      case 'nStart': setRec(S.today, findIn(dayList(S.today), d.id), {status:'running', start:hhmm(now())}); emit('started'); break;
      case 'nLater': S.snooze[d.id] = now() + 15; S.notifs = S.notifs.filter(function(n){ return n.id !== d.id; }); S.pushed = Math.max(0, S.pushed - 1); toast('15 分钟后再提醒'); break;
      case 'nSkip': setRec(S.today, findIn(dayList(S.today), d.id), {status:'skip'}); toast('已记为跳过'); break;
      case 'prevDone': var pa2 = findIn(dayList(S.today), d.id); var r2 = recOf(S.today, pa2); setRec(S.today, pa2, {status:'done', start:(r2 && r2.start) || pa2.start, end:pa2.end}); break;
      case 'openReply': S.reply = d.id; emit('openReply'); break;
      case 'reply': return sendReply(d.id, ($('#replyText') || {}).value || '');
      case 'undoReply':
        if(S.undo){ S.days = S.undo.days; S.projects = S.undo.projects; S.template = S.undo.template; S.undo = null; }
        S.notifs.forEach(function(n){ if(n.type === 'result') n.undone = true; }); toast('已撤销'); break;
      case 'openEvening': S.notifs = S.notifs.filter(function(n){ return n.type !== 'evening'; }); return go('evening');
      case 'evening':
        Object.keys(S.evening).forEach(function(id){ var x = findIn(dayList(S.today), id); if(!x || !S.evening[id]) return; setRec(S.today, x, S.evening[id] === 'done' ? {status:'done', start:x.start, end:x.end} : {status:'skip'}); });
        S.evening = {}; celebrate(S.today); emit('evening:done'); toast('核对好了'); return go('today');
      case 'apply':
        var pl = S.plan; applyRes(pl.res, pl.id, pl.text);
        if(pl.extra.sugId) track('suggestion_accepted', {id:pl.extra.sugId, kind:'template'});
        var back = ['interrupt', 'planDay', 'plan', 'voice'].indexOf(pl.back) >= 0 ? 'today' : pl.back;
        S.plan = null; emit('applied'); return go(back);
      case 'cancelPlan': track('plan_cancelled', {plan_id:S.plan.id, text:S.plan.text}); var bk = S.plan.back; S.plan = null; return go(bk);
      case 'listen': return listen();
      case 'replan':
        var rr = clone(E.plan([{op:'replan'}], data(), now()));
        if(!rr.changes.length){ S.msg = rr.warnings.join(' ') || '今天没有需要往后排的。'; return render(); }
        return openPlan('没做完的往后排', '没做完的往后排', rr, 'today');
      case 'add': return openEdit('day');
      case 'tplAdd': return openEdit('template');
      case 'overwrite':
        if(!confirm('用基础模板覆盖' + (S.sel === S.today ? '今天' : E.dayLabel(S.sel)) + '的日程？这一天的修改和打勾会清空。')) return;
        S.days[S.sel] = cloneTpl(); if(S.actual[S.sel]) delete S.actual[S.sel]; toast('已用模板覆盖'); break;
      case 'editSave': return saveEdit();
      case 'editDel':
        if(!confirm('删除「' + S.edit.draft.name + '」？')) return;
        var lst = S.edit.scope === 'template' ? S.template : dayList(S.sel);
        var idx = lst.findIndex(function(a){ return a.id === S.edit.id; }); if(idx >= 0) lst.splice(idx, 1);
        var eb = S.edit.back; S.edit = null; toast('已删除'); return go(eb);
      case 'subAdd': var f = S.edit.draft; f.subs.push({id:uid(), name:'', start:f.start, end:f.end, done:false}); break;
      case 'remindToggle': var nm = S.edit.draft.name; if(nm){ S.remind[nm] = !S.remind[nm]; } else { S.msg = '先填名称再设提醒。'; } break;
      case 'projAdd': S.projEdit = {name:'', category:'', total:'', unit:'集', current:0, dailyTarget:'', deadline:''}; return go('projEdit');
      case 'projSave': return saveProject();
      case 'projDel':
        if(!confirm('删除学习项目「' + S.projEdit.name + '」？')) return;
        S.projects = S.projects.filter(function(p){ return p.id !== S.projEdit.id; }); S.projEdit = null; return go('projects');
      case 'progSave':
        var n = +(($('#progN') || {}).value || 0);
        if(n > 0){ S.projects.forEach(function(p){ if(p.id === d.id) p.current = Math.round((+p.current + n) * 100) / 100; }); toast('进度 +' + n); }
        S.progFor = null; break;
      case 'split':
        S.dayText = ($('#dayText') || {}).value || S.dayText; if(!S.dayText.trim()) return; S.msg = '正在拆…'; render();
        return splitTasks(S.dayText).then(function(r){ S.split = r; S.msg = ''; emit('split'); render(); });
      case 'placeDay':
        if(!S.split) return;
        var day = /后天/.test(S.dayText) ? '后天' : /今天|今晚/.test(S.dayText) ? null : '明天';
        var WIN = {learn:['13:30', '18:00'], exercise:['18:00', '22:00'], work:['09:50', '12:00'], life:['17:00', '22:00']};
        var ops = S.split.tasks.slice().sort(function(x, y){ return y.minutes - x.minutes; }).map(function(t){ var wv = WIN[t.cat] || WIN.life, o = {op:'add', name:t.name, cat:t.cat, minutes:t.minutes, after:wv[0], before:wv[1]}; if(day) o.day = day; else { o.after = hhmm(now()); delete o.before; } return o; });
        var res = clone(E.plan(ops, Object.assign(data(), {dayKey:S.today, day:dayList(S.today)}), now()));
        if(!res.changes.length){ S.msg = res.warnings.join(' ') || '没排进去。'; return render(); }
        S.split = null;
        return openPlan(S.dayText, '排' + (day || '今天'), res, 'planDay');
      case 'inboxAdd':
        var tx2 = (($('#inboxText') || {}).value || '').trim(); if(!tx2) return;
        S.msg = '正在整理…'; render();
        return splitTasks(tx2).then(function(r){
          r.tasks.forEach(function(t){ S.inbox.unshift({id:'i' + Date.now() + Math.random().toString(36).slice(2, 5), title:t.name, due:/今天/.test(tx2) ? '今天' : /周[一二三四五六日天]|明天|后天/.test(tx2) ? (tx2.match(/周[一二三四五六日天]|明天|后天/)[0] + '截止') : '不急', minutes:t.minutes, cat:t.cat}); });
          S.msg = ''; render();
        });
      case 'widgetDone': finish(S.today, findIn(dayList(S.today), d.id)); toast('已记录完成'); break;
      case 'export':
        var blob = new Blob([JSON.stringify({app:'sansan-planner', version:2, exportedAt:new Date().toISOString(), template:S.template, days:S.days, projects:S.projects, inbox:S.inbox, remind:S.remind, actual:S.actual}, null, 1)], {type:'application/json'});
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '三三作息簿备份-' + S.today + '.json'; a.click(); toast('备份文件已下载'); return;
      case 'resetSample':
        if(!confirm('恢复示例数据会清空现在的修改，确定吗？')) return;
        start(S.sc); toast('已恢复示例数据'); return go('today');
      default: return;
    }
    render();
  });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' || e.isComposing || !S) return;
    if(e.target.id === 'aiText') understand(e.target.value);
    if(e.target.id === 'replyText') sendReply(S.reply, e.target.value);
    if(e.target.id === 'inboxText'){ var b = document.querySelector('[data-act=inboxAdd]'); if(b) b.click(); }
  });
  document.addEventListener('input', function(e){
    var t = e.target, d = t.dataset || {};
    if(d.ef && S.edit){ S.edit.draft[d.ef] = t.value; if(d.ef === 'projectId') render(); }
    if(d.sf && S.edit){ var p = d.sf.split('|'); S.edit.draft.subs[+p[0]][p[1]] = t.value; }
    if(d.pf && S.projEdit) S.projEdit[d.pf] = t.value;
    if(t.id === 'dayText') S.dayText = t.value;
  });
  document.addEventListener('change', function(e){
    var t = e.target;
    if(t.dataset && t.dataset.dur && S.split) S.split.tasks[+t.dataset.dur].minutes = +t.value;
    if(t.dataset && t.dataset.jump !== undefined && t.value){ S.sel = t.value; render(); }
    if(t.dataset && t.dataset.import !== undefined && t.files && t.files[0]){
      var r = new FileReader();
      r.onload = function(){
        try{
          var o = JSON.parse(r.result);
          if(!o.template || !o.days) throw 0;
          if(!confirm('用这个备份覆盖现在的数据？')) return;
          S.template = o.template; S.days = o.days; S.projects = o.projects || []; S.inbox = o.inbox || []; S.remind = o.remind || defaultRemind(o.template); S.actual = o.actual || {}; toast('已从备份恢复'); go('today');
        }catch(err){ toast('这个文件不是作息簿的备份'); }
      };
      r.readAsText(t.files[0]);
    }
  });

  function onSuggestion(p){
    var kind = p[0], id = p[1];
    if(kind === 'ignore'){ S.dismissed[id] = Date.now(); track('suggestion_dismissed', {id:id}); return render(); }
    if(kind === 'daily' || kind === 'deadline'){
      var before = clone(S.projects), pr = S.projects.filter(function(x){ return x.id === p[2]; })[0]; if(!pr) return;
      if(kind === 'daily') pr.dailyTarget = +p[3]; else pr.deadline = p[3];
      track('suggestion_accepted', {id:id, kind:'behind', choice:kind === 'daily' ? 'dailyTarget' : 'deadline'}); render();
      return toast(kind === 'daily' ? '「' + pr.name + '」每天目标改成 ' + p[3] : '「' + pr.name + '」截止日改到 ' + E.shortDate(p[3]), function(){ S.projects = before; render(); });
    }
    var s = suggestions().concat(E.suggestions(data())).filter(function(x){ return x.id === id; })[0]; if(!s) return;
    var res = clone(E.plan(s.ops, data('template'), now()));
    if(!res.changes.length){ S.msg = res.warnings.join(' ') || '这条建议已经不需要了。'; return render(); }
    openPlan(s.say, '更新模板', res, S.screen, {sugId:id});
  }
  function saveProject(){
    var f = S.projEdit, total = +f.total, cur = +f.current || 0, daily = +f.dailyTarget || 0;
    if(!(f.name || '').trim() || !(total > 0)){ S.msg = '名称和总量要填。'; return render(); }
    if(f.deadline && !daily){ var left = Math.max(0, total - cur - (f.id ? credited(f.id) : 0)); daily = Math.max(0.5, Math.ceil(left / daysLeft(f.deadline) * 2) / 2); }
    var o = {id:f.id || 'p' + uid(), name:f.name.trim(), category:(f.category || '').trim(), total:total, unit:(f.unit || '个').trim(), current:cur, dailyTarget:daily, deadline:f.deadline || ''};
    if(f.id) S.projects = S.projects.map(function(p){ return p.id === f.id ? o : p; }); else S.projects.push(o);
    S.projEdit = null; toast('已保存「' + o.name + '」'); go('projects');
  }
  function sendReply(id, text){
    if(!(text || '').trim()) return;
    var before = {days:clone(S.days), projects:clone(S.projects), template:clone(S.template)};
    var a = findIn(dayList(S.today), id) || {name:'', start:'', end:''};
    S.sel = S.today;
    understand(text, '通知回复', function(res){
      Object.keys(res.days).forEach(function(k){ S.days[k] = sortDay(res.days[k]); });
      if(res.template) S.template = res.template;
      if(res.projects) S.projects = res.projects;
      S.undo = before;
      var result = res.changes.map(function(c){ return (CHG[c.type] || '') + '「' + c.name + '」'; }).join('，') + '。';
      S.notifs = S.notifs.map(function(x){ return x.id === id ? {type:'result', at:x.at, title:a.name + ' ' + a.start + '–' + a.end, said:text, result:result} : x; });
      S.reply = null; emit('replied'); render();
    });
  }
  function placeInbox(id){
    var x = S.inbox.filter(function(i){ return i.id === id; })[0]; if(!x) return;
    var today = x.due === '今天' || !/截止/.test(x.due || '');
    var o = {op:'add', name:x.title, cat:x.cat, minutes:x.minutes, after: today ? hhmm(now()) : '08:00'};
    if(!today) o.day = /周[一二三四五六日天]/.test(x.due) ? x.due.replace('截止', '') : '明天';
    var res = clone(E.plan([o], Object.assign(data(), {dayKey:S.today, day:dayList(S.today)}), now()));
    if(!res.changes.length){ S.msg = res.warnings.join(' ') || '没找到合适的空档。'; return render(); }
    S.inbox = S.inbox.filter(function(i){ return i.id !== id; });
    S.sel = S.today;
    openPlan(x.title + '（约 ' + x.minutes + ' 分钟' + (x.due ? '，' + x.due : '') + '）', '放进日程', res, 'inbox');
  }

  // 浏览器自带语音识别：边说边显示；出错时说清原因
  var rec = null;
  var VOICE_ERR = {
    'not-allowed':'没有麦克风权限：点地址栏左边的图标，允许使用麦克风后再试。',
    'service-not-allowed':'浏览器不允许使用语音识别服务，可以换 Edge 试试，或者直接打字。',
    'network':'语音识别服务连不上。Chrome 的语音识别要连谷歌服务器，国内常常连不上；可以换 Edge 打开，或者直接打字。',
    'no-speech':'没听到声音：检查一下麦克风，再按一次说。',
    'audio-capture':'没找到麦克风：检查一下电脑的麦克风设置。'
  };
  function listen(){
    if(rec){ rec.stop(); return; }
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!R){ S.voiceMsg = '当前浏览器不支持语音识别，可以用 Chrome 或 Edge 打开，或者直接打字。'; return render(); }
    var heard = '', failed = false;
    try{
      rec = new R(); rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = false;
      rec.onresult = function(ev){ heard = ''; for(var k = 0; k < ev.results.length; k++) heard += ev.results[k][0].transcript; S.voiceText = heard; render(); };
      rec.onerror = function(ev){ failed = true; S.voiceMsg = VOICE_ERR[ev.error] || ('语音识别出错（' + ev.error + '），可以直接打字。'); };
      rec.onend = function(){
        rec = null; S.listening = false;
        if(heard.trim()){ S.voiceMsg = ''; S.voiceText = ''; understand(heard, '随手记'); return; }
        if(!failed) S.voiceMsg = '没听清，再按一次说。';
        render();
      };
      S.listening = true; S.voiceText = ''; S.voiceMsg = ''; render(); rec.start();
    }catch(err){ rec = null; S.listening = false; S.voiceMsg = '语音识别启动失败，可以直接打字。'; render(); }
  }

  // ---------- 启动：等规则引擎加载 ----------
  var frame = $('#engine');
  function boot(){
    try{ E = frame.contentWindow.__sansanEngine; }catch(err){ E = null; }
    if(!E){ $('#screen').innerHTML = '<div class="body"><p>加载失败，请刷新页面。</p></div>'; return; }
    start('remind');
  }
  if(frame.contentWindow && frame.contentWindow.__sansanEngine) boot(); else frame.addEventListener('load', boot);
})();
