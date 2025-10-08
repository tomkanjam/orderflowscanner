/**
 * Supabase-Style Design System Guide
 * Showcases all components styled with Supabase's design language
 */

import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Activity,
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Clock,
  Home,
  Settings,
  TrendingUp,
  User,
  Zap
} from 'lucide-react';
import { TabBar } from '../components/demo/TabBar';
import { FilterInput } from '../components/demo/FilterInput';
import { CategoryHeader } from '../components/demo/CategoryHeader';
import { ExpandableSignalCard } from '../components/demo/ExpandableSignalCard';
import { mockSignals, groupSignalsByCategory, filterSignals } from '../components/demo/mockSignals';

export const StyleGuideSupabase: React.FC = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');

  // Signal Library Demo State
  const [activeTab, setActiveTab] = useState('builtin');
  const [filterQuery, setFilterQuery] = useState('');
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);

  // Ensure dark mode is applied on mount
  React.useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  // Filter and organize signals
  const filteredSignals = useMemo(() => filterSignals(mockSignals, filterQuery), [filterQuery]);

  const builtInSignals = useMemo(
    () => filteredSignals.filter(s => s.isBuiltIn),
    [filteredSignals]
  );

  const personalSignals = useMemo(
    () => filteredSignals.filter(s => !s.isBuiltIn),
    [filteredSignals]
  );

  const favoriteSignals = useMemo(
    () => filteredSignals.filter(s => [1, 4, 7, 13].includes(parseInt(s.id))),
    [filteredSignals]
  );

  const groupedBuiltIn = useMemo(
    () => groupSignalsByCategory(builtInSignals),
    [builtInSignals]
  );

  const tabs = [
    { id: 'builtin', label: 'Built-in', count: builtInSignals.length },
    { id: 'personal', label: 'Personal', count: personalSignals.length },
    { id: 'favorites', label: 'Favorites', count: favoriteSignals.length }
  ];

  const getCurrentSignals = () => {
    switch (activeTab) {
      case 'builtin':
        return builtInSignals;
      case 'personal':
        return personalSignals;
      case 'favorites':
        return favoriteSignals;
      default:
        return [];
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Bar */}
      <header className="top-bar sticky top-0 z-50">
        <div className="container mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary-foreground">
                  <path d="M13 12L20 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"></path>
                  <path d="M4 5L8 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"></path>
                  <path d="M8 15L4 19" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"></path>
                </svg>
              </div>
              <span className="font-semibold text-lg">vyx</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? '☀️' : '🌙'} {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Avatar className="w-6 h-6">
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                  <span>John Doe</span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Redesigned Sidebar - Full Featured */}
        <aside className="w-[360px] border-r border-border bg-[var(--sidebar-background)] h-[calc(100vh-3.5rem)] sticky top-14 flex flex-col">
          {/* Status Bar */}
          <div className="px-4 py-3 border-b border-border bg-[var(--sidebar-accent)]/30">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
                <span className="text-muted-foreground">Connected</span>
              </div>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span>100 tickers</span>
                <span>•</span>
                <span>12 signals</span>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Create Signal Button */}
            <Button className="w-full justify-start gap-2" size="lg">
              <Activity className="w-5 h-5" />
              Create Signal with AI
            </Button>

            {/* Built-in Signals Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Built-in Signals
                </h3>
                <Badge variant="secondary" className="text-xs">8</Badge>
              </div>

              <div className="space-y-1">
                {/* Signal Items */}
                <div className="group relative p-3 rounded-lg border border-border bg-card hover:border-primary/50 cursor-pointer transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">Volume Spike Breakout</span>
                        <Badge variant="outline" className="text-xs shrink-0">Beginner</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Identifies coins with sudden volume increases and price breakouts
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                        <CheckCircle2 className="w-4 h-4 text-primary" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    <span>5 matches</span>
                    <span className="ml-auto">2m ago</span>
                  </div>
                </div>

                <div className="group relative p-3 rounded-lg border border-border bg-card hover:border-primary/50 cursor-pointer transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">RSI Oversold Recovery</span>
                        <Badge variant="outline" className="text-xs shrink-0">Intermediate</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Catches oversold coins showing signs of reversal
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    <span>2 matches</span>
                    <span className="ml-auto">5m ago</span>
                  </div>
                </div>

                <div className="group relative p-3 rounded-lg border border-border bg-card hover:border-primary/50 cursor-pointer transition-all opacity-50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">MACD Momentum Shift</span>
                        <Badge variant="outline" className="text-xs shrink-0">Advanced</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Detects MACD crossovers with strong momentum
                      </p>
                    </div>
                    <Badge className="shrink-0 bg-primary/10 text-primary border-primary/20">Pro</Badge>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Custom Signals Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  My Signals
                </h3>
                <Badge variant="secondary" className="text-xs">2 / 10</Badge>
              </div>

              <div className="space-y-1">
                <div className="group relative p-3 rounded-lg border border-border bg-card hover:border-primary/50 cursor-pointer transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate mb-1">My Custom Scalp</span>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        Quick scalps on 5m timeframe with tight stops
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <Settings className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    <span>12 matches</span>
                    <span className="ml-auto">1m ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* User Menu Footer */}
          <div className="p-4 border-t border-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-[var(--sidebar-accent)] hover:bg-accent transition-colors">
                  <Avatar className="w-8 h-8">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">JD</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <div className="text-sm font-medium truncate">john@example.com</div>
                    <div className="text-xs text-primary">Pro Tier</div>
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[320px]">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="w-4 h-4 mr-2" />
                  Account Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <User className="w-4 h-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 space-y-12">
          {/* Header */}
          <div>
            <h1 className="text-4xl font-bold mb-2">Supabase Design System</h1>
            <p className="text-muted-foreground">
              A comprehensive style guide showcasing shadcn/ui components with Supabase styling
            </p>
          </div>

          {/* Colors */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Color Palette</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Using oklch color space for better perceptual uniformity
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-background border border-border mb-3"></div>
                  <div className="text-sm font-medium">Background</div>
                  <div className="text-xs text-muted-foreground">--background</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-primary mb-3"></div>
                  <div className="text-sm font-medium">Primary</div>
                  <div className="text-xs text-muted-foreground">--primary</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-secondary mb-3"></div>
                  <div className="text-sm font-medium">Secondary</div>
                  <div className="text-xs text-muted-foreground">--secondary</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-muted mb-3"></div>
                  <div className="text-sm font-medium">Muted</div>
                  <div className="text-xs text-muted-foreground">--muted</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-accent mb-3"></div>
                  <div className="text-sm font-medium">Accent</div>
                  <div className="text-xs text-muted-foreground">--accent</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-destructive mb-3"></div>
                  <div className="text-sm font-medium">Destructive</div>
                  <div className="text-xs text-muted-foreground">--destructive</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded bg-card border border-border mb-3"></div>
                  <div className="text-sm font-medium">Card</div>
                  <div className="text-xs text-muted-foreground">--card</div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="w-full h-20 rounded border-2 border-border mb-3"></div>
                  <div className="text-sm font-medium">Border</div>
                  <div className="text-xs text-muted-foreground">--border</div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Buttons */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Buttons</h2>
              <p className="text-sm text-muted-foreground">Various button variants and sizes</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Variants</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Button>Default</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="link">Link</Button>
                <Button variant="destructive">Destructive</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sizes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-4">
                <Button size="sm">Small</Button>
                <Button>Default</Button>
                <Button size="lg">Large</Button>
                <Button size="icon">
                  <Settings className="w-4 h-4" />
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>With Icons</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Button>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Confirm
                </Button>
                <Button variant="outline">
                  <AlertCircle className="w-4 h-4 mr-2" />
                  Warning
                </Button>
                <Button variant="secondary">
                  <Clock className="w-4 h-4 mr-2" />
                  Schedule
                </Button>
              </CardContent>
            </Card>
          </section>

          {/* Badges */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Badges</h2>
              <p className="text-sm text-muted-foreground">Status indicators and labels</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Variants</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Badge>Default</Badge>
                <Badge variant="secondary">Secondary</Badge>
                <Badge variant="outline">Outline</Badge>
                <Badge variant="destructive">Destructive</Badge>
                <Badge className="badge-success">Success</Badge>
                <Badge className="badge-warning">Warning</Badge>
                <Badge className="badge-error">Error</Badge>
              </CardContent>
            </Card>
          </section>

          {/* Cards */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Cards</h2>
              <p className="text-sm text-muted-foreground">Content containers</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Simple Card</CardTitle>
                  <CardDescription>Basic card with title and description</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">
                    This is the card content area where you can place any content.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-primary" />
                    With Icon
                  </CardTitle>
                  <CardDescription>Card with icon in header</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className="badge-success">Active</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Progress</span>
                      <span className="font-medium">75%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>With Footer</CardTitle>
                  <CardDescription>Card including footer actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Content with action buttons in footer.
                  </p>
                </CardContent>
                <CardFooter className="flex gap-2">
                  <Button size="sm" variant="outline">Cancel</Button>
                  <Button size="sm">Save</Button>
                </CardFooter>
              </Card>
            </div>
          </section>

          {/* Stats Cards */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Stats Cards</h2>
              <p className="text-sm text-muted-foreground">Dashboard statistics display</p>
            </div>

            <div className="grid md:grid-cols-4 gap-6">
              <div className="stat-card">
                <div className="stat-label">Active Signals</div>
                <div className="stat-value">24</div>
                <div className="flex items-center gap-2 mt-2">
                  <TrendingUp className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-500">+12% from last week</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Active Traders</div>
                <div className="stat-value">8</div>
                <div className="flex items-center gap-2 mt-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">All running</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Market Pairs</div>
                <div className="stat-value">100</div>
                <div className="flex items-center gap-2 mt-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <span className="text-xs text-green-500">Connected</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Win Rate</div>
                <div className="stat-value">68%</div>
                <div className="flex items-center gap-2 mt-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Last 30 days</span>
                </div>
              </div>
            </div>
          </section>

          {/* Typography */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Typography</h2>
              <p className="text-sm text-muted-foreground">Text styles and hierarchy</p>
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h1 className="text-4xl font-bold">Heading 1</h1>
                  <p className="text-xs text-muted-foreground mt-1">text-4xl font-bold</p>
                </div>
                <div>
                  <h2 className="text-3xl font-semibold">Heading 2</h2>
                  <p className="text-xs text-muted-foreground mt-1">text-3xl font-semibold</p>
                </div>
                <div>
                  <h3 className="text-2xl font-semibold">Heading 3</h3>
                  <p className="text-xs text-muted-foreground mt-1">text-2xl font-semibold</p>
                </div>
                <div>
                  <h4 className="text-xl font-medium">Heading 4</h4>
                  <p className="text-xs text-muted-foreground mt-1">text-xl font-medium</p>
                </div>
                <Separator />
                <div>
                  <p className="text-base">Body text - Regular paragraph content</p>
                  <p className="text-xs text-muted-foreground mt-1">text-base</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Small muted text - Secondary information</p>
                  <p className="text-xs text-muted-foreground mt-1">text-sm text-muted-foreground</p>
                </div>
                <div>
                  <code className="text-sm font-mono bg-muted px-2 py-1 rounded">
                    const code = 'monospace';
                  </code>
                  <p className="text-xs text-muted-foreground mt-1">font-mono bg-muted</p>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Signal Library Demo */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Signal Library (New Design)</h2>
              <p className="text-sm text-muted-foreground">
                Expandable cards with tabs, filter, and categories
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Organized Signal Library</CardTitle>
                <CardDescription>
                  Features: Tabs (Built-in, Personal, Favorites), real-time filter, category subsections, expandable cards
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filter Input */}
                <FilterInput
                  value={filterQuery}
                  onChange={setFilterQuery}
                  placeholder="Search signals... (try 'momentum' or 'rsi')"
                />

                {/* Tab Bar */}
                <TabBar
                  tabs={tabs}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                />

                {/* Signal List */}
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {activeTab === 'builtin' && (
                    <>
                      {Object.entries(groupedBuiltIn).map(([category, signals]) => (
                        <div key={category}>
                          <CategoryHeader category={category} count={signals.length} />
                          <div className="space-y-2">
                            {signals.map(signal => (
                              <ExpandableSignalCard
                                key={signal.id}
                                signal={signal}
                                isExpanded={expandedCardId === signal.id}
                                onToggleExpand={() =>
                                  setExpandedCardId(expandedCardId === signal.id ? null : signal.id)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {activeTab === 'personal' && (
                    <div className="space-y-2">
                      {personalSignals.length > 0 ? (
                        personalSignals.map(signal => (
                          <ExpandableSignalCard
                            key={signal.id}
                            signal={signal}
                            isExpanded={expandedCardId === signal.id}
                            onToggleExpand={() =>
                              setExpandedCardId(expandedCardId === signal.id ? null : signal.id)
                            }
                          />
                        ))
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">No personal signals found</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'favorites' && (
                    <div className="space-y-2">
                      {favoriteSignals.length > 0 ? (
                        favoriteSignals.map(signal => (
                          <ExpandableSignalCard
                            key={signal.id}
                            signal={signal}
                            isExpanded={expandedCardId === signal.id}
                            onToggleExpand={() =>
                              setExpandedCardId(expandedCardId === signal.id ? null : signal.id)
                            }
                          />
                        ))
                      ) : (
                        <div className="text-center py-12 text-muted-foreground">
                          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">No favorite signals</p>
                        </div>
                      )}
                    </div>
                  )}

                  {getCurrentSignals().length === 0 && filterQuery && (
                    <div className="text-center py-12 text-muted-foreground">
                      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">No signals match "{filterQuery}"</p>
                      <p className="text-xs mt-1">Try a different search term</p>
                    </div>
                  )}
                </div>

                {/* Results Summary */}
                {filterQuery && getCurrentSignals().length > 0 && (
                  <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
                    Showing {getCurrentSignals().length} of {mockSignals.filter(s =>
                      activeTab === 'builtin' ? s.isBuiltIn :
                      activeTab === 'personal' ? !s.isBuiltIn :
                      true
                    ).length} signals
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Footer */}
          <div className="pt-8 pb-16 text-center text-sm text-muted-foreground">
            <p>Supabase-inspired design system built with shadcn/ui</p>
          </div>
        </main>
      </div>
    </div>
  );
};
