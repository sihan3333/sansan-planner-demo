-- 和 ../app.py 的 init_db 一致
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    anon_id     TEXT NOT NULL,
    type        TEXT NOT NULL,
    ts          TEXT NOT NULL,
    received_at TEXT NOT NULL,
    simulated   INTEGER NOT NULL DEFAULT 0,
    data        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, ts);

CREATE TABLE IF NOT EXISTS day_snapshots (
    anon_id    TEXT NOT NULL,
    date       TEXT NOT NULL,
    items      TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    simulated  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (anon_id, date)
);
