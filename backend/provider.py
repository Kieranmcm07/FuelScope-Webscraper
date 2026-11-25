"""Fuel Finder read-only adapter. Contract sources are recorded in docs/API.md."""
import asyncio
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

from .models import Price, Station


class ProviderError(Exception):
    pass


class RateLimited(ProviderError):
    def __init__(self, seconds):
        self.seconds = seconds
        super().__init__('Fuel Finder rate limit reached. Refresh is paused; cached prices remain available.')


def retry_after(value):
    try:
        return max(60, float(value))
    except (TypeError, ValueError):
        try:
            return max(60, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return 300


def records(payload):
    # The official schema specifies {data: [...]}; its examples show a bare array.
    result = payload if isinstance(payload, list) else payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(result, list) or any(not isinstance(r, dict) for r in result):
        raise ProviderError('Fuel Finder returned an unexpected response. Cached data has been retained.')
    return result


def normalize(stations, prices):
    price_map = {p['node_id']: p.get('fuel_prices', []) for p in prices}
    result = []
    for s in stations:
        loc = s['location']
        valid_prices = []
        for p in price_map.get(s['node_id'], []):
            fuel = p['fuel_type'].upper()
            if fuel not in {'E10', 'E5', 'B7_STANDARD'} or p.get('price') is None:
                continue
            # Zero means no usable price; never show it as the cheapest fuel.
            if float(p['price']) == 0:
                continue
            date = datetime.fromisoformat(p['price_last_updated'].replace('Z', '+00:00'))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            valid_prices.append(Price(fuel=fuel, price=p['price'], updated_at=date))
        if loc.get('latitude') is None or loc.get('longitude') is None:
            continue
        result.append(Station(
            id=s['node_id'], name=s['trading_name'], brand=s.get('brand_name') or 'Independent',
            address=', '.join(str(loc[k]) for k in ['address_line_1','address_line_2','city'] if loc.get(k)),
            city=loc.get('city') or '', postcode=loc.get('postcode') or '',
            latitude=loc['latitude'], longitude=loc['longitude'],
            closed=bool(s.get('temporary_closure') or s.get('permanent_closure')),
            amenities=s.get('amenities') or [], opening_times=s.get('opening_times') or {}, prices=valid_prices))
    if not result or not any(s.prices for s in result):
        raise ProviderError('No usable Fuel Finder data was returned. Cached data has been retained.')
    return result


class FuelFinder:
    def __init__(self, settings, client):
        self.settings, self.client = settings, client
        self.token = None
        self.token_expires = 0
        self.last_request = 0
        self.station_cache = None
        self.station_cache_time = 0

    async def request(self, method, path, **kwargs):
        # The sync worker is the only caller. No overlapping requests, including auth.
        for attempt in range(3):
            await asyncio.sleep(max(0, 1.05 - (time.monotonic()-self.last_request)))
            self.last_request = time.monotonic()
            try:
                response = await self.client.request(method, self.settings.base_url + path, **kwargs)
            except httpx.RequestError:
                if attempt == 2:
                    raise ProviderError('Fuel Finder could not be reached. Cached prices remain available.') from None
                await asyncio.sleep(2 ** (attempt+1))
                continue
            if response.status_code == 429:
                raise RateLimited(retry_after(response.headers.get('Retry-After')))
            if response.status_code >= 500:
                if attempt == 2:
                    raise ProviderError('Fuel Finder is temporarily unavailable. Cached prices remain available.')
                await asyncio.sleep(2 ** (attempt+1))
                continue
            return response
        raise ProviderError('Fuel Finder request failed.')

    async def authenticate(self):
        response = await self.request('POST', '/api/v1/oauth/generate_access_token', json={
            'client_id': self.settings.client_id, 'client_secret': self.settings.client_secret})
        if response.status_code != 200:
            raise ProviderError('Fuel Finder authentication failed. Check the server credentials and account access.')
        payload = response.json()['data']
        self.token = payload['access_token']
        self.token_expires = time.monotonic() + max(0, int(payload['expires_in'])-60)

    async def pages(self, path):
        collected, seen = [], set()
        for batch in range(1, 1001):
            if not self.token or time.monotonic() >= self.token_expires:
                await self.authenticate()
            response = await self.request('GET', path, params={'batch-number': batch},
                                          headers={'Authorization': f'Bearer {self.token}'})
            if response.status_code == 401:
                await self.authenticate()
                response = await self.request('GET', path, params={'batch-number': batch},
                                              headers={'Authorization': f'Bearer {self.token}'})
            if response.status_code == 404 and collected:
                return collected
            if response.status_code != 200:
                raise ProviderError(f'Fuel Finder data request failed (HTTP {response.status_code}). Cached data retained.')
            page = records(response.json())
            # Only documented 404 terminates a full fetch. Empty successful pages
            # are treated as incomplete, never silently published as a full snapshot.
            if not page:
                raise ProviderError('Fuel Finder returned an empty batch. The previous snapshot has been retained.')
            ids = {r['node_id'] for r in page}
            if not ids - seen:
                raise ProviderError('Fuel Finder repeated a batch. The previous snapshot has been retained.')
            collected.extend(r for r in page if r['node_id'] not in seen)
            seen.update(ids)
        raise ProviderError('Fuel Finder pagination exceeded the safety limit.')

    async def fetch(self):
        if self.station_cache is None or time.monotonic()-self.station_cache_time >= 3600:
            self.station_cache = await self.pages('/api/v1/pfs')
            self.station_cache_time = time.monotonic()
        prices = await self.pages('/api/v1/pfs/fuel-prices')
        return normalize(self.station_cache, prices)
