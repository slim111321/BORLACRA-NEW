import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { supabase } from '../lib/supabase';
import { Calendar, CreditCard, PlusCircle, ArrowLeft, Clock, MapPin, CheckCircle } from 'lucide-react-native';
import { TrashSubscription, SubscriptionFrequency, SubscriptionBilling } from '../types';
import { CreditCardForm } from './CreditCardForm';

interface SubscriptionsScreenProps {
  userId: string;
  onBack: () => void;
}

export const SubscriptionsScreen: React.FC<SubscriptionsScreenProps> = ({ userId, onBack }) => {
  const [subscriptions, setSubscriptions] = useState<TrashSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'card'>('list');

  // Create form state
  const [frequency, setFrequency] = useState<SubscriptionFrequency>('weekly');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [timeWindow, setTimeWindow] = useState('Morning (8AM - 12PM)');
  const [billing, setBilling] = useState<SubscriptionBilling>('postpaid');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSubscriptions();
  }, [userId]); // Removed fetchSubscriptions from array to avoid complex useCallbacks for now

  const fetchSubscriptions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (data && !error) {
      setSubscriptions(data as TrashSubscription[]);
    }
    setLoading(false);
  };

  const handleCreate = async () => {
    if (address.length < 5) {
      Alert.alert('Error', 'Please enter a valid collection address.');
      return;
    }

    if (billing === 'prepaid' || billing === 'postpaid') {
      // These tiers require a card on file
      setView('card');
    } else {
      // Pay as you go / Pay on pickup
      submitSubscription();
    }
  };

  const submitSubscription = async () => {
    if (!userId || userId === '') {
      Alert.alert('Error', 'User identification failed. Please try signing out and back in.');
      return;
    }
    
    setSubmitting(true);
    console.log('Attempting to create subscription for user:', userId);
    console.log('Data:', { frequency, dayOfWeek, timeWindow, billing, address });

    const { error } = await supabase.from('subscriptions').insert([
      {
        user_id: userId,
        frequency,
        day_of_week: dayOfWeek,
        time_window: timeWindow,
        billing_preference: billing,
        collection_address: address,
        status: 'active',
        next_pickup_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      }
    ]);

    setSubmitting(false);
    if (error) {
      console.error('Subscription Insert Error Details:', error);
      Alert.alert(
        'Subscription Failed', 
        `Error: ${error.message || 'Unknown database error'}. Details: ${error.details || 'None'}`
      );
    } else {
      Alert.alert('Success', 'Your pickup schedule has been set! You do not need to order manually anymore.');
      setView('list');
      fetchSubscriptions();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={view === 'create' ? () => setView('list') : onBack} style={styles.backBtn}>
          <ArrowLeft size={24} color="#1F2937" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scheduled Pickups</Text>
      </View>

      {view === 'list' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <TouchableOpacity style={styles.createBtn} onPress={() => setView('create')}>
            <PlusCircle size={20} color="#fff" />
            <Text style={styles.createBtnText}>Create New Schedule</Text>
          </TouchableOpacity>

          {loading ? (
            <Text style={{ textAlign: 'center', marginTop: 40 }}>Loading subscriptions...</Text>
          ) : subscriptions.length === 0 ? (
            <View style={styles.emptyState}>
              <Calendar size={64} color="#E5E7EB" style={{ marginBottom: 16 }} />
              <Text style={styles.emptyStateTitle}>No Schedules Yet</Text>
              <Text style={styles.emptyStateSub}>Set it and forget it. We&apos;ll automatically pick up your trash on the days you choose.</Text>
            </View>
          ) : (
            subscriptions.map(sub => (
              <View key={sub.id} style={styles.subCard}>
                <View style={styles.subHeader}>
                  <Text style={styles.subStatus}>
                    <CheckCircle size={14} color="#06C167" /> {sub.status.toUpperCase()}
                  </Text>
                  <Text style={styles.subFreq}>{sub.frequency}</Text>
                </View>
                
                <View style={styles.subRow}>
                  <Calendar size={18} color="#6B7280" />
                  <Text style={styles.subText}>Every {sub.day_of_week}</Text>
                </View>
                <View style={styles.subRow}>
                  <Clock size={18} color="#6B7280" />
                  <Text style={styles.subText}>{sub.time_window}</Text>
                </View>
                <View style={styles.subRow}>
                  <MapPin size={18} color="#6B7280" />
                  <Text style={styles.subText}>{sub.collection_address}</Text>
                </View>
                <View style={[styles.subRow, { marginTop: 8 }]}>
                  <CreditCard size={18} color="#4F46E5" />
                  <Text style={[styles.subText, { color: '#4F46E5', fontWeight: 'bold' }]}>
                    {sub.billing_preference === 'postpaid' ? 'Pay at end of month (Invoice)' :
                     sub.billing_preference === 'prepaid' ? 'Pre-paid (Monthly)' : 'Pay on pickup'}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      ) : view === 'create' ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* ... existing form ... */}
          <Text style={styles.sectionTitle}>1. How often should we come?</Text>
          <View style={styles.optionsRow}>
            {(['weekly', 'bi-weekly', 'monthly'] as SubscriptionFrequency[]).map(freq => (
              <TouchableOpacity
                key={freq}
                style={[styles.optionBtn, frequency === freq && styles.optionBtnActive]}
                onPress={() => setFrequency(freq)}
              >
                <Text style={[styles.optionText, frequency === freq && styles.optionTextActive]}>
                  {freq.charAt(0).toUpperCase() + freq.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>2. Which day of the week?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
              <TouchableOpacity
                key={day}
                style={[styles.dayBtn, dayOfWeek === day && styles.dayBtnActive]}
                onPress={() => setDayOfWeek(day)}
              >
                <Text style={[styles.dayText, dayOfWeek === day && styles.dayTextActive]}>{day}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionTitle}>3. Preferred Time Window</Text>
          <View style={styles.optionsRow}>
            {['Morning (8AM - 12PM)', 'Afternoon (12PM - 4PM)', 'Evening (4PM - 8PM)'].map(window => (
              <TouchableOpacity
                key={window}
                style={[styles.timeBtn, timeWindow === window && styles.timeBtnActive]}
                onPress={() => setTimeWindow(window)}
              >
                <Text style={[styles.timeText, timeWindow === window && styles.timeTextActive]}>{window}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>4. Collection Address</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. House No. 42, Kasoa New Market"
            value={address}
            onChangeText={setAddress}
          />

          <Text style={styles.sectionTitle}>5. Billing Preference</Text>
          <TouchableOpacity style={[styles.billingCard, billing === 'prepaid' && styles.billingCardActive]} onPress={() => setBilling('prepaid')}>
            <Text style={styles.billingTitle}>Pre-Paid Monthly (Recommended)</Text>
            <Text style={styles.billingDesc}>Pay upfront for the month. Sit back and relax.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.billingCard, billing === 'postpaid' && styles.billingCardActive]} onPress={() => setBilling('postpaid')}>
            <Text style={styles.billingTitle}>Post-Paid (Invoice)</Text>
            <Text style={styles.billingDesc}>We bill your card at the end of the month based on pickups.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.billingCard, billing === 'pay_on_pickup' && styles.billingCardActive]} onPress={() => setBilling('pay_on_pickup')}>
            <Text style={styles.billingTitle}>Pay As You Go</Text>
            <Text style={styles.billingDesc}>Pay the collector directly each time they arrive.</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.submitBtn} onPress={handleCreate} disabled={submitting}>
            <Text style={styles.submitBtnText}>{submitting ? 'Saving...' : 'Set Schedule'}</Text>
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Text style={styles.sectionTitle}>Secure Card Details</Text>
          <Text style={styles.billingDesc}>Verification charge of GH₵ 1.00 may apply.</Text>
          <CreditCardForm onCardComplete={(data) => {
            console.log('Card added:', data);
            submitSubscription();
          }} />
          <TouchableOpacity style={styles.submitBtn} onPress={submitSubscription} disabled={submitting}>
            <Text style={styles.submitBtnText}>{submitting ? 'Processing...' : 'Secure & Confirm'}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: 60, paddingBottom: 20, paddingHorizontal: 20, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#111827' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  createBtn: { backgroundColor: '#06C167', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 16, borderRadius: 12, marginBottom: 24 },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginLeft: 8 },
  emptyState: { alignItems: 'center', marginTop: 60 },
  emptyStateTitle: { fontSize: 20, fontWeight: 'bold', color: '#374151', marginBottom: 8 },
  emptyStateSub: { textAlign: 'center', color: '#6B7280', fontSize: 15, paddingHorizontal: 20 },
  subCard: { backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  subHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 12 },
  subStatus: { fontSize: 13, fontWeight: '800', color: '#06C167' },
  subFreq: { fontSize: 13, fontWeight: '600', color: '#4B5563', backgroundColor: '#F3F4F6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  subRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  subText: { marginLeft: 10, fontSize: 15, color: '#374151', flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginTop: 24, marginBottom: 12 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionBtn: { flex: 1, paddingVertical: 12, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, alignItems: 'center', backgroundColor: '#fff' },
  optionBtnActive: { borderColor: '#06C167', backgroundColor: '#ECFDF5' },
  optionText: { color: '#4B5563', fontWeight: '600' },
  optionTextActive: { color: '#06C167' },
  dayBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: '#D1D5DB', marginRight: 10, backgroundColor: '#fff' },
  dayBtnActive: { borderColor: '#06C167', backgroundColor: '#06C167' },
  dayText: { color: '#4B5563', fontWeight: '600' },
  dayTextActive: { color: '#fff' },
  timeBtn: { width: '100%', paddingVertical: 14, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, marginBottom: 10, alignItems: 'center', backgroundColor: '#fff' },
  timeBtnActive: { borderColor: '#06C167', backgroundColor: '#ECFDF5' },
  timeText: { color: '#4B5563', fontWeight: '600' },
  timeTextActive: { color: '#06C167' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 14, fontSize: 16 },
  billingCard: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, padding: 16, backgroundColor: '#fff', marginBottom: 12 },
  billingCardActive: { borderColor: '#4F46E5', backgroundColor: '#EFF6FF', borderWidth: 2 },
  billingTitle: { fontSize: 16, fontWeight: 'bold', color: '#111827', marginBottom: 4 },
  billingDesc: { fontSize: 14, color: '#6B7280' },
  submitBtn: { backgroundColor: '#111827', padding: 18, borderRadius: 12, alignItems: 'center', marginTop: 32 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});
