import crypto from 'node:crypto';
import { db } from '../../lib/db.js';

/**
 * Module 5: Razorpay Gateway & Regional Higher-Ed Payment Processor
 * Supports UPI QR deep-links, NetBanking, and recurring Autopay/e-Mandates.
 */

export interface PaymentOrderRequest {
  studentId: string;
  feeStructureId: string;
  semester: number;
  amount: number;
  currency?: string;
  paymentMethod: 'UPI' | 'NETBANKING' | 'MANDATE';
}

export interface PaymentOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  upiDeepLink?: string;
  mandateCycle?: string;
  status: 'CREATED' | 'PENDING';
}

export class RazorpayGatewayService {
  /**
   * Create payment order with regional Indian protocols
   */
  async createOrder(req: PaymentOrderRequest): Promise<PaymentOrderResponse> {
    const orderId = `order_${crypto.randomUUID().substring(0, 16)}`;
    const currency = req.currency || 'INR';

    let upiDeepLink: string | undefined;
    let mandateCycle: string | undefined;

    if (req.paymentMethod === 'UPI') {
      // Standard NPCI UPI Intent / QR URL format
      upiDeepLink = `upi://pay?pa=fees@enterprise-college.edu&pn=Enterprise%20College&tr=${orderId}&am=${req.amount}&cu=INR&tn=FeePayment_Sem${req.semester}`;
    } else if (req.paymentMethod === 'MANDATE') {
      mandateCycle = 'SEMESTER_INSTALLMENT_3X';
    }

    // Persist pending transaction
    const txId = `tx-${crypto.randomUUID()}`;
    db.paymentTransactions.set(orderId, {
      id: txId,
      studentId: req.studentId,
      feeStructureId: req.feeStructureId,
      orderId,
      amount: req.amount,
      gateway: req.paymentMethod === 'UPI' ? 'UPI' : req.paymentMethod === 'MANDATE' ? 'MANDATE' : 'RAZORPAY',
      idempotencyKey: `idem-${orderId}`,
      status: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return {
      orderId,
      amount: req.amount,
      currency,
      upiDeepLink,
      mandateCycle,
      status: 'CREATED',
    };
  }
}

export const razorpayGatewayService = new RazorpayGatewayService();
