import type { GpsProvider, GpsReading } from "./provider";

export function createRealGpsProvider(): GpsProvider {
  return {
    watch(onReading, onError) {
      if (!("geolocation" in navigator)) {
        onError("La géolocalisation n'est pas disponible sur cet appareil.");
        return () => undefined;
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { coords } = position;
          const reading: GpsReading = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            timestamp: position.timestamp,
            speedMetersPerSecond: coords.speed
          };

          onReading(reading);
        },
        (error) => {
          if (error.code === error.PERMISSION_DENIED) {
            onError("Permission GPS refusée.");
            return;
          }

          if (error.code === error.POSITION_UNAVAILABLE) {
            onError("Position GPS indisponible.");
            return;
          }

          if (error.code === error.TIMEOUT) {
            onError("Recherche GPS trop longue.");
            return;
          }

          onError("Impossible d'obtenir la position GPS.");
        },
        {
          enableHighAccuracy: true,
          maximumAge: 5000,
          timeout: 12000
        }
      );

      return () => navigator.geolocation.clearWatch(watchId);
    }
  };
}
