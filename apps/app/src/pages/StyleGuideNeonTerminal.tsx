import React, { useState } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle, 
  XCircle,
  Info,
  ArrowRight,
  Download,
  Settings,
  User,
  Search,
  Bell,
  Activity,
  Zap,
  Terminal,
  BarChart3,
  DollarSign
} from 'lucide-react';

export const StyleGuideNeonTerminal: React.FC = () => {
  const [inputValue, setInputValue] = useState('');

  // Load the Neon Terminal design system CSS
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/neon-terminal-design-system.css';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="nt-design-system">
      <div className="nt-grid-bg"></div>
      
      {/* Navigation */}
      <nav className="nt-nav">
        <div className="nt-nav-logo">
          <Terminal size={24} style={{ display: 'inline-block', marginRight: '8px' }} />
          NEON TERMINAL
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <a href="#overview" className="nt-nav-link nt-nav-link-active">Overview</a>
          <a href="#colors" className="nt-nav-link">Colors</a>
          <a href="#components" className="nt-nav-link">Components</a>
          <a href="#data" className="nt-nav-link">Data</a>
        </div>
      </nav>

      <div className="nt-container">
        {/* Hero Section */}
        <section style={{ padding: '80px 0' }} id="overview">
          <h1 className="nt-h1" style={{ marginBottom: '24px' }}>
            <span style={{ color: 'var(--nt-accent-amber)' }}>NEON</span> TERMINAL
          </h1>
          <p style={{ fontSize: '18px', color: 'var(--nt-text-secondary)', maxWidth: '600px', lineHeight: '1.6' }}>
            Bloomberg meets modern trading. A bold, energetic design system that brings the excitement 
            of financial markets to life with amber accents and cyan highlights. No purple in sight.
          </p>
          
          {/* Key Features */}
          <div className="nt-grid nt-grid-cols-4" style={{ marginTop: '48px' }}>
            <div className="nt-metric">
              <div className="nt-metric-value">₿</div>
              <div className="nt-metric-label">Crypto Native</div>
            </div>
            <div className="nt-metric">
              <div className="nt-metric-value nt-pulse" style={{ color: 'var(--nt-success)' }}>LIVE</div>
              <div className="nt-metric-label">Real-Time Data</div>
            </div>
            <div className="nt-metric">
              <div className="nt-metric-value" style={{ color: 'var(--nt-success)' }}>24/7</div>
              <div className="nt-metric-label">Always On</div>
            </div>
            <div className="nt-metric">
              <div className="nt-metric-value">0ms</div>
              <div className="nt-metric-label">Zero Lag</div>
            </div>
          </div>
        </section>

        {/* Colors Section */}
        <section style={{ padding: '48px 0' }} id="colors">
          <h2 className="nt-h2" style={{ marginBottom: '32px' }}>Color System</h2>
          
          <div className="nt-grid nt-grid-cols-3">
            {/* Primary Colors */}
            <div className="nt-card">
              <div className="nt-card-title">PRIMARY ACCENTS</div>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: 'var(--nt-accent-amber)', 
                    borderRadius: '8px',
                    boxShadow: 'var(--nt-shadow-glow-amber)'
                  }}></div>
                  <div>
                    <div className="nt-text-mono" style={{ color: 'var(--nt-accent-amber)' }}>AMBER</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)' }}>#FF6B00</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: 'var(--nt-accent-cyan)', 
                    borderRadius: '8px',
                    boxShadow: 'var(--nt-shadow-glow-cyan)'
                  }}></div>
                  <div>
                    <div className="nt-text-mono" style={{ color: 'var(--nt-accent-cyan)' }}>CYAN</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)' }}>#00F0FF</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Semantic Colors */}
            <div className="nt-card">
              <div className="nt-card-title">MARKET SIGNALS</div>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: 'var(--nt-success)', 
                    borderRadius: '8px',
                    boxShadow: 'var(--nt-shadow-glow-success)'
                  }}></div>
                  <div>
                    <div className="nt-text-mono" style={{ color: 'var(--nt-success)' }}>PROFIT</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)' }}>#00FF88</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: 'var(--nt-error)', 
                    borderRadius: '8px',
                    boxShadow: 'var(--nt-shadow-glow-error)' 
                  }}></div>
                  <div>
                    <div className="nt-text-mono" style={{ color: 'var(--nt-error)' }}>LOSS</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)' }}>#FF0040</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Background Colors */}
            <div className="nt-card">
              <div className="nt-card-title">BACKGROUNDS</div>
              <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: 'var(--nt-bg-primary)', 
                    borderRadius: '8px',
                    border: '1px solid var(--nt-border-default)'
                  }}></div>
                  <div>
                    <div className="nt-text-mono">BASE</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)' }}>#0A0A0B</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ 
                    width: '60px', 
                    height: '60px', 
                    background: 'var(--nt-bg-elevated)', 
                    borderRadius: '8px',
                    border: '1px solid var(--nt-border-default)'
                  }}></div>
                  <div>
                    <div className="nt-text-mono">ELEVATED</div>
                    <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)' }}>#1F1F22</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Components Section */}
        <section style={{ padding: '48px 0' }} id="components">
          <h2 className="nt-h2" style={{ marginBottom: '32px' }}>Components</h2>
          
          {/* Buttons */}
          <div className="nt-card" style={{ marginBottom: '24px' }}>
            <div className="nt-card-header">
              <div className="nt-card-title">BUTTONS</div>
            </div>
            
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <button className="nt-button nt-button-primary">
                <Zap size={16} style={{ marginRight: '8px' }} />
                EXECUTE TRADE
              </button>
              <button className="nt-button nt-button-secondary">
                <Activity size={16} style={{ marginRight: '8px' }} />
                ANALYZE
              </button>
              <button className="nt-button nt-button-success">
                <DollarSign size={16} style={{ marginRight: '8px' }} />
                BUY SIGNAL
              </button>
              <button className="nt-button nt-button-ghost">
                CANCEL
              </button>
            </div>
          </div>

          {/* Forms */}
          <div className="nt-card" style={{ marginBottom: '24px' }}>
            <div className="nt-card-header">
              <div className="nt-card-title">INPUT FIELDS</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontSize: '12px', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--nt-text-tertiary)' 
                }}>
                  Trading Pair
                </label>
                <input 
                  type="text" 
                  className="nt-input" 
                  placeholder="BTC/USDT"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>
              
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontSize: '12px', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--nt-text-tertiary)' 
                }}>
                  Search Markets
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    className="nt-input" 
                    placeholder="Search..."
                    style={{ paddingLeft: '40px' }}
                  />
                  <Search 
                    size={18} 
                    style={{ 
                      position: 'absolute', 
                      left: '12px', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--nt-accent-amber)'
                    }} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="nt-card" style={{ marginBottom: '24px' }}>
            <div className="nt-card-header">
              <div className="nt-card-title">STATUS BADGES</div>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span className="nt-badge nt-badge-amber">ACTIVE</span>
              <span className="nt-badge nt-badge-default">STREAMING</span>
              <span className="nt-badge nt-badge-success">PROFITABLE</span>
              <span className="nt-badge nt-badge-error">STOPPED</span>
              <span className="nt-badge nt-badge-default">PENDING</span>
            </div>
          </div>

          {/* Alerts */}
          <div className="nt-card" style={{ marginBottom: '24px' }}>
            <div className="nt-card-header">
              <div className="nt-card-title">ALERTS</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="nt-alert nt-alert-success">
                <CheckCircle size={20} />
                <div>
                  <strong>TRADE EXECUTED:</strong> Buy order filled at $42,150.00
                </div>
              </div>
              
              <div className="nt-alert nt-alert-warning">
                <AlertCircle size={20} />
                <div>
                  <strong>VOLATILITY WARNING:</strong> Market experiencing high volatility
                </div>
              </div>
              
              <div className="nt-alert nt-alert-error">
                <XCircle size={20} />
                <div>
                  <strong>CONNECTION LOST:</strong> WebSocket disconnected
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Data Display Section */}
        <section style={{ padding: '48px 0' }} id="data">
          <h2 className="nt-h2" style={{ marginBottom: '32px' }}>Data Display</h2>
          
          {/* Metric Cards */}
          <div className="nt-grid nt-grid-cols-3" style={{ marginBottom: '24px' }}>
            <div className="nt-metric">
              <div className="nt-metric-value">$64,235</div>
              <div className="nt-metric-label">BTC PRICE</div>
              <div className="nt-metric-change nt-metric-positive">
                <TrendingUp size={16} />
                <span>+5.42%</span>
              </div>
            </div>
            
            <div className="nt-metric">
              <div className="nt-metric-value" style={{ color: 'var(--nt-accent-cyan)' }}>1,847</div>
              <div className="nt-metric-label">ACTIVE SIGNALS</div>
              <div className="nt-metric-change nt-metric-positive">
                <TrendingUp size={16} />
                <span>+127</span>
              </div>
            </div>
            
            <div className="nt-metric">
              <div className="nt-metric-value" style={{ color: 'var(--nt-error)' }}>-2.3%</div>
              <div className="nt-metric-label">24H CHANGE</div>
              <div className="nt-metric-change nt-metric-negative">
                <TrendingDown size={16} />
                <span>-$1,520</span>
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="nt-table-container">
            <table className="nt-table">
              <thead className="nt-table-header">
                <tr>
                  <th className="nt-table-header-cell">SYMBOL</th>
                  <th className="nt-table-header-cell">PRICE</th>
                  <th className="nt-table-header-cell">24H</th>
                  <th className="nt-table-header-cell">VOLUME</th>
                  <th className="nt-table-header-cell">STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr className="nt-table-row">
                  <td className="nt-table-cell">BTC/USDT</td>
                  <td className="nt-table-cell" style={{ color: 'var(--nt-accent-amber)' }}>$64,235</td>
                  <td className="nt-table-cell nt-metric-positive">+5.42%</td>
                  <td className="nt-table-cell">$28.5B</td>
                  <td className="nt-table-cell">
                    <span className="nt-badge nt-badge-success">LONG</span>
                  </td>
                </tr>
                <tr className="nt-table-row">
                  <td className="nt-table-cell">ETH/USDT</td>
                  <td className="nt-table-cell" style={{ color: 'var(--nt-accent-amber)' }}>$3,150</td>
                  <td className="nt-table-cell nt-metric-negative">-2.15%</td>
                  <td className="nt-table-cell">$15.2B</td>
                  <td className="nt-table-cell">
                    <span className="nt-badge nt-badge-error">SHORT</span>
                  </td>
                </tr>
                <tr className="nt-table-row">
                  <td className="nt-table-cell">SOL/USDT</td>
                  <td className="nt-table-cell" style={{ color: 'var(--nt-accent-amber)' }}>$147.80</td>
                  <td className="nt-table-cell nt-metric-positive">+12.7%</td>
                  <td className="nt-table-cell">$3.8B</td>
                  <td className="nt-table-cell">
                    <span className="nt-badge nt-badge-default">WATCH</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Live Demo Section */}
        <section style={{ padding: '48px 0 80px' }}>
          <h2 className="nt-h2" style={{ marginBottom: '32px' }}>Live Trading Terminal</h2>
          
          <div className="nt-card nt-card-glow">
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
              <div className="nt-pulse" style={{ 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                background: 'var(--nt-success)',
                boxShadow: 'var(--nt-shadow-glow-success)'
              }}></div>
              <span className="nt-text-mono" style={{ color: 'var(--nt-success)' }}>LIVE MARKET DATA</span>
            </div>
            
            <div className="nt-grid nt-grid-cols-4">
              <div>
                <div className="nt-text-mono" style={{ fontSize: '24px', color: 'var(--nt-accent-amber)' }}>
                  $64,235.42
                </div>
                <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)', marginTop: '4px' }}>
                  LAST PRICE
                </div>
              </div>
              <div>
                <div className="nt-text-mono" style={{ fontSize: '24px', color: 'var(--nt-success)' }}>
                  +5.42%
                </div>
                <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)', marginTop: '4px' }}>
                  24H CHANGE
                </div>
              </div>
              <div>
                <div className="nt-text-mono" style={{ fontSize: '24px', color: 'var(--nt-text-primary)' }}>
                  28.5B
                </div>
                <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)', marginTop: '4px' }}>
                  VOLUME
                </div>
              </div>
              <div>
                <div className="nt-text-mono" style={{ fontSize: '24px' }}>
                  147
                </div>
                <div style={{ fontSize: '12px', color: 'var(--nt-text-muted)', marginTop: '4px' }}>
                  SIGNALS
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};