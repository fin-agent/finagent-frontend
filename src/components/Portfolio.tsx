import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Portfolio as PortfolioType, ChartData } from '../types';
import alpacaApi from '../services/alpacaApi';

const Portfolio: React.FC = () => {
  const [portfolio, setPortfolio] = useState<PortfolioType | null>(null);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [period, setPeriod] = useState<'1D' | '1W' | '1M' | '3M' | '1Y'>('3M');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolioData();
  }, []);

  useEffect(() => {
    fetchChartData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const fetchPortfolioData = async () => {
    try {
      const data = await alpacaApi.getPortfolio();
      setPortfolio(data);
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchChartData = async () => {
    try {
      const data = await alpacaApi.getChartData('PORTFOLIO', period);
      setChartData(data);
    } catch (error) {
      console.error('Error fetching chart data:', error);
    }
  };

  if (loading) {
    return (
      <div className="portfolio-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!portfolio) {
    return <div className="portfolio-error">Unable to load portfolio data</div>;
  }

  const isGain = portfolio.dayChange >= 0;

  return (
    <div className="portfolio">
      <div className="portfolio-header">
        <div className="portfolio-value">
          <h1>${portfolio.totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h1>
          <div className={`portfolio-change ${isGain ? 'gain' : 'loss'}`}>
            {isGain ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span>${Math.abs(portfolio.dayChange).toFixed(2)}</span>
            <span>({Math.abs(portfolio.dayChangePercent).toFixed(2)}%)</span>
          </div>
        </div>
        
        <div className="portfolio-stats">
          <div className="stat">
            <span className="stat-label">Cash</span>
            <span className="stat-value">
              ${portfolio.totalCash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Invested</span>
            <span className="stat-value">
              ${portfolio.totalInvested.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>

      <div className="chart-container">
        <div className="chart-periods">
          {(['1D', '1W', '1M', '3M', '1Y'] as const).map((p) => (
            <button
              key={p}
              className={`period-btn ${period === p ? 'active' : ''}`}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
        
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
            <XAxis 
              dataKey="timestamp" 
              tickFormatter={(timestamp) => new Date(timestamp).toLocaleDateString()}
              stroke="#666"
            />
            <YAxis stroke="#666" />
            <Tooltip 
              contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333' }}
              labelStyle={{ color: '#aaa' }}
            />
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke={isGain ? '#00c806' : '#ff5000'} 
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="positions">
        <h2>Positions</h2>
        <div className="positions-list">
          {portfolio.positions.map((position) => {
            const positionGain = position.gainLoss >= 0;
            return (
              <div key={position.symbol} className="position-card">
                <div className="position-header">
                  <div className="position-info">
                    <span className="position-symbol">{position.symbol}</span>
                    <span className="position-name">{position.name}</span>
                  </div>
                  <div className="position-value">
                    <span className="position-price">${position.totalValue.toFixed(2)}</span>
                    <div className={`position-change ${positionGain ? 'gain' : 'loss'}`}>
                      <span>${Math.abs(position.gainLoss).toFixed(2)}</span>
                      <span>({Math.abs(position.gainLossPercent).toFixed(2)}%)</span>
                    </div>
                  </div>
                </div>
                <div className="position-details">
                  <span className="position-shares">{position.shares} shares</span>
                  {/* <span className="position-avg-cost">Avg ${position.avgCost.toFixed(2)}</span> */}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Portfolio;
