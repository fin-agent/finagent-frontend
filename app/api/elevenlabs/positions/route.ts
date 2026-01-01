import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

type SecurityType = 'all' | 'stock' | 'option';
type PositionType = 'all' | 'long' | 'short' | 'flat';

// UI data structure for PositionsCard component
interface PositionsUIData {
  securityType: SecurityType;
  positionType: PositionType;
  symbol?: string;
  expiration?: string;
  positions: Array<{
    symbol: string;
    securityType: 'stock' | 'option';
    qty: number;
    closePrice: number;
    marketValue: number;
    // Option-specific fields
    underlyingSymbol?: string;
    expiration?: string;
    strike?: number;
    callPut?: 'C' | 'P';
  }>;
  summary: {
    totalPositions: number;
    totalLong: number;
    totalShort: number;
    totalFlat: number;
    totalMarketValue: number;
    longMarketValue: number;
    shortMarketValue: number;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

// Format expiration date for display
function formatExpiration(expDate: string): string {
  const date = new Date(expDate);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Parse expiration filter (e.g., "Jan 16th", "January 16", "2026-01-16")
function parseExpirationFilter(expFilter: string): string | null {
  if (!expFilter) return null;

  // Already in ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(expFilter)) {
    return expFilter;
  }

  // Try to parse natural language date
  const months: Record<string, number> = {
    'jan': 0, 'january': 0,
    'feb': 1, 'february': 1,
    'mar': 2, 'march': 2,
    'apr': 3, 'april': 3,
    'may': 4,
    'jun': 5, 'june': 5,
    'jul': 6, 'july': 6,
    'aug': 7, 'august': 7,
    'sep': 8, 'september': 8,
    'oct': 9, 'october': 9,
    'nov': 10, 'november': 10,
    'dec': 11, 'december': 11,
  };

  const normalized = expFilter.toLowerCase().replace(/(\d+)(st|nd|rd|th)/g, '$1');

  // Match patterns like "Jan 16", "January 16 2026", etc.
  const match = normalized.match(/([a-z]+)\s*(\d+)(?:\s*,?\s*(\d{4}))?/i);
  if (match) {
    const monthStr = match[1].toLowerCase();
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) : 2026; // Default to 2026 for options

    const month = months[monthStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      const date = new Date(year, month, day);
      return date.toISOString().split('T')[0];
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Positions request body:', JSON.stringify(body, null, 2));

    // Extract parameters
    const rawSecurityType: SecurityType = body.security_type || body.parameters?.security_type || 'all';
    const securityType = rawSecurityType; // Keep original for response building
    const positionType: PositionType = body.position_type || body.parameters?.position_type || 'all';
    const symbol = body.symbol || body.parameters?.symbol;
    const expirationFilter = body.expiration || body.parameters?.expiration;
    const callPut = body.call_put || body.parameters?.call_put;

    console.log(`[positions] Query: securityType=${securityType}, positionType=${positionType}, symbol=${symbol}, expiration=${expirationFilter}, callPut=${callPut}`);

    // Build query
    let query = supabase
      .from('AccountPositions')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE);

    // Filter by security type
    if (securityType === 'stock') {
      query = query.eq('SecurityType', 'S');
    } else if (securityType === 'option') {
      query = query.eq('SecurityType', 'O');
    }

    // Filter by symbol
    if (symbol) {
      const upperSymbol = symbol.toUpperCase();
      // For options, check both Symbol and UnderlyingSymbol
      if (securityType === 'option') {
        query = query.eq('UnderlyingSymbol', upperSymbol);
      } else {
        query = query.eq('Symbol', upperSymbol);
      }
    }

    // Filter by expiration
    if (expirationFilter) {
      const parsedExp = parseExpirationFilter(expirationFilter);
      if (parsedExp) {
        query = query.eq('Expiration', parsedExp);
      }
    }

    // Filter by call/put
    if (callPut) {
      const cpValue = callPut.toLowerCase() === 'call' ? 'C' : callPut.toLowerCase() === 'put' ? 'P' : callPut.toUpperCase();
      query = query.eq('Call/Put', cpValue);
    }

    const { data, error } = await query.order('Symbol', { ascending: true });

    if (error) {
      console.error('[positions] Database error:', error);
      return NextResponse.json({
        response: `Error retrieving positions: ${error.message}`,
        uiData: {
          securityType,
          positionType,
          symbol,
          positions: [],
          summary: { totalPositions: 0, totalLong: 0, totalShort: 0, totalFlat: 0, totalMarketValue: 0, longMarketValue: 0, shortMarketValue: 0 },
        },
      });
    }

    // Filter by position type (long/short/flat) - done post-query since Qty is stored as string
    let filteredData = data || [];
    if (positionType === 'long') {
      filteredData = filteredData.filter(p => parseFloat(p.Qty) > 0);
    } else if (positionType === 'short') {
      filteredData = filteredData.filter(p => parseFloat(p.Qty) < 0);
    } else if (positionType === 'flat') {
      filteredData = filteredData.filter(p => parseFloat(p.Qty) === 0);
    }

    // Calculate summary
    const allPositions = filteredData.map(p => ({
      symbol: p.Symbol,
      securityType: p.SecurityType === 'S' ? 'stock' as const : 'option' as const,
      qty: parseFloat(p.Qty),
      closePrice: parseFloat(p.ClosePrice) || 0,
      marketValue: parseFloat(p.MarketValue) || 0,
      underlyingSymbol: p.UnderlyingSymbol || undefined,
      expiration: p.Expiration || undefined,
      strike: p.Strike ? parseFloat(p.Strike) : undefined,
      callPut: p['Call/Put'] as 'C' | 'P' | undefined,
    }));

    const longPositions = allPositions.filter(p => p.qty > 0);
    const shortPositions = allPositions.filter(p => p.qty < 0);
    const flatPositions = allPositions.filter(p => p.qty === 0);

    const summary = {
      totalPositions: allPositions.length,
      totalLong: longPositions.length,
      totalShort: shortPositions.length,
      totalFlat: flatPositions.length,
      totalMarketValue: allPositions.reduce((sum, p) => sum + p.marketValue, 0),
      longMarketValue: longPositions.reduce((sum, p) => sum + p.marketValue, 0),
      shortMarketValue: shortPositions.reduce((sum, p) => sum + Math.abs(p.marketValue), 0),
    };

    // Build response message
    let response = '';

    if (allPositions.length === 0) {
      if (symbol) {
        response = `You have no ${securityType === 'option' ? 'options' : securityType === 'stock' ? 'stock' : ''} positions in ${symbol.toUpperCase()}.`;
      } else {
        response = `No ${positionType !== 'all' ? positionType + ' ' : ''}${securityType !== 'all' ? securityType + ' ' : ''}positions found.`;
      }
    } else if (symbol && securityType !== 'option') {
      // Specific symbol query
      const stockPos = allPositions.find(p => p.securityType === 'stock');
      const optionPos = allPositions.filter(p => p.securityType === 'option');

      if (stockPos) {
        const posType = stockPos.qty > 0 ? 'Long' : stockPos.qty < 0 ? 'Short' : 'Flat';
        response = `${symbol.toUpperCase()} stock: ${posType} ${formatNumber(Math.abs(stockPos.qty))} shares. Close price: ${formatCurrency(stockPos.closePrice)}. Market value: ${formatCurrency(Math.abs(stockPos.marketValue))}.`;
      }

      if (optionPos.length > 0) {
        response += ` You also have ${optionPos.length} ${symbol.toUpperCase()} options position${optionPos.length > 1 ? 's' : ''}.`;
      } else if (!stockPos) {
        response = `You have no positions in ${symbol.toUpperCase()}.`;
      } else {
        response += ` You have no ${symbol.toUpperCase()} options positions.`;
      }
    } else if (securityType === 'option') {
      // Options query
      if (symbol && expirationFilter) {
        response = `You have ${allPositions.length} ${symbol.toUpperCase()} option${allPositions.length > 1 ? 's' : ''} expiring ${formatExpiration(parseExpirationFilter(expirationFilter) || expirationFilter)}:`;
        allPositions.forEach(p => {
          const callPutLabel = p.callPut === 'C' ? 'Call' : 'Put';
          const posType = p.qty > 0 ? 'Long' : 'Short';
          response += ` ${p.underlyingSymbol} ${formatExpiration(p.expiration!)} ${p.strike} ${callPutLabel} - ${formatNumber(Math.abs(p.qty))} contracts (${posType}).`;
        });
      } else {
        response = `You have ${allPositions.length} option position${allPositions.length > 1 ? 's' : ''}`;
        if (symbol) {
          response += ` in ${symbol.toUpperCase()}`;
        }
        response += ` with total market value of ${formatCurrency(summary.totalMarketValue)}.`;
      }
    } else if (positionType === 'short') {
      response = `You have ${shortPositions.length} short stock position${shortPositions.length > 1 ? 's' : ''}: `;
      response += shortPositions.map(p => `${p.symbol} (${formatNumber(Math.abs(p.qty))} shares)`).join(', ');
      response += `.`;
    } else if (positionType === 'long') {
      response = `You have ${longPositions.length} long stock position${longPositions.length > 1 ? 's' : ''} with total market value of ${formatCurrency(summary.longMarketValue)}.`;
    } else {
      // All positions summary
      const typeLabel = rawSecurityType === 'stock' ? 'stock' : rawSecurityType === 'option' ? 'option' : '';
      response = `You have ${summary.totalPositions} ${typeLabel} position${summary.totalPositions > 1 ? 's' : ''}: ${summary.totalLong} long, ${summary.totalShort} short`;
      if (summary.totalFlat > 0) {
        response += `, ${summary.totalFlat} flat`;
      }
      response += `. Total market value: ${formatCurrency(summary.totalMarketValue)}.`;
    }

    const uiData: PositionsUIData = {
      securityType,
      positionType,
      symbol,
      expiration: expirationFilter,
      positions: allPositions,
      summary,
    };

    return NextResponse.json({ response, uiData });

  } catch (error) {
    console.error('[positions] Error:', error);
    return NextResponse.json({
      response: 'Error retrieving position data. Please try again.',
      uiData: {
        securityType: 'all',
        positionType: 'all',
        positions: [],
        summary: { totalPositions: 0, totalLong: 0, totalShort: 0, totalFlat: 0, totalMarketValue: 0, longMarketValue: 0, shortMarketValue: 0 },
      },
    });
  }
}
