import assert from 'node:assert';
import {
  db,
  // Module 1
  leaveService,
  // Module 2
  attendanceOverrideService,
  // Module 3
  feedbackService,
  grievanceService,
  // Module 4
  libraryService,
  // Module 5
  facultyGradebookService,
  gradeSyncWorker,
  // Module 6
  notificationCenter,
  // Module 7
  academicCalendarService,
  // Module 8
  guardianshipService,
  // Module 9
  rbacGuard,
  ALL_INSTITUTIONAL_ROLES,
  validateTemporalExclusion,
  type TimetableSlot,
} from '../../src/index.js';

export async function runOperationalGapsTests(): Promise<void> {
  console.log('\n=== RUNNING 9 OPERATIONAL GAPS VERIFICATION TESTS ===\n');

  // =========================================================================
  // GAP 1: Student & Faculty Leave Management
  // =========================================================================
  console.log('Test 3.1: Student & Faculty Leave Management + Substitute Timetable Conflict');

  const studentId = 'stu-profile-01';
  const faculty1Id = 'usr-fac-01';
  const faculty2Id = 'usr-fac-02';
  const mentorId = 'usr-mentor-01';
  const hodId = 'usr-hod-01';

  // 1.1 Student Regular Casual Leave Routing
  const studentLeave = leaveService.applyStudentLeave({
    studentId,
    leaveType: 'CASUAL',
    startDate: '2025-10-10',
    endDate: '2025-10-12',
    reason: 'Family wedding event',
  });
  assert.strictEqual(studentLeave.status, 'PENDING_MENTOR', 'Student leave must route to mentor');

  const mentorApproved = leaveService.approveByMentor(studentLeave.id, mentorId, 'Recommended by mentor');
  assert.strictEqual(mentorApproved.status, 'PENDING_HOD', 'Approved student leave must route to HOD');

  const hodApproved = leaveService.approveByHod(studentLeave.id, hodId);
  assert.strictEqual(hodApproved.application.status, 'APPROVED', 'HOD must finalize approval');

  // 1.2 Student On-Duty (OD) Pass Generation
  const odLeave = leaveService.applyStudentLeave({
    studentId,
    leaveType: 'ON_DUTY',
    startDate: '2025-11-01',
    endDate: '2025-11-03',
    reason: 'Smart India Hackathon Finals',
    isOnDuty: true,
    onDutyEventName: 'Smart India Hackathon 2025',
  });
  leaveService.approveByMentor(odLeave.id, mentorId);
  const odHodResult = leaveService.approveByHod(odLeave.id, hodId);
  assert.strictEqual(odHodResult.application.status, 'APPROVED');
  assert.ok(odHodResult.onDutyPass, 'On-Duty pass must be generated on approval');
  assert.ok(odHodResult.onDutyPass?.passNumber.startsWith('OD-'), 'Pass number format must start with OD-');

  // Verify OD pass at gate
  const passCheck = leaveService.verifyOnDutyPass(odHodResult.onDutyPass.passNumber);
  assert.strictEqual(passCheck.isValid, true, 'On-duty pass must verify as valid');
  assert.strictEqual(passCheck.pass?.eventName, 'Smart India Hackathon 2025');

  // 1.3 Faculty Leave with Substitute Timetable Conflict Check
  // Set up existing slot for faculty 1: Day 1 (Mon) 09:00 - 10:00
  const slotFac1: TimetableSlot = {
    id: 'slot-fac1-mon-9am',
    offeringId: 'offering-cs301-s1',
    roomNumber: 'LH-101',
    dayOfWeek: 1,
    startTime: '09:00',
    endTime: '10:00',
    facultyId: faculty1Id,
  };
  db.timetableSlots.set(slotFac1.id, slotFac1);

  // Set up colliding slot for substitute faculty 2: Day 1 (Mon) 09:30 - 10:30 (overlap!)
  const slotFac2Overlap: TimetableSlot = {
    id: 'slot-fac2-mon-overlap',
    offeringId: 'offering-oe101-s1',
    roomNumber: 'LH-102',
    dayOfWeek: 1,
    startTime: '09:30',
    endTime: '10:30',
    facultyId: faculty2Id,
  };
  db.timetableSlots.set(slotFac2Overlap.id, slotFac2Overlap);

  // Attempt faculty 1 leave nominating substitute faculty 2 -> MUST REJECT due to clash
  assert.throws(
    () => {
      leaveService.applyFacultyLeave({
        facultyId: faculty1Id,
        leaveType: 'CASUAL',
        startDate: '2025-10-15',
        endDate: '2025-10-16',
        reason: 'Conference presentation',
        substituteFacultyId: faculty2Id,
      });
    },
    /TIMETABLE_CONFLICT/,
    'Faculty leave with overlapping substitute slot must throw TIMETABLE_CONFLICT'
  );

  // Clear collision: move substitute slot to non-overlapping time 11:00 - 12:00
  slotFac2Overlap.startTime = '11:00';
  slotFac2Overlap.endTime = '12:00';

  // Re-attempt faculty leave -> MUST SUCCEED
  const facLeaveSuccess = leaveService.applyFacultyLeave({
    facultyId: faculty1Id,
    leaveType: 'CASUAL',
    startDate: '2025-10-15',
    endDate: '2025-10-16',
    reason: 'Conference presentation',
    substituteFacultyId: faculty2Id,
  });
  assert.strictEqual(facLeaveSuccess.status, 'PENDING_HOD');
  assert.strictEqual(facLeaveSuccess.substituteFacultyId, faculty2Id);
  console.log('  ✓ Gap 1: Leave Management, OD Pass & Timetable Exclusion Conflict Passed');

  // =========================================================================
  // GAP 2: Attendance Overrides & Audit Log
  // =========================================================================
  console.log('Test 3.2: Attendance Overrides, Reason Codes & Leave Integration');

  // Create test attendance record
  const attRecordId = 'att-test-override-01';
  db.attendanceRecords.set(attRecordId, {
    id: attRecordId,
    studentId,
    offeringId: 'offering-cs301-s1',
    timestamp: new Date('2025-11-02T10:00:00Z'),
    status: 'ABSENT',
    verificationMethod: 'DYNAMIC_QR',
  });

  // 2.1 Teacher/HOD Manual Override with Reason Code
  const overrideRes = attendanceOverrideService.overrideAttendance({
    attendanceRecordId: attRecordId,
    newStatus: 'PRESENT',
    reasonCode: 'TEACHER_ERROR',
    reasonDescription: 'Student was physically present; scanner battery died',
    modifiedByUserId: faculty1Id,
    modifiedByRole: 'FACULTY',
  });
  assert.strictEqual(overrideRes.success, true);
  assert.strictEqual(overrideRes.previousStatus, 'ABSENT');
  assert.strictEqual(overrideRes.updatedRecord.status, 'PRESENT');
  assert.strictEqual(overrideRes.auditLog.reasonCode, 'TEACHER_ERROR');

  // 2.2 Verify Immutable Audit Log
  const history = attendanceOverrideService.getAuditHistory(attRecordId);
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].modifiedByUserId, faculty1Id);

  // 2.3 Role Authorization: Student cannot override attendance
  assert.throws(
    () => {
      attendanceOverrideService.overrideAttendance({
        attendanceRecordId: attRecordId,
        newStatus: 'PRESENT',
        reasonCode: 'GEOFENCE_GPS_DRIFT',
        reasonDescription: 'Self correction',
        modifiedByUserId: 'usr-stu-01',
        modifiedByRole: 'STUDENT',
      });
    },
    /UNAUTHORIZED/,
    'Student role must not be permitted to override attendance'
  );

  // 2.4 Apply Approved Leave Integration to Attendance
  // Reset record to ABSENT
  db.attendanceRecords.get(attRecordId)!.status = 'ABSENT';
  const autoLeaveRes = attendanceOverrideService.applyApprovedLeaveOverride(
    odHodResult.application.id,
    hodId,
    'HOD'
  );
  assert.strictEqual(autoLeaveRes.processedCount, 1, 'Approved OD leave must auto-override attendance');
  assert.strictEqual(db.attendanceRecords.get(attRecordId)!.status, 'PRESENT');
  assert.strictEqual(autoLeaveRes.auditLogs[0].reasonCode, 'ON_DUTY_APPROVED');
  console.log('  ✓ Gap 2: Attendance Overrides, Reason Codes & Leave Integration Passed');

  // =========================================================================
  // GAP 3: Course Feedback & Statutory Grievance Redressal
  // =========================================================================
  console.log('Test 3.3: Course Feedback (5-point Likert) & Statutory Grievances (SLA Tracking)');

  // 3.1 5-point Likert Surveys feeding NAAC Metric 1.4
  const { survey, questions } = feedbackService.createSurvey({
    offeringId: 'offering-cs301-s1',
    courseId: 'crs-cse-301',
    academicYear: '2025-2026',
    semester: 4,
    stakeholderType: 'STUDENT',
    title: 'Distributed Systems Course & Curriculum Feedback',
    questions: [
      { questionText: 'Course objectives were clearly communicated', category: 'CURRICULUM' },
      { questionText: 'Faculty pedagogy facilitated deep understanding', category: 'PEDAGOGY' },
      { questionText: 'Course outcomes and laboratory skills achieved', category: 'COURSE_OUTCOMES' },
    ],
  });

  // Submit valid responses
  for (let i = 1; i <= 15; i++) {
    feedbackService.submitResponse({
      surveyId: survey.id,
      respondentId: `student-${i}`,
      ratings: {
        [questions[0].id]: (i % 2 === 0 ? 5 : 4),
        [questions[1].id]: 5,
        [questions[2].id]: 4,
      },
      comments: 'Excellent curriculum structure and rigor.',
    });
  }

  // Reject invalid Likert rating (outside 1-5)
  assert.throws(
    () => {
      feedbackService.submitResponse({
        surveyId: survey.id,
        respondentId: 'student-bad-rating',
        ratings: {
          [questions[0].id]: 6, // Invalid > 5
        },
      });
    },
    /Invalid Likert rating/,
    'Ratings outside 1-5 must be rejected'
  );

  // Compute NAAC Metric 1.4 Report
  const naacReport = feedbackService.computeNaacMetric14('2025-2026');
  assert.strictEqual(naacReport.totalResponses, 15);
  assert.ok(naacReport.averageLikertScore >= 4.0, 'Average score must be >= 4.0');
  assert.strictEqual(naacReport.naacMetric1_4_Compliant, true);
  assert.ok(db.naacCache.has('naac-1.4-2025-2026'), 'Metric 1.4 must be cached in naacTelemetryCache');

  // 3.2 Statutory Grievances (Anti-Ragging, POSH, Academic)
  // Anti-Ragging (Strict 24h SLA)
  const raggingTicket = grievanceService.fileGrievance({
    complainantId: 'usr-stu-01',
    category: 'ANTI_RAGGING',
    title: 'Intimidation incident in Hostel Block B',
    description: 'Freshman harassment reported near dining hall',
  });
  assert.strictEqual(raggingTicket.severity, 'CRITICAL');
  const raggingSlaHours = Math.round((raggingTicket.slaDeadline.getTime() - raggingTicket.createdAt.getTime()) / 3600000);
  assert.strictEqual(raggingSlaHours, 24, 'Anti-Ragging SLA must strictly be 24 hours');

  // POSH Grievance with Anonymous Flag
  const poshTicket = grievanceService.fileGrievance({
    isAnonymous: true,
    category: 'POSH',
    title: 'Workplace harassment complaint',
    description: 'Inappropriate conduct reported during evening lab session',
  });
  assert.strictEqual(poshTicket.isAnonymous, true);
  assert.strictEqual(poshTicket.complainantId, undefined, 'Anonymous complaint must mask complainantId');
  const poshSlaHours = Math.round((poshTicket.slaDeadline.getTime() - poshTicket.createdAt.getTime()) / 3600000);
  assert.strictEqual(poshSlaHours, 168, 'POSH SLA must be 7 days (168h)');

  // Simulate SLA breach check
  const futureTime = new Date(Date.now() + 30 * 3600 * 1000); // 30h later (Anti-Ragging 24h breached!)
  const breachCheck = grievanceService.checkSlaBreaches(futureTime);
  assert.ok(breachCheck.breachedCount >= 1, 'Unresolved Anti-ragging ticket at 30h must breach 24h SLA');
  assert.strictEqual(raggingTicket.isSlaBreached, true);

  // Resolve Ticket
  grievanceService.resolveGrievance(raggingTicket.id, 'usr-warden-01', 'Perpetrators identified and disciplined');
  assert.strictEqual(raggingTicket.status, 'RESOLVED');

  const grvStats = grievanceService.getGrievanceStats();
  assert.ok(grvStats.totalTickets >= 2);
  assert.ok(grvStats.resolvedTickets >= 1);
  console.log('  ✓ Gap 3: Course Feedback Likert 1.4 & Statutory Grievance SLAs Passed');

  // =========================================================================
  // GAP 4: Library Management & 48h Provisional Hall Ticket Gate
  // =========================================================================
  console.log('Test 3.4: Library Catalog, Circulation, Overdue Fines & Provisional Pass Gate');

  // 4.1 Catalog & Availability
  const book = libraryService.addBook({
    isbn: '978-0262033848',
    title: 'Introduction to Algorithms (CLRS)',
    author: 'Cormen, Leiserson, Rivest, Stein',
    publisher: 'MIT Press',
    callNumber: 'QA76.6 .C662 2009',
    totalCopies: 2,
  });
  assert.strictEqual(book.availableCopies, 2);

  // 4.2 Issue Book
  const loan1 = libraryService.issueBook(book.id, studentId, 14);
  assert.strictEqual(loan1.status, 'ISSUED');
  assert.strictEqual(book.availableCopies, 1);

  // 4.3 Renew Book
  const renewedLoan = libraryService.renewBook(loan1.id, 7);
  assert.strictEqual(renewedLoan.renewalCount, 1);

  // 4.4 Return Book Overdue -> Calculates Fine and Creates Payment Transaction
  // Simulate returning 6 days late (due date was 6 days ago)
  const lateReturnDate = new Date(loan1.dueDate.getTime() + 6 * 86400000);
  const { loan: returnedLoan, fineTransaction } = libraryService.returnBook(loan1.id, lateReturnDate);
  assert.strictEqual(returnedLoan.status, 'RETURNED');
  assert.strictEqual(book.availableCopies, 2, 'Available copies restored on return');
  assert.strictEqual(returnedLoan.overdueFineAmount, 30.0, '6 days overdue at ₹5/day = ₹30');
  assert.ok(fineTransaction, 'Fine transaction must be created');
  assert.strictEqual(fineTransaction?.amount, 30.0);
  assert.strictEqual(fineTransaction?.feeStructureId, 'fee-struct-lib-fine');
  assert.strictEqual(fineTransaction?.feeHead, 'LIBRARY_FINE', 'feeHead must be LIBRARY_FINE');
  assert.strictEqual(fineTransaction?.status, 'PENDING');

  // 4.5 Hall Ticket Clearance Gate
  const clearance = libraryService.checkHallTicketClearance(studentId);
  assert.strictEqual(clearance.cleared, false, 'Student with pending library fine must not be cleared');
  assert.strictEqual(clearance.pendingFineAmount, 30.0);
  assert.strictEqual(clearance.provisionalPassEligible, true);

  // 4.6 Emergency 48-Hour Provisional Pass Issuance for Library Fine Hold
  const provPass = libraryService.issueProvisionalPassForLibraryHold(studentId, 'exam-midsem-01', 'usr-admin-01');
  assert.ok(provPass.id.startsWith('pht-'), 'Provisional hall ticket must be issued');
  assert.strictEqual(provPass.isReconciled, false);
  console.log('  ✓ Gap 4: Library Circulation, Fines & 48h Provisional Pass Gate Passed');

  // =========================================================================
  // GAP 5: Direct CIA Faculty Gradebook & LTI Manual Override Preservation
  // =========================================================================
  console.log('Test 3.5: Direct CIA Gradebook & Manual Override Protection Against LTI Sync');

  const offeringId = 'offering-cia-test-s1';
  db.courseOfferings.set(offeringId, {
    id: offeringId,
    courseId: 'crs-cse-301',
    semester: 4,
    academicYear: '2025-2026',
    facultyId: faculty1Id,
    maxCapacity: 60,
    enrolledCount: 30,
    section: 'B',
    waitlistCount: 0,
  });

  // 5.1 Faculty Spreadsheet Marks Entry with isManualOverride = true
  const gradeEntry = facultyGradebookService.saveGradeEntry({
    offeringId,
    studentId,
    component: 'QUIZ_1',
    maxMarks: 20,
    obtainedMarks: 19,
    facultyUserId: faculty1Id,
    isManualOverride: true,
    overrideReason: 'Bonus oral defense presentation points added',
  });
  assert.strictEqual(gradeEntry.obtainedMarks, 19);
  assert.strictEqual(gradeEntry.isManualOverride, true);

  // 5.2 Bulk Upsert Grades
  const bulkRes = facultyGradebookService.bulkUpsertGrades(
    offeringId,
    [
      { studentId: 'stu-profile-02', component: 'QUIZ_1', maxMarks: 20, obtainedMarks: 16 },
      { studentId: 'stu-profile-03', component: 'QUIZ_1', maxMarks: 20, obtainedMarks: 18 },
    ],
    faculty1Id
  );
  assert.strictEqual(bulkRes.savedCount, 2);

  // 5.3 Attempt LTI Automated Sync on Overridden Student
  // LMS sends score of 12/20 (60%) for studentId
  const ltiScores = [
    {
      studentId, // Overridden by faculty!
      offeringId,
      activityId: 'quiz-01',
      scoreGiven: 12,
      scoreMaximum: 20,
      timestamp: new Date().toISOString(),
    },
    {
      studentId: 'stu-non-overridden', // Not overridden
      offeringId,
      activityId: 'quiz-01',
      scoreGiven: 17,
      scoreMaximum: 20,
      timestamp: new Date().toISOString(),
    },
  ];

  const syncResult = gradeSyncWorker.syncLmsScores(ltiScores);
  assert.strictEqual(syncResult.skippedOverrideCount, 1, 'Manual override must be skipped by LTI sync');
  assert.strictEqual(syncResult.records[0].preservedManualOverride, true, 'Faculty manual grade must be preserved');

  // Verify faculty grade in gradebook remains 19/20
  const persistedEntry = facultyGradebookService.getGradeEntry(offeringId, studentId, 'QUIZ_1');
  assert.strictEqual(persistedEntry?.obtainedMarks, 19, 'Faculty score must NOT be overwritten by LMS');

  // 5.4 Gradebook Locking
  facultyGradebookService.lockGradebook(offeringId, faculty1Id);
  assert.throws(
    () => {
      facultyGradebookService.saveGradeEntry({
        offeringId,
        studentId,
        component: 'QUIZ_1',
        maxMarks: 20,
        obtainedMarks: 20,
        facultyUserId: faculty1Id,
      });
    },
    /GRADEBOOK_LOCKED/,
    'Modifications to locked gradebook must be rejected'
  );
  facultyGradebookService.unlockGradebook(offeringId);
  console.log('  ✓ Gap 5: Direct CIA Gradebook & LTI Sync Override Protection Passed');

  // =========================================================================
  // GAP 6: Multi-Channel Notification Center & VAPID Web Push
  // =========================================================================
  console.log('Test 3.6: Notification Center, VAPID Web Push & Cohort Broadcasting');

  // 6.1 In-App Notification Inbox
  const notif = notificationCenter.sendNotification({
    userId: studentId,
    title: 'Timetable Update',
    body: 'Classroom moved to LH-204 for CS301',
    category: 'ACADEMIC',
    channel: 'IN_APP',
  });
  assert.strictEqual(notif.isRead, false);
  assert.strictEqual(notificationCenter.getUnreadCount(studentId), 1);

  notificationCenter.markAsRead(notif.id, studentId);
  assert.strictEqual(notificationCenter.getUnreadCount(studentId), 0);

  // 6.2 VAPID EC Key Generation
  const vapidKeys = notificationCenter.generateVapidKeys();
  assert.ok(vapidKeys.publicKey.length > 50, 'VAPID public key must be valid base64url');
  assert.ok(vapidKeys.privateKey.length > 50, 'VAPID private key must be valid base64url');

  // 6.3 Register Push Subscription
  const subscription = notificationCenter.registerPushSubscription({
    userId: studentId,
    endpoint: 'https://fcm.googleapis.com/fcm/send/sample-token-123',
    p256dhKey: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9P04A==',
    authKey: 'tBHItDaQL1ShtjqxDY3Irw==',
  });
  assert.ok(subscription.id.startsWith('sub-'));

  // 6.4 Cohort Broadcasting
  const broadcastResult = notificationCenter.broadcastToCohort(
    { role: 'STUDENT' },
    {
      title: 'Fee Payment Deadline Reminder',
      body: 'Final date for Semester fee payment without late fine is Friday',
      category: 'FEE_DUE',
    }
  );
  assert.ok(broadcastResult.recipientCount >= 1);
  assert.ok(broadcastResult.pushNotificationsDispatched >= 1);
  console.log('  ✓ Gap 6: Notifications, VAPID Push & Cohort Broadcasting Passed');

  // =========================================================================
  // GAP 7: Academic Terms & Calendar
  // =========================================================================
  console.log('Test 3.7: Academic Terms & Calendar Enforcement Gatekeepers');

  const term = academicCalendarService.createTerm({
    name: 'Spring 2026 Semester',
    academicYear: '2025-2026',
    semesterType: 'EVEN',
    startDate: new Date('2026-01-05T00:00:00Z'),
    endDate: new Date('2026-05-20T23:59:59Z'),
    registrationStartDate: new Date('2025-12-15T00:00:00Z'),
    registrationEndDate: new Date('2026-01-10T23:59:59Z'),
    addDropDeadline: new Date('2026-01-20T23:59:59Z'),
    gradeLockDeadline: new Date('2026-05-30T23:59:59Z'),
  });

  // Calendar Event
  academicCalendarService.addCalendarEvent({
    termId: term.id,
    title: 'Republic Day Holiday',
    eventType: 'HOLIDAY',
    startDate: new Date('2026-01-26T00:00:00Z'),
    endDate: new Date('2026-01-26T23:59:59Z'),
    isInstructionalDay: false,
  });

  // 7.1 Registration Window Gatekeeper
  const beforeReg = new Date('2025-12-01T00:00:00Z');
  const duringReg = new Date('2026-01-02T00:00:00Z');
  const afterReg = new Date('2026-01-15T00:00:00Z');

  assert.strictEqual(academicCalendarService.isRegistrationOpen(term.id, beforeReg).allowed, false);
  assert.strictEqual(academicCalendarService.isRegistrationOpen(term.id, duringReg).allowed, true);
  assert.strictEqual(academicCalendarService.isRegistrationOpen(term.id, afterReg).allowed, false);

  // 7.2 Add/Drop Deadline Gatekeeper
  const beforeAddDrop = new Date('2026-01-18T00:00:00Z');
  const afterAddDrop = new Date('2026-01-25T00:00:00Z');
  assert.strictEqual(academicCalendarService.canAddDropCourse(term.id, beforeAddDrop).allowed, true);
  assert.strictEqual(academicCalendarService.canAddDropCourse(term.id, afterAddDrop).allowed, false);

  // 7.3 Grade Lock Deadline Gatekeeper
  const beforeGradeLock = new Date('2026-05-25T00:00:00Z');
  const afterGradeLock = new Date('2026-06-05T00:00:00Z');
  assert.strictEqual(academicCalendarService.isGradeSubmissionOpen(term.id, beforeGradeLock).allowed, true);
  assert.strictEqual(academicCalendarService.isGradeSubmissionOpen(term.id, afterGradeLock).allowed, false);
  console.log('  ✓ Gap 7: Academic Terms & Calendar Gatekeepers Passed');

  // =========================================================================
  // GAP 8: Parent-Student Guardianship Association
  // =========================================================================
  console.log('Test 3.8: Parent-Student Guardianship Association & Permission Flags');

  const parentUserId = 'usr-parent-01';

  // 8.1 Link Guardian with Granular Permissions
  const guardianLink = guardianshipService.linkGuardian({
    studentId,
    guardianUserId: parentUserId,
    relationship: 'FATHER',
    isPrimaryContact: true,
    permissions: {
      canViewAttendance: true,
      canViewGrades: true,
      canViewFeeDues: true,
      canPayFees: true,
      canApplyLeave: false, // Default: parent cannot apply leave
      canReceiveAlerts: true,
      isEmergencyContact: true,
    },
  });
  assert.strictEqual(guardianLink.relationship, 'FATHER');
  assert.strictEqual(guardianLink.isPrimaryContact, true);

  // 8.2 Permission Checks
  assert.strictEqual(guardianshipService.checkGuardianPermission(parentUserId, studentId, 'canViewGrades'), true);
  assert.strictEqual(guardianshipService.checkGuardianPermission(parentUserId, studentId, 'canApplyLeave'), false);

  // 8.3 Update Permission Flag
  guardianshipService.updatePermissions(studentId, parentUserId, { canApplyLeave: true });
  assert.strictEqual(guardianshipService.checkGuardianPermission(parentUserId, studentId, 'canApplyLeave'), true);

  // 8.4 Emergency Contact Lookup for Warden
  const emergencyContacts = guardianshipService.getEmergencyContacts(studentId);
  assert.strictEqual(emergencyContacts.length, 1);
  assert.strictEqual(emergencyContacts[0].user?.name, 'Suresh Kumar');

  // 8.5 Reject Non-Parent Role
  assert.throws(
    () => {
      guardianshipService.linkGuardian({
        studentId,
        guardianUserId: faculty1Id, // FACULTY role, not PARENT
        relationship: 'LOCAL_GUARDIAN',
      });
    },
    /Invalid role for guardian/,
    'Non-parent role must not be linkable as guardian'
  );
  console.log('  ✓ Gap 8: Parent-Student Guardianship & Permissions Passed');

  // =========================================================================
  // GAP 9: Role-Based Access Control (RBAC) Route Guards across 12 Roles
  // =========================================================================
  console.log('Test 3.9: RBAC Route Guards Across All 12 Institutional Roles');

  // 9.1 Verify All 12 Roles Exist
  assert.strictEqual(ALL_INSTITUTIONAL_ROLES.length, 12, 'Must support exactly 12 institutional roles');
  for (const role of ALL_INSTITUTIONAL_ROLES) {
    assert.strictEqual(rbacGuard.isInstitutionalRole(role), true, `Role ${role} must be recognized`);
    const perms = rbacGuard.getRolePermissions(role);
    assert.ok(perms.length > 0, `Role ${role} must have at least one permission`);
  }

  // 9.2 Super Admin Unrestricted Bypass
  const superAdminAuth = rbacGuard.authorizeRoute('SUPER_ADMIN', '/api/finance/reconcile');
  assert.strictEqual(superAdminAuth.authorized, true, 'SUPER_ADMIN must bypass all route guards');

  // 9.3 Student Role Guards
  assert.strictEqual(
    rbacGuard.authorizeRoute('STUDENT', '/api/courses/register').authorized,
    true,
    'Student must be authorized to register courses'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('STUDENT', '/api/attendance/override').authorized,
    false,
    'Student must NOT be authorized to override attendance'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('STUDENT', '/api/finance/reconcile').authorized,
    false,
    'Student must NOT be authorized to reconcile finance'
  );

  // 9.4 Faculty Role Guards
  assert.strictEqual(
    rbacGuard.authorizeRoute('FACULTY', '/api/attendance/mark').authorized,
    true,
    'Faculty must be authorized to mark attendance'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('FACULTY', '/api/grades/cia').authorized,
    true,
    'Faculty must be authorized to enter CIA grades'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('FACULTY', '/api/courses/register').authorized,
    false,
    'Faculty cannot register courses as a student'
  );

  // 9.5 Librarian Role Guards
  assert.strictEqual(
    rbacGuard.authorizeRoute('LIBRARIAN', '/api/library/circulate').authorized,
    true,
    'Librarian must be authorized to circulate library books'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('LIBRARIAN', '/api/attendance/mark').authorized,
    false,
    'Librarian cannot mark lecture attendance'
  );

  // 9.6 COE Role Guards
  assert.strictEqual(
    rbacGuard.authorizeRoute('COE', '/api/examination/seating').authorized,
    true,
    'COE must be authorized to generate exam seating'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('COE', '/api/grades/publish').authorized,
    true,
    'COE must be authorized to publish semester grades'
  );

  // 9.7 Finance Officer Role Guards
  assert.strictEqual(
    rbacGuard.authorizeRoute('FINANCE_OFFICER', '/api/finance/reconcile').authorized,
    true,
    'Finance officer must be authorized to reconcile payments'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('FINANCE_OFFICER', '/api/leave/approve-hod').authorized,
    false,
    'Finance officer cannot approve faculty leaves'
  );

  // 9.8 Mentor & Warden Guards
  assert.strictEqual(
    rbacGuard.authorizeRoute('MENTOR', '/api/leave/approve-mentor').authorized,
    true,
    'Mentor must be authorized to approve student leave applications'
  );
  assert.strictEqual(
    rbacGuard.authorizeRoute('WARDEN', '/api/grievances/investigate').authorized,
    true,
    'Warden must be authorized to investigate hostel grievances'
  );

  // =========================================================================
  // SECTION 10: Deep Operational Gaps Edge Cases, Invariants & Security Hardening
  // =========================================================================
  console.log('\nTest 3.10: Deep Operational Gaps Edge Cases & Invariants Audit');

  // 10.1 Leave Date Ordering Validation
  assert.throws(
    () => {
      leaveService.applyStudentLeave({
        studentId,
        leaveType: 'CASUAL',
        startDate: '2025-11-20',
        endDate: '2025-11-10', // End precedes start!
        reason: 'Invalid date range test',
      });
    },
    /INVALID_DATES/,
    'applyStudentLeave with inverted dates must throw INVALID_DATES'
  );

  // 10.2 Substitute Faculty Already on Leave Conflict Check
  // Apply approved leave for faculty 2 first
  const fac2Leave = leaveService.applyFacultyLeave({
    facultyId: faculty2Id,
    leaveType: 'CASUAL',
    startDate: '2025-12-01',
    endDate: '2025-12-05',
    reason: 'Research sabbatical',
    substituteFacultyId: faculty1Id,
  });
  leaveService.approveByHod(fac2Leave.id, hodId);

  // Now faculty 1 tries to nominate faculty 2 as substitute during overlapping dates -> MUST REJECT!
  assert.throws(
    () => {
      leaveService.applyFacultyLeave({
        facultyId: faculty1Id,
        leaveType: 'CASUAL',
        startDate: '2025-12-02',
        endDate: '2025-12-04',
        reason: 'Workshop attendance',
        substituteFacultyId: faculty2Id,
      });
    },
    /SUBSTITUTE_ON_LEAVE/,
    'Nominating substitute faculty who is on leave must throw SUBSTITUTE_ON_LEAVE'
  );

  // 10.3 Leave Cancellation & On-Duty Pass Revocation
  const cancelTestLeave = leaveService.applyStudentLeave({
    studentId,
    leaveType: 'ON_DUTY',
    startDate: '2025-12-10',
    endDate: '2025-12-12',
    reason: 'National Debate Championship',
    isOnDuty: true,
  });
  leaveService.approveByMentor(cancelTestLeave.id, mentorId);
  const { onDutyPass: issuedPass } = leaveService.approveByHod(cancelTestLeave.id, hodId);
  assert.ok(issuedPass);
  assert.strictEqual(leaveService.verifyOnDutyPass(issuedPass.passNumber).isValid, true);

  // Cancel the leave
  const { application: cancelledApp, revokedOnDutyPass } = leaveService.cancelLeave(
    cancelTestLeave.id,
    studentId,
    'Debate championship postponed'
  );
  assert.strictEqual(cancelledApp.status, 'CANCELLED');
  assert.strictEqual(revokedOnDutyPass?.isVerified, false);

  // Gate check on revoked OD pass MUST FAIL
  const gateCheckRevoked = leaveService.verifyOnDutyPass(issuedPass.passNumber);
  assert.strictEqual(gateCheckRevoked.isValid, false);
  assert.strictEqual(gateCheckRevoked.message, 'INVALID_OR_REVOKED_PASS');

  // 10.4 Attendance Override Authorization Guard on Empty Records
  assert.throws(
    () => {
      attendanceOverrideService.applyApprovedLeaveOverride(
        cancelTestLeave.id,
        'usr-stu-01',
        'STUDENT' // Unauthorized role!
      );
    },
    /UNAUTHORIZED/,
    'Unauthorized role must be rejected immediately in applyApprovedLeaveOverride'
  );

  // 10.5 Attendance Override Mandatory Reason Description
  assert.throws(
    () => {
      attendanceOverrideService.overrideAttendance({
        attendanceRecordId: attRecordId,
        newStatus: 'PRESENT',
        reasonCode: 'TEACHER_ERROR',
        reasonDescription: '   ', // Blank reason!
        modifiedByUserId: faculty1Id,
        modifiedByRole: 'FACULTY',
      });
    },
    /Reason description is mandatory/,
    'Empty reason description must be rejected'
  );

  // 10.6 Feedback Survey Validation: 0 questions rejected, invalid question ID rejected
  assert.throws(
    () => {
      feedbackService.createSurvey({
        academicYear: '2025-2026',
        stakeholderType: 'STUDENT',
        title: 'Empty Survey',
        questions: [],
      });
    },
    /Survey must contain at least one question/,
    'Survey with 0 questions must be rejected'
  );

  const testSurvey = feedbackService.createSurvey({
    academicYear: '2025-2026',
    stakeholderType: 'STUDENT',
    title: 'Closure Survey Test',
    questions: [{ questionText: 'Q1', category: 'CURRICULUM' }],
  });

  assert.throws(
    () => {
      feedbackService.submitResponse({
        surveyId: testSurvey.survey.id,
        ratings: { 'fake-question-id': 5 },
      });
    },
    /Invalid question ID/,
    'Submitting rating for question not in survey must throw error'
  );

  // Close survey and verify submission blocked
  feedbackService.closeSurvey(testSurvey.survey.id);
  assert.throws(
    () => {
      feedbackService.submitResponse({
        surveyId: testSurvey.survey.id,
        ratings: { [testSurvey.questions[0].id]: 5 },
      });
    },
    /closed or inactive/,
    'Submitting to closed survey must be rejected'
  );

  // 10.7 NAAC Metric 1.4 Baseline on Empty Year
  const emptyNaac = feedbackService.computeNaacMetric14('1999-2000');
  assert.strictEqual(emptyNaac.averageLikertScore, 0);
  assert.strictEqual(emptyNaac.naacMetric1_4_Compliant, false);

  // 10.8 Grievance updateStatus to RESOLVED sets resolvedAt & checks SLA
  const directGrv = grievanceService.fileGrievance({
    complainantId: 'usr-stu-01',
    category: 'ACADEMIC',
    title: 'Grade Discrepancy Inquiry',
    description: 'Marks re-check requested',
  });
  grievanceService.updateStatus(directGrv.id, 'RESOLVED', 'usr-hod-01', 'Re-evaluation completed, score updated');
  assert.strictEqual(directGrv.status, 'RESOLVED');
  assert.ok(directGrv.resolvedAt, 'resolvedAt must be set on updateStatus to RESOLVED');
  assert.strictEqual(directGrv.isSlaBreached, false);

  // 10.9 Library Duplicate Borrowing Disallowed & Overdue Student Blocked
  const testBook2 = libraryService.addBook({
    isbn: '978-0134685991',
    title: 'Effective Java 3rd Edition',
    author: 'Joshua Bloch',
    publisher: 'Addison-Wesley',
    callNumber: 'QA76.73.J38 B56',
    totalCopies: 5,
  });
  libraryService.issueBook(testBook2.id, studentId, 14);

  assert.throws(
    () => {
      libraryService.issueBook(testBook2.id, studentId, 14);
    },
    /DUPLICATE_LOAN_DISALLOWED/,
    'Borrowing the same book twice concurrently must be rejected'
  );

  // 10.10 Gradebook Component-Specific Override Protection vs LMS Sync
  // Setup offering with QUIZ_1 manual override and verify ASSIGNMENT_2 can sync
  const componentTestOffering = 'offering-comp-isolation-test';
  db.courseOfferings.set(componentTestOffering, {
    id: componentTestOffering,
    courseId: 'crs-cse-301',
    semester: 4,
    academicYear: '2025-2026',
    facultyId: faculty1Id,
    maxCapacity: 60,
    enrolledCount: 10,
    section: 'C',
    waitlistCount: 0,
  });

  facultyGradebookService.saveGradeEntry({
    offeringId: componentTestOffering,
    studentId,
    component: 'QUIZ_1',
    maxMarks: 20,
    obtainedMarks: 20,
    facultyUserId: faculty1Id,
    isManualOverride: true,
  });

  const mixedSyncResult = gradeSyncWorker.syncLmsScores([
    {
      studentId,
      offeringId: componentTestOffering,
      activityId: 'quiz-01', // Corresponds to QUIZ_1 -> MUST BE PRESERVED
      scoreGiven: 10,
      scoreMaximum: 20,
      timestamp: new Date().toISOString(),
    },
    {
      studentId,
      offeringId: componentTestOffering,
      activityId: 'assignment-02', // Different component -> MUST SYNC
      scoreGiven: 18,
      scoreMaximum: 20,
      timestamp: new Date().toISOString(),
    },
  ]);

  assert.strictEqual(mixedSyncResult.skippedOverrideCount, 1, 'Only QUIZ_1 should be skipped');
  assert.strictEqual(mixedSyncResult.syncedCount, 1, 'ASSIGNMENT_2 should sync successfully');
  assert.strictEqual(mixedSyncResult.records[0].preservedManualOverride, true);
  assert.strictEqual(mixedSyncResult.records[1].preservedManualOverride, false);
  db.courseOfferings.delete(componentTestOffering);

  // 10.11 Notification Composable Filters & Inbox Alias Resolution
  const deptBroadResult = notificationCenter.broadcastToCohort(
    { role: 'FACULTY', departmentId: 'dept-cse' },
    { title: 'CSE Faculty Meeting', body: 'Agenda: Curriculum Revision' }
  );
  assert.ok(deptBroadResult.recipientCount >= 1);

  // Alias test: Send to studentProfile ID, read via user ID
  const aliasNotif = notificationCenter.sendNotification({
    userId: 'stu-profile-01',
    title: 'Alias Test',
    body: 'Verifying alias resolution',
  });
  const unreadBefore = notificationCenter.getUnreadCount('usr-stu-01');
  assert.ok(unreadBefore >= 1, 'Unread count by user ID must include notifications sent to profile ID');
  notificationCenter.markAsRead(aliasNotif.id, 'usr-stu-01');
  const userInbox = notificationCenter.getInbox('usr-stu-01');
  const foundNotif = userInbox.find((n) => n.id === aliasNotif.id);
  assert.ok(foundNotif);
  assert.strictEqual(foundNotif?.isRead, true);

  // 10.12 Calendar Event Date Ordering & Instructional Days Computation
  assert.throws(
    () => {
      academicCalendarService.addCalendarEvent({
        termId: 'term-2025-fall',
        title: 'Invalid Event',
        eventType: 'HOLIDAY',
        startDate: new Date('2025-10-20'),
        endDate: new Date('2025-10-10'),
      });
    },
    /INVALID_DATES/,
    'Calendar event with end date before start date must be rejected'
  );

  const instrDays = academicCalendarService.getInstructionalDays('term-2025-fall');
  assert.ok(instrDays.totalDays > 100);
  assert.ok(instrDays.instructionalDays > 80);

  // 10.13 Guardianship Single Primary Contact & Helper Methods
  const guardianMother = guardianshipService.linkGuardian({
    studentId,
    guardianUserId: 'usr-parent-01',
    relationship: 'MOTHER',
    isPrimaryContact: true,
  });
  assert.strictEqual(guardianMother.isPrimaryContact, true);

  // Link second parent as primary -> mother must be demoted
  const parent2User = {
    id: 'usr-parent-02',
    email: 'parent2@example.com',
    name: 'Mr. Rajesh Kumar',
    role: 'PARENT' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db.users.set(parent2User.id, parent2User);

  const guardianFather = guardianshipService.linkGuardian({
    studentId,
    guardianUserId: parent2User.id,
    relationship: 'FATHER',
    isPrimaryContact: true,
  });
  assert.strictEqual(guardianFather.isPrimaryContact, true);
  const motherAfter = db.studentGuardians.get(`${studentId}:usr-parent-01`);
  assert.strictEqual(motherAfter?.isPrimaryContact, false, 'Previous primary contact must be demoted');

  assert.strictEqual(guardianshipService.canGuardianViewAttendance(parent2User.id, studentId), true);
  assert.strictEqual(guardianshipService.canGuardianPayFees(parent2User.id, studentId), true);

  // 10.14 RBAC Security Route Guards on All 9 Operational Routes
  // Students must NOT access grade locking, library catalog management, or grievance resolution
  assert.strictEqual(rbacGuard.authorizeRoute('STUDENT', '/api/grades/lock').authorized, false);
  assert.strictEqual(rbacGuard.authorizeRoute('STUDENT', '/api/library/books').authorized, false);
  assert.strictEqual(rbacGuard.authorizeRoute('STUDENT', '/api/grievances/resolve').authorized, false);
  assert.strictEqual(rbacGuard.authorizeRoute('STUDENT', '/api/feedback/surveys').authorized, false);

  // Authorized roles MUST succeed
  assert.strictEqual(rbacGuard.authorizeRoute('COE', '/api/grades/lock').authorized, true);
  assert.strictEqual(rbacGuard.authorizeRoute('LIBRARIAN', '/api/library/books').authorized, true);
  assert.strictEqual(rbacGuard.authorizeRoute('DEAN', '/api/grievances/resolve').authorized, true);
  assert.strictEqual(rbacGuard.authorizeRoute('REGISTRAR', '/api/feedback/surveys').authorized, true);
  assert.strictEqual(rbacGuard.authorizeRoute('STUDENT', '/api/feedback/submit').authorized, true);

  console.log('  ✓ Section 10: Deep Operational Gaps Edge Cases, Invariants & Security Passed');

  // Cleanup test-isolated artifacts
  db.courseOfferings.delete('offering-cia-test-s1');
  db.attendanceRecords.delete('att-test-override-01');
  db.timetableSlots.delete('slot-fac1-mon-9am');
  db.timetableSlots.delete('slot-fac2-mon-overlap');

  console.log('\n=== ALL 9 OPERATIONAL GAP TESTS PASSED (100%) ===\n');
}
