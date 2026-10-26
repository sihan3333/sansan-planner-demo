// 三三作息簿 · App 版 Demo
// 界面按 Figma「三三作息簿 App 原型」做；理解和排程复用网页版（web.html?engine=1）的同一套规则。
// 时间由按钮推进，通知、桌面小组件在页面内模拟；V1.1、V1.2 的页面用示例数据展示。
(function(){
  'use strict';
  var $ = function(s){ return document.querySelector(s); };
  var esc = function(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var pad = function(n){ return (n < 10 ? '0' : '') + n; };
  var toMin = function(t){ var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); };
  var hhmm = function(m){ return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
  var CAT = {sleep:'--sleep', wake:'--wake', life:'--life', exercise:'--exercise', learn:'--learn', work:'--work', commute:'--commute', care:'--care'};
  var color = function(a){ return 'var(' + (CAT[a.cat] || '--learn') + ')'; };
  var WEEK = ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
  var AI_ENDPOINT = 'https://sansan-ai.sihanzheng68.workers.dev';
  var PUSH_LIMIT = 8;

  var E = null;          // 规则引擎（web.html 里的同一套规则）
  var S;                 // 演示状态
  var toastTimer;

  // ---------- 数据 ----------
  function fresh(){
    var smp = E.sample();
    var day = JSON.parse(JSON.stringify(smp.template));
    S = {
      min: 19 * 60 + 50, today: E.today(),
      template: JSON.parse(JSON.stringify(smp.template)), day: day, days: {},
      projects: JSON.parse(JSON.stringify(smp.projects)),
      remind: {}, actual: {}, notifs: [], pushed: 0, snooze: {},
      inbox: [
        {id:'i1', title:'交实验报告', due:'周五截止', minutes:120, cat:'learn'},
        {id:'i2', title:'给导师回邮件', due:'今天', minutes:20, cat:'work'},
        {id:'i3', title:'买洗衣液', due:'不急', minutes:15, cat:'life'}
      ],
      screen: 'today', view: 'app', plan: null, undo: null, flash: {}, reply: null, perm: {notify:true, voice:true, stats:false},
      evening: {}, sc: 'remind', step: 0, busy: false, msg: ''
    };
    // 默认只提醒学习和工作
    S.template.forEach(function(a){ if(a.cat === 'learn' || a.cat === 'work') S.remind[a.name] = true; });
    // 今天 19:50 之前已经发生的实际记录（示例）：晨跑、午饭没记录，读书跳过
    var seed = {'起床缓一缓':['07:12','07:30'], '洗漱、早餐':['07:30','08:05'], '背单词':['09:25','09:55'], '处理工作':['09:55','12:10'],
                '学编程':['13:42','15:46'], '数据分析':['16:30','18:05'], '晚饭':['18:05','18:55']};
    S.day.forEach(function(a){
      if(seed[a.name]) S.actual[a.id] = {status:'done', start:seed[a.name][0], end:seed[a.name][1]};
      if(a.name === '读书') S.actual[a.id] = {status:'skip'};
    });
  }
  var tracked = function(a){ return a.cat !== 'sleep' && a.kind !== 'point'; };
  var byId = function(id){ return S.day.filter(function(a){ return a.id === id; })[0]; };
  var current = function(){ return S.day.filter(function(a){ return tracked(a) && toMin(a.start) <= S.min && S.min < toMin(a.end); })[0]; };
  var nextOne = function(){ return S.day.filter(function(a){ return tracked(a) && toMin(a.start) > S.min; })[0]; };
  var statusOf = function(a){
    var r = S.actual[a.id];
    if(r) return r.status;
    return toMin(a.end) <= S.min ? 'none' : (toMin(a.start) <= S.min ? 'due' : 'todo');
  };
  function coverage(){
    var past = S.day.filter(function(a){ return tracked(a) && toMin(a.end) <= S.min; });
    var rec = past.filter(function(a){ return S.actual[a.id]; });
    return {past:past.length, rec:rec.length};
  }
  function projectTick(a, sign){
    if(!a.projectId || !a.amount) return;
    S.projects.forEach(function(p){ if(p.id === a.projectId) p.current = Math.max(0, Math.min(p.total, p.current + sign * a.amount)); });
  }
  function markDone(a, start, end){
    var was = S.actual[a.id];
    S.actual[a.id] = {status:'done', start:start || (was && was.start) || a.start, end:end || hhmm(Math.min(S.min, toMin(a.end)) || toMin(a.end))};
    if(!was || was.status !== 'done') projectTick(a, 1);
  }

  // ---------- 时间推进与提醒 ----------
  function tick(to){
    while(S.min < to){
      S.min++;
      S.day.forEach(function(a){
        if(!tracked(a) || !S.remind[a.name] || S.actual[a.id]) return;
        var at = S.snooze[a.id] || toMin(a.start);
        if(at === S.min) pushStart(a);
      });
      if(S.min === 21 * 60 + 45) pushEvening();
    }
    render();
  }
  function pushStart(a){
    if(S.pushed >= PUSH_LIMIT) return;
    S.pushed++;
    var prev = S.day.filter(function(b){ return tracked(b) && S.remind[b.name] && toMin(b.start) < toMin(a.start) && (!S.actual[b.id] || S.actual[b.id].status === 'running'); }).pop();
    S.notifs = S.notifs.filter(function(n){ return n.type !== 'start'; });
    S.notifs.unshift({type:'start', id:a.id, prev:prev ? prev.id : null, at:S.min});
    S.view = 'lock'; S.reply = null;
    emit('notify');
  }
  function pushEvening(){
    S.notifs.unshift({type:'evening', at:S.min});
    S.view = 'lock';
    emit('evening');
  }

  // ---------- 引擎调用 ----------
  var data = function(){ return {day:S.day, template:S.template, projects:S.projects, days:S.days}; };
  var clone = function(o){ return JSON.parse(JSON.stringify(o)); };
  function understand(text, title, then){
    if(!text.trim() || S.busy) return;
    S.busy = true; S.msg = '正在理解你的意思…'; render();
    E.understand(text, data(), S.min).then(function(res){
      S.busy = false; S.msg = '';
      res = clone(res);
      if(!res.changes.length){ S.msg = res.warnings.join(' ') || res.reply || '没找到要改的内容，可以试试下面的说法。'; render(); return; }
      if(then) return then(res);
      openPlan(text, title || '一句话改日程', res);
    });
  }
  function openPlan(text, title, res, back){
    S.plan = {text:text, title:title, res:res, back:back || 'today'};
    S.view = 'app'; S.screen = 'plan';
    emit('plan'); render();
  }
  function applyRes(res){
    var before = {day:clone(S.day), days:clone(S.days), template:clone(S.template), projects:clone(S.projects)};
    var flash = {};
    res.changes.forEach(function(c){ if(c.id) flash[c.id] = true; });
    Object.keys(res.days).forEach(function(k){ if(k === S.today) S.day = res.days[k]; else S.days[k] = res.days[k]; });
    if(res.template) S.template = res.template;
    if(res.projects) S.projects = res.projects;
    S.flash = flash;
    setTimeout(function(){ S.flash = {}; render(); }, 2500);
    toast('已更新 ' + res.changes.length + ' 项', function(){ S.day = before.day; S.days = before.days; S.template = before.template; S.projects = before.projects; render(); });
  }
  var SRC = {DeepSeek:'由 DeepSeek 理解', local:'由本地规则理解（没有连接大模型）', 'local-fallback':'大模型暂时没连上，已改用本地规则理解', rule:'直接按规则排'};

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
    check:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>',
    bell:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
    right:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>'
  };
  var sbar = function(dark){ return '<div class="sbar' + (dark ? ' dark' : '') + '"><span>' + hhmm(S.min) + '</span><span>▂▄▆ ▭</span></div>'; };
  var nav = function(title, back, right){ return '<div class="nav"><div class="l">' + (back ? '<button data-go="' + back + '" class="row">' + IC.back + '返回</button>' : '') + '</div><b>' + esc(title) + '</b><div class="r">' + (right || '') + '</div></div>'; };
  var tabs = function(on){
    return '<div class="tabbar">' + [['today', IC.cal, '今天'], ['inbox', IC.inbox, '收件箱'], ['projects', IC.book, '学习'], ['me', IC.user, '我的']].map(function(t){
      return '<button data-go="' + t[0] + '" class="' + (t[0] === on ? 'on' : '') + '">' + t[1] + '<span>' + t[2] + '</span></button>';
    }).join('') + '</div>';
  };
  var chip = function(t, k){ return '<span class="chip ' + (k || '') + '">' + esc(t) + '</span>'; };
  var planned = function(a){ return 'badge'; };
  function statusChip(a){
    var r = S.actual[a.id], st = statusOf(a);
    if(st === 'done'){
      var late = toMin(r.start) - toMin(a.start), over = toMin(r.end) - toMin(a.end);
      return chip((r.start || a.start) + '–' + (r.end || a.end), late >= 10 || over >= 15 ? 'warn' : 'green');
    }
    if(st === 'running') return chip('进行中 · ' + r.start + ' 开始', 'learn');
    if(st === 'skip') return chip('跳过', 'red');
    if(st === 'none') return chip('没记录');
    if(st === 'due') return chip('该开始了', 'warn');
    return chip(S.remind[a.name] ? '🔔 待开始' : '待开始');
  }
  function slotRow(a){
    var st = statusOf(a), r = S.actual[a.id];
    var sub = st === 'done' && r && toMin(r.start) - toMin(a.start) >= 10 ? '晚开始 ' + (toMin(r.start) - toMin(a.start)) + ' 分钟' : (a.projectId && a.amount ? '完成后进度 +' + a.amount : '');
    return '<div class="slot' + (S.flash[a.id] ? ' flash' : '') + (st === 'skip' ? ' dim' : '') + '" data-slot="' + a.id + '"><span class="t">' + a.start + '</span><span class="bar" style="background:' + color(a) + '"></span>' +
      '<div class="grow"><b>' + esc(a.name) + '</b>' + (sub ? '<div class="xs">' + esc(sub) + '</div>' : '') + '</div>' + statusChip(a) + '</div>';
  }
  var CHG = {add:'新增', move:'调整', shrink:'压缩', remove:'删除', drop:'移出', done:'完成', undone:'取消完成', 'proj-add':'新项目', 'proj-progress':'记进度', 'proj-update':'改项目', 'proj-remove':'删项目'};
  function changeRow(c){
    var rng = function(p){ return hhmm(p[0]) + '–' + hhmm(p[1]); };
    var time = c.time != null ? esc(c.time) : c.type === 'add' ? rng(c.after) : c.after ? '<s>' + rng(c.before) + '</s> → ' + rng(c.after) : '<s>' + rng(c.before) + '</s>';
    var where = c.dateKey && c.dateKey !== S.today ? ' · ' + E.dayLabel(c.dateKey) : c.scope === 'template' ? ' · 基础模板' : c.scope === 'project' ? ' · 学习项目' : '';
    return '<div class="pv"><span class="plan-tag tag-' + c.type + '">' + (CHG[c.type] || c.type) + '</span><div class="grow"><b>' + esc(c.name) + '</b><span class="xs">' + esc(where) + '</span><div class="sm">' + time + (c.note ? ' · ' + esc(c.note) : '') + '</div></div></div>';
  }

  // ---------- 屏 ----------
  var SCREENS = {};
  SCREENS.today = function(){
    var d = new Date(), cur = current(), nx = nextOne(), cv = coverage();
    var r = cur && S.actual[cur.id];
    var nowCard = cur ? '<div class="now" id="nowCard"><span class="xs">现在 · ' + cur.start + '–' + cur.end + '</span><span class="h1">' + esc(cur.name) + '</span><div class="two">' +
      (r && r.status === 'done' ? '<span class="chip green">已完成 ' + r.end + '</span>' :
        r && r.status === 'running' ? '<button class="btn primary" data-act="finish" data-id="' + cur.id + '">' + IC.check + '完成</button>' :
        '<button class="btn primary" data-act="start" data-id="' + cur.id + '">开始</button>') +
      '<button class="btn light" data-go="interrupt">被打断了</button></div></div>'
      : '<div class="now"><span class="xs">现在没有安排</span><span class="h1">' + (nx ? '下一项 ' + nx.start + ' ' + esc(nx.name) : '今天的安排都结束了') + '</span></div>';
    return sbar() + '<div class="body"><div class="row" style="align-items:flex-end"><div class="grow"><div class="date">' + (d.getMonth() + 1) + '月' + d.getDate() + '日</div><div class="sm">' + WEEK[d.getDay()] + ' · 今天</div></div>' + chip('记录 ' + cv.rec + '/' + cv.past + ' 项', 'green') + '</div>' +
      nowCard +
      '<div class="input"><span style="color:var(--accent)">✦</span><input id="aiText" placeholder="一句话改日程、记进度、加任务"><button class="mic" data-go="voice" title="语音随手记">' + IC.mic + '</button></div>' +
      '<div class="chips"><button data-say="晚上九点到十点加个复习，散步不去了">晚上九点到十点加个复习，散步不去了</button><button data-say="今晚加一小时复习">今晚加一小时复习</button><button data-say="以后每天早上加20分钟冥想">以后每天早上加20分钟冥想</button><button data-go="planDay">排明天</button></div>' +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      '<div class="card" style="padding:4px 14px">' + S.day.filter(tracked).map(slotRow).join('') + '</div></div>' + tabs('today');
  };
  SCREENS.plan = function(){
    var p = S.plan, res = p.res;
    return sbar() + nav(p.title, p.back) + '<div class="body"><div class="said">' + esc(p.text) + '</div>' +
      '<div class="card"><div class="row"><span class="h2 grow">会这样改</span>' + chip('AI', 'green ai') + '</div>' + res.changes.map(changeRow).join('') + '</div>' +
      (res.reply ? '<div class="card soft sm">' + esc(res.reply) + '</div>' : '') +
      (res.warnings.length ? '<div class="card warnc sm">' + esc(res.warnings.join(' ')) + '</div>' : '') +
      '<div class="xs">' + esc(SRC[res.source] || res.source) + '；时间由固定规则安排：已开始、已完成和睡觉时间不动，空档先吸收，放不下先压缩运动和护理，再压缩学习，最后才移出重要性低的。</div>' +
      '<div style="flex:1"></div><div class="two"><button class="btn line" data-go="' + p.back + '">取消</button><button class="btn primary" data-act="apply">' + IC.check + '确认改</button></div></div>';
  };
  SCREENS.voice = function(){
    var sample = '刚才数据分析多做了半小时，后面都顺延';
    return sbar() + nav('随手记', 'today') + '<div class="body" style="align-items:center;text-align:center"><div style="height:40px"></div>' +
      '<div style="width:130px;height:130px;border-radius:50%;background:var(--accent-l);box-shadow:0 0 0 12px var(--accent-l2);display:grid;place-items:center;color:var(--accent-dark)">' + IC.mic.replace(/18/g, '54') + '</div>' +
      '<div class="h2" style="margin-top:18px">' + (S.listening ? '正在听…说完再按一下' : '说一句发生了什么') + '</div><div class="sm">语音在手机上转成文字，只把文字发给 AI</div>' +
      (S.voiceText ? '<div class="said" style="margin-top:12px">' + esc(S.voiceText) + '</div>' : '') +
      (S.voiceMsg ? '<div class="card warnc sm" style="margin-top:12px;text-align:left">' + esc(S.voiceMsg) + '</div>' : '') +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') +
      '<div style="flex:1"></div><button class="btn primary full" data-act="listen">' + IC.mic + (S.listening ? '说完了' : '按一下开始说') + '</button>' +
      '<button class="btn line full" data-say="' + sample + '" data-title="随手记">用示例：“' + sample + '”</button></div>';
  };
  SCREENS.interrupt = function(){
    return sbar() + nav('被打断了', 'today') + '<div class="body"><div class="h1">耽误了多久？</div><div class="sm">后面的安排按规则往后让，先预览再改</div>' +
      '<div class="two">' + [15, 30, 45, 60].map(function(m){ return '<button class="btn line" data-delay="' + m + '">' + (m === 60 ? '1 小时' : m + '分钟') + '</button>'; }).join('') + '</div>' +
      '<div class="card soft sm">已完成、已开始的和睡觉时间不动；空档先吸收，放不下时先压缩运动、护理，再压缩学习，最后才移出重要性低的。</div></div>';
  };
  SCREENS.planDay = function(){
    var t = S.split;
    return sbar() + nav('排明天', 'today') + '<div class="body">' +
      '<div class="input"><input id="dayText" value="' + esc(S.dayText || '明天要健身一小时、取快递') + '"><button class="btn primary sm" data-act="split">拆一下</button></div>' +
      (t ? '<div class="card"><div class="row"><span class="h2 grow">拆成 ' + t.tasks.length + ' 件事</span>' + chip(t.src === 'DeepSeek' ? 'AI' : '本地规则', 'green ai') + '</div>' + t.tasks.map(function(x, i){
          return '<div class="row"><span class="bar" style="height:22px;background:var(' + CAT[x.cat] + ')"></span><span class="grow">' + esc(x.name) + '</span><select data-dur="' + i + '">' + [15, 30, 45, 60, 90, 120, 150, 180].map(function(m){ return '<option ' + (m === x.minutes ? 'selected' : '') + ' value="' + m + '">' + m + ' 分钟</option>'; }).join('') + (([15, 30, 45, 60, 90, 120, 150, 180].indexOf(x.minutes) < 0) ? '<option selected value="' + x.minutes + '">' + x.minutes + ' 分钟</option>' : '') + '</select>' + chip('AI 估计') + '</div>';
        }).join('') + '</div><button class="btn primary full" data-act="placeDay">按规则排进明天</button>' : '<div class="sm">AI 把一句话拆成任务、估计时长；规则把任务放进明天模板的空档，冲突按优先级让位。</div>') +
      (S.msg ? '<div class="sm" style="color:var(--warn)">' + esc(S.msg) + '</div>' : '') + '</div>';
  };
  SCREENS.inbox = function(){
    return sbar() + '<div class="body"><div class="row"><span class="date grow">收件箱</span>' + chip(S.inbox.length + ' 件') + '</div>' +
      '<div class="input"><span style="color:var(--accent)">✦</span><input id="inboxText" placeholder="想到什么就丢进来，比如：周五前交实验报告"><button class="btn primary sm" data-act="inboxAdd">放进来</button></div>' +
      S.inbox.map(function(x){
        return '<div class="card"><div class="row"><span class="bar" style="height:20px;background:var(' + CAT[x.cat] + ')"></span><b class="grow">' + esc(x.title) + '</b>' + chip(x.due || '不急', x.due === '今天' ? 'warn' : '') + '</div>' +
          '<div class="row sm"><span>约 ' + x.minutes + ' 分钟</span><span class="grow"></span>' + (x.sug ? '<span>建议 ' + esc(x.sug) + '</span>' : '') +
          '<button class="btn light sm" data-place="' + x.id + '">' + (x.sug ? '放进去' : '找个空档') + '</button></div></div>';
      }).join('') + (S.inbox.length ? '' : '<div class="sm" style="text-align:center;padding:30px">收件箱空了</div>') + '</div>' + tabs('inbox');
  };
  SCREENS.projects = function(){
    return sbar() + nav('学习项目') + '<div class="body">' + S.projects.map(function(p){
      var left = p.total - p.current, days = Math.max(1, Math.round((new Date(p.deadline) - new Date(S.today)) / 86400000));
      var behind = p.dailyTarget * days < left;
      return '<div class="card"><div class="row"><span class="bar" style="height:20px;background:var(--learn)"></span><b class="grow">' + esc(p.name) + '</b><b style="color:var(--accent-dark)">' + p.current + '/' + p.total + ' ' + esc(p.unit) + '</b></div>' +
        '<div class="prog"><i style="width:' + Math.round(p.current / p.total * 100) + '%"></i></div><div class="sm">每天 ' + p.dailyTarget + ' ' + esc(p.unit) + ' · ' + p.deadline.slice(5).replace('-', '月') + '日截止 · 还剩 ' + days + ' 天</div>' +
        (behind ? '<div>' + chip('照现在的速度会差 ' + Math.ceil(left - p.dailyTarget * days) + ' ' + p.unit, 'warn') + '</div>' : '') + '</div>';
    }).join('') + '<div class="sm">每天目标由规则算：剩余量 ÷ 剩余天数。打勾关联的活动会自动推进度，比如「学编程」完成后编程课 +1 集。</div></div>' + tabs('projects');
  };
  SCREENS.me = function(){
    var item = function(go, t, s, tag){ return '<button class="slot" data-go="' + go + '" style="width:100%;text-align:left"><div class="grow"><b>' + t + '</b><div class="xs">' + s + '</div></div>' + (tag || '') + IC.right + '</button>'; };
    return sbar() + nav('我的') + '<div class="body">' +
      '<div class="card" style="padding:4px 14px">' + item('actual', '计划 vs 实际', '今天记录了什么、偏差在哪') + item('evening', '今天的核对', '把没记录的活动批量勾一下') + item('template', '基础模板', '新的一天按模板生成；设置提醒') + item('welcome', '首次使用与数据授权', '通知、语音、匿名统计分别授权') + '</div>' +
      '<div class="h2">V1.1 用你的数据优化</div><div class="card" style="padding:4px 14px">' + item('weekly', '每周报告', '统计写成人话，给下周模板建议', chip('规划中', 'warn')) + item('energy', '精力时段', '你的高效时段', chip('规划中', 'warn')) + item('estimate', '时长校准与目标可行性', '按实际记录校准', chip('规划中', 'warn')) + '</div>' +
      '<div class="h2">V1.2 更省事的录入与长期目标</div><div class="card" style="padding:4px 14px">' + item('shot', '截图导入', '课表、群通知读成日程', chip('规划中', 'warn')) + item('review', '每晚 1 分钟复盘', '最多 3 个问题', chip('规划中', 'warn')) + item('goal', '目标拆解', '长期目标拆成学习项目', chip('规划中', 'warn')) + item('focus', '专注计时', '结束时自动记录', chip('规划中', 'warn')) + '</div></div>' + tabs('me');
  };
  SCREENS.actual = function(){
    var cv = coverage(), past = S.day.filter(function(a){ return tracked(a) && toMin(a.start) <= S.min; });
    var done = past.filter(function(a){ return statusOf(a) === 'done'; });
    var dev = 0, worst = null;
    done.forEach(function(a){ var r = S.actual[a.id], d = Math.abs(toMin(r.start) - toMin(a.start)) + Math.max(0, toMin(r.end) - toMin(a.end)); dev += d; if(!worst || d > worst.d) worst = {a:a, d:d}; });
    return sbar() + nav('计划 vs 实际', 'me') + '<div class="body"><div class="card stat3"><div><b>' + cv.rec + '/' + cv.past + '</b><span class="xs">有记录</span></div><div><b>' + (cv.past ? Math.round(done.length / cv.past * 100) : 0) + '%</b><span class="xs">按计划完成</span></div><div><b>+' + dev + '</b><span class="xs">分钟偏差</span></div></div>' +
      '<div class="card" style="padding:6px 14px"><div class="row xs"><span class="grow">活动</span><span style="width:84px">计划</span><span style="width:90px">实际</span></div>' + past.map(function(a){
        var r = S.actual[a.id], st = statusOf(a);
        return '<div class="slot"><span class="bar" style="background:' + color(a) + '"></span><span class="grow">' + esc(a.name) + '</span><span class="sm" style="width:84px">' + a.start + '–' + a.end + '</span><span style="width:90px">' + (st === 'done' ? chip(r.start + '–' + r.end, toMin(r.start) - toMin(a.start) >= 10 ? 'warn' : 'green') : st === 'running' ? chip('进行中', 'learn') : st === 'skip' ? chip('跳过', 'red') : chip('没记录')) + '</span></div>';
      }).join('') + '</div>' +
      (worst ? '<div class="card soft"><b>偏差最大：' + esc(worst.a.name) + '，偏了 ' + worst.d + ' 分钟</b><span class="sm">没记录的不猜，也不计入统计；2 周后用这些记录给出优化建议。</span></div>' : '') + '</div>';
  };
  SCREENS.evening = function(){
    var list = S.day.filter(function(a){ return tracked(a) && toMin(a.end) <= S.min && !S.actual[a.id]; });
    return sbar() + nav('今天的核对', 'today') + '<div class="body"><div class="h1">还有 ' + list.length + ' 项没记录</div><div class="sm">勾一下，明天的建议会更准；不核对也不会追问</div>' +
      '<div class="card">' + list.map(function(a){
        var v = S.evening[a.id] || '';
        return '<div class="row"><span class="bar" style="height:26px;background:' + color(a) + '"></span><div class="grow"><b>' + esc(a.name) + '</b><div class="xs">' + a.start + '–' + a.end + '</div></div><span class="seg">' +
          '<button data-ev="' + a.id + '|done" class="' + (v === 'done' ? 'on g' : '') + '">做了</button> <button data-ev="' + a.id + '|skip" class="' + (v === 'skip' ? 'on r' : '') + '">没做</button></span></div>';
      }).join('') + (list.length ? '' : '<div class="sm">今天都记录好了</div>') + '</div><div style="flex:1"></div>' +
      '<button class="btn primary full" data-act="evening">' + IC.check + '一起确认</button></div>';
  };
  SCREENS.template = function(){
    var n = S.template.filter(function(a){ return S.remind[a.name] && tracked(a); }).length;
    return sbar() + nav('基础模板', 'me') + '<div class="body"><div class="card ' + (n > PUSH_LIMIT ? 'warnc' : 'soft') + ' row">' + IC.bell + '<b>每天提醒 ' + n + ' 条，上限 ' + PUSH_LIMIT + ' 条</b></div>' +
      '<div class="card" style="padding:4px 14px">' + S.template.filter(tracked).map(function(a){
        return '<div class="slot"><span class="t">' + a.start + '</span><span class="bar" style="background:' + color(a) + '"></span><b class="grow">' + esc(a.name) + '</b><button data-bell="' + esc(a.name) + '" style="color:' + (S.remind[a.name] ? 'var(--accent)' : 'var(--line)') + '">' + IC.bell + '</button></div>';
      }).join('') + '</div><div class="sm">铃铛亮的才会推送；睡觉时不推。连续 3 次不响应同一类提醒，App 会问要不要关掉。</div></div>';
  };
  SCREENS.welcome = function(){
    var t = function(k, title, sub){ return '<div class="card row"><div class="grow"><b>' + title + '</b><div class="sm">' + sub + '</div></div><button class="toggle ' + (S.perm[k] ? 'on' : '') + '" data-perm="' + k + '"><i></i></button></div>'; };
    return sbar() + '<div class="body" style="padding-top:24px"><div class="date" style="color:var(--accent-dark)">三三作息簿</div><div class="sm" style="font-size:14px">记录、优化、帮你安排每一天。<br>日程默认只存在你的手机里，不需要账号。</div>' +
      t('notify', '通知', '只提醒你标了铃铛的活动，每天最多 8 条，睡觉时不打扰') + t('voice', '语音识别', '在手机上转成文字，只把文字发给 AI') + t('stats', '匿名使用统计', '帮我们改进 AI；不含日程原文，可以随时关掉') +
      '<div style="flex:1"></div><button class="btn primary full" data-go="today">从模板开始</button><div class="xs" style="text-align:center">三项都可以不开：不开通知就靠打勾和晚间核对，不开统计就只在本机统计</div></div>';
  };
  // ---------- V1.1 / V1.2：示例数据 ----------
  var planning = '<span class="plan-badge">规划中 · 示例数据</span>';
  SCREENS.weekly = function(){
    return sbar() + nav('上周小结', 'me') + '<div class="body">' + planning + '<div class="card stat3"><div><b>76%</b><span class="xs">按计划完成</span></div><div><b>86%</b><span class="xs">有记录</span></div><div><b>11.5h</b><span class="xs">学习时长</span></div></div>' +
      '<div class="card"><div class="row"><span class="h2 grow">这一周</span>' + chip('AI', 'green ai') + '</div>上午的学习基本都按时完成；午饭后的学习有 4 天推迟 30 分钟以上，可能是午饭后容易犯困，这是推测。</div>' +
      '<div class="card"><span class="h2">下周模板可以这样改</span><div class="row sm"><span class="grow">午饭后学习改到 09:30，和编程课换个位置</span><button class="btn light sm">采纳</button></div><div class="row sm"><span class="grow">散步 7 天里删了 5 天，改成每周 3 次</span><button class="btn light sm">采纳</button></div></div>' +
      '<div class="xs" style="text-align:center">数字由规则统计，AI 只负责写成人话；统计用了上周 86% 有记录的活动</div></div>';
  };
  SCREENS.energy = function(){
    var v = [0.3, 0.7, 0.95, 0.9, 0.6, 0.35, 0.3, 0.5, 0.65, 0.55, 0.4, 0.45, 0.6, 0.5, 0.3];
    return sbar() + nav('精力时段', 'me') + '<div class="body">' + planning + '<div class="h1">你的高效时段</div><div class="sm">最近 14 天，按准时开始和完成率算</div>' +
      '<div class="card"><div class="heat">' + v.map(function(x){ return '<i style="height:' + (20 + x * 100) + 'px;background:' + (x > 0.8 ? 'var(--accent)' : x > 0.5 ? 'var(--accent-l2)' : 'var(--line)') + '"></i>'; }).join('') + '</div><div class="row xs"><span class="grow">08</span><span class="grow">12</span><span class="grow">16</span><span class="grow">20</span><span>22</span></div></div>' +
      '<div class="card soft"><b style="color:var(--accent-dark)">09:00–11:30 最高效</b><span class="sm">学编程现在排在 13:30，那时完成率只有 55%。</span><button class="btn primary">挪到 09:30 试一周</button></div></div>';
  };
  SCREENS.estimate = function(){
    return sbar() + nav('新建', 'me') + '<div class="body">' + planning + '<div class="card"><b>写周报 · 1 小时</b><div class="sm" style="color:var(--warn)">你最近 5 次写报告平均用了 1 小时 35 分</div><div class="two"><button class="btn primary">按 1.5 小时排</button><button class="btn line">还是 1 小时</button></div></div>' +
      '<div class="card"><b>机器学习课 · 113 集 · 12月20日截止</b><div class="sm">按你最近每天实际学 1.2 小时，预计 12月28日学完，晚 8 天。</div><div class="prog"><i style="width:78%;background:var(--warn)"></i></div><div class="two"><button class="btn light">每天 3 集</button><button class="btn line">推迟到 12/28</button></div></div>' +
      '<div class="xs">时长和可行性都由规则用实际记录计算，模型只判断任务属于哪一类。</div></div>';
  };
  SCREENS.shot = function(){
    return sbar() + nav('从截图添加', 'me') + '<div class="body">' + planning + '<div class="card" style="background:#EDE8D6"><span class="xs">课题组群通知</span><div style="background:#fff;border-radius:12px;padding:10px">各位同学：本周四下午 3 点组会改到 302 会议室；周五晚 8 点前提交周报。</div></div>' +
      '<div class="card"><div class="row"><span class="h2 grow">读出了 2 件事</span>' + chip('AI', 'green ai') + '</div><div class="pv"><span class="plan-tag tag-add">新增</span>周四 15:00–16:00 组会 · 302</div><div class="pv"><span class="plan-tag tag-add">新增</span>收件箱：周五 20:00 前交周报</div></div>' +
      '<div class="xs">看图模型读出事项和时间说法，日期换算和排进去由规则完成；截图不保存。</div></div>';
  };
  SCREENS.review = function(){
    return sbar() + nav('1 分钟复盘', 'me') + '<div class="body">' + planning + '<div class="bubble">今天最满意的一件事是什么？</div><div class="bubble me">上午把编程课连上了两集</div><div class="bubble">下午学习推迟了 40 分钟，是因为什么？</div><div class="bubble me">午饭后太困了</div>' +
      '<div class="card soft"><div class="row"><span class="h2 grow">今天的小结</span>' + chip('AI', 'green ai') + '</div><span class="sm">上午状态好，编程课超额 1 集；午饭后犯困导致学习推迟。明天可以试试把学习放在上午。</span></div></div>';
  };
  SCREENS.goal = function(){
    return sbar() + nav('定个目标', 'me') + '<div class="body">' + planning + '<div class="said">三个月雅思到 7 分</div><div class="card"><div class="row"><span class="h2 grow">拆成 4 个学习项目</span>' + chip('AI', 'green ai') + '</div>' +
      [['听力', '剑桥真题 32 套 · 每天 1 套'], ['阅读', '真题 32 篇 · 每天 1 篇'], ['写作', '大小作文各 24 篇 · 每 2 天 1 篇'], ['口语', '题库 3 个月 · 每天 30 分钟']].map(function(x){ return '<div class="row"><span class="bar" style="height:30px;background:var(--learn)"></span><div><b>' + x[0] + '</b><div class="xs">' + x[1] + '</div></div></div>'; }).join('') +
      '</div><div class="sm" style="color:var(--accent-dark)">每天约 2.5 小时，按你最近的空闲时间排得下。每天目标由规则按截止日算，确认后才创建。</div></div>';
  };
  SCREENS.focus = function(){
    return '<div class="sbar dark"><span>' + hhmm(S.min) + '</span><span>▂▄▆ ▭</span></div><div class="nav" style="color:#fff"><div class="l"><button data-go="me" class="row">' + IC.back + '返回</button></div><b>专注</b><div class="r"></div></div><div class="body" style="align-items:center;justify-content:center;gap:16px">' + planning +
      '<div class="ring" style="background:conic-gradient(var(--accent-l2) 0 64%,var(--accent-dark) 64% 100%);"><div class="ring" style="width:186px;height:186px;background:var(--dark)"><span>16:02</span></div></div><b style="color:#fff">编程课 第 9 集</b>' + chip('完成后 学编程 +1 集', 'green') +
      '<div class="two" style="width:100%;margin-top:30px"><button class="btn line">暂停</button><button class="btn primary">结束并记录</button></div></div>';
  };
  SCREENS.focus.dark = true;

  // ---------- 锁屏与桌面 ----------
  function lockHTML(){
    var d = new Date();
    var cards = S.notifs.map(function(n){
      if(n.type === 'result') return '<div class="notif"><span class="src"><i></i>三三作息簿 · ' + hhmm(n.at) + '</span><b>' + esc(n.title) + '</b><span class="sm">你回复：' + esc(n.said) + '</span><div class="card soft sm"><b>已改好</b>' + esc(n.result) + (n.undone ? ' 已撤销' : ' <button class="btn sm light" data-act="undoReply">撤销</button>') + '</div></div>';
      if(n.type === 'evening') return '<div class="notif"><span class="src"><i></i>三三作息簿 · ' + hhmm(n.at) + '</span><b>今天的核对</b><span class="sm">还有 ' + S.day.filter(function(a){ return tracked(a) && toMin(a.end) <= S.min && !S.actual[a.id]; }).length + ' 项没记录，睡前花 30 秒勾一下？</span><button class="btn primary sm" data-act="openEvening">去核对</button></div>';
      var a = byId(n.id); if(!a) return '';
      var p = n.prev && byId(n.prev);
      var res = n.result ? '<div class="card soft sm"><b>已改好</b>' + esc(n.result) + ' <button class="btn sm light" data-act="undoReply">撤销</button></div>' : '';
      var reply = S.reply === n.id ? '<div class="input" style="background:#fff"><input id="replyText" placeholder="回一句话，比如：今晚不听了，改成复习一小时"><button class="btn primary sm" data-act="reply" data-id="' + a.id + '">发送</button></div><div class="chips"><button data-reply="今晚不听了，改成复习一小时">今晚不听了，改成复习一小时</button><button data-reply="英语听力推迟半小时">推迟半小时</button></div>' : '';
      return '<div class="notif"><span class="src"><i></i>三三作息簿 · ' + hhmm(n.at) + '</span><b>' + esc(a.name) + ' ' + a.start + '–' + a.end + '，开始了吗？</b>' +
        (p ? '<div class="row sm"><span class="grow">上一项「' + esc(p.name) + '」做完了吗？</span>' + (S.actual[p.id] && S.actual[p.id].status === 'done' ? chip('已记做完', 'green') : '<button class="btn sm light" data-act="prevDone" data-id="' + p.id + '">做完了</button>') + '</div>' : '') +
        (S.actual[a.id] ? chip(S.actual[a.id].status === 'running' ? '已开始 ' + S.actual[a.id].start : '已记录', 'green') :
          '<div class="two"><button class="btn primary sm" data-act="nStart" data-id="' + a.id + '">开始</button><button class="btn line sm" data-act="nLater" data-id="' + a.id + '">晚 15 分钟</button><button class="btn line sm" data-act="nSkip" data-id="' + a.id + '">跳过</button></div>') +
        (S.reply === n.id || n.result ? '' : '<button class="sm" style="text-align:left;color:var(--accent-dark)" data-act="openReply" data-id="' + a.id + '">长按回复一句话 ›</button>') + reply + res + '</div>';
    }).join('');
    return sbar(true) + '<div class="body" style="gap:12px"><div class="lockclock">' + hhmm(S.min) + '</div><div class="lockdate">' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + WEEK[d.getDay()] + '</div><div style="flex:1"></div>' +
      (cards || '<div class="xs" style="text-align:center;color:#fff;opacity:.7">没有通知。到了标了铃铛的活动时间会在这里提醒。</div>') + (S.busy ? '<div class="xs" style="color:#fff">正在理解…</div>' : '') + '</div>';
  }
  function homeHTML(){
    var cur = current(), nx = nextOne();
    var learn = S.day.filter(function(a){ return a.cat === 'learn' && tracked(a); }), ld = learn.filter(function(a){ return statusOf(a) === 'done'; });
    return sbar(true) + '<div class="body" style="gap:18px;padding-top:20px"><div class="widget"><span class="xs">' + (cur ? '现在 · ' + cur.start + '–' + cur.end : '现在没有安排') + '</span>' +
      (cur ? '<div class="row"><span class="bar" style="height:26px;background:' + color(cur) + '"></span><b class="grow" style="font-size:17px">' + esc(cur.name) + '</b>' + (statusOf(cur) === 'done' ? chip('已完成', 'green') : '<button class="tick" data-act="widgetDone" data-id="' + cur.id + '">' + IC.check + '</button>') + '</div>' : '') +
      '<div class="row sm" style="border-top:1px solid var(--line);padding-top:8px"><span class="xs">下一项</span><b>' + (nx ? nx.start + ' ' + esc(nx.name) : '没有了') + '</b></div></div>' +
      '<div class="row" style="gap:18px;align-items:flex-start"><div class="widget" style="width:150px;height:150px"><span class="xs">今日学习</span><span style="font:600 46px var(--serif);color:var(--accent-dark)">' + ld.length + '/' + learn.length + '</span><span class="xs">' + esc(ld.map(function(a){ return a.name; }).slice(0, 2).join('、') || '还没开始') + '</span></div>' +
      '<div class="appicons"><i style="background:#D9A24A"></i><i style="background:#4A88D9"></i><i style="background:#D96A4A"></i><i style="background:var(--accent);display:grid;place-items:center;color:#fff;font:600 22px var(--serif)" data-view="app">簿</i></div></div>' +
      '<div class="xs" style="color:#fff;opacity:.75">在小组件上打勾会直接写入实际记录，不用打开 App。</div></div>';
  }

  // ---------- 引导情景 ----------
  var SC = {
    remind: {title:'① 到点提醒，记下实际', steps:[
      {text:'现在是晚上 19:50。右边是你的手机。「英语听力」20:00 开始，标了铃铛会提醒。点【快进到 20:00】。', ff:'20:00', wait:'notify'},
      {text:'手机锁屏收到通知：<b>一个活动只推 1 条</b>，顺带问上一项做完没有，不再单独推结束。点通知里的【开始】。', target:'[data-act=nStart]', wait:'started'},
      {text:'实际开始时间记下了。点上方的【App】回到 App。', target:'[data-view=app]', wait:'view:app'},
      {text:'首页「现在」卡片显示英语听力进行中。假设听完了，点【完成】。', target:'[data-act=finish]', wait:'finished'},
      {text:'点底部【我的】→【计划 vs 实际】，看看今天记了什么。', target:'[data-go=me]', wait:'go:actual'},
      {text:'🎉 计划和实际并排对比；<b>没记录的不猜</b>，也不计入优化统计。2 周后 V1.1 会用这些记录给出优化建议。', end:true}
    ]},
    say: {title:'② 一句话改日程', steps:[
      {text:'在首页输入框说一句话。点示例【晚上九点到十点加个复习，散步不去了】。这一步调用真实的 DeepSeek。', target:'[data-say]', wait:'plan'},
      {text:'<b>模型只把这句话翻译成操作，时间怎么排由规则决定</b>。确认前什么都不会改。点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'🎉 时间轴更新了，改动的项会高亮；7 秒内可以撤销。也可以点麦克风试试「随手记」。', end:true}
    ]},
    interrupt: {title:'③ 被打断一键重排', steps:[
      {text:'先点【快进到 20:00】，在锁屏通知里点【开始】，再点上方【App】。', ff:'20:00', wait:'started'},
      {text:'点上方【App】回到首页。', target:'[data-view=app]', wait:'view:app'},
      {text:'假设临时来了电话。点「现在」卡片里的【被打断了】。', target:'[data-go=interrupt]', wait:'go:interrupt'},
      {text:'选耽误了多久。点【45 分钟】。', target:'[data-delay="45"]', wait:'plan'},
      {text:'后面的安排按规则让位：已开始和睡觉时间不动，放不下先压缩运动和护理。点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'🎉 完成。和网页版是同一套顺延规则，App 里只是变成了一个按钮。', end:true}
    ]},
    inbox: {title:'④ 收件箱与排明天', steps:[
      {text:'点底部【收件箱】。', target:'[data-go=inbox]', wait:'go:inbox'},
      {text:'想到就丢进来，不用马上决定什么时候做。点「给导师回邮件」的【找个空档】。', target:'[data-place=i2]', wait:'plan'},
      {text:'规则按截止日和空档给出位置，先预览。点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'再试试一句话排一天。回到【今天】，点示例【排明天】。', target:'[data-go=today]', wait:'go:planDay'},
      {text:'点【拆一下】：AI 拆出任务、估计时长（标「AI 估计」，可以改）。', target:'[data-act=split]', wait:'split'},
      {text:'点【按规则排进明天】，规则把任务放进明天模板的空档。', target:'[data-act=placeDay]', wait:'plan'},
      {text:'点【确认改】。', target:'[data-act=apply]', wait:'applied'},
      {text:'🎉 完成。AI 负责拆和估时长，放在哪由规则决定。', end:true}
    ]},
    reply: {title:'⑤ 通知里直接回复', steps:[
      {text:'点【快进到 20:00】。', ff:'20:00', wait:'notify'},
      {text:'这次不想听英语了。点通知里的【长按回复一句话】。', target:'[data-act=openReply]', wait:'openReply'},
      {text:'点示例【今晚不听了，改成复习一小时】，或者自己输入后点发送。', target:'[data-reply]', wait:'replied'},
      {text:'🎉 不打开 App 就改好了，通知里留有撤销入口。', end:true}
    ]},
    evening: {title:'⑥ 晚间核对', steps:[
      {text:'没标提醒的活动（比如散步）靠打勾和晚间核对记录。点【快进到 21:45】。', ff:'21:45', wait:'evening'},
      {text:'每晚只推 1 条「今天的核对」。点【去核对】。', target:'[data-act=openEvening]', wait:'go:evening'},
      {text:'逐项选做了或没做，然后点【一起确认】。', target:'[data-act=evening]', wait:'evening:done'},
      {text:'🎉 记录覆盖率提高了；当天结束仍没记录的标为「没记录」，不猜。', end:true}
    ]},
    free: {title:'自由体验', steps:[]}
  };
  function emit(ev){ var st = SC[S.sc].steps[S.step]; if(st && st.wait === ev) S.step++; }
  function guideHTML(){
    var sc = SC[S.sc], st = sc.steps[S.step];
    var tabsH = Object.keys(SC).map(function(k){ return '<button class="sc ' + (k === S.sc ? 'on' : '') + '" data-sc="' + k + '">' + SC[k].title + '</button>'; }).join('');
    var box = S.sc === 'free' ? '<p>随意操作：用下面的按钮推进时间；在「我的」里能看到所有页面，包括 V1.1、V1.2 的规划页。</p>'
      : '<div class="stepno">第 ' + (S.step + 1) + ' 步 / 共 ' + sc.steps.length + ' 步</div><p>' + st.text + '</p>' + (st.ff ? '<button class="primary" data-ff="' + st.ff + '" id="g-ff">⏩ 快进到 ' + st.ff + '</button>' : '') + (st.end ? '<button class="primary" data-act="restart">↺ 再来一遍</button>' : '');
    return '<div class="sc-row">' + tabsH + '</div><div class="stepbox">' + box + '</div><div class="timebar"><span>🕗 现在 <b>' + hhmm(S.min) + '</b></span><button data-plus="15">+15 分钟</button><button data-ff="21:45">晚间核对 21:45</button><button data-act="restart">↺ 重新开始</button></div>' +
      '<div class="principle"><b>模型理解、规则决定。</b>大模型只把话翻译成操作、把统计写成人话；时间怎么排、目标怎么算由规则决定；所有改动先预览、确认才写入。理解和排程复用网页版的同一套规则。</div>';
  }

  // ---------- 渲染 ----------
  function render(){
    if(!S) return;
    $('#guide').innerHTML = guideHTML();
    $('#viewbar').innerHTML = [['app', 'App'], ['lock', '锁屏通知' + (S.notifs.length ? ' · ' + S.notifs.length : '')], ['home', '桌面小组件']].map(function(v){ return '<button data-view="' + v[0] + '" class="' + (S.view === v[0] ? 'on' : '') + '">' + v[1] + '</button>'; }).join('');
    var scr = $('#screen'), keepScroll = scr.querySelector('.body') ? scr.querySelector('.body').scrollTop : 0;
    var html, dark = false;
    if(S.view === 'lock'){ html = lockHTML(); dark = true; }
    else if(S.view === 'home'){ html = homeHTML(); dark = true; }
    else { html = (SCREENS[S.screen] || SCREENS.today)(); dark = !!(SCREENS[S.screen] || {}).dark; }
    scr.className = 'screen' + (dark ? ' wall' : '');
    if(S.screen === 'focus' && S.view === 'app') scr.style.background = 'var(--dark)'; else scr.style.background = '';
    scr.innerHTML = html;
    if(scr.querySelector('.body') && S.lastScreen === S.view + S.screen) scr.querySelector('.body').scrollTop = keepScroll;
    S.lastScreen = S.view + S.screen;
    var st = SC[S.sc].steps[S.step];
    if(st && st.target){ var el = document.querySelector(st.target); if(el) el.classList.add('pulse'); }
  }
  function toast(msg, undo){
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button>撤销</button>' : '');
    t.hidden = false;
    if(undo) t.querySelector('button').onclick = function(){ undo(); t.hidden = true; };
    clearTimeout(toastTimer); toastTimer = setTimeout(function(){ t.hidden = true; }, 7000);
  }
  function go(screen){ S.view = 'app'; S.screen = screen; S.msg = ''; emit('go:' + screen); render(); }
  function start(sc){ fresh(); S.sc = sc; S.step = 0; $('#toast').hidden = true; render(); }

  // ---------- 交互 ----------
  document.addEventListener('click', function(e){
    var el = e.target.closest('[data-act],[data-go],[data-view],[data-sc],[data-ff],[data-plus],[data-say],[data-delay],[data-place],[data-bell],[data-perm],[data-ev],[data-reply],[data-slot]');
    if(!el || !S) return;
    var d = el.dataset;
    if(d.sc) return start(d.sc);
    if(d.view){ S.view = d.view; emit('view:' + d.view); return render(); }
    if(d.go) return go(d.go);
    if(d.ff) return tick(toMin(d.ff));
    if(d.plus) return tick(S.min + (+d.plus));
    if(d.say) return understand(d.say, d.title || '一句话改日程');
    if(d.delay) return E && (function(){ var res = clone(E.plan([{op:'delay', minutes:+d.delay}], data(), S.min)); if(!res.changes.length){ S.msg = '后面没有需要让位的安排。'; return go('interrupt'); } openPlan('耽误了 ' + d.delay + ' 分钟，后面顺延', '被打断了', res, 'interrupt'); })();
    if(d.place) return placeInbox(d.place);
    if(d.bell){ S.remind[d.bell] = !S.remind[d.bell]; return render(); }
    if(d.perm){ S.perm[d.perm] = !S.perm[d.perm]; return render(); }
    if(d.ev){ var p = d.ev.split('|'); S.evening[p[0]] = S.evening[p[0]] === p[1] ? '' : p[1]; return render(); }
    if(d.reply){ var inp = $('#replyText'); if(inp) inp.value = d.reply; return sendReply(S.reply, d.reply); }
    if(d.slot){
      var a = byId(d.slot), stt = a && statusOf(a);
      if(stt === 'none'){ markDone(a, a.start, a.end); toast('「' + a.name + '」记为按计划完成', function(){ delete S.actual[a.id]; projectTick(a, -1); render(); }); render(); }
      return;
    }
    switch(d.act){
      case 'restart': return start(S.sc);
      case 'start': S.actual[d.id] = {status:'running', start:hhmm(S.min)}; emit('started'); break;
      case 'finish': markDone(byId(d.id)); emit('finished'); toast('已完成，实际时间已记录'); break;
      case 'nStart':
        S.actual[d.id] = {status:'running', start:hhmm(S.min)};
        emit('started'); break;
      case 'nLater': S.snooze[d.id] = S.min + 15; S.notifs = S.notifs.filter(function(n){ return n.id !== d.id; }); S.pushed = Math.max(0, S.pushed - 1); toast('15 分钟后再提醒'); break;
      case 'nSkip': S.actual[d.id] = {status:'skip'}; toast('已记为跳过'); break;
      case 'prevDone': var pa = byId(d.id); markDone(pa, S.actual[pa.id] && S.actual[pa.id].start || pa.start, pa.end); break;
      case 'openReply': S.reply = d.id; emit('openReply'); break;
      case 'reply': return sendReply(d.id, ($('#replyText') || {}).value || '');
      case 'undoReply':
        if(S.undo){ S.day = S.undo.day; S.projects = S.undo.projects; S.template = S.undo.template; S.undo = null; }
        S.notifs.forEach(function(n){ if(n.type === 'result') n.undone = true; }); toast('已撤销'); break;
      case 'openEvening': S.notifs = S.notifs.filter(function(n){ return n.type !== 'evening'; }); return go('evening');
      case 'evening':
        Object.keys(S.evening).forEach(function(id){ var x = byId(id); if(!x || !S.evening[id]) return; if(S.evening[id] === 'done') markDone(x, x.start, x.end); else S.actual[id] = {status:'skip'}; });
        S.evening = {}; emit('evening:done'); toast('核对好了'); return go('today');
      case 'apply': applyRes(S.plan.res); var back = S.plan.back === 'interrupt' || S.plan.back === 'planDay' ? 'today' : S.plan.back; S.plan = null; emit('applied'); return go(back);
      case 'listen': return listen();
      case 'split':
        S.dayText = ($('#dayText') || {}).value || S.dayText; S.msg = '正在拆…'; render();
        return splitTasks(S.dayText).then(function(r){ S.split = r; S.msg = ''; emit('split'); render(); });
      case 'placeDay':
        if(!S.split) return;
        var day = /后天/.test(S.dayText) ? '后天' : /今天|今晚/.test(S.dayText) ? null : '明天';
        // 按类别给一个时间窗口：学习放下午，运动放傍晚，工作放上午，生活放午饭前后；窗口里放不下时规则压缩或顺延
        var WIN = {learn:['13:30', '18:00'], exercise:['18:00', '22:00'], work:['09:50', '12:00'], life:['17:00', '22:00']};
        // 长的任务先找空档，短的再填缝
        var ops = S.split.tasks.slice().sort(function(x, y){ return y.minutes - x.minutes; }).map(function(t){ var wv = WIN[t.cat] || WIN.life, o = {op:'add', name:t.name, cat:t.cat, minutes:t.minutes, after:wv[0], before:wv[1]}; if(day) o.day = day; else { o.after = hhmm(S.min); delete o.before; } return o; });
        var res = clone(E.plan(ops, data(), S.min));
        if(!res.changes.length){ S.msg = res.warnings.join(' ') || '没排进去。'; return render(); }
        return openPlan(S.dayText, '排' + (day || '今天'), res, 'planDay');
      case 'inboxAdd':
        var tx = (($('#inboxText') || {}).value || '').trim(); if(!tx) return;
        S.msg = ''; render();
        return splitTasks(tx).then(function(r){
          r.tasks.forEach(function(t){ S.inbox.unshift({id:'i' + Date.now() + Math.random().toString(36).slice(2, 5), title:t.name, due:/今天/.test(tx) ? '今天' : /周[一二三四五六日天]|明天|后天/.test(tx) ? (tx.match(/周[一二三四五六日天]|明天|后天/)[0] + '截止') : '不急', minutes:t.minutes, cat:t.cat}); });
          render();
        });
      case 'widgetDone': markDone(byId(d.id)); toast('已记录完成'); break;
      default: return;
    }
    render();
  });
  document.addEventListener('keydown', function(e){
    if(e.key !== 'Enter' || !S) return;
    if(e.target.id === 'aiText') understand(e.target.value);
    if(e.target.id === 'replyText') sendReply(S.reply, e.target.value);
  });
  document.addEventListener('change', function(e){
    if(e.target.dataset && e.target.dataset.dur && S.split) S.split.tasks[+e.target.dataset.dur].minutes = +e.target.value;
  });

  function sendReply(id, text){
    if(!text.trim()) return;
    var before = {day:clone(S.day), projects:clone(S.projects), template:clone(S.template)};
    var a = byId(id) || {name:'', start:'', end:''};
    understand(text, '通知回复', function(res){
      Object.keys(res.days).forEach(function(k){ if(k === S.today) S.day = res.days[k]; else S.days[k] = res.days[k]; });
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
    var o = {op:'add', name:x.title, cat:x.cat, minutes:x.minutes, after: today ? hhmm(S.min) : '08:00'};
    if(!today) o.day = /周[一二三四五六日天]/.test(x.due) ? x.due.replace('截止', '') : '明天';
    var res = clone(E.plan([o], data(), S.min));
    if(!res.changes.length){ S.msg = res.warnings.join(' ') || '没找到合适的空档。'; return render(); }
    var add = res.changes.filter(function(c){ return c.type === 'add'; })[0];
    if(add) x.sug = (add.dateKey && add.dateKey !== S.today ? E.dayLabel(add.dateKey) : '今天') + ' ' + hhmm(add.after[0]) + '–' + hhmm(add.after[1]);
    S.inbox = S.inbox.filter(function(i){ return i.id !== id; });
    openPlan('收件箱：' + x.title + '（约 ' + x.minutes + ' 分钟' + (x.due ? '，' + x.due : '') + '）', '放进日程', res, 'inbox');
  }
  // 浏览器自带语音识别：边说边显示；出错时说清原因，并保留示例句子作为备用
  var rec = null;
  var VOICE_ERR = {
    'not-allowed':'没有麦克风权限：点地址栏左边的图标，允许使用麦克风后再试。',
    'service-not-allowed':'浏览器不允许使用语音识别服务，可以换 Edge 试试，或者点下面的示例。',
    'network':'语音识别服务连不上。Chrome 的语音识别要连谷歌服务器，国内常常连不上；可以换 Edge 打开，或者点下面的示例。',
    'no-speech':'没听到声音：检查一下麦克风，再按一次说。',
    'audio-capture':'没找到麦克风：检查一下电脑的麦克风设置。'
  };
  function listen(){
    if(rec){ rec.stop(); return; } // 正在听时再按一下就结束
    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!R){ S.voiceMsg = '当前浏览器不支持语音识别，可以用 Chrome 或 Edge 打开，或者点下面的示例。'; return render(); }
    var heard = '', failed = false;
    try{
      rec = new R(); rec.lang = 'zh-CN'; rec.interimResults = true; rec.continuous = false;
      rec.onresult = function(ev){
        heard = ''; for(var k = 0; k < ev.results.length; k++) heard += ev.results[k][0].transcript;
        S.voiceText = heard; render();
      };
      rec.onerror = function(ev){ failed = true; S.voiceMsg = VOICE_ERR[ev.error] || ('语音识别出错（' + ev.error + '），可以点下面的示例。'); };
      rec.onend = function(){
        rec = null; S.listening = false;
        if(heard.trim()){ S.voiceMsg = ''; S.voiceText = ''; understand(heard, '随手记'); return; }
        if(!failed) S.voiceMsg = '没听清，再按一次说，或者点下面的示例。';
        render();
      };
      S.listening = true; S.voiceText = ''; S.voiceMsg = ''; render(); rec.start();
    }catch(err){ rec = null; S.listening = false; S.voiceMsg = '语音识别启动失败，可以点下面的示例。'; render(); }
  }

  // ---------- 启动：等规则引擎加载 ----------
  var frame = $('#engine');
  function boot(){
    try{ E = frame.contentWindow.__sansanEngine; }catch(err){ E = null; }
    if(!E){ $('#screen').innerHTML = '<div class="body"><p>规则引擎没有加载成功，请刷新页面。</p></div>'; return; }
    start('remind');
  }
  if(frame.contentWindow && frame.contentWindow.__sansanEngine) boot(); else frame.addEventListener('load', boot);
})();
