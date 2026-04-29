/**
 * Event weather lookup. Server-side only — never touches user
 * geolocation, never asks for permissions. Geocoding tries the US
 * Census Bureau first (best for full street addresses) then falls
 * back to OpenStreetMap's Nominatim for city/state-only lookups
 * Census can't resolve. Forecasts come from NWS (api.weather.gov).
 * All three are free and key-less.
 *
 * Used for: small weather chips on group pages, signup sheets, and
 * the dashboard's upcoming-events list, gated to "event has a start
 * time AND start time is within 5 days from now AND in the future."
 *
 * Caching layout (migration 103):
 *   weather_geocode_cache    — location string → (lat, lon)
 *   weather_forecast_cache   — "lat,lon" → array of NWS hourly periods
 *
 * Two events in the same city share both caches.
 */

import { createServiceClient } from "@/lib/supabase/server";

// NWS asks every consumer to identify themselves; this is the
// recommended User-Agent shape: "AppName/Version (contact)".
const USER_AGENT = "TriStarPickleball/1.0 (info@tristarpickleball.com)";

const GEOCODE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days — cities don't move
const FORECAST_TTL_MS = 30 * 60 * 1000;          // 30 minutes
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

/**
 * One hourly period as NWS returns it. Trimmed to the fields we
 * actually consume; everything else is ignored.
 */
interface NwsHourlyPeriod {
  number: number;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  probabilityOfPrecipitation?: { value: number | null } | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
}

export type WeatherIconCategory =
  | "clear"
  | "partly_cloudy"
  | "cloudy"
  | "rain"
  | "thunderstorm"
  | "snow"
  | "fog"
  | "wind";

export interface WeatherSummary {
  shortForecast: string;
  iconCategory: WeatherIconCategory;
  temperatureF: number;
  precipPercent: number;
  windSpeedMph: number;
  windDirection: string;
  isDaytime: boolean;
  /** ISO timestamp of the hour the badge represents (the rounded-up
   *  whole hour from the event's start_time). */
  forHourIso: string;
}

/**
 * Map NWS shortForecast text to a coarse category for icon picking.
 * Order matters — thunderstorm beats rain, rain beats clouds, etc.
 */
function categorizeForecast(text: string): WeatherIconCategory {
  const t = text.toLowerCase();
  if (t.includes("thunder")) return "thunderstorm";
  if (t.includes("snow") || t.includes("flurr") || t.includes("blizzard")) return "snow";
  if (t.includes("rain") || t.includes("shower") || t.includes("drizzle")) return "rain";
  if (t.includes("fog") || t.includes("haze") || t.includes("mist")) return "fog";
  if (t.includes("wind")) return "wind";
  if (t.includes("partly") || t.includes("scattered")) return "partly_cloudy";
  if (t.includes("cloud") || t.includes("overcast") || t.includes("mostly cloudy")) return "cloudy";
  return "clear";
}

function parseWindMph(s: string | null | undefined): number {
  if (!s) return 0;
  // "5 mph" or "5 to 10 mph" — take the upper bound
  const m = s.match(/(\d+)\s*(?:to\s*(\d+))?\s*mph/i);
  if (!m) return 0;
  return Number(m[2] ?? m[1]);
}

/**
 * Round a Date forward to the next whole hour. 5:30 → 6:00. 6:00 →
 * 6:00 (already on the hour). Date arithmetic in UTC, but the wall-
 * clock hour comes out right because Date stores epoch ms and the
 * input is timezone-aware.
 */
function nextWholeHour(time: Date): Date {
  const d = new Date(time);
  if (
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  ) {
    return d;
  }
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(d.getUTCHours() + 1);
  return d;
}

/**
 * Find the hourly period that covers a given target time. NWS
 * periods are 1 hour each — we look for the one whose [startTime,
 * endTime) contains the target. Falls back to the closest period
 * within an hour if exact containment fails (handles the edge case
 * where the forecast hasn't been updated past the target hour yet).
 */
function pickPeriodForHour(
  periods: NwsHourlyPeriod[],
  targetIso: string
): NwsHourlyPeriod | null {
  const target = new Date(targetIso).getTime();
  for (const p of periods) {
    const start = new Date(p.startTime).getTime();
    const end = new Date(p.endTime).getTime();
    if (start <= target && target < end) return p;
  }
  let best: NwsHourlyPeriod | null = null;
  let bestDiff = Infinity;
  for (const p of periods) {
    const diff = Math.abs(new Date(p.startTime).getTime() - target);
    if (diff < bestDiff && diff <= 60 * 60 * 1000) {
      best = p;
      bestDiff = diff;
    }
  }
  return best;
}

async function geocode(
  location: string
): Promise<{ lat: number; lon: number } | null> {
  if (!location.trim()) return null;
  const key = location.trim().toLowerCase();
  const service = await createServiceClient();

  const { data: cached } = await service
    .from("weather_geocode_cache")
    .select("lat, lon, fetched_at")
    .eq("location_key", key)
    .maybeSingle();

  if (
    cached &&
    Date.now() - new Date(cached.fetched_at).getTime() < GEOCODE_TTL_MS
  ) {
    return { lat: Number(cached.lat), lon: Number(cached.lon) };
  }

  // Try Census first — it's our preferred source for actual street
  // addresses (precise + US-only by design). Returns nothing for
  // city/state-only inputs like "Athens, TN" though, since the
  // onelineaddress endpoint requires a parsed street component.
  let lat: number | null = null;
  let lon: number | null = null;
  let resolvedName: string | null = null;

  try {
    const url = new URL(
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"
    );
    url.searchParams.set("address", location);
    url.searchParams.set("benchmark", "Public_AR_Current");
    url.searchParams.set("format", "json");
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const match = data?.result?.addressMatches?.[0];
      if (match) {
        const cy = Number(match.coordinates?.y);
        const cx = Number(match.coordinates?.x);
        if (Number.isFinite(cy) && Number.isFinite(cx)) {
          lat = cy;
          lon = cx;
          resolvedName = match.matchedAddress ?? null;
        }
      }
    }
  } catch {
    // Census failed — fall through to Nominatim.
  }

  // Fall back to Nominatim (OpenStreetMap) for city/state-only
  // inputs that Census can't resolve. Free, no key required, but
  // capped at 1 req/sec by the public instance — fine for us
  // because the 30-day geocode cache eats the long tail. We include
  // a contact in the User-Agent per their usage policy.
  if (lat === null || lon === null) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("q", location);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "us");
      const res = await fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        const match = Array.isArray(data) ? data[0] : null;
        if (match) {
          const ny = Number(match.lat);
          const nx = Number(match.lon);
          if (Number.isFinite(ny) && Number.isFinite(nx)) {
            lat = ny;
            lon = nx;
            resolvedName = (match.display_name as string | undefined) ?? null;
          }
        }
      }
    } catch {
      // Nominatim failed too — return null below.
    }
  }

  if (lat === null || lon === null) return null;

  await service.from("weather_geocode_cache").upsert({
    location_key: key,
    lat,
    lon,
    resolved_name: resolvedName,
    fetched_at: new Date().toISOString(),
  });

  return { lat, lon };
}

async function fetchForecast(
  lat: number,
  lon: number
): Promise<NwsHourlyPeriod[] | null> {
  const rlat = lat.toFixed(4);
  const rlon = lon.toFixed(4);
  const gridKey = `${rlat},${rlon}`;

  const service = await createServiceClient();
  const { data: cached } = await service
    .from("weather_forecast_cache")
    .select("periods, fetched_at")
    .eq("grid_key", gridKey)
    .maybeSingle();

  if (
    cached &&
    Date.now() - new Date(cached.fetched_at).getTime() < FORECAST_TTL_MS
  ) {
    return cached.periods as NwsHourlyPeriod[];
  }

  try {
    // NWS two-step: lat/lon → gridpoint → hourly forecast URL.
    const pointsRes = await fetch(`https://api.weather.gov/points/${rlat},${rlon}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!pointsRes.ok) return null;
    const pointsData = await pointsRes.json();
    const forecastHourlyUrl = pointsData?.properties?.forecastHourly as string | undefined;
    if (!forecastHourlyUrl) return null;

    const forecastRes = await fetch(forecastHourlyUrl, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/geo+json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!forecastRes.ok) return null;
    const forecastData = await forecastRes.json();
    const periods = forecastData?.properties?.periods as NwsHourlyPeriod[] | undefined;
    if (!periods || periods.length === 0) return null;

    await service.from("weather_forecast_cache").upsert({
      grid_key: gridKey,
      periods,
      fetched_at: new Date().toISOString(),
    });

    return periods;
  } catch {
    return null;
  }
}

/**
 * Public entry point. Returns null whenever a badge shouldn't render
 * (no usable address, no time, in the past, more than 5 days out,
 * geocode failed, NWS down, etc.) so callers can use it directly
 * without extra guards. Errors are swallowed — a missing weather chip
 * is always preferable to a broken page.
 *
 * Geocoding hint priority:
 *   1. `cityState` (e.g. "Athens, TN") — preferred. Sheet venue names
 *      like "Ingleside Pickleball Courts" don't resolve through the US
 *      Census geocoder, so the group's city/state is what we actually
 *      want to feed to it. Tournament organizers also typically enter a
 *      city/state here.
 *   2. `location` — fallback for older callers / data with no
 *      city/state. Will silently fail to geocode if it's a venue name.
 */
export async function getEventWeather(opts: {
  location?: string | null;
  cityState?: string | null;
  eventTime: Date | string | null | undefined;
}): Promise<WeatherSummary | null> {
  const geocodeStr =
    opts.cityState?.trim() || opts.location?.trim() || "";
  if (!geocodeStr || !opts.eventTime) return null;

  const eventTime =
    typeof opts.eventTime === "string" ? new Date(opts.eventTime) : opts.eventTime;
  if (Number.isNaN(eventTime.getTime())) return null;

  const now = Date.now();
  const eventMs = eventTime.getTime();
  if (eventMs < now) return null;
  if (eventMs - now > FIVE_DAYS_MS) return null;

  const coords = await geocode(geocodeStr);
  if (!coords) return null;

  const periods = await fetchForecast(coords.lat, coords.lon);
  if (!periods) return null;

  const targetHour = nextWholeHour(eventTime);
  const period = pickPeriodForHour(periods, targetHour.toISOString());
  if (!period) return null;

  return {
    shortForecast: period.shortForecast,
    iconCategory: categorizeForecast(period.shortForecast),
    temperatureF: period.temperature,
    precipPercent: period.probabilityOfPrecipitation?.value ?? 0,
    windSpeedMph: parseWindMph(period.windSpeed),
    windDirection: period.windDirection ?? "",
    isDaytime: period.isDaytime,
    forHourIso: period.startTime,
  };
}
