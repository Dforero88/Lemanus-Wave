import { createRealGpsProvider } from "./realGps";

export type GpsReading = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  speedMetersPerSecond: number | null;
};

export type GpsProvider = {
  watch: (onReading: (reading: GpsReading) => void, onError: (message: string) => void) => () => void;
};

export function createGpsProvider(): GpsProvider {
  if (import.meta.env.DEV) {
    return createDevGpsProvider();
  }

  return createRealGpsProvider();
}

function createDevGpsProvider(): GpsProvider {
  return {
    watch(onReading, onError) {
      const params = new URLSearchParams(window.location.search);

      if (params.get("gps") === "mock") {
        return startMockGps(onReading);
      }

      return createRealGpsProvider().watch(onReading, onError);
    }
  };
}

function startMockGps(onReading: (reading: GpsReading) => void): () => void {
  let active = true;
  let cleanup: () => void = () => undefined;

  void import("../dev/mockGps").then(({ createMockGpsProvider }) => {
    if (!active) {
      return;
    }

    const provider = createMockGpsProvider();
    cleanup = provider.watch(onReading, () => undefined);
  });

  return () => {
    active = false;
    cleanup();
  };
}
