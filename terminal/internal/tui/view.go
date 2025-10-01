package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/yourusername/aitrader-tui/internal/tui/styles"
)

// View implements tea.Model
func (m Model) View() string {
	if m.quitting {
		return "Thanks for using AI Crypto Trader! 👋\n"
	}

	if m.showHelp {
		return m.renderHelp()
	}

	// Build the UI
	header := m.renderHeader()
	body := m.renderBody()
	footer := m.renderFooter()

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		body,
		footer,
	)
}

// Render header
func (m Model) renderHeader() string {
	var pnlStyle lipgloss.Style
	if m.totalPNL > 0 {
		pnlStyle = styles.ProfitStyle
	} else if m.totalPNL < 0 {
		pnlStyle = styles.LossStyle
	} else {
		pnlStyle = styles.BaseStyle
	}

	pnlStr := pnlStyle.Render(fmt.Sprintf("$%.2f (%.2f%%)", m.totalPNL, m.totalPNLPct))

	title := styles.HeaderStyle.Render("🚀 AI Crypto Trader v1.0")
	user := styles.InfoStyle.Render(m.userEmail)
	balance := styles.InfoStyle.Render(fmt.Sprintf("Balance: $%.2f", m.balance))
	pnl := styles.InfoStyle.Render("PNL: ") + pnlStr

	headerContent := lipgloss.JoinHorizontal(
		lipgloss.Left,
		title,
		" │ ",
		user,
		" │ ",
		balance,
		" │ ",
		pnl,
	)

	return styles.PanelStyle.
		Width(m.width - 4).
		Render(headerContent)
}

// Render body
func (m Model) renderBody() string {
	// Calculate panel dimensions
	leftWidth := (m.width - 6) / 2
	rightWidth := m.width - leftWidth - 6

	// Left column
	marketPanel := m.renderMarketPanel(leftWidth)
	signalsPanel := m.renderSignalsPanel(leftWidth)

	leftCol := lipgloss.JoinVertical(
		lipgloss.Left,
		marketPanel,
		signalsPanel,
	)

	// Right column
	tradersPanel := m.renderTradersPanel(rightWidth)
	positionsPanel := m.renderPositionsPanel(rightWidth)

	rightCol := lipgloss.JoinVertical(
		lipgloss.Left,
		tradersPanel,
		positionsPanel,
	)

	// Combine columns
	mainContent := lipgloss.JoinHorizontal(
		lipgloss.Top,
		leftCol,
		rightCol,
	)

	// Bottom panels
	aiPanel := m.renderAIPanel(m.width - 4)
	logsPanel := m.renderLogsPanel(m.width - 4)

	return lipgloss.JoinVertical(
		lipgloss.Left,
		mainContent,
		aiPanel,
		logsPanel,
	)
}

// Render market panel
func (m Model) renderMarketPanel(width int) string {
	title := styles.TitleStyle.Render("📊 MARKET OVERVIEW")

	panelStyle := styles.PanelStyle
	if m.focusedPanel == PanelMarket {
		panelStyle = styles.FocusedPanelStyle
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		m.marketTable.View(),
	)

	return panelStyle.
		Width(width).
		Height(12).
		Render(content)
}

// Render traders panel
func (m Model) renderTradersPanel(width int) string {
	title := styles.TitleStyle.Render(fmt.Sprintf("🤖 ACTIVE TRADERS (%d)", len(m.traders)))

	panelStyle := styles.PanelStyle
	if m.focusedPanel == PanelTraders {
		panelStyle = styles.FocusedPanelStyle
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		m.tradersTable.View(),
	)

	return panelStyle.
		Width(width).
		Height(12).
		Render(content)
}

// Render signals panel
func (m Model) renderSignalsPanel(width int) string {
	title := styles.TitleStyle.Render(fmt.Sprintf("🎯 ACTIVE SIGNALS (%d)", len(m.signals)))

	panelStyle := styles.PanelStyle
	if m.focusedPanel == PanelSignals {
		panelStyle = styles.FocusedPanelStyle
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		m.signalsTable.View(),
	)

	return panelStyle.
		Width(width).
		Height(10).
		Render(content)
}

// Render positions panel
func (m Model) renderPositionsPanel(width int) string {
	title := styles.TitleStyle.Render(fmt.Sprintf("📈 OPEN POSITIONS (%d)", len(m.positions)))

	panelStyle := styles.PanelStyle
	if m.focusedPanel == PanelPositions {
		panelStyle = styles.FocusedPanelStyle
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		m.positionsTable.View(),
	)

	return panelStyle.
		Width(width).
		Height(10).
		Render(content)
}

// Render AI analysis panel
func (m Model) renderAIPanel(width int) string {
	title := styles.AIStyle.Render("💭 LIVE AI ANALYSIS")

	panelStyle := styles.PanelStyle
	if m.focusedPanel == PanelAI {
		panelStyle = styles.FocusedPanelStyle
	}

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		styles.BaseStyle.Width(width-4).Render(m.aiMessage),
	)

	return panelStyle.
		Width(width).
		Height(12).
		Render(content)
}

// Render logs panel
func (m Model) renderLogsPanel(width int) string {
	title := styles.TitleStyle.Render("📝 LIVE LOG")

	panelStyle := styles.PanelStyle
	if m.focusedPanel == PanelLogs {
		panelStyle = styles.FocusedPanelStyle
	}

	// Render log entries
	logLines := []string{}
	for i, log := range m.logs {
		if i >= 5 { // Show only last 5 logs
			break
		}

		timeStr := styles.LogTimeStyle.Render(log.Time.Format("15:04:05"))

		var levelStyle lipgloss.Style
		switch log.Level {
		case "INFO":
			levelStyle = styles.LogLevelInfo
		case "WARN":
			levelStyle = styles.LogLevelWarn
		case "ERROR":
			levelStyle = styles.LogLevelError
		case "AI":
			levelStyle = styles.LogLevelAI
		default:
			levelStyle = styles.LogLevelInfo
		}

		levelStr := levelStyle.Render(fmt.Sprintf("[%-4s]", log.Level))
		message := styles.BaseStyle.Render(log.Message)

		logLines = append(logLines, fmt.Sprintf("%s %s %s", timeStr, levelStr, message))
	}

	logsContent := strings.Join(logLines, "\n")

	content := lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		"",
		logsContent,
	)

	return panelStyle.
		Width(width).
		Height(9).
		Render(content)
}

// Render footer
func (m Model) renderFooter() string {
	keys := []string{
		styles.FooterKeyStyle.Render("[1]") + " Market",
		styles.FooterKeyStyle.Render("[2]") + " Traders",
		styles.FooterKeyStyle.Render("[3]") + " Signals",
		styles.FooterKeyStyle.Render("[4]") + " Positions",
		styles.FooterKeyStyle.Render("[5]") + " AI",
		styles.FooterKeyStyle.Render("[6]") + " Logs",
		styles.FooterKeyStyle.Render("[?]") + " Help",
		styles.FooterKeyStyle.Render("[Q]") + " Quit",
	}

	footerContent := strings.Join(keys, " ")

	return styles.FooterStyle.
		Width(m.width - 4).
		Render(footerContent)
}

// Render help screen
func (m Model) renderHelp() string {
	helpText := `
╔════════════════════════════════════════════════════════════════╗
║                   AI CRYPTO TRADER - HELP                      ║
╚════════════════════════════════════════════════════════════════╝

NAVIGATION:
  1-6         Switch between panels
  Tab         Next panel
  Shift+Tab   Previous panel
  ↑/↓         Navigate within tables
  Enter       Select/Action on item

ACTIONS:
  r           Refresh data
  c           Create new trader
  e           Execute trade (when position selected)
  v           View detailed chart

GENERAL:
  ?           Toggle this help
  q, Ctrl+C   Quit application

Press any key to return...
`

	return styles.PanelStyle.
		Width(70).
		Align(lipgloss.Center).
		Render(helpText)
}
