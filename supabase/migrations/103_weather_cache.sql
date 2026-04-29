-- ============================================================
-- Migration 103: weather caches (geocode + forecast)
--
-- Two narrow cache tables for the event-weather badge that lights
-- up on group pages, signup sheets, and the dashboard within 5 days
-- of an event. Both are pure caches — nothing in the app depends on
-- them being populated, so they can be cleared anytime.
--
-- Geocoding goes through the US Census Bureau (free, no key, US-only).
-- Forecasts go through the NWS API (free, no key, US-only). Neither
-- writes to the cache directly — the lib/weather.ts helper does it
-- via the service client.
-- ============================================================

CREATE TABLE IF NOT EXISTS weather_geocode_cache (
  location_key   TEXT          PRIMARY KEY,
  lat            NUMERIC(10,6) NOT NULL,
  lon            NUMERIC(10,6) NOT NULL,
  resolved_name  TEXT,
  fetched_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weather_forecast_cache (
  -- "lat,lon" rounded to 4 decimals (~10m). Two events in the same
  -- city share a cache entry; gridpoints don't move.
  grid_key   TEXT        PRIMARY KEY,
  -- Full NWS hourly periods array (~156 entries). Renderers slice
  -- the specific hour they need at request time.
  periods    JSONB       NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE weather_geocode_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_forecast_cache ENABLE ROW LEVEL SECURITY;

-- Public weather + geocode results — no privacy concern. SELECT open
-- so the cache is reachable from the page render. Writes happen via
-- the service client (RLS bypass), no client write policy needed.
CREATE POLICY "anyone_read_geocode"  ON weather_geocode_cache  FOR SELECT USING (true);
CREATE POLICY "anyone_read_forecast" ON weather_forecast_cache FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
