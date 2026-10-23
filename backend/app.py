"""三三作息簿 · 数据后端（FastAPI + SQLite）

做三件事：
1. POST /api/events  接收网页发来的使用事件（AI 请求、方案采纳/取消/撤销、打勾完成、当天日程快照）
2. GET  /api/stats   把事件汇总成指标：方案采纳率、撤销率、应用后手动修改率、各类活动完成率、待复盘样本
3. GET  /dashboard   数据看板页面

本地运行：
    pip install -r requirements.txt
    uvicorn app:app --port 8001 --reload
然后打开 http://localhost:8001/dashboard
"""

import json
import os
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse

HERE = Path(__file__).parent
DB_PATH = Path(os.environ.get("SANSAN_DB", HERE / "sansan.db"))
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "https://sihan3333.github.io,http://localhost:8000,http://127.0.0.1:8000"
).split(",")

EVENT_TYPES = {
    "ai_request",      # 用户说了一句话，模型/规则理解出了什么
    "ai_no_ops",       # 没理解出任何可执行的指令
    "plan_shown",      # 弹出了调整方案
    "plan_applied",    # 用户点了「按这个方案调整」
    "plan_cancelled",  # 用户取消了方案
    "plan_undone",     # 应用后又撤销
    "edit_after_ai",   # 应用后 5 分钟内又手动改了当天日程（隐性的理解错误）
    "activity_toggled",# 打勾 / 取消打勾
    "day_snapshot",    # 当天日程的最新状态，用来算完成率
    "suggestion_accepted",   # 「发现了几件事」里的建议被采纳（落后调整 / 更新模板）
    "suggestion_dismissed",  # 建议被忽略
}
MAX_BODY = 64 * 1024
MAX_EVENTS = 50

app = FastAPI(title="三三作息簿 · 数据后端")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with closing(db()) as conn, conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                anon_id     TEXT NOT NULL,
                type        TEXT NOT NULL,
                ts          TEXT NOT NULL,      -- 网页端的发生时间（ISO）
                received_at TEXT NOT NULL,
                simulated   INTEGER NOT NULL DEFAULT 0,
                data        TEXT NOT NULL       -- JSON
            );
            CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);

            CREATE TABLE IF NOT EXISTS day_snapshots (
                anon_id    TEXT NOT NULL,
                date       TEXT NOT NULL,       -- 日程所属日期 YYYY-MM-DD
                items      TEXT NOT NULL,       -- JSON: [{name, cat, start, end, done}]
                updated_at TEXT NOT NULL,
                simulated  INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (anon_id, date)
            );
            """
        )


init_db()


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@app.get("/")
def root():
    return RedirectResponse("/dashboard")


@app.get("/dashboard")
def dashboard():
    return FileResponse(HERE / "dashboard.html")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/events")
async def post_events(request: Request):
    # 网页用 text/plain 发送（不触发 CORS 预检，也不会拖慢页面），这里自己解析 JSON
    raw = await request.body()
    if len(raw) > MAX_BODY:
        raise HTTPException(413, "too_large")
    try:
        body = json.loads(raw)
    except ValueError:
        raise HTTPException(400, "bad_json")

    anon_id = str(body.get("anon_id") or "")[:64]
    events = body.get("events")
    if not anon_id or not isinstance(events, list) or not events or len(events) > MAX_EVENTS:
        raise HTTPException(400, "bad_events")

    simulated = 1 if anon_id.startswith("sim-") else 0
    received = now_iso()
    stored = 0
    with closing(db()) as conn, conn:
        for e in events:
            if not isinstance(e, dict) or e.get("type") not in EVENT_TYPES:
                continue
            data = e.get("data") if isinstance(e.get("data"), dict) else {}
            ts = str(e.get("ts") or received)[:40]
            if e["type"] == "day_snapshot":
                date, items = data.get("date"), data.get("items")
                if not isinstance(date, str) or not isinstance(items, list):
                    continue
                conn.execute(
                    """INSERT INTO day_snapshots (anon_id, date, items, updated_at, simulated)
                       VALUES (?, ?, ?, ?, ?)
                       ON CONFLICT(anon_id, date) DO UPDATE SET items=excluded.items, updated_at=excluded.updated_at""",
                    (anon_id, date[:10], json.dumps(items, ensure_ascii=False), ts, simulated),
                )
            else:
                conn.execute(
                    "INSERT INTO events (anon_id, type, ts, received_at, simulated, data) VALUES (?, ?, ?, ?, ?, ?)",
                    (anon_id, e["type"], ts, received, simulated, json.dumps(data, ensure_ascii=False)),
                )
            stored += 1
    return {"stored": stored}


def ratio(a, b):
    return round(a / b, 4) if b else None


@app.get("/api/stats")
def stats(days: int = 30, include_sim: bool = False):
    days = max(1, min(days, 365))
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    since_date = since[:10]
    sim_clause = "" if include_sim else " AND simulated = 0"

    with closing(db()) as conn:
        rows = conn.execute(
            f"SELECT id, anon_id, type, ts, simulated, data FROM events WHERE ts >= ?{sim_clause} ORDER BY ts",
            (since,),
        ).fetchall()
        snaps = conn.execute(
            f"SELECT anon_id, date, items FROM day_snapshots WHERE date >= ?{sim_clause}",
            (since_date,),
        ).fetchall()
        counts = conn.execute(
            "SELECT simulated, COUNT(*) AS n FROM events GROUP BY simulated"
        ).fetchall()

    evs = [dict(r, data=json.loads(r["data"])) for r in rows]
    by_type = {}
    for e in evs:
        by_type.setdefault(e["type"], []).append(e)
    n = lambda t: len(by_type.get(t, []))

    requests = by_type.get("ai_request", [])
    src_count = {}
    for e in requests:
        s = e["data"].get("source") or "unknown"
        src_count[s] = src_count.get(s, 0) + 1
    llm = sum(v for k, v in src_count.items() if k in ("DeepSeek", "Claude"))
    latencies = sorted(e["data"].get("latency_ms") for e in requests if isinstance(e["data"].get("latency_ms"), (int, float)))
    p50 = latencies[len(latencies) // 2] if latencies else None

    applied_ids = {e["data"].get("plan_id") for e in by_type.get("plan_applied", [])}
    edited_ids = {e["data"].get("plan_id") for e in by_type.get("edit_after_ai", [])} & applied_ids
    undone_ids = {e["data"].get("plan_id") for e in by_type.get("plan_undone", [])} & applied_ids
    kept = len(applied_ids - edited_ids - undone_ids)

    kpis = {
        "users": len({e["anon_id"] for e in evs}),
        "requests": len(requests),
        "plans_shown": n("plan_shown"),
        "plans_applied": len(applied_ids),
        "adoption_rate": ratio(len(applied_ids), n("plan_shown")),
        "undo_rate": ratio(len(undone_ids), len(applied_ids)),
        "edit_after_rate": ratio(len(edited_ids), len(applied_ids)),
        # 真正「一次就对」：采纳了，而且之后没撤销、没手动再改
        "clean_success_rate": ratio(kept, n("plan_shown")),
        "not_understood_rate": ratio(n("ai_no_ops"), len(requests)),
        "llm_share": ratio(llm, len(requests)),
        "fallback_rate": ratio(src_count.get("local-fallback", 0), len(requests)),
        "latency_p50_ms": p50,
        # 系统主动发现的建议（落后提醒、更新模板），用户愿意采纳的比例
        "suggestion_accept_rate": ratio(n("suggestion_accepted"), n("suggestion_accepted") + n("suggestion_dismissed")),
        "suggestions_acted": n("suggestion_accepted") + n("suggestion_dismissed"),
    }

    # 每天的趋势
    daily = {}
    for e in evs:
        d = daily.setdefault(e["ts"][:10], {"date": e["ts"][:10], "requests": 0, "shown": 0, "applied": 0})
        if e["type"] == "ai_request":
            d["requests"] += 1
        elif e["type"] == "plan_shown":
            d["shown"] += 1
        elif e["type"] == "plan_applied":
            d["applied"] += 1
    for d in daily.values():
        d["adoption_rate"] = ratio(d["applied"], d["shown"])

    # 完成率：按分类、按时段（只看有时长的活动，睡眠不算）
    cat_stat, slot_stat, act_stat = {}, {}, {}
    for s in snaps:
        for it in json.loads(s["items"]):
            if not isinstance(it, dict) or it.get("cat") == "sleep" or it.get("start") == it.get("end"):
                continue
            if it.get("due") is False:  # 今天还没到时间的，不算没完成
                continue
            done = bool(it.get("done"))
            h = int(str(it.get("start", "0:0")).split(":")[0] or 0)
            slot = "上午" if h < 12 else ("下午" if h < 18 else "晚上")
            for table, key in ((cat_stat, it.get("cat") or "other"), (slot_stat, slot), (act_stat, it.get("name") or "")):
                t = table.setdefault(key, {"total": 0, "done": 0})
                t["total"] += 1
                t["done"] += done
    for table in (cat_stat, slot_stat, act_stat):
        for v in table.values():
            v["rate"] = ratio(v["done"], v["total"])
    weakest = sorted(
        ({"name": k, **v} for k, v in act_stat.items() if v["total"] >= 3),
        key=lambda x: (x["rate"], -x["total"]),
    )[:5]

    # 待复盘样本：被取消、被撤销、没听懂、应用后又手动改过的那几句话
    labels = {"plan_cancelled": "取消", "plan_undone": "撤销", "ai_no_ops": "没听懂", "edit_after_ai": "应用后手动修改"}
    bad = [
        {
            "id": e["id"], "kind": labels[e["type"]], "ts": e["ts"], "text": e["data"].get("text", ""),
            "source": e["data"].get("source", ""), "detail": e["data"].get("name") or e["data"].get("reply") or "",
            "simulated": bool(e["simulated"]),
        }
        for e in evs if e["type"] in labels
    ][-30:][::-1]

    sim_n = sum(r["n"] for r in counts if r["simulated"])
    real_n = sum(r["n"] for r in counts if not r["simulated"])
    return {
        "range_days": days,
        "include_sim": include_sim,
        "event_counts": {"real": real_n, "simulated": sim_n},
        "kpis": kpis,
        "sources": src_count,
        "daily": sorted(daily.values(), key=lambda d: d["date"]),
        "completion_by_cat": cat_stat,
        "completion_by_slot": slot_stat,
        "weakest_activities": weakest,
        "bad_cases": bad,
    }
