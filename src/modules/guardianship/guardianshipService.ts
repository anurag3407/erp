import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  StudentGuardian,
  GuardianRelationship,
  GuardianPermissions,
  User,
} from '../../types/index.js';

export interface LinkGuardianRequest {
  studentId: string;
  guardianUserId: string;
  relationship: GuardianRelationship;
  isPrimaryContact?: boolean;
  permissions?: Partial<GuardianPermissions>;
}

export class GuardianshipService {
  private defaultPermissions: GuardianPermissions = {
    canViewAttendance: true,
    canViewGrades: true,
    canViewFeeDues: true,
    canPayFees: true,
    canApplyLeave: false,
    canReceiveAlerts: true,
    isEmergencyContact: true,
  };

  /**
   * Link a parent/guardian user to a student profile with permission flags
   */
  async linkGuardian(req: LinkGuardianRequest): Promise<StudentGuardian> {
    const student = await db.studentProfiles.get(req.studentId);
    if (!student) {
      throw new Error(`Student not found: ${req.studentId}`);
    }

    const guardianUser = await db.users.get(req.guardianUserId);
    if (!guardianUser) {
      throw new Error(`Guardian user not found: ${req.guardianUserId}`);
    }

    if (guardianUser.role !== 'PARENT' && guardianUser.role !== 'SUPER_ADMIN') {
      throw new Error(`Invalid role for guardian: ${guardianUser.role}. Expected PARENT.`);
    }

    const key = `${req.studentId}:${req.guardianUserId}`;
    const existing = await db.studentGuardians.get(key);

    const permissions: GuardianPermissions = {
      ...this.defaultPermissions,
      ...(req.permissions || {}),
    };

    if (req.isPrimaryContact) {
      for (const g of await db.studentGuardians.values()) {
        if (g.studentId === req.studentId && g.guardianUserId !== req.guardianUserId) {
          g.isPrimaryContact = false;
          await db.studentGuardians.set(`${g.studentId}:${g.guardianUserId}`, g);
        }
      }
    }

    if (existing) {
      existing.relationship = req.relationship;
      existing.isPrimaryContact = req.isPrimaryContact ?? existing.isPrimaryContact;
      existing.permissions = permissions;
      await db.studentGuardians.set(key, existing);
      return existing;
    }

    const linkId = `sg-${crypto.randomUUID()}`;
    const link: StudentGuardian = {
      id: linkId,
      studentId: req.studentId,
      guardianUserId: req.guardianUserId,
      relationship: req.relationship,
      isPrimaryContact: req.isPrimaryContact ?? false,
      permissions,
      verifiedAt: new Date(),
      createdAt: new Date(),
    };

    await db.studentGuardians.set(key, link);
    return link;
  }

  /**
   * Update guardian permissions
   */
  async updatePermissions(
    studentId: string,
    guardianUserId: string,
    permissions: Partial<GuardianPermissions>
  ): Promise<StudentGuardian> {
    const key = `${studentId}:${guardianUserId}`;
    const link = await db.studentGuardians.get(key);
    if (!link) {
      throw new Error(`Guardianship association not found for student ${studentId} and guardian ${guardianUserId}`);
    }

    link.permissions = {
      ...link.permissions,
      ...permissions,
    };

    await db.studentGuardians.set(key, link);
    return link;
  }

  /**
   * Check if a guardian has specific permission for a student
   */
  async checkGuardianPermission(
    guardianUserId: string,
    studentId: string,
    permission: keyof GuardianPermissions
  ): Promise<boolean> {
    const key = `${studentId}:${guardianUserId}`;
    const link = await db.studentGuardians.get(key);
    if (!link) {
      return false;
    }

    return !!link.permissions[permission];
  }

  /**
   * Retrieve all guardians associated with a student
   */
  async getGuardiansForStudent(studentId: string): Promise<StudentGuardian[]> {
    return (await db.studentGuardians.values()).filter((g) => g.studentId === studentId);
  }

  /**
   * Retrieve all students associated with a parent/guardian
   */
  async getStudentsForGuardian(guardianUserId: string): Promise<StudentGuardian[]> {
    return (await db.studentGuardians.values()).filter((g) => g.guardianUserId === guardianUserId);
  }

  /**
   * Retrieve emergency contacts for a student (for hostel wardens & Dean)
   */
  async getEmergencyContacts(studentId: string): Promise<Array<{ guardian: StudentGuardian; user?: User }>> {
    const links = (await db.studentGuardians.values()).filter(
      (g) => g.studentId === studentId && (g.isPrimaryContact || g.permissions.isEmergencyContact)
    );

    const results: Array<{ guardian: StudentGuardian; user?: User }> = [];
    for (const link of links) {
      results.push({
        guardian: link,
        user: await db.users.get(link.guardianUserId),
      });
    }
    return results;
  }

  /**
   * Remove a guardianship link
   */
  async removeGuardian(studentId: string, guardianUserId: string): Promise<boolean> {
    const key = `${studentId}:${guardianUserId}`;
    return db.studentGuardians.delete(key);
  }

  async canGuardianViewAttendance(guardianUserId: string, studentId: string): Promise<boolean> {
    return this.checkGuardianPermission(guardianUserId, studentId, 'canViewAttendance');
  }

  async canGuardianViewGrades(guardianUserId: string, studentId: string): Promise<boolean> {
    return this.checkGuardianPermission(guardianUserId, studentId, 'canViewGrades');
  }

  async canGuardianPayFees(guardianUserId: string, studentId: string): Promise<boolean> {
    return this.checkGuardianPermission(guardianUserId, studentId, 'canPayFees');
  }

  async canGuardianApplyLeave(guardianUserId: string, studentId: string): Promise<boolean> {
    return this.checkGuardianPermission(guardianUserId, studentId, 'canApplyLeave');
  }

  async canGuardianReceiveAlerts(guardianUserId: string, studentId: string): Promise<boolean> {
    return this.checkGuardianPermission(guardianUserId, studentId, 'canReceiveAlerts');
  }
}

export const guardianshipService = new GuardianshipService();
