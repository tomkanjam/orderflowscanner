/**
 * Test setup and global configuration
 */

import { beforeAll, afterAll } from 'vitest';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.test') });
dotenv.config({ path: resolve(__dirname, '../.env') });

// Global test configuration
export const TEST_TIMEOUT = 60000; // 60 seconds

// Check if integration tests should run
export const shouldRunIntegrationTests = () => {
  if (process.env.SKIP_INTEGRATION_TESTS === 'true') {
    console.log('\n⏭️  Integration tests skipped (SKIP_INTEGRATION_TESTS=true)\n');
    return false;
  }

  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.warn(`\n⚠️  Missing environment variables: ${missingVars.join(', ')}`);
    console.warn('   Integration tests will be skipped.\n');
    return false;
  }

  return true;
};

beforeAll(() => {
  console.log('\n🧪 Starting test suite...\n');
});

afterAll(() => {
  console.log('\n✅ Test suite complete\n');
});
