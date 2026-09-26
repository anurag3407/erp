import crypto from 'node:crypto';
import { db } from '../../lib/db.js';
import type {
  CiaGradeEntry,
  BulkGradeUpsertItem,
  GradebookSpreadsheet,
} from '../../types/index.js';

export interface SaveGradeEntryRequest {
  offeringId: string;
  studentId: string;
  component: string; // 'QUIZ_1' | 'ASSIGNMENT_1' | 'MID_TERM' | etc.
  maxMarks: number;
  obtainedMarks: number;
  facultyUserId: string;
  isManualOverride?: boolean;
  overrideReason?: string;
}

export class FacultyGradebookService {
  private lockedOfferings = new Set<string>();

  /**
   * Save or update an individual grade entry
   * Sets isManualOverride flag to protect against automated LMS sync overwrites
   */
  async saveGradeEntry(req: SaveGradeEntryRequest): Promise<CiaGradeEntry> {
    if (this.lockedOfferings.has(req.offeringId)) {
      throw new Error(`GRADEBOOK_LOCKED: Offering ${req.offeringId} gradebook is locked for the semester`);
    }

    if (req.obtainedMarks < 0 || req.obtainedMarks > req.maxMarks) {
      throw new Error(
        `INVALID_MARKS: Obtained marks (${req.obtainedMarks}) must be between 0 and maxMarks (${req.maxMarks})`
      );
    }

    const key = `${req.offeringId}:${req.studentId}:${req.component}`;
    let entry = await db.ciaGradeEntries.get(key);

    const isManualOverride = req.isManualOverride !== undefined ? req.isManualOverride : true;

    if (entry) {
      entry.maxMarks = req.maxMarks;
      entry.obtainedMarks = req.obtainedMarks;
      entry.isManualOverride = isManualOverride;
      entry.overriddenByUserId = req.facultyUserId;
      entry.overrideReason = req.overrideReason;
      entry.updatedAt = new Date();
    } else {
      entry = {
        id: `cia-${crypto.randomUUID()}`,
        offeringId: req.offeringId,
        studentId: req.studentId,
        component: req.component,
        maxMarks: req.maxMarks,
        obtainedMarks: req.obtainedMarks,
        isManualOverride,
        overriddenByUserId: req.facultyUserId,
        overrideReason: req.overrideReason,
        locked: false,
        updatedAt: new Date(),
      };
    }

    await db.ciaGradeEntries.set(key, entry);
    return entry;
  }

  /**
   * Bulk upsert grades from spreadsheet grid
   */
  async bulkUpsertGrades(
    offeringId: string,
    entries: BulkGradeUpsertItem[],
    facultyUserId: string
  ): Promise<{ savedCount: number; entries: CiaGradeEntry[] }> {
    if (this.lockedOfferings.has(offeringId)) {
      throw new Error(`GRADEBOOK_LOCKED: Offering ${offeringId} gradebook is locked for the semester`);
    }

    const saved: CiaGradeEntry[] = [];
    for (const item of entries) {
      const entry = await this.saveGradeEntry({
        offeringId,
        studentId: item.studentId,
        component: item.component,
        maxMarks: item.maxMarks,
        obtainedMarks: item.obtainedMarks,
        facultyUserId,
        isManualOverride: item.isManualOverride ?? true,
        overrideReason: item.overrideReason || 'Faculty Spreadsheet Bulk Entry',
      });
      saved.push(entry);
    }

    return { savedCount: saved.length, entries: saved };
  }

  /**
   * Check if a grade is manually overridden by faculty
   * Used by LMS sync worker to avoid overwriting faculty manual assessments
   */
  async isGradeOverridden(offeringId: string, studentId: string, component?: string): Promise<boolean> {
    if (component) {
      const key = `${offeringId}:${studentId}:${component}`;
      const directEntry = await db.ciaGradeEntries.get(key);
      if (directEntry && directEntry.isManualOverride) {
        return true;
      }

      const normComponent = component.toUpperCase().replace(/[-_\s]/g, '');
      for (const e of await db.ciaGradeEntries.values()) {
        if (e.offeringId === offeringId && e.studentId === studentId && e.isManualOverride) {
          const normEntryComp = e.component.toUpperCase().replace(/[-_\s]/g, '');
          if (normEntryComp === normComponent) {
            return true;
          }
          if (normComponent.includes(normEntryComp) || normEntryComp.includes(normComponent)) {
            return true;
          }
          const tokenComp = normComponent.replace(/\d+/g, '').replace(/^(ACT|ACTIVITY|ASSMT|ASSIGN)/, '');
          const tokenEntry = normEntryComp.replace(/\d+/g, '');
          if (
            tokenComp.length >= 3 &&
            tokenEntry.length >= 3 &&
            (tokenComp.includes(tokenEntry) || tokenEntry.includes(tokenComp))
          ) {
            return true;
          }
        }
      }

      return false;
    }

    // Check if any component for this student in this offering has manual override
    for (const entry of await db.ciaGradeEntries.values()) {
      if (entry.offeringId === offeringId && entry.studentId === studentId && entry.isManualOverride) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get specific grade entry
   */
  async getGradeEntry(offeringId: string, studentId: string, component: string): Promise<CiaGradeEntry | undefined> {
    return db.ciaGradeEntries.get(`${offeringId}:${studentId}:${component}`);
  }

  /**
   * Retrieve full gradebook spreadsheet for course offering
   */
  async getGradebookSpreadsheet(offeringId: string): Promise<GradebookSpreadsheet> {
    const offeringEntries = (await db.ciaGradeEntries.values()).filter(
      (e) => e.offeringId === offeringId
    );

    const componentsMap = new Map<string, number>();
    const studentMarksMap = new Map<
      string,
      Record<string, { obtained: number; isManualOverride: boolean; maxMarks: number }>
    >();

    for (const entry of offeringEntries) {
      if (!componentsMap.has(entry.component) || componentsMap.get(entry.component)! < entry.maxMarks) {
        componentsMap.set(entry.component, entry.maxMarks);
      }

      if (!studentMarksMap.has(entry.studentId)) {
        studentMarksMap.set(entry.studentId, {});
      }
      studentMarksMap.get(entry.studentId)![entry.component] = {
        obtained: entry.obtainedMarks,
        isManualOverride: entry.isManualOverride,
        maxMarks: entry.maxMarks,
      };
    }

    const components = Array.from(componentsMap.entries()).map(([name, maxMarks]) => ({
      name,
      maxMarks,
    }));

    const entries = Array.from(studentMarksMap.entries()).map(([studentId, marks]) => ({
      studentId,
      marks,
    }));

    return {
      offeringId,
      components,
      entries,
      isLocked: this.lockedOfferings.has(offeringId),
    };
  }

  /**
   * Lock gradebook after term grade lock deadline
   */
  async lockGradebook(offeringId: string, _facultyUserId: string): Promise<{ offeringId: string; locked: boolean }> {
    this.lockedOfferings.add(offeringId);
    for (const entry of await db.ciaGradeEntries.values()) {
      if (entry.offeringId === offeringId) {
        entry.locked = true;
        await db.ciaGradeEntries.set(`${entry.offeringId}:${entry.studentId}:${entry.component}`, entry);
      }
    }
    return { offeringId, locked: true };
  }

  /**
   * Unlock gradebook (Super Admin / Dean authorization)
   */
  async unlockGradebook(offeringId: string): Promise<{ offeringId: string; locked: boolean }> {
    this.lockedOfferings.delete(offeringId);
    for (const entry of await db.ciaGradeEntries.values()) {
      if (entry.offeringId === offeringId) {
        entry.locked = false;
        await db.ciaGradeEntries.set(`${entry.offeringId}:${entry.studentId}:${entry.component}`, entry);
      }
    }
    return { offeringId, locked: false };
  }
}

export const facultyGradebookService = new FacultyGradebookService();
