# Implementation Plan: Move Admin Dashboard Link to Dropdown Menu

## Objective
Move the Admin Dashboard link from its standalone position in the sidebar to the account dropdown menu, ensuring it only appears for admin users.

## Current State
- Admin Dashboard link: Lines 163-176 in `apps/app/components/Sidebar.tsx` (standalone section)
- Account dropdown: Lines 200-221 containing Account Dashboard and Logout

## Implementation Tasks

### Task 1: Remove Standalone Admin Dashboard Section
**File**: `apps/app/components/Sidebar.tsx`
**Lines to remove**: 162-176
**Test**: Verify no Admin Dashboard appears in the main sidebar area

### Task 2: Add Admin Dashboard to Dropdown Menu
**File**: `apps/app/components/Sidebar.tsx`
**Location**: Inside the dropdown menu div (after line 201)
**Changes**:
1. Add conditional Admin Dashboard link for admin users
2. Add separator between Admin Dashboard and Account Dashboard
3. Maintain existing Account Dashboard and Logout buttons

**Test**: 
- As admin: Verify Admin Dashboard appears in dropdown
- As non-admin: Verify Admin Dashboard does NOT appear

### Task 3: Build and Type Check
**Command**: `pnpm build`
**Expected**: No TypeScript errors, successful build

### Task 4: Visual Verification
**Tests**:
1. Click user menu to open dropdown
2. Verify correct order: Admin Dashboard → Account Dashboard → Logout
3. Verify hover states work correctly
4. Verify click navigation to `/admin` works
5. Verify separator styling between sections

## Code Structure

```tsx
{showUserMenu && (
  <div className="dropdown-container">
    {/* Admin Dashboard - Admin only */}
    {isAdmin && (
      <a href="/admin">Admin Dashboard</a>
    )}
    
    {/* Account Dashboard - All users */}
    <a href="/account" className={isAdmin ? 'with-border' : ''}>
      Account Dashboard
    </a>
    
    {/* Logout - All users */}
    <button>Logout</button>
  </div>
)}
```

## Success Criteria
- [ ] No duplicate Admin Dashboard links
- [ ] Admin Dashboard only visible to admin users
- [ ] Dropdown menu maintains proper styling
- [ ] All links functional
- [ ] Build passes without errors