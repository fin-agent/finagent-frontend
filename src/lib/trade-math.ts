export type TradeLike = {
  SecurityType?: string | null;
  TradeType?: string | null;
  NetAmount?: string | number | null;
  StockTradePrice?: string | number | null;
  StockShareQty?: string | number | null;
  OptionTradePremium?: string | number | null;
  OptionContracts?: string | number | null;
};

const OPTION_CONTRACT_MULTIPLIER = 100;

export function safeParseNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;

  const normalized = value.trim().replace(/,/g, '');
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getOptionPremiumUSD(trade: TradeLike): number {
  const premiumPerShare = safeParseNumber(trade.OptionTradePremium);
  const contracts = safeParseNumber(trade.OptionContracts);
  return Math.abs(premiumPerShare * contracts * OPTION_CONTRACT_MULTIPLIER);
}

export function getStockNotionalUSD(trade: TradeLike): number {
  const price = safeParseNumber(trade.StockTradePrice);
  const shares = safeParseNumber(trade.StockShareQty);
  return Math.abs(price * shares);
}

export function getTradeGrossUSD(trade: TradeLike): number {
  const securityType = (trade.SecurityType || '').toUpperCase();
  if (securityType === 'O') return getOptionPremiumUSD(trade);
  if (securityType === 'S') return getStockNotionalUSD(trade);
  return Math.abs(safeParseNumber(trade.NetAmount));
}

export function getTradeCashFlowUSD(trade: TradeLike): number {
  const netAmount = safeParseNumber(trade.NetAmount);
  if (netAmount !== 0) return netAmount;

  const tradeType = (trade.TradeType || '').toUpperCase();
  const sign = tradeType === 'B' ? -1 : tradeType === 'S' ? 1 : 1;

  return sign * getTradeGrossUSD(trade);
}

