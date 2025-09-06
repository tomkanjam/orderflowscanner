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
  ChevronDown
} from 'lucide-react';

export const StyleGuide: React.FC = () => {
  const [inputValue, setInputValue] = useState('');
  const [textareaValue, setTextareaValue] = useState('');

  // Load the OpenRouter design system CSS
  React.useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/openrouter-design-system.css';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="or-design-system">
      {/* Navigation */}
      <nav className="or-nav">
        <div className="or-nav-logo">OpenRouter Style Guide</div>
        <div className="or-nav-menu">
          <a href="#typography" className="or-nav-link or-nav-link-active">Typography</a>
          <a href="#colors" className="or-nav-link">Colors</a>
          <a href="#components" className="or-nav-link">Components</a>
          <a href="#layout" className="or-nav-link">Layout</a>
        </div>
      </nav>

      <div className="or-container">
        {/* Hero Section */}
        <section className="or-section">
          <h1 className="or-h1">OpenRouter Design System</h1>
          <p className="or-text-body" style={{ marginTop: '1rem', maxWidth: '600px' }}>
            A clean, professional design system inspired by OpenRouter's aesthetic. 
            Emphasizing clarity, trust, and technical sophistication through minimalist principles.
          </p>
        </section>

        {/* Typography Section */}
        <section className="or-section" id="typography">
          <h2 className="or-h2" style={{ marginBottom: '2rem' }}>Typography</h2>
          
          <div className="or-card">
            <div className="or-card-header">
              <div className="or-card-title">Heading Styles</div>
              <div className="or-card-description">Clear hierarchy for content organization</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <h1 className="or-h1">Heading 1 - Bold Statement</h1>
              <h2 className="or-h2">Heading 2 - Section Title</h2>
              <h3 className="or-h3">Heading 3 - Subsection</h3>
              <h4 className="or-h4">Heading 4 - Group Label</h4>
              <h5 className="or-h5">Heading 5 - Item Title</h5>
              <h6 className="or-h6">Heading 6 - Small Label</h6>
            </div>
          </div>

          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Body Text</div>
            </div>
            
            <p className="or-text-body">
              This is body text with comfortable reading size and spacing. It's designed for 
              extended reading with optimal line height and character spacing. The text color 
              provides sufficient contrast while remaining easy on the eyes.
            </p>
            
            <p className="or-text-small" style={{ marginTop: '1rem' }}>
              Small text for secondary information, hints, and metadata. Used sparingly for 
              supplementary content that doesn't compete with primary information.
            </p>
            
            <p className="or-text-xs" style={{ marginTop: '1rem' }}>
              Extra small text for labels, badges, and compact UI elements where space is at a premium.
            </p>
          </div>
        </section>

        {/* Colors Section */}
        <section className="or-section" id="colors">
          <h2 className="or-h2" style={{ marginBottom: '2rem' }}>Colors</h2>
          
          <div className="or-grid or-grid-cols-3">
            {/* Primary Colors */}
            <div className="or-card">
              <div className="or-card-title">Primary Accent</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#6366F1' }}></div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Primary</div>
                    <div style={{ fontSize: '12px', color: '#8B949E' }}>#6366F1</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#E0E2FF' }}></div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Light</div>
                    <div style={{ fontSize: '12px', color: '#8B949E' }}>#E0E2FF</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Semantic Colors */}
            <div className="or-card">
              <div className="or-card-title">Semantic</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#16A34A' }}></div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Success</div>
                    <div style={{ fontSize: '12px', color: '#8B949E' }}>#16A34A</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#DC2626' }}></div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Error</div>
                    <div style={{ fontSize: '12px', color: '#8B949E' }}>#DC2626</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Neutral Colors */}
            <div className="or-card">
              <div className="or-card-title">Neutrals</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#0D0D0E', border: '1px solid #E2E8F0' }}></div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Text Primary</div>
                    <div style={{ fontSize: '12px', color: '#8B949E' }}>#0D0D0E</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#F6F8FA', border: '1px solid #E2E8F0' }}></div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>Background</div>
                    <div style={{ fontSize: '12px', color: '#8B949E' }}>#F6F8FA</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Components Section */}
        <section className="or-section" id="components">
          <h2 className="or-h2" style={{ marginBottom: '2rem' }}>Components</h2>
          
          {/* Buttons */}
          <div className="or-card">
            <div className="or-card-header">
              <div className="or-card-title">Buttons</div>
              <div className="or-card-description">Interactive elements for user actions</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Button Variants */}
              <div>
                <h6 className="or-h6" style={{ marginBottom: '1rem' }}>Variants</h6>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button className="or-button or-button-md or-button-primary">
                    Primary Action
                  </button>
                  <button className="or-button or-button-md or-button-secondary">
                    Secondary
                  </button>
                  <button className="or-button or-button-md or-button-ghost">
                    Ghost
                  </button>
                  <button className="or-button or-button-md or-button-danger">
                    Danger
                  </button>
                </div>
              </div>

              {/* Button Sizes */}
              <div>
                <h6 className="or-h6" style={{ marginBottom: '1rem' }}>Sizes</h6>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="or-button or-button-sm or-button-primary">
                    Small
                  </button>
                  <button className="or-button or-button-md or-button-primary">
                    Medium
                  </button>
                  <button className="or-button or-button-lg or-button-primary">
                    Large
                  </button>
                </div>
              </div>

              {/* Button with Icons */}
              <div>
                <h6 className="or-h6" style={{ marginBottom: '1rem' }}>With Icons</h6>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <button className="or-button or-button-md or-button-primary">
                    <Download size={16} style={{ marginRight: '0.5rem' }} />
                    Download
                  </button>
                  <button className="or-button or-button-md or-button-secondary">
                    Settings
                    <Settings size={16} style={{ marginLeft: '0.5rem' }} />
                  </button>
                  <button className="or-button or-button-md or-button-ghost">
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Forms */}
          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Form Elements</div>
              <div className="or-card-description">Input fields and form controls</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="or-input-group">
                <label className="or-input-label">Email Address</label>
                <input 
                  type="email" 
                  className="or-input" 
                  placeholder="Enter your email"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
                <div className="or-input-hint">We'll never share your email with anyone else.</div>
              </div>

              <div className="or-input-group">
                <label className="or-input-label">Description</label>
                <textarea 
                  className="or-textarea" 
                  placeholder="Enter a detailed description..."
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                />
              </div>

              <div className="or-input-group">
                <label className="or-input-label">Search</label>
                <div style={{ position: 'relative' }}>
                  <input 
                    type="text" 
                    className="or-input" 
                    placeholder="Search for anything..."
                    style={{ paddingLeft: '2.5rem' }}
                  />
                  <Search 
                    size={18} 
                    style={{ 
                      position: 'absolute', 
                      left: '0.75rem', 
                      top: '50%', 
                      transform: 'translateY(-50%)',
                      color: '#8B949E'
                    }} 
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Badges</div>
              <div className="or-card-description">Status indicators and labels</div>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <span className="or-badge or-badge-default">Default</span>
              <span className="or-badge or-badge-primary">Primary</span>
              <span className="or-badge or-badge-success">Success</span>
              <span className="or-badge or-badge-error">Error</span>
              <span className="or-badge or-badge-warning">Warning</span>
              <span className="or-badge or-badge-info">Info</span>
            </div>
          </div>

          {/* Alerts */}
          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Alerts</div>
              <div className="or-card-description">Contextual feedback messages</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="or-alert or-alert-info">
                <Info size={20} />
                <div>
                  <strong>Information:</strong> This is an informational message providing helpful context.
                </div>
              </div>
              
              <div className="or-alert or-alert-success">
                <CheckCircle size={20} />
                <div>
                  <strong>Success!</strong> Your changes have been saved successfully.
                </div>
              </div>
              
              <div className="or-alert or-alert-warning">
                <AlertCircle size={20} />
                <div>
                  <strong>Warning:</strong> Please review your settings before continuing.
                </div>
              </div>
              
              <div className="or-alert or-alert-error">
                <XCircle size={20} />
                <div>
                  <strong>Error:</strong> There was a problem processing your request.
                </div>
              </div>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Metrics</div>
              <div className="or-card-description">Data visualization components</div>
            </div>
            
            <div className="or-grid or-grid-cols-3">
              <div className="or-metric-card">
                <div className="or-metric-value">$24,650</div>
                <div className="or-metric-label">Total Revenue</div>
                <div className="or-metric-change or-metric-change-positive">
                  <TrendingUp size={16} />
                  <span>12.5%</span>
                </div>
              </div>
              
              <div className="or-metric-card">
                <div className="or-metric-value">1,429</div>
                <div className="or-metric-label">Active Users</div>
                <div className="or-metric-change or-metric-change-positive">
                  <TrendingUp size={16} />
                  <span>8.2%</span>
                </div>
              </div>
              
              <div className="or-metric-card">
                <div className="or-metric-value">89.3%</div>
                <div className="or-metric-label">Success Rate</div>
                <div className="or-metric-change or-metric-change-negative">
                  <TrendingDown size={16} />
                  <span>2.1%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Data Table</div>
              <div className="or-card-description">Structured data display</div>
            </div>
            
            <div className="or-table-container">
              <table className="or-table">
                <thead className="or-table-header">
                  <tr>
                    <th className="or-table-header-cell">Model</th>
                    <th className="or-table-header-cell">Provider</th>
                    <th className="or-table-header-cell">Tokens/Min</th>
                    <th className="or-table-header-cell">Price</th>
                    <th className="or-table-header-cell">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="or-table-row">
                    <td className="or-table-cell">GPT-4</td>
                    <td className="or-table-cell">OpenAI</td>
                    <td className="or-table-cell">8,000</td>
                    <td className="or-table-cell">$0.03/1K</td>
                    <td className="or-table-cell">
                      <span className="or-badge or-badge-success">Active</span>
                    </td>
                  </tr>
                  <tr className="or-table-row">
                    <td className="or-table-cell">Claude 3</td>
                    <td className="or-table-cell">Anthropic</td>
                    <td className="or-table-cell">10,000</td>
                    <td className="or-table-cell">$0.025/1K</td>
                    <td className="or-table-cell">
                      <span className="or-badge or-badge-success">Active</span>
                    </td>
                  </tr>
                  <tr className="or-table-row">
                    <td className="or-table-cell">Gemini Pro</td>
                    <td className="or-table-cell">Google</td>
                    <td className="or-table-cell">12,000</td>
                    <td className="or-table-cell">$0.02/1K</td>
                    <td className="or-table-cell">
                      <span className="or-badge or-badge-warning">Limited</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Layout Section */}
        <section className="or-section" id="layout">
          <h2 className="or-h2" style={{ marginBottom: '2rem' }}>Layout</h2>
          
          {/* Card Grid */}
          <div className="or-card">
            <div className="or-card-header">
              <div className="or-card-title">Card Grid Layout</div>
              <div className="or-card-description">Responsive grid system for card layouts</div>
            </div>
            
            <div className="or-grid or-grid-cols-3">
              <div className="or-card or-card-compact">
                <h5 className="or-h5">Feature One</h5>
                <p className="or-text-small" style={{ marginTop: '0.5rem' }}>
                  Brief description of this feature and its benefits.
                </p>
              </div>
              <div className="or-card or-card-compact">
                <h5 className="or-h5">Feature Two</h5>
                <p className="or-text-small" style={{ marginTop: '0.5rem' }}>
                  Brief description of this feature and its benefits.
                </p>
              </div>
              <div className="or-card or-card-compact">
                <h5 className="or-h5">Feature Three</h5>
                <p className="or-text-small" style={{ marginTop: '0.5rem' }}>
                  Brief description of this feature and its benefits.
                </p>
              </div>
            </div>
          </div>

          {/* Loading States */}
          <div className="or-card" style={{ marginTop: '1.5rem' }}>
            <div className="or-card-header">
              <div className="or-card-title">Loading States</div>
              <div className="or-card-description">Skeleton loaders for async content</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="or-skeleton or-skeleton-title"></div>
              <div className="or-skeleton or-skeleton-text"></div>
              <div className="or-skeleton or-skeleton-text" style={{ width: '80%' }}></div>
              <div className="or-skeleton or-skeleton-text" style={{ width: '60%' }}></div>
              <div className="or-skeleton or-skeleton-button"></div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="or-divider"></div>
        <footer style={{ padding: '2rem 0', textAlign: 'center' }}>
          <p className="or-text-small">
            OpenRouter Design System • Clean, Professional, Enterprise-Grade
          </p>
        </footer>
      </div>
    </div>
  );
};