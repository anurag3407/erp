import type { Course, CreditBucketType } from '../../types/index.js';

/**
 * Module 3: Curriculum DAG Engine
 * Models degree requirements as a Directed Acyclic Graph with credit buckets,
 * prerequisite graph traversal, and topological dependency ordering.
 */

export interface DagNode {
  courseId: string;
  course: Course;
  dependencies: string[]; // Prerequisite course IDs
  dependents: string[];   // Courses that depend on this
}

export class CurriculumDagEngine {
  private nodes = new Map<string, DagNode>();

  /**
   * Load courses into the DAG
   */
  buildGraph(courses: Course[]): void {
    this.nodes.clear();

    // 1. Initialize nodes
    for (const c of courses) {
      this.nodes.set(c.id, {
        courseId: c.id,
        course: c,
        dependencies: [...c.prerequisites],
        dependents: [],
      });
    }

    // 2. Populate dependents (outgoing edges)
    for (const node of this.nodes.values()) {
      for (const prereqId of node.dependencies) {
        const prereqNode = this.nodes.get(prereqId);
        if (prereqNode) {
          prereqNode.dependents.push(node.courseId);
        }
      }
    }
  }

  /**
   * Verify prerequisites are satisfied for a student
   */
  checkPrerequisitesSatisfied(
    courseId: string,
    completedCourseIds: Set<string>
  ): { satisfied: boolean; missingPrerequisites: string[] } {
    const node = this.nodes.get(courseId);
    if (!node) {
      return { satisfied: true, missingPrerequisites: [] };
    }

    const missing: string[] = [];
    for (const prereqId of node.dependencies) {
      if (!completedCourseIds.has(prereqId)) {
        const prereqNode = this.nodes.get(prereqId);
        missing.push(prereqNode ? prereqNode.course.code : prereqId);
      }
    }

    return {
      satisfied: missing.length === 0,
      missingPrerequisites: missing,
    };
  }

  /**
   * Calculate earned credits grouped by NEP 2020 credit buckets
   */
  auditCreditBuckets(completedCourses: Course[]): Record<CreditBucketType, { earned: number; count: number; courses: string[] }> {
    const buckets: Record<CreditBucketType, { earned: number; count: number; courses: string[] }> = {
      CORE: { earned: 0, count: 0, courses: [] },
      DISCIPLINE_ELECTIVE: { earned: 0, count: 0, courses: [] },
      OPEN_ELECTIVE: { earned: 0, count: 0, courses: [] },
      ABILITY_ENHANCEMENT: { earned: 0, count: 0, courses: [] },
      SKILL_ENHANCEMENT: { earned: 0, count: 0, courses: [] },
      MANDATORY_NON_CREDIT: { earned: 0, count: 0, courses: [] },
    };

    for (const c of completedCourses) {
      if (buckets[c.bucketType]) {
        buckets[c.bucketType].earned += c.credits;
        buckets[c.bucketType].count += 1;
        buckets[c.bucketType].courses.push(c.code);
      }
    }

    return buckets;
  }

  /**
   * Detect cycles in the curriculum graph (Tarjan's/DFS Cycle Detection)
   */
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        for (const depId of node.dependencies) {
          if (!visited.has(depId)) {
            if (dfs(depId)) return true;
          } else if (recStack.has(depId)) {
            return true; // Cycle detected
          }
        }
      }

      recStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (dfs(nodeId)) return true;
      }
    }

    return false;
  }
}

export const curriculumDagEngine = new CurriculumDagEngine();
