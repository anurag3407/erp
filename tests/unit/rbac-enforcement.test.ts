import assert from 'node:assert';
import { rbacGuard } from '../../src/index.js';

/**
 * Verifies the route rules each server action is authorized against. These
 * mirror the logical paths passed to `authorizeAction()` in src/app/actions.ts;
 * if an action's path changes, the corresponding rule must change with it.
 */
export async function runRbacEnforcementTests(): Promise<void> {
  console.log('\n=== RUNNING SERVER-ACTION RBAC ENFORCEMENT TESTS ===\n');

  const allow = (role: string, path: string, label: string) =>
    assert.strictEqual(
      rbacGuard.authorizeRoute(role as any, path).authorized,
      true,
      `${role} must be allowed: ${label}`
    );
  const deny = (role: string, path: string, label: string) =>
    assert.strictEqual(
      rbacGuard.authorizeRoute(role as any, path).authorized,
      false,
      `${role} must be denied: ${label}`
    );

  // Self-service endpoints (any authenticated role).
  console.log('Test R.1: Self-service endpoints');
  for (const role of [
    'STUDENT',
    'FACULTY',
    'PARENT',
    'HOD',
    'DEAN',
    'REGISTRAR',
    'COE',
    'FINANCE_OFFICER',
    'LIBRARIAN',
    'WARDEN',
    'MENTOR',
  ]) {
    allow(role, '/api/self/dashboard', `${role} dashboard`);
    allow(role, '/api/self/timetable', `${role} timetable`);
    allow(role, '/api/self/password', `${role} change own password`);
  }

  console.log('Test R.2: Enrollment & attendance');
  allow('STUDENT', '/api/courses/register', 'student enrolls');
  allow('REGISTRAR', '/api/courses/register', 'registrar enrolls');
  deny('FACULTY', '/api/courses/register', 'faculty enroll');
  allow('STUDENT', '/api/attendance/punch', 'student self punch');
  allow('FACULTY', '/api/attendance/punch', 'faculty punch');
  deny('LIBRARIAN', '/api/attendance/punch', 'librarian punch');

  console.log('Test R.3: Fees, library, leave, grievance');
  allow('STUDENT', '/api/fees/ledger', 'student ledger');
  allow('PARENT', '/api/fees/pay', 'parent pays');
  deny('FACULTY', '/api/fees/pay', 'faculty pays');
  allow('STUDENT', '/api/library/borrow', 'student borrows');
  allow('LIBRARIAN', '/api/library/borrow', 'librarian circulates');
  deny('WARDEN', '/api/library/borrow', 'warden borrows');
  allow('STUDENT', '/api/leave/apply', 'student leave');
  allow('PARENT', '/api/leave/apply', 'parent ward leave');
  allow('STUDENT', '/api/grievances/file', 'student grievance');

  console.log('Test R.4: Administrative endpoints are locked down');
  allow('REGISTRAR', '/api/users/create', 'registrar provisions users');
  allow('SUPER_ADMIN', '/api/users/create', 'super admin provisions users');
  deny('STUDENT', '/api/users/create', 'student provisions users');
  deny('FACULTY', '/api/users/create', 'faculty provisions users');
  allow('REGISTRAR', '/api/users/list', 'registrar lists users');
  deny('COE', '/api/users/list', 'coe lists users');
  deny('STUDENT', '/api/users/list', 'student lists users');
  deny('STUDENT', '/api/grades/lock', 'student locks grades');
  deny('STUDENT', '/api/finance/reconcile', 'student reconciles fees');
  deny('STUDENT', '/api/attendance/override', 'student overrides attendance');

  console.log('Test R.5: Super admin bypass');
  allow('SUPER_ADMIN', '/api/grades/lock', 'super admin lock');
  allow('SUPER_ADMIN', '/api/finance/reconcile', 'super admin reconcile');

  console.log('Test R.6: Fail-closed default-deny for unmapped routes (C9)');
  // Any unmapped route must fail closed for standard roles
  deny('STUDENT', '/api/unmapped/unknown-route', 'unmapped route for student');
  deny('FACULTY', '/api/internal/debug-dump', 'unmapped internal endpoint for faculty');
  deny('REGISTRAR', '/api/random/arbitrary/path', 'arbitrary route for registrar');
  // Public allowlist endpoints must be permitted
  allow('STUDENT', '/api/auth/login', 'public login endpoint');
  allow('STUDENT', '/api/health', 'public health endpoint');
  allow('PARENT', '/verify/doc-xyz', 'public verification endpoint');

  console.log('=== ALL RBAC ENFORCEMENT TESTS PASSED (6/6) ===');
}

