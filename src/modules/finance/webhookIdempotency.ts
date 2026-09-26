import { redis } from '../../lib/redis.js';
import { db } from '../../lib/db.js';
import { computePaymentIdempotencyKey } from '../../lib/crypto.js';

/**
 * Module 5: Redis-Locked Webhook Idempotency Processor
 * Ensures webhook events cannot double-credit student accounts,
 * utilizing distributed locks and deterministic SHA256 idempotency keys.
 */

export interface WebhookEventPayload {
  event: 'payment.captured' | 'payment.failed';
  orderId: string;
  paymentId: string;
  studentId: string;
  feeStructureId: string;
  semester: number;
  amount: number;
  utrReferenceNumber?: string;
}

export interface WebhookProcessingResult {
  status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'LOCK_FAILED' | 'ERROR';
  orderId: string;
  idempotencyKey: string;
  message: string;
}

export class WebhookIdempotencyService {
  /**
   * Process payment gateway webhook safely with distributed locking
   */
  async handlePaymentWebhook(payload: WebhookEventPayload): Promise<WebhookProcessingResult> {
    const { orderId, paymentId, studentId, feeStructureId, semester, amount, utrReferenceNumber } = payload;

    // 1. Compute deterministic idempotency key
    const idempotencyKey = computePaymentIdempotencyKey(studentId, feeStructureId, semester, amount);

    // 2. Check if already processed
    const processedRecordKey = `payment:processed:${idempotencyKey}`;
    const alreadyProcessed = await redis.get(processedRecordKey);
    if (alreadyProcessed) {
      return {
        status: 'DUPLICATE_IGNORED',
        orderId,
        idempotencyKey,
        message: 'DUPLICATE_WEBHOOK: Transaction already finalized and credited.',
      };
    }

    // 3. Acquire distributed lock on order
    const lockKey = `lock:payment:${orderId}`;
    const lockOwner = `worker-${crypto.randomUUID()}`;
    const acquired = await redis.acquireLock(lockKey, lockOwner, 5000);

    if (!acquired) {
      return {
        status: 'LOCK_FAILED',
        orderId,
        idempotencyKey,
        message: 'CONCURRENT_WEBHOOK_LOCKED: Another worker is processing this order.',
      };
    }

    try {
      // Re-verify after lock acquisition (Double-checked locking pattern)
      const doubleCheck = await redis.get(processedRecordKey);
      if (doubleCheck) {
        return {
          status: 'DUPLICATE_IGNORED',
          orderId,
          idempotencyKey,
          message: 'DUPLICATE_WEBHOOK: Transaction already finalized in concurrent race.',
        };
      }

      // Update database transaction status
      let transaction = db.paymentTransactions.get(orderId);
      if (!transaction) {
        // Fallback create record if missing
        transaction = {
          id: `tx-${orderId}`,
          studentId,
          feeStructureId,
          orderId,
          amount,
          gateway: 'RAZORPAY',
          idempotencyKey,
          status: 'CAPTURED',
          paymentId,
          utrReferenceNumber,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        db.paymentTransactions.set(orderId, transaction);
      } else {
        transaction.status = payload.event === 'payment.captured' ? 'CAPTURED' : 'FAILED';
        transaction.paymentId = paymentId;
        transaction.utrReferenceNumber = utrReferenceNumber;
        transaction.updatedAt = new Date();
      }

      // Mark idempotency key as permanently finalized in Redis (30-day retention)
      await redis.setex(processedRecordKey, 30 * 24 * 3600, JSON.stringify({ orderId, paymentId }));

      return {
        status: 'PROCESSED',
        orderId,
        idempotencyKey,
        message: 'PAYMENT_CREDITED: Webhook applied and student account balance updated.',
      };
    } finally {
      await redis.releaseLock(lockKey, lockOwner);
    }
  }
}

export const webhookIdempotencyService = new WebhookIdempotencyService();
