import { sql } from './client.js';
import { hashPassword } from '../lib/password.js';

/**
 * Seeds the demo institutional fixtures into PostgreSQL.
 *
 * This replaces the old in-memory `ErpDatabase.seedInitialData()`. All IDs are
 * the human-readable prefixed strings the rest of the codebase (and tests)
 * already use. Run with `npm run db:seed`.
 */
export async function truncateAll(): Promise<void> {
  const rows = await sql<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;
  if (rows.length === 0) return;
  const tables = rows.map((r) => `"${r.tablename}"`).join(', ');
  await sql.unsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export async function seedDatabase(): Promise<void> {
  // Seeded accounts share one documented development password. Replace it (or
  // provision real accounts) before exposing this instance to anyone.
  const seedPassword =
    process.env.SEED_DEFAULT_PASSWORD || 'ChangeMe!2026Secure';
  const passwordHash = await hashPassword(seedPassword, true);

  // 1. Departments
  await sql`
    INSERT INTO departments (id, code, name) VALUES
      ('dept-cse', 'CSE', 'Computer Science & Engineering'),
      ('dept-humanities', 'HUM', 'Humanities & Social Sciences')
    ON CONFLICT (id) DO NOTHING
  `;

  // 2. Programs
  await sql`
    INSERT INTO programs (id, department_id, code, name, degree_type, total_credits_required, nep_enabled) VALUES
      ('prog-btech-cse', 'dept-cse', 'BTECH-CSE', 'B.Tech Computer Science & Engineering', 'B.Tech', 160, TRUE),
      ('prog-ai-ds', 'dept-cse', 'BTECH-AIDS', 'B.Tech Artificial Intelligence & Data Science', 'B.Tech', 160, TRUE)
    ON CONFLICT (id) DO NOTHING
  `;

  // 3. Users (all 12 institutional roles)
  await sql`
    INSERT INTO users (id, email, name, role, department_id, password_hash) VALUES
      ('usr-admin-01',   'registrar@enterprise-college.edu',      'Dr. Sarah Jenkins',   'REGISTRAR',       NULL,             ${passwordHash}),
      ('usr-coe-01',     'coe@enterprise-college.edu',            'Prof. Rajesh Sharma', 'COE',             NULL,             ${passwordHash}),
      ('usr-fac-01',     'alan.turing@enterprise-college.edu',    'Prof. Alan Turing',   'FACULTY',         'dept-cse',       ${passwordHash}),
      ('usr-mentor-01',  'ada.lovelace@enterprise-college.edu',   'Dr. Ada Lovelace',    'MENTOR',          'dept-cse',       ${passwordHash}),
      ('usr-stu-01',     'rohit.kumar@student.enterprise.edu',    'Rohit Kumar',         'STUDENT',         NULL,             ${passwordHash}),
      ('usr-hod-01',     'hod.cse@enterprise-college.edu',        'Dr. Margaret Hamilton','HOD',            'dept-cse',       ${passwordHash}),
      ('usr-parent-01',  'suresh.kumar@family.edu',               'Suresh Kumar',        'PARENT',          NULL,             ${passwordHash}),
      ('usr-parent-02',  'meena.kumar@family.edu',                'Meena Kumar',         'PARENT',          NULL,             ${passwordHash}),
      ('usr-lib-01',     'library@enterprise-college.edu',        'Mr. Melvil Dewey',    'LIBRARIAN',       NULL,             ${passwordHash}),
      ('usr-fin-01',     'bursar@enterprise-college.edu',         'Ms. Janet Yellen',    'FINANCE_OFFICER', NULL,             ${passwordHash}),
      ('usr-dean-01',    'dean.academics@enterprise-college.edu', 'Prof. Donald Knuth',  'DEAN',            'dept-cse',       ${passwordHash}),
      ('usr-warden-01',  'warden.hostel1@enterprise-college.edu', 'Dr. Robert Flores',   'WARDEN',          NULL,             ${passwordHash}),
      ('usr-fac-02',     'grace.hopper@enterprise-college.edu',   'Prof. Grace Hopper',  'FACULTY',         'dept-cse',       ${passwordHash})
    ON CONFLICT (id) DO NOTHING
  `;

  // 4. Student Profile
  await sql`
    INSERT INTO student_profiles (
      id, user_id, roll_number, apaar_id, program_id, current_semester,
      admission_year, academic_status, mentor_id, cgpa, total_earned_credits, nep_exit_level
    ) VALUES (
      'stu-profile-01', 'usr-stu-01', '2024CSE001', 'APAAR-9874-5612-3401', 'prog-btech-cse',
      4, 2024, 'ACTIVE', 'usr-mentor-01', 8.75, 78, 2
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // 5. Course Catalog
  await sql`
    INSERT INTO courses (
      id, code, name, department_id, credits, lecture_hours, tutorial_hours,
      practical_hours, bucket_type, prerequisites
    ) VALUES
      ('crs-cse-201',  'CS201',  'Data Structures and Algorithms',            'dept-cse',        4, 3, 1, 0, 'CORE',                '[]'::jsonb),
      ('crs-cse-301',  'CS301',  'Distributed Systems & Cloud Computing',     'dept-cse',        4, 3, 1, 0, 'DISCIPLINE_ELECTIVE', '["crs-cse-201"]'::jsonb),
      ('crs-open-101', 'OE101',  'Introduction to Cognitive Psychology',      'dept-humanities', 3, 3, 0, 0, 'OPEN_ELECTIVE',       '[]'::jsonb),
      ('crs-aec-101',  'AEC101', 'Technical Writing & Academic Publishing',   'dept-humanities', 2, 2, 0, 0, 'ABILITY_ENHANCEMENT', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING
  `;

  // 6. Course Offerings
  await sql`
    INSERT INTO course_offerings (
      id, course_id, semester, academic_year, faculty_id, max_capacity,
      enrolled_count, section, waitlist_count
    ) VALUES
      ('offering-cs301-s1', 'crs-cse-301',  4, '2025-2026', 'usr-fac-01', 60, 58, 'A', 0),
      ('offering-oe101-s1', 'crs-open-101', 4, '2025-2026', 'usr-fac-01', 40, 39, 'A', 0)
    ON CONFLICT (id) DO NOTHING
  `;

  // 7. Academic Term
  await sql`
    INSERT INTO academic_terms (
      id, name, academic_year, semester_type, start_date, end_date,
      registration_start_date, registration_end_date, add_drop_deadline,
      grade_lock_deadline, status
    ) VALUES (
      'term-2025-fall', 'Fall 2025 Semester', '2025-2026', 'ODD',
      '2025-08-01T00:00:00Z', '2025-12-15T23:59:59Z',
      '2025-07-15T00:00:00Z', '2025-08-15T23:59:59Z',
      '2025-08-25T23:59:59Z', '2025-12-24T23:59:59Z', 'ACTIVE'
    )
    ON CONFLICT (id) DO NOTHING
  `;

  // 8. Library Catalog
  await sql`
    INSERT INTO library_books (
      id, isbn, title, author, publisher, call_number, total_copies,
      available_copies, department_id
    ) VALUES
      ('book-ds-01', '978-0131103627', 'The C Programming Language & Algorithms',
       'Brian W. Kernighan & Dennis M. Ritchie', 'Prentice Hall',
       'QA76.73.C15 K47', 5, 5, 'dept-cse')
    ON CONFLICT (id) DO NOTHING
  `;
}

/** Truncate + reseed. Used by the seed script and test harness. */
export async function resetDatabase(): Promise<void> {
  await truncateAll();
  await seedDatabase();
}

// Allow `node --loader ts-node/esm src/db/seed.ts` style execution.
const isDirectRun = process.argv[1]?.includes('seed');
if (isDirectRun) {
  resetDatabase()
    .then(async () => {
      const { closeDatabase } = await import('./client.js');
      await closeDatabase();
      console.log('✅ Database seeded successfully.');
    })
    .catch((err) => {
      console.error('❌ Seed failed:', err);
      process.exit(1);
    });
}
