import type { GpsProvider, GpsReading } from "../gps/provider";

const MOCK_ROUTE: Array<[number, number]> = [
  [6.6132, 46.5061],
  [6.6242, 46.4922],
  [6.6408, 46.4754],
  [6.6601, 46.4612],
  [6.6826, 46.4466],
  [6.7088, 46.4317],
  [6.7372, 46.4173]
];

const MOCK_SPEED_METERS_PER_SECOND = 7.2;
const STEP_MS = 1400;

export function createMockGpsProvider(): GpsProvider {
  ensureMockBadge();

  return {
    watch(onReading) {
      let routeIndex = 0;
      let stopped = false;

      const emit = () => {
        if (stopped) {
          return;
        }

        const [longitude, latitude] = MOCK_ROUTE[routeIndex];
        const reading: GpsReading = {
          latitude,
          longitude,
          accuracy: 8,
          timestamp: Date.now(),
          speedMetersPerSecond: MOCK_SPEED_METERS_PER_SECOND
        };

        onReading(reading);
        routeIndex = (routeIndex + 1) % MOCK_ROUTE.length;
      };

      emit();
      const intervalId = window.setInterval(emit, STEP_MS);

      return () => {
        stopped = true;
        window.clearInterval(intervalId);
      };
    }
  };
}

function ensureMockBadge() {
  if (document.querySelector(".dev-mock-badge")) {
    return;
  }

  const badge = document.createElement("div");
  badge.className = "dev-mock-badge";
  badge.textContent = "DEV MOCK GPS";
  document.body.appendChild(badge);
}
