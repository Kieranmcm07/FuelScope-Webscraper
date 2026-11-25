"""Entirely fictional stations and prices, isolated from the live database."""
import math
from datetime import datetime, timedelta, timezone

from .models import Price, Station

CITIES = {
    'Manchester': (53.4808, -2.2426), 'London': (51.5074, -0.1278),
    'Birmingham': (52.4862, -1.8904), 'Leeds': (53.8008, -1.5491),
    'Liverpool': (53.4084, -2.9916), 'Bristol': (51.4545, -2.5879),
    'Newcastle': (54.9783, -1.6178), 'Nottingham': (52.9548, -1.1581),
    'Sheffield': (53.3811, -1.4701), 'Oxford': (51.7520, -1.2577),
    'Cambridge': (52.2053, 0.1218), 'Brighton': (50.8225, -0.1372),
    'Edinburgh': (55.9533, -3.1883), 'Glasgow': (55.8642, -4.2518),
    'Aberdeen': (57.1497, -2.0943), 'Cardiff': (51.4816, -3.1791),
    'Swansea': (51.6214, -3.9436), 'Belfast': (54.5973, -5.9301),
    'Derry': (54.9966, -7.3086), 'Southampton': (50.9097, -1.4044),
}
NAMES = ['Canal Street', 'Northside', 'Riverside', 'Park Lane', 'City Road', 'Westgate',
         'Oakfield', 'Ring Road', 'Meadow Park', 'Eastbank', 'Brookside', 'Hillcrest']
BRANDS = ['Greenway', 'Northstar', 'Local Fuel', 'Greenway', 'Roadside', 'Northstar']


def seed(db):
    if db.meta('last_success'):
        return
    now = datetime.now(timezone.utc)
    for day in range(29, -1, -1):
        stamp = now - timedelta(days=day)
        stations = []
        for city_idx, (city, (lat, lon)) in enumerate(CITIES.items()):
            for i, name in enumerate(NAMES):
                angle = i * 2.399
                r = 0.009 + i * 0.004
                base = 134.9 + (i * 7 % 12) + city_idx % 4
                change = round(day * 0.09 + math.sin(day / 3 + i) * 0.7, 1)
                stations.append(Station(
                    id=f'demo-{city_idx}-{i}', name=f'{name} Filling Station', brand=BRANDS[i % 6],
                    address=f'{i+1} {name}, {city} (fictional)', postcode='Demo location', city=city,
                    latitude=lat+math.sin(angle)*r, longitude=lon+math.cos(angle)*r/0.6,
                    amenities=['customer_toilets', 'air_pump_or_screenwash'] + (['car_wash'] if i%2 else []),
                    opening_times={'usual_days': {d: {'open': '06:00', 'close': '23:00', 'is_24_hours': False}
                        for d in ['monday','tuesday','wednesday','thursday','friday','saturday','sunday']}},
                    prices=[Price(fuel=f, price=round(base+extra+change, 1), updated_at=stamp)
                            for f, extra in [('E10',0), ('E5',13), ('B7_STANDARD',7.5)]]))
        db.snapshot(stations, stamp.isoformat())
