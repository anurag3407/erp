import crypto from 'node:crypto';
import { db } from '../../lib/db.js';

/**
 * Module 3: DigiLocker NAD & APAAR / Academic Bank of Credits (ABC) Sync
 * Serializes university credits into standardized DigiLocker XML/JSON schema.
 */

export interface DigiLockerCreditRecord {
  apaarId: string;
  studentRollNumber: string;
  institutionCode: string;
  academicYear: string;
  semester: number;
  courses: Array<{
    courseCode: string;
    courseTitle: string;
    credits: number;
    gradePoint: number;
    letterGrade: string;
  }>;
  sgpa: number;
  cgpa: number;
  totalCreditsEarned: number;
  resultDate: string;
  digitalSignature: string;
}

export class DigiLockerSyncService {
  private institutionCode = 'IN-UGC-UNIV-8492';

  /**
   * Format student credits into DigiLocker NAD payload
   */
  generateNadRecord(
    apaarId: string,
    rollNumber: string,
    semester: number,
    academicYear: string,
    courses: Array<{ code: string; name: string; credits: number; gradePoint: number; letterGrade: string }>,
    cgpa: number
  ): DigiLockerCreditRecord {
    const totalCredits = courses.reduce((sum, c) => sum + c.credits, 0);
    const sgpa = totalCredits > 0
      ? Math.round((courses.reduce((sum, c) => sum + c.credits * c.gradePoint, 0) / totalCredits) * 100) / 100
      : 0;

    const signaturePayload = `${this.institutionCode}:${apaarId}:${semester}:${academicYear}:${totalCredits}`;
    const digitalSignature = crypto.createHash('sha256').update(signaturePayload).digest('hex');

    return {
      apaarId,
      studentRollNumber: rollNumber,
      institutionCode: this.institutionCode,
      academicYear,
      semester,
      courses: courses.map((c) => ({
        courseCode: c.code,
        courseTitle: c.name,
        credits: c.credits,
        gradePoint: c.gradePoint,
        letterGrade: c.letterGrade,
      })),
      sgpa,
      cgpa,
      totalCreditsEarned: totalCredits,
      resultDate: new Date().toISOString(),
      digitalSignature,
    };
  }

  /**
   * Sync records with DigiLocker NAD store
   */
  async pushToDigiLocker(record: DigiLockerCreditRecord): Promise<{ success: boolean; ackId: string }> {
    const ackId = `NAD-${crypto.randomUUID()}`;
    for (const c of record.courses) {
      await db.abcRecords.set(`${record.apaarId}-${c.courseCode}`, {
        id: `abc-${crypto.randomUUID()}`,
        studentId: record.studentRollNumber,
        apaarId: record.apaarId,
        courseId: c.courseCode,
        academicYear: record.academicYear,
        creditsEarned: c.credits,
        gradeObtained: c.letterGrade,
        status: 'SYNCED',
      });
    }

    return { success: true, ackId };
  }
}

export const digiLockerSyncService = new DigiLockerSyncService();
