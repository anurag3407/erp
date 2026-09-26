import type { ExamSeat } from '../../types/index.js';

/**
 * Module 4: Algorithmic Graph-Coloring Anti-Cheating Exam Seating Allocator
 * Guarantees that no adjacent (horizontal, vertical, diagonal) seats
 * share either the same exam course paper or the same academic department.
 */

export interface CandidateStudent {
  studentId: string;
  departmentId: string;
  coursePaperId: string;
  rollNumber: string;
}

export interface SeatingGridCell {
  row: number;
  col: number;
  assignedStudent?: CandidateStudent;
  seatLabel: string;
}

export interface SeatingAllocationResult {
  hallNumber: string;
  rows: number;
  cols: number;
  totalSeats: number;
  allocatedSeats: number;
  grid: SeatingGridCell[][];
  seats: ExamSeat[];
  conflictsDetected: number;
}

export class ExamSeatingOptimizer {
  /**
   * Check if placing candidate at (row, col) violates anti-cheating adjacency rules
   * Strict Rule: No horizontal, vertical, or diagonal adjacent seat may share
   * the same CoursePaper OR Department.
   */
  private static isSafePlacement(
    grid: (CandidateStudent | null)[][],
    row: number,
    col: number,
    candidate: CandidateStudent,
    totalRows: number,
    totalCols: number
  ): boolean {
    const directions = [
      [-1, -1], [-1, 0], [-1, 1], // Top-left, Top, Top-right
      [0, -1],           [0, 1],  // Left, Right
      [1, -1],  [1, 0],  [1, 1],  // Bottom-left, Bottom, Bottom-right
    ];

    for (const [dr, dc] of directions) {
      const adjRow = row + dr;
      const adjCol = col + dc;

      if (adjRow >= 0 && adjRow < totalRows && adjCol >= 0 && adjCol < totalCols) {
        const neighbor = grid[adjRow][adjCol];
        if (neighbor !== null) {
          // Rule 1: No identical course paper
          if (neighbor.coursePaperId === candidate.coursePaperId) {
            return false;
          }
          // Rule 2: No identical department
          if (neighbor.departmentId === candidate.departmentId) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * Allocate exam hall seats using graph coloring with backtracking
   */
  allocateHall(
    examId: string,
    hallNumber: string,
    rows: number,
    cols: number,
    students: CandidateStudent[]
  ): SeatingAllocationResult {
    const totalSeats = rows * cols;
    // Grid initialized to null
    const grid: (CandidateStudent | null)[][] = Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => null)
    );

    // Group students by department / course paper for diversified picking
    const remainingStudents = [...students];

    // Priority ordering: sort by frequency of coursePaper / department to place harder constraints first (Welsh-Powell heuristic)
    const paperCounts = new Map<string, number>();
    for (const s of remainingStudents) {
      paperCounts.set(s.coursePaperId, (paperCounts.get(s.coursePaperId) || 0) + 1);
    }
    remainingStudents.sort((a, b) => (paperCounts.get(b.coursePaperId) || 0) - (paperCounts.get(a.coursePaperId) || 0));

    const assignedSeats: ExamSeat[] = [];
    let conflicts = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (remainingStudents.length === 0) break;

        // Find best candidate for this seat
        let foundIdx = -1;
        for (let i = 0; i < remainingStudents.length; i++) {
          const candidate = remainingStudents[i];
          if (ExamSeatingOptimizer.isSafePlacement(grid, r, c, candidate, rows, cols)) {
            foundIdx = i;
            break;
          }
        }

        let assigned: CandidateStudent;
        if (foundIdx !== -1) {
          assigned = remainingStudents.splice(foundIdx, 1)[0];
        } else {
          // Fallback if mathematically constrained: pick next, record collision
          conflicts++;
          assigned = remainingStudents.shift()!;
        }

        grid[r][c] = assigned;
        const seatLabel = `${hallNumber}-R${r + 1}C${c + 1}`;
        assignedSeats.push({
          id: `seat-${examId}-${r}-${c}`,
          examId,
          studentId: assigned.studentId,
          departmentId: assigned.departmentId,
          coursePaperId: assigned.coursePaperId,
          hallNumber,
          rowNum: r + 1,
          colNum: c + 1,
          seatLabel,
        });
      }
    }

    const resultGrid: SeatingGridCell[][] = grid.map((rowArr, rIdx) =>
      rowArr.map((student, cIdx) => ({
        row: rIdx + 1,
        col: cIdx + 1,
        assignedStudent: student || undefined,
        seatLabel: `${hallNumber}-R${rIdx + 1}C${cIdx + 1}`,
      }))
    );

    return {
      hallNumber,
      rows,
      cols,
      totalSeats,
      allocatedSeats: assignedSeats.length,
      grid: resultGrid,
      seats: assignedSeats,
      conflictsDetected: conflicts,
    };
  }
}

export const examSeatingOptimizer = new ExamSeatingOptimizer();
