# Verified Fuel Finder integration

Official documents retrieved on 24 November 2026 (before implementation):

- [GOV.UK access guidance](https://www.gov.uk/guidance/access-the-latest-fuel-prices-and-forecourt-data-via-api-or-email)
- [Public API overview](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/public-api)
- [Authentication](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/api-authentication)
- [Developer guidelines](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/dev-guideline)
- [API fields guide](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/api-guide)
- [Information Recipient OpenAPI](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/api/openapi/info-recipent.en.json)
- [Access Token OpenAPI](https://www.developer.fuel-finder.service.gov.uk/fuel-finder/api/openapi/access-token.en.json)

The two `.openapi.json` files here are unmodified official documentation snapshots, not captured account responses. Any credentials shown in their examples are the public documentation's example values, not working FuelScope credentials.

## Implemented contract

Production base: `https://www.fuel-finder.service.gov.uk`

| Purpose | Request | Response used |
| --- | --- | --- |
| Access token | `POST /api/v1/oauth/generate_access_token`, JSON `client_id`, `client_secret` | `data.access_token`, `data.expires_in` |
| Station information | `GET /api/v1/pfs?batch-number=N` with Bearer token | Stations keyed by `node_id`; `location`, `brand_name`, `trading_name`, closures, amenities, opening times |
| Prices | `GET /api/v1/pfs/fuel-prices?batch-number=N` with Bearer token | `node_id`, `fuel_prices[]`, `fuel_type`, `price`, `price_last_updated` |

The generic authentication guide includes illustrative form-encoded OAuth instructions. The **endpoint-specific OpenAPI** instead specifies JSON containing client ID and secret; this adapter follows that specific contract. It does not guess a scope or append an invented OAuth path.

The data schema specifies an object with a `data` array, while its examples show a bare array. Both documented forms are accepted. Unsupported envelopes fail closed. `B7_Standard` in the field guide and `B7_STANDARD` in the OpenAPI examples are normalised to `B7_STANDARD`. Prices are pence per litre; no multiplication by 100 is applied. Zero/null prices are omitted. Invalid values or required fields fail validation and retain the previous snapshot.

Full-fetch pagination continues through short pages until the documented HTTP **404** end marker. It never assumes a short page is the last batch. Unexpected empty successful batches, repeated batches, exhausted safeguards or network errors do not replace the existing snapshot. Incremental endpoints exist in the documentation, but this MVP uses full refreshes only. A greater-than-30% drop in stations with prices also preserves the previous snapshot and displays an error; investigate upstream coverage before changing this guard.

## Refresh and rate limits

- Official limit: 100 requests/minute/client; **one concurrent request**.
- This implementation: a single background sync worker, at least 1.05 seconds between requests including token calls, with no manual upstream refresh endpoint.
- Prices default to a 30-minute refresh; configurable, with a 15-minute minimum. Station metadata is cached for one hour. The browser reloads the local results every minute when visible.
- Access tokens remain in memory and renew before expiry; a 401 allows one fresh-token retry. 403/authentication errors fail visibly.
- Network errors and 5xx responses get two exponential retries. 429 responses pause collection for at least `Retry-After` (seconds or HTTP date), or five minutes if absent; the ordinary refresh interval may make this longer. No response bodies or credentials are logged or sent to the UI.
- Successful snapshots and observed history are written in a single SQLite transaction. History retains the last observation per UTC day for up to 365 days. Failed collection leaves both intact. Real price changes are not reconstructed for dates before collection began.
- A restart respects the interval after the last successful snapshot. Keep a single instance running for each credential pair; cross-process/distributed rate limiting is outside this local MVP.

## Geocoding and map documentation

Town search uses [`GET /places?q=...`](https://postcodes.io/docs/api/place-query/); full postcodes use [`GET /postcodes/:postcode`](https://postcodes.io/docs/api/lookup-postcode/). Only coordinates and display names are retained in the local cache. It is an explicit submit search, not keystroke autocomplete. Queries are parameterised and bounded; database values use SQL parameters.

OpenStreetMap uses the [documented HTTPS tile URL](https://operations.osmfoundation.org/policies/tiles/) with browser caching, visible attribution and no prefetch features. FuelScope does not use the public Nominatim service.

## Verification boundary

Official documentation and unauthenticated geocoding were checked live. Fuel Finder authentication/data collection were tested with HTTP mocks, including documented response shapes and failure cases. Production credential validation and a real complete UK pull remain to be verified after the operator configures credentials.
