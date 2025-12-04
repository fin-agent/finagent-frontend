'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Send, Loader2, X } from 'lucide-react';
import { TradesTable } from './generative-ui/TradesTable';
import { TradeSummary } from './generative-ui/TradeSummary';

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
  userBubble: '#00c806',
  assistantBubble: '#2a2a2a',
};

interface TextChatProps {
  onEndChat: () => void;
  conversationId?: string | null;
}

export function TextChat({ onEndChat, conversationId }: TextChatProps) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');

  // Create transport with memoization to prevent recreation on each render
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId || undefined,
    transport,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (messagesContainerRef.current) {
      const timeoutId = setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
        }
      }, 50);
      return () => clearTimeout(timeoutId);
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const message = inputValue.trim();
    setInputValue('');
    await sendMessage({ text: message });
  };

  // Extract text content from message parts
  const getMessageText = (parts: Array<{ type: string; text?: string }> | undefined): string => {
    if (!parts) return '';
    return parts
      .filter(part => part.type === 'text')
      .map(part => part.text || '')
      .join('');
  };

  // Render tool invocation results as UI components
  const renderToolResult = (toolName: string, result: unknown) => {
    if (!result || typeof result !== 'object') return null;

    const data = result as Record<string, unknown>;

    if (toolName === 'getTradeSummary' && !('error' in data)) {
      return (
        <TradeSummary
          symbol={data.symbol as string}
          stockCount={data.stockTrades as number}
          optionCount={data.optionTrades as number}
        />
      );
    }

    if (toolName === 'getDetailedTrades' && !('error' in data)) {
      // Transform the data to match TradesTable expected format
      const trades = [
        ...(data.stockTrades as Array<Record<string, unknown>> || []).map((t, i) => ({
          TradeID: t.tradeId as number || i,
          Date: t.date as string,
          Symbol: data.symbol as string,
          SecurityType: 'S',
          TradeType: (t.type as string) === 'Buy' ? 'B' : 'S',
          StockTradePrice: String(t.price),
          StockShareQty: String(t.shares),
          OptionContracts: '0',
          OptionTradePremium: '0',
          GrossAmount: String(t.netAmount),
          NetAmount: String(t.netAmount),
        })),
        ...(data.optionTrades as Array<Record<string, unknown>> || []).map((t, i) => ({
          TradeID: t.tradeId as number || i + 1000,
          Date: t.date as string,
          Symbol: data.symbol as string,
          SecurityType: 'O',
          TradeType: (t.type as string) === 'Buy' ? 'B' : 'S',
          StockTradePrice: '0',
          StockShareQty: '0',
          OptionContracts: String(t.contracts),
          OptionTradePremium: String(t.premium),
          GrossAmount: String(t.netAmount),
          NetAmount: String(t.netAmount),
          Strike: String(t.strike),
          Expiration: t.expiration as string,
          'Call/Put': (t.callPut as string) === 'Call' ? 'C' : 'P',
        })),
      ];

      const summary = data.summary as Record<string, unknown>;

      return (
        <TradesTable
          trades={trades}
          summary={{
            totalShares: summary.totalSharesPurchased as number,
            totalCost: summary.totalCost as number,
            currentValue: summary.currentValue as number,
            symbol: data.symbol as string,
          }}
        />
      );
    }

    return null;
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      flex: 1,
      backgroundColor: colors.bgPrimary,
      overflow: 'hidden',
      minHeight: 0,
    },
    messagesContainer: {
      flex: 1,
      overflowY: 'auto' as const,
      padding: '16px',
      backgroundColor: colors.bgPrimary,
    },
    messageRow: {
      display: 'flex',
      gap: '12px',
      marginBottom: '16px',
    },
    avatar: {
      width: '32px',
      height: '32px',
      borderRadius: '50%',
      backgroundColor: colors.accent,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: colors.bgPrimary,
      fontSize: '11px',
      fontWeight: 700,
      flexShrink: 0,
    },
    assistantBubble: {
      backgroundColor: colors.assistantBubble,
      borderRadius: '16px',
      borderTopLeftRadius: '4px',
      padding: '12px 16px',
      maxWidth: '320px',
    },
    userBubble: {
      backgroundColor: colors.userBubble,
      color: colors.bgPrimary,
      borderRadius: '16px',
      borderTopRightRadius: '4px',
      padding: '12px 16px',
      maxWidth: '280px',
      marginLeft: 'auto',
    },
    messageText: {
      fontSize: '14px',
      lineHeight: 1.5,
      margin: 0,
      whiteSpace: 'pre-wrap' as const,
    },
    inputArea: {
      padding: '16px',
      borderTop: `1px solid ${colors.border}`,
      backgroundColor: colors.bgSecondary,
    },
    inputForm: {
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '12px',
    },
    textInput: {
      width: '100%',
      padding: '12px 16px',
      fontSize: '14px',
      border: `1px solid ${colors.border}`,
      borderRadius: '8px',
      outline: 'none',
      backgroundColor: colors.bgCard,
      color: colors.textPrimary,
    },
    inputActions: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    endChatButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 12px',
      fontSize: '13px',
      color: '#ff5000',
      backgroundColor: 'transparent',
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    sendButton: {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 20px',
      fontSize: '14px',
      fontWeight: 500,
      color: colors.bgPrimary,
      backgroundColor: colors.accent,
      border: 'none',
      borderRadius: '6px',
      cursor: 'pointer',
    },
    toolResultContainer: {
      marginTop: '12px',
      maxWidth: '100%',
    },
    errorText: {
      color: '#ff5000',
      fontSize: '13px',
      padding: '8px 12px',
      backgroundColor: 'rgba(255, 80, 0, 0.1)',
      borderRadius: '8px',
      marginBottom: '12px',
    },
  };

  return (
    <div style={styles.container}>
      {/* Messages */}
      <div ref={messagesContainerRef} style={styles.messagesContainer}>
        {/* Welcome Message */}
        {messages.length === 0 && (
          <div style={styles.messageRow}>
            <div style={styles.avatar}>FA</div>
            <div style={styles.assistantBubble}>
              <p style={{ ...styles.messageText, color: colors.textPrimary }}>
                Hi, I&apos;m here to answer your questions about your portfolio. What would you like to know?
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div style={styles.errorText}>
            Error: {error.message}
          </div>
        )}

        {/* Messages */}
        {messages.map((message) => (
          <div key={message.id}>
            <div
              style={{
                ...styles.messageRow,
                justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              {message.role === 'assistant' && (
                <div style={styles.avatar}>FA</div>
              )}
              <div style={message.role === 'user' ? styles.userBubble : styles.assistantBubble}>
                <p style={{ ...styles.messageText, color: message.role === 'user' ? colors.bgPrimary : colors.textPrimary }}>
                  {getMessageText(message.parts as Array<{ type: string; text?: string }>)}
                </p>
              </div>
            </div>

            {/* Render tool invocation results */}
            {message.role === 'assistant' && message.parts?.map((part, index) => {
              // Handle dynamic-tool type parts (AI SDK v5)
              const partAny = part as { type: string; toolName?: string; state?: string; output?: unknown };
              if (partAny.type === 'dynamic-tool' && partAny.state === 'output-available' && partAny.toolName) {
                const uiComponent = renderToolResult(partAny.toolName, partAny.output);
                if (uiComponent) {
                  return (
                    <div key={`tool-${index}`} style={styles.toolResultContainer}>
                      {uiComponent}
                    </div>
                  );
                }
              }
              // Handle typed tool parts (e.g., tool-getTradeSummary)
              if (partAny.type.startsWith('tool-') && partAny.state === 'output-available') {
                const toolName = partAny.type.replace('tool-', '');
                const uiComponent = renderToolResult(toolName, partAny.output);
                if (uiComponent) {
                  return (
                    <div key={`tool-${index}`} style={styles.toolResultContainer}>
                      {uiComponent}
                    </div>
                  );
                }
              }
              return null;
            })}
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && (
          <div style={styles.messageRow}>
            <div style={styles.avatar}>FA</div>
            <div style={styles.assistantBubble}>
              <Loader2 size={16} style={{ color: colors.textSecondary, animation: 'spin 1s linear infinite' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div style={styles.inputArea}>
        <form onSubmit={handleSubmit} style={styles.inputForm}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about your portfolio..."
            style={styles.textInput}
            disabled={isLoading}
          />
          <div style={styles.inputActions}>
            <button type="button" onClick={onEndChat} style={styles.endChatButton}>
              <X size={14} />
              End chat
            </button>
            <button
              type="submit"
              disabled={isLoading || !inputValue.trim()}
              style={{
                ...styles.sendButton,
                opacity: isLoading || !inputValue.trim() ? 0.5 : 1,
                cursor: isLoading || !inputValue.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={14} />
              Send
            </button>
          </div>
        </form>
      </div>

      {/* Keyframe animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
