# Prompt Manager Setup Guide

## Overview
The Prompt Manager allows admin users to manage AI prompts used throughout the application. It supports database-backed prompts with version history and fallback to emergency prompts when the database is unavailable.

## Prerequisites
1. Supabase project with proper environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Admin access (email: tom@tomk.ca)

## Database Setup

### 1. Run the Migration
Execute the SQL migration to create the required tables:

```sql
-- Location: /supabase/migrations/001_create_prompt_tables.sql
-- This creates:
-- - prompts table: Stores prompt templates
-- - prompt_versions table: Stores version history
-- - Proper indexes and RLS policies
```

### 2. Apply Migration in Supabase
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Paste and run the migration script
4. Verify tables are created in Table Editor

## Troubleshooting

### Issue: "Using Emergency Prompts" Warning
This indicates the system couldn't load prompts from the database and is using local fallback prompts.

**Possible Causes:**
1. **Missing Environment Variables**: Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
2. **Database Tables Not Created**: Run the migration script
3. **Network Issues**: Check Supabase service status
4. **RLS Policies**: Ensure you're logged in as the admin user

**Solution Steps:**
1. Check browser console for specific error messages
2. Verify environment variables are loaded: `console.log(import.meta.env)`
3. Test Supabase connection in browser console:
   ```javascript
   // Check if Supabase is configured
   console.log(window.supabase !== null)
   ```
4. Click "Retry Database Connection" button in the UI

### Emergency Prompts Behavior
- Emergency prompts are read-only fallbacks
- Changes made to emergency prompts will NOT be persisted
- Located in `/public/emergency-prompts.json`
- Automatically loaded when database is unavailable

## Features

### When Database is Connected
- Full CRUD operations on prompts
- Version history tracking
- Rollback to previous versions
- Persistent changes

### When Using Emergency Prompts
- Read-only mode
- Warning banner displayed
- Save operations disabled
- Retry connection option available

## Architecture

### Data Flow
1. `PromptManager` component loads on `/admin/prompts` route
2. Calls `promptManager.getAllPrompts()` service method
3. Service attempts database load via Supabase
4. Falls back to emergency prompts if database fails
5. UI displays appropriate state and warnings

### Key Files
- `/src/components/admin/PromptManager.tsx` - UI component
- `/src/services/promptManager.ts` - Service layer
- `/supabase/migrations/001_create_prompt_tables.sql` - Database schema
- `/public/emergency-prompts.json` - Fallback prompts

## Best Practices
1. Always test prompt changes in a development environment first
2. Use descriptive commit messages when saving prompt versions
3. Regularly backup prompt configurations
4. Monitor the browser console for any database connection issues