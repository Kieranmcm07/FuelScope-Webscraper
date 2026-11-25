# FuelScope

A local UK fuel price dashboard built with FastAPI, SQLite, React, Vite, TypeScript, Tailwind CSS, Leaflet and OpenStreetMap. Dark charcoal, emerald accents, responsive layouts and no account required.

## Start on Windows

1. Install **Python 3.11 or newer** and **Node.js 22 LTS or newer**, with both added to PATH.
2. Double-click **`setup.bat`** once. It creates `.venv`, installs dependencies, builds the frontend, and creates `.env` if missing.
3. Double-click **`start.bat`**. FuelScope opens at **http://127.0.0.1:8000**.
4. Leave its terminal open. Press **Ctrl+C** to stop.

The current workspace has already been installed and built. You can run `start.bat` directly. An ignored portable Node runtime in `.tools` was used for verification; setup also recognises it if Node is not on PATH. Node is needed for building, but not for the normal startup after a build.

No PowerShell activation or execution-policy changes are needed. If port 8000 is already in use, stop the existing server first. Run setup again after frontend changes.

## Demo and live modes

Without credentials, `FUEL_MODE=auto` uses **clearly labelled demo mode**. It has 240 fictional stations in 20 UK cities, with 30 days of simulated history. Start with Manchester; try London, Cardiff, Edinburgh or Belfast. Demo stations, locations and prices are **not suitable for journey planning**. Other towns/postcodes can be searched but may have no nearby demo stations. Sample data is seeded once and keeps its original timestamps across restarts.

For live data:

1. Follow the [official Fuel Finder access guidance](https://www.gov.uk/guidance/access-the-latest-fuel-prices-and-forecourt-data-via-api-or-email), register as an information recipient using GOV.UK One Login, and obtain production client credentials.
2. Copy `.env.example` to `.env` if setup has not already done so.
3. Set these values in `.env`:

   ```dotenv
   FUEL_MODE=live
   FUEL_FINDER_CLIENT_ID=your_client_id
   FUEL_FINDER_CLIENT_SECRET=your_client_secret
   ```

4. Restart FuelScope. The first full UK sync may take several minutes. The interface shows sync status; **Refresh view** reloads cached results without triggering upstream requests.

Secrets stay on the Python server. Never put them in frontend files or `VITE_` variables. `.env`, databases and local tools are ignored by Git. An incomplete credential pair causes a configuration error instead of quietly switching to demo. Live authentication or network failures never produce simulated prices.

The integration was implemented against the official authentication and Information Recipient OpenAPI documents retrieved on **24 November 2026**. See [API provenance and usage notes](docs/API.md). **Live authenticated collection has not been tested because no credentials were supplied.** Its request/response handling is covered by offline mock tests.

## What works

- Interactive map with numeric price markers, selection, zoom and search-radius boundary.
- Full UK postcode lookup and town search, with multiple matching places to choose from. Major cities work without a geocoding connection; external place coverage follows Postcodes.io's dataset.
- 1–50 mile radius, E10, E5 and standard B7 diesel filters, price/distance sorting.
- Cheapest station, result average and potential saving for a 50-litre fill-up.
- Station address, available fuels, usual opening hours, amenities and price timestamps.
- Saved stations in browser local storage. The Saved stations view includes favourites outside the current radius. Only available stations offering the selected fuel are shown.
- Interactive station history chart with 7/30/90-day views. Live history starts when this app first collects data; there is no backfilled government history.
- Fill-up calculator with comparison price, extra round-trip mileage and **UK** mpg. The default comparison is the current result average. Station distances are straight-line distances, not routes.
- Automatic collection while the server runs; retained cached data and visible error/staleness messages on failures.
- Loading, empty and error states; desktop, tablet and mobile styles; keyboard-accessible controls.

Prices are in **pence per litre**; totals are in pounds. Search averages exclude closed stations and missing prices. Prices older than 24 hours are labelled but remain included; a retailer timestamp indicates its last change, not necessarily a daily update. Always check the forecourt price. Displayed timestamps use Europe/London.

## Development and checks

From the project root, start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Use the Vite URL it prints (normally http://127.0.0.1:5173). It proxies `/api` to FastAPI. No credentials or permissive CORS rules are needed in the frontend. Run only **one backend worker** per set of API credentials so the request limits remain global. The launcher enforces a single local server.

```powershell
# Root directory
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest backend/tests -q
# Frontend directory
cd frontend
npm run build
```

Verified: production TypeScript/Vite build; backend tests for filtering, summaries, history, favourites, input validation, pagination, token renewal, rate limits and safe failure; HTTP serving plus actual postcode and town lookups. Browser visual verification was unavailable in the build environment.

## Layout

```text
backend/
  main.py          HTTP API and frontend serving
  config.py        Environment settings
  provider.py      Official Fuel Finder adapter
  service.py       Background refresh and status
  database.py      SQLite storage and queries
  geocoding.py     Cached Postcodes.io searches
  demo.py          Explicit fictional dataset
  tests/           Offline functionality tests
frontend/
  src/App.tsx      Dashboard state and views
  src/components/  Map, chart, calculator and sources
  src/styles.css   Responsive dashboard styling
docs/              Official API snapshots and integration notes
data/              Local SQLite files (ignored)
```

`data/demo.sqlite3` and `data/live.sqlite3` are separate. History retains the last observation per station/fuel/UTC day for up to 365 days, keeping repeated unchanged refreshes from filling the disk. Back up these files with FuelScope stopped if you want to preserve collected history. No cloud deployment, authentication or paid integration is included; the server binds only to loopback.

## Data and licensing

- Fuel data: UK Government Fuel Finder, Department for Energy Security and Net Zero. Follow the [developer guidelines](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/dev-guideline) and the terms accepted during registration. This local app displays normalised comparisons; it does not offer raw upstream data downloads. Do not assume the GOV.UK page's general licence grants unrestricted redistribution of API data.
- Maps: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL. The [tile usage policy](https://operations.osmfoundation.org/policies/tiles/) requires visible attribution and prohibits bulk/offline tile downloads. Browser caching is retained; no tile scraping or prefetching is implemented. `MAP_TILE_URL` can be changed in `.env`; update attribution too if your replacement provider requires it.
- Geocoding: [Postcodes.io licences](https://postcodes.io/docs/licences/). Contains Ordnance Survey data © Crown copyright and database right 2025; Royal Mail data © Royal Mail copyright and database right 2025; National Statistics data © Crown copyright and database right 2025; NRS data © Crown copyright and database right 2025. **Commercial use of Northern Ireland postcode data requires a separate NI Land & Property Services licence.**
- Searches are submitted only on request, cached locally for 30 days, and spaced at least one second apart. Search queries and map views are shared with their respective providers. Favourites stay in your browser. Internet access is required for map tiles, external geocoding and live prices; included demo city searches, prices and history work offline.
