import asyncio
from contextlib import asynccontextmanager, suppress
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import ROOT, Settings
from .database import Database
from .demo import seed
from .geocoding import Geocoder
from .models import Fuel
from .service import SyncService


def create_app(settings=None):
    settings = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        db = Database(settings.data_dir / f'{settings.mode}.sqlite3')
        if settings.mode == 'demo':
            await asyncio.to_thread(seed, db)
        async with httpx.AsyncClient(timeout=30, headers={'User-Agent': 'FuelScope/1.0 (local UK fuel comparison)'}) as client:
            service = SyncService(db, settings, client)
            app.state.db, app.state.service = db, service
            app.state.geocoder = Geocoder(db, settings, client)
            task = asyncio.create_task(service.run()) if settings.mode == 'live' else None
            yield
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(title='FuelScope', version='1.0.0', lifespan=lifespan)

    @app.get('/api/status')
    def status():
        return app.state.service.status()

    @app.get('/api/stations')
    def stations(lat: float = Query(53.4808, ge=49, le=61), lon: float = Query(-2.2426, ge=-9, le=3),
                 radius: float = Query(5, ge=1, le=50), fuel: Fuel = 'E10',
                 sort: Literal['price', 'distance'] = 'price', ids: str | None = Query(None, max_length=20000)):
        found = app.state.db.search(lat, lon, 1000 if ids is not None else radius, fuel, sort)
        if ids is not None:
            wanted = set(ids.split(','))
            found = [s for s in found if s['id'] in wanted]
        cheapest = min(found, key=lambda s: s['price']) if found else None
        return {'stations': found, 'count': len(found), 'average': round(sum(s['price'] for s in found)/len(found), 2) if found else None,
                'cheapest': cheapest, 'status': app.state.service.status()}

    @app.get('/api/stations/{station_id}/history')
    def history(station_id: str, fuel: Fuel = 'E10', days: int = Query(30, ge=1, le=365)):
        return {'mode': settings.mode, 'points': app.state.db.history(station_id, fuel, days)}

    @app.get('/api/search')
    async def search(q: str = Query(min_length=2, max_length=120)):
        try:
            return {'results': await app.state.geocoder.search(q)}
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            raise HTTPException(503, 'Location search is temporarily unavailable. Try a major city or try again later.') from None

    dist = ROOT / 'frontend' / 'dist'
    if (dist / 'index.html').exists():
        app.mount('/assets', StaticFiles(directory=dist / 'assets'), name='assets')

        @app.get('/favicon.svg', include_in_schema=False)
        def favicon():
            return FileResponse(dist / 'favicon.svg')

        @app.get('/', include_in_schema=False)
        def index():
            return FileResponse(dist / 'index.html')
    return app


app = create_app()
