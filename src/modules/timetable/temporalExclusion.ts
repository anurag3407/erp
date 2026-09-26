import type { TimetableSlot } from '../../types/index.js';

/**
 * Module 6: PostgreSQL btree_gist Temporal Range Exclusion Validator
 * Replicates the database-level EXCLUDE USING gist exclusion constraints:
 * - Room exclusion: (room_number WITH =, day_of_week WITH =, tsrange WITH &&)
 * - Faculty exclusion: (faculty_id WITH =, day_of_week WITH =, tsrange WITH &&)
 */

export interface TimeSlotInterval {
  dayOfWeek: number; // 1 (Mon) to 6 (Sat)
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
}

export class TemporalExclusionValidator {
  /**
   * Parse "HH:MM" string to minutes from midnight
   */
  private static parseMinutes(timeStr: string): number {
    const [h, m] = timeStr.split(':').map((v) => parseInt(v, 10));
    return h * 60 + m;
  }

  /**
   * Check if two intervals overlap on the same day (tsrange && tsrange)
   */
  static doIntervalsOverlap(slotA: TimeSlotInterval, slotB: TimeSlotInterval): boolean {
    if (slotA.dayOfWeek !== slotB.dayOfWeek) {
      return false;
    }
    const startA = TemporalExclusionValidator.parseMinutes(slotA.startTime);
    const endA = TemporalExclusionValidator.parseMinutes(slotA.endTime);
    const startB = TemporalExclusionValidator.parseMinutes(slotB.startTime);
    const endB = TemporalExclusionValidator.parseMinutes(slotB.endTime);

    // Overlap condition: max(startA, startB) < min(endA, endB)
    return Math.max(startA, startB) < Math.min(endA, endB);
  }

  /**
   * Validate candidate slot against existing timetable for room or faculty collisions
   */
  validateSlotExclusion(
    candidate: TimetableSlot,
    existingSlots: TimetableSlot[]
  ): { valid: boolean; conflictType?: 'ROOM_CLASH' | 'FACULTY_CLASH'; conflictingSlot?: TimetableSlot } {
    for (const existing of existingSlots) {
      if (existing.id === candidate.id) continue;

      if (TemporalExclusionValidator.doIntervalsOverlap(candidate, existing)) {
        // Room collision
        if (existing.roomNumber === candidate.roomNumber) {
          return {
            valid: false,
            conflictType: 'ROOM_CLASH',
            conflictingSlot: existing,
          };
        }

        // Faculty collision
        if (existing.facultyId === candidate.facultyId) {
          return {
            valid: false,
            conflictType: 'FACULTY_CLASH',
            conflictingSlot: existing,
          };
        }
      }
    }

    return { valid: true };
  }
}

export const temporalExclusionValidator = new TemporalExclusionValidator();

/**
 * Direct functional wrapper for temporal exclusion validation
 */
export function validateTemporalExclusion(
  candidate: TimetableSlot,
  existingSlots: TimetableSlot[]
): { valid: boolean; conflictType?: 'ROOM_CLASH' | 'FACULTY_CLASH'; conflictingSlot?: TimetableSlot } {
  return temporalExclusionValidator.validateSlotExclusion(candidate, existingSlots);
}
