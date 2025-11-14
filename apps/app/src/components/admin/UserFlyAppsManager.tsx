import React, { useEffect, useState } from 'react';
import { supabase } from '../../config/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Activity, AlertCircle, CheckCircle, Clock, DollarSign, Server, ExternalLink } from 'lucide-react';
import { FlyAppEventLog } from './FlyAppEventLog';

interface UserFlyApp {
  id: string;
  user_id: string;
  fly_app_name: string;
  status: 'provisioning' | 'active' | 'error' | 'deprovisioning' | 'deleted';
  region: string;
  health_status: 'healthy' | 'unhealthy' | 'unknown' | null;
  last_health_check: string | null;
  created_at: string;
  monthly_cost_estimate_usd: number | null;
  email: string;
  display_name: string | null;
}

export const UserFlyAppsManager: React.FC = () => {
  const [apps, setApps] = useState<UserFlyApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadApps();
    // Refresh every 30 seconds
    const interval = setInterval(loadApps, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadApps() {
    try {
      const { data, error } = await supabase
        .from('user_fly_apps_with_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        setApps(data as UserFlyApp[]);
      }
    } catch (error) {
      console.error('Error loading apps:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleProvision(userId: string) {
    setActionLoading(userId);
    try {
      const { error } = await supabase.functions.invoke('provision-user-fly-app', {
        body: { user_id: userId, tier: 'pro' }
      });

      if (error) throw error;

      alert('Provisioning started successfully');
      await loadApps();
    } catch (error: any) {
      alert('Failed to provision: ' + (error.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeprovision(userId: string) {
    if (!confirm('Are you sure you want to deprovision this user\'s Fly app? This will stop all their traders.')) {
      return;
    }

    setActionLoading(userId);
    try {
      const { error } = await supabase.functions.invoke('deprovision-user-fly-app', {
        body: { user_id: userId, reason: 'admin_manual' }
      });

      if (error) throw error;

      alert('Deprovisioning started successfully');
      await loadApps();
    } catch (error: any) {
      alert('Failed to deprovision: ' + (error.message || 'Unknown error'));
    } finally {
      setActionLoading(null);
    }
  }

  function getStatusBadge(status: string) {
    const variants: Record<string, { variant: any; icon: any; label: string }> = {
      provisioning: { variant: 'default', icon: Clock, label: 'Provisioning' },
      active: { variant: 'default', icon: CheckCircle, label: 'Active' },
      error: { variant: 'destructive', icon: AlertCircle, label: 'Error' },
      deprovisioning: { variant: 'secondary', icon: Clock, label: 'Deprovisioning' },
      deleted: { variant: 'secondary', icon: AlertCircle, label: 'Deleted' },
    };

    const config = variants[status] || variants.deleted;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {config.label}
      </Badge>
    );
  }

  function getHealthBadge(health: string | null) {
    if (!health || health === 'unknown') {
      return <Badge variant="secondary">Unknown</Badge>;
    }

    return health === 'healthy' ? (
      <Badge variant="default" className="bg-green-600">
        <CheckCircle className="w-3 h-3 mr-1" />
        Healthy
      </Badge>
    ) : (
      <Badge variant="destructive">
        <AlertCircle className="w-3 h-3 mr-1" />
        Unhealthy
      </Badge>
    );
  }

  const stats = {
    total: apps.length,
    active: apps.filter(a => a.status === 'active').length,
    errors: apps.filter(a => a.status === 'error').length,
    totalCost: apps.reduce((sum, a) => sum + (a.monthly_cost_estimate_usd || 0), 0),
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-400">Loading Fly apps...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">User Fly Apps</h1>
        <p className="text-gray-400">Monitor and manage dedicated Fly.io apps for Pro/Elite users</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="text-gray-400">Total Apps</CardDescription>
            <CardTitle className="text-3xl text-white flex items-center gap-2">
              <Server className="w-6 h-6 text-blue-500" />
              {stats.total}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="text-gray-400">Active</CardDescription>
            <CardTitle className="text-3xl text-green-500 flex items-center gap-2">
              <Activity className="w-6 h-6" />
              {stats.active}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="text-gray-400">Errors</CardDescription>
            <CardTitle className="text-3xl text-red-500 flex items-center gap-2">
              <AlertCircle className="w-6 h-6" />
              {stats.errors}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="bg-gray-800 border-gray-700">
          <CardHeader className="pb-3">
            <CardDescription className="text-gray-400">Est. Monthly Cost</CardDescription>
            <CardTitle className="text-3xl text-white flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-yellow-500" />
              ${stats.totalCost.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Apps Table */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Fly Apps</CardTitle>
          <CardDescription className="text-gray-400">
            {apps.length} apps currently tracked
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-700 hover:bg-gray-700/50">
                  <TableHead className="text-gray-300">User</TableHead>
                  <TableHead className="text-gray-300">App Name</TableHead>
                  <TableHead className="text-gray-300">Status</TableHead>
                  <TableHead className="text-gray-300">Health</TableHead>
                  <TableHead className="text-gray-300">Region</TableHead>
                  <TableHead className="text-gray-300">Cost/Mo</TableHead>
                  <TableHead className="text-gray-300">Created</TableHead>
                  <TableHead className="text-gray-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map(app => (
                  <TableRow key={app.id} className="border-gray-700 hover:bg-gray-700/50">
                    <TableCell className="text-gray-200">
                      {app.email || 'Unknown'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <a
                        href={`https://fly.io/apps/${app.fly_app_name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-400 hover:text-blue-300 flex items-center gap-1"
                      >
                        {app.fly_app_name}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell>{getHealthBadge(app.health_status)}</TableCell>
                    <TableCell className="text-gray-300">{app.region}</TableCell>
                    <TableCell className="text-gray-300">
                      ${app.monthly_cost_estimate_usd?.toFixed(2) || '0.00'}
                    </TableCell>
                    <TableCell className="text-gray-400 text-sm">
                      {new Date(app.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`https://${app.fly_app_name}.fly.dev/health`, '_blank')}
                          className="text-xs"
                        >
                          Health
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedAppId(app.id)}
                          className="text-xs"
                        >
                          Events
                        </Button>
                        {app.status === 'active' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeprovision(app.user_id)}
                            disabled={actionLoading === app.user_id}
                            className="text-xs"
                          >
                            {actionLoading === app.user_id ? 'Processing...' : 'Deprovision'}
                          </Button>
                        )}
                        {app.status === 'error' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleProvision(app.user_id)}
                            disabled={actionLoading === app.user_id}
                            className="text-xs"
                          >
                            {actionLoading === app.user_id ? 'Processing...' : 'Retry'}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {apps.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              No Fly apps found. Apps will appear here when users upgrade to Pro/Elite tier.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Log Modal */}
      {selectedAppId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">Event Log</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedAppId(null)}
              >
                Close
              </Button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-4rem)]">
              <FlyAppEventLog appId={selectedAppId} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
