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
  Plus,
  Settings,
  TrendingUp,
  User,
  Zap
} from 'lucide-react';
import { TabBar } from '../components/TabBar';
import { FilterInput } from '../components/FilterInput';
import { CategoryHeader } from '../components/CategoryHeader';
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
    <div className="min-h-screen bg-background flex">
      {/* Signal Library Sidebar */}
      <aside className="w-[360px] border-r border-border bg-background h-screen sticky top-0 flex flex-col">
        {/* Logo and App Name */}
        <div className="px-4 py-4 border-b border-border">
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

        {/* Create Button */}
        <div className="px-4 pt-4 pb-2">
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium"
            >
              <Plus className="h-5 w-5" />
              Create
            </button>
          </div>

          {/* Filter Input */}
          <div className="px-4 pb-2">
            <FilterInput
              value={filterQuery}
              onChange={setFilterQuery}
              placeholder="Search..."
            />
          </div>

          {/* Tab Bar */}
          <div className="px-4">
            <TabBar
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </div>

          {/* Signal List */}
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4">
            {/* Built-in Tab: Grouped by Category */}
            {activeTab === 'builtin' && (
              <div className="space-y-1">
                {Object.entries(groupedBuiltIn).map(([category, signals]) => (
                  <div key={category}>
                    <CategoryHeader category={category} count={signals.length} />
                    <div className="space-y-2">
                      {signals.map(signal => (
                        <ExpandableSignalCard
                          key={signal.id}
                          signal={signal}
                          isExpanded={expandedCardId === signal.id}
                          onToggleExpand={() => setExpandedCardId(expandedCardId === signal.id ? null : signal.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Personal Tab */}
            {activeTab === 'personal' && (
              <div className="space-y-2">
                {personalSignals.map(signal => (
                  <ExpandableSignalCard
                    key={signal.id}
                    signal={signal}
                    isExpanded={expandedCardId === signal.id}
                    onToggleExpand={() => setExpandedCardId(expandedCardId === signal.id ? null : signal.id)}
                  />
                ))}
              </div>
            )}

            {/* Favorites Tab */}
            {activeTab === 'favorites' && (
              <div className="space-y-2">
                {favoriteSignals.map(signal => (
                  <ExpandableSignalCard
                    key={signal.id}
                    signal={signal}
                    isExpanded={expandedCardId === signal.id}
                    onToggleExpand={() => setExpandedCardId(expandedCardId === signal.id ? null : signal.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-8 space-y-12">
          {/* Header with User Menu */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">Supabase Design System</h1>
              <p className="text-muted-foreground">
                A comprehensive style guide showcasing shadcn/ui components with Supabase styling
              </p>
            </div>

            {/* User Menu */}
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

          {/* Running Signal Name Color Options */}
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold mb-2">Running Signal Name Colors</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Color options for running signal/trader names (currently using primary)
              </p>
            </div>

            <div className="grid gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Current: Primary (Supabase Yellow/Gold)</CardTitle>
                  <CardDescription>Default brand color - #f5b700</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-primary">RSI Momentum Signal (Running)</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded text-green-500 bg-green-500/10 border border-green-500/20">Triggered</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-primary">MACD Crossover Detector (Running)</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Option 1: Green-400 (Neon Success)</CardTitle>
                  <CardDescription>Bright neon green - #00FF88</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-green-400">RSI Momentum Signal (Running)</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded text-green-500 bg-green-500/10 border border-green-500/20">Triggered</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-green-400">MACD Crossover Detector (Running)</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Option 2: Cyan-400 (Bright Blue)</CardTitle>
                  <CardDescription>Bright cyan/blue - #3399FF</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-cyan-400">RSI Momentum Signal (Running)</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded text-green-500 bg-green-500/10 border border-green-500/20">Triggered</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-cyan-400">MACD Crossover Detector (Running)</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Option 3: Amber-400 (Bright Orange)</CardTitle>
                  <CardDescription>Vibrant orange - #FF7A1A</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-amber-400">RSI Momentum Signal (Running)</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded text-green-500 bg-green-500/10 border border-green-500/20">Triggered</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-amber-400">MACD Crossover Detector (Running)</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Option 4: Foreground (Neutral White)</CardTitle>
                  <CardDescription>Just brighter than muted - #e8e8e8</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">RSI Momentum Signal (Running)</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded text-green-500 bg-green-500/10 border border-green-500/20">Triggered</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">MACD Crossover Detector (Running)</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

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
    );
  };
