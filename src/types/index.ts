/**
 * Enterprise College ERP - Core Domain Type Definitions
 * Aligned with PRD v2.0 and Architecture Implementation Plan v2.0
 */

// 12 Institutional Roles
export type UserRole =
  | 'SUPER_ADMIN'
  | 'REGISTRAR'
  | 'DEAN'
  | 'HOD'
  | 'FACULTY'
  | 'STUDENT'
  | 'PARENT'
  | 'COE'
  | 'FINANCE_OFFICER'
  | 'LIBRARIAN'
  | 'WARDEN'
  | 'MENTOR';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  departmentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type NepExitMilestone = 'CERTIFICATE' | 'DIPLOMA' | 'DEGREE' | 'HONORS_RESEARCH';

export interface StudentProfile {
  id: string;
  userId: string;
  rollNumber: string;
  apaarId: string; // India DigiLocker / ABC ID
  programId: string;
  currentSemester: number;
  admissionYear: number;
  academicStatus: 'ACTIVE' | 'ON_LEAVE' | 'PROBATION' | 'GRADUATED' | 'EXITED_NEP';
  mentorId?: string;
  cgpa: number;
  totalEarnedCredits: number;
  nepExitLevel: 1 | 2 | 3 | 4; // 1=Cert(40), 2=Dip(80), 3=Deg(120), 4=Honors(160)
}

export type CreditBucketType =
  | 'CORE'
  | 'DISCIPLINE_ELECTIVE'
  | 'OPEN_ELECTIVE'
  | 'ABILITY_ENHANCEMENT'
  | 'SKILL_ENHANCEMENT'
  | 'MANDATORY_NON_CREDIT';

export interface Course {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  credits: number;
  lectureHours: number;
  tutorialHours: number;
  practicalHours: number;
  bucketType: CreditBucketType;
  prerequisites: string[]; // Course IDs
}

export interface CourseOffering {
  id: string;
  courseId: string;
  semester: number;
  academicYear: string;
  facultyId: string;
  maxCapacity: number;
  enrolledCount: number;
  section: string;
  waitlistCount: number;
}

export interface RegistrationQueueToken {
  id: string;
  studentId: string;
  tokenHash: string;
  queuePosition: number;
  grantedAt: Date;
  expiresAt: Date;
  isConsumed: boolean;
}

export interface DynamicAttendanceToken {
  id: string;
  offeringId: string;
  tokenHash: string;
  timeStep: number;
  generatedAt: Date;
  expiresAt: Date;
  classroomLat: number;
  classroomLng: number;
  maxRadiusMeters: number;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  offeringId: string;
  timestamp: Date;
  status: 'PRESENT' | 'ABSENT' | 'OUT_OF_BOUNDS' | 'PROXY_ATTEMPT_REJECTED';
  verificationMethod: 'DYNAMIC_QR' | 'WEBAUTHN' | 'RFID' | 'MANUAL';
  latitude?: number;
  longitude?: number;
  distanceMeters?: number;
  deviceId?: string;
}

export interface ExamSeat {
  id: string;
  examId: string;
  studentId: string;
  departmentId: string;
  coursePaperId: string;
  hallNumber: string;
  rowNum: number;
  colNum: number;
  seatLabel: string;
}

export interface OnScreenEvaluationScript {
  id: string;
  assessmentId: string;
  anonymousBarcode: string;
  studentId: string;
  scannedPdfUrl: string;
  maxScore: number;
  evaluator1Id?: string;
  evaluator1Score?: number;
  evaluator2Id?: string;
  evaluator2Score?: number;
  arbiterId?: string;
  arbiterScore?: number;
  finalScore?: number;
  status: 'PENDING_EVAL_1' | 'PENDING_EVAL_2' | 'ARBITRATION_REQUIRED' | 'FINALIZED';
  arbitrationReason?: string;
}

export interface VerifiableMarksheet {
  studentId: string;
  rollNumber: string;
  studentName: string;
  programCode: string;
  academicYear: string;
  semester: number;
  courses: Array<{
    courseCode: string;
    courseName: string;
    credits: number;
    gradePoint: number;
    letterGrade: string;
  }>;
  sgpa: number;
  cgpa: number;
  issuedAt: string;
  issuerPublicKey: string;
  signature: string;
}

export interface PaymentTransaction {
  id: string;
  studentId: string;
  feeStructureId: string;
  feeHead?: string; // e.g. 'LIBRARY_FINE', 'TUITION', etc.
  amount: number;
  gateway: 'RAZORPAY' | 'UPI' | 'NETBANKING' | 'MANDATE';
  orderId: string;
  paymentId?: string;
  idempotencyKey: string;
  status: 'PENDING' | 'CAPTURED' | 'FAILED' | 'RECONCILED_BY_POLLER';
  utrReferenceNumber?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProvisionalHallTicket {
  id: string;
  studentId: string;
  examId: string;
  utrReferenceNumber: string;
  grantedBy: string;
  grantedAt: Date;
  expiresAt: Date; // 48-hour validity
  isReconciled: boolean;
  qrPayload: string;
}

export interface TimetableSlot {
  id: string;
  offeringId: string;
  roomNumber: string;
  dayOfWeek: number; // 1 (Mon) - 6 (Sat)
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  facultyId: string;
}

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface StudentRiskIndicator {
  studentId: string;
  calculationDate: string;
  attendancePct: number;
  ciaScorePct: number;
  lmsActivityScore: number;
  feeDuesPenalty: number;
  compositeRiskScore: number; // 0-100 ARS
  riskLevel: RiskLevel;
  mentorNotified: boolean;
  mentorActionLogged?: string;
}

export interface MentorInterventionCase {
  id: string;
  studentId: string;
  mentorId: string;
  riskScore: number;
  caseStatus: 'OPEN' | 'IN_COUNSELING' | 'RESOLVED' | 'ESCALATED';
  actionNotes?: string;
  slaDeadline: Date; // 7 days from creation
  createdAt: Date;
}

export interface NaacMetricCache {
  academicYear: string;
  criterionNumber: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  metricCode: string;
  computedData: Record<string, unknown>;
  lastComputedAt: Date;
}

// ----------------------------------------------------------------------
// Operational Gap 1: Leave Management & On-Duty Passes
// ----------------------------------------------------------------------

export type LeaveType = 'CASUAL' | 'MEDICAL' | 'ON_DUTY' | 'ACADEMIC_DUTY' | 'SPECIAL_CASUAL';
export type ApplicantType = 'STUDENT' | 'FACULTY';
export type LeaveStatus = 'PENDING_MENTOR' | 'PENDING_HOD' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface LeaveApplication {
  id: string;
  applicantId: string; // studentProfileId or userId
  applicantType: ApplicantType;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  reason: string;
  status: LeaveStatus;
  substituteFacultyId?: string;
  substituteApproved?: boolean;
  mentorApprovalId?: string;
  mentorApprovedAt?: Date;
  hodApprovalId?: string;
  hodApprovedAt?: Date;
  rejectionReason?: string;
  isOnDuty: boolean;
  onDutyPassNumber?: string;
  onDutyEventName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OnDutyPass {
  id: string;
  leaveApplicationId: string;
  studentId: string;
  eventName: string;
  eventLocation?: string;
  startDate: string;
  endDate: string;
  passNumber: string;
  isVerified: boolean;
  issuedAt: Date;
}

// ----------------------------------------------------------------------
// Operational Gap 2: Attendance Overrides & Audit Log
// ----------------------------------------------------------------------

export type AttendanceOverrideReasonCode =
  | 'MEDICAL_LEAVE'
  | 'ON_DUTY_APPROVED'
  | 'BIOMETRIC_DEVICE_FAILURE'
  | 'GEOFENCE_GPS_DRIFT'
  | 'TEACHER_ERROR'
  | 'OFFICIAL_DUTY_EXEMPTION'
  | 'ADMINISTRATIVE_CORRECTION';

export interface AttendanceOverrideAuditLog {
  id: string;
  attendanceRecordId: string;
  studentId: string;
  offeringId: string;
  previousStatus: string;
  newStatus: string;
  reasonCode: AttendanceOverrideReasonCode;
  reasonDescription: string;
  modifiedByUserId: string;
  modifiedByRole: UserRole;
  linkedLeaveApplicationId?: string;
  timestamp: Date;
}

// ----------------------------------------------------------------------
// Operational Gap 3: Course Feedback & Statutory Grievance Redressal
// ----------------------------------------------------------------------

export type FeedbackStakeholderType = 'STUDENT' | 'TEACHER' | 'ALUMNI' | 'EMPLOYER';

export interface FeedbackSurvey {
  id: string;
  offeringId?: string;
  courseId?: string;
  academicYear: string;
  semester?: number;
  stakeholderType: FeedbackStakeholderType;
  title: string;
  status: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  createdAt: Date;
}

export interface FeedbackQuestion {
  id: string;
  surveyId: string;
  questionText: string;
  category: 'CURRICULUM' | 'PEDAGOGY' | 'COURSE_OUTCOMES' | 'FACILITIES';
}

export interface FeedbackResponse {
  id: string;
  surveyId: string;
  respondentId?: string;
  ratings: Record<string, number>; // questionId -> 1-5 Likert score
  comments?: string;
  submittedAt: Date;
}

export interface NaacMetric14Report {
  academicYear: string;
  totalResponses: number;
  averageLikertScore: number; // e.g. 4.65 out of 5.0
  satisfactionPercentage: number; // percentage scoring >= 4
  stakeholderBreakdown: Record<FeedbackStakeholderType, { count: number; avgRating: number }>;
  categoryBreakdown: Record<string, number>;
  naacMetric1_4_Compliant: boolean;
}

export type GrievanceCategory = 'ANTI_RAGGING' | 'POSH' | 'ACADEMIC' | 'HOSTEL_INFRASTRUCTURE' | 'DISCIPLINARY';
export type GrievanceSeverity = 'NORMAL' | 'HIGH' | 'CRITICAL';
export type GrievanceStatus =
  | 'SUBMITTED'
  | 'UNDER_INVESTIGATION'
  | 'COMMITTEE_HEARING'
  | 'RESOLVED'
  | 'ESCALATED'
  | 'CLOSED';

export interface GrievanceTicket {
  id: string;
  ticketNumber: string;
  complainantId?: string;
  isAnonymous: boolean;
  category: GrievanceCategory;
  severity: GrievanceSeverity;
  title: string;
  description: string;
  status: GrievanceStatus;
  slaDeadline: Date;
  isSlaBreached: boolean;
  assignedCommittee: string;
  investigationNotes?: string;
  resolutionSummary?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface GrievanceActionLog {
  id: string;
  ticketId: string;
  action: string;
  performedByUserId: string;
  notes?: string;
  timestamp: Date;
}

// ----------------------------------------------------------------------
// Operational Gap 4: Library Management
// ----------------------------------------------------------------------

export type BookCategory = 'TEXTBOOK' | 'REFERENCE' | 'JOURNAL' | 'FICTION' | 'MONOGRAPH';

export interface LibraryBook {
  id: string;
  isbn: string;
  title: string;
  author: string;
  publisher: string;
  callNumber: string;
  totalCopies: number;
  availableCopies: number;
  departmentId?: string;
}

export type BookLoanStatus = 'ISSUED' | 'RETURNED' | 'OVERDUE' | 'LOST';

export interface BookLoan {
  id: string;
  bookId: string;
  studentId: string;
  issuedAt: Date;
  dueDate: Date;
  returnedAt?: Date;
  renewalCount: number;
  status: BookLoanStatus;
  overdueFineAmount: number;
  fineTransactionId?: string;
}

export interface LibraryHallTicketClearance {
  studentId: string;
  cleared: boolean;
  overdueBooksCount: number;
  pendingFineAmount: number;
  provisionalPassEligible: boolean;
  unreturnedLoans: BookLoan[];
}

// ----------------------------------------------------------------------
// Operational Gap 5: Direct CIA Faculty Gradebook
// ----------------------------------------------------------------------

export interface CiaGradeEntry {
  id: string;
  offeringId: string;
  studentId: string;
  component: string;
  maxMarks: number;
  obtainedMarks: number;
  isManualOverride: boolean;
  overriddenByUserId?: string;
  overrideReason?: string;
  locked: boolean;
  updatedAt: Date;
}

export interface BulkGradeUpsertItem {
  studentId: string;
  component: string;
  maxMarks: number;
  obtainedMarks: number;
  isManualOverride?: boolean;
  overrideReason?: string;
}

export interface GradebookSpreadsheet {
  offeringId: string;
  components: Array<{ name: string; maxMarks: number }>;
  entries: Array<{
    studentId: string;
    marks: Record<string, { obtained: number; isManualOverride: boolean; maxMarks: number }>;
  }>;
  isLocked: boolean;
}

// ----------------------------------------------------------------------
// Operational Gap 6: Multi-Channel Notification Center & VAPID Push
// ----------------------------------------------------------------------

export type NotificationChannel = 'IN_APP' | 'WEB_PUSH' | 'EMAIL' | 'SMS';
export type NotificationCategory =
  | 'ACADEMIC'
  | 'EXAM'
  | 'ATTENDANCE_ALERT'
  | 'FEE_DUE'
  | 'EMERGENCY'
  | 'LEAVE_STATUS'
  | 'GRIEVANCE_UPDATE'
  | 'LIBRARY';

export interface InAppNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  isRead: boolean;
  readAt?: Date;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface WebPushSubscription {
  id: string;
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  userAgent?: string;
  createdAt: Date;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface CohortBroadcastTarget {
  role?: UserRole;
  departmentId?: string;
  programId?: string;
  offeringId?: string;
  all?: boolean;
}

// ----------------------------------------------------------------------
// Operational Gap 7: Academic Terms & Calendar
// ----------------------------------------------------------------------

export type TermStatus = 'UPCOMING' | 'ACTIVE' | 'GRADES_LOCKED' | 'ARCHIVED';
export type SemesterType = 'ODD' | 'EVEN' | 'SUMMER';

export interface AcademicTerm {
  id: string;
  name: string;
  academicYear: string;
  semesterType: SemesterType;
  startDate: Date;
  endDate: Date;
  registrationStartDate: Date;
  registrationEndDate: Date;
  addDropDeadline: Date;
  gradeLockDeadline: Date;
  status: TermStatus;
}

export type CalendarEventType =
  | 'HOLIDAY'
  | 'EXAMINATION'
  | 'FEE_PAYMENT_DEADLINE'
  | 'SEMESTER_BREAK'
  | 'CONVOCATION'
  | 'ACADEMIC_EVENT';

export interface CalendarEvent {
  id: string;
  termId: string;
  title: string;
  eventType: CalendarEventType;
  startDate: Date;
  endDate: Date;
  isInstructionalDay: boolean;
}

// ----------------------------------------------------------------------
// Operational Gap 8: Parent-Student Guardianship Association
// ----------------------------------------------------------------------

export type GuardianRelationship = 'FATHER' | 'MOTHER' | 'LEGAL_GUARDIAN' | 'LOCAL_GUARDIAN';

export interface GuardianPermissions {
  canViewAttendance: boolean;
  canViewGrades: boolean;
  canViewFeeDues: boolean;
  canPayFees: boolean;
  canApplyLeave: boolean;
  canReceiveAlerts: boolean;
  isEmergencyContact: boolean;
}

export interface StudentGuardian {
  id: string;
  studentId: string;
  guardianUserId: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
  permissions: GuardianPermissions;
  verifiedAt?: Date;
  createdAt: Date;
}

// ----------------------------------------------------------------------
// Operational Gap 9: Role-Based Access Control (RBAC) Route Guards
// ----------------------------------------------------------------------

export type RbacPermission =
  | 'SYSTEM_MANAGE'
  | 'USER_MANAGE'
  | 'CALENDAR_MANAGE'
  | 'CURRICULUM_MANAGE'
  | 'COURSE_OFFER'
  | 'COURSE_REGISTER'
  | 'ADD_DROP_COURSE'
  | 'ATTENDANCE_MARK'
  | 'ATTENDANCE_OVERRIDE'
  | 'ATTENDANCE_VIEW_ALL'
  | 'ATTENDANCE_VIEW_SELF'
  | 'ATTENDANCE_VIEW_WARD'
  | 'GRADE_ENTER'
  | 'GRADE_OVERRIDE'
  | 'GRADE_LOCK'
  | 'GRADE_PUBLISH'
  | 'SEATING_GENERATE'
  | 'OSV_EVALUATE'
  | 'OSV_ARBITRATE'
  | 'LEAVE_APPLY_SELF'
  | 'LEAVE_APPLY_WARD'
  | 'LEAVE_APPROVE_MENTOR'
  | 'LEAVE_APPROVE_HOD'
  | 'FEE_COLLECT'
  | 'FEE_RECONCILE'
  | 'FEE_PAY'
  | 'FEE_VIEW'
  | 'LIBRARY_CIRCULATE'
  | 'LIBRARY_CATALOG_MANAGE'
  | 'LIBRARY_FINE_COLLECT'
  | 'GRIEVANCE_FILE'
  | 'GRIEVANCE_INVESTIGATE'
  | 'GRIEVANCE_RESOLVE'
  | 'FEEDBACK_SUBMIT'
  | 'FEEDBACK_ANALYZE'
  | 'GUARDIAN_LINK_MANAGE'
  | 'NOTIFICATION_BROADCAST'
  | 'NOTIFICATION_READ';

export interface RouteRule {
  pathPattern: RegExp;
  method?: string;
  allowedRoles: UserRole[];
  requiredPermissions: RbacPermission[];
}

export interface RbacAuthResult {
  authorized: boolean;
  role: UserRole;
  reason?: string;
}

