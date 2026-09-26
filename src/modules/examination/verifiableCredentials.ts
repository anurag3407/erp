import {
  signVerifiableDocument,
  verifyVerifiableDocument,
  getInstitutionalKeyPair,
  sha256,
  canonicalJson,
} from '../../lib/crypto.js';
import type { VerifiableMarksheet } from '../../types/index.js';

/**
 * Module 4: Ed25519 Verifiable Marksheet & Certificate Engine
 * Issues asymmetric cryptographically signed credentials verifiable
 * at /verify/[hash] without requiring direct database access.
 */

export class VerifiableCredentialsService {
  /**
   * Issue a digitally signed verifiable marksheet
   */
  issueMarksheet(
    studentId: string,
    rollNumber: string,
    studentName: string,
    programCode: string,
    academicYear: string,
    semester: number,
    courses: Array<{
      courseCode: string;
      courseName: string;
      credits: number;
      gradePoint: number;
      letterGrade: string;
    }>
  ): VerifiableMarksheet & { verificationUrl: string; documentHash: string } {
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    const sgpa = courses.length > 0
      ? Math.round((courses.reduce((sum, c) => sum + c.credits * c.gradePoint, 0) / totalCredits) * 100) / 100
      : 0;
    const cgpa = sgpa; // In demo context

    const documentData: Record<string, unknown> = {
      studentId,
      rollNumber,
      studentName,
      programCode,
      academicYear,
      semester,
      courses,
      sgpa,
      cgpa,
      issuedAt: new Date().toISOString(),
    };

    const { signature, publicKeyPem, documentHash } = signVerifiableDocument(documentData);

    const verificationUrl = `/verify/${documentHash}`;

    return {
      studentId,
      rollNumber,
      studentName,
      programCode,
      academicYear,
      semester,
      courses,
      sgpa,
      cgpa,
      issuedAt: documentData.issuedAt as string,
      issuerPublicKey: publicKeyPem,
      signature,
      verificationUrl,
      documentHash,
    };
  }

  /**
   * Verify an issued document with its signature and issuer public key
   */
  verifyMarksheet(
    marksheet: VerifiableMarksheet,
    customPublicKeyPem?: string
  ): { isValid: boolean; documentHash: string; message: string } {
    const documentData: Record<string, unknown> = {
      studentId: marksheet.studentId,
      rollNumber: marksheet.rollNumber,
      studentName: marksheet.studentName,
      programCode: marksheet.programCode,
      academicYear: marksheet.academicYear,
      semester: marksheet.semester,
      courses: marksheet.courses,
      sgpa: marksheet.sgpa,
      cgpa: marksheet.cgpa,
      issuedAt: marksheet.issuedAt,
    };

    const canonicalData = canonicalJson(documentData);
    const documentHash = sha256(canonicalData);

    const publicKey = customPublicKeyPem || marksheet.issuerPublicKey || getInstitutionalKeyPair().publicKey;
    const isValid = verifyVerifiableDocument(documentData, marksheet.signature, publicKey);

    return {
      isValid,
      documentHash,
      message: isValid
        ? 'VERIFIED: Asymmetric Ed25519 signature is authentic and untampered.'
        : 'FRAUD_DETECTED: Digital signature verification failed. Marksheet has been tampered with.',
    };
  }
}

export const verifiableCredentialsService = new VerifiableCredentialsService();
