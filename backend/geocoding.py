import asyncio
import json
import re
import time
from urllib.parse import quote

import httpx

from .demo import CITIES


class Geocoder:
    def __init__(self, db, settings, client):
        self.db, self.settings, self.client = db, settings, client
        self.lock = asyncio.Lock()
        self.last_request = 0

    async def search(self, query):
        query = query.strip()
        key = query.lower()
        for name, (lat, lon) in CITIES.items():
            if key == name.lower():
                return [{'name': name, 'latitude': lat, 'longitude': lon}]
        async with self.lock:
            with self.db.connect() as db:
                cached = db.execute('SELECT payload, created FROM geocache WHERE query=?', (key,)).fetchone()
            if cached and time.time()-cached[1] < 86400*30:
                return json.loads(cached[0])
            await asyncio.sleep(max(0, 1-(time.monotonic()-self.last_request)))
            self.last_request = time.monotonic()
            compact = re.sub(r'\s+', '', query).upper()
            is_postcode = bool(re.fullmatch(r'[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}', compact))
            path = '/postcodes/' + quote(compact) if is_postcode else '/places'
            response = await self.client.get(self.settings.geocoder_url + path,
                                             params=None if is_postcode else {'q': query, 'limit': 8})
            if response.status_code == 404:
                return []
            response.raise_for_status()
            raw = response.json()['result']
            raw = [raw] if is_postcode and raw else raw or []
            results = [{'name': (r['postcode'] if is_postcode else ', '.join(filter(None, [r['name_1'], r.get('county_unitary')]))),
                        'latitude': float(r['latitude']), 'longitude': float(r['longitude'])}
                       for r in raw if r.get('latitude') is not None and r.get('longitude') is not None]
            with self.db.connect() as db:
                db.execute('INSERT OR REPLACE INTO geocache VALUES (?,?,?)', (key, json.dumps(results), time.time()))
            return results
