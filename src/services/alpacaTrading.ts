/**
 * Alpaca Trading Service
 *
 * Provides order placement and position management:
 * - Create orders (market, limit)
 * - Get account positions
 * - Get account info (buying power)
 *
 * Uses Alpaca Trading API: https://docs.alpaca.markets/docs/trading-api
 */

const ALPACA_TRADING_URL = process.env.ALPACA_TRADING_URL || 'https://paper-api.alpaca.markets';

// Common headers for all Alpaca API requests
function getHeaders(): HeadersInit {
  return {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY || '',
    'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY || '',
    'Content-Type': 'application/json',
  };
}

// ============================================================================
// Types
// ============================================================================

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type TimeInForce = 'day' | 'gtc' | 'ioc' | 'fok';
export type OrderStatus =
  | 'new'
  | 'partially_filled'
  | 'filled'
  | 'done_for_day'
  | 'canceled'
  | 'expired'
  | 'replaced'
  | 'pending_cancel'
  | 'pending_replace'
  | 'pending_new'
  | 'accepted'
  | 'stopped'
  | 'rejected'
  | 'suspended'
  | 'calculated';

export interface OrderRequest {
  symbol: string;
  qty: number;
  side: OrderSide;
  type: OrderType;
  time_in_force: TimeInForce;
  limit_price?: number;
  client_order_id?: string;
}

export interface OrderResponse {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
  expired_at: string | null;
  canceled_at: string | null;
  failed_at: string | null;
  replaced_at: string | null;
  replaced_by: string | null;
  replaces: string | null;
  asset_id: string;
  symbol: string;
  asset_class: string;
  notional: string | null;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  order_type: string;
  type: string;
  side: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  status: OrderStatus;
  extended_hours: boolean;
  legs: unknown[] | null;
  trail_percent: string | null;
  trail_price: string | null;
  hwm: string | null;
}

export interface Position {
  asset_id: string;
  symbol: string;
  exchange: string;
  asset_class: string;
  asset_marginable: boolean;
  qty: string;
  avg_entry_price: string;
  side: 'long' | 'short';
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  unrealized_intraday_pl: string;
  unrealized_intraday_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
  qty_available: string;
}

export interface Account {
  id: string;
  account_number: string;
  status: string;
  crypto_status: string;
  currency: string;
  buying_power: string;
  regt_buying_power: string;
  daytrading_buying_power: string;
  effective_buying_power: string;
  non_marginable_buying_power: string;
  bod_dtbp: string;
  cash: string;
  accrued_fees: string;
  pending_transfer_in: string;
  portfolio_value: string;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  transfers_blocked: boolean;
  account_blocked: boolean;
  created_at: string;
  trade_suspended_by_user: boolean;
  multiplier: string;
  shorting_enabled: boolean;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  position_market_value: string;
  initial_margin: string;
  maintenance_margin: string;
  last_maintenance_margin: string;
  sma: string;
  daytrade_count: number;
}

export interface AlpacaError {
  code: number;
  message: string;
}

// ============================================================================
// Order Functions
// ============================================================================

/**
 * Create a new order
 */
export async function createOrder(request: OrderRequest): Promise<OrderResponse> {
  const body: Record<string, unknown> = {
    symbol: request.symbol.toUpperCase(),
    qty: request.qty.toString(),
    side: request.side,
    type: request.type,
    time_in_force: request.time_in_force,
  };

  // Add limit price for limit orders
  if (request.type === 'limit' && request.limit_price !== undefined) {
    body.limit_price = request.limit_price.toString();
  }

  // Add client order ID if provided
  if (request.client_order_id) {
    body.client_order_id = request.client_order_id;
  }

  const response = await fetch(`${ALPACA_TRADING_URL}/v2/orders`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to create order: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Get an order by ID
 */
export async function getOrder(orderId: string): Promise<OrderResponse> {
  const response = await fetch(`${ALPACA_TRADING_URL}/v2/orders/${orderId}`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to get order: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Cancel an order by ID
 */
export async function cancelOrder(orderId: string): Promise<void> {
  const response = await fetch(`${ALPACA_TRADING_URL}/v2/orders/${orderId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok && response.status !== 204) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to cancel order: ${errorData.message || response.statusText}`);
  }
}

// ============================================================================
// Position Functions
// ============================================================================

/**
 * Get position for a specific symbol
 * Returns null if no position exists
 */
export async function getPosition(symbol: string): Promise<Position | null> {
  const response = await fetch(
    `${ALPACA_TRADING_URL}/v2/positions/${encodeURIComponent(symbol.toUpperCase())}`,
    { headers: getHeaders() }
  );

  // 404 means no position
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to get position: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Get all positions
 */
export async function getAllPositions(): Promise<Position[]> {
  const response = await fetch(`${ALPACA_TRADING_URL}/v2/positions`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to get positions: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

/**
 * Close a position for a specific symbol
 * Can optionally specify quantity to partially close
 */
export async function closePosition(symbol: string, qty?: number): Promise<OrderResponse> {
  const params = new URLSearchParams();
  if (qty !== undefined) {
    params.set('qty', qty.toString());
  }

  const url = `${ALPACA_TRADING_URL}/v2/positions/${encodeURIComponent(symbol.toUpperCase())}${params.toString() ? `?${params}` : ''}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to close position: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// Account Functions
// ============================================================================

/**
 * Get account information
 */
export async function getAccount(): Promise<Account> {
  const response = await fetch(`${ALPACA_TRADING_URL}/v2/account`, {
    headers: getHeaders(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(`Failed to get account: ${errorData.message || response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse position quantity as a number
 * Returns positive for long, negative for short
 */
export function parsePositionQty(position: Position): number {
  const qty = parseFloat(position.qty);
  return position.side === 'short' ? -Math.abs(qty) : Math.abs(qty);
}

/**
 * Determine order side based on position and intent
 * For selling: checks if we're selling long, selling short, or both
 */
export function determineOrderSide(
  currentPosition: Position | null,
  requestedQty: number,
  isSellRequest: boolean
): {
  orders: Array<{ side: OrderSide; qty: number; description: string }>;
  positionAction: 'close_long' | 'partial_sell' | 'short_sell' | 'split_order' | 'buy' | null;
} {
  // Buy request - straightforward
  if (!isSellRequest) {
    return {
      orders: [{ side: 'buy', qty: requestedQty, description: `buy ${requestedQty}` }],
      positionAction: 'buy',
    };
  }

  // Sell request - need to check position
  if (!currentPosition) {
    // No position = short sell
    return {
      orders: [{ side: 'sell', qty: requestedQty, description: `sell short ${requestedQty}` }],
      positionAction: 'short_sell',
    };
  }

  const positionQty = parsePositionQty(currentPosition);

  // Already short - this adds to short position
  if (positionQty < 0) {
    return {
      orders: [{ side: 'sell', qty: requestedQty, description: `sell short ${requestedQty}` }],
      positionAction: 'short_sell',
    };
  }

  // Long position
  if (positionQty > 0) {
    if (requestedQty <= positionQty) {
      // Partial or full close of long position
      const action = requestedQty === positionQty ? 'close_long' : 'partial_sell';
      return {
        orders: [{ side: 'sell', qty: requestedQty, description: `sell long ${requestedQty}` }],
        positionAction: action,
      };
    } else {
      // Split order: sell long shares + sell short the remainder
      const longQty = positionQty;
      const shortQty = requestedQty - positionQty;
      return {
        orders: [
          { side: 'sell', qty: longQty, description: `sell long ${longQty}` },
          { side: 'sell', qty: shortQty, description: `sell short ${shortQty}` },
        ],
        positionAction: 'split_order',
      };
    }
  }

  // Zero position (flat) - short sell
  return {
    orders: [{ side: 'sell', qty: requestedQty, description: `sell short ${requestedQty}` }],
    positionAction: 'short_sell',
  };
}

/**
 * Format order type for display
 */
export function formatOrderType(type: OrderType, limitPrice?: number): string {
  if (type === 'limit' && limitPrice !== undefined) {
    return `Limit @ $${limitPrice.toFixed(2)}`;
  }
  return type === 'market' ? 'Market' : 'Limit';
}

/**
 * Generate a unique client order ID
 */
export function generateClientOrderId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `finagent_${timestamp}_${random}`;
}
