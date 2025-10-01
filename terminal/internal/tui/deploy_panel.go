package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/yourusername/aitrader-tui/internal/tui/styles"
)

// renderDeployPanel renders the cloud deployment panel
func (m Model) renderDeployPanel() string {
	title := styles.TitleStyle.Render("☁️  CLOUD DEPLOYMENT")

	var content string

	switch m.deployStatus {
	case "local":
		content = m.renderLocalStatus()
	case "deploying":
		content = m.renderDeployingStatus()
	case "deployed":
		content = m.renderDeployedStatus()
	default:
		content = "Unknown deployment status"
	}

	// Panel style
	panelStyle := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(styles.Highlight).
		Padding(1, 2).
		Width(m.width - 4)

	return lipgloss.JoinVertical(
		lipgloss.Left,
		title,
		panelStyle.Render(content),
	)
}

// renderLocalStatus shows when running locally
func (m Model) renderLocalStatus() string {
	statusLine := lipgloss.NewStyle().
		Foreground(styles.Profit).
		Render("● Status: Running Locally")

	benefits := []string{
		"✓ Runs 24/7 without your computer",
		"✓ Ultra-low latency trading",
		"✓ Automatic restarts on errors",
		"✓ Monitor from anywhere",
	}

	benefitsText := lipgloss.NewStyle().
		Foreground(styles.Muted).
		Render(strings.Join(benefits, "\n"))

	actions := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(styles.Border).
		Padding(1, 2).
		Width(40).
		Render(`[Enter] Deploy to Fly.io
[T] Test Configuration
[H] View Deployment Help`)

	deployInfo := lipgloss.NewStyle().
		Foreground(styles.Info).
		Render("\nDeploy your traders to run 24/7 in the cloud:")

	return lipgloss.JoinVertical(
		lipgloss.Left,
		statusLine,
		"",
		deployInfo,
		"",
		actions,
		"",
		"Benefits:",
		benefitsText,
	)
}

// renderDeployingStatus shows deployment progress
func (m Model) renderDeployingStatus() string {
	header := lipgloss.NewStyle().
		Foreground(styles.Info).
		Bold(true).
		Render("🚀 Deploying to Fly.io...")

	// Show deployment logs
	logLines := []string{}
	for _, log := range m.deployLogs {
		logLines = append(logLines, lipgloss.NewStyle().
			Foreground(styles.Muted).
			Render("  "+log))
	}

	logsText := strings.Join(logLines, "\n")

	waitMsg := lipgloss.NewStyle().
		Foreground(styles.Warning).
		Italic(true).
		Render("\nPlease wait...")

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		"",
		logsText,
		waitMsg,
	)
}

// renderDeployedStatus shows when deployed to cloud
func (m Model) renderDeployedStatus() string {
	header := lipgloss.NewStyle().
		Foreground(styles.Profit).
		Bold(true).
		Render("✅ Deployed Successfully!")

	urlLine := lipgloss.NewStyle().
		Foreground(styles.Info).
		Render(fmt.Sprintf("\nCloud URL: %s", m.cloudURL))

	statusLine := lipgloss.NewStyle().
		Foreground(styles.Profit).
		Render(fmt.Sprintf("Status: %s", m.cloudStatus))

	actions := lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(styles.Border).
		Padding(1, 2).
		Width(40).
		Render(`[M] Open Monitoring Dashboard
[L] View Cloud Logs
[S] Stop Cloud Instance
[R] Redeploy`)

	info := lipgloss.NewStyle().
		Foreground(styles.Muted).
		Italic(true).
		Render("\nYour traders are running in the cloud!\nMonitor them from this TUI or close it.")

	return lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		urlLine,
		statusLine,
		"",
		actions,
		info,
	)
}
