# Custom Signals User Filtering & Click Handler Fix

## Metadata
- **Status:** 🎯 idea
- **Created:** 2025-01-19 15:30:00
- **Updated:** 2025-01-19 15:30:00
- **Priority:** Critical
- **Type:** bug
- **Progress:** [██        ] 20%

---

## Idea Review
*Stage: idea | Date: 2025-01-19 15:30:00*

### Original Idea
Fix multiple related issues with custom signals:
1. Custom signals are not clickable due to incorrect field reference (`created_by` vs `user_id`)
2. "My Signals" section shows ALL users' custom signals instead of just the logged-in user's signals
3. Edit/delete permission check uses non-existent `createdBy` field

### Enhanced Concept
Implement proper user-scoped signal management with correct data field references. This ensures users only see and can interact with their own custom signals while maintaining proper access control for built-in signals. The fix involves correcting field references and adding user-based filtering to create a true "My Signals" experience that respects data privacy and ownership.

### Target Users
- **Primary:** Pro/Elite tier traders who create custom signals
- **Secondary:** Teams sharing a workspace who need signal isolation
- **Edge Case:** Admin users who need to see all signals for management

### Domain Context
In crypto trading platforms, signal ownership and privacy are critical:
- Traders invest significant time developing proprietary strategies
- Signal leakage to other users could compromise competitive advantage
- Proper filtering prevents information overload from irrelevant signals
- Clear ownership enables proper attribution and performance tracking

### Current Issues Discovered

#### Issue 1: Field Reference Mismatch
- **Location:** `traderManager.ts` line 398
- **Problem:** Checking `data.created_by` which doesn't exist
- **Reality:** Database uses `user_id` field
- **Impact:** Custom signals get wrong access tier, Pro users can't click their signals

#### Issue 2: No User Filtering
- **Location:** `traderManager.ts` line 34-36
- **Problem:** Loads ALL traders without user filtering
- **Impact:** All users see everyone's custom signals

#### Issue 3: Permission Check Field Error
- **Location:** `TraderList.tsx` line 229
- **Problem:** References `trader.createdBy` which doesn't exist
- **Should be:** `trader.userId`

### Suggestions for Improvement

1. **Immediate Fixes:**
   - Change `data.created_by` to `data.user_id` in access tier logic
   - Fix `trader.createdBy` to `trader.userId` for permissions
   - Add user filtering to show only owned signals

2. **Enhanced Security:**
   - Server-side RLS (Row Level Security) to prevent data leaks
   - Audit trail for signal access attempts
   - Encryption for proprietary signal logic

3. **Better UX:**
   - Clear visual distinction between "My Signals" and shared signals
   - Signal sharing controls for team collaboration (future)
   - Export/import functionality for signal backup

### Critical Questions

#### Domain Workflow
1. Should users ever see other users' custom signals (e.g., for teams)?
   - **Why it matters:** Determines if we need sharing permissions
   - **Recommendation:** Start with strict isolation, add sharing in v2

#### User Needs
2. Do Pro users expect to share signals with their team members?
   - **Why it matters:** Affects database schema and permissions model
   - **Recommendation:** Survey existing Pro users before adding complexity

#### Technical Requirements
3. Should filtering happen client-side or server-side?
   - **Why it matters:** Security and performance implications
   - **Recommendation:** Server-side with RLS for security, client-side for UX

#### Integration
4. How should this work with the existing favorites system?
   - **Why it matters:** Users might favorite others' signals if shared
   - **Recommendation:** Favorites should only apply to accessible signals

#### Compliance/Standards
5. Are there data privacy regulations for financial signals?
   - **Why it matters:** GDPR/CCPA may apply to strategy data
   - **Recommendation:** Treat signals as PII, implement proper deletion

### Success Criteria
- [x] Root cause identified (incorrect field references)
- [ ] Custom signals clickable for their owners
- [ ] "My Signals" shows only user's own signals
- [ ] Edit/delete permissions work correctly
- [ ] No regression in built-in signal access

### Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Data exposure during migration | High | Test in staging first, backup before deploy |
| Breaking existing signals | High | Preserve backward compatibility |
| Performance impact of filtering | Low | Index on user_id field |

### Recommended Next Steps
1. Apply field reference fixes immediately (low risk)
2. Test with multiple user accounts
3. Implement proper user filtering
4. Add database indexes if needed
5. Consider RLS for future security enhancement

### Priority Assessment
**Urgency:** Critical (security/privacy issue)
**Impact:** High (affects all Pro/Elite users)
**Effort:** Small (field references) to Medium (user filtering)
**Recommendation:** Proceed immediately with phased approach

### Implementation Status

#### Completed
- ✅ Identified root cause: `created_by` should be `user_id`
- ✅ Found all affected code locations
- ✅ Applied initial fix to `traderManager.ts`

#### In Progress
- 🔄 Testing the field reference fix
- 🔄 Adding debug logging

#### Pending
- ⏳ Implement user-based filtering
- ⏳ Fix permission check field reference
- ⏳ Test with multiple user accounts
- ⏳ Remove debug logging
- ⏳ Final testing and validation

---
*[End of idea review. Next: /spec issues/2025-01-19-custom-signals-user-filtering.md]*