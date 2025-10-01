# Cloud Execution UI Mockups

Interactive HTML mockups for the Fly.io machine cloud execution feature.

## Mockups

### 1. Cloud Execution Panel (`cloud-execution-panel.html`)

**Purpose**: Main control panel for Elite users to manage their dedicated Fly.io machine.

**States Demonstrated**:

1. **Stopped** (Default)
   - Gray banner with stopped status
   - "Start Cloud Execution" button enabled
   - Configuration visible but metrics hidden
   - User can adjust preferences before starting

2. **Provisioning**
   - Blue animated banner
   - Shows "Provisioning Machine..." with subtitle about setup time
   - Button disabled showing "Provisioning..."
   - Metrics still hidden (machine not ready yet)

3. **Starting**
   - Blue animated banner
   - Shows "Starting Machine..." with subtitle about connecting to services
   - Button disabled showing "Starting..."
   - Metrics become visible showing initial values

4. **Running**
   - Green pulsing status indicator
   - Shows "Cloud Execution Running" with active monitoring subtitle
   - Red "Stop Cloud Execution" button
   - Live metrics updating every 2 seconds:
     - CPU Usage (with progress bar)
     - Active Signals count
     - Analysis Queue depth
     - Uptime counter
     - Region and latency
     - Cost tracking

5. **Error**
   - Red error banner
   - Shows "Machine Error" with troubleshooting subtitle
   - Orange "Restart Machine" button enabled
   - Metrics hidden (machine not functional)

**Interactive Elements**:

- **State Selector** (demo only): Buttons at top to switch between all states
- **Primary Action Button**: Changes function and style based on state
  - Stopped → Start (blue)
  - Running → Stop (red, with confirmation dialog)
  - Error → Restart (blue)
  - Provisioning/Starting → Disabled (gray)

- **Configuration Controls** (always visible):
  - **Region Dropdown**: Singapore (sin), Ashburn (iad), Frankfurt (fra)
  - **CPU Priority**: Low (1-2), Normal (1-4), High (1-8) vCPUs
  - **Toggle Switches**:
    - Notify on New Signals (default: ON)
    - Notify on Analysis Complete (default: ON)
    - Auto-restart on Error (default: ON)

- **Live Metrics** (visible when starting/running):
  - CPU automatically scales based on simulated load
  - Signal count fluctuates 10-18 range
  - Queue depth varies 0-6
  - Cost increments realistically
  - All metrics update every 2 seconds

**User Flows**:

1. **Start Flow**:
   - User clicks "Start" → Provisioning (2s) → Starting (2s) → Running
   - Total startup time: ~4 seconds (simulated; actual: 30-60s)

2. **Stop Flow**:
   - User clicks "Stop" → Confirmation dialog → Stopped
   - Dialog prevents accidental shutdown

3. **Configuration Changes**:
   - User can change settings anytime
   - Changes would sync to machine (not implemented in mockup)

**Visual Design**:
- Dark theme matching TradeMind aesthetic (#0f1419 background)
- Status-based color coding:
  - Blue (#1d9bf0): Provisioning, Active states
  - Green (#00ba7c): Running, Success
  - Red (#f4212e): Errors, Stop actions
  - Gray (#71767b): Disabled, Stopped
- Smooth animations for state transitions (300ms fade-in)
- Pulsing status indicators for active states

---

### 2. Machine Health Dashboard (`machine-health-dashboard.html`)

**Purpose**: Detailed monitoring view showing machine performance, metrics, and events.

**Sections**:

1. **System Health Overview**
   - Overall health status badge (Healthy/Degraded/Unhealthy)
   - 5 key metrics in compact cards:
     - Uptime percentage (7-day)
     - Average latency
     - Error count (24h)
     - Memory usage
     - Average vCPUs

2. **Performance Charts** (2 side-by-side)

   **CPU Usage Chart**:
   - 24 bars representing 6-hour period (15-min intervals)
   - Bars show vCPU scaling over time
   - Simulates realistic patterns:
     - Low: 1-2.4 vCPUs (first 2 hours)
     - High: 2.4-4.8 vCPUs (middle 2 hours, signal surge)
     - Medium: 1.6-3.2 vCPUs (last 2 hours)
   - Legend shows 8 vCPU hard limit
   - Time range selector: 1H / 6H / 24H / 7D

   **Signal Processing Chart**:
   - 24 bars showing signal creation and analysis
   - Two-color bars:
     - Green: Signals created
     - Blue: Analysis completed
   - Shows peaks every 4 intervals (simulating market volatility)
   - Same time range selector

3. **Performance Indicators** (4 cards)

   Each card shows:
   - Metric name and health dot (green/yellow/red)
   - Large value with unit
   - Progress bar (color-coded)
   - Target and max values

   **Metrics**:
   - **WebSocket Latency**: 23ms (good - green)
     - Target: < 50ms, Max: 150ms
   - **Filter Execution Time**: 87ms (good - green)
     - Target: < 200ms, Max: 300ms
   - **AI Analysis Time**: 2.3s (warning - yellow)
     - Target: < 3s, Max: 5s
   - **Memory Efficiency**: 84% (good - green)
     - Shows 2.1 GB / 2.5 GB allocated

4. **Recent Events Log**
   - Chronological list of system events
   - 6 sample events demonstrating different types:
     - ✓ Success: Scaling events, completions
     - ℹ Info: Config syncs, reconnections
     - ⚠ Warning: Queue thresholds, performance alerts
     - ✗ Error: (not shown in healthy state)
   - Each event has:
     - Type-coded icon and color
     - Descriptive message
     - Relative timestamp

**Interactive Elements**:

- **Time Range Selectors**: Switch chart view periods
  - 1H: Recent activity (high detail)
  - 6H: Current session (default)
  - 24H: Full day trends
  - 7D: Weekly patterns

- **Chart Bars**: Hover shows exact values (implied; not implemented in mockup)

- **Live Updates**:
  - Metrics update every 3 seconds
  - Latency varies 20-30ms
  - Memory fluctuates 2.0-2.3 GB
  - vCPUs average changes 2.5-4.0

**Health Status Logic** (implied):

- **Healthy**:
  - Uptime > 99%
  - Latency < 50ms
  - No critical errors
  - All indicators green/yellow

- **Degraded**:
  - Uptime 95-99%
  - Latency 50-100ms
  - Some warnings present
  - Mix of yellow/green indicators

- **Unhealthy**:
  - Uptime < 95%
  - Latency > 100ms
  - Critical errors present
  - Red indicators

**Visual Design**:
- Same dark theme as Cloud Execution Panel
- Grid-based responsive layout
- Cards with subtle borders (#2f3336)
- Color-coded performance indicators
- Clean typography hierarchy
- Sufficient spacing for readability

---

## How to View Mockups

1. Open either HTML file in a web browser (Chrome, Firefox, Safari, Edge)
2. No server required - they're self-contained
3. All interactions are client-side JavaScript

**Cloud Execution Panel**:
```bash
open mockups/cloud-execution-panel.html
```

**Machine Health Dashboard**:
```bash
open mockups/machine-health-dashboard.html
```

---

## Design Decisions

### IMPORTANT: Admin-Only Tools

**These UI components are NOT user-facing features.** They are internal admin/monitoring tools for:

- **Platform administrators** to monitor Elite users' Fly machines
- **DevOps/Support** to troubleshoot machine issues
- **Internal dashboards** to track infrastructure health and costs

**Elite users will NOT see these panels.** Their cloud execution will:
- Start automatically when they enable traders
- Run invisibly in the background
- Report signals directly to their signal list (no special UI)
- Be completely transparent to the user experience

The mockups serve as:
1. **Design specification** for admin monitoring tools
2. **Reference implementation** for real-time metrics display
3. **Debugging interface** for development and support

### Why HTML Mockups?

1. **Interactive Demonstration**: Shows actual state transitions and animations
2. **Realistic Behavior**: Live metrics, timers, simulated data updates
3. **Easy Iteration**: PM can test flows and provide feedback quickly
4. **No Build Required**: Works directly in browser without dev environment
5. **Portable**: Can be shared via email, Slack, or deployed to static host

### Key UX Principles Applied

1. **Progressive Disclosure**:
   - Metrics hidden until machine starts
   - Configuration always accessible for pre-planning

2. **Clear Status Communication**:
   - Color-coded states (blue/green/red/gray)
   - Animated indicators for active states
   - Descriptive subtitles explaining what's happening

3. **Safety Rails**:
   - Confirmation dialog before stopping
   - Disabled buttons during transitions
   - Clear error states with actionable messages

4. **Performance Visibility**:
   - Real-time metrics for CPU, memory, latency
   - Historical charts for trend analysis
   - Event log for audit trail

5. **Cost Awareness**:
   - Live cost counter in main panel
   - Daily and monthly estimates
   - Helps users understand financial impact

---

## Next Steps (Pending PM Approval)

If mockups are approved:

1. **Phase 1**: Implement database schema and migrations
2. **Phase 2**: Build server-side Fly.io machine orchestration
3. **Phase 3**: Convert mockups to React components
4. **Phase 4**: Wire up real data streams
5. **Phase 5**: Add WebSocket communication
6. **Phase 6**: Testing and optimization
7. **Phase 7**: Gradual rollout to Elite users

If changes needed:

- Adjust state flows
- Modify metric displays
- Redesign layout/colors
- Add/remove features
- Change interaction patterns

---

## Technical Notes

### Simulated Behaviors

The mockups simulate the following to demonstrate functionality:

- **Startup Sequence**: Provisioning → Starting → Running (4s total)
- **Live Metrics**: CPU, signals, queue, cost update every 2-3s
- **CPU Scaling**: Varies between 2-5 vCPUs based on simulated load
- **Chart Generation**: Random but realistic data patterns
- **Event Stream**: Pre-populated with typical system events

### Actual Implementation Differences

In production:

- Startup will take 30-60 seconds (Fly.io machine provisioning)
- Metrics will come from real Prometheus/StatsD collectors
- Charts will use Chart.js or similar library
- Events will stream from server via WebSocket
- Configuration changes will trigger API calls to update machine
- Health checks will run every 30 seconds

### Browser Compatibility

Tested and working in:
- Chrome 120+
- Firefox 120+
- Safari 17+
- Edge 120+

Requires modern browser supporting:
- CSS Grid
- CSS Animations
- ES6 JavaScript
- Flexbox

---

## Feedback Template

When reviewing, please consider:

1. **State Transitions**: Are they clear and logical?
2. **Metrics Displayed**: Are these the right KPIs? Missing any?
3. **Visual Design**: Does it match TradeMind aesthetic?
4. **User Actions**: Any confusing flows or missing controls?
5. **Information Density**: Too much/too little information?
6. **Error Handling**: Are error states helpful?
7. **Configuration Options**: Right level of control?
8. **Performance Data**: Useful for debugging/optimization?

Please provide feedback in the issue:
`issues/2025-09-30-fly-machine-elite-trader-execution.md`
