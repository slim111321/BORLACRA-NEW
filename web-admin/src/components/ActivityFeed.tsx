import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

import { 
  PlusCircle, 
  CheckCircle, 
  XCircle, 
  Activity, 
  AlertTriangle, 
  RefreshCcw,
  Clock,
  User
} from 'lucide-react';

const ActivityFeed = () => {
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();

    const subscription = supabase
      .channel('platform_activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'platform_activity' }, (payload: any) => {

        setActivities((prev) => [payload.new, ...prev].slice(0, 50));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_activity')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      setActivities(data || []);
    } catch (err) {
      console.error('fetchActivities error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'PICKUP_CREATED': return <PlusCircle size={16} color="#3b82f6" />;
      case 'PICKUP_ACCEPTED': return <Activity size={16} color="#f59e0b" />;
      case 'PICKUP_COMPLETED': return <CheckCircle size={16} color="#10b981" />;
      case 'PICKUP_CANCELLED': return <XCircle size={16} color="#ef4444" />;
      case 'REFUND_ISSUED': return <RefreshCcw size={16} color="#8b5cf6" />;
      case 'COLLECTOR_STATUS_CHANGE': return <User size={16} color="#94a3b8" />;
      case 'EMERGENCY_REPORT': return <AlertTriangle size={16} color="#ef4444" />;
      default: return <Clock size={16} color="#64748b" />;
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div style={{ color: '#94a3b8', padding: '1rem' }}>Loading activity...</div>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Live Activity Feed</h3>
        <span style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#10b981' }}></div>
          Live
        </span>
      </div>
      
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }} className="custom-scrollbar">
        {activities.length > 0 ? activities.map((activity) => (
          <div key={activity.id} style={{ 
            padding: '0.75rem', 
            borderBottom: '1px solid var(--border)', 
            display: 'flex', 
            gap: '0.75rem',
            animation: 'fadeIn 0.3s ease-out'
          }}>
            <div style={{ marginTop: '0.25rem' }}>
              {getEventIcon(activity.event_type)}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                {activity.description}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {activity.event_type.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                  {formatTime(activity.created_at)}
                </span>
              </div>
            </div>
          </div>
        )) : (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            No recent activity recorded.
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityFeed;
