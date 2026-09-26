import assert from 'node:assert';
import {
  // Primitives
  hmacSha256,
  sha256,
  generateQueueToken,
  verifyQueueToken,
  generateRollingAttendanceToken,
  verifyRollingAttendanceToken,
  signVerifiableDocument,
  verifyVerifiableDocument,
  computePaymentIdempotencyKey,
  redis,
  db,
  type OnScreenEvaluationScript,
  // Modules
  waitingRoomService,
  seatEngine,
  courseCheckoutService,
  waitlistService,
  dynamicQrEngine,
  geofenceService,
  webAuthnBindingService,
  attendanceService,
  curriculumDagEngine,
  nepMilestoneService,
  whatIfSimulator,
  digiLockerSyncService,
  examSeatingOptimizer,
  doubleBlindEngine,
  osvArbitrationService,
  verifiableCredentialsService,
  razorpayGatewayService,
  webhookIdempotencyService,
  autoHealingPaymentPoller,
  provisionalHallTicketService,
  temporalExclusionValidator,
  timetableCspSolver,
  arsCalculator,
  interventionWorkflowEngine,
  naacTelemetryService,
  ssrExporterService,
  ltiAdvantageService,
  gradeSyncWorker,
  offlineSyncService,
  optimisticUiManager,
} from '../../src/index.js';

export async function runUnitTests(): Promise<void> {
  console.log('\n=== RUNNING ENTERPRISE ERP UNIT TESTS ===\n');

  // 1. Cryptography & Hashing
  console.log('Test 1.1: Cryptography & Token Generation');
  const hash = sha256('test-payload');
  assert.strictEqual(hash.length, 64, 'SHA-256 must produce 64-char hex string');

  const { token, payload } = generateQueueToken('stu-1', 42, 600, 'secret-1');
  const verifyRes = verifyQueueToken(token, 'secret-1');
  assert.strictEqual(verifyRes.valid, true, 'HMAC Queue Token must be valid');
  assert.strictEqual(verifyRes.payload?.queuePosition, 42, 'Queue position must match');

  const invalidSecretRes = verifyQueueToken(token, 'wrong-secret');
  assert.strictEqual(invalidSecretRes.valid, false, 'Invalid HMAC secret must reject token');
  console.log('  ✓ Cryptography & Token Generation Passed');

  // 2. Haversine 25m Geofencing
  console.log('Test 1.2: Haversine Geofencing Boundary Checks');
  const classroom = { latitude: 12.971598, longitude: 77.594562 };
  // Student ~15m away
  const studentNearby = { latitude: 12.971700, longitude: 77.594620 };
  // Student ~60m away (dorm room proxy attempt)
  const studentDorm = { latitude: 12.972100, longitude: 77.594900 };

  const resNearby = geofenceService.validateClassroomGeofence(studentNearby, classroom, 25);
  assert.strictEqual(resNearby.isWithinBounds, true, 'Student at ~15m must be within bounds');
  assert.strictEqual(resNearby.status, 'IN_BOUNDS');

  const resDorm = geofenceService.validateClassroomGeofence(studentDorm, classroom, 25);
  assert.strictEqual(resDorm.isWithinBounds, false, 'Student at ~60m must be rejected');
  assert.strictEqual(resDorm.status, 'OUT_OF_BOUNDS');
  console.log('  ✓ Haversine Geofencing Boundary Checks Passed');

  // 3. Dynamic 10s Rolling TOTP QR
  console.log('Test 1.3: Dynamic 10s Rolling QR Expiry');
  const t0 = 1700000000000;
  const qrT0 = dynamicQrEngine.generateCurrentQr('off-1', 'room-sec', t0);
  const verifyT0 = dynamicQrEngine.verifyToken('off-1', qrT0.token, 'room-sec', t0);
  assert.strictEqual(verifyT0.valid, true, 'Current token must be valid');

  // 11 seconds later (new time step)
  const t11s = t0 + 11000;
  const verify11s = dynamicQrEngine.verifyToken('off-1', qrT0.token, 'room-sec', t11s);
  assert.strictEqual(verify11s.valid, false, '11-second-old token must be expired');

  // Malformed / short token check (must fail gracefully without RangeError)
  const malformedCheck = dynamicQrEngine.verifyToken('off-1', 'short-hex-xyz', 'room-sec', t0);
  assert.strictEqual(malformedCheck.valid, false, 'Malformed token must fail gracefully');
  console.log('  ✓ Dynamic 10s Rolling QR Expiry & Malformed Guard Passed');

  // 4. Curriculum DAG Engine
  console.log('Test 1.4: Curriculum DAG & Cycle Detection');
  const courses = Array.from(db.courses.values());
  curriculumDagEngine.buildGraph(courses);
  assert.strictEqual(curriculumDagEngine.hasCycle(), false, 'Curriculum DAG must be acyclic');

  // Prerequisites check: CS301 requires CS201
  const prereqCheckBefore = curriculumDagEngine.checkPrerequisitesSatisfied('crs-cse-301', new Set());
  assert.strictEqual(prereqCheckBefore.satisfied, false, 'Prerequisite CS201 must be missing');
  assert.strictEqual(prereqCheckBefore.missingPrerequisites.includes('CS201'), true);

  const prereqCheckAfter = curriculumDagEngine.checkPrerequisitesSatisfied('crs-cse-301', new Set(['crs-cse-201']));
  assert.strictEqual(prereqCheckAfter.satisfied, true, 'Prerequisite must be satisfied after completing CS201');
  console.log('  ✓ Curriculum DAG & Cycle Detection Passed');

  // 5. NEP 2020 Multi-Entry / Multi-Exit Milestones
  console.log('Test 1.5: NEP 2020 4-Stage Multi-Entry/Exit Milestones');
  const certEval = nepMilestoneService.evaluateStudentMilestones(40);
  assert.strictEqual(certEval.currentEligibleTier.milestoneName, 'CERTIFICATE');
  assert.strictEqual(certEval.currentEligibleTier.isEligible, true);

  const dipEval = nepMilestoneService.evaluateStudentMilestones(85);
  assert.strictEqual(dipEval.currentEligibleTier.milestoneName, 'DIPLOMA');
  assert.strictEqual(dipEval.currentEligibleTier.earnedCredits, 85);

  const degreeEval = nepMilestoneService.evaluateStudentMilestones(122);
  assert.strictEqual(degreeEval.currentEligibleTier.milestoneName, 'DEGREE');

  const honorsEval = nepMilestoneService.evaluateStudentMilestones(165);
  assert.strictEqual(honorsEval.currentEligibleTier.milestoneName, 'HONORS_RESEARCH');
  console.log('  ✓ NEP 2020 Multi-Entry/Exit Milestones Passed');

  // 6. Sub-100ms What-If Major/Minor Simulator
  console.log('Test 1.6: Sub-100ms What-If Major/Minor Simulator');
  const targetCourses = Array.from(db.courses.values());
  const simulation = whatIfSimulator.simulateProgramSwitch(
    'prog-btech-cse',
    'prog-btech-ai-ds',
    [courses[0], courses[2]], // CS201 (Core) + OE101 (Open Elective)
    targetCourses,
    160
  );
  assert.ok(simulation.simulationTimeMs < 100, `Simulation must complete in <100ms (got ${simulation.simulationTimeMs}ms)`);
  assert.strictEqual(simulation.transferableCredits, 7, 'Both CS201 (4) and OE101 (3) must transfer');
  assert.strictEqual(simulation.remainingCreditsRequired, 153);
  console.log(`  ✓ What-If Simulator Completed in ${simulation.simulationTimeMs}ms (Transfer: ${simulation.transferPercentage}%)`);

  // 7. Graph-Coloring Anti-Cheating Seating Allocator
  console.log('Test 1.7: Graph-Coloring Anti-Cheating Seating Allocator');
  const students = [
    { studentId: 's1', departmentId: 'CSE', coursePaperId: 'CS401', rollNumber: 'R1' },
    { studentId: 's2', departmentId: 'ECE', coursePaperId: 'EC401', rollNumber: 'R2' },
    { studentId: 's3', departmentId: 'MECH', coursePaperId: 'ME401', rollNumber: 'R3' },
    { studentId: 's4', departmentId: 'CIVIL', coursePaperId: 'CE401', rollNumber: 'R4' },
    { studentId: 's5', departmentId: 'CHEM', coursePaperId: 'CH401', rollNumber: 'R5' },
    { studentId: 's6', departmentId: 'BIOTECH', coursePaperId: 'BT401', rollNumber: 'R6' },
  ];
  const seating = examSeatingOptimizer.allocateHall('exam-1', 'HALL-A', 3, 2, students);
  assert.strictEqual(seating.allocatedSeats, 6, 'All 6 students must be assigned');
  assert.strictEqual(seating.conflictsDetected, 0, 'Zero adjacency conflicts expected');

  // Verify adjacent seats do not have same course paper
  const s00 = seating.grid[0][0].assignedStudent;
  const s01 = seating.grid[0][1].assignedStudent;
  assert.notStrictEqual(s00?.coursePaperId, s01?.coursePaperId, 'Adjacent seats must have different course papers');
  console.log('  ✓ Graph-Coloring Anti-Cheating Seating Allocator Passed');

  // 8. Double-Blind OSV & 15% Arbitration Trigger
  console.log('Test 1.8: Double-Blind OSV & 15% Arbitration Trigger');
  const script1: OnScreenEvaluationScript = {
    id: 'script-01',
    assessmentId: 'asm-1',
    anonymousBarcode: 'OSV-TEST-001',
    studentId: 'stu-1',
    scannedPdfUrl: 'https://r2.enterprise.edu/scripts/001.pdf',
    maxScore: 100,
    status: 'PENDING_EVAL_1',
  };

  // Case A: Variance <= 15% (e.g. 78 vs 82 -> diff 4%)
  osvArbitrationService.processEvaluatorScore(script1, 1, 78);
  const evalRes2 = osvArbitrationService.processEvaluatorScore(script1, 2, 82);
  assert.strictEqual(evalRes2.status, 'FINALIZED');
  assert.strictEqual(script1.finalScore, 80);

  // Case B: Variance > 15% (e.g. 50 vs 75 -> diff 25%)
  const script2: OnScreenEvaluationScript = {
    id: 'script-02',
    assessmentId: 'asm-1',
    anonymousBarcode: 'OSV-TEST-002',
    studentId: 'stu-2',
    scannedPdfUrl: 'https://r2.enterprise.edu/scripts/002.pdf',
    maxScore: 100,
    status: 'PENDING_EVAL_1',
  };
  osvArbitrationService.processEvaluatorScore(script2, 1, 50);
  const evalArbRes = osvArbitrationService.processEvaluatorScore(script2, 2, 75);
  assert.strictEqual(evalArbRes.status, 'ARBITRATION_REQUIRED', 'Variance of 25% must trigger arbitration');

  // Arbiter resolves
  const arbResolve = osvArbitrationService.resolveArbitration(script2, 'usr-arbiter', 68);
  assert.strictEqual(arbResolve.status, 'FINALIZED');
  assert.strictEqual(script2.finalScore, 68);
  console.log('  ✓ Double-Blind OSV & 15% Arbitration Trigger Passed');

  // 9. Ed25519 Verifiable Marksheets
  console.log('Test 1.9: Ed25519 Verifiable Marksheet Signing & Public Validation');
  const issuedMarksheet = verifiableCredentialsService.issueMarksheet(
    'stu-01',
    '2024CSE001',
    'Rohit Kumar',
    'B.Tech CSE',
    '2025-2026',
    4,
    [
      { courseCode: 'CS201', courseName: 'DSA', credits: 4, gradePoint: 9, letterGrade: 'A+' },
      { courseCode: 'CS301', courseName: 'Distributed Systems', credits: 4, gradePoint: 10, letterGrade: 'O' },
    ]
  );
  assert.strictEqual(issuedMarksheet.sgpa, 9.5);
  const verified = verifiableCredentialsService.verifyMarksheet(issuedMarksheet);
  assert.strictEqual(verified.isValid, true, 'Original marksheet signature must verify');

  // Tamper test 1: top-level field
  const tamperedMarksheet = { ...issuedMarksheet, sgpa: 10.0 };
  const tamperCheck = verifiableCredentialsService.verifyMarksheet(tamperedMarksheet);
  assert.strictEqual(tamperCheck.isValid, false, 'Tampered marksheet must fail verification');

  // Tamper test 2: nested course field (verifying that deep object modifications fail)
  const deepTampered = JSON.parse(JSON.stringify(issuedMarksheet));
  deepTampered.courses[0].gradePoint = 10;
  deepTampered.courses[0].letterGrade = 'O';
  const deepTamperCheck = verifiableCredentialsService.verifyMarksheet(deepTampered);
  assert.strictEqual(deepTamperCheck.isValid, false, 'Tampered nested course grade must fail verification');
  console.log('  ✓ Ed25519 Verifiable Marksheet Validation & Nested Anti-Tamper Passed');

  // 10. Webhook Idempotency & Distributed Locking
  console.log('Test 1.10: Webhook Idempotency & Duplicate Replay Protection');
  const orderId = `order_test_${Date.now()}`;
  const webhookPayload = {
    event: 'payment.captured' as const,
    orderId,
    paymentId: `pay_${orderId}`,
    studentId: 'stu-profile-01',
    feeStructureId: 'fee-tuition-sem4',
    semester: 4,
    amount: 75000,
    utrReferenceNumber: 'UTR9988776655',
  };

  const firstWebhook = await webhookIdempotencyService.handlePaymentWebhook(webhookPayload);
  assert.strictEqual(firstWebhook.status, 'PROCESSED', 'First delivery must be processed');

  // Duplicate webhook replay
  const replayWebhook = await webhookIdempotencyService.handlePaymentWebhook(webhookPayload);
  assert.strictEqual(replayWebhook.status, 'DUPLICATE_IGNORED', 'Duplicate delivery must be ignored');
  console.log('  ✓ Webhook Idempotency & Duplicate Protection Passed');

  // 11. 48-Hour Provisional Hall Ticket
  console.log('Test 1.11: 48-Hour Provisional Hall Ticket Validation');
  const provisionalPass = provisionalHallTicketService.issueProvisionalPass({
    studentId: 'stu-profile-01',
    examId: 'exam-endsem-2026',
    utrReferenceNumber: 'UTR_BANK_PENDING_123',
    grantedByUserId: 'usr-admin-01',
  });
  const gateCheck = provisionalHallTicketService.validatePassAtGate(provisionalPass.id);
  assert.strictEqual(gateCheck.isValid, true, 'Provisional pass must admit student at gate');
  assert.ok(gateCheck.remainingHours > 47 && gateCheck.remainingHours <= 48);
  console.log(`  ✓ 48-Hour Provisional Pass Admitted (Remaining grace: ${gateCheck.remainingHours}h)`);

  // 12. PostgreSQL btree_gist Temporal Exclusion Validator
  console.log('Test 1.12: Temporal Exclusion Collision Validation');
  const existingSlot = {
    id: 'slot-1',
    offeringId: 'off-1',
    roomNumber: 'ROOM-302',
    dayOfWeek: 1, // Monday
    startTime: '10:00',
    endTime: '11:00',
    facultyId: 'fac-alan-turing',
  };
  // Conflicting slot in same room at overlapping time (10:30 - 11:30)
  const roomCollisionSlot = {
    id: 'slot-2',
    offeringId: 'off-2',
    roomNumber: 'ROOM-302',
    dayOfWeek: 1,
    startTime: '10:30',
    endTime: '11:30',
    facultyId: 'fac-other',
  };
  const clashRes = temporalExclusionValidator.validateSlotExclusion(roomCollisionSlot, [existingSlot]);
  assert.strictEqual(clashRes.valid, false, 'Overlapping room slot must be rejected');
  assert.strictEqual(clashRes.conflictType, 'ROOM_CLASH');
  console.log('  ✓ Temporal Exclusion Collision Validation Passed');

  // 13. Academic Risk Score (ARS 0-100) Formula
  console.log('Test 1.13: Predictive ARS Risk Score Calculation & Mentor Escalation');
  // Formula: 0.40 * (100 - Attn%) + 0.35 * (100 - CIA%) + 0.15 * LMSInactivity + 0.10 * FeePenalty
  // Case A: High risk student (Attn: 50%, CIA: 40%, LMS inactive 14 days = 100, Unpaid fee = 100)
  // ARS = 0.40*(50) + 0.35*(60) + 0.15*(100) + 0.10*(100) = 20 + 21 + 15 + 10 = 66 -> HIGH
  const highRiskScore = arsCalculator.computeScore({
    studentId: 'stu-profile-01',
    attendancePct: 50,
    ciaScorePct: 40,
    lmsInactivityDays: 14,
    hasFeeDues: true,
  });
  assert.strictEqual(highRiskScore.compositeRiskScore, 66);
  assert.strictEqual(highRiskScore.riskLevel, 'HIGH');
  assert.strictEqual(highRiskScore.mentorNotified, true);

  const escalation = interventionWorkflowEngine.processRiskIndicator(highRiskScore);
  assert.strictEqual(escalation.ticketCreated, true, 'Intervention case must be generated');
  assert.strictEqual(escalation.parentNotificationSent, true, 'Parent notification must be triggered');
  console.log(`  ✓ ARS Score: ${highRiskScore.compositeRiskScore} (Tier: ${highRiskScore.riskLevel}, 7-Day SLA Ticket Provisioned)`);

  // 14. 1-Click NAAC SSR Telemetry & Export
  console.log('Test 1.14: NAAC Telemetry & 1-Click SSR Generator');
  const ssr = ssrExporterService.exportSsr('2025-2026');
  assert.ok(ssr.generationDurationMs < 60000, 'SSR generation must be <60s');
  assert.ok(ssr.tables.length >= 7, 'Must export at least 7 criteria tables');
  assert.ok(ssr.csvData.includes('Student to Full-Time Faculty Ratio'), 'CSV must contain STR');
  console.log(`  ✓ 1-Click NAAC SSR Generated in ${ssr.generationDurationMs}ms with ${ssr.tables.length} tables`);

  // 15. Sub-150ms Optimistic UI Transitions
  console.log('Test 1.15: Sub-150ms Optimistic UI Transition Budget');
  let localState = { enrolled: false };
  const optRes = await optimisticUiManager.executeOptimisticMutation(
    localState,
    (prev) => ({ ...prev, enrolled: true }),
    async () => {
      // Simulate fast network commit
      await new Promise((r) => setTimeout(r, 20));
      return { success: true };
    }
  );
  assert.strictEqual(optRes.success, true);
  assert.strictEqual(optRes.optimisticState.enrolled, true);
  assert.ok(optRes.latencyMs < 150, `Latency must be <150ms budget (got ${optRes.latencyMs}ms)`);
  console.log(`  ✓ Optimistic UI Transition completed in ${optRes.latencyMs}ms (<150ms budget)`);

  // 16. Unified Anti-Proxy Attendance Marking Service
  console.log('Test 1.16: Unified Anti-Proxy Attendance Marking Service');
  const nowAtt = Date.now();
  const roomSec = 'sec-room-101';
  const qrTokenObj = dynamicQrEngine.generateCurrentQr('off-att-test', roomSec, nowAtt);

  // Register student device
  webAuthnBindingService.registerDevice('stu-att-01', 'cred-device-01', 'pubkey-device-01', 'Pixel 8');

  // Mark attendance successfully
  const attRes = attendanceService.markAttendance({
    studentId: 'stu-att-01',
    offeringId: 'off-att-test',
    token: qrTokenObj.token,
    roomSecret: roomSec,
    studentCoords: { latitude: 12.971598, longitude: 77.594562 },
    classroomCoords: { latitude: 12.971600, longitude: 77.594565 },
    credentialId: 'cred-device-01',
    clientDataJSON: '{"challenge":"att-chal"}',
    biometricSignature: 'sig-biometric-valid-device-32chars',
    timestampMs: nowAtt,
  });
  assert.strictEqual(attRes.success, true, 'Attendance must be marked successfully');
  assert.strictEqual(attRes.status, 'PRESENT');
  assert.ok(attRes.recordId, 'Record ID must be generated');
  console.log(`  ✓ Unified Attendance Service Marked Attendance (Record: ${attRes.recordId})`);

  // 17. Seat Engine Cart Hold vs Commit Lifecycle
  console.log('Test 1.17: Seat Engine Cart Hold vs Commit Lifecycle');
  const testOffId = 'off-lifecycle-01';
  await seatEngine.initializeOfferingSeats(testOffId, 5);
  assert.strictEqual(await seatEngine.getAvailableSeats(testOffId), 5);

  // Reserve seat 1
  const reserved1 = await seatEngine.reserveSeat(testOffId, 'stu-life-1');
  assert.strictEqual(reserved1, true);
  assert.strictEqual(await seatEngine.getAvailableSeats(testOffId), 4);

  // Commit reservation (checkout succeeds) -> available seats must stay 4!
  await seatEngine.commitReservation(testOffId, 'stu-life-1');
  assert.strictEqual(await seatEngine.getAvailableSeats(testOffId), 4, 'Seats must remain 4 after commit');

  // Reserve seat 2 and cancel (cart abandoned) -> available seats must restore to 4!
  const reserved2 = await seatEngine.reserveSeat(testOffId, 'stu-life-2');
  assert.strictEqual(reserved2, true);
  assert.strictEqual(await seatEngine.getAvailableSeats(testOffId), 3);
  await seatEngine.releaseReservation(testOffId, 'stu-life-2');
  assert.strictEqual(await seatEngine.getAvailableSeats(testOffId), 4, 'Seats must restore to 4 after release');
  console.log('  ✓ Seat Engine Cart Hold, Commit & Release Verified');

  console.log('\n=== ALL UNIT TESTS PASSED (17/17) ===\n');
}
