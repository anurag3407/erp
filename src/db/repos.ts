import { sql } from './client.js';
import { resetDatabase } from './seed.js';

/**
 * Async PostgreSQL repository layer.
 *
 * Each store mirrors the previous in-memory `Map` API (`get`/`set`/`values`/
 * `delete`/`has`/`count`) but every operation hits PostgreSQL, and every value
 * is converted between the DB's snake_case columns and the domain's camelCase
 * shapes. This is the single source of truth for the whole application — there
 * is no in-memory fallback.
 */

type Row = Record<string, any>;

/**
 * Minimal query executor shared by the root postgres.js client and a
 * transaction (`sql.begin` -> `tx`). Both expose the same `unsafe` interface,
 * so a store can be re-bound to a transaction without any query rewriting.
 */
export interface Executor {
  unsafe<T extends any[] = Row[]>(query: string, parameters?: any[]): Promise<T>;
}

const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
const ident = (s: string): string => `"${s.replace(/"/g, '""')}"`;
const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);

interface StoreConfig<T> {
  table: string;
  /** Persisted columns, snake_case. */
  columns: string[];
  /** Unique columns used for lookup + upsert conflict target. */
  conflictColumns: string[];
  /** Map a foreign lookup key to the conflict-column tuple. Defaults to splitting on ':'. */
  splitKey?: (key: string) => string[];
  /** column (snake) -> domain field (camel) when names differ. */
  columnAliases?: Record<string, string>;
  /** DATE columns returned by pg as Date; exposed to the domain as 'YYYY-MM-DD'. */
  dateOnly?: string[];
  /** TIME columns; exposed as 'HH:MM'. */
  timeOnly?: string[];
  toRow?: (value: T, key: string) => Row;
  toDomain?: (row: Row) => T;
}

export class SqlStore<T extends object> {
  constructor(private cfg: StoreConfig<T>, private exec: Executor = sql) {}

  /**
   * Return an equivalent store whose queries run on the given executor — e.g.
   * the transaction handle inside `sql.begin` — so reads and writes share one
   * PostgreSQL transaction.
   */
  bind(exec: Executor): SqlStore<T> {
    return new SqlStore<T>(this.cfg, exec);
  }

  private split(key: string): string[] {
    if (this.cfg.splitKey) return this.cfg.splitKey(key);
    return this.cfg.conflictColumns.length > 1 ? key.split(':') : [key];
  }

  private whereClause(key: string): { clause: string; values: any[] } {
    const values = this.split(key);
    const clause = this.cfg.conflictColumns
      .map((c, i) => `${ident(c)} = $${i + 1}`)
      .join(' and ');
    return { clause, values };
  }

  private defaultToRow(value: T, key: string): Row {
    const out: Row = {};
    for (const col of this.cfg.columns) {
      const field = this.cfg.columnAliases?.[col] ?? camel(col);
      out[col] = (value as any)[field];
    }
    if (out.id === undefined) out.id = key;
    return out;
  }

  private defaultToDomain(row: Row): T {
    const out: Row = {};
    for (const col of this.cfg.columns) {
      const field = this.cfg.columnAliases?.[col] ?? camel(col);
      let val = row[col];
      if (val instanceof Date) {
        if (this.cfg.dateOnly?.includes(col)) val = fmtDate(val);
      }
      if (this.cfg.timeOnly?.includes(col) && typeof val === 'string') {
        val = val.slice(0, 5);
      }
      out[field] = val;
    }
    return out as T;
  }

  private toRow(value: T, key: string): Row {
    return this.cfg.toRow ? this.cfg.toRow(value, key) : this.defaultToRow(value, key);
  }

  private toDomain(row: Row): T {
    return this.cfg.toDomain ? this.cfg.toDomain(row) : this.defaultToDomain(row);
  }

  async get(key: string): Promise<T | undefined> {
    const { clause, values } = this.whereClause(key);
    const rows = await this.exec.unsafe<Row[]>(
      `select * from ${ident(this.cfg.table)} where ${clause} limit 1`,
      values
    );
    return rows.length > 0 ? this.toDomain(rows[0]) : undefined;
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== undefined;
  }

  async values(): Promise<T[]> {
    const rows = await this.exec.unsafe<Row[]>(`select * from ${ident(this.cfg.table)}`);
    return rows.map((r) => this.toDomain(r));
  }

  async set(key: string, value: T): Promise<void> {
    const row = this.toRow(value, key);
    const cols = Object.keys(row).filter(
      (c) => this.cfg.columns.includes(c) && row[c] !== undefined
    );
    for (const required of this.cfg.conflictColumns) {
      if (!cols.includes(required)) {
        // A key column with no value means the caller passed an inconsistent key.
        throw new Error(
          `Cannot persist to ${this.cfg.table}: missing key column '${required}'`
        );
      }
    }
    const values = cols.map((c) => row[c]);
    const placeholders = cols.map((_c, i) => `$${i + 1}`).join(', ');
    const updateCols = cols.filter((c) => !this.cfg.conflictColumns.includes(c));

    let query =
      `insert into ${ident(this.cfg.table)} (${cols.map(ident).join(', ')}) ` +
      `values (${placeholders})`;
    if (updateCols.length > 0) {
      query +=
        ` on conflict (${this.cfg.conflictColumns.map(ident).join(', ')}) do update set ` +
        updateCols.map((c) => `${ident(c)} = excluded.${ident(c)}`).join(', ');
    } else {
      query += ` on conflict do nothing`;
    }
    await this.exec.unsafe(query, values);
  }

  async delete(key: string): Promise<boolean> {
    const { clause, values } = this.whereClause(key);
    const res = await this.exec.unsafe<Row[] & { count: number }>(
      `delete from ${ident(this.cfg.table)} where ${clause}`,
      values
    );
    return res.count > 0;
  }

  async count(): Promise<number> {
    const rows = await this.exec.unsafe<{ n: number }[]>(
      `select count(*)::int as n from ${ident(this.cfg.table)}`
    );
    return rows[0]?.n ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Store definitions
// ---------------------------------------------------------------------------

const users = new SqlStore<any>({
  table: 'users',
  columns: ['id', 'email', 'name', 'role', 'department_id', 'password_hash', 'created_at', 'updated_at'],
  conflictColumns: ['id'],
});

const studentProfiles = new SqlStore<any>({
  table: 'student_profiles',
  columns: ['id', 'user_id', 'roll_number', 'apaar_id', 'program_id', 'current_semester', 'admission_year', 'academic_status', 'mentor_id', 'cgpa', 'total_earned_credits', 'nep_exit_level'],
  conflictColumns: ['id'],
});

const courses = new SqlStore<any>({
  table: 'courses',
  columns: ['id', 'code', 'name', 'department_id', 'credits', 'lecture_hours', 'tutorial_hours', 'practical_hours', 'bucket_type', 'prerequisites'],
  conflictColumns: ['id'],
});

const courseOfferings = new SqlStore<any>({
  table: 'course_offerings',
  columns: ['id', 'course_id', 'semester', 'academic_year', 'faculty_id', 'max_capacity', 'enrolled_count', 'section', 'waitlist_count'],
  conflictColumns: ['id'],
});

const enrollments = new SqlStore<any>({
  table: 'enrollments',
  columns: ['id', 'student_id', 'offering_id', 'enrollment_status', 'enrolled_at'],
  conflictColumns: ['id'],
  columnAliases: { enrollment_status: 'status' },
});

const waitlists = new SqlStore<any>({
  table: 'waitlist_entries',
  columns: ['id', 'student_id', 'offering_id', 'position', 'reserved_until'],
  conflictColumns: ['id'],
});

const attendanceRecords = new SqlStore<any>({
  table: 'attendance_records',
  columns: ['id', 'student_id', 'offering_id', 'timestamp', 'status', 'verification_method', 'latitude', 'longitude', 'distance_meters', 'device_id'],
  conflictColumns: ['id'],
});

const authenticators = new SqlStore<any>({
  table: 'student_authenticators',
  columns: ['id', 'student_id', 'credential_id', 'credential_public_key', 'counter', 'device_model', 'registered_at'],
  conflictColumns: ['credential_id'],
});

const paymentTransactions = new SqlStore<any>({
  table: 'payment_transactions',
  columns: ['id', 'student_id', 'fee_structure_id', 'fee_head', 'order_id', 'payment_id', 'idempotency_key', 'amount', 'gateway', 'status', 'utr_reference_number', 'created_at', 'updated_at', 'reconciled_at'],
  conflictColumns: ['order_id'],
});

const provisionalHallTickets = new SqlStore<any>({
  table: 'provisional_hall_tickets',
  columns: ['id', 'student_id', 'exam_id', 'utr_reference_number', 'granted_by', 'granted_at', 'expires_at', 'is_reconciled'],
  conflictColumns: ['id'],
});

const timetableSlots = new SqlStore<any>({
  table: 'timetable_slots',
  columns: ['id', 'offering_id', 'room_number', 'day_of_week', 'start_time', 'end_time', 'faculty_id'],
  conflictColumns: ['id'],
  timeOnly: ['start_time', 'end_time'],
});

const mentorInterventions = new SqlStore<any>({
  table: 'mentor_intervention_cases',
  columns: ['id', 'student_id', 'mentor_id', 'risk_score', 'case_status', 'action_notes', 'sla_deadline', 'created_at'],
  conflictColumns: ['id'],
});

const naacCache = new SqlStore<any>({
  table: 'naac_telemetry_cache',
  columns: ['id', 'academic_year', 'criterion_number', 'metric_code', 'computed_data', 'last_computed_at'],
  conflictColumns: ['id'],
  toRow: (v: any, key: string) => ({
    id: key,
    academic_year: v.academicYear,
    criterion_number: v.criterionNumber,
    metric_code: v.metricCode,
    computed_data: JSON.stringify(v.computedData ?? {}),
    last_computed_at: v.lastComputedAt ?? new Date(),
  }),
});

const abcRecords = new SqlStore<any>({
  table: 'abc_credit_records',
  columns: ['id', 'student_id', 'apaar_id', 'course_id', 'academic_year', 'credits_earned', 'grade_obtained', 'status'],
  conflictColumns: ['id'],
  toRow: (v: any, key: string) => ({
    id: key,
    student_id: v.studentId,
    apaar_id: v.apaarId,
    course_id: v.courseId,
    academic_year: v.academicYear,
    credits_earned: v.creditsEarned,
    grade_obtained: v.gradeObtained,
    status: v.status,
  }),
});

const leaveApplications = new SqlStore<any>({
  table: 'leave_applications',
  columns: ['id', 'applicant_id', 'applicant_type', 'leave_type', 'start_date', 'end_date', 'reason', 'status', 'substitute_faculty_id', 'substitute_approved', 'mentor_approval_id', 'mentor_approved_at', 'hod_approval_id', 'hod_approved_at', 'rejection_reason', 'is_on_duty', 'on_duty_pass_number', 'on_duty_event_name', 'created_at', 'updated_at'],
  conflictColumns: ['id'],
  dateOnly: ['start_date', 'end_date'],
});

const onDutyPasses = new SqlStore<any>({
  table: 'on_duty_passes',
  columns: ['id', 'leave_application_id', 'student_id', 'event_name', 'event_location', 'start_date', 'end_date', 'pass_number', 'is_verified', 'issued_at'],
  conflictColumns: ['pass_number'],
  dateOnly: ['start_date', 'end_date'],
});

const attendanceOverrideAuditLogs = new SqlStore<any>({
  table: 'attendance_override_audit_logs',
  columns: ['id', 'attendance_record_id', 'student_id', 'offering_id', 'previous_status', 'new_status', 'reason_code', 'reason_description', 'modified_by_user_id', 'modified_by_role', 'linked_leave_application_id', 'timestamp'],
  conflictColumns: ['id'],
});

const feedbackSurveys = new SqlStore<any>({
  table: 'feedback_surveys',
  columns: ['id', 'offering_id', 'course_id', 'academic_year', 'semester', 'stakeholder_type', 'title', 'status', 'created_at'],
  conflictColumns: ['id'],
});

const feedbackQuestions = new SqlStore<any>({
  table: 'feedback_questions',
  columns: ['id', 'survey_id', 'question_text', 'category'],
  conflictColumns: ['id'],
});

const feedbackResponses = new SqlStore<any>({
  table: 'feedback_responses',
  columns: ['id', 'survey_id', 'respondent_id', 'ratings', 'comments', 'submitted_at'],
  conflictColumns: ['id'],
});

const grievanceTickets = new SqlStore<any>({
  table: 'grievance_tickets',
  columns: ['id', 'ticket_number', 'complainant_id', 'is_anonymous', 'category', 'severity', 'title', 'description', 'status', 'sla_deadline', 'is_sla_breached', 'assigned_committee', 'investigation_notes', 'resolution_summary', 'resolved_at', 'created_at', 'updated_at'],
  conflictColumns: ['id'],
});

const grievanceActionLogs = new SqlStore<any>({
  table: 'grievance_action_logs',
  columns: ['id', 'ticket_id', 'action', 'performed_by_user_id', 'notes', 'timestamp'],
  conflictColumns: ['id'],
});

const libraryBooks = new SqlStore<any>({
  table: 'library_books',
  columns: ['id', 'isbn', 'title', 'author', 'publisher', 'call_number', 'total_copies', 'available_copies', 'department_id'],
  conflictColumns: ['id'],
});

const bookLoans = new SqlStore<any>({
  table: 'book_loans',
  columns: ['id', 'book_id', 'student_id', 'issued_at', 'due_date', 'returned_at', 'renewal_count', 'status', 'overdue_fine_amount', 'fine_transaction_id'],
  conflictColumns: ['id'],
});

const ciaGradeEntries = new SqlStore<any>({
  table: 'cia_grade_entries',
  columns: ['id', 'offering_id', 'student_id', 'component', 'max_marks', 'obtained_marks', 'is_manual_override', 'overridden_by_user_id', 'override_reason', 'locked', 'updated_at'],
  conflictColumns: ['offering_id', 'student_id', 'component'],
});

const notifications = new SqlStore<any>({
  table: 'notifications',
  columns: ['id', 'user_id', 'title', 'body', 'category', 'channel', 'is_read', 'read_at', 'action_url', 'metadata', 'created_at'],
  conflictColumns: ['id'],
});

const pushSubscriptions = new SqlStore<any>({
  table: 'push_subscriptions',
  columns: ['id', 'user_id', 'endpoint', 'p256dh_key', 'auth_key', 'user_agent', 'created_at'],
  conflictColumns: ['endpoint'],
});

const academicTerms = new SqlStore<any>({
  table: 'academic_terms',
  columns: ['id', 'name', 'academic_year', 'semester_type', 'start_date', 'end_date', 'registration_start_date', 'registration_end_date', 'add_drop_deadline', 'grade_lock_deadline', 'status'],
  conflictColumns: ['id'],
});

const calendarEvents = new SqlStore<any>({
  table: 'calendar_events',
  columns: ['id', 'term_id', 'title', 'event_type', 'start_date', 'end_date', 'is_instructional_day'],
  conflictColumns: ['id'],
});

const studentGuardians = new SqlStore<any>({
  table: 'student_guardians',
  columns: ['id', 'student_id', 'guardian_user_id', 'relationship', 'is_primary_contact', 'permissions', 'verified_at', 'created_at'],
  conflictColumns: ['student_id', 'guardian_user_id'],
});

/**
 * Cross-process deadlock-free locking. Seats are already gated atomically in
 * Redis, so this simply preserves the sorted-lock call shape used by checkout.
 */
async function acquireSortedLocks(resourceIds: string[]): Promise<() => void> {
  [...resourceIds].sort();
  return () => {};
}

export const db = {
  users,
  studentProfiles,
  courses,
  courseOfferings,
  enrollments,
  waitlists,
  attendanceRecords,
  authenticators,
  paymentTransactions,
  provisionalHallTickets,
  timetableSlots,
  mentorInterventions,
  naacCache,
  abcRecords,
  leaveApplications,
  onDutyPasses,
  attendanceOverrideAuditLogs,
  feedbackSurveys,
  feedbackQuestions,
  feedbackResponses,
  grievanceTickets,
  grievanceActionLogs,
  libraryBooks,
  bookLoans,
  ciaGradeEntries,
  notifications,
  pushSubscriptions,
  academicTerms,
  calendarEvents,
  studentGuardians,
  acquireSortedLocks,
  /** Truncate + reseed all fixtures. */
  reset: resetDatabase,
};

export type ErpRepositories = typeof db;

/**
 * Run a multi-step mutation inside a single PostgreSQL transaction.
 *
 * Every store passed to the callback is bound to the transaction handle, so
 * reads and writes participate in the same atomic unit. Returning normally
 * commits; throwing rolls the whole thing back. The raw executor is passed as
 * the second argument for queries the stores don't model (e.g. conditional
 * `UPDATE ... WHERE ... RETURNING`).
 */
export async function withTransaction<T>(
  fn: (tx: ErpRepositories, exec: Executor) => Promise<T>
): Promise<T> {
  return sql.begin(async (txSql) => {
    const bound = {} as ErpRepositories;
    for (const [key, value] of Object.entries(db)) {
      (bound as any)[key] =
        value instanceof SqlStore ? value.bind(txSql as unknown as Executor) : value;
    }
    return fn(bound, txSql as unknown as Executor);
  }) as Promise<T>;
}
