# Supabase Magic Link Authentication Implementation Plan

## Overview
Implement Supabase magic link authentication in the existing codebase without disrupting current features. The implementation will be done incrementally with testing at each step.

## Implementation Steps

### Step 1: Supabase Setup and Configuration
**Files to create/modify:**
- `.env.local` - Add Supabase credentials
- `src/config/supabase.ts` - Initialize Supabase client
- `src/types/auth.types.ts` - TypeScript interfaces

**Tasks:**
1. Add Supabase dependency to package.json
2. Create Supabase configuration file
3. Set up environment variables
4. Define auth-related TypeScript types

**Testing:**
- Verify Supabase client initializes without errors
- Check environment variables are loaded correctly

### Step 2: Auth Context and Hook
**Files to create/modify:**
- `src/contexts/AuthContext.tsx` - Auth provider and context
- `src/hooks/useAuth.ts` - Auth hook for components

**Tasks:**
1. Create AuthContext with user state
2. Implement login/logout methods
3. Handle session persistence
4. Create useAuth hook for easy access

**Testing:**
- Verify context provides user state
- Test session persistence on page reload
- Ensure logout clears session

### Step 3: Email Auth Modal Component
**Files to create/modify:**
- `src/components/auth/EmailAuthModal.tsx` - Modal for email entry
- Update existing `Modal` component if needed

**Tasks:**
1. Create email input form
2. Handle magic link sending
3. Show loading/success/error states
4. Style to match TradeMind design system

**Testing:**
- Test email validation
- Verify magic link sends successfully
- Check modal opens/closes properly

### Step 4: Integrate Auth with AI Screener
**Files to modify:**
- `App.tsx` - Add auth check to handleRunAiScreener
- Add AuthProvider wrapper

**Tasks:**
1. Wrap App in AuthProvider
2. Check auth before running AI screener
3. Store pending prompt if not authenticated
4. Show auth modal when needed
5. Auto-run screener after successful auth

**Testing:**
- Test screener blocks when not authenticated
- Verify pending prompt executes after auth
- Ensure existing functionality works for authenticated users

### Step 5: Add User Info to Sidebar
**Files to modify:**
- `components/Sidebar.tsx` - Add user section

**Tasks:**
1. Add user email display at bottom
2. Add sign out button
3. Style to match TradeMind design
4. Only show when user is authenticated

**Testing:**
- Verify user info displays correctly
- Test sign out functionality
- Check responsive design

### Step 6: Handle Auth Redirects
**Files to modify:**
- `App.tsx` - Add redirect handler

**Tasks:**
1. Handle magic link callback URL
2. Extract token from URL hash
3. Clean up URL after authentication
4. Execute pending actions after auth

**Testing:**
- Test magic link redirect flow
- Verify URL cleanup
- Check pending actions execute

### Step 7: Error Handling and Edge Cases
**Tasks:**
1. Handle expired magic links
2. Add retry logic for failed requests
3. Show appropriate error messages
4. Handle network errors gracefully

**Testing:**
- Test with expired links
- Simulate network failures
- Verify error messages are user-friendly

## Implementation Order

1. **Day 1: Foundation**
   - Step 1: Supabase Setup ✓
   - Step 2: Auth Context ✓
   - Test basic auth flow

2. **Day 2: UI Components**
   - Step 3: Email Auth Modal ✓
   - Step 5: Sidebar Integration ✓
   - Test UI interactions

3. **Day 3: Integration**
   - Step 4: AI Screener Integration ✓
   - Step 6: Redirect Handling ✓
   - End-to-end testing

4. **Day 4: Polish**
   - Step 7: Error Handling ✓
   - Performance optimization
   - Final testing and deployment

## Key Considerations

1. **Preserve Existing Features**
   - All current functionality must work unchanged
   - Auth should be non-intrusive for the flow

2. **Maintain Design Consistency**
   - Use TradeMind design system colors and styles
   - Match existing UI patterns

3. **Security Best Practices**
   - Never expose Supabase service key
   - Use Row Level Security (RLS) if needed
   - Validate all user inputs

4. **Performance**
   - Lazy load auth components
   - Cache auth state appropriately
   - Minimize auth check overhead

## Success Criteria

- [ ] Users can sign in with email magic link
- [ ] Sessions persist across page reloads
- [ ] AI screener requires authentication
- [ ] Pending prompts execute after auth
- [ ] Sign out works correctly
- [ ] No regression in existing features
- [ ] Clean, maintainable code
- [ ] Comprehensive error handling

## Reference Code

The closed PR #1 contains working implementation that can be used as reference, but we'll adapt it to work with the current codebase structure.