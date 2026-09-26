import assert from 'node:assert';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  AuthService,
  sessionStore,
  authService,
  db,
} from '../../src/index.js';

const TEST_USER_ID = 'usr-auth-test';
const TEST_EMAIL = 'auth.test@enterprise-college.edu';
const TEST_PASSWORD = 'Str0ng!Passw0rd#2026';

export async function runAuthTests(): Promise<void> {
  console.log('\n=== RUNNING AUTHENTICATION & SESSION TESTS ===\n');

  // 1. Password policy
  console.log('Test A.1: Password Policy Enforcement');
  assert.strictEqual(validatePasswordPolicy('short').valid, false, 'Short password must fail policy');
  assert.strictEqual(validatePasswordPolicy('alllowercase12345!').valid, false, 'Missing uppercase must fail');
  assert.strictEqual(validatePasswordPolicy('ALLUPPER12345!').valid, false, 'Missing lowercase must fail');
  assert.strictEqual(validatePasswordPolicy('NoDigitsHere!').valid, false, 'Missing digit must fail');
  assert.strictEqual(validatePasswordPolicy('NoSymbols12345').valid, false, 'Missing symbol must fail');
  assert.strictEqual(validatePasswordPolicy(TEST_PASSWORD).valid, true, 'Strong password must pass policy');

  // 2. Hashing + verification
  console.log('Test A.2: scrypt Hashing & Verification');
  const stored = await hashPassword(TEST_PASSWORD);
  assert.ok(stored.startsWith('scrypt$'), 'Hash must be self-describing');
  assert.notStrictEqual(stored, TEST_PASSWORD, 'Stored value must not be plaintext');
  assert.strictEqual(await verifyPassword(TEST_PASSWORD, stored), true, 'Correct password must verify');
  assert.strictEqual(await verifyPassword('Wrong!Passw0rd#2026', stored), false, 'Wrong password must fail');
  assert.strictEqual(await verifyPassword(TEST_PASSWORD, 'seeded'), false, 'Legacy placeholder must not verify');
  assert.strictEqual(await verifyPassword(TEST_PASSWORD, 'scrypt$$$$$'), false, 'Malformed hash must not throw/verify');

  // Two hashes of the same password must differ (random salt).
  const stored2 = await hashPassword(TEST_PASSWORD);
  assert.notStrictEqual(stored, stored2, 'Salts must make identical passwords hash differently');
  await assert.rejects(() => hashPassword('weak'), /WEAK_PASSWORD/, 'Weak password must be rejected at hashing');

  // 3. Session lifecycle
  console.log('Test A.3: Redis Session Store Lifecycle');
  const session = await sessionStore.create({
    userId: TEST_USER_ID,
    role: 'STUDENT',
    email: TEST_EMAIL,
    name: 'Auth Test User',
  });
  assert.ok(session.id.length >= 40, 'Session id must be a long random token');

  const fetched = await sessionStore.get(session.id);
  assert.strictEqual(fetched?.userId, TEST_USER_ID, 'Session must round-trip through Redis');

  assert.strictEqual(await sessionStore.get('nonexistent-session-id'), null, 'Unknown session must resolve to null');

  await sessionStore.destroy(session.id);
  assert.strictEqual(await sessionStore.get(session.id), null, 'Destroyed session must be gone');

  // 4. Login through the provider registry
  console.log('Test A.4: Password Login via AuthService');
  await db.users.set(TEST_USER_ID, {
    id: TEST_USER_ID,
    email: TEST_EMAIL,
    name: 'Auth Test User',
    role: 'STUDENT',
    passwordHash: stored,
  } as any);

  const okLogin = await authService.login({
    method: 'PASSWORD',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  assert.ok(okLogin, 'Valid credentials must produce a session');
  assert.strictEqual(okLogin!.session.userId, TEST_USER_ID, 'Session must bind the authenticated user');
  assert.strictEqual(okLogin!.user.role, 'STUDENT', 'Resolved role must match the account');
  await authService.logout(okLogin!.session.id);
  assert.strictEqual(await sessionStore.get(okLogin!.session.id), null, 'Logout must revoke the session');

  const badPassword = await authService.login({
    method: 'PASSWORD',
    email: TEST_EMAIL,
    password: 'Wrong!Passw0rd#2026',
  });
  assert.strictEqual(badPassword, null, 'Wrong password must not authenticate');

  const unknownUser = await authService.login({
    method: 'PASSWORD',
    email: 'ghost@nowhere.edu',
    password: TEST_PASSWORD,
  });
  assert.strictEqual(unknownUser, null, 'Unknown email must not authenticate');

  // Email must be normalized (case/whitespace insensitive).
  const normalized = await authService.login({
    method: 'PASSWORD',
    email: `  ${TEST_EMAIL.toUpperCase()}  `,
    password: TEST_PASSWORD,
  });
  assert.ok(normalized, 'Email lookup must be case-insensitive');
  await authService.logout(normalized!.session.id);

  // 5. Pluggable providers (OTP extension point)
  console.log('Test A.5: Pluggable Auth Provider Registry (OTP-ready)');
  const fresh = new AuthService();
  assert.strictEqual(fresh.hasProvider('PASSWORD'), true, 'Password provider must be registered by default');
  assert.strictEqual(fresh.hasProvider('OTP'), false, 'OTP provider must not be registered yet');
  const stubOtp = {
    method: 'OTP' as const,
    async authenticate() {
      return { userId: TEST_USER_ID, role: 'STUDENT' as const, email: TEST_EMAIL, name: 'Auth Test User' };
    },
  };
  fresh.register(stubOtp);
  assert.strictEqual(fresh.hasProvider('OTP'), true, 'Registering a provider must expose its method');
  const otpLogin = await fresh.login({ method: 'OTP', phone: '+911234567890', code: '123456' });
  assert.ok(otpLogin, 'Registered OTP provider must authenticate through the same login path');
  await fresh.logout(otpLogin!.session.id);

  // 6. Bulk revocation
  console.log('Test A.6: Session Revocation');
  const s1 = await sessionStore.create({ userId: TEST_USER_ID, role: 'STUDENT', email: TEST_EMAIL, name: 'x' });
  const s2 = await sessionStore.create({ userId: TEST_USER_ID, role: 'STUDENT', email: TEST_EMAIL, name: 'x' });
  const removed = await sessionStore.destroyAllForUser(TEST_USER_ID);
  assert.ok(removed >= 2, 'Revoking all user sessions must remove at least the two created');
  assert.strictEqual(await sessionStore.get(s1.id), null, 'First session must be revoked');
  assert.strictEqual(await sessionStore.get(s2.id), null, 'Second session must be revoked');

  // Cleanup test user.
  await db.users.delete(TEST_USER_ID);

  console.log('=== ALL AUTHENTICATION & SESSION TESTS PASSED (6/6) ===');
}
