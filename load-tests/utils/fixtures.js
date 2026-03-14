/**
 * Test data constants for k6 load tests.
 *
 * Seed users are created by: go run ./cmd/seed/main.go
 * Email pattern: seed_user_N@omninudge.test
 * Password: Password123!
 */

// Default matches the seed script default: go run ./backend/cmd/seed/main.go (--count=20).
// If you seed with --count=N, set SEED_USER_COUNT to N here or pass K6_SEED_USER_COUNT env var.
export const SEED_USER_COUNT = __ENV.SEED_USER_COUNT ? parseInt(__ENV.SEED_USER_COUNT, 10) : 20;
export const SEED_USER_PASSWORD = 'Password123!';

/**
 * Returns credentials for the Nth seed user (1-indexed).
 * @param {number} n
 * @returns {{ email: string, password: string }}
 */
export function seedUser(n) {
  return {
    email: `seed_user_${n}@omninudge.test`,
    password: SEED_USER_PASSWORD,
  };
}

/**
 * Returns a random seed user's credentials.
 * @returns {{ email: string, password: string }}
 */
export function randomSeedUser() {
  const n = Math.floor(Math.random() * SEED_USER_COUNT) + 1;
  return seedUser(n);
}

export const SAMPLE_MESSAGES = [
  'Hey, how are you doing?',
  'Did you see the latest update?',
  'Load testing this message endpoint!',
  'Hello from k6 virtual user.',
  'Testing message throughput at scale.',
  'Quick question — are you free later?',
  'Just checking in!',
  'Thoughts on the new feature?',
];

export function randomMessage() {
  return SAMPLE_MESSAGES[Math.floor(Math.random() * SAMPLE_MESSAGES.length)];
}

export const SAMPLE_HUB_NAMES = [
  'general',
  'announcements',
  'random',
  'tech',
  'design',
];

export function randomHubName() {
  return SAMPLE_HUB_NAMES[Math.floor(Math.random() * SAMPLE_HUB_NAMES.length)];
}

// Seed conversation IDs — populated after seeding; placeholders here.
// Override via environment: CONVERSATION_ID env var.
export const SEED_CONVERSATION_ID = __ENV.CONVERSATION_ID || '00000000-0000-0000-0000-000000000001';
