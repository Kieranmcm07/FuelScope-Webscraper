import asyncio
from dataclasses import replace
from datetime import datetime, timezone

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.config import Settings
from backend.database import Database, distance_miles
from backend.main import create_app
from backend.models import Price, Station
from backend.provider import FuelFinder, ProviderError, RateLimited, normalize, records, retry_after
from backend.service import SyncService


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path)


@pytest.fixture(scope='module')
def client(tmp_path_factory):
    with TestClient(create_app(Settings(data_dir=tmp_path_factory.mktemp('demo')))) as c:
        yield c


def test_demo_api_filters_summary_history_and_saved(client):
    status = client.get('/api/status').json()
    assert status['mode'] == 'demo' and status['last_success']
    data = client.get('/api/stations').json()
    stations = data['stations']
    assert len(stations) == 12
    assert [s['price'] for s in stations] == sorted(s['price'] for s in stations)
    assert data['average'] == round(sum(s['price'] for s in stations)/len(stations), 2)
    assert data['cheapest']['price'] == min(s['price'] for s in stations)
    assert all(s['id'].startswith('demo-') and 'fictional' in s['address'] for s in stations)
    distance = client.get('/api/stations?sort=distance&fuel=B7_STANDARD&radius=1').json()['stations']
    assert distance and all(s['fuel'] == 'B7_STANDARD' and s['distance'] <= 1 for s in distance)
    assert [s['distance'] for s in distance] == sorted(s['distance'] for s in distance)
    sid = stations[0]['id']
    history = client.get(f'/api/stations/{sid}/history').json()
    assert history['mode'] == 'demo' and len(history['points']) == 30
    favs = client.get(f'/api/stations?lat=51.5&lon=-0.1&ids={sid}').json()
    assert [s['id'] for s in favs['stations']] == [sid]
    assert client.get('/api/stations?ids=').json()['stations'] == []


def test_validation_empty_and_offline_city_search(client):
    for query in ['radius=0', 'radius=100', 'lat=91', 'fuel=notfuel', 'sort=anything']:
        assert client.get('/api/stations?'+query).status_code == 422
    assert client.get('/api/stations?lat=59&lon=-5&radius=1').json()['cheapest'] is None
    assert client.get('/api/search?q=Manchester').json()['results'][0]['latitude'] == 53.4808
    assert client.get('/api/search?q=x').status_code == 422
    assert distance_miles(53, -2, 53, -2) == 0


def test_demo_restart_does_not_regenerate_history(settings):
    with TestClient(create_app(settings)) as c:
        before = c.get('/api/status').json()['last_success']
    with TestClient(create_app(settings)) as c:
        assert c.get('/api/status').json()['last_success'] == before


def test_live_never_seeds_demo(settings, monkeypatch):
    async def no_network(self):
        await asyncio.Event().wait()
    monkeypatch.setattr(SyncService, 'run', no_network)
    with TestClient(create_app(replace(settings, mode='live', client_id='test', client_secret='test'))) as c:
        result = c.get('/api/stations').json()
        assert result['status']['mode'] == 'live' and result['count'] == 0
    assert (settings.data_dir/'live.sqlite3').exists()
    assert not (settings.data_dir/'demo.sqlite3').exists()


@pytest.fixture
def upstream():
    station = {'node_id':'one', 'trading_name':'Example', 'brand_name':'Example', 'location': {
        'address_line_1':'1 High Street','city':'Manchester','postcode':'M1 1AA','latitude':53.48,'longitude':-2.24},
        'temporary_closure':False,'permanent_closure':None}
    price = {'node_id':'one','fuel_prices':[{'fuel_type':'B7_Standard','price':'141.9','price_last_updated':'2026-02-17T16:03:04.938Z'}]}
    return station, price


def test_official_schema_variants_and_price_validation(upstream):
    station, price = upstream
    assert records([station]) == records({'data':[station]})
    parsed = normalize([station], [price])[0]
    assert parsed.prices[0].fuel == 'B7_STANDARD' and parsed.prices[0].price == 141.9
    assert parsed.prices[0].updated_at.tzinfo is not None
    with pytest.raises(ProviderError): records({'data': {'wrong':[]}})
    for invalid in ['0', '-1', 'NaN']:
        price['fuel_prices'][0]['price'] = invalid
        with pytest.raises((ProviderError, ValueError)): normalize([station], [price])


def test_official_pagination_token_and_401(settings, monkeypatch):
    import backend.provider as provider_module
    async def fast_sleep(_): pass
    monkeypatch.setattr(provider_module.asyncio, 'sleep', fast_sleep)
    calls, tokens = [], []
    def handler(request):
        calls.append(request)
        if request.url.path.endswith('generate_access_token'):
            tokens.append(1)
            assert b'client_secret' in request.content
            return httpx.Response(200, json={'data': {'access_token':str(len(tokens)), 'expires_in':3600}})
        batch = request.url.params['batch-number']
        if len(tokens) == 1: return httpx.Response(401)
        if batch == '1': return httpx.Response(200, json={'data':[{'node_id':'one'}]})
        if batch == '2': return httpx.Response(200, json=[{'node_id':'two'}])
        return httpx.Response(404)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            provider = FuelFinder(settings, client)
            result = await provider.pages('/api/v1/pfs')
            assert [s['node_id'] for s in result] == ['one','two']
    asyncio.run(run())
    assert len(tokens) == 2
    assert calls[-1].url.params['batch-number'] == '3'  # Short pages must not end pagination.


def test_rate_limit_and_malformed_batch(settings, monkeypatch):
    import backend.provider as provider_module
    async def fast_sleep(_): pass
    monkeypatch.setattr(provider_module.asyncio, 'sleep', fast_sleep)
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(429, headers={'Retry-After':'7200'}))) as client:
            with pytest.raises(RateLimited) as exc:
                await FuelFinder(settings, client).request('GET','/api/v1/pfs')
            assert exc.value.seconds == 7200
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[]))) as client:
            provider = FuelFinder(settings, client)
            provider.token, provider.token_expires = 'test', float('inf')
            with pytest.raises(ProviderError): await provider.pages('/api/v1/pfs')
    asyncio.run(run())
    assert retry_after(None) == 300
    assert retry_after('Tue, 01 Jan 2030 00:00:00 GMT') > 60


def test_failed_sync_preserves_snapshot_and_honours_retry(settings):
    db = Database(settings.data_dir/'live.sqlite3')
    s = Station(id='real', name='Example', brand='Example', address='Road', postcode='M1', city='Manchester',
                latitude=53.48, longitude=-2.24, prices=[Price(fuel='E10', price=135.9, updated_at=datetime.now(timezone.utc))])
    db.snapshot([s])
    before = db.meta('last_success')
    async def run():
        async with httpx.AsyncClient() as client:
            service = SyncService(db, settings, client)
            async def failed(): raise RateLimited(7200)
            service.provider.fetch = failed
            assert await service.sync() == 7200
            assert service.error and not service.refreshing
    asyncio.run(run())
    assert db.meta('last_success') == before and db.stations()[0]['id'] == 'real'


def test_history_keeps_last_observation_each_day(settings):
    db = Database(settings.data_dir/'history.sqlite3')
    today = datetime.now(timezone.utc).date().isoformat()
    for hour,price in [(1,139.9),(2,135.9)]:
        stamp = f'{today}T0{hour}:00:00+00:00'
        s = Station(id='id',name='Test',brand='Test',address='Road',postcode='M1',city='Manchester',
                    latitude=53.48,longitude=-2.24,prices=[Price(fuel='E10',price=price,updated_at=stamp)])
        db.snapshot([s], stamp)
    assert db.history('id','E10',30) == [{'date':today,'price':135.9}]
    with db.connect() as conn:
        assert conn.execute('SELECT count(*) FROM history').fetchone()[0] == 1
