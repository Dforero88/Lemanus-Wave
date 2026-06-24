import type { GpsProvider, GpsReading } from "../gps/provider";

const MOCK_POSITION: [number, number] = [6.6132, 46.5061];

export function createMockGpsProvider(): GpsProvider {
  ensureMockBadge();

  return {
    watch(onReading) {
      const [longitude, latitude] = MOCK_POSITION;
      const reading: GpsReading = {
        latitude,
        longitude,
        accuracy: 8,
        timestamp: Date.now(),
        speedMetersPerSecond: null
      };

      onReading(reading);

      return () => undefined;
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
