import assert from 'node:assert';
import {
  db,
  redis,
  seatEngine,
  courseCheckoutService,
  webhookIdempotencyService,
  autoHealingPaymentPoller,
  timetableCspSolver,
} from '../../src/index.js';

export async function runIntegrationTests(): Promise<void> {
  console.log('\n=== RUNNING ENTERPRISE ERP INTEGRATION & STRESS TESTS ===\n');

  // 1. High-Concurrency Course Registration Stress Test
  // Simulates 5,000 concurrent checkout attempts competing for 60 available seats
  console.log('Test 2.1: 5,000 Concurrent Checkout Requests Stress Test (Capacity = 60)');
  const offeringId = 'offering-stress-cse-401';
  const maxCapacity = 60;

  // Initialize course offering in DB & Redis
  await db.courseOfferings.set(offeringId, {
    id: offeringId,
    courseId: 'crs-cse-301',
    semester: 4,
    academicYear: '2025-2026',
    facultyId: 'usr-fac-01',
    maxCapacity,
    enrolledCount: 0,
    section: 'A',
    waitlistCount: 0,
  });
  await seatEngine.initializeOfferingSeats(offeringId, maxCapacity);

  const CONCURRENT_REQUESTS = 5000;
  const latencies: number[] = [];
  const startStress = performance.now();

  // Generate 5,000 student checkout promises concurrently
  const promises: Promise<unknown>[] = [];

  for (let i = 1; i <= CONCURRENT_REQUESTS; i++) {
    const studentId = `stu-stress-${i}`;
    const p = (async () => {
      const t0 = performance.now();
      const res = await courseCheckoutService.checkoutCourses(studentId, [offeringId]);
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      return res;
    })();
    promises.push(p);
  }

  const results = (await Promise.all(promises)) as Array<{ success: boolean }>;
  const endStress = performance.now();

  const successCount = results.filter((r) => r.success).length;
  const rejectedCount = results.filter((r) => !r.success).length;

  // Compute Latency Percentiles
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.50)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  const finalOffering = await db.courseOfferings.get(offeringId);
  const finalEnrolledCount = finalOffering?.enrolledCount || 0;

  console.log(`  Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`  Enrolled: ${successCount} (Max Capacity: ${maxCapacity})`);
  console.log(`  Rejected (Gracefully Handled): ${rejectedCount}`);
  console.log(`  Duration: ${Math.round(endStress - startStress)}ms`);
  console.log(`  Latency: p50 = ${p50.toFixed(2)}ms, p95 = ${p95.toFixed(2)}ms, p99 = ${p99.toFixed(2)}ms`);

  // Assertions: 0 Over-Enrollments, 0 Deadlocks
  assert.strictEqual(finalEnrolledCount, maxCapacity, `Enrolled count must exactly equal max capacity (${maxCapacity})`);
  assert.strictEqual(successCount, maxCapacity, `Success count must exactly equal max capacity (${maxCapacity})`);
  assert.strictEqual(successCount + rejectedCount, CONCURRENT_REQUESTS, 'All requests must be accounted for');
  assert.ok(p95 < 200, `p95 latency must be under 200ms (got ${p95.toFixed(2)}ms)`);
  console.log('  ✓ Zero Over-Enrollment & Zero Deadlock Guarantee Verified (100% Passing)');

  // 2. High-Frequency Webhook Replay & Race Condition Test
  console.log('\nTest 2.2: Concurrent Webhook Replay Flood (100 duplicate deliveries)');
  const floodOrderId = `order_flood_${Date.now()}`;
  const webhookFloods = Array.from({ length: 100 }, () =>
    webhookIdempotencyService.handlePaymentWebhook({
      event: 'payment.captured',
      orderId: floodOrderId,
      paymentId: `pay_${floodOrderId}`,
      studentId: 'stu-profile-01',
      feeStructureId: 'fee-struct-01',
      semester: 4,
      amount: 45000,
      utrReferenceNumber: 'UTR-FLOOD-TEST',
    })
  );

  const floodResults = await Promise.all(webhookFloods);
  const processedCount = floodResults.filter((r) => r.status === 'PROCESSED').length;
  const rejectedFloodCount = floodResults.filter((r) => r.status === 'DUPLICATE_IGNORED' || r.status === 'LOCK_FAILED').length;

  assert.strictEqual(processedCount, 1, 'Exactly one webhook execution must succeed');
  assert.strictEqual(rejectedFloodCount, 99, '99 duplicate webhook events must be safely deduplicated or locked');
  console.log(`  ✓ Webhook Concurrency Passed: 1 Processed, 99 Safely Deduplicated/Locked`);

  // 3. Timetable Solver Integration Test
  console.log('\nTest 2.3: Timetable CSP Solver Campus-Wide Matrix Allocation');
  const offerings = [
    { offeringId: 'off-cs1', courseCode: 'CS101', facultyId: 'fac-1', hoursPerWeek: 3, expectedClassSize: 50 },
    { offeringId: 'off-cs2', courseCode: 'CS201', facultyId: 'fac-2', hoursPerWeek: 3, expectedClassSize: 45 },
    { offeringId: 'off-ec1', courseCode: 'EC101', facultyId: 'fac-3', hoursPerWeek: 3, expectedClassSize: 40 },
    { offeringId: 'off-me1', courseCode: 'ME101', facultyId: 'fac-4', hoursPerWeek: 3, expectedClassSize: 35 },
    { offeringId: 'off-ma1', courseCode: 'MA101', facultyId: 'fac-5', hoursPerWeek: 4, expectedClassSize: 55 },
  ];
  const rooms = [
    { roomNumber: 'LH-101', capacity: 60 },
    { roomNumber: 'LH-102', capacity: 60 },
    { roomNumber: 'LH-103', capacity: 50 },
  ];

  const solverRes = timetableCspSolver.solve(offerings, rooms);
  assert.strictEqual(solverRes.success, true, 'Solver must allocate all hours clash-free');
  assert.strictEqual(solverRes.unassignedOfferings.length, 0);
  assert.strictEqual(solverRes.totalAssignedHours, 16); // 3+3+3+3+4 = 16 hours
  console.log(`  ✓ Timetable CSP Solved 16/16 lecture hours across 3 Lecture Halls (Matrix Score: ${solverRes.matrixScore}%)`);

  // 4. Auto-Healing Payment Poller Integration
  console.log('\nTest 2.4: Auto-Healing Payment Poller Reconciliation');
  const pollerOrderId = `order_poller_${Date.now()}`;
  await db.paymentTransactions.set(pollerOrderId, {
    id: `tx-${pollerOrderId}`,
    studentId: 'stu-profile-01',
    feeStructureId: 'fee-struct-01',
    orderId: pollerOrderId,
    amount: 50000,
    gateway: 'RAZORPAY',
    idempotencyKey: `idem-${pollerOrderId}`,
    status: 'PENDING',
    utrReferenceNumber: 'UTR-AUTOHEAL-777',
    createdAt: new Date(Date.now() - 6 * 60 * 1000), // Created 6 minutes ago (>5 min threshold)
    updatedAt: new Date(),
  });

  const pollerReport = await autoHealingPaymentPoller.runReconciliationSweep();
  assert.ok(pollerReport.healedCount >= 1, 'Poller must heal stuck pending transaction');
  const healedTx = await db.paymentTransactions.get(pollerOrderId);
  assert.strictEqual(healedTx?.status, 'RECONCILED_BY_POLLER', 'Transaction status must update to RECONCILED_BY_POLLER');
  console.log(`  ✓ Auto-Healing Poller Reconciled Pending Order in ${pollerReport.executionTimeMs}ms`);

  console.log('\n=== ALL INTEGRATION & STRESS TESTS PASSED (4/4) ===\n');
}
