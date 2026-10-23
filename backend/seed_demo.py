"""生成「模拟数据」，只用来展示看板长什么样。

所有模拟数据的匿名 ID 都以 sim- 开头，数据库里标记 simulated=1，看板默认不计入，
勾选「包含模拟数据」才会显示，并带「模拟」标记。

    python seed_demo.py          # 生成最近 14 天的模拟数据（会先清掉旧的模拟数据）
    python seed_demo.py --clear  # 只清掉模拟数据
"""

import json
import random
import sys
from contextlib import closing
from datetime import datetime, timedelta, timezone

from app import db

random.seed(7)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # Windows 控制台默认编码打印不了中文

DAY = [  # name, cat, start, end, 基础完成概率
    ("起床缓一缓", "wake", "07:00", "07:20", 0.9),
    ("晨跑", "exercise", "08:00", "08:40", 0.55),
    ("背单词", "learn", "09:20", "09:50", 0.8),
    ("处理工作", "work", "09:50", "12:00", 0.92),
    ("午饭、午休", "life", "12:00", "13:30", 0.95),
    ("学编程", "learn", "13:30", "15:30", 0.7),
    ("读书", "learn", "15:30", "16:30", 0.6),
    ("数据分析", "learn", "16:30", "18:00", 0.35),
    ("晚饭", "life", "18:00", "19:00", 0.95),
    ("英语听力", "learn", "20:00", "20:45", 0.5),
    ("散步", "exercise", "20:45", "21:30", 0.45),
    ("洗漱、护肤", "care", "22:00", "22:45", 0.9),
]

SAYINGS = [  # 原话, 理解方式, 结果概率 (采纳, 取消, 没听懂)
    ("下午三点到五点加一个组会", "DeepSeek", (0.85, 0.12, 0.03)),
    ("耽误了40分钟，后面都顺延", "DeepSeek", (0.8, 0.17, 0.03)),
    ("今晚不去散步了，改成复习一小时", "DeepSeek", (0.82, 0.15, 0.03)),
    ("下午那个读书推到晚饭后", "DeepSeek", (0.7, 0.25, 0.05)),
    ("睡前加二十分钟冥想", "DeepSeek", (0.75, 0.2, 0.05)),
    ("下班后约朋友吃饭两个小时", "DeepSeek", (0.55, 0.4, 0.05)),
    ("把数据分析挪到上午", "DeepSeek", (0.6, 0.35, 0.05)),
    ("明天早上的晨跑取消", "local-fallback", (0.2, 0.3, 0.5)),
    ("这周都不想学编程了", "DeepSeek", (0.1, 0.3, 0.6)),
    ("三点开会一小时", "local", (0.7, 0.25, 0.05)),
]


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def main():
    with closing(db()) as conn, conn:
        conn.execute("DELETE FROM events WHERE simulated = 1")
        conn.execute("DELETE FROM day_snapshots WHERE simulated = 1")
        if "--clear" in sys.argv:
            print("已清除模拟数据")
            return

        users = ["sim-a1", "sim-b2", "sim-c3"]
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        n_events = 0

        def add(anon, typ, when, data):
            nonlocal n_events
            conn.execute(
                "INSERT INTO events (anon_id, type, ts, received_at, simulated, data) VALUES (?, ?, ?, ?, 1, ?)",
                (anon, typ, iso(when), iso(when), json.dumps(data, ensure_ascii=False)),
            )
            n_events += 1

        for back in range(13, -1, -1):
            date = today - timedelta(days=back)
            # 越往后，提示词和规则迭代过，采纳率略有提升
            boost = (13 - back) * 0.012
            for anon in users:
                if random.random() < 0.15:
                    continue
                items = []
                for name, cat, s, e, p in DAY:
                    if back == 0 and int(e[:2]) >= datetime.now().hour:
                        continue
                    items.append({"name": name, "cat": cat, "start": s, "end": e, "done": random.random() < p})
                conn.execute(
                    "INSERT OR REPLACE INTO day_snapshots (anon_id, date, items, updated_at, simulated) VALUES (?, ?, ?, ?, 1)",
                    (anon, date.strftime("%Y-%m-%d"), json.dumps(items, ensure_ascii=False), iso(date + timedelta(hours=23))),
                )
                for _ in range(random.randint(1, 4)):
                    text, source, (pa, pc, pn) = random.choice(SAYINGS)
                    if source == "DeepSeek" and random.random() < 0.08:
                        source = "local-fallback"
                    when = date + timedelta(hours=random.randint(8, 21), minutes=random.randint(0, 59))
                    if back == 0 and when > datetime.now():
                        continue
                    pid = "p%06d" % random.randint(0, 999999)
                    r = random.random()
                    pa = min(pa + boost, 0.97)
                    understood = r >= pn
                    add(anon, "ai_request", when, {"text": text, "source": source, "n_ops": int(understood),
                                                  "latency_ms": random.randint(700, 2200) if source == "DeepSeek" else random.randint(5, 40)})
                    if not understood:
                        add(anon, "ai_no_ops", when, {"text": text, "source": source})
                        continue
                    add(anon, "plan_shown", when, {"plan_id": pid, "text": text, "source": source, "n_changes": random.randint(1, 8)})
                    if random.random() < pa / (pa + pc):
                        add(anon, "plan_applied", when + timedelta(seconds=8), {"plan_id": pid, "text": text, "source": source})
                        x = random.random()
                        if x < 0.07:
                            add(anon, "plan_undone", when + timedelta(seconds=12), {"plan_id": pid, "text": text, "source": source, "seconds_after": 4})
                        elif x < 0.2:
                            add(anon, "edit_after_ai", when + timedelta(minutes=2), {"plan_id": pid, "text": text, "source": source,
                                                                                      "action": "edit", "name": "晚饭" if "吃饭" in text else "读书"})
                    else:
                        add(anon, "plan_cancelled", when + timedelta(seconds=6), {"plan_id": pid, "text": text, "source": source})
        print(f"已生成模拟数据：{n_events} 条事件，{len(users)} 个模拟用户")


if __name__ == "__main__":
    main()
