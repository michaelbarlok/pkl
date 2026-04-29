import {
  getEventWeather,
  type WeatherIconCategory,
} from "@/lib/weather";

const ICONS: Record<WeatherIconCategory, string> = {
  clear: "☀️",
  partly_cloudy: "⛅",
  cloudy: "☁️",
  rain: "🌧️",
  thunderstorm: "⛈️",
  snow: "❄️",
  fog: "🌫️",
  wind: "💨",
};

interface Props {
  /** Free-form display location (e.g. a venue name like "Ingleside
   *  Pickleball Courts"). Used as a geocoding fallback only — venue
   *  names rarely resolve through the US Census geocoder, so prefer
   *  passing `cityState` whenever the caller has it on hand. */
  location?: string | null;
  /** Geocodable city/state hint (e.g. "Athens, TN"). When set, this
   *  is what we feed to the geocoder; `location` is ignored unless
   *  this is empty. */
  cityState?: string | null;
  /** Event start time. Badge renders only when this is set, in the
   *  future, and within 5 days. Forecast lookup rounds up to the
   *  next whole hour (5:30 → 6:00). */
  eventTime: string | Date | null | undefined;
  className?: string;
}

/**
 * Compact weather chip for an upcoming event. Renders nothing when:
 *   - no usable address (neither cityState nor location)
 *   - eventTime is missing
 *   - event is in the past or more than 5 days out
 *   - geocode or NWS fetch fails
 *
 * Pure server component — there's no client JS, no permission
 * prompts, no user-location lookup. The forecast is for the EVENT'S
 * location, not the viewer.
 */
export async function WeatherBadge({
  location,
  cityState,
  eventTime,
  className,
}: Props) {
  const weather = await getEventWeather({ location, cityState, eventTime });
  if (!weather) return null;

  const showPrecip = weather.precipPercent >= 20;
  const showWind = weather.windSpeedMph >= 10;
  const icon = ICONS[weather.iconCategory] ?? "🌡️";

  // Tooltip surfaces the bits we don't show in the compact chip,
  // plus the full NWS phrase (e.g. "Mostly Sunny then Slight Chance
  // Showers"). Hovering on desktop and long-pressing on mobile both
  // surface this via the native title attribute.
  const tooltip = [
    weather.shortForecast,
    `${weather.precipPercent}% precipitation`,
    weather.windSpeedMph > 0
      ? `${weather.windSpeedMph} mph ${weather.windDirection}`.trim()
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap ${className ?? ""}`}
      title={tooltip}
      aria-label={`Forecast: ${tooltip}`}
    >
      <span aria-hidden>{icon}</span>
      <span className="font-medium text-dark-100">{weather.temperatureF}°</span>
      {showPrecip && (
        <span className="text-blue-400">{weather.precipPercent}%</span>
      )}
      {showWind && (
        <span className="text-surface-muted">{weather.windSpeedMph} mph</span>
      )}
    </span>
  );
}
