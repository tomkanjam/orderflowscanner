# Grafana Dashboard for Filter Code Execution Monitoring

## Quick Access
- **Grafana URL**: https://fly.io/apps/vyx-user-35682909/metrics
- **Metrics Endpoint**: Your app exposes Prometheus metrics on `/metrics`

## Available Prometheus Metrics for Filter Execution

### Execution Metrics
1. **`trader_executions_total{trader_id}`** - Total executions per trader
2. **`trader_execution_duration_seconds{trader_id}`** - Execution time histogram
3. **`trader_execution_errors_total{trader_id, error_type}`** - Execution errors

### Signal Metrics
4. **`signals_generated_total{trader_id, symbol}`** - Signals created
5. **`signals_persisted_total{trader_id}`** - Signals saved to DB
6. **`signal_persist_errors_total{trader_id, error_type}`** - Signal save failures

### Error Metrics
7. **`trader_errors_total{trader_id, error_type}`** - All trader errors
8. **`traders_loaded_from_db_total{status}`** - DB load success/failure

### Resource Metrics
9. **`pool_usage`** / **`pool_size`** - Worker pool utilization
10. **`registry_size`** - Number of active traders

---

## Grafana Dashboard JSON

Save this as a JSON file and import it into Grafana:

```json
{
  "dashboard": {
    "title": "Filter Execution Monitoring",
    "tags": ["trading", "filters", "execution"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "Filter Execution Error Rate",
        "type": "graph",
        "gridPos": { "x": 0, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(trader_execution_errors_total[5m])",
            "legendFormat": "{{trader_id}} - {{error_type}}"
          }
        ],
        "alert": {
          "name": "High Filter Execution Error Rate",
          "conditions": [
            {
              "evaluator": { "type": "gt", "params": [0.1] },
              "operator": { "type": "and" },
              "query": { "params": ["A", "5m", "now"] },
              "reducer": { "type": "avg" },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "frequency": "1m",
          "handler": 1,
          "message": "Filter execution error rate exceeded threshold",
          "noDataState": "no_data",
          "for": "5m"
        }
      },
      {
        "id": 2,
        "title": "Filter Execution Duration (p95)",
        "type": "graph",
        "gridPos": { "x": 12, "y": 0, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(trader_execution_duration_seconds_bucket[5m]))",
            "legendFormat": "{{trader_id}} - p95"
          }
        ]
      },
      {
        "id": 3,
        "title": "Signal Generation vs Persistence",
        "type": "graph",
        "gridPos": { "x": 0, "y": 8, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(signals_generated_total[5m])",
            "legendFormat": "Generated - {{trader_id}}"
          },
          {
            "expr": "rate(signals_persisted_total[5m])",
            "legendFormat": "Persisted - {{trader_id}}"
          }
        ]
      },
      {
        "id": 4,
        "title": "Signal Persistence Errors",
        "type": "graph",
        "gridPos": { "x": 12, "y": 8, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(signal_persist_errors_total[5m])",
            "legendFormat": "{{trader_id}} - {{error_type}}"
          }
        ],
        "alert": {
          "name": "Signal Persistence Failures",
          "conditions": [
            {
              "evaluator": { "type": "gt", "params": [5] },
              "operator": { "type": "and" },
              "query": { "params": ["A", "5m", "now"] },
              "reducer": { "type": "sum" },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "frequency": "1m",
          "handler": 1,
          "message": "Multiple signal persistence failures detected",
          "noDataState": "no_data",
          "for": "5m"
        }
      },
      {
        "id": 5,
        "title": "Trader Errors by Type",
        "type": "graph",
        "gridPos": { "x": 0, "y": 16, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(trader_errors_total[5m])",
            "legendFormat": "{{error_type}} - {{trader_id}}"
          }
        ]
      },
      {
        "id": 6,
        "title": "Worker Pool Utilization",
        "type": "gauge",
        "gridPos": { "x": 12, "y": 16, "w": 6, "h": 8 },
        "targets": [
          {
            "expr": "pool_usage / pool_size * 100",
            "legendFormat": "Pool Usage %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 70, "color": "yellow" },
                { "value": 90, "color": "red" }
              ]
            }
          }
        }
      },
      {
        "id": 7,
        "title": "Active Traders",
        "type": "stat",
        "gridPos": { "x": 18, "y": 16, "w": 6, "h": 8 },
        "targets": [
          {
            "expr": "registry_size",
            "legendFormat": "Active Traders"
          }
        ]
      },
      {
        "id": 8,
        "title": "Trader Load Failures",
        "type": "graph",
        "gridPos": { "x": 0, "y": 24, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(traders_loaded_from_db_total{status=\"failed\"}[5m])",
            "legendFormat": "Load Failures"
          }
        ]
      },
      {
        "id": 9,
        "title": "Execution Success Rate",
        "type": "stat",
        "gridPos": { "x": 12, "y": 24, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "(rate(trader_executions_total[5m]) - rate(trader_execution_errors_total[5m])) / rate(trader_executions_total[5m]) * 100",
            "legendFormat": "Success Rate %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 95, "color": "yellow" },
                { "value": 99, "color": "green" }
              ]
            }
          }
        }
      }
    ],
    "refresh": "30s",
    "time": { "from": "now-1h", "to": "now" }
  }
}
```

---

## Key Queries for Filter Problems

### 1. **Filters with High Error Rates**
```promql
# Show filters with error rate > 10%
(
  rate(trader_execution_errors_total[5m])
  /
  rate(trader_executions_total[5m])
) * 100 > 10
```

### 2. **Slow Filter Executions**
```promql
# Show p95 execution time per trader (slow if > 5s)
histogram_quantile(0.95,
  rate(trader_execution_duration_seconds_bucket[5m])
) > 5
```

### 3. **Signal Persistence Issues**
```promql
# Signal generation vs persistence gap
rate(signals_generated_total[5m])
-
rate(signals_persisted_total[5m])
```

### 4. **Filter Code Compilation/Runtime Errors**
```promql
# Group execution errors by type
sum by (error_type) (
  rate(trader_execution_errors_total[5m])
)
```

### 5. **Database Timeout Detection**
```promql
# Signal persist errors specifically for timeouts
rate(signal_persist_errors_total{error_type="timeout"}[5m])
```

### 6. **Worker Pool Saturation**
```promql
# Alert if pool is consistently > 90% utilized
(pool_usage / pool_size) * 100 > 90
```

### 7. **Trader Load Failures**
```promql
# Failed trader loads from database
rate(traders_loaded_from_db_total{status="failed"}[5m])
```

---

## Alert Rules Configuration

### Critical Alerts

```yaml
# alert-rules.yml for Prometheus Alertmanager

groups:
  - name: filter_execution
    interval: 30s
    rules:
      - alert: HighFilterErrorRate
        expr: |
          (
            rate(trader_execution_errors_total[5m])
            /
            rate(trader_executions_total[5m])
          ) * 100 > 20
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Filter {{ $labels.trader_id }} has high error rate"
          description: "Error rate is {{ $value | humanize }}%"

      - alert: SignalPersistenceFailures
        expr: |
          rate(signal_persist_errors_total[5m]) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High signal persistence failures for {{ $labels.trader_id }}"
          description: "{{ $value | humanize }} failures per second"

      - alert: SlowFilterExecution
        expr: |
          histogram_quantile(0.95,
            rate(trader_execution_duration_seconds_bucket[5m])
          ) > 10
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Filter {{ $labels.trader_id }} execution is slow"
          description: "P95 latency is {{ $value | humanize }}s"

      - alert: WorkerPoolSaturated
        expr: |
          (pool_usage / pool_size) * 100 > 95
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Worker pool nearly saturated"
          description: "Pool utilization is {{ $value | humanize }}%"

      - alert: TraderLoadFailures
        expr: |
          rate(traders_loaded_from_db_total{status="failed"}[5m]) > 0.1
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Failed to load traders from database"
          description: "{{ $value | humanize }} failures per second"
```

---

## Using Grafana via Fly.io

### Access Methods

1. **Web UI**: https://fly.io/apps/vyx-user-35682909/metrics
2. **Metrics Endpoint**: `http://vyx-user-35682909.internal:8080/metrics` (internal)
3. **External**: Use Fly proxy to access metrics

### Setting Up Custom Dashboard

1. Go to Grafana: https://fly.io/apps/vyx-user-35682909/metrics
2. Click "+ Create" → "Dashboard"
3. Click "Import dashboard"
4. Paste the JSON above
5. Select your Prometheus datasource
6. Click "Import"

### Creating Alerts in Grafana

1. Open any panel
2. Click "Alert" tab
3. Click "Create alert rule from this panel"
4. Configure:
   - **Query**: Use one of the queries above
   - **Condition**: Set threshold (e.g., `> 0.1` for 10% error rate)
   - **Frequency**: How often to evaluate (e.g., `1m`)
   - **For**: How long condition must be true (e.g., `5m`)
5. Add notification channel (email, Slack, PagerDuty)

---

## Quick Troubleshooting Queries

### Check if filter is executing at all:
```promql
trader_executions_total{trader_id="eafa855b-7601-4485-8993-c8f31a091f75"}
```

### Check recent errors for specific trader:
```promql
trader_execution_errors_total{trader_id="eafa855b-7601-4485-8993-c8f31a091f75"}
```

### Check signal generation for specific trader:
```promql
signals_generated_total{trader_id="eafa855b-7601-4485-8993-c8f31a091f75"}
```

### Check for database issues:
```promql
signal_persist_errors_total
```

---

## Log-Based Monitoring (Fallback)

If you need to supplement metrics with logs:

```bash
# Monitor filter execution problems in real-time
flyctl logs --app vyx-user-35682909 | grep -E "Failed|Error|panic|timeout"

# Filter-specific issues
flyctl logs --app vyx-user-35682909 | grep "Triple-Indicator"

# Database timeouts
flyctl logs --app vyx-user-35682909 | grep "statement timeout"

# Execution errors
flyctl logs --app vyx-user-35682909 | grep "execution_errors"
```

---

## Recommended Monitoring Strategy

1. **Real-time Dashboard**: Keep Grafana open during development
2. **Alerts**: Set up critical alerts for:
   - Error rate > 20%
   - Signal persistence failures
   - Worker pool saturation
3. **Daily Review**: Check dashboard daily for trends
4. **Logs**: Use for detailed debugging when metrics show problems

---

## Next Steps

1. Import the dashboard JSON to Grafana
2. Set up alert notification channels
3. Monitor for 24 hours to establish baseline
4. Adjust alert thresholds based on normal behavior
5. Add custom panels for specific traders you're testing
