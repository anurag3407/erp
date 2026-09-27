/**
 * Enterprise College ERP - Core Monorepo Export
 * Exporting all 10 Gap-Fixing Functional Modules, Cryptography, Database & Types
 */

// Domain Types
export * from './types/index.js';

// Infrastructure & Primitives
export * from './lib/crypto.js';
export * from './lib/password.js';
export * from './lib/time.js';
export * from './lib/mailer.js';
export * from './lib/redis.js';
export * from './lib/db.js';

// Authentication & Sessions
export * from './modules/auth/sessionStore.js';
export * from './modules/auth/loginThrottle.js';
export * from './modules/auth/authService.js';

// Module 1: High-Concurrency Course Registration & Waiting Room
export * from './modules/registration/waitingRoom.js';
export * from './modules/registration/seatEngine.js';
export * from './modules/registration/checkoutService.js';
export * from './modules/registration/waitlistService.js';

// Module 2: Anti-Proxy Dynamic QR & Geofenced Attendance
export * from './modules/attendance/dynamicQrEngine.js';
export * from './modules/attendance/geofence.js';
export * from './modules/attendance/webauthnService.js';
export * from './modules/attendance/biometricWebhook.js';
export * from './modules/attendance/attendanceService.js';
export * from './modules/attendance/attendanceAnalytics.js';

// Module 3: Graph-Based Degree Audit & NEP 2020 Engine
export * from './modules/degree-audit/curriculumDag.js';
export * from './modules/degree-audit/nepMilestones.js';
export * from './modules/degree-audit/whatIfSimulator.js';
export * from './modules/degree-audit/digilockerSync.js';

// Module 4: Examination Cell, Seating Optimizer & Double-Blind OSV
export * from './modules/examination/seatingOptimizer.js';
export * from './modules/examination/doubleBlindEngine.js';
export * from './modules/examination/osvArbitration.js';
export * from './modules/examination/verifiableCredentials.js';

// Module 5: Resilient Financial Engine & 48-Hour Provisional Passes
export * from './modules/finance/razorpayGateway.js';
export * from './modules/finance/webhookIdempotency.js';
export * from './modules/finance/autoHealingPoller.js';
export * from './modules/finance/provisionalHallTicket.js';

// Module 6: Algorithmic Timetable Solver (CSP) & Exclusion
export * from './modules/timetable/temporalExclusion.js';
export * from './modules/timetable/cspSolver.js';

// Module 7: Early Warning & Predictive Academic Risk (ARS)
export * from './modules/early-warning/arsCalculator.js';
export * from './modules/early-warning/interventionEngine.js';

// Module 8: Continuous Accreditation Telemetry (NAAC / NIRF)
export * from './modules/accreditation/naacTelemetry.js';
export * from './modules/accreditation/ssrExporter.js';

// Module 9: LMS-Lite & LTI 1.3 Advantage
export * from './modules/lms/ltiAdvantage.js';
export * from './modules/lms/gradeSyncWorker.js';

// Module 10: Unified Mobile-First PWA & Offline Engine
export * from './modules/pwa/offlineSync.js';
export * from './modules/pwa/serviceWorkerSpec.js';
export * from './modules/pwa/optimisticUi.js';

// Operational Gap 1: Student & Faculty Leave Management
export * from './modules/leave/leaveService.js';

// Operational Gap 2: Attendance Overrides & Audit Log
export * from './modules/attendance/attendanceOverrideService.js';

// Operational Gap 3: Course Feedback & Statutory Grievance Redressal
export * from './modules/feedback-grievance/feedbackService.js';
export * from './modules/feedback-grievance/grievanceService.js';

// Operational Gap 4: Library Management
export * from './modules/library/libraryService.js';

// Operational Gap 5: Direct CIA Faculty Gradebook
export * from './modules/gradebook/facultyGradebookService.js';

// Operational Gap 6: Multi-Channel Notification Center & VAPID Push
export * from './modules/notifications/notificationCenter.js';

// Operational Gap 7: Academic Terms & Calendar
export * from './modules/academic-calendar/academicCalendarService.js';

// Operational Gap 8: Parent-Student Guardianship Association
export * from './modules/guardianship/guardianshipService.js';

// Operational Gap 9: Role-Based Access Control (RBAC) Route Guards
export * from './modules/rbac/rbacGuard.js';

