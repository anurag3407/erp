import assert from 'node:assert';
import {
  geofenceService,
  dynamicQrEngine,
  nepMilestoneService,
  osvArbitrationService,
  arsCalculator,
  interventionWorkflowEngine,
  temporalExclusionValidator,
  TemporalExclusionValidator,
  seatEngine,
  courseCheckoutService,
  whatIfSimulator,
  examSeatingOptimizer,
  autoHealingPaymentPoller,
  digiLockerSyncService,
  db,
  type OnScreenEvaluationScript,
} from '../../src/index.js';

export async function runEdgeCaseTests(): Promise<void> {
  console.log('\n=== RUNNING CRITICAL BOUNDARY & EDGE CASE TESTS ===\n');

  // 1. Geofence Exact 25m Boundary Tests
  console.log('Edge Test 1: Geofence Exact 25m Boundary Threshold');
  const classroom = { latitude: 0, longitude: 0 };
  // 1 degree latitude ~= 111,195 meters
  // 24.9 meters ~= 0.00022393 degrees
  // 25.1 meters ~= 0.00022573 degrees
  const pointWithin = { latitude: 0.000223, longitude: 0 };
  const pointOutside = { latitude: 0.000226, longitude: 0 };

  const resWithin = geofenceService.validateClassroomGeofence(pointWithin, classroom, 25);
  const resOutside = geofenceService.validateClassroomGeofence(pointOutside, classroom, 25);

  assert.strictEqual(resWithin.isWithinBounds, true, `24.8m must be within bounds (got ${resWithin.distanceMeters}m)`);
  assert.strictEqual(resOutside.isWithinBounds, false, `25.1m must be out of bounds (got ${resOutside.distanceMeters}m)`);
  console.log(`  ✓ 24.8m -> ${resWithin.status}, 25.1m -> ${resOutside.status}`);

  // 2. Rolling QR Time-Step Transition Boundary
  console.log('Edge Test 2: Rolling QR Time-Step Exact Boundary');
  const roomSecret = 'boundary-salt';
  const t9999 = 9999;   // step 0
  const t10001 = 10001; // step 1
  const qrStep0 = dynamicQrEngine.generateCurrentQr('off-edge', roomSecret, t9999);
  assert.strictEqual(qrStep0.timeStep, 0);

  // Verifying token from step 0 at step 1 with 0 drift tolerance
  const verifyAtStep1 = dynamicQrEngine.verifyToken('off-edge', qrStep0.token, roomSecret, t10001);
  assert.strictEqual(verifyAtStep1.valid, false, 'Token from step 0 must fail at step 1');
  console.log('  ✓ Token from step 0 rejected across boundary step 1');

  // 3. NEP 2020 Exact Credit Thresholds (39 vs 40, 79 vs 80, 119 vs 120)
  console.log('Edge Test 3: NEP 2020 Exact Credit Thresholds');
  const e39 = nepMilestoneService.evaluateStudentMilestones(39);
  assert.strictEqual(e39.currentEligibleTier.isEligible, false, '39 credits must NOT receive certificate');
  assert.strictEqual(e39.currentEligibleTier.creditDelta, 1);

  const e40 = nepMilestoneService.evaluateStudentMilestones(40);
  assert.strictEqual(e40.currentEligibleTier.isEligible, true, '40 credits MUST receive certificate');
  assert.strictEqual(e40.currentEligibleTier.milestoneName, 'CERTIFICATE');

  const e79 = nepMilestoneService.evaluateStudentMilestones(79);
  assert.strictEqual(e79.currentEligibleTier.milestoneName, 'CERTIFICATE'); // Not yet diploma
  const e80 = nepMilestoneService.evaluateStudentMilestones(80);
  assert.strictEqual(e80.currentEligibleTier.milestoneName, 'DIPLOMA');

  const e119 = nepMilestoneService.evaluateStudentMilestones(119);
  assert.strictEqual(e119.currentEligibleTier.milestoneName, 'DIPLOMA');
  const e120 = nepMilestoneService.evaluateStudentMilestones(120);
  assert.strictEqual(e120.currentEligibleTier.milestoneName, 'DEGREE');
  console.log('  ✓ 39/40, 79/80, 119/120 credit boundaries verified');

  // 4. Double-Blind OSV 15.0% vs 15.1% Arbitration Boundary
  console.log('Edge Test 4: OSV 15.0% vs 15.1% Variance Boundary');
  const script150: OnScreenEvaluationScript = {
    id: 'sc-150',
    assessmentId: 'asm-edge',
    anonymousBarcode: 'OSV-150',
    studentId: 'stu-1',
    scannedPdfUrl: 'https://r2/150.pdf',
    maxScore: 100,
    status: 'PENDING_EVAL_1',
  };
  // Evaluator 1 gives 70, Evaluator 2 gives 85 -> diff 15 marks = 15.0% (<= 15% threshold)
  osvArbitrationService.processEvaluatorScore(script150, 1, 70);
  const res150 = osvArbitrationService.processEvaluatorScore(script150, 2, 85);
  assert.strictEqual(res150.status, 'FINALIZED', '15.0% variance must NOT trigger arbitration');
  assert.strictEqual(script150.finalScore, 77.5);

  const script151: OnScreenEvaluationScript = {
    id: 'sc-151',
    assessmentId: 'asm-edge',
    anonymousBarcode: 'OSV-151',
    studentId: 'stu-2',
    scannedPdfUrl: 'https://r2/151.pdf',
    maxScore: 100,
    status: 'PENDING_EVAL_1',
  };
  // Evaluator 1 gives 70, Evaluator 2 gives 85.1 -> diff 15.1% (> 15% threshold)
  osvArbitrationService.processEvaluatorScore(script151, 1, 70);
  const res151 = osvArbitrationService.processEvaluatorScore(script151, 2, 85.1);
  assert.strictEqual(res151.status, 'ARBITRATION_REQUIRED', '15.1% variance MUST trigger arbitration');
  console.log('  ✓ 15.0% finalized directly, 15.1% routed to Chief Examiner');

  // 5. Timetable Back-to-Back Slots (10:00-11:00 and 11:00-12:00)
  console.log('Edge Test 5: Timetable Back-to-Back vs Overlap Boundary');
  const slotA = { dayOfWeek: 1, startTime: '10:00', endTime: '11:00' };
  const slotBackToBack = { dayOfWeek: 1, startTime: '11:00', endTime: '12:00' };
  const slot1MinOverlap = { dayOfWeek: 1, startTime: '10:59', endTime: '12:00' };

  assert.strictEqual(
    TemporalExclusionValidator.doIntervalsOverlap(slotA, slotBackToBack),
    false,
    'Back-to-back classes must NOT overlap'
  );
  assert.strictEqual(
    TemporalExclusionValidator.doIntervalsOverlap(slotA, slot1MinOverlap),
    true,
    '1-minute overlap MUST trigger conflict'
  );
  console.log('  ✓ Back-to-back (10-11 & 11-12) OK; Overlap (10-11 & 10:59-12) Conflict');

  // 6. Deadlock Prevention under Reverse Order Requests
  console.log('Edge Test 6: Deadlock Prevention under Circular Concurrency');
  const cA = 'crs-uuid-0001';
  const cB = 'crs-uuid-0002';
  db.courseOfferings.set(cA, {
    id: cA,
    courseId: 'crs-1',
    semester: 1,
    academicYear: '2026',
    facultyId: 'fac-1',
    maxCapacity: 10,
    enrolledCount: 0,
    section: 'A',
    waitlistCount: 0,
  });
  db.courseOfferings.set(cB, {
    id: cB,
    courseId: 'crs-2',
    semester: 1,
    academicYear: '2026',
    facultyId: 'fac-2',
    maxCapacity: 10,
    enrolledCount: 0,
    section: 'A',
    waitlistCount: 0,
  });

  await seatEngine.initializeOfferingSeats(cA, 10);
  await seatEngine.initializeOfferingSeats(cB, 10);

  // Client 1 requests [cA, cB], Client 2 requests [cB, cA] concurrently
  const [res1, res2] = await Promise.all([
    courseCheckoutService.checkoutCourses('student-a', [cA, cB]),
    courseCheckoutService.checkoutCourses('student-b', [cB, cA]),
  ]);

  assert.strictEqual(res1.success, true);
  assert.strictEqual(res2.success, true);
  console.log('  ✓ Circular concurrency resolved with sorted UUID locks without deadlock');

  // 7. Empty Input Edge Cases
  console.log('Edge Test 7: Empty Inputs & Degenerate Cases');
  const emptyCheckout = await courseCheckoutService.checkoutCourses('stu-empty', []);
  assert.strictEqual(emptyCheckout.success, false);

  const emptyWhatIf = whatIfSimulator.simulateProgramSwitch('prog-1', 'prog-2', [], []);
  assert.strictEqual(emptyWhatIf.transferableCredits, 0);

  const emptySeating = examSeatingOptimizer.allocateHall('exam-empty', 'HALL-0', 2, 2, []);
  assert.strictEqual(emptySeating.allocatedSeats, 0);
  console.log('  ✓ Empty inputs handled gracefully without throwing');

  // 8. Auto-Healing Poller 5-Minute Boundary Threshold (4m59s vs 5m01s)
  console.log('Edge Test 8: Auto-Healing Poller 5-Minute Boundary Threshold');
  const now = Date.now();
  const txYoung = `order_edge_young_${now}`;
  const txOld = `order_edge_old_${now}`;

  // txYoung: 4m 50s old (should NOT be swept)
  db.paymentTransactions.set(txYoung, {
    id: `tx-${txYoung}`,
    studentId: 'stu-profile-01',
    feeStructureId: 'fee-struct-01',
    orderId: txYoung,
    amount: 1000,
    gateway: 'RAZORPAY',
    idempotencyKey: `idem-${txYoung}`,
    status: 'PENDING',
    createdAt: new Date(now - 290 * 1000), // 290s = 4m 50s (<5 min)
    updatedAt: new Date(),
  });

  // txOld: 5m 10s old (MUST be swept)
  db.paymentTransactions.set(txOld, {
    id: `tx-${txOld}`,
    studentId: 'stu-profile-01',
    feeStructureId: 'fee-struct-01',
    orderId: txOld,
    amount: 1000,
    gateway: 'RAZORPAY',
    idempotencyKey: `idem-${txOld}`,
    status: 'PENDING',
    createdAt: new Date(now - 310 * 1000), // 310s = 5m 10s (>5 min)
    updatedAt: new Date(),
  });

  const pollerReport = await autoHealingPaymentPoller.runReconciliationSweep();
  const youngAfter = db.paymentTransactions.get(txYoung);
  const oldAfter = db.paymentTransactions.get(txOld);

  assert.strictEqual(youngAfter?.status, 'PENDING', 'Transaction <5m old must remain PENDING');
  assert.strictEqual(oldAfter?.status, 'RECONCILED_BY_POLLER', 'Transaction >5m old must be RECONCILED_BY_POLLER');
  console.log('  ✓ Poller threshold enforced: <5m left PENDING, >5m reconciled');

  // 9. DigiLocker Zero-Credit Course Non-Credit NaN Guard
  console.log('Edge Test 9: DigiLocker Zero-Credit Course Non-Credit NaN Guard');
  const zeroCreditRecord = digiLockerSyncService.generateNadRecord(
    'APAAR-ZERO-01',
    '2024ZERO01',
    1,
    '2025-2026',
    [{ code: 'MNC101', name: 'Environmental Science (Non-Credit)', credits: 0, gradePoint: 0, letterGrade: 'COMPLETED' }],
    8.5
  );
  assert.strictEqual(zeroCreditRecord.totalCreditsEarned, 0);
  assert.strictEqual(isNaN(zeroCreditRecord.sgpa), false, 'SGPA must not be NaN for zero-credit course');
  assert.strictEqual(zeroCreditRecord.sgpa, 0);
  console.log('  ✓ Zero-credit courses handled gracefully with sgpa = 0 (NaN prevented)');

  console.log('\n=== ALL EDGE CASE TESTS PASSED (9/9) ===\n');
}

if (process.argv[1]?.endsWith('edge-cases.test.ts') || process.argv[1]?.endsWith('edge-cases.test.js')) {
  runEdgeCaseTests()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('EDGE CASE TEST FAILURE:', err);
      process.exit(1);
    });
}
