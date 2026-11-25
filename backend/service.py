import asyncio
from datetime import datetime, timedelta, timezone

from .models import utcnow
from .provider import FuelFinder, ProviderError, RateLimited


class SyncService:
    def __init__(self, db, settings, client):
        self.db, self.settings = db, settings
        self.provider = FuelFinder(settings, client)
        self.error = None
        self.refreshing = False
        self.next_refresh = None

    async def sync(self):
        self.refreshing = True
        delay = self.settings.refresh_seconds
        try:
            stations = await self.provider.fetch()
            previous = sum(bool(s['prices']) for s in self.db.stations())
            current = sum(bool(s.prices) for s in stations)
            if previous and current < previous * 0.7:
                raise ProviderError('Fuel Finder coverage dropped unexpectedly. The previous snapshot has been retained.')
            await asyncio.to_thread(self.db.snapshot, stations)
            self.error = None
        except RateLimited as exc:
            delay = max(delay, exc.seconds)
            self.error = str(exc)
        except ProviderError as exc:
            self.error = str(exc)
        except Exception:
            # Do not expose upstream response bodies, tokens or request headers.
            self.error = 'The refresh could not be validated. Previous prices are retained; check the API documentation and server configuration.'
        finally:
            self.refreshing = False
            self.next_refresh = (datetime.now(timezone.utc) + timedelta(seconds=delay)).isoformat()
        return delay

    async def run(self):
        last = self.db.meta('last_success')
        if last:
            wait = max(0, self.settings.refresh_seconds - (datetime.now(timezone.utc)-datetime.fromisoformat(last)).total_seconds())
            self.next_refresh = (datetime.now(timezone.utc)+timedelta(seconds=wait)).isoformat()
            await asyncio.sleep(wait)
        while True:
            delay = await self.sync()
            await asyncio.sleep(delay)

    def status(self):
        last = self.db.meta('last_success')
        stale = not last or (datetime.now(timezone.utc)-datetime.fromisoformat(last)).total_seconds() > self.settings.refresh_seconds*2
        return {'mode': self.settings.mode, 'last_success': last, 'next_refresh': self.next_refresh,
                'refreshing': self.refreshing, 'error': self.error, 'stale': stale,
                'refresh_seconds': self.settings.refresh_seconds, 'server_time': utcnow(),
                'tile_url': self.settings.tile_url}
