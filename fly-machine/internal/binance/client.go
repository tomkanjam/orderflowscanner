package binance

import (
	"context"
	"fmt"

	"github.com/adshao/go-binance/v2"
	"github.com/rs/zerolog/log"
	"go.uber.org/ratelimit"
)

// Client wraps Binance REST API client with rate limiting
type Client struct {
	client  *binance.Client
	limiter ratelimit.Limiter
}

// NewClient creates a new Binance REST client
func NewClient(apiKey, secretKey string) *Client {
	client := binance.NewClient(apiKey, secretKey)

	return &Client{
		client:  client,
		limiter: ratelimit.New(10), // 10 requests per second
	}
}

// NewOrder creates a market order
func (c *Client) NewOrder(symbol, side, orderType string, quantity float64) (*binance.CreateOrderResponse, error) {
	c.limiter.Take()

	var orderSide binance.SideType
	if side == "BUY" {
		orderSide = binance.SideTypeBuy
	} else {
		orderSide = binance.SideTypeSell
	}

	order, err := c.client.NewCreateOrderService().
		Symbol(symbol).
		Side(orderSide).
		Type(binance.OrderTypeMarket).
		Quantity(fmt.Sprintf("%.8f", quantity)).
		Do(context.Background())

	if err != nil {
		log.Error().
			Err(err).
			Str("symbol", symbol).
			Str("side", side).
			Float64("quantity", quantity).
			Msg("Failed to create market order")
		return nil, err
	}

	log.Info().
		Str("symbol", symbol).
		Str("side", side).
		Float64("quantity", quantity).
		Int64("order_id", order.OrderID).
		Msg("Market order created")

	return order, nil
}

// NewLimitOrder creates a limit order
func (c *Client) NewLimitOrder(symbol, side string, quantity, price float64) (*binance.CreateOrderResponse, error) {
	c.limiter.Take()

	var orderSide binance.SideType
	if side == "BUY" {
		orderSide = binance.SideTypeBuy
	} else {
		orderSide = binance.SideTypeSell
	}

	order, err := c.client.NewCreateOrderService().
		Symbol(symbol).
		Side(orderSide).
		Type(binance.OrderTypeLimit).
		TimeInForce(binance.TimeInForceTypeGTC).
		Quantity(fmt.Sprintf("%.8f", quantity)).
		Price(fmt.Sprintf("%.8f", price)).
		Do(context.Background())

	if err != nil {
		log.Error().
			Err(err).
			Str("symbol", symbol).
			Str("side", side).
			Float64("quantity", quantity).
			Float64("price", price).
			Msg("Failed to create limit order")
		return nil, err
	}

	log.Info().
		Str("symbol", symbol).
		Str("side", side).
		Float64("quantity", quantity).
		Float64("price", price).
		Int64("order_id", order.OrderID).
		Msg("Limit order created")

	return order, nil
}

// NewStopLossOrder creates a stop-loss market order
func (c *Client) NewStopLossOrder(symbol, side string, quantity, stopPrice float64) (*binance.CreateOrderResponse, error) {
	c.limiter.Take()

	var orderSide binance.SideType
	if side == "BUY" {
		orderSide = binance.SideTypeBuy
	} else {
		orderSide = binance.SideTypeSell
	}

	order, err := c.client.NewCreateOrderService().
		Symbol(symbol).
		Side(orderSide).
		Type(binance.OrderTypeStopLossLimit).
		TimeInForce(binance.TimeInForceTypeGTC).
		Quantity(fmt.Sprintf("%.8f", quantity)).
		Price(fmt.Sprintf("%.8f", stopPrice)).
		StopPrice(fmt.Sprintf("%.8f", stopPrice)).
		Do(context.Background())

	if err != nil {
		log.Error().
			Err(err).
			Str("symbol", symbol).
			Str("side", side).
			Float64("stop_price", stopPrice).
			Msg("Failed to create stop-loss order")
		return nil, err
	}

	log.Info().
		Str("symbol", symbol).
		Str("side", side).
		Float64("stop_price", stopPrice).
		Int64("order_id", order.OrderID).
		Msg("Stop-loss order created")

	return order, nil
}

// CancelOrder cancels an existing order
func (c *Client) CancelOrder(symbol string, orderID int64) error {
	c.limiter.Take()

	_, err := c.client.NewCancelOrderService().
		Symbol(symbol).
		OrderID(orderID).
		Do(context.Background())

	if err != nil {
		log.Error().
			Err(err).
			Str("symbol", symbol).
			Int64("order_id", orderID).
			Msg("Failed to cancel order")
		return err
	}

	log.Info().
		Str("symbol", symbol).
		Int64("order_id", orderID).
		Msg("Order cancelled")

	return nil
}

// GetOrder retrieves order status
func (c *Client) GetOrder(symbol string, orderID int64) (*binance.Order, error) {
	c.limiter.Take()

	order, err := c.client.NewGetOrderService().
		Symbol(symbol).
		OrderID(orderID).
		Do(context.Background())

	if err != nil {
		return nil, err
	}

	return order, nil
}

// GetAccount retrieves account information
func (c *Client) GetAccount() (*binance.Account, error) {
	c.limiter.Take()

	account, err := c.client.NewGetAccountService().Do(context.Background())
	if err != nil {
		log.Error().Err(err).Msg("Failed to get account info")
		return nil, err
	}

	return account, nil
}

// GetBalance retrieves balance for a specific asset
func (c *Client) GetBalance(asset string) (float64, error) {
	account, err := c.GetAccount()
	if err != nil {
		return 0, err
	}

	for _, balance := range account.Balances {
		if balance.Asset == asset {
			var free float64
			fmt.Sscanf(balance.Free, "%f", &free)
			return free, nil
		}
	}

	return 0, fmt.Errorf("asset %s not found", asset)
}
