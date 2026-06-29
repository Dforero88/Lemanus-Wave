export type OrientationReading = {
  headingDegrees: number;
  timestamp: number;
};

export type OrientationProvider = {
  watch: (
    onReading: (reading: OrientationReading) => void,
    onError: (message: string) => void
  ) => Promise<() => void>;
};

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

export function createOrientationProvider(): OrientationProvider {
  if (import.meta.env.DEV) {
    const params = new URLSearchParams(window.location.search);

    if (params.get("gps") === "mock") {
      return createMockOrientationProvider();
    }
  }

  return createDeviceOrientationProvider();
}

function createMockOrientationProvider(): OrientationProvider {
  return {
    async watch(onReading) {
      onReading({
        headingDegrees: 180,
        timestamp: Date.now()
      });

      return () => undefined;
    }
  };
}

function createDeviceOrientationProvider(): OrientationProvider {
  return {
    async watch(onReading, onError) {
      if (!("DeviceOrientationEvent" in window)) {
        onError("Orientation indisponible sur cet appareil.");
        return () => undefined;
      }

      const orientationEvent = DeviceOrientationEvent as DeviceOrientationEventWithPermission;

      if (typeof orientationEvent.requestPermission === "function") {
        const permission = await orientationEvent.requestPermission();

        if (permission !== "granted") {
          onError("Permission orientation refusée.");
          return () => undefined;
        }
      }

      const handleOrientation = (event: DeviceOrientationEvent) => {
        const webkitHeading = getWebkitCompassHeading(event);
        const headingDegrees = webkitHeading ?? getCompassHeadingFromAlpha(event.alpha);

        if (headingDegrees === null) {
          return;
        }

        onReading({
          headingDegrees,
          timestamp: Date.now()
        });
      };

      window.addEventListener("deviceorientation", handleOrientation, true);

      return () => {
        window.removeEventListener("deviceorientation", handleOrientation, true);
      };
    }
  };
}

function getWebkitCompassHeading(event: DeviceOrientationEvent): number | null {
  const heading = (event as DeviceOrientationEvent & { webkitCompassHeading?: unknown }).webkitCompassHeading;
  return typeof heading === "number" && Number.isFinite(heading) ? normalizeDegrees(heading) : null;
}

function getCompassHeadingFromAlpha(alpha: number | null): number | null {
  if (typeof alpha !== "number" || !Number.isFinite(alpha)) {
    return null;
  }

  return normalizeDegrees(360 - alpha);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}
