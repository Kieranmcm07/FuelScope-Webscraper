import { ShieldCheck } from 'lucide-react';
import { dateTime, type Status } from '../types';

export default function Sources({ demo, status }: { demo: boolean; status: Status | undefined }) {
  return <section className="panel sources">
    <h2><ShieldCheck size={22}/> Where your data comes from</h2>
    <p>FuelScope keeps price history local and data sources visible. It is an independent application, not a government service.</p>
    <div className="source-grid">
      <article><span className="section-kicker">FUEL PRICES</span><h3>UK Government Fuel Finder</h3>
        <p>Live mode reads the official Information Recipient API. Prices are shown in pence per litre. Diesel means standard B7 diesel.</p>
        <p>Current mode: <strong>{demo?'Demo: fictional data':status?'Live: government data':'Checking connection'}</strong><br/>
          Last successful sync: {dateTime(status?.last_success || null)}<br/>Next live sync: {dateTime(status?.next_refresh || null)}</p>
        <a href="https://www.gov.uk/guidance/access-the-latest-fuel-prices-and-forecourt-data-via-api-or-email" target="_blank" rel="noreferrer">Official access guidance</a>
      </article>
      <article><span className="section-kicker">CONNECT LIVE DATA</span><h3>Your credentials stay on the server</h3>
        <p>Register as an information recipient through the official portal. Add your client ID and secret to the project’s <code>.env</code> file, set <code>FUEL_MODE=live</code>, then restart FuelScope.</p>
        <p>History starts with the first successful collection. No simulated history is added to live prices. Demo and live data are kept in separate databases.</p>
      </article>
      <article><span className="section-kicker">MAPS & LOCATIONS</span><h3>OpenStreetMap & Postcodes.io</h3>
        <p>Map data © OpenStreetMap contributors, under ODbL. Map tiles load only for the area you view. Town and postcode searches use Postcodes.io; major city centres are included locally.</p>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">Map attribution</a>
        <a href="https://postcodes.io/docs/licences/" target="_blank" rel="noreferrer">Location data licences</a>
        <p className="small">Contains Ordnance Survey data © Crown copyright and database right 2025. Contains Royal Mail data © Royal Mail copyright and database right 2025. Contains National Statistics data © Crown copyright and database right 2025. Contains NRS data © Crown copyright and database right 2025.</p>
      </article>
      <article><span className="section-kicker">FRESHNESS & PRIVACY</span><h3>Cached responsibly</h3>
        <p>Prices refresh every {Math.round((status?.refresh_seconds || 1800)/60)} minutes while the server is running. Forecourt information is cached for an hour. Failed refreshes retain the last valid snapshot.</p>
        <p>Favourites stay in this browser. Searches are sent to Postcodes.io and cached locally for 30 days. Prices can change; check the forecourt before filling up. Northern Ireland postcode data is for non-commercial use unless separately licensed. All displayed times use UK time.</p>
        <a href="https://www.developer.fuel-finder.service.gov.uk/fuel-finder/dev-guideline" target="_blank" rel="noreferrer">Fuel Finder usage guidelines</a>
      </article>
    </div>
  </section>;
}
