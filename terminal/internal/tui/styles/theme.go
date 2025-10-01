package styles

import (
	"github.com/charmbracelet/lipgloss"
)

// Color palette
var (
	// Base colors
	Background = lipgloss.Color("#1a1b26")
	Foreground = lipgloss.Color("#c0caf5")

	// Status colors
	Profit    = lipgloss.Color("#9ece6a") // Green
	Loss      = lipgloss.Color("#f7768e") // Red
	Warning   = lipgloss.Color("#e0af68") // Yellow
	Info      = lipgloss.Color("#7aa2f7") // Blue
	AI        = lipgloss.Color("#bb9af7") // Purple

	// UI colors
	Border    = lipgloss.Color("#565f89")
	Highlight = lipgloss.Color("#7aa2f7")
	Muted     = lipgloss.Color("#565f89")
)

// Styles
var (
	// Base styles
	BaseStyle = lipgloss.NewStyle().
			Foreground(Foreground).
			Background(Background)

	// Header
	HeaderStyle = lipgloss.NewStyle().
			Foreground(Info).
			Background(Background).
			Bold(true).
			Padding(0, 1)

	// Panel styles
	PanelStyle = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(Border).
			Padding(0, 1)

	FocusedPanelStyle = lipgloss.NewStyle().
				Border(lipgloss.RoundedBorder()).
				BorderForeground(Highlight).
				Padding(0, 1)

	// Title styles
	TitleStyle = lipgloss.NewStyle().
			Foreground(Info).
			Bold(true)

	// Status styles
	ProfitStyle = lipgloss.NewStyle().
			Foreground(Profit).
			Bold(true)

	LossStyle = lipgloss.NewStyle().
			Foreground(Loss).
			Bold(true)

	WarningStyle = lipgloss.NewStyle().
			Foreground(Warning).
			Bold(true)

	InfoStyle = lipgloss.NewStyle().
			Foreground(Info)

	AIStyle = lipgloss.NewStyle().
		Foreground(AI).
		Bold(true)

	// Table styles
	TableHeaderStyle = lipgloss.NewStyle().
				Foreground(Info).
				Bold(true).
				Align(lipgloss.Center)

	TableCellStyle = lipgloss.NewStyle().
			Foreground(Foreground).
			Padding(0, 1)

	SelectedRowStyle = lipgloss.NewStyle().
				Foreground(Background).
				Background(Highlight).
				Bold(true)

	// Log styles
	LogTimeStyle = lipgloss.NewStyle().
			Foreground(Muted)

	LogLevelInfo = lipgloss.NewStyle().
			Foreground(Info).
			Bold(true)

	LogLevelWarn = lipgloss.NewStyle().
			Foreground(Warning).
			Bold(true)

	LogLevelError = lipgloss.NewStyle().
			Foreground(Loss).
			Bold(true)

	LogLevelAI = lipgloss.NewStyle().
			Foreground(AI).
			Bold(true)

	// Footer
	FooterStyle = lipgloss.NewStyle().
			Foreground(Muted).
			Background(Background).
			Padding(0, 1)

	FooterKeyStyle = lipgloss.NewStyle().
			Foreground(Info).
			Bold(true)

	// Chart styles
	ChartStyle = lipgloss.NewStyle().
			Foreground(Info)

	VolumeBarStyle = lipgloss.NewStyle().
			Foreground(Muted)

	// Badge styles
	BadgeSuccess = lipgloss.NewStyle().
			Foreground(Background).
			Background(Profit).
			Bold(true).
			Padding(0, 1)

	BadgeError = lipgloss.NewStyle().
			Foreground(Background).
			Background(Loss).
			Bold(true).
			Padding(0, 1)

	BadgeWarning = lipgloss.NewStyle().
			Foreground(Background).
			Background(Warning).
			Bold(true).
			Padding(0, 1)

	BadgeInfo = lipgloss.NewStyle().
			Foreground(Background).
			Background(Info).
			Bold(true).
			Padding(0, 1)
)

// Helper functions
func PriceChange(value float64) lipgloss.Style {
	if value > 0 {
		return ProfitStyle
	} else if value < 0 {
		return LossStyle
	}
	return BaseStyle
}

func PNLStyle(pnl float64) lipgloss.Style {
	if pnl > 0 {
		return ProfitStyle
	} else if pnl < 0 {
		return LossStyle
	}
	return BaseStyle
}

func StatusBadge(status string) lipgloss.Style {
	switch status {
	case "open", "active", "watching":
		return BadgeSuccess
	case "closed", "inactive":
		return BadgeInfo
	case "error", "failed":
		return BadgeError
	case "pending", "processing":
		return BadgeWarning
	default:
		return BadgeInfo
	}
}
