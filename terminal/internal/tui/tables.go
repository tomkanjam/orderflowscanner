package tui

import (
	"fmt"
	"time"

	"github.com/charmbracelet/bubbles/table"
	"github.com/charmbracelet/lipgloss"
	"github.com/yourusername/aitrader-tui/internal/tui/styles"
)

// Create market overview table
func (m Model) createMarketTable() table.Model {
	columns := []table.Column{
		{Title: "Symbol", Width: 12},
		{Title: "Price", Width: 12},
		{Title: "24h Change", Width: 14},
		{Title: "Volume", Width: 12},
		{Title: "Chart", Width: 12},
	}

	rows := []table.Row{}
	for _, market := range m.markets {
		changeStr := fmt.Sprintf("%.2f%%", market.ChangePct24h)
		if market.ChangePct24h > 0 {
			changeStr = "↑ " + changeStr
		} else if market.ChangePct24h < 0 {
			changeStr = "↓ " + changeStr
		}

		volumeStr := formatVolume(market.Volume24h)

		rows = append(rows, table.Row{
			market.Symbol,
			fmt.Sprintf("$%.2f", market.Price),
			changeStr,
			volumeStr,
			market.Sparkline,
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(m.focusedPanel == PanelMarket),
		table.WithHeight(len(rows)),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(styles.Border).
		BorderBottom(true).
		Bold(true).
		Foreground(styles.Info)

	s.Selected = s.Selected.
		Foreground(styles.Background).
		Background(styles.Highlight).
		Bold(true)

	t.SetStyles(s)
	return t
}

// Create traders table
func (m Model) createTradersTable() table.Model {
	columns := []table.Column{
		{Title: "Name", Width: 20},
		{Title: "Status", Width: 10},
		{Title: "Interval", Width: 10},
		{Title: "Signals", Width: 8},
		{Title: "Last Check", Width: 15},
	}

	rows := []table.Row{}
	for _, trader := range m.traders {
		statusIcon := "✓"
		if trader.Status == "inactive" {
			statusIcon = "○"
		}

		lastCheck := time.Since(trader.LastCheck)
		lastCheckStr := fmt.Sprintf("%ds ago", int(lastCheck.Seconds()))

		rows = append(rows, table.Row{
			trader.Name,
			statusIcon + " " + trader.Status,
			trader.Interval,
			fmt.Sprintf("%d", trader.SignalsCount),
			lastCheckStr,
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(m.focusedPanel == PanelTraders),
		table.WithHeight(len(rows)),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(styles.Border).
		BorderBottom(true).
		Bold(true).
		Foreground(styles.Info)

	s.Selected = s.Selected.
		Foreground(styles.Background).
		Background(styles.Highlight).
		Bold(true)

	t.SetStyles(s)
	return t
}

// Create signals table
func (m Model) createSignalsTable() table.Model {
	columns := []table.Column{
		{Title: "Symbol", Width: 10},
		{Title: "Status", Width: 14},
		{Title: "Entry", Width: 12},
		{Title: "Current", Width: 12},
		{Title: "Confidence", Width: 12},
		{Title: "Age", Width: 10},
	}

	rows := []table.Row{}
	for _, signal := range m.signals {
		statusIcon := "●"
		if signal.Status == "position_open" {
			statusIcon = "◉"
		} else if signal.Status == "closed" {
			statusIcon = "○"
		}

		age := time.Since(signal.CreatedAt)
		ageStr := formatDuration(age)

		confidenceBar := renderConfidenceBar(signal.Confidence)

		rows = append(rows, table.Row{
			signal.Symbol,
			statusIcon + " " + signal.Status,
			fmt.Sprintf("$%.2f", signal.EntryPrice),
			fmt.Sprintf("$%.2f", signal.CurrentPrice),
			confidenceBar,
			ageStr,
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(m.focusedPanel == PanelSignals),
		table.WithHeight(len(rows)),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(styles.Border).
		BorderBottom(true).
		Bold(true).
		Foreground(styles.Info)

	s.Selected = s.Selected.
		Foreground(styles.Background).
		Background(styles.Highlight).
		Bold(true)

	t.SetStyles(s)
	return t
}

// Create positions table
func (m Model) createPositionsTable() table.Model {
	columns := []table.Column{
		{Title: "Symbol", Width: 10},
		{Title: "Side", Width: 6},
		{Title: "Entry", Width: 10},
		{Title: "Current", Width: 10},
		{Title: "PNL", Width: 12},
		{Title: "Chart", Width: 10},
	}

	rows := []table.Row{}
	for _, pos := range m.positions {
		pnlStr := fmt.Sprintf("$%.2f", pos.PNL)
		if pos.PNL > 0 {
			pnlStr = "+" + pnlStr
		}
		pnlStr += fmt.Sprintf(" (%.1f%%)", pos.PNLPct)

		rows = append(rows, table.Row{
			pos.Symbol,
			pos.Side,
			fmt.Sprintf("$%.2f", pos.EntryPrice),
			fmt.Sprintf("$%.2f", pos.CurrentPrice),
			pnlStr,
			pos.Sparkline,
		})
	}

	t := table.New(
		table.WithColumns(columns),
		table.WithRows(rows),
		table.WithFocused(m.focusedPanel == PanelPositions),
		table.WithHeight(len(rows)),
	)

	s := table.DefaultStyles()
	s.Header = s.Header.
		BorderStyle(lipgloss.NormalBorder()).
		BorderForeground(styles.Border).
		BorderBottom(true).
		Bold(true).
		Foreground(styles.Info)

	s.Selected = s.Selected.
		Foreground(styles.Background).
		Background(styles.Highlight).
		Bold(true)

	t.SetStyles(s)
	return t
}

// Helper functions
func formatVolume(vol float64) string {
	if vol >= 1e9 {
		return fmt.Sprintf("%.1fB", vol/1e9)
	} else if vol >= 1e6 {
		return fmt.Sprintf("%.1fM", vol/1e6)
	} else if vol >= 1e3 {
		return fmt.Sprintf("%.1fK", vol/1e3)
	}
	return fmt.Sprintf("%.0f", vol)
}

func formatDuration(d time.Duration) string {
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	} else if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh", int(d.Hours()))
}

func renderConfidenceBar(confidence int) string {
	filled := confidence / 5
	empty := 20 - filled

	bar := ""
	for i := 0; i < filled; i++ {
		bar += "█"
	}
	for i := 0; i < empty; i++ {
		bar += "░"
	}

	return fmt.Sprintf("%s %d%%", bar, confidence)
}
