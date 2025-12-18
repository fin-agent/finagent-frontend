import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { realDateToDemoDate, formatDateForDB } from '@/src/lib/date-utils';
import { normalizeSymbol } from '@/src/lib/symbol-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const ACCOUNT_CODE = 'C40421';

type FeeType = 'commission' | 'credit_interest' | 'debit_interest' | 'locate_fee';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

// Convert real dates to demo dates for DB queries
function toDBDateStr(date: Date): string {
  const demoDate = realDateToDemoDate(date);
  return formatDateForDB(demoDate);
}

function getDateRange(timePeriod: string): { fromDate: string; toDate: string; periodLabel: string; periodMonth?: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lowerPeriod = timePeriod.toLowerCase();

  if (lowerPeriod.includes('last month') || lowerPeriod.includes('past month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const toDate = new Date(today.getFullYear(), today.getMonth(), 0);
    const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: `month of ${monthName}`, periodMonth: monthName };
  }

  if (lowerPeriod.includes('this month')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: `month of ${monthName}`, periodMonth: monthName };
  }

  if (lowerPeriod.includes('last week') || lowerPeriod.includes('past week')) {
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - 7);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'last week' };
  }

  if (lowerPeriod.includes('this week')) {
    const dayOfWeek = today.getDay();
    const fromDate = new Date(today);
    fromDate.setDate(today.getDate() - dayOfWeek);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'this week' };
  }

  if (lowerPeriod.includes('this year') || lowerPeriod.includes('since the beginning of the year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'this year' };
  }

  // "last year" = trailing 12 months (not calendar year) to match user expectations
  if (lowerPeriod.includes('last year') || lowerPeriod.includes('past year')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
    return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: 'last year' };
  }

  // Check for month names like "November" or "in November"
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                      'july', 'august', 'september', 'october', 'november', 'december'];
  for (let i = 0; i < monthNames.length; i++) {
    if (lowerPeriod.includes(monthNames[i])) {
      const year = lowerPeriod.includes('last year') ? today.getFullYear() - 1 : today.getFullYear();
      const fromDate = new Date(year, i, 1);
      const toDate = new Date(year, i + 1, 0);
      const monthName = fromDate.toLocaleDateString('en-US', { month: 'long' });
      return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(toDate), periodLabel: `month of ${monthName}`, periodMonth: monthName };
    }
  }

  // Default to last 30 days
  const fromDate = new Date(today);
  fromDate.setDate(today.getDate() - 30);
  return { fromDate: toDBDateStr(fromDate), toDate: toDBDateStr(today), periodLabel: timePeriod };
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

    const { fromDate, toDate, periodLabel, periodMonth } = getDateRange(timePeriod);
    const monthLabel = periodMonth || periodLabel;

    // Handle commissions from TradeData table
    if (feeType === 'commission') {
      const query = supabase
        .from('TradeData')
        .select('Commission, Date')
        .eq('AccountCode', ACCOUNT_CODE)
        .gte('Date', fromDate)
        .lte('Date', toDate);

      const { data, error } = await query;

      if (error) {
        return NextResponse.json({
          response: `Error retrieving commission data: ${error.message}`,
        });
      }

      if (!data || data.length === 0) {
        return NextResponse.json({
          response: `No commission data found for ${periodLabel}.`,
        });
      }

      const totalCommission = data.reduce((sum, trade) => sum + (trade.Commission || 0), 0);
      const amount = formatCurrency(Math.abs(totalCommission));
      if (periodLabel.startsWith('month of')) {
        return NextResponse.json({
          response: `The total commission you paid in the month of ${monthLabel} is ${amount}`,
        });
      }
      return NextResponse.json({
        response: `The total commission you paid for ${periodLabel} is ${amount}`,
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
      .gte('Date', fromDate)
      .lte('Date', toDate);

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
        response: `No ${feeType.replace('_', ' ')} data found${symbolText} for ${periodLabel}.`,
      });
    }

    const totalAmount = data.reduce((sum, fee) => sum + (fee.Amount || 0), 0);

    // Build response based on fee type
    let response = '';
    switch (feeType) {
      case 'credit_interest':
        if (periodLabel.startsWith('month of')) {
          response = `The total credit interest you received for the month of ${monthLabel} is ${formatCurrency(Math.abs(totalAmount))}`;
        } else {
          response = `The total credit interest you received for ${periodLabel} is ${formatCurrency(Math.abs(totalAmount))}`;
        }
        break;
      case 'debit_interest':
        if (periodLabel === 'last week') {
          response = `The total debit interest you paid last week is ${formatCurrency(Math.abs(totalAmount))}`;
        } else if (periodLabel.startsWith('month of')) {
          response = `The total debit interest you paid for the month of ${monthLabel} is ${formatCurrency(Math.abs(totalAmount))}`;
        } else {
          response = `The total debit interest you paid for ${periodLabel} is ${formatCurrency(Math.abs(totalAmount))}`;
        }
        break;
      case 'locate_fee': {
        const symbolText = symbol ? ` for stock ${normalizeSymbol(symbol)}` : '';
        if (periodLabel === 'this year') {
          response = `The total locate fees you paid${symbolText} this year is ${formatCurrency(Math.abs(totalAmount))}`;
        } else {
          response = `The total locate fees you paid${symbolText} for ${periodLabel} is ${formatCurrency(Math.abs(totalAmount))}`;
        }
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
