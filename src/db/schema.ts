import { pgTable, text, integer, timestamp, numeric, boolean, uuid, pgEnum, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';

/**
 * Enterprise College ERP - Drizzle PostgreSQL Schema
 * Aligned with PRD Section 4 DDL and Plan Section 3 Architecture
 */

// 12 Institutional Roles Enum
export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN',
  'REGISTRAR',
  'DEAN',
  'HOD',
  'FACULTY',
  'STUDENT',
  'PARENT',
  'COE',
  'FINANCE_OFFICER',
  'LIBRARIAN',
  'WARDEN',
  'MENTOR',
]);

// Credit Bucket Types Enum for NEP 2020 DAG
export const creditBucketTypeEnum = pgEnum('credit_bucket_type', [
  'CORE',
  'DISCIPLINE_ELECTIVE',
  'OPEN_ELECTIVE',
  'ABILITY_ENHANCEMENT',
  'SKILL_ENHANCEMENT',
  'MANDATORY_NON_CREDIT',
]);

// 1. Users Table
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: userRoleEnum('role').notNull(),
  departmentId: uuid('department_id'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. Departments
export const departments = pgTable('departments', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
});

// 3. Academic Programs
export const programs = pgTable('programs', {
  id: uuid('id').defaultRandom().primaryKey(),
  departmentId: uuid('department_id').notNull().references(() => departments.id, { onDelete: 'cascade' }),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  degreeType: text('degree_type').notNull(), // B.Tech, M.Tech, B.Sc, etc.
  totalCreditsRequired: integer('total_credits_required').notNull().default(160),
  nepEnabled: boolean('nep_enabled').notNull().default(true),
});

// 4. Student Profiles
export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  rollNumber: text('roll_number').notNull().unique(),
  apaarId: text('apaar_id').notNull().unique(), // DigiLocker / ABC ID
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  currentSemester: integer('current_semester').notNull().default(1),
  admissionYear: integer('admission_year').notNull(),
  academicStatus: text('academic_status').notNull().default('ACTIVE'),
  mentorId: uuid('mentor_id').references(() => users.id),
  cgpa: numeric('cgpa', { precision: 4, scale: 2 }).notNull().default('0.00'),
  totalEarnedCredits: integer('total_earned_credits').notNull().default(0),
  nepExitLevel: integer('nep_exit_level').notNull().default(1),
});

// 5. Courses Catalog
export const courses = pgTable('courses', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  departmentId: uuid('department_id').notNull().references(() => departments.id),
  credits: integer('credits').notNull(),
  lectureHours: integer('lecture_hours').notNull().default(3),
  tutorialHours: integer('tutorial_hours').notNull().default(0),
  practicalHours: integer('practical_hours').notNull().default(0),
  bucketType: creditBucketTypeEnum('bucket_type').notNull().default('CORE'),
  prerequisites: jsonb('prerequisites').default('[]').notNull(),
});

// 6. Course Offerings (Sections & Seats)
export const courseOfferings = pgTable('course_offerings', {
  id: uuid('id').defaultRandom().primaryKey(),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  semester: integer('semester').notNull(),
  academicYear: text('academic_year').notNull(),
  facultyId: uuid('faculty_id').notNull().references(() => users.id),
  maxCapacity: integer('max_capacity').notNull(),
  enrolledCount: integer('enrolled_count').notNull().default(0),
  section: text('section').notNull().default('A'),
  waitlistCount: integer('waitlist_count').notNull().default(0),
});

// 7. Enrollments
export const enrollments = pgTable('enrollments', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
  enrollmentStatus: text('enrollment_status').notNull().default('CONFIRMED'),
  enrolledAt: timestamp('enrolled_at', { withTimezone: true }).defaultNow().notNull(),
});

// 8. Virtual Waiting Room Tokens
export const registrationQueueTokens = pgTable('registration_queue_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isConsumed: boolean('is_consumed').notNull().default(false),
});

// 9. Degree Requirements (DAG Architecture)
export const degreeRequirements = pgTable('degree_requirements', {
  id: uuid('id').defaultRandom().primaryKey(),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  bucketType: creditBucketTypeEnum('bucket_type').notNull(),
  requiredCredits: integer('required_credits').notNull(),
  minCourses: integer('min_courses').notNull(),
  nepExitLevel: integer('nep_exit_level').notNull().default(4), // 1=Cert, 2=Dip, 3=Deg, 4=Honors
  prerequisiteRules: jsonb('prerequisite_rules').default('{}'),
});

// 10. Dynamic Rotating QR Attendance Tokens
export const dynamicAttendanceTokens = pgTable('dynamic_attendance_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  classroomLat: numeric('classroom_lat', { precision: 9, scale: 6 }).notNull(),
  classroomLng: numeric('classroom_lng', { precision: 9, scale: 6 }).notNull(),
  maxRadiusMeters: integer('max_radius_meters').notNull().default(25),
});

// 11. Attendance Records
export const attendanceRecords = pgTable('attendance_records', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  status: text('status').notNull(),
  verificationMethod: text('verification_method').notNull().default('DYNAMIC_QR'),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  distanceMeters: numeric('distance_meters', { precision: 6, scale: 2 }),
  deviceId: text('device_id'),
});

// 12. Hardware Biometric Device Authenticators
export const studentAuthenticators = pgTable('student_authenticators', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  credentialId: text('credential_id').notNull().unique(),
  credentialPublicKey: text('credential_public_key').notNull(),
  counter: integer('counter').notNull().default(0),
  deviceModel: text('device_model').notNull(),
  registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow().notNull(),
});

// 13. Assessments
export const assessments = pgTable('assessments', {
  id: uuid('id').defaultRandom().primaryKey(),
  offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  assessmentType: text('assessment_type').notNull(), // CIA, MID_SEM, END_SEM
  maxMarks: integer('max_marks').notNull().default(100),
  weightage: integer('weightage').notNull().default(50),
  examDate: timestamp('exam_date', { withTimezone: true }).notNull(),
});

// 14. Exam Seating Allocations (Anti-Cheating Graph Result)
export const examSeatingAllocations = pgTable('exam_seating_allocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  examId: uuid('exam_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  hallNumber: text('hall_number').notNull(),
  rowNum: integer('row_num').notNull(),
  colNum: integer('col_num').notNull(),
  seatLabel: text('seat_label').notNull(),
});

// 15. Double-Blind On-Screen Evaluation (OSV) Scripts
export const onScreenEvaluationScripts = pgTable('on_screen_evaluation_scripts', {
  id: uuid('id').defaultRandom().primaryKey(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  anonymousBarcode: text('anonymous_barcode').notNull().unique(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id),
  scannedPdfUrl: text('scanned_pdf_url').notNull(),
  evaluator1Id: uuid('evaluator_1_id').references(() => users.id),
  evaluator1Score: numeric('evaluator_1_score', { precision: 5, scale: 2 }),
  evaluator2Id: uuid('evaluator_2_id').references(() => users.id),
  evaluator2Score: numeric('evaluator_2_score', { precision: 5, scale: 2 }),
  arbiterId: uuid('arbiter_id').references(() => users.id),
  arbiterScore: numeric('arbiter_score', { precision: 5, scale: 2 }),
  finalScore: numeric('final_score', { precision: 5, scale: 2 }),
  status: text('status').notNull().default('AWAITING_FIRST_EVALUATION'),
});

// 16. Fee Structures & Payments
export const feeStructures = pgTable('fee_structures', {
  id: uuid('id').defaultRandom().primaryKey(),
  programId: uuid('program_id').notNull().references(() => programs.id),
  academicYear: text('academic_year').notNull(),
  semester: integer('semester').notNull(),
  feeHead: text('fee_head').notNull(), // Tuition, Exam, Hostel, Lab
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
});

export const paymentTransactions = pgTable('payment_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id),
  feeStructureId: uuid('fee_structure_id').notNull().references(() => feeStructures.id),
  feeHead: text('fee_head'), // e.g. 'LIBRARY_FINE', 'Tuition', etc.
  orderId: text('order_id').notNull().unique(),
  paymentId: text('payment_id'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  amount: numeric('amount', { precision: 10, scale: 2 }).notNull(),
  gateway: text('gateway').notNull().default('RAZORPAY'),
  status: text('status').notNull().default('PENDING'),
  utrReferenceNumber: text('utr_reference_number'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
});

// 17. 48-Hour Provisional Hall Tickets
export const provisionalHallTickets = pgTable('provisional_hall_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id),
  examId: uuid('exam_id').notNull().references(() => assessments.id),
  utrReferenceNumber: text('utr_reference_number').notNull(),
  grantedBy: uuid('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  isReconciled: boolean('is_reconciled').notNull().default(false),
});

// 18. Timetable Slots (PostgreSQL btree_gist temporal exclusion)
export const timetableSlots = pgTable('timetable_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
  roomNumber: text('room_number').notNull(),
  dayOfWeek: integer('day_of_week').notNull(), // 1 to 6
  startTime: text('start_time').notNull(), // HH:MM
  endTime: text('end_time').notNull(),     // HH:MM
  facultyId: uuid('faculty_id').notNull().references(() => users.id),
});

// 19. Early Warning Academic Risk Indicators (ARS)
export const studentRiskIndicators = pgTable('student_risk_indicators', {
  id: uuid('id').defaultRandom().primaryKey(),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  calculationDate: text('calculation_date').notNull(),
  attendancePct: numeric('attendance_pct', { precision: 5, scale: 2 }).notNull(),
  ciaScorePct: numeric('cia_score_pct', { precision: 5, scale: 2 }).notNull(),
  lmsActivityScore: numeric('lms_activity_score', { precision: 5, scale: 2 }).notNull(),
  compositeRiskScore: numeric('composite_risk_score', { precision: 5, scale: 2 }).notNull(),
  riskLevel: text('risk_level').notNull(),
  mentorNotified: boolean('mentor_notified').notNull().default(false),
  mentorActionLogged: text('mentor_action_logged'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 20. NAAC / NIRF Telemetry Cache
export const naacTelemetryCache = pgTable('naac_telemetry_cache', {
  id: uuid('id').defaultRandom().primaryKey(),
  academicYear: text('academic_year').notNull(),
  criterionNumber: integer('criterion_number').notNull(),
  metricCode: text('metric_code').notNull(),
  computedData: jsonb('computed_data').notNull(),
  lastComputedAt: timestamp('last_computed_at', { withTimezone: true }).defaultNow().notNull(),
});

// 21. Leave Applications
export const leaveApplications = pgTable('leave_applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicantId: uuid('applicant_id').notNull(),
  applicantType: text('applicant_type').notNull(), // STUDENT, FACULTY
  leaveType: text('leave_type').notNull(), // CASUAL, MEDICAL, ON_DUTY, etc.
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('PENDING_MENTOR'),
  substituteFacultyId: uuid('substitute_faculty_id').references(() => users.id),
  substituteApproved: boolean('substitute_approved').default(false),
  mentorApprovalId: uuid('mentor_approval_id').references(() => users.id),
  mentorApprovedAt: timestamp('mentor_approved_at', { withTimezone: true }),
  hodApprovalId: uuid('hod_approval_id').references(() => users.id),
  hodApprovedAt: timestamp('hod_approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
  isOnDuty: boolean('is_on_duty').notNull().default(false),
  onDutyPassNumber: text('on_duty_pass_number'),
  onDutyEventName: text('on_duty_event_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 22. On-Duty Passes
export const onDutyPasses = pgTable('on_duty_passes', {
  id: uuid('id').defaultRandom().primaryKey(),
  leaveApplicationId: uuid('leave_application_id').notNull().references(() => leaveApplications.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  eventName: text('event_name').notNull(),
  eventLocation: text('event_location'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  passNumber: text('pass_number').notNull().unique(),
  isVerified: boolean('is_verified').notNull().default(true),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
});

// 23. Attendance Override Audit Logs
export const attendanceOverrideAuditLogs = pgTable('attendance_override_audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  attendanceRecordId: uuid('attendance_record_id').notNull().references(() => attendanceRecords.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
  previousStatus: text('previous_status').notNull(),
  newStatus: text('new_status').notNull(),
  reasonCode: text('reason_code').notNull(),
  reasonDescription: text('reason_description').notNull(),
  modifiedByUserId: uuid('modified_by_user_id').notNull().references(() => users.id),
  modifiedByRole: text('modified_by_role').notNull(),
  linkedLeaveApplicationId: uuid('linked_leave_application_id').references(() => leaveApplications.id),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

// 24. Course Feedback Surveys
export const feedbackSurveys = pgTable('feedback_surveys', {
  id: uuid('id').defaultRandom().primaryKey(),
  offeringId: uuid('offering_id').references(() => courseOfferings.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').references(() => courses.id, { onDelete: 'cascade' }),
  academicYear: text('academic_year').notNull(),
  semester: integer('semester'),
  stakeholderType: text('stakeholder_type').notNull(), // STUDENT, TEACHER, ALUMNI, EMPLOYER
  title: text('title').notNull(),
  status: text('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 25. Feedback Questions (5-point Likert)
export const feedbackQuestions = pgTable('feedback_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  surveyId: uuid('survey_id').notNull().references(() => feedbackSurveys.id, { onDelete: 'cascade' }),
  questionText: text('question_text').notNull(),
  category: text('category').notNull(), // CURRICULUM, PEDAGOGY, COURSE_OUTCOMES, FACILITIES
});

// 26. Feedback Responses
export const feedbackResponses = pgTable('feedback_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  surveyId: uuid('survey_id').notNull().references(() => feedbackSurveys.id, { onDelete: 'cascade' }),
  respondentId: text('respondent_id'),
  ratings: jsonb('ratings').notNull(), // questionId -> 1-5 score
  comments: text('comments'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow().notNull(),
});

// 27. Statutory Grievance Tickets (Anti-Ragging, POSH, Academic)
export const grievanceTickets = pgTable('grievance_tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketNumber: text('ticket_number').notNull().unique(),
  complainantId: uuid('complainant_id').references(() => users.id),
  isAnonymous: boolean('is_anonymous').notNull().default(false),
  category: text('category').notNull(), // ANTI_RAGGING, POSH, ACADEMIC, HOSTEL_INFRASTRUCTURE, DISCIPLINARY
  severity: text('severity').notNull().default('NORMAL'),
  title: text('title').notNull(),
  description: text('description').notNull(),
  status: text('status').notNull().default('SUBMITTED'),
  slaDeadline: timestamp('sla_deadline', { withTimezone: true }).notNull(),
  isSlaBreached: boolean('is_sla_breached').notNull().default(false),
  assignedCommittee: text('assigned_committee').notNull(),
  investigationNotes: text('investigation_notes'),
  resolutionSummary: text('resolution_summary'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 28. Grievance Action Logs
export const grievanceActionLogs = pgTable('grievance_action_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull().references(() => grievanceTickets.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  performedByUserId: uuid('performed_by_user_id').notNull().references(() => users.id),
  notes: text('notes'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
});

// 29. Library Book Catalog
export const libraryBooks = pgTable('library_books', {
  id: uuid('id').defaultRandom().primaryKey(),
  isbn: text('isbn').notNull().unique(),
  title: text('title').notNull(),
  author: text('author').notNull(),
  publisher: text('publisher').notNull(),
  callNumber: text('call_number').notNull(),
  totalCopies: integer('total_copies').notNull().default(1),
  availableCopies: integer('available_copies').notNull().default(1),
  departmentId: uuid('department_id').references(() => departments.id),
});

// 30. Book Loan Circulation
export const bookLoans = pgTable('book_loans', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookId: uuid('book_id').notNull().references(() => libraryBooks.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).defaultNow().notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  returnedAt: timestamp('returned_at', { withTimezone: true }),
  renewalCount: integer('renewal_count').notNull().default(0),
  status: text('status').notNull().default('ISSUED'),
  overdueFineAmount: numeric('overdue_fine_amount', { precision: 10, scale: 2 }).notNull().default('0.00'),
  fineTransactionId: uuid('fine_transaction_id').references(() => paymentTransactions.id),
});

// 31. Direct CIA Faculty Gradebook Entries
export const ciaGradeEntries = pgTable(
  'cia_grade_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    offeringId: uuid('offering_id').notNull().references(() => courseOfferings.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
    component: text('component').notNull(), // QUIZ_1, ASSIGNMENT_1, MID_TERM, etc.
    maxMarks: numeric('max_marks', { precision: 5, scale: 2 }).notNull(),
    obtainedMarks: numeric('obtained_marks', { precision: 5, scale: 2 }).notNull(),
    isManualOverride: boolean('is_manual_override').notNull().default(false),
    overriddenByUserId: uuid('overridden_by_user_id').references(() => users.id),
    overrideReason: text('override_reason'),
    locked: boolean('locked').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table: any) => [
    uniqueIndex('cia_grade_entries_unique_idx').on(table.offeringId, table.studentId, table.component),
  ]
);

// 32. Multi-Channel Notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  category: text('category').notNull(), // ACADEMIC, EXAM, ATTENDANCE_ALERT, etc.
  channel: text('channel').notNull().default('IN_APP'),
  isRead: boolean('is_read').notNull().default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  actionUrl: text('action_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 33. VAPID Web Push Subscriptions
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  endpoint: text('endpoint').notNull().unique(),
  p256dhKey: text('p256dh_key').notNull(),
  authKey: text('auth_key').notNull(),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// 34. Academic Terms
export const academicTerms = pgTable('academic_terms', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  academicYear: text('academic_year').notNull(),
  semesterType: text('semester_type').notNull(), // ODD, EVEN, SUMMER
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  registrationStartDate: timestamp('registration_start_date', { withTimezone: true }).notNull(),
  registrationEndDate: timestamp('registration_end_date', { withTimezone: true }).notNull(),
  addDropDeadline: timestamp('add_drop_deadline', { withTimezone: true }).notNull(),
  gradeLockDeadline: timestamp('grade_lock_deadline', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('ACTIVE'),
});

// 35. Academic Calendar Events
export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  termId: uuid('term_id').notNull().references(() => academicTerms.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  eventType: text('event_type').notNull(), // HOLIDAY, EXAMINATION, etc.
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  isInstructionalDay: boolean('is_instructional_day').notNull().default(false),
});

// 36. Parent-Student Guardianship Junction
export const studentGuardians = pgTable(
  'student_guardians',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studentId: uuid('student_id').notNull().references(() => studentProfiles.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    relationship: text('relationship').notNull(), // FATHER, MOTHER, LEGAL_GUARDIAN, etc.
    isPrimaryContact: boolean('is_primary_contact').notNull().default(false),
    permissions: jsonb('permissions').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table: any) => [
    uniqueIndex('student_guardians_unique_idx').on(table.studentId, table.guardianUserId),
  ]
);

