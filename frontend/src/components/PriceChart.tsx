import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingDown } from 'lucide-react';
import { api, type Fuel, type Station } from '../types';

export default function PriceChart({ station, fuel, demo }: { station: Station | null; fuel: Fuel; demo: boolean }) {
  const [days, setDays] = useState(30);
  const [points, setPoints] = useState<{ date: string; price: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setPoints([]); setError('');
    if (!station) return;
    const ctrl = new AbortController(); setLoading(true);
    api<{ points: typeof points }>(`/stations/${encodeURIComponent(station.id)}/history?fuel=${fuel}&days=${days}`, ctrl.signal)
      .then(r => setPoints(r.points)).catch(e => { if (!ctrl.signal.aborted) setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [station?.id, fuel, days]);
  return <section className="panel chart-panel">
    <div className="panel-heading"><div><h2><TrendingDown size={18} /> Price history</h2><p>{station?.name || 'Select a station to see its history'}</p></div>
      <select aria-label="History period" value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></div>
    <div className="chart-area">
      {loading ? <div className="empty">Loading price history…</div> : error ? <div role="alert" className="empty">{error}</div> : points.length === 0 ? <div className="empty">No observations yet. History builds as prices are collected.</div> :
      <ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 16, right: 20, bottom: 0, left: -20 }} accessibilityLayer>
        <CartesianGrid stroke="#2a3430" vertical={false} strokeDasharray="3 5" />
        <XAxis dataKey="date" tickFormatter={d => new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} tick={{fill:'#9ca9a2', fontSize:12}} tickLine={false} axisLine={false} minTickGap={35} />
        <YAxis domain={['dataMin - 1', 'dataMax + 1']} tickFormatter={n => n.toFixed(0)} tick={{fill:'#9ca9a2',fontSize:12}} tickLine={false} axisLine={false} />
        <Tooltip contentStyle={{background:'#1b2420',border:'1px solid #3a4b42',borderRadius:8,color:'#edf5ef'}} formatter={(v: number) => [`${v.toFixed(1)} p/l`, 'Price']} labelFormatter={d => new Date(d+'T12:00:00').toLocaleDateString('en-GB')} />
        <Line type="linear" dataKey="price" stroke="#3fdda0" strokeWidth={2.5} dot={points.length === 1 ? {r:5} : false} activeDot={{r:5,fill:'#3fdda0',stroke:'#17201b',strokeWidth:3}} isAnimationActive={false}/>
      </LineChart></ResponsiveContainer>}
    </div><div className="panel-foot">{demo ? 'Simulated history · not actual fuel prices' : 'Last observed price each day · pence per litre'}<span>{points.length} observations</span></div>
  </section>;
}
