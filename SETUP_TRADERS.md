# Setting Up the Traders System

## 1. Apply Supabase Migration

The traders system requires new database tables. You need to run the migration to create them.

### Option A: Using Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Create a new query
4. Copy and paste the entire contents of `supabase/migrations/001_create_traders_tables.sql`
5. Run the query

### Option B: Using Supabase CLI
If you have the Supabase CLI installed:
```bash
supabase db push
```

## 2. Verify Tables Were Created

After running the migration, verify the following tables exist:
- `traders` - Stores trader configurations
- `exchange_credentials` - For future exchange integration
- `trade_audit_log` - For compliance and auditing

You can verify in the Supabase dashboard under Table Editor.

## 3. Test the System

1. Refresh your app
2. You should see a "Traders" section in the sidebar
3. Click "Create" to add your first trader
4. Try creating a trader with AI: "Create a momentum trader that buys breakouts"

## Troubleshooting

If you see "relation public.traders does not exist" error:
- Make sure you ran the migration
- Check that you're connected to the correct Supabase project
- Verify your environment variables are set correctly

If traders aren't saving:
- Check the Supabase dashboard for any RLS policy issues
- Make sure you're authenticated (traders require authentication)