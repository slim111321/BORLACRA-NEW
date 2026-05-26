import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import LiveMap from './components/LiveMap';
import ActivityFeed from './components/ActivityFeed';

import { 
  Lock, 
  LogOut, 
  Shield, 
  LayoutDashboard, 
  Users, 
  Truck, 
  Banknote, 
  CheckCircle, 
  Clock, 
  TrendingUp,
  Map,
  FileCheck,
  Settings,
  MapPin,
  Activity,
  AlertTriangle,
  CreditCard,
  RefreshCcw,
  Percent,
  Search,
  Eye,
  User as UserIcon,
  X,
  Star,
  Megaphone,
  PlusCircle,
  Award,
  Database,
  Brain,
  FileText,
  RefreshCw,
  MessageSquare,
  Phone
} from 'lucide-react';



import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area,
  PieChart as RePieChart, Pie, Cell, Legend
} from 'recharts';



import './index.css';

function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Data State
  const [overview, setOverview] = useState<any>({
    totalUsers: 0,
    activeCollectors: 0,
    monthlyRevenue: 0,
    pendingKYC: []
  });
  const [landfills, setLandfills] = useState<any[]>([]);
  const [fleetStatus, setFleetStatus] = useState<any[]>([]);
  
  // Finance State
  const [payoutRequests, setPayoutRequests] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const ticketChannelRef = useRef<any>(null);

  const playPing = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
      const context = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (context.state === 'suspended') {
        await context.resume();
      }
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, context.currentTime);
      
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, context.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.5);

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.5);
    } catch (e) {
      console.warn("Audio play failed:", e);
    }
  };
  const [refundRequests, setRefundRequests] = useState<any[]>([]);
  const [incidentReports, setIncidentReports] = useState<any[]>([]);
  const [intelSummary, setIntelSummary] = useState<any>(null);
  const [revenueTrend, setRevenueTrend] = useState<any[]>([]);
  const [trashDistribution, setTrashDistribution] = useState<any[]>([]);
  const [topCollectors, setTopCollectors] = useState<any[]>([]);


  const [systemSettings, setSystemSettings] = useState<any>({
    commission_rate: 20,
    surge_multiplier: 1.5
  });

  // User Management State
  const [platformUsers, setPlatformUsers] = useState<any[]>([]);
  const [kycFiles, setKycFiles] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [selectedUserDocs, setSelectedUserDocs] = useState<any>(null);

  const handleOpenKycModal = async (u: any) => {
    let docs = kycFiles.filter(f => f.collector_id === u.id);
    
    // Fallback: If RLS blocked collector_documents table, pull from profiles.vehicle_details.kyc_docs
    const vDetails = typeof u.vehicle_details === 'string' ? JSON.parse(u.vehicle_details) : (u.vehicle_details || {});
    if (docs.length === 0 && vDetails?.kyc_docs) {
      docs = Object.entries(vDetails.kyc_docs).map(([key, url]) => ({
        id: key,
        collector_id: u.id,
        doc_type: key,
        doc_url: url,
        created_at: u.created_at || new Date().toISOString()
      }));
    }
    
    // Generate signed URLs dynamically to bypass private bucket 403 errors
    const processedDocs = await Promise.all(docs.map(async (doc) => {
      try {
        // Extract the path from the full public URL
        const urlToSplit = doc.doc_url || doc.document_url || '';
        const parts = urlToSplit.split('/collector-documents/');
        if (parts.length > 1) {
          const path = decodeURIComponent(parts[1].split('?')[0]);
          const { data, error } = await supabase.storage.from('collector-documents').createSignedUrl(path, 60 * 60); // 1 hour expiry
          if (error) {
            console.error('Signed URL Error:', error);
            alert(`Error generating URL for ${path}: ${error.message}`);
          }
          if (!error && data?.signedUrl) {
            return { ...doc, doc_url: data.signedUrl, document_url: data.signedUrl };
          }
        }
      } catch (e) {
        console.error('Error generating signed url', e);
      }
      return doc; // fallback to original if failed
    }));

    let processedUser = { ...u };
    if (u.vehicle_details?.photo_url) {
      try {
        const vParts = u.vehicle_details.photo_url.split('/collector-documents/');
        if (vParts.length > 1) {
          const vPath = decodeURIComponent(vParts[1].split('?')[0]);
          const { data, error } = await supabase.storage.from('collector-documents').createSignedUrl(vPath, 60 * 60);
          if (error) {
            console.error('Signed URL Error (Vehicle):', error);
            alert(`Error generating URL for Vehicle Photo: ${error.message}`);
          }
          if (!error && data?.signedUrl) {
            processedUser.vehicle_details = { ...u.vehicle_details, photo_url: data.signedUrl };
          }
        }
      } catch (e) {
        console.error('Error generating signed url for vehicle', e);
      }
    }

    setSelectedUserDocs({ user: processedUser, docs: processedDocs });
  };

  // Live Operations State
  const [collectorLocations, setCollectorLocations] = useState<any[]>([]);
  const [activePickups, setActivePickups] = useState<any[]>([]);

  // Performance & Broadcast State
  const [lowRatings, setLowRatings] = useState<any[]>([]);
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);

  const [newAnnouncement, setNewAnnouncement] = useState('');
  const [fleetFilter, setFleetFilter] = useState('ALL');
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [heatmapTimeRange, setHeatmapTimeRange] = useState('24h');
  const [collectorMetrics, setCollectorMetrics] = useState<any[]>([]);







  // ── Data Fetching Logic ──────────────────────────────────────────────────

  const checkUserRole = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data?.role === 'ADMIN') {
        setIsAdmin(true);
      } else {
        await supabase.auth.signOut();
        setError('Access Denied: You do not have administrator privileges.');
      }
    } catch (err) {
      setError('Could not verify your access level.');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdminOverview = useCallback(async () => {
    try {
      const { count: userCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: activeColl } = await supabase.from('collector_status').select('*', { count: 'exact', head: true });
      
      const { data: revData } = await supabase.from('pickups').select('pricing_ghs').eq('status', 'completed');
      const totalRev = revData?.reduce((sum, p) => sum + (parseFloat(p.pricing_ghs) || 0), 0) ?? 0;

      const { data: kyc } = await supabase
        .from('profiles')
        .select('*, collector_documents(doc_type, created_at)')
        .eq('role', 'COLLECTOR')
        .eq('is_verified', false)
        .limit(5);

      setOverview({
        totalUsers: userCount || 0,
        activeCollectors: activeColl || 0,
        monthlyRevenue: totalRev,
        pendingKYC: kyc || []
      });
    } catch (err) {
      console.error('fetchAdminOverview error:', err);
    }
  }, []);

  const fetchLogisticsData = useCallback(async () => {
    try {
      const { data: lf } = await supabase.from('landfills').select('*').order('name');
      let query = supabase.from('collector_status').select('*, profiles(full_name)');
      if (fleetFilter !== 'ALL') {
        query = query.eq('status', fleetFilter);
      }
      const { data: fleet } = await query.order('last_updated', { ascending: false });

      if (lf) setLandfills(lf);
      if (fleet) setFleetStatus(fleet);
    } catch (err) {
      console.error("Logistics fetch error:", err);
    }
  }, [fleetFilter]);

  const fetchFinanceData = useCallback(async () => {
    try {
      const { data: payouts } = await supabase.from('payout_requests').select('*, profiles(full_name)').order('created_at', { ascending: false });
      const { data: settings } = await supabase.from('system_settings').select('*');
      const { data: refunds } = await supabase.from('refund_requests').select('*, pickups(trash_type, pickup_location_name)').order('created_at', { ascending: false });

      if (payouts) setPayoutRequests(payouts);
      if (settings) {
        const comm = settings.find(s => s.key === 'commission_rate');
        if (comm) setSystemSettings((prev: any) => ({ ...prev, commission_rate: comm.value.percentage }));
      }
      if (refunds) setRefundRequests(refunds);
    } catch (err) {
      console.error("Finance fetch error:", err);
    }
  }, []);

  const fetchUserData = useCallback(async () => {
    try {
      const { data: users } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      // Explicitly select all columns needed for the KYC modal matching real schema
      const { data: docs } = await supabase
        .from('collector_documents')
        .select('id, collector_id, doc_type, doc_url, status, created_at')
        .order('created_at', { ascending: false });

      if (users) setPlatformUsers(users);
      if (docs) setKycFiles(docs);
    } catch (err) {
      console.error("User fetch error:", err);
    }
  }, []);

  const fetchLiveOpsData = useCallback(async () => {
    try {
      const { data: locs } = await supabase.from('collector_locations').select('*, profiles(full_name)');
      const { data: picks } = await supabase.from('pickups').select('*').in('status', ['pending', 'accepted', 'collector_found', 'in_transit']);

      if (locs) setCollectorLocations(locs);
      if (picks) setActivePickups(picks);
    } catch (err) {
      console.error("LiveOps fetch error:", err);
    }
  }, []);

  const fetchHeatmapData = useCallback(async () => {
    try {
      let dateLimit = new Date();
      if (heatmapTimeRange === '24h') dateLimit.setHours(dateLimit.getHours() - 24);
      else if (heatmapTimeRange === '7d') dateLimit.setDate(dateLimit.getDate() - 7);
      else if (heatmapTimeRange === '30d') dateLimit.setDate(dateLimit.getDate() - 30);

      const { data, error } = await supabase
        .from('pickups')
        .select('lat, lng, status, created_at')
        .gte('created_at', dateLimit.toISOString());

      if (error) throw error;

      const points = data?.map(p => ({
        latitude: p.lat,
        longitude: p.lng,
        intensity: p.status === 'pending' ? 1.0 : 0.5
      }));

      setHeatmapData(points || []);
    } catch (err) {
      console.error("Heatmap fetch error:", err);
    }
  }, [heatmapTimeRange]);

  const fetchPerformanceData = useCallback(async () => {
    try {
      // 1. Direct select from reviews without fragile foreign key joins
      const { data: qReviews, error: revErr } = await supabase
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });

      if (revErr) {
        console.error("Reviews fetch error:", revErr);
      }

      let enrichedReviews: any[] = [];
      if (qReviews) {
        // 2. Manually enrich profiles, collector profiles, and pickups to guarantee 100% success
        enrichedReviews = await Promise.all(qReviews.map(async (rev) => {
          let prof = null;
          let collProf = null;
          let pick = null;
          if (rev.reviewer_id) {
            const { data: p } = await supabase.from('profiles').select('full_name').eq('id', rev.reviewer_id).maybeSingle();
            prof = p;
          }
          if (rev.pickup_id) {
            const { data: pk } = await supabase.from('pickups').select('trash_type, collector_id').eq('id', rev.pickup_id).maybeSingle();
            pick = pk;
            // Get collector profile from the pickup's collector_id
            if (pk?.collector_id) {
              const { data: cp } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', pk.collector_id).maybeSingle();
              collProf = cp;
            }
          }
          return {
            ...rev,
            profiles: prof || { full_name: 'Customer' },
            collector_profiles: collProf || { full_name: 'Collector', avatar_url: null },
            pickups: pick || { trash_type: 'General Waste' }
          };
        }));
      }

      // 2b. Fetch reviews saved as incidents (RLS workaround)
      const { data: incReviews } = await supabase.from('incident_reports').select('*').eq('type', 'REVIEW');
      if (incReviews) {
        const enrichedIncReviews = await Promise.all(incReviews.map(async (inc) => {
          let collProf = null;
          let pick = null;
          if (inc.collector_id) {
            const { data: cp } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', inc.collector_id).maybeSingle();
            collProf = cp;
          }
          if (inc.pickup_id) {
            const { data: pk } = await supabase.from('pickups').select('trash_type').eq('id', inc.pickup_id).maybeSingle();
            pick = pk;
          }
          
          return {
            id: inc.id,
            rating: parseInt(inc.severity) || 5,
            comment: inc.description,
            is_flagged: parseInt(inc.severity) <= 2,
            created_at: inc.created_at,
            profiles: { full_name: 'Customer' },
            collector_profiles: collProf || { full_name: 'Collector', avatar_url: null },
            pickups: pick || { trash_type: 'General Waste' }
          };
        }));
        
        enrichedReviews = [...enrichedReviews, ...enrichedIncReviews].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      const { data: metrics } = await supabase.from('collector_performance_metrics').select('*').order('performance_score', { ascending: false });

      setLowRatings(enrichedReviews);
      if (metrics) setCollectorMetrics(metrics);
    } catch (err) {
      console.error("Performance fetch error:", err);
    }
  }, []);

  const fetchLandfills = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('landfills').select('*').order('name');
      if (error) throw error;
      setLandfills(data || []);
    } catch (err) {
      console.error("Landfills fetch error:", err);
    }
  }, []);

  const fetchIncidents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('incident_reports')
        .select('*, profiles(id, full_name, phone_number), pickups(trash_type, pickup_location_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setIncidentReports(data || []);
    } catch (err) {
      console.error("Incidents fetch error:", err);
    }
  }, []);

  const fetchSupportTickets = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false });
      
      if (error) {
        console.error("Support tickets fetch error:", error);
        throw error;
      }

      let enrichedTickets: any[] = [];
      if (data) {
        enrichedTickets = await Promise.all(data.map(async (t) => {
          let prof = null;
          if (t.user_id) {
            const { data: p } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', t.user_id).maybeSingle();
            prof = p;
          }
          return {
            ...t,
            profiles: prof || { full_name: 'Unknown User', avatar_url: null }
          };
        }));
      }

      setSupportTickets(enrichedTickets);
    } catch (err) {
      console.error("Support fetch error:", err);
    }
  }, []);

  const handleOpenChat = async (passedId: string | undefined, fallbackId?: string, incidentId?: string) => {
    const userId = passedId || fallbackId;
    if (!userId) {
      alert("Collector ID not found for this incident.");
      return;
    }

    try {
      setActiveTab('support');

      // Check if there is already an open ticket for this user
      const { data: existingTickets } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1);

      let ticket: any;
      if (existingTickets && existingTickets.length > 0) {
        ticket = existingTickets[0];
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', userId)
          .single();
        ticket = { ...ticket, profiles: profile || { full_name: 'Unknown User', avatar_url: null } };
      } else {
        const subject = incidentId ? `Incident Follow-up #${incidentId.substring(0, 8)}` : 'Incident Follow-up';
        const { data: inserted, error: insertError } = await supabase
          .from('support_tickets')
          .insert({ user_id: userId, subject, status: 'open' })
          .select()
          .single();

        if (insertError) throw insertError;

        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', userId)
          .single();

        ticket = { ...inserted, profiles: profile || { full_name: 'Unknown User', avatar_url: null } };

        setSupportTickets(prev => [ticket, ...prev]);
        
        // Broadcast to alert the collector that a new ticket was created by subscribing on the fly
        const userAlertChan = supabase.channel(`user_alerts_${userId}`);
        userAlertChan.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            userAlertChan.send({
              type: 'broadcast',
              event: 'new_ticket',
              payload: { ticket_id: inserted.id }
            }).then(() => supabase.removeChannel(userAlertChan));
          }
        });
      }

      setActiveTicket(ticket);
      setSupportMessages([]); // Clear any old messages, will be fetched by useEffect
    } catch (err) {
      console.error("Open chat error details:", err);
      const msg = (err as any).message || "Unknown error";
      alert("Could not open chat: " + msg);
    }
  };

  const handleSendMessage = async () => {
    if (!activeTicket || !newMessage.trim()) return;
    const msgContent = newMessage.trim();
    setNewMessage('');

    try {
      // Optimistic update
      const tempId = Math.random().toString();
      setSupportMessages(prev => [...prev, { 
        id: tempId,
        ticket_id: activeTicket.id,
        sender_id: session.user.id,
        content: msgContent,
        created_at: new Date().toISOString()
      }]);

      const { data: insertedMsg, error } = await supabase.from('support_messages').insert({
        ticket_id: activeTicket.id,
        sender_id: session.user.id,
        content: msgContent
      }).select().single();
      
      if (error) throw error;

      // Broadcast to ensure delivery
      if (insertedMsg) {
        if (ticketChannelRef.current) {
          ticketChannelRef.current.send({
            type: 'broadcast',
            event: 'new_message',
            payload: insertedMsg
          });
        }
        const userAlertChan = supabase.channel(`user_alerts_${activeTicket.user_id}`);
        userAlertChan.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            userAlertChan.send({
              type: 'broadcast',
              event: 'new_message',
              payload: insertedMsg
            }).then(() => supabase.removeChannel(userAlertChan));
          }
        });
      }
    } catch (err) {
      alert("Error sending message: " + (err as Error).message);
    }
  };

  useEffect(() => {
    if (!activeTicket) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('support_messages')
        .select('*')
        .eq('ticket_id', activeTicket.id)
        .order('created_at', { ascending: true });
      if (data) setSupportMessages(data);
    };

    // Initial fetch
    fetchMessages();

    // Realtime — play ping when admin receives a new message from the user (Broadcast-based)
    const sub = supabase.channel(`ticket_${activeTicket.id}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        // If the message is NOT from the admin, play alert
        if (payload.payload?.sender_id !== session?.user?.id) {
          playPing();
        }
        // Always fetch the latest state from the database to guarantee it renders
        fetchMessages();
      })
      .subscribe();

    ticketChannelRef.current = sub;

    return () => { 
      supabase.removeChannel(sub); 
      ticketChannelRef.current = null;
    };
  }, [activeTicket, session?.user?.id]);

  // Global Notification Listener for Admin
  useEffect(() => {
    if (!session?.user?.id) return;

    const sub = supabase.channel('admin_global_alerts')
      .on('broadcast', { event: 'new_message' }, (payload) => {
        console.log('[AdminAlert] New message:', payload);
        if (payload.payload.sender_id !== session.user.id) {
          playPing();
          fetchSupportTickets();
        }
      })
      .on('broadcast', { event: 'new_incident' }, (payload) => {
        console.log('[AdminAlert] New incident broadcast:', payload);
        playPing();
        fetchIncidents();
        // Show a browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🚨 New Incident Report', { body: `${payload.payload.type?.replace(/_/g, ' ')}: ${payload.payload.description || ''}` });
        }
      })
      .on('broadcast', { event: 'new_critical_review' }, (payload) => {
        console.log('[AdminAlert] New critical review broadcast:', payload);
        playPing();
        fetchPerformanceData();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⚠️ Critical Review / Flag', { body: `Rating: ⭐${payload.payload.rating} - "${payload.payload.comment || ''}"` });
        }
      })
      .on('broadcast', { event: 'rating_submitted' }, (payload) => {
        console.log('[AdminAlert] New rating submitted broadcast:', payload);
        playPing();
        fetchPerformanceData();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('⭐ New Collector Rating', { body: `Rating: ⭐${payload.payload.rating} - "${payload.payload.comment || ''}"` });
        }
      })
      .on('broadcast', { event: 'sos_emergency' }, (payload) => {
        console.log('[AdminAlert] SOS Emergency broadcast:', payload);
        playPing();
        fetchIncidents();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🚨 SOS EMERGENCY ACTIVATED', { body: `Collector: ${payload.payload.full_name || 'Collector'} (${payload.payload.phone || 'No phone'})` });
        }
      })
      .on('broadcast', { event: 'location_share' }, (payload) => {
        console.log('[AdminAlert] Location Share broadcast:', payload);
        playPing();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('📍 Location Shared', { body: `${payload.payload.full_name || 'Collector'} has shared their live location.` });
        }
      })
      .on('broadcast', { event: 'convoy_mode' }, (payload) => {
        console.log('[AdminAlert] Convoy Mode broadcast:', payload);
        playPing();
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('🛡️ Convoy Mode Update', { body: `${payload.payload.full_name || 'Collector'} turned ${payload.payload.active ? 'ON' : 'OFF'} convoy mode.` });
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'broadcasts' }, (payload) => {
        console.log('[AdminAlert] New broadcast sent:', payload.new.message);
        playPing();
        fetchBroadcastData();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'collector_documents' }, (payload) => {
        console.log('[AdminAlert] New KYC document uploaded:', payload);
        playPing();
        fetchUserData(); // Refresh so admin can see the new doc immediately
      })
      .subscribe();

    return () => {
      supabase.removeChannel(sub);
    };
  }, [session?.user?.id]);

  const fetchIntelligenceData = useCallback(async () => {
    try {
      const { data: summary } = await supabase.from('platform_intelligence_summary').select('*').single();
      const { data: trend } = await supabase.from('daily_revenue_trend').select('*');
      const { data: dist } = await supabase.from('trash_type_distribution').select('*');
      const { data: ranking } = await supabase.from('top_collectors_ranking').select('*');

      if (summary) setIntelSummary(summary);
      if (trend) setRevenueTrend(trend);
      if (dist) setTrashDistribution(dist);
      if (ranking) setTopCollectors(ranking);
    } catch (err) {
      console.error("Intelligence fetch error:", err);
    }
  }, []);

  const fetchBroadcastData = useCallback(async () => {
    try {
      const { data: bHistory } = await supabase.from('broadcasts').select('*').order('created_at', { ascending: false });
      if (bHistory) setBroadcastHistory(bHistory);
    } catch (err) {
      console.error("Broadcast fetch error:", err);
    }
  }, []);

  useEffect(() => {

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkUserRole(session.user.id);
      else setLoading(false);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkUserRole(session.user.id);
      else {
        setIsAdmin(false);
        setLoading(false);
      }
    });
  }, []);

  useEffect(() => {
    if (isAdmin) {
      if (activeTab === 'overview') fetchAdminOverview();
      if (activeTab === 'logistics') fetchLogisticsData();
      if (activeTab === 'finance') fetchFinanceData();
      if (activeTab === 'users') fetchUserData();
      if (activeTab === 'incidents') fetchIncidents();
      if (activeTab === 'support') fetchSupportTickets();
      if (activeTab === 'map') {
        fetchLiveOpsData();
        fetchHeatmapData();
      }
      if (activeTab === 'landfills') fetchLandfills();
      if (activeTab === 'intelligence') fetchIntelligenceData();
      if (activeTab === 'performance') { fetchPerformanceData(); fetchBroadcastData(); }
      if (activeTab === 'broadcasts') fetchBroadcastData();
    }
  }, [isAdmin, activeTab, heatmapTimeRange, fetchAdminOverview, fetchLogisticsData, fetchFinanceData, fetchUserData, fetchLiveOpsData, fetchIncidents, fetchHeatmapData, fetchLandfills, fetchIntelligenceData, fetchPerformanceData, fetchBroadcastData]);




  // Realtime Subscriptions for Map
  useEffect(() => {
    if (!isAdmin || activeTab !== 'map') return;

    const locSubscription = supabase
      .channel('live-locations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'collector_locations' }, () => {
        fetchLiveOpsData();
      })
      .subscribe();

    const pickupSubscription = supabase
      .channel('live-pickups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickups' }, () => {
        fetchLiveOpsData();
        fetchHeatmapData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(locSubscription);
      supabase.removeChannel(pickupSubscription);
    };
  }, [isAdmin, activeTab]);



  const updateLandfillStatus = useCallback(async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('landfills').update({ status }).eq('id', id);
      if (error) throw error;
      fetchLandfills();
    } catch (err) {
      console.error("Landfill update error:", err);
    }
  }, [fetchLandfills]);

  const handleResolveIncident = useCallback(async (id: string, status: string) => {
    try {
      const { error } = await supabase.from('incident_reports').update({ status }).eq('id', id);
      if (error) throw error;
      fetchIncidents();
    } catch (err) {
      alert("Error updating incident status");
    }
  }, [fetchIncidents]);

  const handleApproveCollector = async (collectorId: string) => {

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', collectorId);
      
      if (error) throw error;
      
      setOverview((prev: any) => ({
        ...prev,
        pendingKYC: prev.pendingKYC.filter((c: any) => c.id !== collectorId)
      }));
      fetchUserData();
      
      alert('Collector verified successfully!');
    } catch (err: any) {
      alert('Approval failed: ' + err.message);
    }
  };

  const handleProcessPayout = async (requestId: string, approve: boolean) => {
    try {
      if (approve) {
        const { error } = await supabase.rpc('process_payout', { p_request_id: requestId });
        if (error) throw error;
        alert('Payout approved and funds transferred.');
      } else {
        const { error } = await supabase
          .from('payout_requests')
          .update({ status: 'REJECTED', resolved_at: new Date() })
          .eq('id', requestId);
        if (error) throw error;
        alert('Payout request rejected.');
      }
      fetchFinanceData();
    } catch (err: any) {
      alert('Operation failed: ' + err.message);
    }
  };

  const handlePostBroadcast = async () => {
    if (!newAnnouncement) return;
    try {
      const { error } = await supabase.from('broadcasts').insert({
        title: 'Platform Announcement',
        message: newAnnouncement,
        target_role: 'ALL'
      });
      if (error) throw error;
      
      // Send a realtime broadcast to guarantee delivery to all connected clients
      await supabase.channel('platform_broadcasts').send({
        type: 'broadcast',
        event: 'new_announcement',
        payload: { message: newAnnouncement }
      });

      alert('Announcement broadcasted to all users!');
      setNewAnnouncement('');
      fetchBroadcastData();
    } catch (err: any) {
      alert('Failed to broadcast: ' + err.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  const filteredUsers = platformUsers.filter(u => {
    const matchesSearch = (u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.phone_number?.includes(searchQuery));
    const matchesRole = roleFilter === 'ALL' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="login-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!session || !isAdmin) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <img src="/logo.png" alt="SamSa" className="login-logo" />
            <h1 style={{ fontSize: '1.625rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>SamSa Admin Portal</h1>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.9rem' }}>Authorized access only</p>
          </div>

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="form-input" placeholder="admin@samsa.com" required />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="form-input" placeholder="••••••••" required />
            </div>
            {error && <div className="error-badge">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary">
              <Lock size={18} />
              Authorize Access
            </button>
          </form>
        </div>
      </div>
    );
  }

  const getStatusStyles = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'ONLINE': return { bg: 'rgba(16, 185, 129, 0.1)', text: '#10b981' };
      case 'OFFLINE': return { bg: 'rgba(148, 163, 184, 0.1)', text: '#94a3b8' };
      case 'BUSY': return { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b' };
      case 'MOVING': return { bg: 'rgba(59, 130, 246, 0.1)', text: '#3b82f6' };
      case 'AT_LANDFILL': return { bg: 'rgba(139, 92, 246, 0.1)', text: '#8b5cf6' };
      case 'IDLE': return { bg: 'rgba(236, 72, 153, 0.1)', text: '#ec4899' };
      default: return { bg: 'rgba(148, 163, 184, 0.1)', text: '#94a3b8' };
    }
  };

  return (

    <div className="admin-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="SamSa" style={{ height: 36 }} />
          <span>SamSa Admin</span>
        </div>
        
        <nav className="sidebar-nav">
          <button className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}>
            <LayoutDashboard size={20} />
            Overview
          </button>
          <button className={`nav-item ${activeTab === 'logistics' ? 'active' : ''}`} onClick={() => setActiveTab('logistics')}>
            <Truck size={20} />
            Fleet & Logistics
          </button>
          <button className={`nav-item ${activeTab === 'finance' ? 'active' : ''}`} onClick={() => setActiveTab('finance')}>
            <Banknote size={20} />
            Finance & Payouts
          </button>
          <button className={`nav-item ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
            <Users size={20} />
            User Management
          </button>
          <button className={`nav-item ${activeTab === 'map' ? 'active' : ''}`} onClick={() => setActiveTab('map')}>
            <Map size={20} />
            Live Operations
          </button>
          <button className={`nav-item ${activeTab === 'landfills' ? 'active' : ''}`} onClick={() => setActiveTab('landfills')}>
            <Database size={20} />
            Landfill Control
          </button>
          <button className={`nav-item ${activeTab === 'performance' ? 'active' : ''}`} onClick={() => setActiveTab('performance')}>
            <Award size={20} />
            Performance
          </button>
          <button className={`nav-item ${activeTab === 'intelligence' ? 'active' : ''}`} onClick={() => setActiveTab('intelligence')}>
            <Brain size={20} />
            Intelligence
          </button>
          <button className={`nav-item ${activeTab === 'incidents' ? 'active' : ''}`} onClick={() => setActiveTab('incidents')}>
            <AlertTriangle size={20} />
            Incidents
            {incidentReports.filter(i => i.status === 'PENDING').length > 0 && (
              <span style={{ marginLeft: 'auto', backgroundColor: '#ef4444', color: 'var(--text-primary)', fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: '1rem', fontWeight: 800 }}>
                {incidentReports.filter(i => i.status === 'PENDING').length}
              </span>
            )}
          </button>

          <button className={`nav-item ${activeTab === 'support' ? 'active' : ''}`} onClick={() => setActiveTab('support')}>
            <MessageSquare size={20} />
            Support & Dispatch
            {supportTickets.filter(t => t.status === 'open').length > 0 && (
              <span style={{ marginLeft: 'auto', backgroundColor: '#3b82f6', color: '#fff', fontSize: '0.625rem', padding: '0.125rem 0.375rem', borderRadius: '1rem', fontWeight: 800 }}>
                {supportTickets.filter(t => t.status === 'open').length}
              </span>
            )}
          </button>

          <button className={`nav-item ${activeTab === 'broadcasts' ? 'active' : ''}`} onClick={() => setActiveTab('broadcasts')}>
            <Megaphone size={20} />
            Broadcasts
          </button>
          
          <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
            <button className="nav-item" onClick={() => setActiveTab('settings')}>
              <Settings size={20} />
              Settings
            </button>
            <button className="nav-item" onClick={() => supabase.auth.signOut()} style={{ color: '#ef4444' }}>
              <LogOut size={20} />
              Logout
            </button>
          </div>
        </nav>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-logo">
            <img src="/logo.png" alt="SamSa" />
            <span style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem', letterSpacing: '-0.02em' }}>Command Center</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.875rem' }}>Administrator</p>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{session.user.email}</p>
            </div>
            <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--green-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={20} color="var(--green)" />
            </div>
          </div>
        </header>

        <div className="page-container">
          {activeTab === 'overview' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Command Center</h1>
                <p className="page-subtitle">Real-time overview of SamSa operations.</p>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon"><Users size={24} /></div>
                  <div>
                    <p className="stat-label">Total Users</p>
                    <p className="stat-value">{overview.totalUsers}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ color: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)' }}><Truck size={24} /></div>
                  <div>
                    <p className="stat-label">Active Collectors</p>
                    <p className="stat-value">{overview.activeCollectors}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ color: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)' }}><TrendingUp size={24} /></div>
                  <div>
                    <p className="stat-label">Gross Revenue</p>
                    <p className="stat-value">GH₵ {overview.monthlyRevenue.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                <div className="section-card" style={{ height: '500px', display: 'flex', flexDirection: 'column' }}>
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <FileCheck size={24} color="#10b981" />
                      <h2 className="section-title">Pending KYC Verification</h2>
                    </div>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Action Required</span>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Full Name</th>
                          <th>Phone</th>
                          <th>Registration Date</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.pendingKYC.length > 0 ? overview.pendingKYC.map((item: any) => (
                          <tr key={item.id}>
                            <td style={{ fontWeight: 600 }}>{item.full_name}</td>
                            <td>{item.phone_number}</td>
                            <td>{new Date(item.created_at).toLocaleDateString()}</td>
                            <td>
                              <button className="btn-sm btn-approve" onClick={() => handleApproveCollector(item.id)}>
                                Approve
                              </button>
                            </td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No pending KYC requests at this time.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="section-card" style={{ height: '500px', padding: 0 }}>
                  <ActivityFeed />
                </div>
              </div>

            </>
          )}

          {activeTab === 'logistics' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Fleet & Logistics</h1>
                <p className="page-subtitle">Monitor vehicle distribution and landfill status.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
                <div className="section-card">
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Activity size={24} color="#3b82f6" />
                      <h2 className="section-title">Collector Fleet Status</h2>
                    </div>
                    <select 
                      className="form-input" 
                      style={{ width: '150px', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                      value={fleetFilter}
                      onChange={(e) => {
                        setFleetFilter(e.target.value);
                        fetchLogisticsData();
                      }}
                    >
                      <option value="ALL">All Status</option>
                      <option value="ONLINE">Online</option>
                      <option value="OFFLINE">Offline</option>
                      <option value="BUSY">Busy</option>
                      <option value="MOVING">Moving</option>
                      <option value="AT_LANDFILL">At Landfill</option>
                      <option value="IDLE">Idle</option>
                    </select>
                  </div>


                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Collector</th>
                        <th>Vehicle</th>
                        <th>Battery/Fuel</th>
                        <th>Status</th>
                        <th>Last Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fleetStatus.length > 0 ? fleetStatus.map((item: any) => (
                        <tr key={item.id}>
                          <td style={{ fontWeight: 600 }}>{item.profiles?.full_name}</td>
                          <td>{item.vehicle_type || 'Mini Truck'}</td>
                          <td>
                            <div style={{ width: '100%', height: 6, backgroundColor: 'var(--border)', borderRadius: 3 }}>
                              <div style={{ width: `${item.battery_level || 100}%`, height: '100%', backgroundColor: (item.battery_level || 100) > 20 ? '#10b981' : '#ef4444', borderRadius: 3 }}></div>
                            </div>
                            <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>{item.battery_level || 100}%</span>
                          </td>
                          <td>
                            <span style={{ 
                              backgroundColor: getStatusStyles(item.status).bg, 
                              color: getStatusStyles(item.status).text, 
                              padding: '0.25rem 0.5rem', 
                              borderRadius: '0.25rem', 
                              fontSize: '0.75rem',
                              fontWeight: 700
                            }}>
                              {item.status?.toUpperCase() || 'OFFLINE'}
                            </span>
                          </td>

                          <td>{new Date(item.last_updated).toLocaleTimeString()}</td>
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>No fleet data available.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="section-card">
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <MapPin size={24} color="#ef4444" />
                      <h2 className="section-title">Landfills</h2>
                    </div>
                  </div>

                  <div className="landfill-list">
                    {landfills.length > 0 ? landfills.map((lf: any) => (
                      <div key={lf.id} style={{ padding: '1rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{lf.name}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lf.location_name}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: lf.capacity_used > 80 ? '#ef4444' : '#10b981' }}>{lf.capacity_used}% full</p>
                          {lf.capacity_used > 80 && <AlertTriangle size={14} color="#ef4444" />}
                        </div>
                      </div>
                    )) : (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem' }}>No landfills registered.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'finance' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Finance & Revenue</h1>
                <p className="page-subtitle">Manage platform commission and collector payouts.</p>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon" style={{ color: '#10b981' }}><Percent size={24} /></div>
                  <div>
                    <p className="stat-label">Platform Commission</p>
                    <p className="stat-value">{systemSettings.commission_rate}%</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ color: '#3b82f6' }}><CreditCard size={24} /></div>
                  <div>
                    <p className="stat-label">Pending Payouts</p>
                    <p className="stat-value">{payoutRequests.filter(p => p.status === 'PENDING').length}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ color: '#ef4444' }}><RefreshCcw size={24} /></div>
                  <div>
                    <p className="stat-label">Refund Requests</p>
                    <p className="stat-value">{refundRequests.length}</p>
                  </div>
                </div>
              </div>

              <div className="section-card">
                <div className="section-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <Banknote size={24} color="#10b981" />
                    <h2 className="section-title">Collector Payout Requests</h2>
                  </div>
                </div>

                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Collector</th>
                      <th>Method</th>
                      <th>Amount</th>
                      <th>Request Date</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payoutRequests.length > 0 ? payoutRequests.map((req: any) => (
                      <tr key={req.id}>
                        <td style={{ fontWeight: 600 }}>{req.profiles?.full_name}</td>
                        <td>{req.method}</td>
                        <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>GH₵ {req.amount.toFixed(2)}</td>
                        <td>{new Date(req.created_at).toLocaleDateString()}</td>
                        <td>
                          <span style={{ 
                            backgroundColor: req.status === 'PENDING' ? 'rgba(245, 158, 11, 0.1)' : req.status === 'APPROVED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                            color: req.status === 'PENDING' ? '#f59e0b' : req.status === 'APPROVED' ? '#10b981' : '#ef4444', 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: '0.25rem', 
                            fontSize: '0.75rem' 
                          }}>
                            {req.status}
                          </span>
                        </td>
                        <td>
                          {req.status === 'PENDING' && (
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button className="btn-sm btn-approve" onClick={() => handleProcessPayout(req.id, true)}>Approve & Pay</button>
                              <button className="btn-sm" style={{ backgroundColor: '#ef4444', color: 'var(--text-primary)' }} onClick={() => handleProcessPayout(req.id, false)}>Reject</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No payout requests found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'incidents' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Incident Reports</h1>
                <p className="page-subtitle">Monitor and resolve operational issues reported from the field.</p>
              </div>

              <div className="section-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Collector</th>
                      <th>Location</th>
                      <th>Contact</th>
                      <th>Priority</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incidentReports.length > 0 ? incidentReports.map((inc: any) => (
                      <tr key={inc.id}>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{inc.type.replace(/_/g, ' ')}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{inc.description}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{inc.profiles?.full_name}</div>
                        </td>
                        <td>{inc.pickups?.pickup_location_name || 'Current GPS'}</td>
                        <td>
                          <div style={{ fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Phone size={10} />
                            {inc.profiles?.phone_number || 'No Phone'}
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            color: inc.priority === 'CRITICAL' ? '#ef4444' : inc.priority === 'URGENT' ? '#f59e0b' : '#3b82f6',
                            fontWeight: 800,
                            fontSize: '0.75rem'
                          }}>
                            {inc.priority}
                          </span>
                        </td>
                        <td>
                          <span style={{ 
                            backgroundColor: inc.status === 'PENDING' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', 
                            color: inc.status === 'PENDING' ? '#f59e0b' : '#10b981', 
                            padding: '0.25rem 0.5rem', 
                            borderRadius: '0.25rem', 
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}>
                            {inc.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {inc.status === 'PENDING' ? (
                              <button className="btn-sm btn-approve" onClick={() => handleResolveIncident(inc.id, 'RESOLVED')}>
                                Resolve
                              </button>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Completed</span>
                            )}
                            <button 
                              className="btn-sm" 
                              style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                              onClick={() => {
                                handleOpenChat(inc.profiles?.id, inc.collector_id, inc.id);
                              }}
                            >
                              <MessageSquare size={12} />
                              Chat
                            </button>
                            <a 
                              href={`tel:${inc.profiles?.phone_number}`}
                              className="btn-sm" 
                              style={{ backgroundColor: '#10b981', color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                              <Phone size={12} />
                              Call
                            </a>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No incidents reported.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'users' && (

            <>
              <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <h1 className="page-title">User Management</h1>
                  <p className="page-subtitle" style={{ margin: 0 }}>Manage accounts and verify identities across the platform.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={18} color="#64748b" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    <input 
                      type="text" 
                      placeholder="Search name or phone..." 
                      className="form-input" 
                      style={{ paddingLeft: '2.75rem', width: '250px' }} 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <select 
                    className="form-input" 
                    style={{ width: '150px' }}
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option value="ALL">All Roles</option>
                    <option value="CUSTOMER">Customers</option>
                    <option value="COLLECTOR">Collectors</option>
                    <option value="ADMIN">Admins</option>
                  </select>
                  <button 
                    onClick={() => fetchUserData()} 
                    style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <RefreshCw size={16} color="var(--text-primary)" />
                  </button>
                </div>
              </div>

              <div className="section-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Contact</th>
                      <th>Wallet</th>
                      <th>Verification</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length > 0 ? filteredUsers.map((u: any) => (
                      <tr key={u.id}>
                        <td style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {u.avatar_url ? <img src={u.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={18} color="#94a3b8" />}
                          </div>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{u.full_name || 'Unnamed'}</p>
                            <p style={{ margin: 0, fontSize: '0.625rem', color: 'var(--text-muted)' }}>ID: {u.id.substring(0, 8)}...</p>
                          </div>
                        </td>
                        <td>
                          <span style={{ 
                            fontSize: '0.625rem', 
                            fontWeight: 800, 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '1rem', 
                            backgroundColor: u.role === 'ADMIN' ? '#4c1d95' : u.role === 'COLLECTOR' ? '#064e3b' : '#1e3a8a',
                            color: u.role === 'ADMIN' ? '#ddd6fe' : u.role === 'COLLECTOR' ? '#d1fae5' : '#dbeafe'
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td>
                          <p style={{ margin: 0, fontSize: '0.875rem' }}>{u.phone_number || 'No Phone'}</p>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email}</p>
                        </td>
                        <td style={{ fontWeight: 600 }}>GH₵ {u.wallet_balance?.toFixed(2) || '0.00'}</td>
                        <td>
                          {u.role === 'COLLECTOR' ? (
                            <span style={{ color: u.is_verified ? '#10b981' : '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', fontWeight: 600 }}>
                              {u.is_verified ? <CheckCircle size={14} /> : <Clock size={14} />}
                              {u.is_verified ? 'Verified' : 'Pending'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>N/A</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            {u.role === 'COLLECTOR' && (
                              <button 
                                className="btn-sm" 
                                style={{ backgroundColor: 'var(--border)', color: 'var(--text-primary)' }}
                                onClick={() => handleOpenKycModal(u)}
                              >
                                <Eye size={14} style={{ marginRight: '0.25rem' }} />
                                KYC
                              </button>
                            )}
                            <button className="btn-sm" style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                              <Settings size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>No users matching your search.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* KYC Modal */}
              {selectedUserDocs && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '2rem' }}>
                  <div className="section-card" style={{ maxWidth: '800px', width: '100%', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
                    <button 
                      onClick={() => setSelectedUserDocs(null)} 
                      style={{ position: 'absolute', right: '1.5rem', top: '1.5rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      <X size={24} />
                    </button>
                    
                    <div style={{ marginBottom: '2rem' }}>
                      <h2 className="section-title">Collector Review: {selectedUserDocs.user.full_name}</h2>
                      <p style={{ color: 'var(--text-muted)' }}>Review identification, vehicle details, and waste permits.</p>
                    </div>

                    {/* Vehicle Details Section */}
                    <div style={{ marginBottom: '2rem', backgroundColor: 'var(--surface-2)', padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                      <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Truck size={18} color="#06C167" />
                        Vehicle Registration
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                        <div>
                          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Vehicle Type</p>
                          <p style={{ margin: 0, fontWeight: 700 }}>{selectedUserDocs.user.vehicle_details?.type || selectedUserDocs.user.vehicle_type || 'Not Provided'}</p>
                          
                          <p style={{ margin: '1rem 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>License Plate</p>
                          <p style={{ margin: 0, fontWeight: 700, backgroundColor: '#eee', display: 'inline-block', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: '2px solid #333' }}>
                            {selectedUserDocs.user.vehicle_details?.plate || selectedUserDocs.user.vehicle_number || '---'}
                          </p>

                          <p style={{ margin: '1rem 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Capacity</p>
                          <p style={{ margin: 0 }}>{selectedUserDocs.user.vehicle_details?.capacity || 'Standard'}</p>
                        </div>
                        <div style={{ width: '100%', height: '150px', backgroundColor: 'var(--surface)', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border)' }}>
                          {selectedUserDocs.user.vehicle_details?.photo_url ? (
                            <img src={selectedUserDocs.user.vehicle_details.photo_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Vehicle" />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                              No Vehicle Photo
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FileText size={18} color="#06C167" />
                      Legal Documents (KYC)
                    </h3>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      {selectedUserDocs.docs.length > 0 ? selectedUserDocs.docs.map((doc: any) => (
                        <div key={doc.id} style={{ backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                          <p style={{ fontWeight: 800, color: '#10b981', marginBottom: '0.5rem', textTransform: 'uppercase', fontSize: '0.75rem' }}>{(doc.doc_type || doc.document_type || '').replace('_', ' ')}</p>
                          <div style={{ width: '100%', height: '200px', backgroundColor: 'var(--surface-2)', borderRadius: '0.5rem', overflow: 'hidden', position: 'relative' }}>
                            <img 
                              src={doc.doc_url || doc.document_url} 
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                              alt="KYC Document" 
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const errDiv = document.createElement('div');
                                errDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ef4444;padding:1rem;text-align:center;font-size:0.75rem';
                                errDiv.innerHTML = '<span>⚠️ Image failed to load</span><span style="color:var(--text-muted);margin-top:0.5rem">Bucket may be private or file deleted.</span>';
                                e.currentTarget.parentElement?.appendChild(errDiv);
                              }}
                            />
                          </div>
                          <p style={{ fontSize: '0.625rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Uploaded: {new Date(doc.created_at).toLocaleString()}</p>
                        </div>
                      )) : (
                        <div style={{ gridColumn: 'span 2', textAlign: 'center', padding: '3rem', border: '1px dashed var(--border)', borderRadius: '1rem' }}>
                          <AlertTriangle size={32} color="#f59e0b" style={{ marginBottom: '1rem' }} />
                          <p style={{ color: 'var(--text-muted)' }}>This collector has not uploaded any documents yet.</p>
                        </div>
                      )}
                    </div>

                    {!selectedUserDocs.user.is_verified && selectedUserDocs.docs.length > 0 && (
                      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
                        <button 
                          className="btn-primary" 
                          style={{ flex: 1 }}
                          onClick={() => {
                            handleApproveCollector(selectedUserDocs.user.id);
                            setSelectedUserDocs(null);
                          }}
                        >
                          Approve All Documents
                        </button>
                        <button className="btn-primary" style={{ flex: 1, backgroundColor: 'var(--border)' }} onClick={() => setSelectedUserDocs(null)}>
                          Mark for Revision
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'map' && (
            <>
              <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 className="page-title">Real-Time Logistics Map</h1>
                  <p className="page-subtitle" style={{ margin: 0 }}>Monitor vehicle positions and sanitation hotspots.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                  <div style={{ backgroundColor: 'var(--surface-2)', padding: '0.5rem', borderRadius: '0.75rem', display: 'flex', gap: '0.5rem', border: '1px solid var(--border)' }}>
                    <button 
                      onClick={() => setShowHeatmap(!showHeatmap)}
                      style={{ 
                        padding: '0.5rem 1rem', 
                        borderRadius: '0.5rem', 
                        fontSize: '0.875rem', 
                        fontWeight: 700,
                        backgroundColor: showHeatmap ? '#10b981' : 'transparent',
                        color: showHeatmap ? 'white' : '#94a3b8',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                    >
                      Sanitation Heatmap
                    </button>
                  </div>

                  {showHeatmap && (
                    <select 
                      className="form-input" 
                      style={{ width: '150px', padding: '0.5rem', fontSize: '0.875rem' }}
                      value={heatmapTimeRange}
                      onChange={(e) => setHeatmapTimeRange(e.target.value)}
                    >
                      <option value="24h">Last 24 Hours</option>
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="section-card" style={{ padding: 0, border: 'none' }}>
                <LiveMap 
                  collectorLocations={collectorLocations} 
                  activePickups={activePickups} 
                  showHeatmap={showHeatmap}
                  heatmapData={heatmapData}
                />
              </div>


              <div className="stats-grid" style={{ marginTop: '2rem' }}>
                <div className="stat-card">
                  <div className="stat-icon" style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}><Truck size={24} /></div>
                  <div>
                    <p className="stat-label">Collectors Active</p>
                    <p className="stat-value">{collectorLocations.length}</p>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon" style={{ backgroundColor: 'rgba(245,158,11,0.1)' }}><Activity size={24} color="#f59e0b" /></div>
                  <div>
                    <p className="stat-label">Live Pickups</p>
                    <p className="stat-value">{activePickups.length}</p>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'performance' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Platform Performance</h1>
                <p className="page-subtitle">Monitor quality of service and reward top performers.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="section-card">
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <AlertTriangle size={24} color="#f59e0b" />
                      <h2 className="section-title">Recent Collector Reviews & Flags</h2>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {lowRatings.length > 0 ? lowRatings.map((review: any) => (
                      <div key={review.id} style={{ backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '1rem', border: review.rating <= 2 ? '1px solid #ef444433' : '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>Collector: {review.collector_profiles?.full_name || 'Collector'}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reviewed by: {review.profiles?.full_name || 'Customer'}</span>
                          </div>
                          <div style={{ display: 'flex', color: '#f59e0b' }}>
                            {[...Array(5)].map((_, i) => <Star key={i} size={14} fill={i < review.rating ? '#f59e0b' : 'transparent'} />)}
                          </div>
                        </div>
                        <p style={{ margin: '0.5rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>"{review.comment || 'No comment provided'}"</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Service: {review.pickups?.trash_type || 'General Waste'} • {new Date(review.created_at).toLocaleDateString()}</p>
                      </div>
                    )) : (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No reviews reported.</p>
                    )}
                  </div>
                </div>

                <div className="section-card">
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Award size={24} color="#f59e0b" />
                      <h2 className="section-title">Collector Performance Rankings</h2>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {collectorMetrics.length > 0 ? collectorMetrics.map((metric, index) => (
                      <div key={metric.collector_id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', backgroundColor: 'var(--surface)', borderRadius: '1.25rem', border: '1px solid var(--border)' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: index < 3 ? '#f59e0b' : '#64748b' }}>
                          {index + 1}
                        </div>
                        <img src={metric.avatar_url || 'https://i.pravatar.cc/100'} style={{ width: 40, height: 40, borderRadius: 20 }} alt="" />
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{metric.full_name}</p>
                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⭐ {metric.avg_rating.toFixed(1)}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📦 {metric.completed_jobs} jobs</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>⏱️ {Math.round(metric.avg_completion_time_mins)}m avg</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: 900, 
                            color: metric.performance_score >= 80 ? '#10b981' : metric.performance_score >= 50 ? '#f59e0b' : '#ef4444' 
                          }}>
                            {metric.performance_score}
                          </div>
                          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 700 }}>SCORE</div>
                        </div>
                      </div>
                    )) : (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No metric data available.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}




          {activeTab === 'landfills' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Landfill Status Control</h1>
                <p className="page-subtitle">Manage the availability of waste disposal sites for the fleet.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                {landfills.map((site) => (
                  <div key={site.id} className="section-card" style={{ padding: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>{site.name}</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>{site.location_name}</p>
                      </div>
                      <div style={{ 
                        padding: '0.25rem 0.75rem', 
                        borderRadius: '1rem', 
                        fontSize: '0.75rem', 
                        fontWeight: 900,
                        backgroundColor: site.status === 'OPEN' ? 'rgba(16, 185, 129, 0.1)' : site.status === 'FULL' ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: site.status === 'OPEN' ? '#10b981' : site.status === 'FULL' ? '#f59e0b' : '#ef4444'
                      }}>
                        {site.status}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                      <button onClick={() => updateLandfillStatus(site.id, 'OPEN')} className={`landfill-status-btn ${site.status === 'OPEN' ? 'active-open' : ''}`}>✓ OPEN</button>
                      <button onClick={() => updateLandfillStatus(site.id, 'FULL')} className={`landfill-status-btn ${site.status === 'FULL' ? 'active-full' : ''}`}>⚠ FULL</button>
                      <button onClick={() => updateLandfillStatus(site.id, 'CLOSED')} className={`landfill-status-btn ${site.status === 'CLOSED' ? 'active-closed' : ''}`}>✕ CLOSED</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}



          {activeTab === 'intelligence' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">Platform Intelligence</h1>
                <p className="page-subtitle">Deep-dive analytics and growth metrics for the SamSa ecosystem.</p>
              </div>

              {/* KPI Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="section-card" style={{ padding: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Revenue</p>
                  <p style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>GH₵ {intelSummary?.total_revenue?.toLocaleString() || '0'}</p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <TrendingUp size={16} color="#10b981" />
                    <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>+12.5% vs last month</span>
                  </div>
                </div>
                <div className="section-card" style={{ padding: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Pickups Completed</p>
                  <p style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>{intelSummary?.total_pickups_completed?.toLocaleString() || '0'}</p>

                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>From {intelSummary?.total_pickups_requested} requests</p>
                </div>
                <div className="section-card" style={{ padding: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Completion Rate</p>
                  <p style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>{Math.round(intelSummary?.global_completion_rate || 0)}%</p>
                  <div style={{ height: 6, backgroundColor: 'var(--surface-2)', borderRadius: 3, marginTop: '1rem' }}>
                    <div style={{ width: `${intelSummary?.global_completion_rate || 0}%`, height: '100%', backgroundColor: '#3b82f6', borderRadius: 3 }} />
                  </div>
                </div>
                <div className="section-card" style={{ padding: '1.5rem' }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Fleet Size</p>
                  <p style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)' }}>{intelSummary?.total_collectors || '0'}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{intelSummary?.total_customers} Registered Customers</p>
                </div>
              </div>

              {/* Charts Section */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem', marginBottom: '2rem' }}>
                <div className="section-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Revenue & Volume Trends (30d)</h3>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueTrend}>
                        <defs>
                          <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} />
                        <YAxis stroke="#64748b" fontSize={10} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid #1e293b', borderRadius: '8px' }}
                          itemStyle={{ color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRev)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="section-card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Waste Distribution</h3>
                  <div style={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RePieChart>
                        <Pie
                          data={trashDistribution}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="count"
                        >
                          {trashDistribution.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][index % 4]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--surface)', border: '1px solid #1e293b', borderRadius: '8px' }}
                          itemStyle={{ color: 'var(--text-primary)', fontSize: '12px' }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px', color: 'var(--text-muted)' }} />
                      </RePieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Top Collectors Ranking */}
              <div className="section-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1.5rem' }}>Top Performing Collectors</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
                  {topCollectors.map((c, i) => (
                    <div key={i} style={{ backgroundColor: 'var(--surface)', padding: '1.25rem', borderRadius: '1rem', textAlign: 'center', border: '1px solid #1e293b' }}>
                      <div style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto' }}>
                        <Award size={24} color={i === 0 ? '#f59e0b' : i === 1 ? '#94a3b8' : i === 2 ? '#b45309' : '#3b82f6'} />
                      </div>
                      <p style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.25rem' }}>{c.full_name}</p>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.jobs_completed} Jobs</p>
                      <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#f59e0b', fontWeight: 900 }}>⭐ {c.avg_rating.toFixed(1)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === 'support' && (
            <div style={{ height: 'calc(100vh - 120px)', display: 'grid', gridTemplateColumns: '350px 1fr', gap: '1.5rem' }}>
              <div className="section-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border)' }}>
                  <h2 className="section-title">Support Tickets</h2>
                  <div style={{ position: 'relative', marginTop: '1rem' }}>
                    <Search size={16} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
                    <input className="form-input" style={{ paddingLeft: '2.5rem', height: '36px' }} placeholder="Search tickets..." />
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {supportTickets.length > 0 ? supportTickets.map(t => (
                    <div 
                      key={t.id} 
                      onClick={() => setActiveTicket(t)}
                      style={{ 
                        padding: '1.25rem', 
                        cursor: 'pointer', 
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: activeTicket?.id === t.id ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                        borderLeft: activeTicket?.id === t.id ? '4px solid #10b981' : 'none'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <p style={{ fontWeight: 700, margin: 0 }}>{t.profiles?.full_name}</p>
                        <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>{new Date(t.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.subject}</p>
                    </div>
                  )) : (
                    <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No active support tickets.</div>
                  )}
                </div>
              </div>

              <div className="section-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
                {activeTicket ? (
                  <>
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'var(--border)', overflow: 'hidden' }}>
                          <img src={activeTicket.profiles?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(activeTicket.profiles?.full_name || 'U')}&background=10b981&color=fff`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 800, margin: 0 }}>{activeTicket.profiles?.full_name}</p>
                          <p style={{ fontSize: '0.625rem', color: '#10b981', fontWeight: 700, margin: 0 }}>LIVE DISPATCH CHAT</p>
                        </div>
                      </div>
                      <button className="btn-sm" style={{ backgroundColor: 'var(--surface-2)' }} onClick={() => setActiveTicket(null)}>Close</button>
                    </div>

                    <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: '#0b141a' }}>
                      {supportMessages.map(m => (
                        <div key={m.id} style={{ alignSelf: m.sender_id === session.user.id ? 'flex-end' : 'flex-start', maxWidth: '70%' }}>
                          <div style={{ 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            borderBottomRightRadius: m.sender_id === session.user.id ? 0 : '1rem',
                            borderBottomLeftRadius: m.sender_id !== session.user.id ? 0 : '1rem',
                            backgroundColor: m.sender_id === session.user.id ? '#056162' : '#202c33',
                            color: '#fff',
                            fontSize: '0.875rem',
                            boxShadow: '0 1px 0.5px rgba(0,0,0,0.13)'
                          }}>
                            {m.content}
                            <div style={{ fontSize: '0.625rem', opacity: 0.6, marginTop: '0.25rem', textAlign: 'right' }}>
                              {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem' }}>
                      <input 
                        className="form-input" 
                        placeholder="Type a response..." 
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      />
                      <button className="btn-primary" style={{ width: 'auto', padding: '0 1.5rem' }} onClick={handleSendMessage}>Send</button>
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    <MessageSquare size={48} style={{ marginBottom: '1rem', opacity: 0.2 }} />
                    <p>Select a ticket from the left to start chatting</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'broadcasts' && (
            <>
              <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 className="page-title">Broadcast Hub</h1>
                  <p className="page-subtitle">Send platform-wide notifications to all customers and collectors.</p>
                </div>
                <button 
                  className="btn-sm" 
                  style={{ backgroundColor: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  onClick={() => playPing()}
                >
                  🔊 Test Alert Sound
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="section-card">
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Megaphone size={24} color="#10b981" />
                      <h2 className="section-title">New Platform Announcement</h2>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Message Content</label>
                    <textarea 
                      className="form-input" 
                      style={{ minHeight: '150px', resize: 'none' }} 
                      placeholder="Enter the announcement message here..."
                      value={newAnnouncement}
                      onChange={(e) => setNewAnnouncement(e.target.value)}
                    />
                  </div>
                  <button className="btn-primary" onClick={handlePostBroadcast}>
                    <PlusCircle size={18} />
                    Broadcast to All Users
                  </button>
                  <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Note: This message will be sent as a push notification and displayed on the app's global banner.
                  </p>
                </div>

                <div className="section-card">
                  <div className="section-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <Clock size={24} color="#3b82f6" />
                      <h2 className="section-title">Broadcast History</h2>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {broadcastHistory.length > 0 ? broadcastHistory.map((b: any) => (
                      <div key={b.id} style={{ backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '1rem', border: '1px solid var(--border)' }}>
                        <p style={{ margin: 0, fontWeight: 700, color: 'var(--text-primary)' }}>{b.title}</p>
                        <p style={{ margin: '0.25rem 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{b.message}</p>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sent: {new Date(b.created_at).toLocaleString()}</p>
                      </div>
                    )) : (
                      <p style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No previous broadcasts.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {activeTab === 'settings' && (
            <>
              <div style={{ marginBottom: '2rem' }}>
                <h1 className="page-title">System Settings</h1>
                <p className="page-subtitle">Configure platform-wide parameters and fee structures.</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">💰 Commission Rate</h2>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>The percentage the platform takes from each completed pickup payment.</p>
                  <div className="form-group">
                    <label className="form-label">Current Rate (%)</label>
                    <input
                      type="number" min={0} max={100}
                      className="form-input"
                      value={systemSettings.commission_rate}
                      onChange={(e) => setSystemSettings((p: any) => ({ ...p, commission_rate: e.target.value }))}
                    />
                  </div>
                  <button className="btn-primary" onClick={async () => {
                    const { error } = await supabase.from('system_settings').upsert({ key: 'commission_rate', value: { percentage: Number(systemSettings.commission_rate) } }, { onConflict: 'key' });
                    if (error) alert('Save failed: ' + error.message);
                    else alert('Commission rate saved!');
                  }}>Save Commission Rate</button>
                </div>
                <div className="section-card">
                  <div className="section-header">
                    <h2 className="section-title">⚡ Surge Multiplier</h2>
                  </div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>The pricing multiplier applied during peak demand periods.</p>
                  <div className="form-group">
                    <label className="form-label">Multiplier (e.g. 1.5 = 50% surge)</label>
                    <input
                      type="number" min={1} max={5} step={0.1}
                      className="form-input"
                      value={systemSettings.surge_multiplier}
                      onChange={(e) => setSystemSettings((p: any) => ({ ...p, surge_multiplier: e.target.value }))}
                    />
                  </div>
                  <button className="btn-primary" onClick={async () => {
                    const { error } = await supabase.from('system_settings').upsert({ key: 'surge_multiplier', value: { multiplier: Number(systemSettings.surge_multiplier) } }, { onConflict: 'key' });
                    if (error) alert('Save failed: ' + error.message);
                    else alert('Surge multiplier saved!');
                  }}>Save Surge Multiplier</button>
                </div>
                <div className="section-card" style={{ gridColumn: 'span 2' }}>
                  <div className="section-header"><h2 className="section-title">ℹ️ Platform Info</h2></div>
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                    <div><p style={{ margin: '0 0 0.25rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Version</p><p style={{ margin: 0, fontWeight: 700, color: 'var(--green)' }}>v1.0.4-WEB</p></div>
                    <div><p style={{ margin: '0 0 0.25rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Admin Email</p><p style={{ margin: 0, fontWeight: 700 }}>{session.user.email}</p></div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
