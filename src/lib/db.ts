/**
 * The application's database handle.
 *
 * Historically this module exported an in-memory `ErpDatabase` seeded with
 * dummy data. It now re-exports the async PostgreSQL repository layer
 * (`src/db/repos.ts`) — every read and write hits the real database.
 */
export { db, withTransaction } from '../db/repos.js';
export type { ErpRepositories, Executor } from '../db/repos.js';
export { resetDatabase, seedDatabase, truncateAll } from '../db/seed.js';
