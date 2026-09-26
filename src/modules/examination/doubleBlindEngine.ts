import { generateAnonymousBarcode } from '../../lib/crypto.js';

/**
 * Module 4: Double-Blind On-Screen Evaluation (OSV) Identity Masker
 * Masks student names and roll numbers with cryptographically generated barcodes.
 */

export interface MaskedScriptDescriptor {
  anonymousBarcode: string;
  assessmentId: string;
  originalStudentId: string;
  scannedPdfUrl: string;
  maskedAt: string;
}

export class DoubleBlindEngine {
  private secret: string;

  constructor(secret?: string) {
    const configured = secret || process.env.OSV_SECRET;
    if (configured) {
      this.secret = configured;
    } else if (process.env.NODE_ENV === 'production') {
      // A published salt would let anyone predict the identity barcodes.
      throw new Error('OSV_SECRET must be set in production.');
    } else {
      this.secret = 'double-blind-osv-secret-salt-2026';
    }
  }

  /**
   * Mask student answer script identity before assigning to evaluators
   */
  maskScript(
    assessmentId: string,
    studentId: string,
    scannedPdfUrl: string
  ): MaskedScriptDescriptor {
    const anonymousBarcode = generateAnonymousBarcode(studentId, assessmentId, this.secret);

    return {
      anonymousBarcode,
      assessmentId,
      originalStudentId: studentId,
      scannedPdfUrl,
      maskedAt: new Date().toISOString(),
    };
  }
}

export const doubleBlindEngine = new DoubleBlindEngine();
