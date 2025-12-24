'use client';

import React from 'react';

// App color scheme (dark theme)
const colors = {
  bgPrimary: '#000000',
  bgSecondary: '#0a0a0a',
  bgCard: '#1a1a1a',
  bgHover: '#2a2a2a',
  textPrimary: '#ffffff',
  textSecondary: '#8c8c8e',
  textMuted: '#5a5a5c',
  accent: '#00c806',
  accentHover: '#00a805',
  border: '#2a2a2a',
  buy: '#00c806',
  sell: '#ff4466',
  warning: '#ffaa00',
};

interface TradeApprovalProps {
  symbol: string;
  quantity: number;
  side: 'buy' | 'sell';
  orderType: 'market' | 'limit';
  limitPrice?: number;
  securityType?: 'stock' | 'option';
  optionDetails?: {
    strike: number;
    expiration: string;
    callPut: 'call' | 'put';
  };
  onApprove: () => void;
  onDeny: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export const TradeApproval: React.FC<TradeApprovalProps> = ({
  symbol,
  quantity,
  side,
  orderType,
  limitPrice,
  securityType = 'stock',
  optionDetails,
  onApprove,
  onDeny,
}) => {
  const isOption = securityType === 'option';
  const sideColor = side === 'buy' ? colors.buy : colors.sell;
  const sideLabel = side === 'buy' ? 'BUY' : 'SELL';
  const quantityLabel = isOption ? 'contracts' : 'shares';

  // Estimate value (placeholder - in production this would come from market data)
  const estimatedPrice = limitPrice || 100.00;
  const multiplier = isOption ? 100 : 1;
  const estimatedValue = quantity * estimatedPrice * multiplier;

  return (
    <div
      style={{
        backgroundColor: colors.bgCard,
        borderRadius: '12px',
        border: `1px solid ${colors.border}`,
        overflow: 'hidden',
        marginTop: '12px',
        width: '100%',
        maxWidth: '340px',
      }}
    >
      {/* Header with warning */}
      <div
        style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(255, 170, 0, 0.1)',
          borderBottom: `1px solid ${colors.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ fontSize: '20px' }}>&#9888;</span>
        <span style={{ color: colors.warning, fontWeight: 600, fontSize: '14px' }}>
          Trade Approval Required
        </span>
      </div>

      {/* Trade details */}
      <div style={{ padding: '16px' }}>
        {/* Side and Symbol */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span
            style={{
              backgroundColor: sideColor,
              color: '#000',
              fontWeight: 700,
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            {sideLabel}
          </span>
          <span style={{ color: colors.textPrimary, fontWeight: 600, fontSize: '18px' }}>
            {symbol}
          </span>
        </div>

        {/* Details grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '2px' }}>Quantity</div>
            <div style={{ color: colors.textPrimary, fontWeight: 500 }}>
              {quantity} {quantityLabel}
            </div>
          </div>
          <div>
            <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '2px' }}>Order Type</div>
            <div style={{ color: colors.textPrimary, fontWeight: 500, textTransform: 'capitalize' }}>
              {orderType}
            </div>
          </div>
          {limitPrice && (
            <div>
              <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '2px' }}>Limit Price</div>
              <div style={{ color: colors.textPrimary, fontWeight: 500 }}>
                {formatCurrency(limitPrice)}
              </div>
            </div>
          )}
          {isOption && optionDetails && (
            <>
              <div>
                <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '2px' }}>Strike</div>
                <div style={{ color: colors.textPrimary, fontWeight: 500 }}>
                  {formatCurrency(optionDetails.strike)}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '2px' }}>Expiration</div>
                <div style={{ color: colors.textPrimary, fontWeight: 500 }}>
                  {optionDetails.expiration}
                </div>
              </div>
              <div>
                <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '2px' }}>Type</div>
                <div style={{ color: colors.textPrimary, fontWeight: 500, textTransform: 'capitalize' }}>
                  {optionDetails.callPut}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Estimated value */}
        <div
          style={{
            backgroundColor: colors.bgSecondary,
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px',
          }}
        >
          <div style={{ color: colors.textMuted, fontSize: '11px', marginBottom: '4px' }}>
            Estimated Value
          </div>
          <div style={{ color: sideColor, fontWeight: 700, fontSize: '20px' }}>
            {side === 'buy' ? '-' : '+'}{formatCurrency(estimatedValue)}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onDeny}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: colors.bgSecondary,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              color: colors.textSecondary,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onApprove}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: sideColor,
              border: 'none',
              borderRadius: '8px',
              color: '#000',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Confirm {sideLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TradeApproval;
