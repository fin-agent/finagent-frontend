import { llm } from '@livekit/agents';
import { z } from 'zod';
import { supabase, ACCOUNT_CODE, normalizeSymbol } from '../shared/index.js';

const FeeType = z.enum(['commission', 'credit_interest', 'debit_interest', 'locate_fee']);

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

  if (lowerPeriod.includes('this year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate, toDate: today };
  }

  if (lowerPeriod.includes('last year') || lowerPeriod.includes('past year')) {
    const fromDate = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
    return { fromDate, toDate: today };
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

/**
 * Get fees and interest information
 */
export const getFees = llm.tool({
  description: `Get fee and interest information. Fee types:
    - commission: Trading commissions paid
    - credit_interest: Interest earned on credit balance
    - debit_interest: Interest paid on margin
    - locate_fee: Short locate fees (can filter by symbol)`,

  parameters: z.object({
    fee_type: FeeType.describe('Type of fee to look up'),
    time_period: z.string().default('this month').describe('Time period like "this month", "last month", "this year"'),
    symbol: z.string().nullish().describe('Stock symbol (only for locate_fee type)'),
  }),

  execute: async ({ fee_type, time_period, symbol }) => {
    const { fromDate, toDate } = getDateRange(time_period);
    const periodDescription = time_period;

    // Handle commissions from TradeData table
    if (fee_type === 'commission') {
      const { data, error } = await supabase
        .from('TradeData')
        .select('Commission, Date')
        .eq('AccountCode', ACCOUNT_CODE)
        .gte('Date', fromDate.toISOString().split('T')[0])
        .lte('Date', toDate.toISOString().split('T')[0]);

      if (error) {
        return `Error retrieving commission data: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return `No commission data found for ${periodDescription}.`;
      }

      const totalCommission = data.reduce((sum, trade) => sum + (trade.Commission || 0), 0);
      const tradeCount = data.length;

      return `The total commission you paid for ${periodDescription} is ${formatCurrency(Math.abs(totalCommission))} across ${tradeCount} trades.`;
    }

    // Handle other fee types from FeesAndInterest table
    const feeTypeMap: Record<string, string> = {
      'credit_interest': 'CreditInt',
      'debit_interest': 'DebitInt',
      'locate_fee': 'LocateFee',
    };

    const dbFeeType = feeTypeMap[fee_type];

    let query = supabase
      .from('FeesAndInterest')
      .select('*')
      .eq('Type', dbFeeType)
      .gte('Date', fromDate.toISOString().split('T')[0])
      .lte('Date', toDate.toISOString().split('T')[0]);

    // For locate fees, filter by symbol if provided
    if (fee_type === 'locate_fee' && symbol) {
      const normalizedSymbol = normalizeSymbol(symbol);
      query = query.eq('Symbol', normalizedSymbol);
    }

    const { data, error } = await query;

    if (error) {
      return `Error retrieving fee data: ${error.message}`;
    }

    if (!data || data.length === 0) {
      const symbolText = symbol ? ` for ${normalizeSymbol(symbol)}` : '';
      return `No ${fee_type.replace('_', ' ')} data found${symbolText} for ${periodDescription}.`;
    }

    const totalAmount = data.reduce((sum, fee) => sum + (fee.Amount || 0), 0);
    const transactionCount = data.length;

    switch (fee_type) {
      case 'credit_interest':
        return `The total credit interest you earned for ${periodDescription} is ${formatCurrency(Math.abs(totalAmount))} across ${transactionCount} transactions.`;
      case 'debit_interest':
        return `The total debit interest you paid for ${periodDescription} is ${formatCurrency(Math.abs(totalAmount))} across ${transactionCount} transactions.`;
      case 'locate_fee': {
        const symbolText = symbol ? ` for stock ${normalizeSymbol(symbol)}` : '';
        return `The total locate fees you paid${symbolText} for ${periodDescription} is ${formatCurrency(Math.abs(totalAmount))} across ${transactionCount} transactions.`;
      }
      default:
        return `Total fees for ${periodDescription}: ${formatCurrency(Math.abs(totalAmount))}`;
    }
  },
});
