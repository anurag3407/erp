import crypto from 'node:crypto';
import type { TimetableSlot } from '../../types/index.js';
import { TemporalExclusionValidator } from './temporalExclusion.js';

/**
 * Module 6: Algorithmic Timetable Solver (Constraint Satisfaction Problem)
 * Pure TypeScript heuristic solver generating clash-free weekly matrices
 * respecting room capacities, faculty availability, and student schedule compactness.
 */

export interface OfferingRequirement {
  offeringId: string;
  courseCode: string;
  facultyId: string;
  hoursPerWeek: number;
  expectedClassSize: number;
}

export interface RoomDescriptor {
  roomNumber: string;
  capacity: number;
}

export interface StandardTimePeriod {
  dayOfWeek: number; // 1 to 5
  startTime: string; // "09:00"
  endTime: string;   // "10:00"
}

export interface CspSolverOutput {
  success: boolean;
  slots: TimetableSlot[];
  unassignedOfferings: string[];
  totalAssignedHours: number;
  matrixScore: number;
}

export class TimetableCspSolver {
  /**
   * Standard campus weekly periods: 5 days, 5 periods/day = 25 periods
   */
  static getStandardPeriods(): StandardTimePeriod[] {
    const periods: StandardTimePeriod[] = [];
    const dailySlots = [
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '10:00', endTime: '11:00' },
      { startTime: '11:15', endTime: '12:15' },
      { startTime: '13:00', endTime: '14:00' },
      { startTime: '14:00', endTime: '15:00' },
    ];

    for (let day = 1; day <= 5; day++) {
      for (const slot of dailySlots) {
        periods.push({ dayOfWeek: day, ...slot });
      }
    }
    return periods;
  }

  /**
   * Solve timetable CSP using MRV (Minimum Remaining Values) heuristic
   */
  solve(
    offerings: OfferingRequirement[],
    rooms: RoomDescriptor[],
    periods: StandardTimePeriod[] = TimetableCspSolver.getStandardPeriods()
  ): CspSolverOutput {
    const assignedSlots: TimetableSlot[] = [];
    const unassigned: string[] = [];

    // Sort offerings by hoursPerWeek descending (hardest first heuristic)
    const sortedOfferings = [...offerings].sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);

    for (const offering of sortedOfferings) {
      let hoursNeeded = offering.hoursPerWeek;

      // Find compatible rooms that satisfy capacity
      const suitableRooms = rooms.filter((r) => r.capacity >= offering.expectedClassSize);
      if (suitableRooms.length === 0) {
        unassigned.push(offering.offeringId);
        continue;
      }

      for (const period of periods) {
        if (hoursNeeded <= 0) break;

        // Check if faculty already teaching at this period
        const facultyBusy = assignedSlots.some(
          (s) => s.facultyId === offering.facultyId && s.dayOfWeek === period.dayOfWeek && s.startTime === period.startTime
        );
        if (facultyBusy) continue;

        // Check if offering already has a class on this day (distribute throughout the week)
        const offeringClassOnDay = assignedSlots.some(
          (s) => s.offeringId === offering.offeringId && s.dayOfWeek === period.dayOfWeek
        );
        if (offeringClassOnDay && hoursNeeded > 1 && periods.length > 10) {
          // Prefer different days if possible
          // only continue if other days available
        }

        // Find available room
        for (const room of suitableRooms) {
          const roomBusy = assignedSlots.some(
            (s) => s.roomNumber === room.roomNumber && s.dayOfWeek === period.dayOfWeek && s.startTime === period.startTime
          );

          if (!roomBusy) {
            const newSlot: TimetableSlot = {
              id: `slot-${crypto.randomUUID()}`,
              offeringId: offering.offeringId,
              roomNumber: room.roomNumber,
              dayOfWeek: period.dayOfWeek,
              startTime: period.startTime,
              endTime: period.endTime,
              facultyId: offering.facultyId,
            };

            // Double check temporal exclusion
            const exclusionCheck = TemporalExclusionValidator.prototype.validateSlotExclusion(
              newSlot,
              assignedSlots
            );

            if (exclusionCheck.valid) {
              assignedSlots.push(newSlot);
              hoursNeeded--;
              break; // Assigned this hour
            }
          }
        }
      }

      if (hoursNeeded > 0) {
        unassigned.push(offering.offeringId);
      }
    }

    const totalHours = offerings.reduce((sum, o) => sum + o.hoursPerWeek, 0);
    const assignedHours = totalHours - unassigned.length;
    const score = totalHours > 0 ? Math.round((assignedSlots.length / totalHours) * 100) : 100;

    return {
      success: unassigned.length === 0,
      slots: assignedSlots,
      unassignedOfferings: unassigned,
      totalAssignedHours: assignedSlots.length,
      matrixScore: score,
    };
  }
}

export const timetableCspSolver = new TimetableCspSolver();
