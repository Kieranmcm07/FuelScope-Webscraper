export type Fuel = 'E10' | 'E5' | 'B7_STANDARD';
export const fuelName: Record<Fuel, string> = { E10: 'Unleaded', E5: 'Super unleaded', B7_STANDARD: 'Diesel' };
export type Location = { name: string; latitude: number; longitude: number };
export type Price = { fuel: Fuel; price: number; updated_at: string };
export type Station = Price & {
  id: string; name: string; brand: string; address: string; postcode: string; city: string;
  latitude: number; longitude: number; distance: number; amenities: string[]; prices: Price[];
  opening_times: { usual_days?: Record<string, { open: string; close: string; is_24_hours: boolean }> };
};
export type Status = { mode: 'demo' | 'live'; last_success: string | null; next_refresh: string | null;
  refreshing: boolean; error: string | null; stale: boolean; refresh_seconds: number; tile_url: string };
export type Results = { stations: Station[]; count: number; cheapest: Station | null; average: number | null; status: Status };
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api' + path, { signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.detail === 'string' ? error.detail : 'Unable to load data. Check that the FuelScope server is running.');
  }
  return response.json();
}
export const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
export const dateTime = (s: string | null) => s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : 'Not yet available';
export const stalePrice = (s: string) => Date.now() - new Date(s).getTime() > 86400000;
