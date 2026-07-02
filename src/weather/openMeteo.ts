import type { GpsReading } from "../gps/provider";

export type WeatherPeriod = "now" | "plus30m" | "plus1h" | "plus2h";

export type WeatherSnapshot = {
  period: WeatherPeriod;
  label: string;
  time: string;
  temperatureC: number | null;
  weatherCode: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
};

export type WeatherForecast = {
  now: WeatherSnapshot;
  forecasts: WeatherSnapshot[];
  updatedAt: string;
};

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
  minutely_15?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
};

const CURRENT_FIELDS = [
  "temperature_2m",
  "weather_code",
  "wind_speed_10m",
  "wind_direction_10m"
].join(",");

export async function fetchWeatherForPosition(reading: GpsReading): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: reading.latitude.toString(),
    longitude: reading.longitude.toString(),
    current: CURRENT_FIELDS,
    hourly: CURRENT_FIELDS,
    minutely_15: CURRENT_FIELDS,
    forecast_hours: "3",
    forecast_minutely_15: "9",
    timezone: "auto",
    wind_speed_unit: "kmh"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const now = createCurrentSnapshot(data);

  return {
    now,
    forecasts: createForecastSnapshots(data, now.time),
    updatedAt: new Date().toISOString()
  };
}

function createCurrentSnapshot(data: OpenMeteoResponse): WeatherSnapshot {
  const current = data.current ?? {};

  return {
    period: "now",
    label: "Maintenant",
    time: current.time ?? new Date().toISOString(),
    temperatureC: numberOrNull(current.temperature_2m),
    weatherCode: numberOrNull(current.weather_code),
    windSpeedKmh: numberOrNull(current.wind_speed_10m),
    windDirectionDeg: numberOrNull(current.wind_direction_10m)
  };
}

function createForecastSnapshots(data: OpenMeteoResponse, currentTime: string): WeatherSnapshot[] {
  const currentDate = new Date(currentTime);
  const targets: Array<{ period: WeatherPeriod; label: string; minutes: number }> = [
    { period: "plus30m", label: "+30 min", minutes: 30 },
    { period: "plus1h", label: "+1h", minutes: 60 },
    { period: "plus2h", label: "+2h", minutes: 120 }
  ];

  return targets
    .map((target) => createForecastSnapshot(data, currentDate, target))
    .filter((snapshot): snapshot is WeatherSnapshot => snapshot !== null);
}

function createForecastSnapshot(
  data: OpenMeteoResponse,
  currentDate: Date,
  target: { period: WeatherPeriod; label: string; minutes: number }
): WeatherSnapshot | null {
  const source = data.minutely_15?.time?.length ? data.minutely_15 : data.hourly;

  if (!source?.time?.length) {
    return null;
  }

  const targetTime = currentDate.getTime() + target.minutes * 60 * 1000;
  const index = source.time.findIndex((time) => new Date(time).getTime() >= targetTime);

  if (index < 0) {
    return null;
  }

  return {
    period: target.period,
    label: target.label,
    time: source.time[index],
    temperatureC: numberOrNull(source.temperature_2m?.[index]),
    weatherCode: numberOrNull(source.weather_code?.[index]),
    windSpeedKmh: numberOrNull(source.wind_speed_10m?.[index]),
    windDirectionDeg: numberOrNull(source.wind_direction_10m?.[index])
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function describeWeatherCode(code: number | null): string {
  if (code === null) {
    return "--";
  }

  if (code === 0) return "Clair";
  if ([1, 2].includes(code)) return "Variable";
  if (code === 3) return "Couvert";
  if ([45, 48].includes(code)) return "Brouillard";
  if ([51, 53, 55, 56, 57].includes(code)) return "Bruine";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Pluie";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Neige";
  if ([95, 96, 99].includes(code)) return "Orage";

  return "Météo";
}

export function getWeatherIconPath(code: number | null): string {
  const basePath = "/weather-icons";

  if (code === null) {
    return `${basePath}/not-available.svg`;
  }

  if (code === 0) return `${basePath}/clear-day.svg`;
  if ([1, 2].includes(code)) return `${basePath}/partly-cloudy-day.svg`;
  if (code === 3) return `${basePath}/overcast.svg`;
  if ([45, 48].includes(code)) return `${basePath}/fog.svg`;
  if ([51, 53, 55, 56, 57].includes(code)) return `${basePath}/drizzle.svg`;
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return `${basePath}/rain.svg`;
  if ([71, 73, 75, 77, 85, 86].includes(code)) return `${basePath}/snow.svg`;
  if ([95, 96, 99].includes(code)) return `${basePath}/thunderstorms.svg`;

  return `${basePath}/cloudy.svg`;
}

export function formatWindDirection(degrees: number | null): string {
  if (degrees === null) {
    return "--";
  }

  const directions = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];
  const index = Math.round(degrees / 45) % directions.length;
  return directions[index];
}
