import assert from 'node:assert';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  AuthService,
  sessionStore,
  authService,
  loginThrottle,
  MAX_FAILED_ATTEMPTS,
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
  assert.strictEqual(okLogin.status, 'OK', 'Valid credentials must succeed');
  assert.ok(okLogin.status === 'OK' && okLogin.session.userId === TEST_USER_ID, 'Session must bind the user');
  assert.ok(okLogin.status === 'OK' && okLogin.user.role === 'STUDENT', 'Resolved role must match the account');
  if (okLogin.status === 'OK') {
    await authService.logout(okLogin.session.id);
    assert.strictEqual(await sessionStore.get(okLogin.session.id), null, 'Logout must revoke the session');
  }

  const badPassword = await authService.login({
    method: 'PASSWORD',
    email: TEST_EMAIL,
    password: 'Wrong!Passw0rd#2026',
  });
  assert.strictEqual(badPassword.status, 'INVALID', 'Wrong password must not authenticate');

  const unknownUser = await authService.login({
    method: 'PASSWORD',
    email: 'ghost@nowhere.edu',
    password: TEST_PASSWORD,
  });
  assert.strictEqual(unknownUser.status, 'INVALID', 'Unknown email must not authenticate');

  const normalized = await authService.login({
    method: 'PASSWORD',
    email: `  ${TEST_EMAIL.toUpperCase()}  `,
    password: TEST_PASSWORD,
  });
  assert.strictEqual(normalized.status, 'OK', 'Email lookup must be case-insensitive');
  if (normalized.status === 'OK') await authService.logout(normalized.session.id);

  // 5. Pluggable providers (OTP extension point)
  console.log('Test A.5: Pluggable Auth Provider Registry (OTP-ready)');
  const fresh = new AuthService();
  assert.strictEqual(fresh.hasProvider('PASSWORD'), true, 'Password provider must be registered by default');
  assert.strictEqual(fresh.hasProvider('OTP'), false, 'OTP provider must not be registered yet');
  fresh.register({
    method: 'OTP',
    async authenticate() {
      return { userId: TEST_USER_ID, role: 'STUDENT' as const, email: TEST_EMAIL, name: 'Auth Test User' };
    },
  });
  assert.strictEqual(fresh.hasProvider('OTP'), true, 'Registering a provider must expose its method');
  const otpLogin = await fresh.login({ method: 'OTP', phone: '+911234567890', code: '123456' });
  assert.strictEqual(otpLogin.status, 'OK', 'Registered OTP provider must authenticate via the same path');
  if (otpLogin.status === 'OK') await fresh.logout(otpLogin.session.id);

  // 6. Bulk revocation
  console.log('Test A.6: Session Revocation');
  const s1 = await sessionStore.create({ userId: TEST_USER_ID, role: 'STUDENT', email: TEST_EMAIL, name: 'x' });
  const s2 = await sessionStore.create({ userId: TEST_USER_ID, role: 'STUDENT', email: TEST_EMAIL, name: 'x' });
  const removed = await sessionStore.destroyAllForUser(TEST_USER_ID);
  assert.ok(removed >= 2, 'Revoking all user sessions must remove at least the two created');
  assert.strictEqual(await sessionStore.get(s1.id), null, 'First session must be revoked');
  assert.strictEqual(await sessionStore.get(s2.id), null, 'Second session must be revoked');

  // 7. Login throttling & lockout
  console.log('Test A.7: Login Throttle & Lockout');
  const throttleEmail = 'throttle.test@enterprise-college.edu';
  for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
    const attempt = await authService.login({
      method: 'PASSWORD',
      email: throttleEmail,
      password: 'Wrong!Passw0rd#2026',
    });
    assert.notStrictEqual(attempt.status, 'OK', 'Failed attempts must never authenticate');
  }
  const locked = await authService.login({
    method: 'PASSWORD',
    email: throttleEmail,
    password: 'Wrong!Passw0rd#2026',
  });
  assert.strictEqual(locked.status, 'LOCKED', 'Account must lock after the failure threshold');
  assert.ok(locked.status === 'LOCKED' && locked.retryAfterSeconds > 0, 'Lockout must report a retry delay');
  await loginThrottle.clear([throttleEmail]);
  const unlocked = await loginThrottle.check([throttleEmail]);
  assert.strictEqual(unlocked.locked, false, 'Clearing throttle must unlock the key');

  // 8. Admin user provisioning (onboarding)
  console.log('Test A.8: User Provisioning (no seed dependency)');
  const newEmail = 'new.student@enterprise-college.edu';
  const created = await authService.createUserByAdmin({
    email: newEmail,
    name: 'New Student',
    role: 'STUDENT',
  });
  assert.ok(created.userId.startsWith('usr-'), 'Created user must get an id');
  assert.ok(created.generatedPassword, 'Provisioning without a password must generate one');
  const provisionLogin = await authService.login({
    method: 'PASSWORD',
    email: newEmail,
    password: created.generatedPassword!,
  });
  assert.strictEqual(provisionLogin.status, 'OK', 'Generated password must authenticate');
  if (provisionLogin.status === 'OK') await authService.logout(provisionLogin.session.id);

  await assert.rejects(
    () => authService.createUserByAdmin({ email: newEmail, name: 'Dup', role: 'STUDENT' }),
    /EMAIL_TAKEN/,
    'Duplicate email must be rejected'
  );

  // 9. Password change + reset
  console.log('Test A.9: Password Change & Reset Flow');
  const changedPassword = 'Even!Str0nger#2026';
  await authService.changePassword(
    created.userId,
    created.generatedPassword!,
    changedPassword
  );
  await assert.rejects(
    () => authService.changePassword(created.userId, 'Wrong!Passw0rd#2026', 'Another!Passw0rd#2026'),
    /INVALID_CREDENTIALS/,
    'Change password must verify the current password'
  );
  const afterChange = await authService.login({
    method: 'PASSWORD',
    email: newEmail,
    password: changedPassword,
  });
  assert.strictEqual(afterChange.status, 'OK', 'New password must work after change');
  if (afterChange.status === 'OK') await authService.logout(afterChange.session.id);

  const resetReq = await authService.requestPasswordReset(newEmail);
  assert.ok(resetReq?.token, 'Reset request must mint a token for a known account');
  assert.strictEqual(
    await authService.requestPasswordReset('ghost@nowhere.edu'),
    null,
    'Reset request must not reveal unknown accounts'
  );

  const resetPassword = 'Reset!Passw0rd#2026';
  await authService.resetPassword(resetReq!.token, resetPassword);
  const afterReset = await authService.login({
    method: 'PASSWORD',
    email: newEmail,
    password: resetPassword,
  });
  assert.strictEqual(afterReset.status, 'OK', 'Reset password must authenticate');
  if (afterReset.status === 'OK') await authService.logout(afterReset.session.id);

  await assert.rejects(
    () => authService.resetPassword(resetReq!.token, 'Reuse!Passw0rd#2026'),
    /INVALID_RESET_TOKEN/,
    'Reset tokens must be single-use'
  );

  // Cleanup test accounts.
  await db.users.delete(TEST_USER_ID);
  await db.users.delete(created.userId);
  await loginThrottle.clear([throttleEmail, newEmail, TEST_EMAIL]);

  console.log('=== ALL AUTHENTICATION & SESSION TESTS PASSED (9/9) ===');
}
