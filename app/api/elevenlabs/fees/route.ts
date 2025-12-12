import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

type FeeType = 'commission' | 'credit_interest' | 'debit_interest' | 'locate_fee';

const SYMBOL_MAP: Record<string, string> = {
  'apple': 'AAPL',
  'google': 'GOOGL',
  'alphabet': 'GOOGL',
  'amazon': 'AMZN',
  'microsoft': 'MSFT',
  'tesla': 'TSLA',
  'nvidia': 'NVDA',
  'meta': 'META',
  'facebook': 'META',
  'netflix': 'NFLX',
  'amd': 'AMD',
  'intel': 'INTC',
};

function normalizeSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return SYMBOL_MAP[lower] || input.toUpperCase();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function getDateRange(timePeriod: string): { fromDate: Date; toDate: Date } {
  const today = new Date();

  const lowerPeriod = timePeriod.toLowerCase();

  if (lowerPeriod.includes('last month') || lowerPeriod.includes('past month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    return { fromDate, toDate };
  }

  if (lowerPeriod.includes('this month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('last week') || lowerPeriod.includes('past week')) {
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 7);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('this week')) {
    const dayOfWeek = today.getDay();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dayOfWeek);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('this year') || lowerPeriod.includes('since the beginning of the year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('last year') || lowerPeriod.includes('past year')) {
    const fromDate = new Date(today.getFullYear() - 1, 0, 1);
    const toDate = new Date(today.getFullYear() - 1, 11, 31);
    return { fromDate, toDate };
  }

  // Check for month names like "November" or "in November"
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (lowerPeriod.includes(monthNames[i])) {
      const year = lowerPeriod.includes('last year') ? today.getFullYear() - 1 : today.getFullYear();
      const fromDate = new Date(year, i, 1);
      const toDate = new Date(year, i + 1, 0);
      return { fromDate, toDate };
    }
  }

  // Default to last 30 days
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);
  return { fromDate, toDate: today };
}

function getMonthName(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('Fees request body:', JSON.stringify(body, null, 2));

    // Extract parameters from various possible locations
    const feeType: FeeType = body.fee_type || body.parameters?.fee_type ||
                             body.body?.fee_type || body.body?.parameters?.fee_type;
    const timePeriod = body.time_period || body.parameters?.time_period ||
                       body.body?.time_period || body.body?.parameters?.time_period || 'this month';
    const symbol = body.symbol || body.parameters?.symbol ||
                   body.body?.symbol || body.body?.parameters?.symbol;

    if (!feeType) {
      return NextResponse.json({
        response: 'Please specify what type of fee you want to look up: commissions, credit interest, debit interest, or locate fees.',
      });
    }

    const { fromDate, toDate } = getDateRange(timePeriod);
    const periodDescription = timePeriod || getMonthName(fromDate);

    // Handle commissions from TradeData table
    if (feeType === 'commission') {
      const query = supabase
        .from('TradeData')
        .select('Commission, Date')
        .eq('AccountCode', ACCOUNT_CODE)
        .gte('Date', fromDate.toISOString().split('T')[0])
        .lte('Date', toDate.toISOString().split('T')[0]);

      const { data, error } = await query;

      if (error) {
        return NextResponse.json({
          response: `Error retrieving commission data: ${error.message}`,
        });
      }

      if (!data || data.length === 0) {
        return NextResponse.json({
          response: `No commission data found for ${periodDescription}.`,
        });
      }

      const totalCommission = data.reduce((sum, trade) => sum + (trade.Commission || 0), 0);
      const tradeCount = data.length;

      return NextResponse.json({
        response: `The total commission you paid for ${periodDescription} is ${formatCurrency(Math.abs(totalCommission))} across ${tradeCount} trades.`,
      });
    }

    // Handle other fee types from FeesAndInterest table
    const feeTypeMap: Record<string, string> = {
      'credit_interest': 'CreditInt',
      'debit_interest': 'DebitInt',
      'locate_fee': 'LocateFee',
    };

    const dbFeeType = feeTypeMap[feeType];

    let query = supabase
      .from('FeesAndInterest')
      .select('*')
      .eq('Type', dbFeeType)
      .gte('Date', fromDate.toISOString().split('T')[0])
      .lte('Date', toDate.toISOString().split('T')[0]);

    // For locate fees, filter by symbol if provided
    if (feeType === 'locate_fee' && symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      query = query.eq('Symbol', normalizedSymbol);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({
        response: `Error retrieving fee data: ${error.message}`,
      });
    }

    if (!data || data.length === 0) {
      const symbolText = symbol ? ` for ${normalizeSymbol(symbol)}` : '';
      return NextResponse.json({
        response: `No ${feeType.replace('_', ' ')} data found${symbolText} for ${periodDescription}.`,
      });
    }

    const totalAmount = data.reduce((sum, fee) => sum + (fee.Amount || 0), 0);
    const transactionCount = data.length;

    // Build response based on fee type
    let response = '';
    switch (feeType) {
      case 'credit_interest':
        response = `The total credit interest you earned for ${periodDescription} is ${formatCurrency(Math.abs(totalAmount))} across ${transactionCount} transactions.`;
        break;
      case 'debit_interest':
        response = `The total debit interest you paid for ${periodDescription} is ${formatCurrency(Math.abs(totalAmount))} across ${transactionCount} transactions.`;
        break;
      case 'locate_fee': {
        const symbolText = symbol ? ` for stock ${normalizeSymbol(symbol)}` : '';
        response = `The total locate fees you paid${symbolText} for ${periodDescription} is ${formatCurrency(Math.abs(totalAmount))} across ${transactionCount} transactions.`;
        break;
      }
    }

    return NextResponse.json({ response });

  } catch (error) {
    console.error('Fees error:', error);
    return NextResponse.json({
      response: 'Sorry, there was an error retrieving your fee information.',
    });
  }
}
