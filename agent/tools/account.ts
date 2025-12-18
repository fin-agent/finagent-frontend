import { llm } from '@livekit/agents';
import { z } from 'zod';
import { supabase, ACCOUNT_CODE, formatDateForVoice } from '../shared/index.js';

const QueryType = z.enum([
  'cash_balance',
  'buying_power',
  'account_summary',
  'nlv',
  'overnight_margin',
  'market_value',
  'debit_balances',
  'credit_balances',
  'money_summary',
]);

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function getDateRange(timePeriod?: string): { fromDate?: Date; toDate?: Date } {
  const today = new Date();

  if (!timePeriod || timePeriod === 'latest') {
    return {};
  }

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

  if (lowerPeriod.includes('this year')) {
    const fromDate = new Date(today.getFullYear(), 0, 1);
    return { fromDate, toDate: today };
  }

  return {};
}

/**
 * Get account balance and financial metrics
 */
export const getAccountBalance = llm.tool({
  description: `Get account balance information. Query types:
    - cash_balance: Current cash balance
    - buying_power: Day trading buying power
    - account_summary: Full account overview (default)
    - nlv: Net liquidation value / account equity
    - overnight_margin: House requirement and excess/deficit
    - market_value: Market value of all positions
    - debit_balances: Debit balance history for a period
    - credit_balances: Credit balance history for a period
    - money_summary: Cash balance and account equity`,

  parameters: z.object({
    query_type: QueryType.default('account_summary').describe('Type of account query'),
    time_period: z.string().nullish().describe('Time period for balance history queries'),
  }),

  execute: async ({ query_type, time_period }) => {
    const { fromDate, toDate } = getDateRange(time_period ?? undefined);

    // For balance trends (debit/credit balances), get multiple records
    if (query_type === 'debit_balances' || query_type === 'credit_balances') {
      let query = supabase
        .from('AccountBalance')
        .select('Date, DebitBalance, CreditBalance')
        .eq('AccountCode', ACCOUNT_CODE)
        .order('Date', { ascending: false });

      if (fromDate) {
        query = query.gte('Date', fromDate.toISOString().split('T')[0]);
      }
      if (toDate) {
        query = query.lte('Date', toDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) {
        return `Error retrieving balance data: ${error.message}`;
      }

      if (!data || data.length === 0) {
        return 'No balance data found for the specified period.';
      }

      const balanceField = query_type === 'debit_balances' ? 'DebitBalance' : 'CreditBalance';
      const values = data.map(d => (d as Record<string, number>)[balanceField] || 0);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const max = Math.max(...values);
      const min = Math.min(...values);
      const maxRecord = data.find(d => (d as Record<string, number>)[balanceField] === max);
      const minRecord = data.find(d => (d as Record<string, number>)[balanceField] === min);

      const balanceType = query_type === 'debit_balances' ? 'debit' : 'credit';
      const periodDesc = time_period || 'the period';

      return `Your average ${balanceType} balance for ${periodDesc} is ${formatCurrency(avg)}. The highest ${balanceType} balance was on ${formatDateForVoice(maxRecord?.Date || '')} at ${formatCurrency(max)}. The lowest ${balanceType} balance was on ${formatDateForVoice(minRecord?.Date || '')} at ${formatCurrency(min)}.`;
    }

    // For other queries, get the latest record
    const { data, error } = await supabase
      .from('AccountBalance')
      .select('*')
      .eq('AccountCode', ACCOUNT_CODE)
      .order('Date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      return `Error retrieving account balance: ${error.message}`;
    }

    if (!data) {
      return 'No account balance data found.';
    }

    const balance = data as Record<string, number | string>;
    const balanceDate = formatDateForVoice(balance.Date as string);

    switch (query_type) {
      case 'cash_balance':
        return `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance as number)}`;

      case 'money_summary':
        return `Your account cash balance as of ${balanceDate} is ${formatCurrency(balance.CashBalance as number)}, and your account equity is ${formatCurrency(balance['Account Equity'] as number)}`;

      case 'buying_power':
        return `Your day trading buying power as of ${balanceDate} is ${formatCurrency(balance.DayTradingBP as number)}.`;

      case 'nlv':
        return `Your net liquidation value (account equity) as of ${balanceDate} is ${formatCurrency(balance['Account Equity'] as number)}.`;

      case 'overnight_margin': {
        const houseExcessDeficit = balance.HouseExcessDeficit as number;
        const houseLabel = houseExcessDeficit >= 0 ? 'house excess' : 'house deficit';
        return `Your house requirement as of ${balanceDate} is ${formatCurrency(balance.HouseRequirment as number)}, and your ${houseLabel} is ${formatCurrency(Math.abs(houseExcessDeficit))}`;
      }

      case 'market_value': {
        const stockLong = (balance['Stock LMV'] as number) || 0;
        const stockShort = (balance['Stock SMV'] as number) || 0;
        const optionsLong = (balance['Options LMV'] as number) || 0;
        const optionsShort = (balance['Optons SMV'] as number) || 0; // DB typo
        return `The market value of your long stock positions is ${formatCurrency(stockLong)}, your long options positions is ${formatCurrency(optionsLong)}, your short stock positions is ${formatCurrency(stockShort)}, and your short options positions is ${formatCurrency(optionsShort)}`;
      }

      case 'account_summary':
      default:
        return `Your account summary as of ${balanceDate}: Cash Balance: ${formatCurrency(balance.CashBalance as number)}, Account Equity: ${formatCurrency(balance['Account Equity'] as number)}, Day Trading BP: ${formatCurrency(balance.DayTradingBP as number)}, Stock Long Market Value: ${formatCurrency((balance['Stock LMV'] as number) || 0)}, Stock Short Market Value: ${formatCurrency((balance['Stock SMV'] as number) || 0)}, Options Long Market Value: ${formatCurrency((balance['Options LMV'] as number) || 0)}, Options Short Market Value: ${formatCurrency((balance['Optons SMV'] as number) || 0)}.`;
    }
  },
});
