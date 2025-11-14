import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { CheckCircle, XCircle, Clock, AlertCircle, Activity } from 'lucide-react';

interface FlyAppEvent {
  id: string;
  event_type: string;
  status: string;
  metadata: any;
  error_details: string | null;
  created_at: string;
}

interface FlyAppEventLogProps {
  appId: string;
}

export const FlyAppEventLog: React.FC<FlyAppEventLogProps> = ({ appId }) => {
  const [events, setEvents] = useState<FlyAppEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEvents();
  }, [appId]);

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('user_fly_app_events')
        .select('*')
        .eq('fly_app_id', appId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data) {
        setEvents(data);
      }
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  }

  function getEventIcon(eventType: string) {
    if (eventType.includes('completed') || eventType.includes('passed')) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
    if (eventType.includes('failed') || eventType.includes('error')) {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    if (eventType.includes('started') || eventType.includes('requested')) {
      return <Clock className="w-4 h-4 text-blue-500" />;
    }
    return <Activity className="w-4 h-4 text-gray-400" />;
  }

  function getEventBadgeVariant(eventType: string): any {
    if (eventType.includes('completed') || eventType.includes('passed')) {
      return 'default';
    }
    if (eventType.includes('failed') || eventType.includes('error')) {
      return 'destructive';
    }
    return 'secondary';
  }

  function formatEventType(eventType: string): string {
    return eventType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-400">
        Loading events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="p-8 text-center text-gray-400">
        No events found for this app.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {events.map(event => (
        <Card key={event.id} className="bg-gray-700 border-gray-600">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                {getEventIcon(event.event_type)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={getEventBadgeVariant(event.event_type)}>
                    {formatEventType(event.event_type)}
                  </Badge>
                  <span className="text-sm text-gray-400">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-gray-300 mb-2">
                  Status: <span className="font-medium">{event.status}</span>
                </div>
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div className="text-xs text-gray-400 bg-gray-800 rounded p-2 mb-2">
                    <div className="font-mono">
                      {JSON.stringify(event.metadata, null, 2)}
                    </div>
                  </div>
                )}
                {event.error_details && (
                  <div className="text-sm text-red-400 bg-red-900/20 rounded p-2 border border-red-800">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div className="font-mono text-xs">{event.error_details}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
