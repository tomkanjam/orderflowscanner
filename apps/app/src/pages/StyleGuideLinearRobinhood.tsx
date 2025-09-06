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
  Sparkles,
  LineChart,
  BarChart3,
  DollarSign,
  Wallet,
  Shield,
  Star
} from 'lucide-react';

export const StyleGuideLinearRobinhood: React.FC = () => {
  const [inputValue, setInputValue] = useState('');

  // Load the Linear-Robinhood design system CSS
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/linear-robinhood-design-system.css';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="lr-design-system">
      <div className="lr-aurora-bg"></div>
      
      {/* Navigation */}
      <nav className="lr-nav">
        <div className="lr-nav-logo">
          <Sparkles size={20} style={{ display: 'inline-block', marginRight: '8px' }} />
          Linear × Robinhood
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <a href="#overview" className="lr-nav-link lr-nav-link-active">Overview</a>
          <a href="#colors" className="lr-nav-link">Colors</a>
          <a href="#components" className="lr-nav-link">Components</a>
          <a href="#data" className="lr-nav-link">Data</a>
        </div>
      </nav>

      <div className="lr-container">
        {/* Hero Section */}
        <section style={{ padding: '100px 0 80px' }} id="overview">
          <h1 className="lr-h1" style={{ marginBottom: '24px', fontSize: '64px' }}>
            Modern Trading,<br />Beautifully Simple
          </h1>
          <p style={{ fontSize: '20px', color: 'var(--lr-text-secondary)', maxWidth: '600px', lineHeight: '1.6' }}>
            Inspired by Linear's elegant gradients and Robinhood's approachable design. 
            Forest green primary with coral accents. Zero purple, maximum clarity.
          </p>
          
          {/* Feature Cards */}
          <div className="lr-grid lr-grid-cols-3" style={{ marginTop: '60px' }}>
            <div className="lr-card lr-card-gradient">
              <Shield size={32} style={{ color: 'var(--lr-accent-green)', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Trusted & Secure</h4>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-tertiary)' }}>
                Bank-level security with an approachable interface
              </p>
            </div>
            <div className="lr-card lr-card-gradient">
              <Sparkles size={32} style={{ color: 'var(--lr-accent-teal)', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Delightful UX</h4>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-tertiary)' }}>
                Smooth animations and thoughtful micro-interactions
              </p>
            </div>
            <div className="lr-card lr-card-gradient">
              <LineChart size={32} style={{ color: 'var(--lr-accent-coral)', marginBottom: '16px' }} />
              <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>Real-Time Data</h4>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-tertiary)' }}>
                Live market updates with beautiful visualizations
              </p>
            </div>
          </div>
        </section>

        {/* Colors Section */}
        <section style={{ padding: '80px 0' }} id="colors">
          <h2 className="lr-h2" style={{ marginBottom: '40px' }}>Color Palette</h2>
          
          <div className="lr-grid lr-grid-cols-4">
            {/* Primary */}
            <div className="lr-card">
              <div style={{ 
                height: '120px', 
                background: 'var(--lr-gradient-green)', 
                borderRadius: '12px',
                marginBottom: '16px'
              }}></div>
              <h5 style={{ fontWeight: '600', marginBottom: '4px' }}>Forest Green</h5>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-muted)' }}>#00A86B</p>
              <span className="lr-badge lr-badge-green" style={{ marginTop: '8px' }}>PRIMARY</span>
            </div>

            {/* Secondary */}
            <div className="lr-card">
              <div style={{ 
                height: '120px', 
                background: 'var(--lr-gradient-coral)', 
                borderRadius: '12px',
                marginBottom: '16px'
              }}></div>
              <h5 style={{ fontWeight: '600', marginBottom: '4px' }}>Coral</h5>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-muted)' }}>#FF6B6B</p>
              <span className="lr-badge lr-badge-coral" style={{ marginTop: '8px' }}>ACCENT</span>
            </div>

            {/* Teal */}
            <div className="lr-card">
              <div style={{ 
                height: '120px', 
                background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)', 
                borderRadius: '12px',
                marginBottom: '16px'
              }}></div>
              <h5 style={{ fontWeight: '600', marginBottom: '4px' }}>Teal</h5>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-muted)' }}>#14B8A6</p>
              <span className="lr-badge lr-badge-teal" style={{ marginTop: '8px' }}>SECONDARY</span>
            </div>

            {/* Dark */}
            <div className="lr-card">
              <div style={{ 
                height: '120px', 
                background: 'var(--lr-gradient-dark)', 
                borderRadius: '12px',
                marginBottom: '16px'
              }}></div>
              <h5 style={{ fontWeight: '600', marginBottom: '4px' }}>Dark</h5>
              <p style={{ fontSize: '14px', color: 'var(--lr-text-muted)' }}>#0C0D0E</p>
              <span className="lr-badge lr-badge-default" style={{ marginTop: '8px' }}>TEXT</span>
            </div>
          </div>
        </section>

        {/* Components Section */}
        <section style={{ padding: '80px 0' }} id="components">
          <h2 className="lr-h2" style={{ marginBottom: '40px' }}>Components</h2>
          
          {/* Buttons */}
          <div className="lr-card" style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Buttons</h4>
            
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
              <button className="lr-button lr-button-primary">
                <Wallet size={18} style={{ marginRight: '8px' }} />
                Buy Crypto
              </button>
              <button className="lr-button lr-button-secondary">
                <LineChart size={18} style={{ marginRight: '8px' }} />
                View Chart
              </button>
              <button className="lr-button lr-button-coral">
                <Activity size={18} style={{ marginRight: '8px' }} />
                Sell Position
              </button>
              <button className="lr-button lr-button-ghost">
                Cancel Order
              </button>
            </div>
          </div>

          {/* Forms */}
          <div className="lr-card" style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Input Fields</h4>
            
            <div style={{ display: 'grid', gap: '20px', maxWidth: '400px' }}>
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontSize: '14px', 
                  fontWeight: '500',
                  color: 'var(--lr-text-secondary)' 
                }}>
                  Investment Amount
                </label>
                <input 
                  type="text" 
                  className="lr-input" 
                  placeholder="$0.00"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>
              
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontSize: '14px', 
                  fontWeight: '500',
                  color: 'var(--lr-text-secondary)' 
                }}>
                  Search Stocks
                </label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    className="lr-input" 
                    placeholder="Search by name or symbol..."
                    style={{ paddingLeft: '44px' }}
                  />
                  <Search 
                    size={20} 
                    style={{ 
                      position: 'absolute', 
                      left: '16px', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: 'var(--lr-text-muted)'
                    }} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="lr-card" style={{ marginBottom: '24px' }}>
            <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Status Badges</h4>
            
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <span className="lr-badge lr-badge-green">Active</span>
              <span className="lr-badge lr-badge-teal">Pending</span>
              <span className="lr-badge lr-badge-coral">Urgent</span>
              <span className="lr-badge lr-badge-default">Inactive</span>
              <span className="lr-badge" style={{ background: 'var(--lr-success-light)', color: 'var(--lr-success)' }}>
                Profitable
              </span>
              <span className="lr-badge" style={{ background: 'var(--lr-error-light)', color: 'var(--lr-error)' }}>
                At Risk
              </span>
            </div>
          </div>

          {/* Alerts */}
          <div className="lr-card">
            <h4 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '24px' }}>Notifications</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="lr-alert lr-alert-success">
                <CheckCircle size={20} />
                <div>
                  <strong>Order Executed!</strong> Your buy order for 10 shares of AAPL was filled at $175.50
                </div>
              </div>
              
              <div className="lr-alert lr-alert-info">
                <Info size={20} />
                <div>
                  <strong>Market Update:</strong> Federal Reserve announces interest rate decision at 2:00 PM EST
                </div>
              </div>
              
              <div className="lr-alert lr-alert-warning">
                <AlertCircle size={20} />
                <div>
                  <strong>Price Alert:</strong> TSLA is approaching your target price of $250
                </div>
              </div>
              
              <div className="lr-alert lr-alert-error">
                <XCircle size={20} />
                <div>
                  <strong>Insufficient Funds:</strong> Add $50 more to complete this transaction
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Data Display Section */}
        <section style={{ padding: '80px 0' }} id="data">
          <h2 className="lr-h2" style={{ marginBottom: '40px' }}>Data Visualization</h2>
          
          {/* Metric Cards */}
          <div className="lr-grid lr-grid-cols-4" style={{ marginBottom: '40px' }}>
            <div className="lr-metric">
              <div className="lr-metric-value">$125,420</div>
              <div className="lr-metric-label">Portfolio Value</div>
              <div className="lr-metric-change lr-metric-positive">
                <TrendingUp size={14} />
                +12.5%
              </div>
            </div>
            
            <div className="lr-metric">
              <div className="lr-metric-value" style={{ color: 'var(--lr-accent-green)' }}>+$8,240</div>
              <div className="lr-metric-label">Today's Gain</div>
              <div className="lr-metric-change lr-metric-positive">
                <TrendingUp size={14} />
                +3.2%
              </div>
            </div>
            
            <div className="lr-metric">
              <div className="lr-metric-value">42</div>
              <div className="lr-metric-label">Positions</div>
              <div style={{ marginTop: '12px' }}>
                <Star size={16} style={{ color: 'var(--lr-warning)' }} />
                <Star size={16} style={{ color: 'var(--lr-warning)' }} />
                <Star size={16} style={{ color: 'var(--lr-warning)' }} />
                <Star size={16} style={{ color: 'var(--lr-warning)' }} />
                <Star size={16} style={{ color: 'var(--lr-border-default)' }} />
              </div>
            </div>
            
            <div className="lr-metric">
              <div className="lr-metric-value" style={{ color: 'var(--lr-accent-coral)' }}>2.5%</div>
              <div className="lr-metric-label">Risk Level</div>
              <div className="lr-metric-change" style={{ background: 'var(--lr-warning-light)', color: 'var(--lr-warning)' }}>
                <AlertCircle size={14} />
                Medium
              </div>
            </div>
          </div>

          {/* Data Table */}
          <div className="lr-table-container">
            <table className="lr-table">
              <thead className="lr-table-header">
                <tr>
                  <th className="lr-table-header-cell">Symbol</th>
                  <th className="lr-table-header-cell">Name</th>
                  <th className="lr-table-header-cell">Price</th>
                  <th className="lr-table-header-cell">Change</th>
                  <th className="lr-table-header-cell">Volume</th>
                  <th className="lr-table-header-cell">Action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="lr-table-row">
                  <td className="lr-table-cell">
                    <span style={{ fontWeight: '600' }}>AAPL</span>
                  </td>
                  <td className="lr-table-cell">Apple Inc.</td>
                  <td className="lr-table-cell" style={{ fontWeight: '600' }}>$175.50</td>
                  <td className="lr-table-cell">
                    <span className="lr-metric-change lr-metric-positive">
                      <TrendingUp size={14} />
                      +2.35%
                    </span>
                  </td>
                  <td className="lr-table-cell">52.3M</td>
                  <td className="lr-table-cell">
                    <button className="lr-button lr-button-primary" style={{ height: '32px', padding: '0 16px', fontSize: '14px' }}>
                      Trade
                    </button>
                  </td>
                </tr>
                <tr className="lr-table-row">
                  <td className="lr-table-cell">
                    <span style={{ fontWeight: '600' }}>TSLA</span>
                  </td>
                  <td className="lr-table-cell">Tesla Inc.</td>
                  <td className="lr-table-cell" style={{ fontWeight: '600' }}>$248.70</td>
                  <td className="lr-table-cell">
                    <span className="lr-metric-change lr-metric-negative">
                      <TrendingDown size={14} />
                      -1.82%
                    </span>
                  </td>
                  <td className="lr-table-cell">78.9M</td>
                  <td className="lr-table-cell">
                    <button className="lr-button lr-button-primary" style={{ height: '32px', padding: '0 16px', fontSize: '14px' }}>
                      Trade
                    </button>
                  </td>
                </tr>
                <tr className="lr-table-row">
                  <td className="lr-table-cell">
                    <span style={{ fontWeight: '600' }}>NVDA</span>
                  </td>
                  <td className="lr-table-cell">NVIDIA Corp.</td>
                  <td className="lr-table-cell" style={{ fontWeight: '600' }}>$485.20</td>
                  <td className="lr-table-cell">
                    <span className="lr-metric-change lr-metric-positive">
                      <TrendingUp size={14} />
                      +5.67%
                    </span>
                  </td>
                  <td className="lr-table-cell">42.1M</td>
                  <td className="lr-table-cell">
                    <button className="lr-button lr-button-primary" style={{ height: '32px', padding: '0 16px', fontSize: '14px' }}>
                      Trade
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Chart Demo */}
        <section style={{ padding: '80px 0 100px' }}>
          <h2 className="lr-h2" style={{ marginBottom: '40px' }}>Interactive Charts</h2>
          
          <div className="lr-chart-container">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
              <div>
                <h3 style={{ fontSize: '24px', fontWeight: '700' }}>Portfolio Performance</h3>
                <p style={{ color: 'var(--lr-text-tertiary)', marginTop: '4px' }}>Your returns over the last 30 days</p>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="lr-button lr-button-ghost" style={{ height: '36px', padding: '0 16px', fontSize: '14px' }}>
                  1D
                </button>
                <button className="lr-button lr-button-ghost" style={{ height: '36px', padding: '0 16px', fontSize: '14px' }}>
                  1W
                </button>
                <button className="lr-button lr-button-primary" style={{ height: '36px', padding: '0 16px', fontSize: '14px' }}>
                  1M
                </button>
                <button className="lr-button lr-button-ghost" style={{ height: '36px', padding: '0 16px', fontSize: '14px' }}>
                  1Y
                </button>
                <button className="lr-button lr-button-ghost" style={{ height: '36px', padding: '0 16px', fontSize: '14px' }}>
                  ALL
                </button>
              </div>
            </div>
            
            {/* Placeholder for chart */}
            <div style={{ 
              height: '300px', 
              background: 'linear-gradient(180deg, rgba(0, 168, 107, 0.05) 0%, transparent 100%)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px dashed var(--lr-border-light)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <BarChart3 size={48} style={{ color: 'var(--lr-accent-green)', marginBottom: '16px' }} />
                <p style={{ color: 'var(--lr-text-tertiary)' }}>Chart visualization would go here</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};