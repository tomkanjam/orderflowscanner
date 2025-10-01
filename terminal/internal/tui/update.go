package tui

import (
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

// Update implements tea.Model
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	var cmd tea.Cmd

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.updateViewportSizes()
		return m, nil

	case tea.KeyMsg:
		return m.handleKeyPress(msg)

	case tickMsg:
		// Simulate price updates
		for i := range m.markets {
			// Small random price change
			change := (float64(i%3) - 1) * 10
			m.markets[i].Price += change
			m.markets[i].Change24h += change
		}

		// Add timestamp to new logs
		now := time.Now()
		for i := range m.logs {
			if m.logs[i].Time.IsZero() {
				m.logs[i].Time = now
			}
		}

		// Update current prices in positions
		for i := range m.positions {
			for _, market := range m.markets {
				if m.positions[i].Symbol == market.Symbol {
					m.positions[i].CurrentPrice = market.Price
					// Recalculate PNL
					if m.positions[i].Side == "LONG" {
						m.positions[i].PNL = (m.positions[i].CurrentPrice - m.positions[i].EntryPrice) * m.positions[i].Size
					} else {
						m.positions[i].PNL = (m.positions[i].EntryPrice - m.positions[i].CurrentPrice) * m.positions[i].Size
					}
					m.positions[i].PNLPct = (m.positions[i].PNL / (m.positions[i].EntryPrice * m.positions[i].Size)) * 100
				}
			}
		}

		// Refresh tables
		m.marketTable = m.createMarketTable()
		m.positionsTable = m.createPositionsTable()

		return m, tickCmd()

	case wsUpdateMsg:
		// Handle WebSocket updates
		for i := range m.markets {
			if m.markets[i].Symbol == msg.symbol {
				m.markets[i].Price = msg.price
				m.markets[i].Change24h = msg.change
			}
		}
		return m, nil

	case signalTriggeredMsg:
		// Add new signal
		m.signals = append([]SignalData{msg.signal}, m.signals...)
		m.signalsTable = m.createSignalsTable()

		// Add log entry
		m.addLog("INFO", "Signal triggered: "+msg.signal.Symbol+" "+msg.signal.AIReasoning)

		return m, nil

	case aiAnalysisMsg:
		// Update AI message
		m.aiMessage = msg.analysis
		m.addLog("AI", "Analysis completed for signal "+msg.signalID)
		return m, nil

	case tradeExecutedMsg:
		// Add new position
		m.positions = append([]PositionData{msg.position}, m.positions...)
		m.positionsTable = m.createPositionsTable()
		m.addLog("EXEC", "Position opened: "+msg.position.Symbol+" "+msg.position.Side)
		return m, nil
	}

	// Update focused component
	switch m.focusedPanel {
	case PanelMarket:
		m.marketTable, cmd = m.marketTable.Update(msg)
	case PanelTraders:
		m.tradersTable, cmd = m.tradersTable.Update(msg)
	case PanelSignals:
		m.signalsTable, cmd = m.signalsTable.Update(msg)
	case PanelPositions:
		m.positionsTable, cmd = m.positionsTable.Update(msg)
	case PanelAI:
		m.aiViewport, cmd = m.aiViewport.Update(msg)
	case PanelLogs:
		m.logsViewport, cmd = m.logsViewport.Update(msg)
	}

	return m, cmd
}

// Handle keyboard input
func (m Model) handleKeyPress(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "q":
		m.quitting = true
		return m, tea.Quit

	case "?":
		m.showHelp = !m.showHelp
		return m, nil

	case "tab":
		m.focusedPanel = (m.focusedPanel + 1) % 7
		return m, nil

	case "shift+tab":
		m.focusedPanel = (m.focusedPanel - 1 + 7) % 7
		return m, nil

	case "1":
		m.focusedPanel = PanelMarket
		return m, nil

	case "2":
		m.focusedPanel = PanelTraders
		return m, nil

	case "3":
		m.focusedPanel = PanelSignals
		return m, nil

	case "4":
		m.focusedPanel = PanelPositions
		return m, nil

	case "5":
		m.focusedPanel = PanelAI
		return m, nil

	case "6":
		m.focusedPanel = PanelLogs
		return m, nil

	case "7":
		m.focusedPanel = PanelDeploy
		return m, nil

	case "r":
		// Refresh data
		m.addLog("INFO", "Refreshing data...")
		return m, nil

	case "c":
		// Create new trader (placeholder)
		m.addLog("INFO", "Create trader (not implemented yet)")
		return m, nil

	case "enter":
		// Action on selected item
		switch m.focusedPanel {
		case PanelSignals:
			cursor := m.signalsTable.Cursor()
			if cursor < len(m.signals) {
				signal := m.signals[cursor]
				m.addLog("INFO", "Selected signal: "+signal.Symbol)
			}
		case PanelPositions:
			cursor := m.positionsTable.Cursor()
			if cursor < len(m.positions) {
				position := m.positions[cursor]
				m.addLog("INFO", "Selected position: "+position.Symbol)
			}
		}
		return m, nil
	}

	return m, nil
}

// Helper to add log entry
func (m *Model) addLog(level, message string) {
	m.logs = append([]LogEntry{{
		Time:    time.Now(),
		Level:   level,
		Message: message,
	}}, m.logs...)

	// Keep only last 100 logs
	if len(m.logs) > 100 {
		m.logs = m.logs[:100]
	}
}

// Update viewport sizes based on window dimensions
func (m *Model) updateViewportSizes() {
	// Update viewports when window size changes
	if m.logsViewport.Width > 0 {
		m.logsViewport.Width = m.width - 4
	}
	if m.aiViewport.Width > 0 {
		m.aiViewport.Width = m.width - 4
	}
}
