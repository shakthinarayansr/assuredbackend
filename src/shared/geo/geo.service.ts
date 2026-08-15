import { Injectable } from '@nestjs/common';

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Haversine in application code (TRD §5). PostGIS is deferred until the
 * candidate-set size makes it necessary — at pilot volume it is complexity
 * without benefit.
 */
@Injectable()
export class GeoService {
  distanceMetres(a: LatLng, b: LatLng): number {
    const dLat = toRadians(b.lat - a.lat);
    const dLng = toRadians(b.lng - a.lng);
    const lat1 = toRadians(a.lat);
    const lat2 = toRadians(b.lat);

    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  isWithinRadius(point: LatLng, centre: LatLng, radiusM: number): boolean {
    return this.distanceMetres(point, centre) <= radiusM;
  }

  /**
   * Implied travel speed between two observations, in km/h.
   * A secondary integrity signal — a flag, never a rejection (TRD §8.7).
   */
  impliedSpeedKmh(from: LatLng, fromAt: Date, to: LatLng, toAt: Date): number | null {
    const elapsedMs = toAt.getTime() - fromAt.getTime();
    if (elapsedMs <= 0) return null;

    const metres = this.distanceMetres(from, to);
    return (metres / 1000 / elapsedMs) * 3_600_000;
  }
}
