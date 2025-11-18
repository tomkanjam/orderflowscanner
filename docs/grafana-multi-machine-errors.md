# Multi-Machine Error Monitoring Dashboard

## Overview
This dashboard aggregates errors from all user-dedicated Fly machines (vyx-user-*) into a single unified view.

## Architecture

Each user gets their own Fly machine:
- **Pattern**: `vyx-user-{user_id}`
- **Example**: `vyx-user-35682909`
- **Metrics**: Exposed on each machine at `:8080/metrics`

---

## Complete Grafana Dashboard JSON

```json
{
  "dashboard": {
    "title": "All User Machines - Error Dashboard",
    "tags": ["errors", "multi-machine", "users"],
    "timezone": "browser",
    "refresh": "30s",
    "time": { "from": "now-1h", "to": "now" },

    "templating": {
      "list": [
        {
          "name": "user_id",
          "type": "query",
          "query": "label_values(trader_errors_total, user_id)",
          "label": "User ID",
          "multi": true,
          "includeAll": true,
          "allValue": ".*"
        },
        {
          "name": "error_type",
          "type": "query",
          "query": "label_values(trader_errors_total, error_type)",
          "label": "Error Type",
          "multi": true,
          "includeAll": true,
          "allValue": ".*"
        }
      ]
    },

    "panels": [
      {
        "id": 1,
        "title": "Total Error Rate Across All Machines",
        "type": "stat",
        "gridPos": { "x": 0, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(rate(trader_errors_total[5m]))",
            "legendFormat": "Errors/sec"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "ops",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 0.1, "color": "yellow" },
                { "value": 1, "color": "red" }
              ]
            }
          }
        }
      },

      {
        "id": 2,
        "title": "Machines with Errors",
        "type": "stat",
        "gridPos": { "x": 6, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "count(sum by(instance) (rate(trader_errors_total[5m]) > 0))",
            "legendFormat": "Machines"
          }
        ]
      },

      {
        "id": 3,
        "title": "Total Active Machines",
        "type": "stat",
        "gridPos": { "x": 12, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "count(up{job=\"fly-machines\"})",
            "legendFormat": "Total Machines"
          }
        ]
      },

      {
        "id": 4,
        "title": "Critical: Execution Errors",
        "type": "stat",
        "gridPos": { "x": 18, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "sum(rate(trader_execution_errors_total[5m]))",
            "legendFormat": "Exec Errors/sec"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "ops",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "value": 0, "color": "green" },
                { "value": 0.01, "color": "yellow" },
                { "value": 0.1, "color": "red" }
              ]
            }
          }
        }
      },

      {
        "id": 5,
        "title": "Error Rate by User",
        "type": "graph",
        "gridPos": { "x": 0, "y": 4, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by(user_id) (rate(trader_errors_total{user_id=~\"$user_id\"}[5m]))",
            "legendFormat": "User {{user_id}}"
          }
        ],
        "yaxes": [
          { "label": "Errors/sec", "format": "ops" },
          { "show": false }
        ]
      },

      {
        "id": 6,
        "title": "Error Rate by Type",
        "type": "graph",
        "gridPos": { "x": 12, "y": 4, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by(error_type) (rate(trader_errors_total{error_type=~\"$error_type\"}[5m]))",
            "legendFormat": "{{error_type}}"
          }
        ],
        "yaxes": [
          { "label": "Errors/sec", "format": "ops" },
          { "show": false }
        ]
      },

      {
        "id": 7,
        "title": "Execution Errors by User & Type",
        "type": "table",
        "gridPos": { "x": 0, "y": 12, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by(user_id, error_type) (increase(trader_execution_errors_total[5m]))",
            "format": "table",
            "instant": true
          }
        ],
        "transformations": [
          {
            "id": "organize",
            "options": {
              "excludeByName": { "Time": true },
              "indexByName": { "user_id": 0, "error_type": 1, "Value": 2 },
              "renameByName": {
                "user_id": "User ID",
                "error_type": "Error Type",
                "Value": "Count (5m)"
              }
            }
          }
        ],
        "options": {
          "sortBy": [{ "displayName": "Count (5m)", "desc": true }]
        }
      },

      {
        "id": 8,
        "title": "Signal Persist Errors by User",
        "type": "table",
        "gridPos": { "x": 12, "y": 12, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by(user_id, trader_id, error_type) (increase(signal_persist_errors_total[5m]))",
            "format": "table",
            "instant": true
          }
        ],
        "transformations": [
          {
            "id": "organize",
            "options": {
              "excludeByName": { "Time": true },
              "indexByName": {
                "user_id": 0,
                "trader_id": 1,
                "error_type": 2,
                "Value": 3
              },
              "renameByName": {
                "user_id": "User ID",
                "trader_id": "Trader ID",
                "error_type": "Error Type",
                "Value": "Count (5m)"
              }
            }
          }
        ]
      },

      {
        "id": 9,
        "title": "Top 10 Users by Error Count",
        "type": "bargauge",
        "gridPos": { "x": 0, "y": 20, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "topk(10, sum by(user_id) (increase(trader_errors_total[1h])))",
            "legendFormat": "{{user_id}}"
          }
        ],
        "options": {
          "orientation": "horizontal",
          "displayMode": "gradient"
        }
      },

      {
        "id": 10,
        "title": "Error Heatmap (Users vs Time)",
        "type": "heatmap",
        "gridPos": { "x": 12, "y": 20, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by(user_id) (rate(trader_errors_total[1m]))",
            "legendFormat": "{{user_id}}",
            "format": "time_series"
          }
        ],
        "options": {
          "calculate": true,
          "yAxis": {
            "format": "short",
            "decimals": 0
          }
        }
      },

      {
        "id": 11,
        "title": "Database Load Failures",
        "type": "graph",
        "gridPos": { "x": 0, "y": 28, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "sum by(instance) (rate(traders_loaded_from_db_total{status=\"failed\"}[5m]))",
            "legendFormat": "{{instance}}"
          }
        ],
        "alert": {
          "name": "Database Load Failures",
          "conditions": [
            {
              "evaluator": { "type": "gt", "params": [0.1] },
              "operator": { "type": "and" },
              "query": { "params": ["A", "5m", "now"] },
              "reducer": { "type": "sum" },
              "type": "query"
            }
          ],
          "executionErrorState": "alerting",
          "frequency": "1m",
          "handler": 1,
          "message": "Database load failures detected across machines",
          "noDataState": "no_data",
          "for": "5m"
        }
      },

      {
        "id": 12,
        "title": "Worker Pool Saturation by Machine",
        "type": "graph",
        "gridPos": { "x": 12, "y": 28, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "(pool_usage / pool_size) * 100",
            "legendFormat": "{{instance}}"
          }
        ],
        "yaxes": [
          {
            "label": "Pool Usage %",
            "format": "percent",
            "max": 100
          },
          { "show": false }
        ],
        "thresholds": [
          { "value": 80, "colorMode": "critical", "op": "gt", "fill": true, "line": true }
        ]
      },

      {
        "id": 13,
        "title": "Recent Error Log Stream",
        "type": "logs",
        "gridPos": { "x": 0, "y": 36, "w": 24, "h": 8 },
        "targets": [
          {
            "expr": "{job=\"fly-machines\"} |= \"Error\" or \"Failed\" or \"panic\"",
            "refId": "A"
          }
        ],
        "options": {
          "showTime": true,
          "showLabels": true,
          "sortOrder": "Descending",
          "wrapLogMessage": true
        }
      },

      {
        "id": 14,
        "title": "Error Summary Table",
        "type": "table",
        "gridPos": { "x": 0, "y": 44, "w": 24, "h": 10 },
        "targets": [
          {
            "expr": "sum by(user_id, trader_id, error_type) (increase(trader_errors_total[1h]))",
            "format": "table",
            "instant": true
          }
        ],
        "transformations": [
          {
            "id": "organize",
            "options": {
              "excludeByName": { "Time": true },
              "indexByName": {
                "user_id": 0,
                "trader_id": 1,
                "error_type": 2,
                "Value": 3
              },
              "renameByName": {
                "user_id": "User ID",
                "trader_id": "Trader ID",
                "error_type": "Error Type",
                "Value": "Count (1h)"
              }
            }
          },
          {
            "id": "sortBy",
            "options": {
              "fields": {},
              "sort": [{ "field": "Count (1h)", "desc": true }]
            }
          }
        ],
        "options": {
          "showHeader": true,
          "footer": {
            "show": true,
            "reducer": ["sum"],
            "fields": ["Count (1h)"]
          }
        }
      }
    ],

    "annotations": {
      "list": [
        {
          "name": "Deployments",
          "datasource": "-- Grafana --",
          "enable": true,
          "iconColor": "blue",
          "tags": ["deployment"]
        },
        {
          "name": "High Error Rate",
          "datasource": "Prometheus",
          "enable": true,
          "expr": "ALERTS{alertname=\"HighFilterErrorRate\", alertstate=\"firing\"}",
          "iconColor": "red",
          "titleFormat": "High Error Rate Alert"
        }
      ]
    }
  }
}
```

---

## Key Queries for Multi-Machine Monitoring

### 1. **Total Errors Across All Machines**
```promql
# Sum all errors from all machines
sum(rate(trader_errors_total[5m]))
```

### 2. **Errors by User ID**
```promql
# Group errors by user (machine)
sum by(user_id) (rate(trader_errors_total[5m]))
```

### 3. **Machines with Active Errors**
```promql
# Count machines reporting errors
count(
  sum by(instance) (rate(trader_errors_total[5m]) > 0)
)
```

### 4. **Top 10 Users by Error Count**
```promql
topk(10,
  sum by(user_id) (increase(trader_errors_total[1h]))
)
```

### 5. **Error Distribution by Type**
```promql
# See which error types are most common
sum by(error_type) (rate(trader_errors_total[5m]))
```

### 6. **Users with Execution Errors**
```promql
# Users experiencing filter execution problems
sum by(user_id) (rate(trader_execution_errors_total[5m]) > 0)
```

### 7. **Database Timeout Errors Across All Machines**
```promql
# All signal persistence timeouts
sum(rate(signal_persist_errors_total{error_type="timeout"}[5m]))
```

### 8. **Machine Health Status**
```promql
# Machines that are up
count(up{job="fly-machines"} == 1)
```

### 9. **Per-Machine Error Rate**
```promql
# Error rate for each individual machine
sum by(instance) (rate(trader_errors_total[5m]))
```

### 10. **Critical: Machines with High Error Rate**
```promql
# Machines with error rate > 10%
(
  sum by(instance) (rate(trader_errors_total[5m]))
  /
  sum by(instance) (rate(trader_executions_total[5m]))
) * 100 > 10
```

---

## Alert Rules for Multi-Machine Setup

```yaml
# alert-rules-multi-machine.yml

groups:
  - name: multi_machine_errors
    interval: 30s
    rules:
      - alert: SystemWideHighErrorRate
        expr: |
          sum(rate(trader_errors_total[5m])) > 5
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate across all machines"
          description: "Total error rate is {{ $value | humanize }}/sec"

      - alert: MultipleUsersExperiencingErrors
        expr: |
          count(sum by(user_id) (rate(trader_errors_total[5m]) > 0.1)) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Multiple users experiencing errors"
          description: "{{ $value }} users have active errors"

      - alert: UserMachineDown
        expr: |
          up{job="fly-machines"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "User machine {{$labels.instance}} is down"
          description: "Machine has been unreachable for 2 minutes"

      - alert: WideSpreadExecutionFailures
        expr: |
          sum(rate(trader_execution_errors_total[5m])) > 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Widespread execution failures across machines"
          description: "{{ $value | humanize }} execution errors/sec"

      - alert: MassiveDatabaseTimeouts
        expr: |
          sum(rate(signal_persist_errors_total{error_type="timeout"}[5m])) > 2
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Multiple machines experiencing database timeouts"
          description: "{{ $value | humanize }} timeout errors/sec"

      - alert: ClusterPoolSaturation
        expr: |
          count(
            (pool_usage / pool_size) * 100 > 90
          ) > 3
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Multiple machines have saturated worker pools"
          description: "{{ $value }} machines at >90% pool usage"
```

---

## Setting Up Multi-Machine Monitoring

### Option 1: Fly.io Organization-Wide Metrics

Fly.io provides organization-level metrics that can aggregate across apps:

1. Go to https://fly.io/dashboard/personal/metrics
2. Select "All Apps" or use a label query
3. Create custom dashboards

### Option 2: Prometheus Federation

If you have many user machines, set up Prometheus federation:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'fly-machines'
    fly_sd_configs:
      - org: 'your-org'
        app_name_pattern: 'vyx-user-*'
    relabel_configs:
      - source_labels: [__meta_fly_app_name]
        target_label: app
      - source_labels: [__meta_fly_machine_id]
        target_label: machine_id
```

### Option 3: Use Fly's Built-in Metrics Export

```bash
# Export metrics for all user apps
fly apps list | grep vyx-user | while read app _; do
  echo "=== $app ==="
  fly dashboard metrics --app $app
done
```

---

## Quick Commands for Multi-Machine Monitoring

### Check All User Machines Status
```bash
fly apps list | grep vyx-user | awk '{print $1}' | while read app; do
  echo "=== $app ==="
  fly status --app $app 2>&1 | grep -E "STATE|CHECKS"
done
```

### Get Error Logs from All Machines
```bash
fly apps list | grep vyx-user | awk '{print $1}' | while read app; do
  echo "=== $app ==="
  fly logs --app $app 2>&1 | grep -i "error\|failed\|panic" | tail -5
done
```

### Monitor Real-Time Errors Across All Machines
```bash
# Open multiple terminal windows, one per machine
fly apps list | grep vyx-user | awk '{print $1}' | while read app; do
  echo "Monitoring $app in new terminal..."
  osascript -e "tell app \"Terminal\" to do script \"fly logs --app $app | grep -i error\""
done
```

---

## Grafana Variables for Filtering

Add these variables to your dashboard for dynamic filtering:

### User ID Variable
```
Query: label_values(trader_errors_total, user_id)
Type: Multi-select
Include All: Yes
```

### Error Type Variable
```
Query: label_values(trader_errors_total, error_type)
Type: Multi-select
Include All: Yes
```

### Trader ID Variable
```
Query: label_values(trader_errors_total, trader_id)
Type: Multi-select
Include All: Yes
```

### Machine Instance Variable
```
Query: label_values(up{job="fly-machines"}, instance)
Type: Multi-select
Include All: Yes
```

---

## Monitoring Best Practices

1. **Set Up Alerts**: Configure critical alerts for system-wide issues
2. **Daily Review**: Check top error users/types daily
3. **Baseline Establishment**: Monitor for 1 week to establish normal patterns
4. **Anomaly Detection**: Set alerts for >3x baseline error rates
5. **User Impact**: Prioritize fixes based on number of affected users
6. **Error Correlation**: Look for patterns across multiple users (indicates platform issues)

---

## Next Steps

1. **Import Dashboard**: Copy JSON and import to Grafana
2. **Configure Alerts**: Set up notification channels (Slack, email, PagerDuty)
3. **Test Alerts**: Trigger test errors to verify alerting works
4. **Document Runbooks**: Create response procedures for common errors
5. **Monitor Trends**: Weekly reviews to identify systemic issues
