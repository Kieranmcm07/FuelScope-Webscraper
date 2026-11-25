import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDownUp, Bookmark, Calculator as CalculatorIcon, Check, ChevronRight, Clock3, Database, Fuel as FuelIcon, Info, LayoutDashboard, LocateFixed, MapPin, Menu, RefreshCw, Search, TrendingDown, Wallet, X } from 'lucide-react';
import StationMap from './components/StationMap';
import Calculator from './components/Calculator';
import Sources from './components/Sources';
import { api, dateTime, fuelName, money, stalePrice, type Fuel, type Location, type Results, type Station } from './types';
const PriceChart = lazy(() => import('./components/PriceChart'));
type View = 'overview' | 'favourites' | 'history' | 'calculator' | 'sources';
const initialLocation = { name: 'Manchester', latitude: 53.4808, longitude: -2.2426 };
const nav = [ { id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'favourites', label: 'Saved stations', icon: Bookmark }, { id: 'history', label: 'Price history', icon: TrendingDown }, { id: 'calculator', label: 'Fuel calculator', icon: CalculatorIcon } ] as const;

function getSaved(): string[] {
  try { const v: unknown = JSON.parse(localStorage.getItem('fuelscope-favourites') || '[]'); return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string').slice(0,100) : []; } catch { return []; }
}

export default function App() {
  const [view, setView] = useState<View>('overview');
  const [menu, setMenu] = useState(false);
  const [location, setLocation] = useState<Location>(initialLocation);
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Location[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [fuel, setFuel] = useState<Fuel>('E10');
  const [radius, setRadius] = useState(5);
  const [sort, setSort] = useState('price');
  const [data, setData] = useState<Results | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>(getSaved);
  const [storageError, setStorageError] = useState('');
  const [reload, setReload] = useState(0);
  const searchController = useRef<AbortController | null>(null);
  const isSaved = view === 'favourites';
  const savedFilter = isSaved ? saved.join(',') : null;
  const selectStation = useCallback((id: string) => setSelected(id), []);
  const status = data?.status;
  const demo = status?.mode === 'demo';
  const station = data?.stations.find(s => s.id === selected) || data?.stations[0] || null;

  useEffect(() => {
    const ctrl = new AbortController(); setLoading(true); setError(''); setData(null);
    const params = new URLSearchParams({ lat: String(location.latitude), lon: String(location.longitude), radius: String(radius), fuel, sort });
    if (savedFilter !== null) params.set('ids', savedFilter);
    api<Results>('/stations?' + params, ctrl.signal).then(r => {
      setData(r); setSelected(prev => r.stations.some(s => s.id === prev) ? prev : r.cheapest?.id || null);
    }).catch(e => { if (!ctrl.signal.aborted) setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [location, radius, fuel, sort, savedFilter, reload]);
  useEffect(() => { const timer = setInterval(() => { if (!document.hidden) setReload(v => v+1); }, 60000); return () => clearInterval(timer); }, []);
  useEffect(() => () => searchController.current?.abort(), []);

  function toggleSaved(id: string) {
    const next = saved.includes(id) ? saved.filter(s => s !== id) : [...saved, id].slice(-100);
    setSaved(next);
    try { localStorage.setItem('fuelscope-favourites', JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('Browser storage is unavailable. Saved stations will last for this session only.'); }
  }
  async function search(event: React.FormEvent) {
    event.preventDefault(); if (query.trim().length < 2) return;
    searchController.current?.abort(); const ctrl = new AbortController(); searchController.current = ctrl;
    setSearching(true); setSearchError(''); setPlaces([]);
    try {
      const result = await api<{results: Location[]}>('/search?q='+encodeURIComponent(query.trim()), ctrl.signal);
      if (result.results.length === 1) { setLocation(result.results[0]); setQuery(''); }
      else if (!result.results.length) setSearchError('No matching location. Try a full postcode or town name.');
      else setPlaces(result.results);
    } catch(e) { if (!ctrl.signal.aborted) setSearchError((e as Error).message); }
    finally { if (!ctrl.signal.aborted) setSearching(false); }
  }
  function navigate(next: View) { setView(next); setMenu(false); }
  const titles: Record<View,string> = { overview: 'A smarter stop. A better price.', favourites: 'Your regular stops, all in one place.', history: 'Keep an eye on the price.', calculator: 'Know what your next fill-up costs.', sources: 'Clear data. No guesswork.' };
  const chart = <Suspense fallback={<div className="panel empty">Loading chart…</div>}><PriceChart station={station} fuel={fuel} demo={!!demo}/></Suspense>;

  return <div className="app-shell">
    <aside className={`sidebar ${menu ? 'expanded' : ''}`}>
      <a href="#" className="brand" onClick={e => {e.preventDefault(); navigate('overview');}}><span className="brand-icon"><FuelIcon size={24}/></span>FuelScope<span className="brand-dot">.</span></a>
      <button className="mobile-menu icon-button" aria-label={menu ? 'Close navigation' : 'Open navigation'} onClick={() => setMenu(!menu)}>{menu ? <X/> : <Menu/>}</button>
      <div className="sidebar-body"><p className="nav-label">YOUR FUEL, IN FOCUS</p><nav aria-label="Main navigation">{nav.map(({id,label,icon:Icon}) => <button key={id} className={`nav-item ${view===id?'active':''}`} onClick={() => navigate(id)} aria-current={view===id?'page':undefined}><Icon size={19}/>{label}{id==='favourites' && saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="uk-card"><span className="uk-icon"><MapPin size={19}/></span><div><strong>Made for the road.</strong><p>Fuel prices across the UK</p></div></div><button className={`nav-item ${view==='sources'?'active':''}`} onClick={() => navigate('sources')}><Database size={18}/> Data & sources</button><div className="sidebar-footer">FuelScope <span>v1.0</span></div></div>
      </div>
    </aside>
    <main className="main-content">
      <header className="topbar"><span>Workspace <ChevronRight size={14}/> <strong>{view === 'sources' ? 'Data & sources' : nav.find(n=>n.id===view)?.label}</strong></span><div className="topbar-right"><span className={`mode-tag ${demo?'demo':''}`}>{status ? (demo ? 'Demo workspace' : 'Government data') : 'Connecting'}</span><span className="avatar">FS</span></div></header>
      <div className="content">
        <div className="page-heading"><div><p className="eyebrow">LESS AT THE PUMP. MORE FOR THE JOURNEY.</p><h1>{titles[view]}</h1><p>Find your next fill-up with a little more confidence.</p></div><button className="secondary refresh-button" disabled={loading} onClick={() => setReload(n=>n+1)} title="Reload the locally cached prices"><RefreshCw size={16} className={loading?'spin':''}/> Refresh view</button></div>
        {demo && <div className="demo-banner"><Info size={17}/><span><strong>You’re exploring demo data.</strong> All stations, prices and history are fictional. Not for journey planning.</span><button onClick={() => navigate('sources')}>Connect live data <ChevronRight size={15}/></button></div>}
        {status?.error && <div className="error-banner" role="alert">{status.error}</div>}
        {status?.stale && !demo && <div className="error-banner">{status.last_success ? `Cached data may be out of date. Last successful sync: ${dateTime(status.last_success)}.` : 'The first Fuel Finder sync is in progress. Reload the view shortly.'}</div>}
        {storageError && <div className="error-banner" role="alert">{storageError}</div>}

        {view === 'sources' ? <Sources demo={!!demo} status={status}/> : <>
          <section className="search-toolbar" aria-label="Search and filters"><form className="search-form" onSubmit={search}><Search size={19}/><input aria-label="Town or UK postcode" placeholder={`Search town or postcode…`} value={query} onChange={e => setQuery(e.target.value)} minLength={2} maxLength={120}/><button type="submit" disabled={searching || query.trim().length<2}>{searching?'Searching…':'Search'}</button>
            {places.length>0 && <div className="search-results"><div>Choose your location<button type="button" aria-label="Close location results" onClick={()=>setPlaces([])}><X size={16}/></button></div>{places.map((p,i)=><button type="button" key={i} onClick={()=>{setLocation(p);setQuery('');setPlaces([]);}}><MapPin size={16}/>{p.name}</button>)}</div>}
          </form><label className="radius-label"><LocateFixed size={17}/><select aria-label="Search radius in miles" value={radius} onChange={e=>setRadius(Number(e.target.value))}>{[1,3,5,10,25,50].map(r=><option key={r} value={r}>{r} mile radius</option>)}</select></label><div className="fuel-switch" aria-label="Fuel type">{(['E10','E5','B7_STANDARD'] as Fuel[]).map(f=><button key={f} className={fuel===f?'active':''} aria-pressed={fuel===f} onClick={()=>setFuel(f)}>{f==='B7_STANDARD'?'Diesel':f}<span>{f==='B7_STANDARD'?'B7':f==='E10'?'Unleaded':'Super'}</span></button>)}</div></section>
          {searchError && <div className="error-banner" role="alert">{searchError}</div>}
          <div className="location-line"><span><MapPin size={15}/><strong>{location.name}</strong><span> · {isSaved?'All saved locations':`Within ${radius} miles`} · {fuelName[fuel]}</span></span><span><Clock3 size={14}/> {demo?'Sample created':'Last sync'} {dateTime(status?.last_success || null)}</span></div>
          {error ? <div className="panel empty" role="alert"><Info size={28}/><h2>We couldn’t load your stations</h2><p>{error}</p><button className="primary" onClick={()=>setReload(v=>v+1)}>Try again</button></div> : <>
          <section className="stats-grid" aria-label="Price summary"><div className="stat-card cheapest"><div className="stat-label">Cheapest {isSaved?'saved':'nearby'}<span className="stat-icon"><TrendingDown size={19}/></span></div><div className="stat-value">{loading?'—':data?.cheapest?.price.toFixed(1)||'—'}<small>p/l</small></div><div className="stat-bottom">{data?.cheapest?.name || (loading?'Finding the best price…':'No price available')} {data?.cheapest && <span className="mini-tag">BEST PRICE</span>}</div></div>
            <div className="stat-card"><div className="stat-label">{isSaved?'Saved station':'Local'} average<span className="stat-icon"><FuelIcon size={19}/></span></div><div className="stat-value">{loading?'—':data?.average?.toFixed(1)||'—'}<small>p/l</small></div><div className="stat-bottom">Across {data?.count || 0} {fuelName[fuel].toLowerCase()} stations</div></div>
            <div className="stat-card"><div className="stat-label">A little further for your money<span className="stat-icon"><Wallet size={19}/></span></div><div className="stat-value green">{data?.cheapest && data.average ? money((data.average-data.cheapest.price)*0.5):'—'}</div><div className="stat-bottom">On 50 litres, cheapest vs average · before travel</div></div></section>
          {(view==='overview' || isSaved) && <section className="explore-grid"><div className="panel map-panel"><div className="panel-heading"><h2>Explore the area</h2><span className="small">{demo?'Simulated stations':'Price per litre'}</span></div><StationMap stations={data?.stations || []} location={location} radius={radius} selected={station?.id || null} onSelect={selectStation} tileUrl={status?.tile_url || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'} saved={isSaved}/></div>
            <section className="panel station-panel"><div className="panel-heading"><h2>{isSaved?'Saved stations':'Nearby stations'} <span className="count">{data?.count || 0}</span></h2><label className="sort-label"><ArrowDownUp size={14}/><select aria-label="Sort stations" value={sort} onChange={e=>setSort(e.target.value)}><option value="price">Price</option><option value="distance">Distance</option></select></label></div><div className="station-list" aria-busy={loading}>
              {loading ? [1,2,3,4].map(n=><div className="skeleton-row" key={n}><span/><div/><span/></div>) : data?.stations.length ? data.stations.map(s=><StationRow key={s.id} station={s} active={s.id===station?.id} best={s.price===data.cheapest?.price} saved={saved.includes(s.id)} onSelect={()=>setSelected(s.id)} onSave={()=>toggleSaved(s.id)} demo={!!demo}/>) : <div className="empty"><Bookmark size={28}/><h3>{isSaved?'Your favourites start here':'No stations in this area'}</h3><p>{isSaved?'Save a station with the bookmark button. Only stations with this fuel appear.':demo?'Try Manchester or another major UK city, or widen your radius. Demo coverage is limited.':'Try a larger radius or another fuel type. Closed stations and missing prices are excluded.'}</p>{isSaved && <button className="secondary" onClick={()=>navigate('overview')}>Explore stations</button>}</div>}
            </div><div className="list-footer"><Info size={13}/> Straight-line distance from {location.name}</div></section></section>}
          {view === 'history' && <div className="panel station-selector"><label>Station <select value={station?.id || ''} onChange={e=>setSelected(e.target.value)}>{!data?.stations.length && <option value="">No stations in this search</option>}{data?.stations.map(s=><option key={s.id} value={s.id}>{s.name} · {s.price.toFixed(1)}p</option>)}</select></label></div>}
          {view === 'calculator' ? <div className="bottom-grid"><Calculator data={data}/>{chart}</div> : <div className="bottom-grid">{chart}<StationDetails station={station} saved={!!station && saved.includes(station.id)} onSave={()=>station && toggleSaved(station.id)} demo={!!demo}/></div>}
          {view==='overview' && <div className="savings-callout"><span className="stat-icon"><CalculatorIcon size={20}/></span><div><strong>Is the cheaper station worth the detour?</strong><p>Calculate your fill-up cost and savings, including the extra miles.</p></div><button className="secondary" onClick={()=>navigate('calculator')}>Open calculator <ChevronRight size={16}/></button></div>}
          </>}
        </>}
        <footer className="page-footer"><span><FuelIcon size={14}/> FuelScope · A smarter fill-up</span><button onClick={()=>navigate('sources')}>{demo?'Fictional demo data':'Fuel Finder data'} · Sources & attribution</button></footer>
      </div>
    </main>
  </div>;
}

function StationRow({station:s,active,best,saved,onSelect,onSave,demo}: {station:Station;active:boolean;best:boolean;saved:boolean;onSelect:()=>void;onSave:()=>void;demo:boolean}) {
  return <article className={`station-row ${active?'selected-row':''}`}><button className="station-select" onClick={onSelect} aria-pressed={active}><span className={`station-logo brand-${s.brand.length%4}`}>{s.brand.slice(0,2).toUpperCase()}</span><span className="station-copy"><strong>{s.name}</strong><span>{s.brand} · {s.distance.toFixed(1)} mi</span><small className={!demo&&stalePrice(s.updated_at)?'amber':''}>{!demo&&stalePrice(s.updated_at)?'Older price · ':''}{demo?'Sample · ':''}{dateTime(s.updated_at)}</small></span><span className="station-price"><strong className={best?'green':''}>{s.price.toFixed(1)}</strong><small>p/l</small>{best&&<span className="best-label">Lowest</span>}</span></button><button className={`save-button ${saved?'saved':''}`} onClick={onSave} aria-label={`${saved?'Unsave':'Save'} ${s.name}`} aria-pressed={saved}><Bookmark size={17} fill={saved?'currentColor':'none'}/></button></article>;
}

function StationDetails({station:s,saved,onSave,demo}:{station:Station|null;saved:boolean;onSave:()=>void;demo:boolean}) {
  if (!s) return <section className="panel empty"><MapPin size={25}/><h3>Station details</h3><p>Select a station from the list or map.</p></section>;
  const day = new Intl.DateTimeFormat('en-GB',{weekday:'long',timeZone:'Europe/London'}).format(new Date()).toLowerCase();
  const hours = s.opening_times.usual_days?.[day];
  return <section className="panel details-panel"><div className="panel-heading"><div><span className="section-kicker">STATION SPOTLIGHT {demo?'· DEMO':''}</span><h2>{s.name}</h2></div><button className={`icon-button ${saved?'green':''}`} onClick={onSave} aria-label={saved?'Remove selected favourite':'Save selected station'}><Bookmark size={20} fill={saved?'currentColor':'none'}/></button></div><p className="detail-address"><MapPin size={15}/>{s.address}<br/>{s.postcode}</p><div className="detail-prices">{s.prices.map(p=><div key={p.fuel}><small>{p.fuel==='B7_STANDARD'?'Diesel':p.fuel}</small><strong>{p.price.toFixed(1)}<span>p</span></strong></div>)}</div><div className="amenities">{s.amenities.map(a=><span key={a}><Check size={12}/>{a.replaceAll('_',' ')}</span>)}</div><div className="detail-hours"><Clock3 size={14}/><span>{hours ? `Usual ${day}: ${hours.is_24_hours ? '24 hours' : `${hours.open?.slice(0,5)}–${hours.close?.slice(0,5)}`}` : 'Opening hours not supplied'}<small>Bank holiday hours may differ.</small></span></div><div className="panel-foot">{demo?'Simulated price timestamp':'Selected fuel last updated'}<span>{dateTime(s.updated_at)}</span></div></section>;
}
