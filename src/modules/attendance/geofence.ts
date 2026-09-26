/**
 * Module 2: Haversine Geofencing Validator
 * Computes great-circle distance between student GPS coordinates
 * and the classroom centroid, enforcing the strict 25m boundary.
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeofenceResult {
  isWithinBounds: boolean;
  distanceMeters: number;
  maxRadiusMeters: number;
  status: 'IN_BOUNDS' | 'OUT_OF_BOUNDS';
}

export class GeofenceService {
  private static EARTH_RADIUS_METERS = 6371000; // 6,371 km in meters

  /**
   * Convert degrees to radians
   */
  private static toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }

  /**
   * Calculate distance in meters using Haversine formula
   */
  static calculateDistanceMeters(point1: Coordinates, point2: Coordinates): number {
    const lat1Rad = GeofenceService.toRad(point1.latitude);
    const lat2Rad = GeofenceService.toRad(point2.latitude);
    const deltaLatRad = GeofenceService.toRad(point2.latitude - point1.latitude);
    const deltaLngRad = GeofenceService.toRad(point2.longitude - point1.longitude);

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return GeofenceService.EARTH_RADIUS_METERS * c;
  }

  /**
   * Validate whether student is within classroom 25m radius
   */
  validateClassroomGeofence(
    studentCoords: Coordinates,
    classroomCoords: Coordinates,
    maxRadiusMeters: number = 25
  ): GeofenceResult {
    const distanceMeters = GeofenceService.calculateDistanceMeters(studentCoords, classroomCoords);
    const isWithinBounds = distanceMeters <= maxRadiusMeters;

    return {
      isWithinBounds,
      distanceMeters: Math.round(distanceMeters * 100) / 100, // 2 decimal precision
      maxRadiusMeters,
      status: isWithinBounds ? 'IN_BOUNDS' : 'OUT_OF_BOUNDS',
    };
  }
}

export const geofenceService = new GeofenceService();
