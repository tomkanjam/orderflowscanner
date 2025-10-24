package trader

import (
	"fmt"
	"sync"

	"github.com/vyx/go-screener/pkg/types"
	"golang.org/x/sync/semaphore"
)

// QuotaManager manages resource quotas for traders
type QuotaManager struct {
	// Global limit
	globalSemaphore *semaphore.Weighted
	globalMax       int64

	// Per-user limits
	userSemaphores sync.Map // map[userID]*semaphore.Weighted
	tierLimits     map[types.SubscriptionTier]int64

	// Metrics
	mu              sync.RWMutex
	totalAcquired   int64
	totalReleased   int64
	quotaRejections int64
}

// NewQuotaManager creates a new quota manager
func NewQuotaManager(globalMax int64) *QuotaManager {
	return &QuotaManager{
		globalSemaphore: semaphore.NewWeighted(globalMax),
		globalMax:       globalMax,
		tierLimits: map[types.SubscriptionTier]int64{
			types.TierAnonymous: 0,  // Cannot start traders
			types.TierFree:      0,  // Cannot start traders
			types.TierPro:       10, // Max 10 concurrent traders
			types.TierElite:     0,  // Unlimited (checked separately)
		},
	}
}

// Acquire attempts to acquire quota for a user
// Returns error if quota exceeded
func (q *QuotaManager) Acquire(userID string, tier types.SubscriptionTier) error {
	// Check tier limits first
	limit, exists := q.tierLimits[tier]
	if !exists {
		return fmt.Errorf("unknown subscription tier: %s", tier)
	}

	// Elite tier has unlimited traders (skip per-user check)
	if tier != types.TierElite {
		// Free and Anonymous cannot start traders
		if limit == 0 {
			q.recordRejectionWithReason(userID, string(tier), "tier_blocked")
			return fmt.Errorf("subscription tier %s cannot start traders", tier)
		}

		// Check per-user quota
		userSem := q.getUserSemaphore(userID, limit)
		if !userSem.TryAcquire(1) {
			q.recordRejectionWithReason(userID, string(tier), "user_quota_exceeded")
			return fmt.Errorf("user quota exceeded: max %d concurrent traders for %s tier", limit, tier)
		}
	}

	// Check global quota
	if !q.globalSemaphore.TryAcquire(1) {
		// Release user quota if we acquired it
		if tier != types.TierElite && limit > 0 {
			userSem := q.getUserSemaphore(userID, limit)
			userSem.Release(1)
		}

		q.recordRejectionWithReason(userID, string(tier), "global_quota_exceeded")
		return fmt.Errorf("global quota exceeded: max %d concurrent traders across all users", q.globalMax)
	}

	// Record acquisition
	q.mu.Lock()
	q.totalAcquired++
	q.mu.Unlock()

	// Record metrics
	RecordQuotaAcquisition(userID, string(tier))

	// Update quota usage gauge
	current, max := q.GetUsage(userID, tier)
	UpdateQuotaUsage(userID, string(tier), float64(current))
	if max > 0 {
		UpdateQuotaLimit(string(tier), float64(max))
	}

	return nil
}

// Release releases quota for a user
func (q *QuotaManager) Release(userID string, tier types.SubscriptionTier) {
	// Release global quota
	q.globalSemaphore.Release(1)

	// Release per-user quota (if not Elite)
	if tier != types.TierElite {
		if limit, exists := q.tierLimits[tier]; exists && limit > 0 {
			userSem := q.getUserSemaphore(userID, limit)
			userSem.Release(1)
		}
	}

	// Record release
	q.mu.Lock()
	q.totalReleased++
	q.mu.Unlock()

	// Record metrics
	RecordQuotaRelease(userID, string(tier))

	// Update quota usage gauge
	current, max := q.GetUsage(userID, tier)
	UpdateQuotaUsage(userID, string(tier), float64(current))
	if max > 0 {
		UpdateQuotaLimit(string(tier), float64(max))
	}
}

// GetUsage returns current usage for a user
func (q *QuotaManager) GetUsage(userID string, tier types.SubscriptionTier) (current, max int64) {
	limit, exists := q.tierLimits[tier]
	if !exists || limit == 0 {
		return 0, 0
	}

	if tier == types.TierElite {
		return 0, 0 // Unlimited
	}

	userSem := q.getUserSemaphore(userID, limit)

	// Try to acquire 0 slots to check current usage
	// This is a hack - we count by trying to acquire the max and seeing how many we can get
	acquired := int64(0)
	for i := int64(0); i < limit; i++ {
		if userSem.TryAcquire(1) {
			acquired++
		} else {
			break
		}
	}

	// Release what we acquired
	if acquired > 0 {
		userSem.Release(acquired)
	}

	current = limit - acquired
	return current, limit
}

// GetGlobalUsage returns current global usage
func (q *QuotaManager) GetGlobalUsage() (current, max int64) {
	// Try to acquire to check usage
	acquired := int64(0)
	for i := int64(0); i < q.globalMax; i++ {
		if q.globalSemaphore.TryAcquire(1) {
			acquired++
		} else {
			break
		}
	}

	// Release what we acquired
	if acquired > 0 {
		q.globalSemaphore.Release(acquired)
	}

	current = q.globalMax - acquired
	return current, q.globalMax
}

// GetMetrics returns quota metrics
func (q *QuotaManager) GetMetrics() map[string]interface{} {
	q.mu.RLock()
	defer q.mu.RUnlock()

	currentGlobal, maxGlobal := q.GetGlobalUsage()

	return map[string]interface{}{
		"global_current":    currentGlobal,
		"global_max":        maxGlobal,
		"total_acquired":    q.totalAcquired,
		"total_released":    q.totalReleased,
		"quota_rejections":  q.quotaRejections,
	}
}

// getUserSemaphore gets or creates a semaphore for a user
func (q *QuotaManager) getUserSemaphore(userID string, limit int64) *semaphore.Weighted {
	// Try to load existing semaphore
	if sem, ok := q.userSemaphores.Load(userID); ok {
		return sem.(*semaphore.Weighted)
	}

	// Create new semaphore
	sem := semaphore.NewWeighted(limit)
	actual, loaded := q.userSemaphores.LoadOrStore(userID, sem)
	if loaded {
		// Another goroutine created it first, use that one
		return actual.(*semaphore.Weighted)
	}

	return sem
}

// recordRejection increments the rejection counter
func (q *QuotaManager) recordRejection() {
	q.mu.Lock()
	q.quotaRejections++
	q.mu.Unlock()
}

// recordRejectionWithMetrics records rejection with Prometheus metrics
func (q *QuotaManager) recordRejectionWithReason(userID, tier, reason string) {
	q.recordRejection()
	RecordQuotaRejection(userID, tier, reason)
}

// SetTierLimit updates the limit for a tier (for testing or dynamic configuration)
func (q *QuotaManager) SetTierLimit(tier types.SubscriptionTier, limit int64) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.tierLimits[tier] = limit
}
