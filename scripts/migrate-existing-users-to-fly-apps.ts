// Script to migrate existing Pro/Elite users to dedicated Fly apps
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface MigrationResult {
  success: boolean;
  error?: any;
  appName?: string;
}

async function migrateUser(userId: string, tier: string): Promise<MigrationResult> {
  console.log(`Migrating user ${userId} (${tier})...`);

  try {
    // Call provision edge function
    const { data, error } = await supabase.functions.invoke(
      'provision-user-fly-app',
      {
        body: { user_id: userId, tier },
      }
    );

    if (error) {
      console.error(`  ✗ Failed to migrate ${userId}:`, error);
      return { success: false, error };
    }

    console.log(`  ✓ Migrated ${userId} to app: ${data.app_name}`);
    return { success: true, appName: data.app_name };
  } catch (error) {
    console.error(`  ✗ Exception migrating ${userId}:`, error);
    return { success: false, error };
  }
}

async function main() {
  console.log('===========================================');
  console.log('Pro/Elite User Migration to Dedicated Apps');
  console.log('===========================================\n');

  // Get all Pro/Elite users
  const { data: users, error } = await supabase
    .from('user_subscriptions')
    .select(`
      user_id,
      tier,
      user_profiles!inner(email)
    `)
    .in('tier', ['pro', 'elite'])
    .eq('status', 'active');

  if (error) {
    console.error('Failed to fetch users:', error);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('No Pro/Elite users found to migrate.');
    return;
  }

  console.log(`Found ${users.length} Pro/Elite users to migrate\n`);

  const results = {
    success: 0,
    failed: 0,
    errors: [] as any[],
  };

  // Migrate in batches of 5 (avoid rate limits)
  const batchSize = 5;
  for (let i = 0; i < users.length; i += batchSize) {
    const batch = users.slice(i, i + batchSize);

    console.log(`\n--- Batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(users.length / batchSize)} ---`);

    const batchResults = await Promise.all(
      batch.map(async (user: any) => {
        const result = await migrateUser(user.user_id, user.tier);

        if (result.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({
            user_id: user.user_id,
            email: user.user_profiles?.email,
            tier: user.tier,
            error: result.error,
          });
        }

        return result;
      })
    );

    // Wait 10 seconds between batches
    if (i + batchSize < users.length) {
      console.log('\nWaiting 10 seconds before next batch...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }

  console.log('\n===========================================');
  console.log('Migration Complete');
  console.log('===========================================');
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);

  if (results.errors.length > 0) {
    console.log('\n--- Failed Migrations ---');
    results.errors.forEach((err) => {
      console.log(`  ✗ ${err.email} (${err.user_id}) [${err.tier}]`);
      console.log(`    Error: ${err.error.message || JSON.stringify(err.error)}`);
    });
  }

  console.log('\nDone!');
}

// Run the migration
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
