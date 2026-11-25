import { useState } from 'react';
import { Calculator as CalculatorIcon, Info } from 'lucide-react';
import { money, type Results } from '../types';

export default function Calculator({ data }: { data: Results | null }) {
  const [litres, setLitres] = useState('50');
  const [baseline, setBaseline] = useState('');
  const [miles, setMiles] = useState('0');
  const [mpg, setMpg] = useState('40');
  const amount = Number(litres), consumption = Number(mpg), detour = Number(miles);
  const compare = baseline === '' ? data?.average ?? 0 : Number(baseline);
  const cheapest = data?.cheapest;
  const valid = litres !== '' && amount > 0 && amount <= 200 && compare > 0 && compare < 1000 && consumption > 0 && consumption <= 200 && miles !== '' && detour >= 0 && detour <= 500;
  const gross = cheapest ? (compare-cheapest.price)*amount/100 : 0;
  const travel = cheapest ? detour/consumption*4.54609*cheapest.price/100 : 0;
  return <section className="panel calculator-panel"><div className="panel-heading"><div><h2><CalculatorIcon size={18}/> Make your fill-up count</h2><p>Compare the cheapest result with your usual price.</p></div></div>
    <div className="calculator-fields"><label>Fuel to buy <div className="unit-input"><input type="number" min="1" max="200" step="1" value={litres} onChange={e => setLitres(e.target.value)} /><span>litres</span></div></label>
      <label>Compare price <div className="unit-input"><input type="number" min="0.1" max="999" step="0.1" placeholder={data?.average?.toFixed(1) || 'Local average'} value={baseline} onChange={e => setBaseline(e.target.value)} /><span>p/l</span></div></label>
      <label>Extra round-trip distance <div className="unit-input"><input type="number" min="0" max="500" step="0.1" value={miles} onChange={e => setMiles(e.target.value)} /><span>miles</span></div></label>
      <label>Vehicle economy <div className="unit-input"><input type="number" min="1" max="200" value={mpg} onChange={e => setMpg(e.target.value)} /><span>UK mpg</span></div></label></div>
    {!cheapest ? <p className="empty">Find stations to calculate a fill-up.</p> : !valid ? <p role="alert" className="field-error">Enter 1–200 litres, a valid price, 0–500 extra miles and 1–200 UK mpg.</p> : <div className="calculation" aria-live="polite"><div><small>Fill-up cost</small><strong>{money(cheapest.price*amount/100)}</strong></div><div><small>{gross-travel >= 0 ? 'Estimated saving' : 'Extra cost'}</small><strong className={gross-travel >= 0 ? 'green' : 'amber'}>{money(Math.abs(gross-travel))}</strong></div></div>}
    <p className="calc-note"><Info size={14}/><span>{data?.status.mode === 'demo' ? 'Demo estimate. ' : ''}Savings include extra fuel for your detour. Blank comparison uses the result average. Distances shown on stations are straight-line, not driving distances.</span></p>
  </section>;
}
