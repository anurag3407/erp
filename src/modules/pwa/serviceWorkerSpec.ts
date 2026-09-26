/**
 * Module 10: Service Worker Caching Strategies Specification
 * Aligned with @serwist/next PWA configuration.
 */

export interface CacheRouteRule {
  pattern: RegExp;
  strategy: 'CacheFirst' | 'NetworkFirst' | 'StaleWhileRevalidate';
  cacheName: string;
  maxEntries: number;
  maxAgeSeconds: number;
}

export const PWA_CACHE_RULES: CacheRouteRule[] = [
  {
    pattern: /\.(?:js|css|woff2?|png|svg|ico)$/,
    strategy: 'CacheFirst',
    cacheName: 'static-assets-v1',
    maxEntries: 100,
    maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
  },
  {
    pattern: /\/api\/timetable\/student/,
    strategy: 'StaleWhileRevalidate',
    cacheName: 'timetable-cache-v1',
    maxEntries: 20,
    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
  },
  {
    pattern: /\/api\/credentials\/id-card/,
    strategy: 'CacheFirst',
    cacheName: 'id-card-cache-v1',
    maxEntries: 5,
    maxAgeSeconds: 14 * 24 * 60 * 60,
  },
  {
    pattern: /\/api\/(?:grades|finance|fees)/,
    strategy: 'NetworkFirst',
    cacheName: 'sensitive-financial-grade-cache-v1',
    maxEntries: 30,
    maxAgeSeconds: 24 * 60 * 60, // 24 hours
  },
];
