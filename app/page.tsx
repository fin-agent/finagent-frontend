'use client'

import { useState } from 'react';
import { Home, TrendingUp, Search, User, Menu, X } from 'lucide-react';
import Portfolio from '../src/components/Portfolio';
import StockList from '../src/components/StockList';
import VoiceAssistantNew from '../src/components/VoiceAssistantNew';
import '../src/App.css';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'portfolio' | 'stocks'>('portfolio');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const accountName = 'Aida Guru';
  const accountCode = 'C40421';
  const accountType = 'Margin';

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-container">
          <div className="header-left">
            <button 
              className="mobile-menu-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            <h1 className="app-title">WeTrade</h1>
          </div>
          
          <nav className={`header-nav ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
            <button
              className={`nav-btn ${activeTab === 'portfolio' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('portfolio');
                setIsMobileMenuOpen(false);
              }}
            >
              <Home size={20} />
              <span>Portfolio</span>
            </button>
            <button
              className={`nav-btn ${activeTab === 'stocks' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('stocks');
                setIsMobileMenuOpen(false);
              }}
            >
              <TrendingUp size={20} />
              <span>Stocks</span>
            </button>
          </nav>

          <div className="header-right">
            <button className="icon-btn">
              <Search size={20} />
            </button>
            <button className="icon-btn">
              <User size={20} />
            </button>
          </div>
          
          <div className="header-mobile-summary">
            <div className="summary-title">
              <span className="summary-label">Account</span>
              <span className="summary-value">{accountName}</span>
            </div>
            <div className="summary-chip">
              <span>{accountCode}</span>
              <span>{accountType}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="app-main">
        <div className="main-container">
          {activeTab === 'portfolio' ? <Portfolio /> : <StockList />}
        </div>
      </main>

      {/* Voice Assistant */}
      <VoiceAssistantNew />
    </div>
  );
}

