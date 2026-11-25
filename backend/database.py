import json
import math
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from .models import Station, utcnow


def distance_miles(lat1, lon1, lat2, lon2):
    a, b = math.radians(lat1), math.radians(lat2)
    h = math.sin((b-a)/2)**2 + math.cos(a)*math.cos(b)*math.sin(math.radians(lon2-lon1)/2)**2
    return 3958.7613 * 2 * math.asin(min(1, math.sqrt(h)))


class Database:
    def __init__(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS stations (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS history (
                    station_id TEXT NOT NULL, fuel TEXT NOT NULL, price REAL NOT NULL,
                    observed_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                    PRIMARY KEY(station_id, fuel, observed_at));
                CREATE INDEX IF NOT EXISTS history_lookup ON history(station_id, fuel, observed_at);
                CREATE UNIQUE INDEX IF NOT EXISTS history_daily ON history(station_id, fuel, substr(observed_at,1,10));
                CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS geocache (query TEXT PRIMARY KEY, payload TEXT, created REAL);
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def meta(self, key):
        with self.connect() as db:
            row = db.execute("SELECT value FROM meta WHERE key=?", (key,)).fetchone()
        return row[0] if row else None

    def snapshot(self, stations: list[Station], observed_at=None):
        observed_at = observed_at or utcnow()
        with self.connect() as db:
            db.execute("DELETE FROM stations")
            for s in stations:
                db.execute("INSERT INTO stations VALUES (?,?)", (s.id, s.model_dump_json()))
                for p in s.prices:
                    db.execute("""INSERT INTO history VALUES (?,?,?,?,?) ON CONFLICT DO UPDATE SET
                               price=excluded.price, observed_at=excluded.observed_at, updated_at=excluded.updated_at""",
                               (s.id, p.fuel, p.price, observed_at, p.updated_at.isoformat()))
            since = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
            db.execute('DELETE FROM history WHERE observed_at < ?', (since,))
            db.execute("INSERT OR REPLACE INTO meta VALUES ('last_success',?)", (observed_at,))

    def stations(self):
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute("SELECT payload FROM stations")]

    def search(self, lat, lon, radius, fuel, sort):
        found = []
        for station in self.stations():
            if station['closed']:
                continue
            price = next((p for p in station['prices'] if p['fuel'] == fuel), None)
            if not price:
                continue
            distance = distance_miles(lat, lon, station['latitude'], station['longitude'])
            if distance <= radius:
                found.append({**station, 'distance': round(distance, 2), **price})
        found.sort(key=lambda s: (s[sort], s['distance'] if sort == 'price' else s['price'], s['id']))
        return found

    def history(self, station_id, fuel, days):
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        with self.connect() as db:
            # Last observation of each UTC day, not a fabricated/interpolated series.
            rows = db.execute("""SELECT substr(observed_at,1,10) AS date, price FROM history
                WHERE station_id=? AND fuel=? AND observed_at>=?
                GROUP BY substr(observed_at,1,10) HAVING observed_at=MAX(observed_at)
                ORDER BY date""", (station_id, fuel, since)).fetchall()
        return [dict(r) for r in rows]
