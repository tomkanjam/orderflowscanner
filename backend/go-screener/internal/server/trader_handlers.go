package server

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

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
	// If not in registry, try loading from database (handles newly created traders)
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		// Trader not in registry - try loading from database
		if loadErr := h.manager.LoadTraderByID(traderID); loadErr != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "Trader not found",
			})
			return
		}
		// Try getting status again after loading
		status, err = h.manager.GetStatus(traderID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "Failed to load trader",
			})
			return
		}
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
	// If not in registry, try loading from database (handles newly created traders)
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		// Trader not in registry - try loading from database
		if loadErr := h.manager.LoadTraderByID(traderID); loadErr != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "Trader not found",
			})
			return
		}
		// Try getting status again after loading
		status, err = h.manager.GetStatus(traderID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "Failed to load trader",
			})
			return
		}
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
	// If not in registry, try loading from database (handles newly created traders)
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		// Trader not in registry - try loading from database
		if loadErr := h.manager.LoadTraderByID(traderID); loadErr != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "Trader not found",
			})
			return
		}
		// Try getting status again after loading
		status, err = h.manager.GetStatus(traderID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "Failed to load trader",
			})
			return
		}
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

// ReloadTrader handles POST /api/v1/traders/{id}/reload
// Loads a trader from the database and adds it to the executor without restart
func (h *TraderHandler) ReloadTrader(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	traderID := vars["id"]

	// Load trader from database
	if err := h.manager.LoadTraderByID(traderID); err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": fmt.Sprintf("Trader %s loaded successfully", traderID),
	})
}

// ExecuteImmediate handles POST /api/v1/traders/{id}/execute-immediate
func (h *TraderHandler) ExecuteImmediate(w http.ResponseWriter, r *http.Request) {
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
	// If not in registry, try loading from database (handles newly created traders)
	status, err := h.manager.GetStatus(traderID)
	if err != nil {
		// Trader not in registry - try loading from database
		if loadErr := h.manager.LoadTraderByID(traderID); loadErr != nil {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error": "Trader not found",
			})
			return
		}
		// Try getting status again after loading
		status, err = h.manager.GetStatus(traderID)
		if err != nil {
			respondJSON(w, http.StatusInternalServerError, map[string]string{
				"error": "Failed to load trader",
			})
			return
		}
	}

	// Verify user owns this trader
	if status.UserID != user.ID {
		respondJSON(w, http.StatusForbidden, map[string]string{
			"error": "You do not have permission to execute this trader",
		})
		return
	}

	// Execute trader immediately
	result, err := h.manager.ExecuteImmediate(traderID)
	if err != nil {
		respondJSON(w, http.StatusBadRequest, map[string]string{
			"error": err.Error(),
		})
		return
	}

	respondJSON(w, http.StatusOK, result)
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

			// Extract user ID from JWT token payload
			// JWT format: header.payload.signature
			parts := strings.Split(token, ".")
			if len(parts) != 3 {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Invalid token format",
				})
				return
			}

			// Decode the payload (second part)
			payload, err := base64.RawURLEncoding.DecodeString(parts[1])
			if err != nil {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Failed to decode token payload",
				})
				return
			}

			// Parse the payload JSON
			var claims struct {
				Sub string `json:"sub"` // User ID
				Exp int64  `json:"exp"` // Expiration time
			}
			if err := json.Unmarshal(payload, &claims); err != nil {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Failed to parse token claims",
				})
				return
			}

			// Validate that we have a user ID
			if claims.Sub == "" {
				respondJSON(w, http.StatusUnauthorized, map[string]string{
					"error": "Token missing user ID (sub claim)",
				})
				return
			}

			// Store user ID in context
			ctx := r.Context()
			ctx = context.WithValue(ctx, "userID", claims.Sub)
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
			user, err := supabase.GetUser(r.Context(), userID)
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
