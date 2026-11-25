import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Location, Station } from '../types';

type Props = { stations: Station[]; location: Location; radius: number; selected: string | null; onSelect: (id: string) => void; tileUrl: string; saved: boolean };
export default function StationMap({ stations, location, radius, selected, onSelect, tileUrl, saved }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    if (!container.current) return;
    const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false }).setView([location.latitude, location.longitude], 12);
    L.control.zoom({ position: 'bottomright' }).addTo(instance);
    const tiles = L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(instance);
    tiles.on('tileerror', () => setTileError(true));
    markers.current = L.layerGroup().addTo(instance);
    map.current = instance;
    const resize = new ResizeObserver(() => instance.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); instance.remove(); map.current = null; };
  // Map lifecycle is independent of search and selection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tileUrl]);
  useEffect(() => {
    if (!map.current) return;
    const circle = L.circle([location.latitude, location.longitude], { radius: radius * 1609.344, color: '#28b984', weight: 1, fillOpacity: 0.035, dashArray: '5 7' });
    if (!saved) circle.addTo(map.current);
    const point = L.circleMarker([location.latitude, location.longitude], { radius: 5, color: '#fff', weight: 2, fillColor: '#338cff', fillOpacity: 1 }).addTo(map.current);
    map.current.fitBounds(circle.getBounds(), { padding: [28, 28], animate: false });
    return () => { circle.remove(); point.remove(); };
  }, [location, radius, saved, tileUrl]);
  useEffect(() => {
    markers.current?.clearLayers();
    const cheapest = Math.min(...stations.map(s => s.price));
    for (const s of stations) {
      const marker = L.marker([s.latitude, s.longitude], { zIndexOffset: s.id === selected ? 1000 : s.price === cheapest ? 500 : 0,
        title: `${s.name}: ${s.price.toFixed(1)} pence per litre`,
        icon: L.divIcon({ className: `price-pin ${s.price === cheapest ? 'best' : ''} ${s.id === selected ? 'selected' : ''}`,
          html: `<span>${Number(s.price).toFixed(1)}</span>`, iconSize: [59, 33], iconAnchor: [29, 38] }) });
      marker.on('click', () => onSelect(s.id));
      markers.current?.addLayer(marker);
    }
    if (saved && stations.length && map.current) map.current.fitBounds(L.latLngBounds(stations.map(s => [s.latitude, s.longitude] as [number,number])), { padding: [50,50], maxZoom: 13 });
  }, [stations, selected, onSelect, saved, tileUrl]);
  return <div className="map-wrap"><div ref={container} className="station-map" role="region" aria-label="Interactive station price map" />
    <div className="map-key"><i /> Cheapest in results <span>Prices in p/l</span></div>
    {tileError && <div className="map-error" role="status">Map tiles could not load. Station prices remain available in the list.</div>}
  </div>;
}
