import { redis } from '../../lib/redis.js';
import { generateQueueToken, verifyQueueToken, type QueueTokenPayload } from '../../lib/crypto.js';

/**
 * Module 1: Virtual Waiting Room Engine
 * Implements Redis sliding-window token bucket queue throttling and HMAC-SHA256 tokenization.
 */

export interface WaitingRoomStatus {
  allowed: boolean;
  queuePosition: number;
  token?: string;
  estimatedWaitSeconds: number;
  activeCount: number;
  maxCapacity: number;
}

export class WaitingRoomService {
  private maxConcurrentActive: number;
  private secret: string;

  constructor(maxConcurrentActive: number = 500, secret?: string) {
    this.maxConcurrentActive = maxConcurrentActive;
    this.secret = secret || process.env.WAITING_ROOM_SECRET || 'waiting-room-hmac-secret-2026';
  }

  /**
   * Request admission to the course registration portal
   */
  async requestEntry(studentId: string): Promise<WaitingRoomStatus> {
    const slot = await redis.checkWaitingRoomSlot(studentId, this.maxConcurrentActive);

    if (slot.allowed) {
      // Slot granted: issue signed HMAC-SHA256 access token
      const { token } = generateQueueToken(studentId, 0, 600, this.secret);
      return {
        allowed: true,
        queuePosition: 0,
        token,
        estimatedWaitSeconds: 0,
        activeCount: slot.activeCount,
        maxCapacity: this.maxConcurrentActive,
      };
    }

    // Capacity reached: assign queue ticket
    const waitSecondsPerUser = 1.5; // Average checkout turnaround 1.5s
    const estimatedWaitSeconds = Math.ceil(slot.queuePosition * waitSecondsPerUser);
    const { token } = generateQueueToken(studentId, slot.queuePosition, 1800, this.secret);

    return {
      allowed: false,
      queuePosition: slot.queuePosition,
      token,
      estimatedWaitSeconds,
      activeCount: slot.activeCount,
      maxCapacity: this.maxConcurrentActive,
    };
  }

  /**
   * Validate incoming request token at Edge / Middleware
   */
  validateAccessToken(token: string): { valid: boolean; studentId?: string; error?: string } {
    const verification = verifyQueueToken(token, this.secret);
    if (!verification.valid || !verification.payload) {
      return { valid: false, error: verification.error || 'Invalid session token' };
    }
    if (verification.payload.queuePosition > 0) {
      return { valid: false, error: 'User is still in queue, not permitted to register' };
    }
    return { valid: true, studentId: verification.payload.studentId };
  }

  /**
   * Complete registration session and exit waiting room
   */
  async leaveSession(studentId: string): Promise<void> {
    await redis.leaveWaitingRoom(studentId);
  }
}

export const waitingRoomService = new WaitingRoomService();
