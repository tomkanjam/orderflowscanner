package trader

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

// Prometheus metrics for trader system
var (
	// Trader lifecycle metrics
	TradersTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "traders_total",
			Help: "Total number of traders registered",
		},
		[]string{"user_id"},
	)

	TradersActive = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "traders_active",
			Help: "Number of currently active traders",
		},
		[]string{"state"},
	)

	TraderStateTransitions = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "trader_state_transitions_total",
			Help: "Total number of state transitions",
		},
		[]string{"from", "to"},
	)

	TraderErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "trader_errors_total",
			Help: "Total number of trader errors",
		},
		[]string{"trader_id", "error_type"},
	)

	// Execution metrics
	TraderExecutions = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "trader_executions_total",
			Help: "Total number of trader executions",
		},
		[]string{"trader_id"},
	)

	TraderExecutionDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "trader_execution_duration_seconds",
			Help:    "Duration of trader executions",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"trader_id"},
	)

	TraderExecutionErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "trader_execution_errors_total",
			Help: "Total number of execution errors",
		},
		[]string{"trader_id", "error_type"},
	)

	// Signal metrics
	SignalsGenerated = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "signals_generated_total",
			Help: "Total number of signals generated",
		},
		[]string{"trader_id", "symbol"},
	)

	SignalsPersisted = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "signals_persisted_total",
			Help: "Total number of signals successfully persisted",
		},
		[]string{"trader_id"},
	)

	SignalPersistErrors = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "signal_persist_errors_total",
			Help: "Total number of signal persistence errors",
		},
		[]string{"trader_id", "error_type"},
	)

	// Resource metrics
	QuotaAcquisitions = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "quota_acquisitions_total",
			Help: "Total number of quota acquisitions",
		},
		[]string{"user_id", "tier"},
	)

	QuotaReleases = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "quota_releases_total",
			Help: "Total number of quota releases",
		},
		[]string{"user_id", "tier"},
	)

	QuotaRejections = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "quota_rejections_total",
			Help: "Total number of quota rejections",
		},
		[]string{"user_id", "tier", "reason"},
	)

	QuotaUsage = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "quota_usage",
			Help: "Current quota usage",
		},
		[]string{"user_id", "tier"},
	)

	QuotaLimit = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "quota_limit",
			Help: "Quota limit for tier",
		},
		[]string{"tier"},
	)

	// Pool metrics
	PoolSize = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "pool_size",
			Help: "Maximum goroutine pool size",
		},
	)

	PoolUsage = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "pool_usage",
			Help: "Current goroutine pool usage",
		},
	)

	// Registry metrics
	RegistrySize = promauto.NewGauge(
		prometheus.GaugeOpts{
			Name: "registry_size",
			Help: "Number of traders in registry",
		},
	)

	RegistryCleanups = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "registry_cleanups_total",
			Help: "Total number of registry cleanup operations",
		},
	)

	RegistryCleanupDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "registry_cleanup_duration_seconds",
			Help:    "Duration of registry cleanup operations",
			Buckets: prometheus.DefBuckets,
		},
	)

	// Trader loading metrics
	TradersLoadedFromDB = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "traders_loaded_from_db_total",
			Help: "Total number of traders loaded from database",
		},
		[]string{"status"}, // success, failed
	)

	TradersLoadDuration = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "traders_load_duration_seconds",
			Help:    "Duration of LoadTradersFromDB operation",
			Buckets: prometheus.DefBuckets,
		},
	)
)

// RecordStateTransition records a state transition metric
func RecordStateTransition(from, to TraderState) {
	TraderStateTransitions.WithLabelValues(string(from), string(to)).Inc()
}

// RecordError records an error metric
func RecordError(traderID, errorType string) {
	TraderErrors.WithLabelValues(traderID, errorType).Inc()
}

// RecordExecution records an execution metric
func RecordExecution(traderID string, duration float64) {
	TraderExecutions.WithLabelValues(traderID).Inc()
	TraderExecutionDuration.WithLabelValues(traderID).Observe(duration)
}

// RecordExecutionError records an execution error
func RecordExecutionError(traderID, errorType string) {
	TraderExecutionErrors.WithLabelValues(traderID, errorType).Inc()
}

// RecordSignal records a signal generation metric
func RecordSignal(traderID, symbol string) {
	SignalsGenerated.WithLabelValues(traderID, symbol).Inc()
}

// RecordSignalPersisted records a successful signal persistence
func RecordSignalPersisted(traderID string) {
	SignalsPersisted.WithLabelValues(traderID).Inc()
}

// RecordSignalPersistError records a signal persistence error
func RecordSignalPersistError(traderID, errorType string) {
	SignalPersistErrors.WithLabelValues(traderID, errorType).Inc()
}

// RecordQuotaAcquisition records a quota acquisition
func RecordQuotaAcquisition(userID, tier string) {
	QuotaAcquisitions.WithLabelValues(userID, tier).Inc()
}

// RecordQuotaRelease records a quota release
func RecordQuotaRelease(userID, tier string) {
	QuotaReleases.WithLabelValues(userID, tier).Inc()
}

// RecordQuotaRejection records a quota rejection
func RecordQuotaRejection(userID, tier, reason string) {
	QuotaRejections.WithLabelValues(userID, tier, reason).Inc()
}

// UpdateQuotaUsage updates current quota usage
func UpdateQuotaUsage(userID, tier string, usage float64) {
	QuotaUsage.WithLabelValues(userID, tier).Set(usage)
}

// UpdateQuotaLimit updates quota limit for a tier
func UpdateQuotaLimit(tier string, limit float64) {
	QuotaLimit.WithLabelValues(tier).Set(limit)
}

// UpdatePoolMetrics updates pool size and usage
func UpdatePoolMetrics(size, usage float64) {
	PoolSize.Set(size)
	PoolUsage.Set(usage)
}

// UpdateRegistrySize updates registry size
func UpdateRegistrySize(size float64) {
	RegistrySize.Set(size)
}

// RecordRegistryCleanup records a registry cleanup operation
func RecordRegistryCleanup(duration float64) {
	RegistryCleanups.Inc()
	RegistryCleanupDuration.Observe(duration)
}
