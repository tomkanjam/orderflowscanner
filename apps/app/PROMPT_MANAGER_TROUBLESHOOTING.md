# Prompt Manager Troubleshooting Guide

## Issue: Admin Prompt Manager Shows Emergency Prompts Instead of Database Prompts

### Problem Description
The admin prompt manager at `/admin/prompts` is displaying emergency prompts from `/emergency-prompts.json` instead of real database prompts. This indicates the database loading is failing and falling back to emergency prompts.

### Root Cause Analysis

1. **Database Seed Issue**: The `005_seed_prompts_complete.sql` migration contains placeholder text `[FULL PROMPT CONTENT - SEE 005_seed_prompts.sql]` instead of actual prompt content.

2. **Data Flow**:
   - `promptManager.ts` tries to load prompts from the database
   - If loading fails (due to empty/truncated prompts), it falls back to emergency prompts
   - The admin UI shows whatever is in the prompt cache (emergency prompts in this case)

### Solution Steps

#### 1. Check Database Status
Run the `debug-prompts.sql` script in your Supabase SQL editor:

```sql
-- This will show you:
-- - If tables exist
-- - How many prompts are in the database
-- - Which prompts are truncated
-- - Any RLS policy issues
```

#### 2. Fix Truncated Prompts
Run the `fix-prompts.sql` script in your Supabase SQL editor. This will update the prompts with their full content.

#### 3. Verify the Fix
1. Refresh the admin prompt manager page
2. Check for the yellow "Using Emergency Prompts" warning - it should be gone
3. Verify that prompts now show proper content instead of placeholder text

#### 4. If Still Showing Emergency Prompts

1. **Check Supabase Connection**:
   - Verify `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set in `.env.local`
   - Check browser console for any Supabase connection errors

2. **Check RLS Policies**:
   - Ensure the prompts table has proper RLS policies
   - Admin user (tom@tomk.ca) should have read access

3. **Manual Database Check**:
   ```sql
   -- Check if prompts exist and are active
   SELECT id, name, is_active, LENGTH(system_instruction) as length
   FROM prompts
   WHERE is_active = true;
   ```

4. **Force Reload**:
   - Click the "Retry Database Connection" button in the yellow warning
   - Or reload the page with Cmd+Shift+R (hard refresh)

### Prevention

1. **Always use full migrations**: Don't use placeholder text in seed files
2. **Test migrations locally**: Run migrations in a local Supabase instance first
3. **Monitor the console**: The promptManager logs detailed error messages

### Emergency Prompt Fallback

The emergency prompt fallback is a safety feature that ensures the app can still function even if the database is unavailable. However, changes made to emergency prompts are not persisted.

### Code Improvements Made

1. **Better Error Reporting**: Added `loadingError` tracking to promptManager
2. **Status Method**: Added `getStatus()` method for UI to check loading state
3. **Proper Type Conversion**: Fixed mapping between database fields and TypeScript types
4. **Update Base Prompt**: When saving overrides, also update the base prompt

### Files Involved

- `/src/services/promptManager.ts` - Main service handling prompt loading
- `/src/components/admin/PromptManager.tsx` - Admin UI component
- `/src/config/supabase.ts` - Database configuration
- `/public/emergency-prompts.json` - Fallback prompts
- `/supabase/migrations/004_create_prompts_tables.sql` - Table schema
- `/supabase/migrations/005_seed_prompts.sql` - Full prompt content
- `/supabase/migrations/005_seed_prompts_complete.sql` - Truncated version (needs fixing)