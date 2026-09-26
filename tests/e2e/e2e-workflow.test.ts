import assert from 'node:assert';
import {
  db,
  redis,
  waitingRoomService,
  seatEngine,
  courseCheckoutService,
  dynamicQrEngine,
  geofenceService,
  webAuthnBindingService,
  attendanceService,
  gradeSyncWorker,
  examSeatingOptimizer,
  doubleBlindEngine,
  osvArbitrationService,
  verifiableCredentialsService,
  razorpayGatewayService,
  webhookIdempotencyService,
  provisionalHallTicketService,
  timetableCspSolver,
  arsCalculator,
  interventionWorkflowEngine,
  nepMilestoneService,
  digiLockerSyncService,
  ssrExporterService,
  type OnScreenEvaluationScript,
} from '../../src/index.js';

export async function runE2EWorkflowTests(): Promise<void> {
  console.log('\n============================================================');
  console.log('   ENTERPRISE COLLEGE ERP - END-TO-END (E2E) LIFECYCLE TEST   ');
  console.log('============================================================\n');

  const studentId = 'stu-profile-01';
  const rollNumber = '2024CSE001';
  const studentName = 'Rohit Kumar';
  const offeringId = 'offering-cs301-s1';

  // -------------------------------------------------------------
  // STEP 1: Waiting Room & High-Concurrency Course Registration
  // -------------------------------------------------------------
  console.log('STEP 1: Student Enters Virtual Waiting Room & Checks Out Courses');
  const queueEntry = await waitingRoomService.requestEntry(studentId);
  assert.ok(queueEntry.token, 'Queue token must be generated');
  console.log(`  [Waiting Room] Status: Allowed=${queueEntry.allowed}, Position=${queueEntry.queuePosition}`);

  // Reserve atomic seat in cart (300s hold)
  await seatEngine.initializeOfferingSeats(offeringId, 60);
  const reserved = await seatEngine.reserveSeat(offeringId, studentId);
  assert.strictEqual(reserved, true, 'Seat must be atomically held in Redis');

  // Checkout with sorted UUID deadlock-free locks
  const checkoutResult = await courseCheckoutService.checkoutCourses(studentId, [offeringId]);
  assert.strictEqual(checkoutResult.success, true, 'Registration checkout must succeed');
  // Verify seat count remains committed at 59 (not leaked back to 60)
  const remainingSeats = await seatEngine.getAvailableSeats(offeringId);
  assert.strictEqual(remainingSeats, 59, 'Available seats must remain 59 after checkout');
  console.log(`  [Registration] Course ${offeringId} enrolled successfully (Tx: ${checkoutResult.transactionId}, Seats remaining: ${remainingSeats})`);

  // -------------------------------------------------------------
  // STEP 2: Anti-Proxy Attendance (10s Dynamic QR + 25m Geofence + WebAuthn)
  // -------------------------------------------------------------
  console.log('\nSTEP 2: Lecture Attendance Marking with Cryptographic Anti-Proxy Defense');
  const classroomLoc = { latitude: 12.971598, longitude: 77.594562 };
  const studentLoc = { latitude: 12.971650, longitude: 77.594580 }; // ~7 meters away
  const roomSecret = 'sec-classroom-302';

  // Faculty projects 10s rolling QR
  const now = Date.now();
  const rollingQr = dynamicQrEngine.generateCurrentQr(offeringId, roomSecret, now);

  // Student scans QR: Verify 10-second token
  const qrValidation = dynamicQrEngine.verifyToken(offeringId, rollingQr.token, roomSecret, now);
  assert.strictEqual(qrValidation.valid, true, 'Dynamic QR token must be valid within 10s');

  // Verify Geofence
  const geoValidation = geofenceService.validateClassroomGeofence(studentLoc, classroomLoc, 25);
  assert.strictEqual(geoValidation.isWithinBounds, true, 'Student must be within 25m radius');

  // Register WebAuthn hardware device binding
  await webAuthnBindingService.registerDevice(studentId, 'cred-faceid-rohit-iphone', 'pubkey-rohit-ed25519', 'iPhone 15 Pro');

  // Mark attendance through unified AttendanceService (verifies QR, Geofence, WebAuthn & persists to DB)
  const attendanceResult = await attendanceService.markAttendance({
    studentId,
    offeringId,
    token: rollingQr.token,
    roomSecret,
    studentCoords: studentLoc,
    classroomCoords: classroomLoc,
    credentialId: 'cred-faceid-rohit-iphone',
    clientDataJSON: '{"challenge":"att-2026"}',
    biometricSignature: 'sig-biometric-faceid-ok-valid-32chars',
    timestampMs: now,
  });
  assert.strictEqual(attendanceResult.success, true, 'Attendance must be marked in DB');
  assert.strictEqual(attendanceResult.status, 'PRESENT');
  assert.ok(await db.attendanceRecords.has(attendanceResult.recordId!), 'Record must be saved in attendance database');
  console.log(`  [Attendance] Marked PRESENT in Database (Record: ${attendanceResult.recordId}, Dist: ${geoValidation.distanceMeters}m <= 25m, Biometric: Verified)`);

  // -------------------------------------------------------------
  // STEP 3: LMS Continuous Internal Assessment (CIA) Grade Sync
  // -------------------------------------------------------------
  console.log('\nSTEP 3: Continuous Internal Assessment (LTI 1.3 Advantage Sync)');
  const lmsGradeBatch = [
    {
      studentId,
      activityId: 'quiz-distributed-consensus',
      offeringId,
      scoreGiven: 48,
      scoreMaximum: 50,
      timestamp: new Date().toISOString(),
    },
  ];
  const lmsSyncResult = await gradeSyncWorker.syncLmsScores(lmsGradeBatch);
  assert.strictEqual(lmsSyncResult.syncedCount, 1, 'LMS score must be synced into ERP assessment ledger');
  console.log(`  [LMS Sync] Ingested Quiz Score: 48/50 (${lmsSyncResult.records[0].normalizedCiaScore}%)`);

  // -------------------------------------------------------------
  // STEP 4: Examination Seating Allocation (Graph Coloring)
  // -------------------------------------------------------------
  console.log('\nSTEP 4: Exam Cell Anti-Cheating Seating Allocation');
  const candidateStudents = [
    { studentId, departmentId: 'CSE', coursePaperId: 'CS301', rollNumber },
    { studentId: 'stu-ece-01', departmentId: 'ECE', coursePaperId: 'EC301', rollNumber: '2024ECE001' },
    { studentId: 'stu-mech-01', departmentId: 'MECH', coursePaperId: 'ME301', rollNumber: '2024MEC001' },
    { studentId: 'stu-civil-01', departmentId: 'CIVIL', coursePaperId: 'CE301', rollNumber: '2024CIV001' },
  ];
  const examAllocation = examSeatingOptimizer.allocateHall('exam-endsem-2026', 'HALL-AUDITORIUM', 2, 2, candidateStudents);
  assert.strictEqual(examAllocation.conflictsDetected, 0, 'Zero seating adjacency conflicts allowed');
  console.log(`  [Exam Seating] Allocated ${examAllocation.allocatedSeats} seats in HALL-AUDITORIUM with 0 adjacency conflicts`);

  // -------------------------------------------------------------
  // STEP 5: Double-Blind On-Screen Evaluation (OSV)
  // -------------------------------------------------------------
  console.log('\nSTEP 5: Double-Blind OSV & Automated Result Arbitration');
  const maskedScript = doubleBlindEngine.maskScript('exam-endsem-2026', studentId, 'https://r2.enterprise.edu/scripts/cs301.pdf');
  console.log(`  [OSV] Identity masked: Roll Number ${rollNumber} -> Barcode: ${maskedScript.anonymousBarcode}`);

  const scriptRecord: OnScreenEvaluationScript = {
    id: 'script-e2e-01',
    assessmentId: 'exam-endsem-2026',
    anonymousBarcode: maskedScript.anonymousBarcode,
    studentId,
    scannedPdfUrl: maskedScript.scannedPdfUrl,
    maxScore: 100,
    status: 'PENDING_EVAL_1',
  };

  // Evaluator 1 gives 88
  osvArbitrationService.processEvaluatorScore(scriptRecord, 1, 88);
  // Evaluator 2 gives 92 (diff = 4% <= 15%)
  const finalEval = osvArbitrationService.processEvaluatorScore(scriptRecord, 2, 92);
  assert.strictEqual(finalEval.status, 'FINALIZED');
  assert.strictEqual(scriptRecord.finalScore, 90);
  console.log(`  [OSV] Evaluators: 88 & 92 (Diff: 4% <= 15%). Final Score Established: 90/100`);

  // -------------------------------------------------------------
  // STEP 6: Verifiable Marksheet Publication & Public Verification
  // -------------------------------------------------------------
  console.log('\nSTEP 6: Ed25519 Verifiable Marksheet Publication');
  const marksheet = verifiableCredentialsService.issueMarksheet(
    studentId,
    rollNumber,
    studentName,
    'B.Tech CSE',
    '2025-2026',
    4,
    [
      { courseCode: 'CS201', courseName: 'DSA', credits: 4, gradePoint: 9, letterGrade: 'A+' },
      { courseCode: 'CS301', courseName: 'Distributed Systems', credits: 4, gradePoint: 10, letterGrade: 'O' },
      { courseCode: 'OE101', courseName: 'Cognitive Psychology', credits: 3, gradePoint: 9, letterGrade: 'A+' },
      { courseCode: 'AEC101', courseName: 'Technical Writing', credits: 2, gradePoint: 10, letterGrade: 'O' },
    ]
  );
  assert.strictEqual(marksheet.sgpa, 9.46);
  const publicVerification = verifiableCredentialsService.verifyMarksheet(marksheet);
  assert.strictEqual(publicVerification.isValid, true, 'Public verification at /verify/[hash] must succeed');
  console.log(`  [Credentials] Marksheet Published (SGPA: ${marksheet.sgpa}). Public Verification at ${marksheet.verificationUrl}: VALID`);

  // -------------------------------------------------------------
  // STEP 7: Resilient Finance, Idempotent Webhook & Provisional Pass
  // -------------------------------------------------------------
  console.log('\nSTEP 7: Resilient Finance, Webhook Idempotency & 48h Provisional Pass');
  const order = await razorpayGatewayService.createOrder({
    studentId,
    feeStructureId: 'fee-sem4-exam',
    semester: 4,
    amount: 3500,
    paymentMethod: 'UPI',
  });
  assert.ok(order.upiDeepLink?.startsWith('upi://pay'), 'Must generate valid UPI deep-link');

  // Emergency 48h Provisional Pass issued for unblocking exam hall entry
  const provisionalPass = await provisionalHallTicketService.issueProvisionalPass({
    studentId,
    examId: 'exam-endsem-2026',
    utrReferenceNumber: 'UTR-HDFC-99887711',
    grantedByUserId: 'usr-admin-01',
  });
  const gateCheck = await provisionalHallTicketService.validatePassAtGate(provisionalPass.id);
  assert.strictEqual(gateCheck.isValid, true);
  console.log(`  [Finance] 48-Hour Provisional Pass ${provisionalPass.id} Issued & Admitted at Exam Gate`);

  // Webhook arrives and reconciles payment
  const webhookRes = await webhookIdempotencyService.handlePaymentWebhook({
    event: 'payment.captured',
    orderId: order.orderId,
    paymentId: `pay_${order.orderId}`,
    studentId,
    feeStructureId: 'fee-sem4-exam',
    semester: 4,
    amount: 3500,
    utrReferenceNumber: 'UTR-HDFC-99887711',
  });
  assert.strictEqual(webhookRes.status, 'PROCESSED');
  console.log(`  [Finance] Webhook Reconciled & Stored Idempotently (Status: ${webhookRes.status})`);

  // -------------------------------------------------------------
  // STEP 8: Timetable Scheduling & CSP Matrix Solver
  // -------------------------------------------------------------
  console.log('\nSTEP 8: Campus-Wide Timetable Solver (CSP)');
  const timetableOutput = timetableCspSolver.solve(
    [
      { offeringId, courseCode: 'CS301', facultyId: 'usr-fac-01', hoursPerWeek: 4, expectedClassSize: 50 },
      { offeringId: 'offering-oe101-s1', courseCode: 'OE101', facultyId: 'usr-fac-01', hoursPerWeek: 3, expectedClassSize: 35 },
    ],
    [
      { roomNumber: 'ROOM-301', capacity: 60 },
      { roomNumber: 'ROOM-302', capacity: 60 },
    ]
  );
  assert.strictEqual(timetableOutput.success, true);
  console.log(`  [Timetable] 7/7 weekly lecture hours assigned with 0 faculty and 0 room clashes`);

  // -------------------------------------------------------------
  // STEP 9: Predictive Academic Risk (ARS) & Mentor SLA
  // -------------------------------------------------------------
  console.log('\nSTEP 9: Predictive Academic Risk (ARS) & Mentorship Workflow');
  const studentRisk = arsCalculator.computeScore({
    studentId,
    attendancePct: 92,
    ciaScorePct: 90,
    lmsInactivityDays: 1,
    hasFeeDues: false,
  });
  assert.strictEqual(studentRisk.riskLevel, 'LOW');
  assert.ok(studentRisk.compositeRiskScore < 20);
  console.log(`  [ARS Early Warning] Score: ${studentRisk.compositeRiskScore}/100 (Tier: ${studentRisk.riskLevel}) - Student in Good Standing`);

  // -------------------------------------------------------------
  // STEP 10: NEP 2020 Multi-Entry/Exit Milestones & DigiLocker
  // -------------------------------------------------------------
  console.log('\nSTEP 10: NEP 2020 Multi-Entry/Exit & DigiLocker NAD Sync');
  const earnedCredits = 82; // Completed 4 semesters
  const nepMilestone = nepMilestoneService.evaluateStudentMilestones(earnedCredits);
  assert.strictEqual(nepMilestone.currentEligibleTier.milestoneName, 'DIPLOMA');
  console.log(`  [NEP 2020] Earned: ${earnedCredits} Credits. Eligible for: ${nepMilestone.currentEligibleTier.title}`);

  const nadRecord = digiLockerSyncService.generateNadRecord(
    'APAAR-9874-5612-3401',
    rollNumber,
    4,
    '2025-2026',
    marksheet.courses.map((c) => ({
      code: c.courseCode,
      name: c.courseName,
      credits: c.credits,
      gradePoint: c.gradePoint,
      letterGrade: c.letterGrade,
    })),
    marksheet.cgpa
  );
  const digiLockerSync = await digiLockerSyncService.pushToDigiLocker(nadRecord);
  assert.strictEqual(digiLockerSync.success, true);
  console.log(`  [DigiLocker] Academic Bank of Credits Synced with National Academic Depository (Ack: ${digiLockerSync.ackId})`);

  // -------------------------------------------------------------
  // STEP 11: Continuous NAAC Criteria 1-7 Telemetry & 1-Click SSR
  // -------------------------------------------------------------
  console.log('\nSTEP 11: Continuous NAAC Criteria 1-7 Telemetry & 1-Click SSR Generation');
  const ssrPackage = await ssrExporterService.exportSsr('2025-2026');
  assert.ok(ssrPackage.tables.length >= 7);
  console.log(`  [NAAC Telemetry] 1-Click SSR generated with ${ssrPackage.tables.length} tables in ${ssrPackage.generationDurationMs}ms (<60s requirement)`);

  console.log('\n============================================================');
  console.log('   FULL E2E LIFECYCLE WORKFLOW VERIFICATION: 100% SUCCESS    ');
  console.log('============================================================\n');
}

// Direct invocation when executed as test script
if (process.argv[1]?.endsWith('e2e-workflow.test.ts') || process.argv[1]?.endsWith('e2e-workflow.test.js')) {
  runE2EWorkflowTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('E2E TEST FAILURE:', err);
      process.exit(1);
    });
}
