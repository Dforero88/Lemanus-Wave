import type { GpsReading } from "../gps/provider";

export type WeatherPeriod = "now" | "plus1h";

export type WeatherSnapshot = {
  period: WeatherPeriod;
  label: string;
  time: string;
  temperatureC: number | null;
  weatherCode: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
};

export type WeatherForecast = {
  now: WeatherSnapshot;
  plus1h: WeatherSnapshot | null;
  updatedAt: string;
};

type OpenMeteoResponse = {
  current?: {
    time?: string;
    temperature_2m?: number;
    weather_code?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    weather_code?: number[];
    precipitation?: number[];
    wind_speed_10m?: number[];
    wind_direction_10m?: number[];
  };
};

const CURRENT_FIELDS = [
  "temperature_2m",
  "weather_code",
  "precipitation",
  "wind_speed_10m",
  "wind_direction_10m"
].join(",");

export async function fetchWeatherForPosition(reading: GpsReading): Promise<WeatherForecast> {
  const params = new URLSearchParams({
    latitude: reading.latitude.toString(),
    longitude: reading.longitude.toString(),
    current: CURRENT_FIELDS,
    hourly: CURRENT_FIELDS,
    forecast_hours: "3",
    timezone: "auto",
    wind_speed_unit: "kmh",
    precipitation_unit: "mm"
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }

  const data = (await response.json()) as OpenMeteoResponse;
  const now = createCurrentSnapshot(data);

  return {
    now,
    plus1h: createPlus1hSnapshot(data, now.time),
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
    precipitationMm: numberOrNull(current.precipitation),
    windSpeedKmh: numberOrNull(current.wind_speed_10m),
    windDirectionDeg: numberOrNull(current.wind_direction_10m)
  };
}

function createPlus1hSnapshot(data: OpenMeteoResponse, currentTime: string): WeatherSnapshot | null {
  const hourly = data.hourly;

  if (!hourly?.time?.length) {
    return null;
  }

  const currentDate = new Date(currentTime);
  const targetTime = currentDate.getTime() + 60 * 60 * 1000;
  const index = hourly.time.findIndex((time) => new Date(time).getTime() >= targetTime);

  if (index < 0) {
    return null;
  }

  return {
    period: "plus1h",
    label: "+1h",
    time: hourly.time[index],
    temperatureC: numberOrNull(hourly.temperature_2m?.[index]),
    weatherCode: numberOrNull(hourly.weather_code?.[index]),
    precipitationMm: numberOrNull(hourly.precipitation?.[index]),
    windSpeedKmh: numberOrNull(hourly.wind_speed_10m?.[index]),
    windDirectionDeg: numberOrNull(hourly.wind_direction_10m?.[index])
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
