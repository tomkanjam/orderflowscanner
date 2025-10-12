package server

import (
	"context"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/vyx/go-screener/internal/trader"
	"github.com/vyx/go-screener/pkg/supabase"
	"github.com/vyx/go-screener/pkg/types"
)

// TraderHandler handles trader lifecycle API endpoints
type TraderHandler struct {
	manager  *trader.Manager
	supabase *supabase.Client
}

// NewTraderHandler creates a new trader handler
func NewTraderHandler(manager *trader.Manager, supabase *supabase.Client) *TraderHandler {
	return &TraderHandler{
		manager:  manager,
		supabase: supabase,
	}
}

// StartTrader handles POST /api/v1/traders/{id}/start
func (h *TraderHandler) StartTrader(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	traderID := vars["id"]

	// Get user from context (set by TierMiddleware)
	user, ok := r.Context().Value("user").(*types.User)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized",
		})
		return
	}

	// Get trader from registry to verify ownership
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error": "Trader not found",
		})
		return
	}

	// Verify user owns this trader
	if status.UserID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error": "You do not have permission to start this trader",
		})
		return
	}

	// Start trader with tier information for quota enforcement
	if err := h.manager.Start(traderID, string(user.SubscriptionTier)); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"trader":  status,
	})
}

// StopTrader handles POST /api/v1/traders/{id}/stop
func (h *TraderHandler) StopTrader(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	traderID := vars["id"]

	// Get user ID from context
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized",
		})
		return
	}

	// Get trader status to verify ownership
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error": "Trader not found",
		})
		return
	}

	// Verify user owns this trader
	if status.UserID != userID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error": "You do not have permission to stop this trader",
		})
		return
	}

	// Stop trader
	if err := h.manager.Stop(traderID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"trader":  status,
	})
}

// GetTraderStatus handles GET /api/v1/traders/{id}/status
func (h *TraderHandler) GetTraderStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	traderID := vars["id"]

	// Get user ID from context
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized",
		})
		return
	}

	// Get trader status
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{
			"error": "Trader not found",
		})
		return
	}

	// Verify user owns this trader
	if status.UserID != userID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error": "You do not have permission to view this trader",
		})
		return
	}

	respondJSON(w, http.StatusOK, status)
}

// ListActiveTraders handles GET /api/v1/traders/active
func (h *TraderHandler) ListActiveTraders(w http.ResponseWriter, r *http.Request) {
	// Get user ID from context
	userID, ok := r.Context().Value("userID").(string)
	if !ok {
		respondJSON(w, http.StatusUnauthorized, map[string]string{
			"error": "Unauthorized",
		})
		return
	}

	// Get all traders for this user
	traders := h.manager.ListByUser(userID)

	// Convert to status objects
	statuses := make([]trader.TraderStatus, 0, len(traders))
	for _, t := range traders {
		statuses = append(statuses, t.GetStatus())
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"traders": statuses,
		"count":   len(statuses),
	})
}

// GetManagerMetrics handles GET /api/v1/traders/metrics (admin only)
func (h *TraderHandler) GetManagerMetrics(w http.ResponseWriter, r *http.Request) {
	// TODO: Add admin check

	metrics := h.manager.GetMetrics()
	respondJSON(w, http.StatusOK, metrics)
}

// AuthMiddleware validates Supabase JWT tokens
func AuthMiddleware(supabase *supabase.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Extract token from Authorization header
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Missing Authorization header",
				})
				return
			}

			// Token format: "Bearer <token>"
			var token string
			if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
				token = authHeader[7:]
			} else {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Invalid Authorization header format",
				})
				return
			}

			// TODO: Validate JWT token with Supabase
			// For now, we'll extract the user ID from the token payload
			// In production, this should verify the signature

			// Placeholder: Extract user ID from token (not secure, just for structure)
			// In production, use a proper JWT library to verify and decode
			userID := "placeholder-user-id"

			// Store user ID in context
			ctx := r.Context()
			ctx = context.WithValue(ctx, "userID", userID)
			ctx = context.WithValue(ctx, "token", token)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// TierMiddleware checks user subscription tier and enforces limits
func TierMiddleware(supabase *supabase.Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, ok := r.Context().Value("userID").(string)
			if !ok {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Unauthorized",
				})
				return
			}

			// Get user from database
			user, err := supabase.GetUser(userID)
			if err != nil {
				respondJSON(w, http.StatusInternalServerError, map[string]string{
					"error": "Failed to get user information",
				})
				return
			}

			// Check tier restrictions
			// FREE tier: cannot start traders
			if user.SubscriptionTier == types.TierFree {
				respondJSON(w, http.StatusForbidden, map[string]string{
					"error":   "Upgrade required",
					"message": "Free tier users cannot start traders. Upgrade to Pro or Elite to use this feature.",
				})
				return
			}

			// Store user in context for handler access
			ctx := context.WithValue(r.Context(), "user", user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
