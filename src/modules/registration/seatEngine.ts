import { redis } from '../../lib/redis.js';

/**
 * Module 1: In-Memory Atomic Seat Decrement & Cart Reservation Engine
 * Uses atomic Redis operations and Lua scripts to prevent over-enrollment
 * and eliminate database load during high concurrency.
 */

export class SeatReservationEngine {
  private static LUA_SEAT_RESERVATION_SCRIPT = `
    local seats = redis.call('GET', KEYS[1])
    if seats and tonumber(seats) > 0 then
        redis.call('DECR', KEYS[1])
        local holdSeconds = tonumber(ARGV[2]) or 300
        redis.call('SETEX', KEYS[2], holdSeconds, ARGV[1]) -- Cart hold
        return 1
    end
    return 0
  `;

  /**
   * Synchronize course offering capacity into Redis seat counter
   */
  async initializeOfferingSeats(offeringId: string, availableSeats: number): Promise<void> {
    const key = `course:${offeringId}:seats`;
    await redis.set(key, availableSeats.toString());
  }

  /**
   * Atomically reserve a course seat for a given TTL (default 300 seconds)
   * Returns true if reserved, false if exhausted
   */
  async reserveSeat(offeringId: string, studentId: string, ttlSeconds: number = 300): Promise<boolean> {
    const seatsKey = `course:${offeringId}:seats`;
    const reservationKey = `reservation:${studentId}:${offeringId}`;

    const result = await redis.eval(
      SeatReservationEngine.LUA_SEAT_RESERVATION_SCRIPT,
      2,
      seatsKey,
      reservationKey,
      studentId,
      ttlSeconds.toString()
    );

    return result === 1;
  }

  /**
   * Check if student holds an active seat reservation
   */
  async hasActiveReservation(offeringId: string, studentId: string): Promise<boolean> {
    const reservationKey = `reservation:${studentId}:${offeringId}`;
    const holder = await redis.get(reservationKey);
    return holder === studentId;
  }

  /**
   * Commit reservation upon successful checkout.
   * Removes the temporary cart hold key WITHOUT incrementing available seats
   * (the seat is permanently taken by the student).
   */
  async commitReservation(offeringId: string, studentId: string): Promise<void> {
    const reservationKey = `reservation:${studentId}:${offeringId}`;
    await redis.del(reservationKey);
  }

  /**
   * Release seat reservation (e.g. if user cancels cart, timeout, or checkout failure).
   * Restores available seat counter back to the pool.
   */
  async releaseReservation(offeringId: string, studentId: string): Promise<void> {
    const reservationKey = `reservation:${studentId}:${offeringId}`;
    const holder = await redis.get(reservationKey);
    if (holder === studentId) {
      await redis.del(reservationKey);
      await redis.incr(`course:${offeringId}:seats`);
    }
  }

  /**
   * Query current available seat counter
   */
  async getAvailableSeats(offeringId: string): Promise<number> {
    const seatsStr = await redis.get(`course:${offeringId}:seats`);
    if (!seatsStr) return 0;
    const count = parseInt(seatsStr, 10);
    return Math.max(0, isNaN(count) ? 0 : count);
  }
}

export const seatEngine = new SeatReservationEngine();
