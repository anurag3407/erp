import { signVerifiableDocument } from '../../lib/crypto.js';

/**
 * Module 10: Mobile PWA Offline Data Sync Engine
 * Serializes critical student artifacts into IndexedDB-ready models
 * with offline-verifiable cryptographic signatures.
 */

export interface OfflineStudentIdCard {
  studentId: string;
  rollNumber: string;
  fullName: string;
  programName: string;
  bloodGroup: string;
  validUntil: string;
  institutionSignature: string;
  qrPayload: string;
}

export interface OfflineTimetablePackage {
  studentId: string;
  academicYear: string;
  semester: number;
  lastSyncedAt: string;
  schedule: Array<{
    dayOfWeek: number;
    courseCode: string;
    courseName: string;
    roomNumber: string;
    startTime: string;
    endTime: string;
    facultyName: string;
  }>;
}

export class OfflineSyncService {
  /**
   * Generate an offline-verifiable digital student ID card
   */
  generateOfflineIdCard(
    studentId: string,
    rollNumber: string,
    fullName: string,
    programName: string
  ): OfflineStudentIdCard {
    const validUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dataToSign = {
      studentId,
      rollNumber,
      fullName,
      programName,
      validUntil,
      institution: 'Enterprise College',
    };

    const { signature } = signVerifiableDocument(dataToSign);

    return {
      studentId,
      rollNumber,
      fullName,
      programName,
      bloodGroup: 'O+',
      validUntil,
      institutionSignature: signature,
      qrPayload: JSON.stringify({ ...dataToSign, sig: signature }),
    };
  }

  /**
   * Package weekly timetable for offline IndexedDB storage
   */
  packageOfflineTimetable(
    studentId: string,
    semester: number,
    schedule: OfflineTimetablePackage['schedule']
  ): OfflineTimetablePackage {
    return {
      studentId,
      academicYear: '2025-2026',
      semester,
      lastSyncedAt: new Date().toISOString(),
      schedule,
    };
  }
}

export const offlineSyncService = new OfflineSyncService();
