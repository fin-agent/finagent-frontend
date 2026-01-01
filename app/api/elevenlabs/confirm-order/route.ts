/**
 * Confirm Order Webhook
 *
 * Executes a stock order after user confirms with "Yes".
 * Receives order details from ElevenLabs agent context (agent memory).
 * Supports split orders (sell long + sell short).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCompanyName } from '@/src/lib/symbol-utils';
import {
  createOrder,
  generateClientOrderId,
  type OrderSide,
  type OrderType,
  type OrderResponse,
} from '@/src/services/alpacaTrading';
import { startTrace, formatTraceForResponse } from '@/src/lib/request-trace';

interface SplitOrder {
  long_qty: number;
  short_qty: number;
}

interface OrderExecutionUIData {
  type: 'order-execution';
  success: boolean;
  orders: Array<{
    orderId: string;
    symbol: string;
    companyName: string;
    side: OrderSide;
    quantity: number;
    orderType: OrderType;
    limitPrice: number | null;
    status: string;
    description: string;
  }>;
  message: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export async function POST(req: NextRequest) {
  const trace = startTrace('confirm-order');

  try {
    const body = await req.json();

    // Log request body keys for debugging
    console.log('📬 [confirm-order] Request body keys:', Object.keys(body));

    // Flexible parameter extraction (ElevenLabs passes order details from context)
    const symbol = body.symbol || body.parameters?.symbol || body.body?.symbol || body.body?.parameters?.symbol;
    const rawQuantity = body.quantity || body.parameters?.quantity || body.body?.quantity || body.body?.parameters?.quantity;
    const rawSide = body.side || body.parameters?.side || body.body?.side || body.body?.parameters?.side;
    const rawOrderType = body.order_type || body.parameters?.order_type || body.body?.order_type || body.body?.parameters?.order_type;
    const rawLimitPrice = body.limit_price || body.parameters?.limit_price || body.body?.limit_price || body.body?.parameters?.limit_price;
    const confirmed = body.confirmed ?? body.parameters?.confirmed ?? body.body?.confirmed ?? body.body?.parameters?.confirmed;
    const splitOrder: SplitOrder | undefined = body.split_order || body.parameters?.split_order || body.body?.split_order || body.body?.parameters?.split_order;

    trace.logInput({ symbol, rawQuantity, rawSide, rawOrderType, rawLimitPrice, confirmed, splitOrder });

    // Handle cancellation
    if (confirmed === false) {
      trace.logResponse({ voiceText: 'Order cancelled', uiDataSummary: 'cancelled' }, 'passed');
      const completedTrace = trace.complete();

      return NextResponse.json({
        response: 'Order cancelled. What would you like to change in your order?',
        uiData: {
          type: 'order-execution',
          success: false,
          orders: [],
          message: 'Order cancelled by user',
        },
        _debug: formatTraceForResponse(completedTrace),
      });
    }

    // Validate required parameters
    if (!symbol) {
      trace.logError('No symbol provided');
      return NextResponse.json({
        response: 'I need the symbol to confirm the order. Could you please place the order again?',
        uiData: null,
      });
    }

    if (!rawSide || !['buy', 'sell'].includes(rawSide.toLowerCase())) {
      trace.logError('Invalid or missing side');
      return NextResponse.json({
        response: 'I need to know if this is a buy or sell order. Could you please place the order again?',
        uiData: null,
      });
    }

    const side: OrderSide = rawSide.toLowerCase() as OrderSide;
    const quantity = rawQuantity ? Number(rawQuantity) : 0;
    const orderType: OrderType = rawLimitPrice ? 'limit' : (rawOrderType?.toLowerCase() === 'limit' ? 'limit' : 'market');
    const limitPrice = rawLimitPrice ? Number(rawLimitPrice) : undefined;
    const companyName = getCompanyName(symbol.toUpperCase());

    // Handle split order (sell long + sell short)
    if (splitOrder && splitOrder.long_qty > 0 && splitOrder.short_qty > 0) {
      console.log(`🔀 [${trace.traceId}] Split order: sell long ${splitOrder.long_qty} + sell short ${splitOrder.short_qty}`);

      const orders: OrderResponse[] = [];
      const orderResults: OrderExecutionUIData['orders'] = [];

      try {
        // Execute sell long order first
        const longOrder = await createOrder({
          symbol: symbol.toUpperCase(),
          qty: splitOrder.long_qty,
          side: 'sell',
          type: orderType,
          time_in_force: 'day',
          limit_price: limitPrice,
          client_order_id: generateClientOrderId(),
        });
        orders.push(longOrder);
        orderResults.push({
          orderId: longOrder.id,
          symbol: symbol.toUpperCase(),
          companyName,
          side: 'sell',
          quantity: splitOrder.long_qty,
          orderType,
          limitPrice: limitPrice || null,
          status: longOrder.status,
          description: `Sell long ${splitOrder.long_qty} shares`,
        });

        // Execute sell short order
        const shortOrder = await createOrder({
          symbol: symbol.toUpperCase(),
          qty: splitOrder.short_qty,
          side: 'sell',
          type: orderType,
          time_in_force: 'day',
          limit_price: limitPrice,
          client_order_id: generateClientOrderId(),
        });
        orders.push(shortOrder);
        orderResults.push({
          orderId: shortOrder.id,
          symbol: symbol.toUpperCase(),
          companyName,
          side: 'sell',
          quantity: splitOrder.short_qty,
          orderType,
          limitPrice: limitPrice || null,
          status: shortOrder.status,
          description: `Sell short ${splitOrder.short_qty} shares`,
        });

        const voiceResponse = orderType === 'limit'
          ? `Orders confirmed. Limit order to sell long ${splitOrder.long_qty} shares and short sell ${splitOrder.short_qty} shares of ${companyName} at ${formatCurrency(limitPrice!)} have been submitted.`
          : `Orders confirmed. Market order to sell long ${splitOrder.long_qty} shares and short sell ${splitOrder.short_qty} shares of ${companyName} have been submitted. Please check your trading app for execution details.`;

        trace.logResponse({
          voiceText: voiceResponse,
          uiDataSummary: `Split order: ${splitOrder.long_qty} long + ${splitOrder.short_qty} short`,
        }, 'passed');

        const completedTrace = trace.complete();

        return NextResponse.json({
          response: voiceResponse,
          uiData: {
            type: 'order-execution',
            success: true,
            orders: orderResults,
            message: 'Split orders submitted successfully',
          },
          _debug: formatTraceForResponse(completedTrace),
        });

      } catch (orderError) {
        const errorMessage = orderError instanceof Error ? orderError.message : 'Unknown error';
        trace.logError(`Split order execution failed: ${errorMessage}`);
        const completedTrace = trace.complete();

        return NextResponse.json({
          response: `Sorry, there was an error placing your order: ${errorMessage}`,
          uiData: {
            type: 'order-execution',
            success: false,
            orders: orderResults, // Return any successful orders
            message: `Order failed: ${errorMessage}`,
          },
          _debug: formatTraceForResponse(completedTrace),
        });
      }
    }

    // Validate quantity for single order
    if (!quantity || quantity <= 0) {
      trace.logError('Invalid quantity');
      return NextResponse.json({
        response: 'I need the quantity to confirm the order. Could you please place the order again?',
        uiData: null,
      });
    }

    // Execute single order
    console.log(`📝 [${trace.traceId}] Order: ${side} ${quantity} ${symbol} @ ${orderType}${limitPrice ? ` $${limitPrice}` : ''}`);

    try {
      const order = await createOrder({
        symbol: symbol.toUpperCase(),
        qty: quantity,
        side,
        type: orderType,
        time_in_force: 'day',
        limit_price: limitPrice,
        client_order_id: generateClientOrderId(),
      });

      // Build voice response based on order type
      let voiceResponse: string;
      const sideStr = side === 'buy' ? 'buy' : 'sell';

      if (orderType === 'limit') {
        voiceResponse = `Limit order to ${sideStr} ${quantity} shares of ${companyName} at ${formatCurrency(limitPrice!)} is confirmed.`;
      } else {
        voiceResponse = `Market order to ${sideStr} ${quantity} shares of ${companyName} is confirmed. Please check your trading app for execution details.`;
      }

      const uiData: OrderExecutionUIData = {
        type: 'order-execution',
        success: true,
        orders: [{
          orderId: order.id,
          symbol: symbol.toUpperCase(),
          companyName,
          side,
          quantity,
          orderType,
          limitPrice: limitPrice || null,
          status: order.status,
          description: `${side === 'buy' ? 'Buy' : 'Sell'} ${quantity} shares`,
        }],
        message: 'Order submitted successfully',
      };

      trace.logResponse({
        voiceText: voiceResponse,
        uiDataSummary: `${side} ${quantity} ${symbol} - ${order.status}`,
      }, 'passed');

      const completedTrace = trace.complete();

      return NextResponse.json({
        response: voiceResponse,
        uiData,
        _debug: formatTraceForResponse(completedTrace),
      });

    } catch (orderError) {
      const errorMessage = orderError instanceof Error ? orderError.message : 'Unknown error';
      trace.logError(`Order execution failed: ${errorMessage}`);
      const completedTrace = trace.complete();

      // Provide user-friendly error messages
      let userMessage = `Sorry, there was an error placing your order: ${errorMessage}`;

      if (errorMessage.includes('insufficient')) {
        userMessage = 'Sorry, you don\'t have enough buying power for this order.';
      } else if (errorMessage.includes('market') && errorMessage.includes('closed')) {
        userMessage = 'The market is currently closed. Your order will be queued for the next trading session.';
      } else if (errorMessage.includes('symbol')) {
        userMessage = `Sorry, ${symbol} is not available for trading.`;
      }

      return NextResponse.json({
        response: userMessage,
        uiData: {
          type: 'order-execution',
          success: false,
          orders: [],
          message: `Order failed: ${errorMessage}`,
        },
        _debug: formatTraceForResponse(completedTrace),
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    trace.logError(`Confirm order failed: ${errorMessage}`);
    const completedTrace = trace.complete();

    console.error('[confirm-order] Error:', error);

    return NextResponse.json({
      response: 'Sorry, I encountered an error confirming your order. Please try again.',
      uiData: null,
      _debug: formatTraceForResponse(completedTrace),
    });
  }
}
