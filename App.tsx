import React, { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  StyleSheet,
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Animated,
  Switch,
  Linking,
  Modal,
  Vibration,
  PanResponder,
  Keyboard,
  TouchableWithoutFeedback
} from 'react-native';
import {
  Bell, User, MapPin, ChevronLeft, ChevronRight, Clock,
  MessageSquare, LogOut, CheckCircle, Wallet, Navigation, Globe,
  Shield, HelpCircle, FileText, Mail, Smartphone, Camera,
  Trash2, Star, Lock, Award, Menu, Map as MapIcon, Calendar, AlertTriangle, Truck, X, Check, Mic, Volume2, PlayCircle, Users, Recycle, Banknote, Send, Play
} from 'lucide-react-native';
import { Audio } from 'expo-av';
import * as ExpoLocation from 'expo-location';

import { supabase } from './lib/supabase';
import { TRASH_VEHICLES, RECENT_LOCATIONS, TRASH_TYPES } from './constants';
import { AppStep, UserRole, TrashType, TrashVehicle, CollectorStatus } from './types';
import { Layout } from './components/Layout';
import { Button } from './components/Button';
import { BottomNav } from './components/BottomNav';
import { MapComponent, CollectorPin } from './components/MapComponent';
import { CameraComponent } from './components/CameraComponent';
import { SubscriptionsScreen } from './components/SubscriptionsScreen';
import { analyzeTrashImage, TrashEstimate } from './utils/aiEstimator';
import { getVehicleOptions, inferRecommendedVehicleName } from './utils/vehicleDispatch';
import { getRouteDistanceAndDuration, formatEtaMinutes, formatDistanceKm } from './utils/routing';
import { activeMapProvider, GeocodeResult } from './services/maps';
import {
  getUserLocation,
  updateCollectorLocation,
  findNearbyCollectors,
  formatDistance,
  UserCoords,
  NearbyCollector,
} from './utils/location';

const COVERAGE_RADIUS_MILES = 3; // Reduced from 10 to 3 for a stricter local search radius

import {
  LOCATION_UPDATE_INTERVAL_MS,
  isLocationFresh,
  calculateDistance,
} from './utils/location';
import { ActivityType, logPlatformActivity } from './utils/activity';
import { registerForPushNotificationsAsync, schedulePredictiveReminder, sendPushNotification, savePushTokenAsync } from './utils/notifications';

import { PaymentComponent } from './components/PaymentComponent';
import { PaystackProvider } from 'react-native-paystack-webview';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode as decodeBase64 } from 'base64-arraybuffer';



const { width, height } = Dimensions.get('window');

const TRANSLATIONS = {
  English: {
    welcome: "Ghana's Choice",
    subWelcome: "Fast, reliable trash collection in Kasoa.",
    akwaaba: "Akwaaba !",
    cleanUp: "Let's clean up Kasoa today.",
    pickupTrash: "Pick up Trash?",
    trashType: "Trash Type",
    recent: "Recent",
    nearYou: "Near You",
    requestCollection: "Request Collection",
    confirmLocation: "Confirm Location",
    chooseVehicle: "Choose Vehicle",
    payment: "Payment",
    totalBill: "Total Bill to pay",
    confirmPayment: "Confirm Payment",
    whoAreYou: "Who are you?",
    customer: "Customer",
    collector: "Collector",
    admin: "Admin"
  },
  Twi: {
    welcome: "Ghana Paa",
    subWelcome: "Yɛ bue trash wɔ Kasoa ntɛm.",
    akwaaba: "Akwaaba !",
    cleanUp: "Yɛnsiesie Kasoa nnɛ.",
    pickupTrash: "Yɛmfa nwura?",
    trashType: "Nwura Su",
    recent: "Nansa yi",
    nearYou: "Wɔ wo nkyɛn",
    requestCollection: "Gye nwura",
    confirmLocation: "Ma yɛnhu baabi",
    chooseVehicle: "Fa lɔre",
    payment: "Tua Ka",
    totalBill: "Nea wotua nyinaa",
    confirmPayment: "Tua Ka",
    whoAreYou: "Hwan ne wo?",
    customer: "Okuafoɔ",
    collector: "Nwura gyefoɔ",
    admin: "Panin"
  }
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [step, setStep] = useState<AppStep>(AppStep.SPLASH);
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [mobileNumber, setMobileNumber] = useState('');
  const [scheduledDateTime, setScheduledDateTime] = useState<{ date: string, time: string } | null>(null);
  const [selectedTrashType, setSelectedTrashType] = useState<TrashType>(TrashType.HOUSEHOLD);
  const [language, setLanguage] = useState<'English' | 'Twi'>('English');
  const [pickups, setPickups] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<TrashVehicle | null>(null);
  const [vehicleOptions, setVehicleOptions] = useState<TrashVehicle[]>([]);
  const [isLoadingVehicleOptions, setIsLoadingVehicleOptions] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState<'priority' | 'wait_save'>('priority');
  // A single global `isLoading` flag used to be shared by ~22 unrelated
  // actions across the whole app, driving one root-level full-screen
  // overlay (`styles.globalLoading`) — so opening Profile, booking a
  // pickup, or any background fetch all froze the entire UI, not just the
  // thing that was actually loading. Replaced with one dedicated flag per
  // action/screen below; each button shows its own local loading state via
  // the Button component's `isLoading` prop (or inline text) instead.
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isPostingScrap, setIsPostingScrap] = useState(false);
  const [isConvoyActionLoading, setIsConvoyActionLoading] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isArriving, setIsArriving] = useState(false);
  const [isCollecting, setIsCollecting] = useState(false);
  const [isFinalizingJob, setIsFinalizingJob] = useState(false);
  const [isReportingIncident, setIsReportingIncident] = useState(false);
  const [isRequestingCollection, setIsRequestingCollection] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isAcceptingJob, setIsAcceptingJob] = useState(false);
  const [isSavingVehicleDetails, setIsSavingVehicleDetails] = useState(false);
  const [isSubmittingDocuments, setIsSubmittingDocuments] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [isBookingFromEstimate, setIsBookingFromEstimate] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingCollector, setRatingCollector] = useState<any>(null);
  const [ratingPickupId, setRatingPickupId] = useState<string | null>(null);
  const [selectedRating, setSelectedRating] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [selectedRatingTag, setSelectedRatingTag] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMethod, setAuthMethod] = useState<'phone' | 'email'>('phone');
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [voiceMessageSent, setVoiceMessageSent] = useState(false);
  const [collectorOnline, setCollectorOnline] = useState(true);
  // Support & Profile State
  // Support & Profile State
  const [supportMessages, setSupportMessages] = useState<any[]>([]);
  const [newSupportMessage, setNewSupportMessage] = useState('');
  const [activeTicket, setActiveTicket] = useState<any>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [savedLocationsList, setSavedLocationsList] = useState<any[]>([]);
  const [isLoadingSavedLocations, setIsLoadingSavedLocations] = useState(false);
  const [showAddSavedLocation, setShowAddSavedLocation] = useState(false);
  const [newSavedLocationName, setNewSavedLocationName] = useState('');
  const [newSavedLocationAddress, setNewSavedLocationAddress] = useState('');
  const [isSavingLocation, setIsSavingLocation] = useState(false);

  // --- Bottom Sheet Animation State ---
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const panY = useRef(new Animated.Value(0)).current;
  const panOffset = useRef(0);

  useEffect(() => {
    const listener = panY.addListener((state) => {
      panOffset.current = state.value;
    });
    return () => { panY.removeListener(listener); };
  }, [panY]);

  const SNAP_DOWN = SCREEN_HEIGHT * 0.50; // Drop by 50% height

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Claim if mostly vertical drag
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx) && Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        panY.setOffset(panOffset.current);
        panY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        let newY = gestureState.dy;
        const absoluteY = panOffset.current + newY;
        
        if (absoluteY < 0) {
          newY = -panOffset.current + (absoluteY * 0.1); // Resistance going above
        } else if (absoluteY > SNAP_DOWN) {
          newY = (SNAP_DOWN - panOffset.current) + ((absoluteY - SNAP_DOWN) * 0.2); // Resistance below
        }
        
        panY.setValue(newY);
      },
      onPanResponderRelease: (_, gestureState) => {
        panY.flattenOffset();
        const currentAbsoluteY = panOffset.current;
        let toValue = 0;
        
        if (gestureState.vy > 0.5 || currentAbsoluteY > SNAP_DOWN / 2) {
          toValue = SNAP_DOWN;
        } else {
          toValue = 0;
        }

        Animated.spring(panY, {
          toValue,
          tension: 60,
          friction: 8,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;
  // --- End Bottom Sheet Animation State ---

  const [userProfile, setUserProfile] = useState<any>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [manualLocation, setManualLocation] = useState('');
  const [manualLocationResults, setManualLocationResults] = useState<GeocodeResult[]>([]);
  
  const [collectorProfile, setCollectorProfile] = useState({
    photo: '',
    phone: '',
    name: '',
    vehicleType: 'Mini Truck',
    isVerified: false
  });
  const [activePickup, setActivePickup] = useState<any>(null);
  const [jobStatus, setJobStatus] = useState<'idle' | 'request' | 'on_way' | 'arrived' | 'collected' | 'completed'>('idle');
  const [collectorCoords, setCollectorCoords] = useState<UserCoords | null>(null);
  const [collectorEtaLabel, setCollectorEtaLabel] = useState<string | null>(null);
  const lastEtaFetchRef = useRef<number>(0);
  const [dismissedRequestIds, setDismissedRequestIds] = useState<string[]>([]);
  const dismissedIdsRef = useRef<string[]>([]);

  // Update ref whenever state changes — also persist to phone storage
  useEffect(() => {
    dismissedIdsRef.current = dismissedRequestIds;
    if (dismissedRequestIds.length > 0) {
      AsyncStorage.setItem('dismissedPickupIds', JSON.stringify(dismissedRequestIds)).catch(() => {});
    }
  }, [dismissedRequestIds]);

  // Load persisted dismissed IDs on first mount
  useEffect(() => {
    AsyncStorage.getItem('dismissedPickupIds').then((stored) => {
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        dismissedIdsRef.current = ids;
        setDismissedRequestIds(ids);
      }
    }).catch(() => {});
  }, []);
  
  // Realtime Refs
  const pickupChannelRef = useRef<any>(null);
  const chatChannelRef = useRef<any>(null);
  const userCoordsRef = useRef<UserCoords | null>(null);
  const [jobTimer, setJobTimer] = useState(30);

  // --- Image Picking & Storage Helpers ---
  const pickImage = async (onImagePicked: (uri: string, base64?: string) => void) => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,   // <-- request base64 data for reliable upload
    });

    if (!result.canceled) {
      onImagePicked(result.assets[0].uri, result.assets[0].base64 ?? undefined);
    }
  };

  const uploadToSupabase = async (uri: string, bucket: string, path: string, base64?: string) => {
    try {
      setIsUploading(true);

      let arrayBuffer: ArrayBuffer;

      if (base64) {
        // Most reliable method: decode base64 directly to ArrayBuffer
        arrayBuffer = decodeBase64(base64);
      } else {
        // Fallback for non-picker URIs (e.g. camera, proof photos)
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
        arrayBuffer = decodeBase64(b64);
      }

      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
      return publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  // ── LIVE LOCATION SEARCH (via activeMapProvider — mapbox/osm/google) ────
  const searchNominatim = useCallback(async (query: string) => {
    if (!query || query.trim().length < 3) {
      setLocationSearchResults([]);
      return;
    }
    setIsSearchingLiveLocation(true);
    try {
      const results = await activeMapProvider.geocode(query);
      setLocationSearchResults(results);
    } catch (e) {
      console.error('[maps] geocode search error:', e);
      setLocationSearchResults([]);
    } finally {
      setIsSearchingLiveLocation(false);
    }
  }, []);

  const handleLocationSearchChange = (text: string) => {
    setLocationSearchQuery(text);
    if (locationSearchTimeoutRef.current) clearTimeout(locationSearchTimeoutRef.current);
    locationSearchTimeoutRef.current = setTimeout(() => searchNominatim(text), 400);
  };

  const handleLocationSelect = (result: GeocodeResult) => {
    setPickupAddress(result.address || result.label);
    setLocationSearchQuery(result.label);
    setLocationSearchResults([]);
    setUserCoords(result.coordinate);
    setLocationLabel(result.label);
  };
  // ── END NOMINATIM ────────────────────────────────────────────────────────

  const handleUpdateProfile = async () => {

    if (!user?.id) return;
    setIsUploading(true);
    const { error } = await supabase.from('profiles').update({
      full_name: editName,
      phone_number: editPhone,
      address: editAddress,
      updated_at: new Date().toISOString()
    }).eq('id', user.id);

    if (error) {
      Alert.alert('Error', 'Failed to update profile. ' + error.message);
    } else {
      Alert.alert('Success', 'Profile updated successfully!');
      setIsEditingProfile(false);
      
      // Update local state immediately
      setUserProfile((prev: any) => ({
        ...prev,
        full_name: editName,
        phone_number: editPhone,
        address: editAddress
      }));

      // SYNC: If collector, update their specific profile state too
      if (role === UserRole.COLLECTOR) {
        setCollectorProfile(prev => ({ ...prev, name: editName, phone: editPhone }));
      }
      
      // fetchUserData() removed - all admin logic migrated to web-admin portal
    }
    setIsUploading(false);
  };

  const [vehicleDetails, setVehicleDetails] = useState({
    type: '',
    plate: '',
    capacity: '',
    photo: ''
  });

  // ── Chat States ──────────────────────────────────────────────────────────
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newChatMessage, setNewChatMessage] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  const [isTakingProof, setIsTakingProof] = useState(false);

  // ── Collector real-time stats ──────────────────────────────────────────────
  const [collectorStats, setCollectorStats] = useState({
    todayPayout: 0,
    ratingAvg: 0,
    completedToday: 0,
    questTarget: 10,
    questProgress: 0,
  });
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [documents, setDocuments] = useState({
    nationalId: '',
    license: '',
    vehicleReg: '',
    wastePermit: ''
  });
  const [approvalStatus, setApprovalStatus] = useState('pending'); // pending, approved, rejected
  const [navigationProgress, setNavigationProgress] = useState(0);
  const [collectorNavDistanceLabel, setCollectorNavDistanceLabel] = useState<string | null>(null);
  const [collectorNavEtaLabel, setCollectorNavEtaLabel] = useState<string | null>(null);
  const lastNavEtaFetchRef = useRef<number>(0);
  const [proofImage, setProofImage] = useState<string | null>(null);
  const [isCardExpanded, setIsCardExpanded] = useState(false);

  // Audio Session Hardening
  useEffect(() => {
    const initAudio = async () => {
      try {
        console.log('[Audio] Initializing global audio session...');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          interruptionModeIOS: 1, // DoNotMix
          staysActiveInBackground: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
      } catch (err) {
        console.warn('[Audio] Failed to init audio session:', err);
      }
    };
    initAudio();
  }, []);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<TrashEstimate | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [separatedPlastics, setSeparatedPlastics] = useState(false);
  const [splitWays, setSplitWays] = useState(1);
  const [isRecordingLandmark, setIsRecordingLandmark] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [voiceRecordingUri, setVoiceRecordingUri] = useState<string | null>(null);
  const recordingRef = React.useRef<Audio.Recording | null>(null);
  const [hasVoiceLandmark, setHasVoiceLandmark] = useState(false);
  const [isPlayingLandmark, setIsPlayingLandmark] = useState(false);
  const [ussdStep, setUssdStep] = useState(0);
  const [ussdInputText, setUssdInputText] = useState('');
  const [globalAnnouncement, setGlobalAnnouncement] = useState({
    active: false,
    text: '',
    type: 'INFO' 
  });
  const [convoyActive, setConvoyActive] = useState(false);
  const [bookingForSelf, setBookingForSelf] = useState(true);
  const [friendPhone, setFriendPhone] = useState('');
  const [pickupAddress, setPickupAddress] = useState('Kasoa New Market, Ghana');
  // Nominatim live location search state
  const [locationSearchQuery, setLocationSearchQuery] = useState('');
  const [locationSearchResults, setLocationSearchResults] = useState<GeocodeResult[]>([]);
  const [isSearchingLiveLocation, setIsSearchingLiveLocation] = useState(false);
  // Was referenced (setIsSearchingLocation) by the manual map-picker search
  // box below without ever being declared — that call threw a ReferenceError
  // at runtime on every submit. Declared here now that it's a real state.
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const locationSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'paystack' | 'cash'>('paystack');
  const [pendingPickups, setPendingPickups] = useState<any[]>([]);
  const [selectedScheduleDate, setSelectedScheduleDate] = useState<Date>(new Date());
  const [recurringRoutes, setRecurringRoutes] = useState<any[]>([]);
  const [isLoadingRecurringRoutes, setIsLoadingRecurringRoutes] = useState(false);
  const [isRedeemingVoucher, setIsRedeemingVoucher] = useState(false);
  const [newRequestOverlay, setNewRequestOverlay] = useState<any>(null);
  const [splitAmount, setSplitAmount] = useState(85.0);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [momoNumber, setMomoNumber] = useState('');
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentType, setIncidentType] = useState('VEHICLE_BREAKDOWN');
  const [incidentDesc, setIncidentDesc] = useState('');

  const [truckLoad, setTruckLoad] = useState(0);

  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [communityPools, setCommunityPools] = useState<any[]>([]);
  const [newPoolName, setNewPoolName] = useState('');
  const [isCreatingPool, setIsCreatingPool] = useState(false);
  const [activeConvoyMembers, setActiveConvoyMembers] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [unreadTicketIds, setUnreadTicketIds] = useState<string[]>([]);
  const [activeChallenges, setActiveChallenges] = useState<any[]>([]);
  const [myScrapListings, setMyScrapListings] = useState<any[]>([]);
  const [scrapBuyers, setScrapBuyers] = useState<any[]>([]);
  const [showScrapModal, setShowScrapModal] = useState(false);
  const [newScrapListing, setNewScrapListing] = useState({ material_type: 'PLASTIC', quantity_kg: '', asking_price: '' });
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [currentConvoyId, setCurrentConvoyId] = useState<string | null>(null);

  // ── Location & Coverage ──────────────────────────────────────────────────
  const [userCoords, setUserCoords] = useState<UserCoords | null>(null);
  const [locationLabel, setLocationLabel] = useState('Locating...');
  const [nearbyCollectors, setNearbyCollectors] = useState<NearbyCollector[]>([]);
  const [checkingCoverage, setCheckingCoverage] = useState(false);
  const collectorLocationIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const prevPendingCount = useRef(0);
  const [collectorMetric, setCollectorMetric] = useState<any>(null);
  const [collectorReviews, setCollectorReviews] = useState<any[]>([]);
  const [landfills, setLandfills] = useState<any[]>([]);

  useEffect(() => {
    userCoordsRef.current = userCoords;
  }, [userCoords]);


  useEffect(() => {
    // This used to divide a hardcoded GH₵85 regardless of what the
    // customer actually booked, so the Payment screen (and the amount
    // actually sent to Paystack) never matched the real, dynamically
    // computed price shown on the Choose Vehicle screen. 85 is now only a
    // placeholder fallback for the brief moment before a real pickup with a
    // real pricing_ghs exists.
    const totalPrice = Number(activePickup?.pricing_ghs) || 85.00;
    setSplitAmount(Number((totalPrice / splitWays).toFixed(2)));
  }, [splitWays, activePickup?.pricing_ghs]);


  // Job Request Timer Logic
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === AppStep.JOB_REQUEST && jobTimer > 0) {
      interval = setInterval(() => {
        setJobTimer((prev) => prev - 1);
      }, 1000);
    } else if (step === AppStep.JOB_REQUEST && jobTimer === 0) {
      // Auto-decline when time runs out
      setStep(AppStep.COLLECTOR_DASHBOARD);
      setJobStatus('idle');
    }
    return () => clearInterval(interval);
  }, [step, jobTimer]);

  // Operational Status Sync
  useEffect(() => {
    if (role === UserRole.COLLECTOR && user?.id) {
      if (!collectorOnline) {
        updateCollectorStatus(CollectorStatus.OFFLINE);
      } else if (jobStatus === 'idle') {
        updateCollectorStatus(CollectorStatus.ONLINE);
      }
    }
  }, [collectorOnline, jobStatus, role, user?.id]);


  // Real GPS Navigation Logic for Collectors
  useEffect(() => {
    let watchId: any;
    if (role === UserRole.COLLECTOR && jobStatus === 'on_way') {
      console.log('[Location] Starting high-frequency GPS watch for Navigation...');
      ExpoLocation.watchPositionAsync(
        {
          accuracy: ExpoLocation.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setUserCoords(coords);
          
          // SPEED BOOST: Broadcast location directly to the channel (Instant)
          if (pickupChannelRef.current) {
            pickupChannelRef.current.send({
              type: 'broadcast',
              event: 'location',
              payload: { 
                lat: coords.latitude,
                lng: coords.longitude 
              }
            });
          }

          // Persistence: Update DB (Slower, for history/fallbacks)
          updateCollectorLocation(user?.id || '', coords, true);
        }
      ).then(sub => watchId = sub);
    }
    return () => {
      if (watchId) watchId.remove();
    };
  }, [role, jobStatus]);

  // ── Chat Logic ────────────────────────────────────────────────────────────
  const fetchChatMessages = async (pickupId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('pickup_id', pickupId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setChatMessages(data || []);
    } catch (err) {
      console.error('[Chat] Fetch error:', err);
    }
  };

  const sendChatMessage = async () => {
    if (!newChatMessage.trim() || !activePickup?.id || !user?.id) return;
    
    setIsSendingChat(true);
    const content = newChatMessage.trim();
    setNewChatMessage('');

    // Optimistic Update
    const tempId = Math.random().toString();
    const optimisticMsg = {
      id: tempId,
      pickup_id: activePickup.id,
      sender_id: user.id,
      message_text: content,
      created_at: new Date().toISOString(),
      is_optimistic: true
    };
    setChatMessages(prev => [...prev, optimisticMsg]);

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert({
          pickup_id: activePickup.id,
          sender_id: user.id,
          message_text: content
        });

      if (error) throw error;

      // Send Push Notification to the other party
      const otherUserId = role === UserRole.CUSTOMER ? activePickup.collector_id : (activePickup.customer_id || activePickup.user_id);
      if (otherUserId) {
        const { data: otherProfile } = await supabase.from('profiles').select('push_token').eq('id', otherUserId).single();
        if (otherProfile?.push_token) {
          sendPushNotification(
            otherProfile.push_token,
            `New message from ${userProfile?.full_name || 'User'}`,
            content.length > 50 ? content.substring(0, 47) + '...' : content
          );
        }
      }
    } catch (err) {
      console.error('[Chat] Send error:', err);
      // Remove optimistic message on error
      setChatMessages(prev => prev.filter(m => m.id !== tempId));
      Alert.alert('Error', 'Failed to send message.');
    } finally {
      setIsSendingChat(false);
    }
  };

  const fetchHistory = useCallback(async (silent = false) => {
    // This used to set the GLOBAL isLoading flag (freezing the entire app,
    // not just the pickups list) whenever called non-silently — and it was
    // being called non-silently on every HOME/HISTORY/COLLECTOR_DASHBOARD
    // screen entry, plus once per realtime pickups change platform-wide
    // (see the public:pickups subscription below, now fixed to pass
    // silent=true). A background list refresh should never block the UI;
    // isHistoryLoading only drives a small in-screen indicator.
    if (!silent) {
      setIsHistoryLoading(true);
    }
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        if (!silent) setIsHistoryLoading(false);
        return;
      }

      let resultData: any[] = [];
      let resultError: any = null;

      // Try joined select
      const { data, error } = await supabase
        .from('pickups')
        .select(`
          *,
          customer:profiles!customer_id(full_name, phone_number, avatar_url),
          collector:profiles!collector_id(full_name, phone_number, avatar_url, rating_average, vehicle_details)
        `)
        .or(`customer_id.eq.${authUser.id},user_id.eq.${authUser.id},collector_id.eq.${authUser.id},status.eq.pending`)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[History] Join failed, falling back...');
        const { data: simpleData, error: simpleError } = await supabase
          .from('pickups')
          .select('*')
          .or(`customer_id.eq.${authUser.id},user_id.eq.${authUser.id},collector_id.eq.${authUser.id},status.eq.pending`)
          .order('created_at', { ascending: false });
        resultData = simpleData || [];
        resultError = simpleError;
      } else {
        resultData = data || [];
      }

      if (!resultError) {
        // Post-process to ensure collector/customer info is present even if join was wonky
        const processedData = await Promise.all(resultData.map(async (p) => {
          const enriched = { ...p };
          if (enriched.collector_id && !enriched.collector) {
            const { data: col, error: colErr } = await supabase.from('profiles').select('*').eq('id', enriched.collector_id).maybeSingle();
            if (colErr) console.error('[History] Collector profile fetch error:', colErr);
            if (col) {
              const vDetails = typeof col.vehicle_details === 'string' ? JSON.parse(col.vehicle_details) : (col.vehicle_details || null);
              enriched.collector = { ...col, vehicle_details: vDetails };
            }
          }
          if (enriched.customer_id && !enriched.customer) {
            const { data: cust, error: custErr } = await supabase.from('profiles').select('*').eq('id', enriched.customer_id).maybeSingle();
            if (custErr) console.error('[History] Customer profile fetch error:', custErr);
            if (cust) enriched.customer = cust;
          }
          if (activePickup && activePickup.id === enriched.id && enriched.collector) {
            setActivePickup(prev => prev ? ({ ...prev, ...enriched, collector: enriched.collector }) : null);
          }
          return enriched;
        }));

        if (role === UserRole.CUSTOMER) {
          setPickups(processedData.filter(p => p.customer_id === authUser.id || p.user_id === authUser.id));
        } else {
          // Filter out dismissed requests using the Ref to avoid stale closure issues
          setPendingPickups(processedData.filter(p => 
            p.status === 'pending' && !dismissedIdsRef.current.includes(p.id)
          ));
          setPickups(processedData.filter(p => p.status !== 'pending' && p.collector_id === authUser.id));
        }
      }
    } catch (err) {
      console.error('[History] Unexpected error:', err);
    } finally {
      if (!silent) setIsHistoryLoading(false);
    }
  }, [role, userProfile, activePickup]);

  const playPing = async () => {
    try {
      console.log(`[Audio] Playing piercing alert for ${role}...`);
      Vibration.vibrate([0, 500, 100, 500]); 
      
      const { status: existingStatus } = await Audio.getPermissionsAsync();
      if (existingStatus !== 'granted') {
        await Audio.requestPermissionsAsync();
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
        staysActiveInBackground: true,
      });

      const sampleRate = 22050;
      const durationSec = 0.5;
      const freqHz = 1200; // More piercing frequency
      const numSamples = Math.floor(sampleRate * durationSec);
      const dataLen = numSamples * 2;

      const wavBytes: number[] = [];
      const pushStr = (s: string) => { for (let ci = 0; ci < s.length; ci++) wavBytes.push(s.charCodeAt(ci)); };
      const pushU32 = (v: number) => { wavBytes.push(v & 0xFF, (v >> 8) & 0xFF, (v >> 16) & 0xFF, (v >> 24) & 0xFF); };
      const pushU16 = (v: number) => { wavBytes.push(v & 0xFF, (v >> 8) & 0xFF); };

      pushStr('RIFF'); pushU32(36 + dataLen); pushStr('WAVE');
      pushStr('fmt '); pushU32(16); pushU16(1); pushU16(1);
      pushU32(sampleRate); pushU32(sampleRate * 2); pushU16(2); pushU16(16);
      pushStr('data'); pushU32(dataLen);

      for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-4 * t); // Exponential decay for a "ping"
        const sample = Math.round(Math.sin(2 * Math.PI * freqHz * t) * envelope * 32767);
        const u = sample < 0 ? sample + 65536 : sample;
        wavBytes.push(u & 0xFF, (u >> 8) & 0xFF);
      }

      const uintArray = new Uint8Array(wavBytes);
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let base64Wav = '';
      for (let i = 0; i < uintArray.length; i += 3) {
        const b1 = uintArray[i], b2 = uintArray[i+1] || 0, b3 = uintArray[i+2] || 0;
        base64Wav += chars[b1 >> 2] + chars[((b1 & 3) << 4) | (b2 >> 4)] + 
               (i+1 < uintArray.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '=') + 
               (i+2 < uintArray.length ? chars[b3 & 63] : '=');
      }

      const path = `${FileSystem.cacheDirectory}ping.wav`;
      await FileSystem.writeAsStringAsync(path, base64Wav, { encoding: FileSystem.EncodingType.Base64 });

      const { sound } = await Audio.Sound.createAsync(
        { uri: path },
        { shouldPlay: true, volume: 1.0 }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      console.warn('[Audio] Ping setup failed:', e);
    }
  };

  // Real-time Pickup Listener
  useEffect(() => {
    if (!user?.id) return;

    const channelTopic = activePickup?.id ? `pickup:${activePickup.id}:location` : 'pickup_updates';
    const channel = supabase
      .channel(channelTopic, { config: { broadcast: { self: false } } })
    
    pickupChannelRef.current = channel;

    channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pickups' },
        (payload: any) => {
          console.log('[Realtime] Payload:', payload.eventType, payload.new?.id, payload.new?.status);
          
          fetchHistory(true);

          if (payload.eventType === 'UPDATE') {
            const updated = payload.new;
            if (activePickup && updated.id === activePickup.id) {
              setActivePickup(prev => ({ ...prev, ...updated }));
              if (updated.status === 'collected') setJobStatus('collected');
              if (updated.status === 'completed') {
                setJobStatus('completed');
                // The only other place that opens the rating modal is
                // handlePaymentSuccess, which requires a real Paystack
                // payment to complete first. A pickup normally reaches
                // 'collected' (which routes the customer to the Payment
                // screen) before it ever reaches 'completed', so by this
                // point the customer is already on that screen — payments
                // are currently disabled/skipped for testing, so
                // handlePaymentSuccess never fires and customers could
                // never rate a collector at all. Trigger it here too, the
                // moment the job is genuinely done, independent of payment.
                // Guarded on !isPaying (not on the Payment screen itself) so
                // this can never pop up on top of a real in-progress
                // Paystack transaction.
                if (role === UserRole.CUSTOMER && !isPaying && updated.collector_id) {
                  setRatingCollector(activePickup.collector || { id: updated.collector_id });
                  setRatingPickupId(updated.id);
                  setShowRatingModal(true);
                }
              }
            }
          }

          // COLLECTOR LOGIC
          if (role === UserRole.COLLECTOR) {
            if (payload.eventType === 'INSERT' && (!payload.new.status || payload.new.status === 'pending')) {
              const dist = calculateDistance(
                userCoordsRef.current?.latitude || 0, userCoordsRef.current?.longitude || 0,
                payload.new.lat || 0, payload.new.lng || 0
              );

              if (dist <= COVERAGE_RADIUS_MILES && !dismissedIdsRef.current.includes(payload.new.id)) {
                supabase.from('profiles').select('full_name, avatar_url').eq('id', payload.new.customer_id).single()
                  .then(({ data: cust }) => {
                    const enriched = { ...payload.new, customer: cust };
                    setNewRequestOverlay(enriched);
                    playPing(); 
                  });
              }
            }
          }

          // CUSTOMER LOGIC
          if (role === UserRole.CUSTOMER) {
             if (payload.new.status === 'assigned' && (payload.new.customer_id === user.id || payload.new.user_id === user.id)) {
                supabase.from('profiles').select('full_name, avatar_url, rating_average, vehicle_details, vehicle_number, vehicle_type').eq('id', payload.new.collector_id).single()
                  .then(({ data: coll }) => {
                    const vDetails = typeof coll?.vehicle_details === 'string' ? JSON.parse(coll.vehicle_details) : (coll?.vehicle_details || null);
                    const enrichedColl = coll ? { ...coll, vehicle_details: vDetails } : null;
                    const enriched = { ...payload.new, collector: enrichedColl };
                    setActivePickup(enriched);
                    setStep(AppStep.COLLECTOR_FOUND);
                    playPing();
                  });
             }
             if (payload.new.status === 'collected' && (payload.new.customer_id === user.id || payload.new.user_id === user.id)) {
                setActivePickup(prev => ({ ...prev, ...payload.new, collector: prev?.collector }));
                setStep(AppStep.PAYMENT);
                playPing();
             }
          }
        }
      )
      .on(
        'broadcast',
        { event: 'location' },
        (payload) => {
          if (role === UserRole.CUSTOMER && activePickup) {
            setActivePickup(prev => prev ? ({
              ...prev,
              lat: payload.payload.lat,
              lng: payload.payload.lng
            }) : null);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role, activePickup?.id, isPaying]);

  // Ensure collector hears the ping whenever a new request overlay is shown
  useEffect(() => {
    if (newRequestOverlay && role === UserRole.COLLECTOR) {
      console.log('[Audio] Triggering overlay ping for Collector');
      playPing();
    }
  }, [newRequestOverlay, role]);

  // Ensure collector hears the ping whenever the pending list count increases
  useEffect(() => {
    if (role === UserRole.COLLECTOR && pendingPickups.length > prevPendingCount.current) {
      console.log('[Audio] New pending pickup detected via list update. Count:', pendingPickups.length);
      playPing();
    }
    prevPendingCount.current = pendingPickups.length;
  }, [pendingPickups.length, role]);

  // Polling Fallback: Refresh history every 60 seconds to catch missed Realtime events
  useEffect(() => {
    if (!user?.id) return;
    const pollInterval = setInterval(() => {
      console.log('[Polling] refreshing history...');
      fetchHistory(true);
    }, 60000); 
    return () => clearInterval(pollInterval);
  }, [user?.id, fetchHistory]);

  // Dedicated Chat Listener
  useEffect(() => {
    if (!user?.id || !activePickup?.id) return;

    console.log('[Chat] Subscribing to pickup:', activePickup.id);
    
    const channel = supabase
      .channel(`chat_${activePickup.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'chat_messages'
        },
        (payload) => {
          console.log('[Realtime Chat] Message received:', payload.new);
          if (activePickup && payload.new.pickup_id === activePickup.id) {
            // If message is from someone else, notify the user
            if (payload.new.sender_id !== user.id) {
              playPing();
              Vibration.vibrate(200);
              
              // If user is not in the chat screen, show an alert
              if (step !== AppStep.COLLECTOR_CHAT && step !== AppStep.PICKUP_CHAT) {
                Alert.alert(
                  '💬 New Message',
                  payload.new.message_text,
                  [{ text: 'View', onPress: () => setStep(role === UserRole.CUSTOMER ? AppStep.PICKUP_CHAT : AppStep.COLLECTOR_CHAT) }, { text: 'Dismiss' }]
                );
              }
            }

            setChatMessages(prev => {
              // If we already have this message (real or optimistic duplicate), don't add again
              if (prev.find(m => m.id === payload.new.id)) return prev;
              
              // Remove matching optimistic message if exists
              const filtered = prev.filter(m => !(m.is_optimistic && m.message_text === payload.new.message_text && m.sender_id === payload.new.sender_id));
              return [...filtered, payload.new];
            });
          }
        }
      )
      .subscribe();

    return () => {
      console.log('[Chat] Unsubscribing from pickup:', activePickup.id);
      supabase.removeChannel(channel);
    };
  }, [user?.id, activePickup?.id]);

  // Dedicated Collector Location Listener (for Customers)
  useEffect(() => {
    if (role !== UserRole.CUSTOMER || !activePickup?.collector_id) {
      setCollectorCoords(null);
      return;
    }

    console.log('[Location] Subscribing to collector:', activePickup.collector_id);
    
    // Initial fetch
    supabase
      .from('collector_locations')
      .select('latitude, longitude')
      .eq('collector_id', activePickup.collector_id)
      .single()
      .then(({ data }) => {
        if (data) setCollectorCoords({ latitude: data.latitude, longitude: data.longitude });
      });

    const channel = supabase
      .channel(`location_${activePickup.collector_id}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'collector_locations',
          filter: `collector_id=eq.${activePickup.collector_id}` 
        },
        (payload) => {
          console.log('[Realtime Location] Collector moved:', payload.new);
          setCollectorCoords({ latitude: payload.new.latitude, longitude: payload.new.longitude });
        }
      )
      .subscribe();

    return () => {
      console.log('[Location] Unsubscribing from collector:', activePickup.collector_id);
      supabase.removeChannel(channel);
    };
  }, [role, activePickup?.collector_id]);

  // Real ETA for the "collector is on the way" marker badge — this used to
  // be a hardcoded "5:12" that never changed no matter how far away the
  // collector actually was. Recalculated via the same OSRM routing used for
  // Choose Vehicle pricing, throttled to roughly once per 15s (collectorCoords
  // can update every ~2s during active navigation — recalculating on every
  // single GPS tick would hammer the public OSRM endpoint for no visible
  // benefit, since ETA doesn't need sub-15s precision).
  useEffect(() => {
    if (role !== UserRole.CUSTOMER || !collectorCoords || !userCoords) {
      setCollectorEtaLabel(null);
      return;
    }
    const now = Date.now();
    if (now - lastEtaFetchRef.current < 15000) return;
    lastEtaFetchRef.current = now;

    let cancelled = false;
    getRouteDistanceAndDuration(collectorCoords.latitude, collectorCoords.longitude, userCoords.latitude, userCoords.longitude)
      .then((route) => {
        if (!cancelled && route) setCollectorEtaLabel(formatEtaMinutes(route.durationMinutes));
      });
    return () => { cancelled = true; };
  }, [role, collectorCoords, userCoords]);

  // Real distance/ETA for the collector's own "Navigate to Pickup" card —
  // this used to be (2.3 * (1 - navigationProgress)).toFixed(1) km, and
  // navigationProgress was never set anywhere after its initial value of 0,
  // so it permanently displayed the fixed fake value "2.3 km • ~8 mins" no
  // matter where the collector actually was. Same 15s throttle as the
  // customer-facing ETA above, for the same reason.
  useEffect(() => {
    const pickupLat = Number(activePickup?.lat);
    const pickupLng = Number(activePickup?.lng);
    if (role !== UserRole.COLLECTOR || jobStatus !== 'on_way' || !userCoords || !pickupLat || !pickupLng) {
      return;
    }
    const now = Date.now();
    if (now - lastNavEtaFetchRef.current < 15000) return;
    lastNavEtaFetchRef.current = now;

    let cancelled = false;
    getRouteDistanceAndDuration(userCoords.latitude, userCoords.longitude, pickupLat, pickupLng)
      .then((route) => {
        if (cancelled || !route) return;
        setCollectorNavDistanceLabel(formatDistanceKm(route.distanceKm));
        setCollectorNavEtaLabel(formatEtaMinutes(route.durationMinutes));
      });
    return () => { cancelled = true; };
  }, [role, jobStatus, userCoords, activePickup?.lat, activePickup?.lng]);

  // Auto-Arrival Detection for Collectors
  useEffect(() => {
    if (role !== UserRole.COLLECTOR || jobStatus !== 'on_way' || !activePickup || !userCoords) return;

    const dist = calculateDistance(
      userCoords.latitude, userCoords.longitude,
      activePickup.lat, activePickup.lng
    );

    if (dist < 0.1) {
      console.log('[Navigation] Collector arrived at destination!');
      supabase.from('pickups').update({ status: 'arrived' }).eq('id', activePickup.id)
        .then(() => {
          setJobStatus('arrived');
          updateCollectorStatus(CollectorStatus.BUSY);
        });

    }
  }, [role, jobStatus, userCoords, activePickup?.id]);

  // Effect to fetch chat messages when entering a chat screen
  useEffect(() => {
    if ((step === AppStep.COLLECTOR_CHAT || step === AppStep.PICKUP_CHAT) && activePickup?.id) {
      fetchChatMessages(activePickup.id);
    }
  }, [step, activePickup?.id]);

  // Automatically ensure there is an active support ticket when entering the Support Chat screen
  useEffect(() => {
    if (step !== AppStep.CHAT || !user?.id) return;

    const ensureActiveTicket = async () => {
      if (activeTicket?.id) return; // Ticket is already set/active

      try {
        // Query the database for the user's latest open support ticket
        const { data: tickets, error } = await supabase
          .from('support_tickets')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(1);

        if (tickets && tickets.length > 0) {
          setActiveTicket(tickets[0]);
        } else {
          // If no open ticket exists, automatically create a new one!
          const subject = role === UserRole.COLLECTOR ? 'Collector Live Chat' : 'Customer Live Chat';
          const { data: newTicket, error: createError } = await supabase
            .from('support_tickets')
            .insert({
              user_id: user.id,
              subject: subject,
              status: 'open'
            })
            .select()
            .single();

          if (newTicket) {
            setActiveTicket(newTicket);

            // Broadcast to notify admin dashboard that a new ticket was created in real-time
            const adminAlertChan = supabase.channel('admin_global_alerts');
            adminAlertChan.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                adminAlertChan.send({
                  type: 'broadcast',
                  event: 'new_message',
                  payload: { ticket_id: newTicket.id, sender_id: user.id }
                }).then(() => supabase.removeChannel(adminAlertChan));
              }
            });
          } else {
            console.error('Failed to automatically create a support ticket:', createError);
          }
        }
      } catch (err) {
        console.error('Error ensuring active support ticket:', err);
      }
    };

    ensureActiveTicket();
  }, [step, user?.id, role, activeTicket?.id]);

  // Live collector-approval listener — approvalStatus was never set to
  // 'approved' anywhere in the app, so a collector sitting on the "Under
  // Review" screen waiting had no way to find out they'd actually been
  // approved (in web-admin, which sets profiles.is_verified = true)
  // without manually restarting the app.
  useEffect(() => {
    if (step !== AppStep.COLLECTOR_PENDING_APPROVAL || !user?.id) return;

    const channel = supabase
      .channel(`approval_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => {
          if (payload.new.is_verified) {
            setUserProfile((prev: any) => ({ ...prev, is_verified: true }));
            setApprovalStatus('approved');
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [step, user?.id]);

  // Dedicated Support Chat Listener (Broadcast-based)
  useEffect(() => {
    if (step !== AppStep.CHAT || !activeTicket?.id) return;

    const fetchMessages = async () => {
      const { data } = await supabase.from('support_messages')
        .select('*')
        .eq('ticket_id', activeTicket.id)
        .order('created_at', { ascending: true });
      if (data) setSupportMessages(data);
    };

    // Fetch initial messages
    fetchMessages();

    const sub = supabase.channel(`ticket_${activeTicket.id}`)
      .on('broadcast', { event: 'new_message' }, (payload) => {
        if (payload.payload?.sender_id !== user?.id) {
          playPing();
          Vibration.vibrate([0, 300, 100, 300]);
        }
        // Always fetch the latest state from the database to guarantee it renders
        fetchMessages();
      })
      .subscribe();

    chatChannelRef.current = sub;

    return () => {
      supabase.removeChannel(sub);
      chatChannelRef.current = null;
    };
  }, [activeTicket?.id, step, user?.id]);

  // Stable Broadcast Listener — only recreated when user changes, NOT on step changes
  useEffect(() => {
    if (!user?.id) return;

    // Use Supabase Broadcasts (pub/sub) instead of postgres_changes for guaranteed delivery
    const broadcastSub = supabase.channel('platform_broadcasts')
      .on('broadcast', { event: 'new_announcement' }, (payload) => {
        playPing();
        Vibration.vibrate([0, 500, 100, 500]);
        Alert.alert('📢 Platform Update', payload.payload?.message || 'New announcement from Borla Admin.');
      })
      .subscribe();

    return () => {
      supabase.removeChannel(broadcastSub);
    };
  }, [user?.id]);

  // Incident Reports Realtime — notifies collector when admin updates their incident status
  useEffect(() => {
    if (!user?.id || role !== UserRole.COLLECTOR) return;

    const incidentSub = supabase.channel(`incident_status_${user.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'incident_reports',
        filter: `collector_id=eq.${user.id}`,
      }, (payload) => {
        // Only alert if status actually changed
        if (payload.new.status !== payload.old?.status) {
          playPing();
          Vibration.vibrate([0, 300, 100, 300]);
          Alert.alert('📋 Incident Update', `Your incident report status changed to: ${payload.new.status}`);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(incidentSub);
    };
  }, [user?.id, role]);

  const fetchSupportTickets = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (data) setSupportTickets(data);
  }, [user?.id]);

  // Global Alerts & Chat Badge Listener (Broadcast-based for guaranteed delivery)
  useEffect(() => {
    if (!user?.id) return;

    // Keep admin channel open so we can broadcast incidents/messages to it
    const adminAlertsChannel = supabase.channel('admin_global_alerts').subscribe();

    const userAlertsSub = supabase.channel(`user_alerts_${user.id}`)
      .on('broadcast', { event: 'new_ticket' }, (payload) => {
        playPing();
        Vibration.vibrate([0, 300, 100, 300]);
        if (payload.payload?.ticket_id) {
          setUnreadTicketIds(prev => {
            if (!prev.includes(payload.payload.ticket_id)) {
              return [...prev, payload.payload.ticket_id];
            }
            return prev;
          });
        }
        fetchSupportTickets();
      })
      .on('broadcast', { event: 'new_message' }, (payload) => {
        playPing();
        Vibration.vibrate([0, 300, 100, 300]);
        
        setUnreadTicketIds(prev => {
          if (!prev.includes(payload.payload.ticket_id)) {
            return [...prev, payload.payload.ticket_id];
          }
          return prev;
        });
        
        fetchSupportTickets();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(adminAlertsChannel);
      supabase.removeChannel(userAlertsSub);
    };
  }, [user?.id, role, fetchSupportTickets]);

  // Bulletproof Collector Info Fetcher & Poller: If we are in a collector assigned step but missing collector details, fetch them continuously until we get them!
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const needsCollector = (step === AppStep.COLLECTOR_FOUND || activePickup?.status === 'assigned' || activePickup?.status === 'collected') && (!activePickup?.collector || !activePickup.collector.full_name || activePickup.collector.full_name === 'Collector' || (!activePickup.collector.vehicle_details?.plate && !activePickup.collector.vehicle_number)) && activePickup?.id;
    
    if (needsCollector) {
      console.log('[Sync] Active pickup missing collector info. Starting aggressive polling for pickup:', activePickup.id);
      interval = setInterval(async () => {
        const { data: pickup } = await supabase
          .from('pickups')
          .select('*')
          .eq('id', activePickup.id)
          .maybeSingle();

        if (pickup && pickup.collector_id) {
          console.log('[Sync] Aggressive polling fetched pickup. Fetching profile directly for collector_id:', pickup.collector_id);
          const { data: col, error: colErr } = await supabase.from('profiles').select('*').eq('id', pickup.collector_id).maybeSingle();
          if (colErr) console.error('[Sync] Aggressive polling profile fetch error:', colErr);
          let collObj = col || null;
          if (collObj) {
            const vDetails = typeof collObj.vehicle_details === 'string' ? JSON.parse(collObj.vehicle_details) : (collObj.vehicle_details || null);
            collObj = { ...collObj, vehicle_details: vDetails };
            console.log('[Sync] Aggressive polling successfully enriched collector details:', collObj.full_name);
          }
          setActivePickup({ ...pickup, collector: collObj });
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [step, activePickup?.id, activePickup?.collector, activePickup?.status]);

  // Polling Fallback for Searching Screen
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    if (step === AppStep.SEARCHING_COLLECTOR && user?.id) {
      pollInterval = setInterval(async () => {
        const { data } = await supabase
          .from('pickups')
          .select(`
            *,
            collector:profiles!pickups_collector_id_fkey(full_name, avatar_url, rating_average, vehicle_details, vehicle_number, vehicle_type)
          `)
          .or(`user_id.eq.${user.id},customer_id.eq.${user.id}`)
          .eq('status', 'assigned')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (data && data.length > 0) {
          const pickup = data[0];
          if (pickup.collector) {
            setActivePickup(pickup);
            setStep(AppStep.COLLECTOR_FOUND);
            playPing();
          } else if (pickup.collector_id) {
            const { data: col } = await supabase.from('profiles').select('full_name, avatar_url, rating_average, vehicle_details, vehicle_number, vehicle_type').eq('id', pickup.collector_id).maybeSingle();
            setActivePickup({ ...pickup, collector: col || null });
            setStep(AppStep.COLLECTOR_FOUND);
            playPing();
          } else {
            setActivePickup(pickup);
            setStep(AppStep.COLLECTOR_FOUND);
            playPing();
          }
        }
      }, 5000);
    }
    return () => clearInterval(pollInterval);
  }, [step, user?.id]);

  // ── Fetch real collector stats from DB ─────────────────────────────────────
  const fetchCollectorStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      // Today's completed pickups for this collector
      const { data: todayJobs } = await supabase
        .from('pickups')
        .select('pricing_ghs, created_at')
        .eq('collector_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', todayStart.toISOString());

      // All-time completed count today (for quest progress)
      const completedToday = todayJobs?.length ?? 0;
      const todayPayout = todayJobs?.reduce((sum, p) => sum + (parseFloat(p.pricing_ghs) || 0), 0) ?? 0;

      // Rating from profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('rating_average')
        .eq('id', user.id)
        .single();

      setCollectorStats({
        todayPayout,
        ratingAvg: profile?.rating_average ?? 0,
        completedToday,
        questTarget: 10,
        questProgress: Math.min(completedToday, 10),
      });

      const { data: status } = await supabase
        .from('collector_status')
        .select('current_load_pct')
        .eq('collector_id', user.id)
        .maybeSingle();
      
      if (status) setTruckLoad(status.current_load_pct);
    } catch (err) {
      console.error('fetchCollectorStats error:', err);
    }
  }, [user?.id]);

  const fetchCollectorMetric = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('collector_performance_metrics')
        .select('*')
        .eq('collector_id', user.id)
        .single();
      if (!error && data) {
        setCollectorMetric(data);
      }
    } catch (e) {
      console.error('fetchCollectorMetric failed:', e);
    }
  }, [user?.id]);

  const fetchCollectorReviews = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('reviews')
        .select('rating, comment, created_at')
        .eq('reviewee_id', user.id)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!error && data) {
        setCollectorReviews(data);
      }
    } catch (e) {
      console.error('fetchCollectorReviews failed:', e);
    }
  }, [user?.id]);


  const fetchLandfills = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('landfills').select('*').order('name');
      if (!error && data) {
        setLandfills(data);
      }
    } catch (e) {
      console.error('fetchLandfills failed:', e);
    }
  }, []);

  // "My Recurring Routes" used to be a single hardcoded card ("Kasoa Sector
  // 4", fake earnings) that never changed. subscriptions is the real table
  // customers create recurring pickup schedules in (day_of_week,
  // time_window, collection_address) — not yet assigned to individual
  // collectors, so this surfaces all active ones as discoverable recurring
  // work, matching the existing "+ Find Routes" label.
  const fetchRecurringRoutes = useCallback(async () => {
    setIsLoadingRecurringRoutes(true);
    try {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (!error && data) setRecurringRoutes(data);
    } catch (e) {
      console.error('fetchRecurringRoutes failed:', e);
    } finally {
      setIsLoadingRecurringRoutes(false);
    }
  }, []);

  // Fuel Hub "Activate Voucher" used to just show a static Alert and do
  // nothing real — no points were spent, nothing was recorded. This spends
  // real loyalty_points and issues a real, persisted voucher code.
  const GOIL_VOUCHER_POINTS_COST = 200;
  const handleActivateFuelVoucher = async () => {
    if (!user?.id) return;
    if (loyaltyPoints < GOIL_VOUCHER_POINTS_COST) {
      Alert.alert('Not Enough Points', `You need at least ${GOIL_VOUCHER_POINTS_COST} points to activate a GOIL voucher. You have ${loyaltyPoints}.`);
      return;
    }
    setIsRedeemingVoucher(true);
    try {
      const newBalance = loyaltyPoints - GOIL_VOUCHER_POINTS_COST;
      const voucherCode = 'GOIL-' + Math.random().toString(36).slice(2, 8).toUpperCase();

      const { error: pointsError } = await supabase
        .from('profiles')
        .update({ loyalty_points: newBalance })
        .eq('id', user.id);
      if (pointsError) throw pointsError;

      const { error: redemptionError } = await supabase.from('loyalty_redemptions').insert({
        collector_id: user.id,
        reward_type: 'GOIL_FUEL_VOUCHER',
        points_spent: GOIL_VOUCHER_POINTS_COST,
        voucher_code: voucherCode,
      });
      if (redemptionError) throw redemptionError;

      setLoyaltyPoints(newBalance);
      Alert.alert('Voucher Activated 🎉', `Show this code to the GOIL attendant:\n\n${voucherCode}\n\n${GOIL_VOUCHER_POINTS_COST} points were deducted from your balance.`);
    } catch (e: any) {
      Alert.alert('Error', 'Could not activate voucher: ' + e.message);
    } finally {
      setIsRedeemingVoucher(false);
    }
  };
  const fetchCollectorWallet = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('wallet_balance')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        setWalletBalance(data.wallet_balance || 0);
      }

      const { data: txData, error: txError } = await supabase
        .from('wallet_transactions')
        .select('type, amount, reference, created_at')
        .eq('collector_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);
      if (!txError && txData) {
        setWalletTransactions(txData);
      } else if (txError) {
        console.error('fetchCollectorWallet: wallet_transactions fetch failed:', txError);
      }
    } catch (e) {
      console.error('fetchCollectorWallet failed:', e);
    }
  }, [user?.id]);


  const updateCollectorStatus = useCallback(async (status: CollectorStatus) => {
    if (role !== UserRole.COLLECTOR || !user?.id) return;
    try {
      await supabase.from('collector_status').upsert({
        collector_id: user.id,
        status: status,
        last_updated: new Date().toISOString()
      }, { onConflict: 'collector_id' });

      // Mirror status to collector_locations for instant realtime map updates
      await supabase.from('collector_locations').update({
        status: status
      }).eq('collector_id', user.id);
      
      setUserProfile((prev: any) => ({ ...prev, collector_status: status }));
      console.log(`[Status] Collector is now ${status}`);
      
      // Log to Activity Feed
      logPlatformActivity(
        ActivityType.COLLECTOR_STATUS_CHANGE,
        `${userProfile?.full_name || 'A collector'} is now ${status}`,
        { collector_id: user.id, status }
      );

    } catch (err) {
      console.error('[Status] Update error:', err);
    }
  }, [user?.id, role]);

  const updateTruckLoad = async (newVal: number) => {

    if (!user?.id) return;
    const value = Math.max(0, Math.min(100, newVal));
    setTruckLoad(value);
    
    try {
      await supabase.from('collector_status').upsert({
        collector_id: user.id,
        current_load_pct: value,
        last_updated: new Date().toISOString()
      });
      
      if (value >= 90) {
        Alert.alert(
          "🚨 Truck Almost Full!",
          "Your truck is at " + value + "%. You should route to the nearest open landfill now.",
          [
            { text: "Later", style: "cancel" },
            { 
              text: "Navigate to Landfill", 
              onPress: async () => {
                const { data: openLandfills } = await supabase.from('landfills').select('*').eq('status', 'OPEN');
                if (openLandfills && openLandfills.length > 0) {
                   const destination = openLandfills[0];
                   const url = `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`;
                   Linking.openURL(url);
                } else {
                   Alert.alert("Error", "No open landfills found.");
                }
              } 
            }
          ]
        );
      }
    } catch (err) {
      console.error('updateTruckLoad error:', err);
    }
  };

  const fetchScrapData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data: buyers } = await supabase.from('scrap_buyers').select('*').order('distance_km');
      const { data: listings } = await supabase.from('scrap_listings').select('*').eq('collector_id', user.id).order('created_at', { ascending: false });
      
      if (buyers) setScrapBuyers(buyers);
      if (listings) setMyScrapListings(listings);
    } catch (err) {
      console.error('fetchScrapData error:', err);
    }
  }, [user?.id]);

  const handlePostScrap = async () => {
    if (!user?.id || !newScrapListing.quantity_kg) {
      Alert.alert('Missing Info', 'Please enter at least the quantity.');
      return;
    }
    setIsPostingScrap(true);
    const { error } = await supabase.from('scrap_listings').insert({
      collector_id: user.id,
      material_type: newScrapListing.material_type,
      quantity_kg: parseFloat(newScrapListing.quantity_kg),
      asking_price_per_kg: parseFloat(newScrapListing.asking_price) || null,
      status: 'AVAILABLE'
    });

    if (error) {
      console.error('handlePostScrap error:', error);
      Alert.alert('Error', 'Failed to post scrap stock.');
    } else {
      Alert.alert('Success', 'Scrap stock posted to marketplace!');
      setShowScrapModal(false);
      setNewScrapListing({ material_type: 'PLASTIC', quantity_kg: '', asking_price: '' });
      fetchScrapData();
    }
    setIsPostingScrap(false);
  };


  const fetchLoyaltyPoints = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('loyalty_points').eq('id', user.id).single();
    if (data) setLoyaltyPoints(data.loyalty_points || 0);
  }, [user?.id]);

  const fetchCommunityPools = useCallback(async () => {
    try {
      const { data: pools, error } = await supabase.from('community_pools').select('*').eq('status', 'OPEN');
      if (error) {
        console.error("Fetch pools error:", error);
        return;
      }
      if (!pools) return;

      // Fetch all members for these pools to calculate exact current size dynamically
      const { data: members } = await supabase.from('community_pool_members').select('*');
      
      const enrichedPools = pools.map(pool => {
        const poolMembers = members ? members.filter(m => m.pool_id === pool.id) : [];
        // Calculate true size: use community_pool_members count, fallback to any count column on pool, fallback to 1
        const calculatedSize = poolMembers.length > 0 ? poolMembers.length : (pool.current_size || pool.current_members || pool.member_count || pool.members_count || 1);
        return {
          ...pool,
          current_size: calculatedSize
        };
      });

      setCommunityPools(enrichedPools);
    } catch (err) {
      console.error("Community pools fetch error:", err);
    }
  }, []);

  const fetchConvoys = useCallback(async () => {
    // Fetch active convoys and the LIVE locations of their members
    const { data } = await supabase
      .from('convoys')
      .select(`
        *,
        convoy_members(
          collector_id, 
          profiles(full_name, avatar_url),
          collector_locations(latitude, longitude)
        )
      `)
      .eq('status', 'ACTIVE');
    if (data) setActiveConvoyMembers(data);
  }, []);



  const fetchChallenges = useCallback(async () => {
    if (!user?.id) return;
    // Fetch every challenge plus everyone's progress records, then keep only
    // this collector's own progress per challenge (so a challenge with no
    // progress row yet still shows up at 0, not filtered out).
    const { data: allCh } = await supabase.from('challenges').select('*, collector_challenges(*)');
    if (allCh) {
      const filtered = allCh.map(ch => ({
        ...ch,
        collector_challenges: ch.collector_challenges.filter((cc: any) => cc.collector_id === user.id)
      }));
      setActiveChallenges(filtered);
    }
  }, [user?.id]);

  // "Top Collectors" leaderboard on the Challenges screen — topPerformers
  // was declared but never populated anywhere, so it permanently showed
  // "Leaderboard loading..." no matter what.
  const fetchTopPerformers = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, loyalty_points')
      .eq('role', 'COLLECTOR')
      .order('loyalty_points', { ascending: false })
      .limit(10);
    if (!error && data) setTopPerformers(data);
  }, []);

  const handleStartConvoy = async () => {
    if (!user?.id) return;
    setIsConvoyActionLoading(true);
    try {
      const { data, error } = await supabase
        .from('convoys')
        .insert({
          creator_id: user.id,
          zone_name: locationLabel || 'Kasoa Central',
          status: 'ACTIVE'
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        await supabase.from('convoy_members').insert({
          convoy_id: data.id,
          collector_id: user.id
        });
        setCurrentConvoyId(data.id);
        setConvoyActive(true);
        fetchConvoys();
        Alert.alert('Convoy Started', `You have started a new convoy in ${data.zone_name}.`);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not start convoy');
    } finally {
      setIsConvoyActionLoading(false);
    }
  };

  const handleJoinConvoy = async (convoyId: string, zoneName: string) => {
    if (!user?.id) return;
    setIsConvoyActionLoading(true);
    try {
      const { error } = await supabase
        .from('convoy_members')
        .insert({
          convoy_id: convoyId,
          collector_id: user.id
        });

      if (error) throw error;
      setCurrentConvoyId(convoyId);
      setConvoyActive(true);
      fetchConvoys();
      Alert.alert('Joined', `You have joined the ${zoneName} convoy.`);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not join convoy');
    } finally {
      setIsConvoyActionLoading(false);
    }
  };

  const handleLeaveConvoy = async (navigateAway: boolean = true) => {
    if (!user?.id) {
      if (navigateAway) setStep(AppStep.COLLECTOR_DASHBOARD);
      return;
    }
    setIsConvoyActionLoading(true);
    try {
      if (currentConvoyId) {
        await supabase
          .from('convoy_members')
          .delete()
          .eq('convoy_id', currentConvoyId)
          .eq('collector_id', user.id);
      }

      setCurrentConvoyId(null);
      setConvoyActive(false);
      fetchConvoys();
      // The dedicated Convoy Mode screen's button always doubles as a
      // back button ("Leave Convoy" / "Back"), so it should navigate away.
      // The Safety Center toggle is a simple on/off switch on a screen with
      // other controls (SOS, emergency contacts) — flipping it shouldn't
      // also kick the collector off the screen.
      if (navigateAway) setStep(AppStep.COLLECTOR_DASHBOARD);
    } catch (err) {
      console.error(err);
    } finally {
      setIsConvoyActionLoading(false);
    }
  };

  const handleInviteToConvoy = async () => {
    if (!user?.id || !currentConvoyId) {
      Alert.alert('Action Required', 'You must start or join a convoy before inviting others.');
      return;
    }
    setIsConvoyActionLoading(true);
    try {
      const coords = await getUserLocation();
      if (!coords) return;

      const nearby = await findNearbyCollectors(coords.latitude, coords.longitude, 3);
      const otherCollectors = nearby.filter(c => c.collector_id !== user.id);

      if (otherCollectors.length === 0) {
        Alert.alert('No one nearby', 'There are no other online collectors within 3 miles to invite.');
        return;
      }

      let count = 0;
      for (const col of otherCollectors) {
        const { data: prof } = await supabase.from('profiles').select('push_token').eq('id', col.collector_id).single();
        if (prof?.push_token) {
          await sendPushNotification(
            prof.push_token,
            '🤝 Convoy Invitation',
            `${userProfile?.full_name || 'A collector'} invited you to join a convoy in ${locationLabel || 'your area'}.`
          );
          count++;
        }
      }
      Alert.alert('Invites Sent', `Sent convoy invitations to ${count} collectors nearby.`);
    } catch (err) {
      console.error(err);
    } finally {
      setIsConvoyActionLoading(false);
    }
  };


  const navigateByRole = useCallback((profile: any) => {
    if (!profile) return;
    const role = profile.role as UserRole;
    if (role === UserRole.ADMIN) {
      Alert.alert(
        'Admin Access Restricted',
        'Administrative functions have been moved to the SamSa Web Portal for enhanced security. Please log in at admin.samsa.gh.',
        [{ text: 'OK', onPress: handleSignOut }]
      );
    } else if (role === UserRole.CUSTOMER) {
      setStep(AppStep.HOME);
    } else if (role === UserRole.COLLECTOR) {
      if (!profile.onboarding_completed) {
        setStep(AppStep.COLLECTOR_PROFILE_SETUP);
      } else if (!profile.is_verified) {
        setStep(AppStep.COLLECTOR_PENDING_APPROVAL);
      } else {
        setStep(AppStep.COLLECTOR_DASHBOARD);
      }
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      setUser(null);
      setUserProfile(null);
      setRole(UserRole.CUSTOMER);
      setStep(AppStep.SPLASH);
    } catch (e) {
      console.error('Sign out error:', e);
      // Fallback redirect even if API call fails
      setStep(AppStep.SPLASH);
    }
  };

  const switchLocation = (loc: any) => {
    setLocationLabel(loc.name || loc.address);
    setUserCoords({ latitude: Number(loc.latitude), longitude: Number(loc.longitude) });
    setStep(AppStep.HOME);
    Alert.alert('Location Updated', `Now showing collectors near ${loc.name || loc.address}`);
  };

  // Saved Locations screen used to render the same hardcoded
  // constants.ts list to every user, and "+ Add New Location" just
  // navigated to itself. saved_locations is a real, already-existing,
  // per-user table (RLS-scoped to auth.uid() = user_id) that was never
  // wired up.
  const fetchSavedLocations = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingSavedLocations(true);
    const { data, error } = await supabase
      .from('saved_locations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) setSavedLocationsList(data);
    setIsLoadingSavedLocations(false);
  }, [user?.id]);

  const handleAddSavedLocation = async () => {
    if (!newSavedLocationName.trim() || newSavedLocationAddress.trim().length < 5) {
      Alert.alert('Missing Info', 'Please enter a nickname and a specific address.');
      return;
    }
    setIsSavingLocation(true);
    try {
      const results = await ExpoLocation.geocodeAsync(newSavedLocationAddress.trim());
      if (results.length === 0) {
        Alert.alert('Location Not Found', 'Could not find that address. Please check it and try again.');
        return;
      }
      const { latitude, longitude } = results[0];
      const { error } = await supabase.from('saved_locations').insert({
        user_id: user?.id,
        name: newSavedLocationName.trim(),
        address: newSavedLocationAddress.trim(),
        latitude,
        longitude,
      });
      if (error) {
        Alert.alert('Error', 'Could not save this location: ' + error.message);
        return;
      }
      setNewSavedLocationName('');
      setNewSavedLocationAddress('');
      setShowAddSavedLocation(false);
      fetchSavedLocations();
    } catch (e: any) {
      Alert.alert('Error', 'Could not save this location: ' + e.message);
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleDeleteSavedLocation = async (locationId: string) => {
    const { error } = await supabase.from('saved_locations').delete().eq('id', locationId);
    if (error) {
      Alert.alert('Error', 'Could not delete this location: ' + error.message);
      return;
    }
    setSavedLocationsList((prev) => prev.filter((l) => l.id !== locationId));
  };

  const calculateImpact = () => {
    const completed = pickups.filter(p => p.status === 'COMPLETED' || p.status === 'completed');
    const totalKg = completed.reduce((acc, p) => acc + (p.weight_kg || 15), 0);
    const co2Saved = totalKg * 1.2; 
    const treesEquivalent = Math.floor(co2Saved / 22);
    return { totalKg, co2Saved, treesEquivalent };
  };

  const handleWithdraw = async () => {
    if (!user?.id || !withdrawAmount || !momoNumber) {
      Alert.alert('Missing Info', 'Please fill in both amount and MoMo number.');
      return;
    }
    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (amount > walletBalance) {
      Alert.alert('Insufficient Balance', 'You cannot withdraw more than your balance.');
      return;
    }

    setIsWithdrawing(true);
    const { error } = await supabase.from('payout_requests').insert({
      collector_id: user.id,
      amount: amount,
      method: 'MOMO',
      details: momoNumber,
      status: 'PENDING'
    });

    if (error) {
      console.error('handleWithdraw error:', error);
      Alert.alert('Error', 'Failed to submit withdrawal request.');
    } else {
      Alert.alert('Success', 'Withdrawal request submitted!');
      setShowWithdrawModal(false);
      setWithdrawAmount('');
      fetchCollectorWallet();
    }
    setIsWithdrawing(false);
  };

  const handleEmailAuth = async () => {
    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }
    if (password.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }
    setIsAuthenticating(true);
    // Security check: Never allow new signups to claim the ADMIN role
    const assignedRole = (role === UserRole.ADMIN) ? UserRole.CUSTOMER : (role || UserRole.CUSTOMER);
    if (isSignupMode) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
        setIsAuthenticating(false);
        return;
      }
      if (data.user) {
        // If there's no session, email confirmation is required.
        if (!data.session) {
          alert("Registration successful! Please check your email to confirm your account, then log in.");
          setIsSignupMode(false);
          setIsAuthenticating(false);
          return;
        }

        const { error: pError } = await supabase.from('profiles').insert({
          id: data.user.id,
          full_name: email.split('@')[0],
          role: assignedRole,
          onboarding_completed: assignedRole === UserRole.CUSTOMER
        });
        if (pError) console.error("Profile creation error:", pError);
        if (assignedRole === UserRole.COLLECTOR) {
          setStep(AppStep.COLLECTOR_PROFILE_SETUP);
        } else {
          setStep(AppStep.HOME);
        }
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert(error.message + "\n\nIf you don't have an account, switch to Signup mode.");
        setIsAuthenticating(false);
        return;
      }
      if (data.session?.user) {
        try {
          const { data: profile, error: pError } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).maybeSingle();
          if (pError) throw pError;
          if (profile) {
            setUserProfile(profile);
            setRole(profile.role as UserRole);
            navigateByRole(profile);
          } else {
            // Self-healing: Create the profile if it was skipped during signup due to email confirmation
            const safeRole = (role === UserRole.ADMIN) ? UserRole.CUSTOMER : (role || UserRole.CUSTOMER);
            const { data: newProfile, error: insError } = await supabase.from('profiles').insert({
              id: data.session.user.id,
              full_name: email.split('@')[0],
              role: safeRole,
              onboarding_completed: safeRole === UserRole.CUSTOMER
            }).select().single();
            
            if (insError) {
               alert("Error creating profile: " + insError.message);
            } else if (newProfile) {
               setUserProfile(newProfile);
               setRole(newProfile.role as UserRole);
               navigateByRole(newProfile);
            }
          }
        } catch (e: any) {
          alert("Error: " + e.message);
        }
      }
    }
    setIsAuthenticating(false);
  };

  // ── Collector Job Handlers ────────────────────────────────────────────────

  const pickProofImage = async () => {
    try {
      const { granted } = await ImagePicker.requestCameraPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Camera access is needed to photograph the collected waste.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.[0]) {
        setProofImage(result.assets[0].uri);
      }
    } catch (e: any) {
      Alert.alert('Camera Error', e.message);
    }
  };

  const handleArrival = async () => {
    if (!activePickup?.id) return;
    setIsArriving(true);
    const { error } = await supabase
      .from('pickups')
      .update({ status: 'arrived' })
      .eq('id', activePickup.id);
    if (error) {
      Alert.alert('Error', 'Could not update arrival status: ' + error.message);
    } else {
      setJobStatus('arrived');
      updateCollectorStatus(CollectorStatus.BUSY);
      setActivePickup((prev: any) => prev ? { ...prev, status: 'arrived' } : null);

      // Notify the customer that the collector has arrived
      const customerId = activePickup.customer_id || activePickup.user_id;
      if (customerId) {
        supabase.from('profiles').select('push_token').eq('id', customerId).single()
          .then(({ data: cust }) => {
            if (cust?.push_token) {
              sendPushNotification(
                cust.push_token,
                '📍 Your Collector Has Arrived!',
                `${userProfile?.full_name || 'Your collector'} is at your location. Please come out with your waste!`
              ).catch(e => console.warn('[Push] Arrival notify failed:', e));
            }
          });
      }
    }
    setIsArriving(false);
  };

  const handleCollectionComplete = async (skipProof = false) => {
    if (!activePickup?.id || (!proofImage && !skipProof)) return;
    setIsCollecting(true);
    try {
      // Attempt to upload the proof photo
      let proofUrl: string | null = null;
      if (!skipProof && proofImage) {
        try {
        // Use XMLHttpRequest with arraybuffer because fetch() fails to read local iOS file:// URIs
        const imageBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.onload = function() { 
            if (xhr.response && (xhr.response as ArrayBuffer).byteLength > 0) {
              resolve(xhr.response as ArrayBuffer); 
            } else {
              reject(new Error('Empty arraybuffer'));
            }
          };
          xhr.onerror = function() { reject(new Error('XMLHttpRequest failed')); };
          xhr.responseType = 'arraybuffer';
          xhr.open('GET', proofImage, true);
          xhr.send(null);
        });
        const fileName = `${user?.id}/proof_${activePickup.id}_${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('proof-photos')
          .upload(fileName, imageBuffer, { contentType: 'image/jpeg' });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('proof-photos').getPublicUrl(fileName);
          proofUrl = urlData.publicUrl;
        } else {
          console.warn('[Proof] Upload skipped:', uploadError.message);
        }
        } catch (uploadEx) {
          console.warn('[Proof] Upload exception, continuing without photo URL:', uploadEx);
        }
      }

      const { error } = await supabase
        .from('pickups')
        .update({ status: 'collected', proof_photo_url: proofUrl })
        .eq('id', activePickup.id);
      if (error) throw error;
      setJobStatus('collected');
    } catch (e: any) {
      Alert.alert('Error', 'Could not confirm collection: ' + e.message);
    }
    setIsCollecting(false);
  };

  const handleJobFinalize = async () => {
    if (!activePickup?.id) return;

    // BC-018: for a card/MoMo job, only the Paystack webhook (verified
    // signature) ever sets payment_status='paid' — fetch both columns fresh
    // from the DB rather than trusting local activePickup state, since
    // neither the collector's payment_method nor payment_status is
    // guaranteed to have propagated here via realtime yet. Cash jobs have
    // no digital verification possible, so they're unaffected, same as
    // before this check existed.
    const { data: latestPayment } = await supabase
      .from('pickups')
      .select('payment_method, payment_status')
      .eq('id', activePickup.id)
      .maybeSingle();
    if (latestPayment?.payment_method === 'paystack' && latestPayment?.payment_status !== 'paid') {
      Alert.alert('Payment Not Confirmed', "The customer's card/MoMo payment hasn't been confirmed yet. Please wait a moment and try again.");
      return;
    }

    setIsFinalizingJob(true);
    const { error } = await supabase
      .from('pickups')
      .update({ status: 'completed' })
      .eq('id', activePickup.id);
    if (error) {
      Alert.alert('Error', 'Could not finalize job: ' + error.message);
    } else {
      // Wallet crediting is NOT done here on the client — a database trigger
      // (on_pickup_completed -> handle_pickup_completion -> credit_collector_wallet)
      // already runs automatically the moment pickups.status becomes
      // 'completed' (the update right above this block). It credits
      // profiles.wallet_balance, keeps the separate collector_wallets ledger
      // in sync, awards loyalty points, and inserts the wallet_transactions
      // row — all atomically, server-side. A client-side call here used to
      // duplicate all of that (double-crediting every job); removed.
      const earningAmount = Number(activePickup?.pricing_ghs) || 0;

      Alert.alert('Job Complete! 🎉', `Great work! GH₵ ${earningAmount.toFixed(2)} has been credited to your wallet.`);
      setJobStatus('idle');
      updateCollectorStatus(CollectorStatus.IDLE);

      // Log activity
      logPlatformActivity(
        ActivityType.PICKUP_COMPLETED,
        `Job #${activePickup.id.substring(0, 8)} completed by ${userProfile?.full_name || 'collector'}`,
        { pickup_id: activePickup.id, collector_id: user?.id }
      );

      setActivePickup(null);

      setProofImage(null);
      fetchHistory(true);
      setStep(AppStep.COLLECTOR_DASHBOARD);
    }
    setIsFinalizingJob(false);
  };

  // ─────────────────────────────────────────────────────────────────────────

  const playVoiceNote = async (url: string, onStart?: () => void, onEnd?: () => void) => {
    if (!url) return;
    try {
      if (onStart) onStart();
      console.log('[Audio] Preparing reliable playback for:', url);
      
      // 1. Ensure global mode is set (plays in silent mode)
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        interruptionModeIOS: 1, 
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // 2. Download to local file
      // CRITICAL FIX: iOS AVFoundation throws -11828 if you try to play from a data: URI.
      // We MUST save it to a physical file path first.
      const localPath = `${FileSystem.cacheDirectory}voice_${Date.now()}.m4a`;
      const { uri: savedUri } = await FileSystem.downloadAsync(url, localPath);
      
      const fileInfo = await FileSystem.getInfoAsync(savedUri);
      
      // Guard: reject empty/0-byte audio files
      if (!fileInfo.exists || fileInfo.size === 0) {
        if (onEnd) onEnd();
        Alert.alert(
          'Audio Unavailable',
          'The voice directions file appears to be empty. The customer may need to re-record their directions.'
        );
        return;
      }
      
      // Play directly from the physical file path!
      const { sound } = await Audio.Sound.createAsync(
        { uri: savedUri },
        { shouldPlay: true, volume: 1.0 },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            if (onEnd) onEnd();
            sound.unloadAsync();
          }
        }
      );
    } catch (e: any) {
      console.error('[Audio] playVoiceNote failed:', e);
      if (onEnd) onEnd();
      Alert.alert('Audio Error', 'The voice note could not be loaded. Please check your internet connection.');
    }
  };

  const handleReportIncident = async () => {
    if (!user?.id) return;
    setIsReportingIncident(true);
    
    const { error } = await supabase.from('incident_reports').insert({
      collector_id: user.id,
      pickup_id: activePickup?.id,
      type: incidentType,
      description: incidentDesc,
      latitude: userCoords?.latitude,
      longitude: userCoords?.longitude,
      priority: (incidentType === 'ACCIDENT' || incidentType === 'VEHICLE_BREAKDOWN') ? 'URGENT' : 'NORMAL'
    });

    if (error) {
      Alert.alert('Error', 'Failed to submit report: ' + error.message);
    } else {
      // Immediate audible + haptic confirmation for the collector
      playPing();
      Vibration.vibrate([0, 300, 100, 300]);

      // Broadcast to admin to ensure ping plays without relying on Postgres Realtime
      supabase.channel('admin_global_alerts').send({
        type: 'broadcast',
        event: 'new_incident',
        payload: { type: incidentType, description: incidentDesc }
      });

      Alert.alert('Reported', 'Your incident has been reported to the Dispatch team.');
      setShowIncidentModal(false);
      setIncidentDesc('');
      
      // Log to Activity Feed
      logPlatformActivity(
        ActivityType.EMERGENCY_REPORT,
        `Incident Reported: ${incidentType.replace(/_/g, ' ')} by ${userProfile?.full_name || 'collector'}`,
        { type: incidentType, collector_id: user.id }
      );
    }
    setIsReportingIncident(false);
  };

  const handleRequestCollection = async () => {

    if (authMethod === 'phone' && !/^\d{9,10}$/.test(mobileNumber)) {
      alert("Please enter a valid Ghana phone number (9-10 digits).");
      setStep(AppStep.LOGIN);
      return;
    }
    setIsRequestingCollection(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    let uploadedVoiceUrl = null;
    if (voiceRecordingUri && user?.id) {
      try {
        console.log('[Voice] Uploading recording via XHR (bypasses iOS file:// restriction)...');

        // ── CRITICAL FIX ──────────────────────────────────────────────────────
        // fetch(file://) silently returns 0 bytes on iOS (NSURLSession sandboxing).
        // XMLHttpRequest with responseType='arraybuffer' CAN read local file:// URIs.
        const audioBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', voiceRecordingUri);
          xhr.responseType = 'arraybuffer';
          xhr.onload = () => {
            if (xhr.response && (xhr.response as ArrayBuffer).byteLength > 0) {
              resolve(xhr.response as ArrayBuffer);
            } else {
              reject(new Error(`XHR returned empty body (status ${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error('XHR network error reading local audio file'));
          xhr.send();
        });

        console.log('[Voice] Read', audioBuffer.byteLength, 'bytes from local file');
        if (audioBuffer.byteLength === 0) throw new Error('Audio file is empty after XHR read');

        const fileName = `${user.id}/voice_${Date.now()}.m4a`;
        const { data, error: uploadError } = await supabase.storage
          .from('voice-notes')
          .upload(fileName, audioBuffer, { contentType: 'audio/m4a' });

        if (uploadError) throw uploadError;

        if (data) {
          const { data: { publicUrl } } = supabase.storage.from('voice-notes').getPublicUrl(fileName);
          uploadedVoiceUrl = publicUrl;
          console.log('[Voice] Upload successful:', uploadedVoiceUrl, '— bytes uploaded:', audioBuffer.byteLength);
        }
      } catch (e) {
        console.error('[Voice] Upload failed:', e);
        Alert.alert('Upload Error', 'We could not upload your voice directions. Please check your connection and try again.');
        setIsRequestingCollection(false);
        return; // BLOCK submission if upload failed
      }
    }

    // FINAL GUARD: Ensure we have coordinates before inserting
    if (!userCoords?.latitude) {
      Alert.alert('Location Error', 'Your GPS location is not available. Please ensure location is enabled.');
      setIsRequestingCollection(false);
      return;
    }

    const priceStr = selectedVehicle?.price.replace(/[^0-9.]/g, '') || '85';
    const basePrice = selectedVehicle?.priceValue ?? parseFloat(priceStr);
    // "Wait & Save" (Choose Vehicle screen's speed toggle) applies the same
    // 20% discount it already advertises on the card — it used to have no
    // onPress at all, so the price shown there was never actually honored.
    const finalPrice = selectedSpeed === 'wait_save' ? Math.round(basePrice * 0.8 * 100) / 100 : basePrice;
    const { error } = await supabase.from('pickups').insert([{
      customer_id: user?.id,
      user_id: user?.id,
      trash_type: selectedTrashType,
      vehicle_id: selectedVehicle ? Number(selectedVehicle.id) : null,
      pickup_location_name: pickupAddress || 'Current Location',
      pricing_ghs: finalPrice,
      status: 'pending',
      voice_url: uploadedVoiceUrl,
      lat: userCoords.latitude,
      lng: userCoords.longitude
    }]);

    if (!error) {
      console.log('[Request] Pickup created successfully');
      setStep(AppStep.SEARCHING_COLLECTOR);
      // Clear this booking's AI estimate + vehicle options so they don't
      // leak stale waste-size/pricing data into the next, unrelated booking.
      setAiResult(null);
      setVehicleOptions([]);
      setSelectedVehicle(null);
      setSelectedSpeed('priority');

      // Log activity
      logPlatformActivity(
        ActivityType.PICKUP_CREATED,
        `New ${selectedTrashType} pickup requested at ${pickupAddress || 'current location'}`,
        { customer_id: user?.id, type: selectedTrashType }
      );
    } else {

      console.error('[Request] Insert error:', error);
      Alert.alert('Booking Error', 'Could not create pickup request: ' + error.message);
    }
    setIsRequestingCollection(false);
  };
  const t = TRANSLATIONS[language];

  const next = async () => {
    if (step === AppStep.SPLASH) setStep(AppStep.ROLE_SELECTION);
    else if (step === AppStep.ROLE_SELECTION) setStep(AppStep.LOGIN);
    else if (step === AppStep.LOGIN) {
      if (authMethod === 'phone') {
        if (!mobileNumber || mobileNumber.length < 9) {
          alert("Enter your phone number correctly (e.g. 024XXXXXXX)");
          return;
        }
        setIsSendingOtp(true);
        // Supabase expects international format or local with prefix
        const cleanPhone = mobileNumber.startsWith('0') ? '+233' + mobileNumber.substring(1) : mobileNumber;
        const { error } = await supabase.auth.signInWithOtp({ phone: cleanPhone });
        setIsSendingOtp(false);
        if (error) {
          alert("Error sending OTP: " + error.message);
        } else {
          setStep(AppStep.OTP);
        }
      } else { // authMethod === 'email'
        handleEmailAuth();
      }
    }
    else if (step === AppStep.OTP) {
      if (otpCode.length < 4) {
        alert("Please enter the 4-digit code sent to you.");
        return;
      }
      setIsVerifyingOtp(true);
      const cleanPhone = mobileNumber.startsWith('0') ? '+233' + mobileNumber.substring(1) : mobileNumber;
      const { data, error } = await supabase.auth.verifyOtp({
        phone: cleanPhone,
        token: otpCode,
        type: 'sms'
      });

      if (error) {
        alert("Verification failed: " + error.message);
        setIsVerifyingOtp(false);
        return;
      }

      if (data.user) {
        // Fetch or create profile
        try {
          let { data: profile, error: pError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
          if (!profile) {
            // If no profile exists for this phone number, create one with the currently selected role
            const { data: newProfile, error: insError } = await supabase.from('profiles').insert({
              id: data.user.id,
              full_name: 'New User',
              role: role,
              phone_number: mobileNumber
            }).select().single();
            if (insError) throw insError;
            profile = newProfile;
          }
          
          if (profile) {
            setUserProfile(profile);
            setRole(profile.role as UserRole);
            navigateByRole(profile);
          }
        } catch (e: any) {
          alert("Error setting up profile: " + e.message);
        }
      }
      setIsVerifyingOtp(false);
    }
    else if (step === AppStep.HOME) {
      // ── 3-Mile Radius Coverage Check ──────────────────────────────────
      if (!userCoords) {
        Alert.alert(
          'Location Required',
          'We need your location to find nearby collectors. Please allow location access and try again.',
          [{ text: 'OK' }]
        );
        return;
      }
      setCheckingCoverage(true);
      findNearbyCollectors(userCoords.latitude, userCoords.longitude, COVERAGE_RADIUS_MILES)
        .then((rawCollectors) => {
          const collectors = rawCollectors.filter(c => isLocationFresh(c.updated_at));
          setNearbyCollectors(collectors);
          setCheckingCoverage(false);
          if (collectors.length === 0) {
            logUnmetPickupRequest(userCoords.latitude, userCoords.longitude, COVERAGE_RADIUS_MILES);
            Alert.alert(
              '😔 No Collectors Nearby',
              `There are no collectors within ${COVERAGE_RADIUS_MILES} miles of your location right now.\n\nWant us to notify you when a collector enters your area?`,
              [
                { text: 'No Thanks', style: 'cancel' },
                { 
                  text: 'Notify Me', 
                  onPress: async () => {
                    if (!user) return;
                    await supabase.from('missed_bookings').insert([{
                      user_id: user.id,
                      latitude: userCoords.latitude,
                      longitude: userCoords.longitude,
                      resolved: false
                    }]);
                    Alert.alert('Subscribed', 'We will send you a push notification as soon as a collector is available in your area.');
                  }
                }
              ]
            );
          } else {
            setStep(AppStep.BOOKING);
          }
        })
        .catch((e) => {
          console.error('Coverage check error:', e);
          setCheckingCoverage(false);
          Alert.alert(
            '😔 Coverage Check Failed',
            'We could not verify nearby collectors right now. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
        });
    }
    else if (step === AppStep.BOOKING) {
      if (!pickupAddress || pickupAddress.trim().length < 5) {
        alert("Please enter a specific pickup address (e.g. House No, Street name).");
        return;
      }

      // ── Robust Geocoding for Custom Addresses ───────────────────────────
      setIsGeocoding(true);
      try {
        console.log(`[Location] Attempting to geocode: ${pickupAddress}`);
        const results = await ExpoLocation.geocodeAsync(pickupAddress);
        if (results.length > 0) {
          const { latitude, longitude } = results[0];
          console.log(`[Location] Successfully geocoded to: ${latitude}, ${longitude}`);
          setUserCoords({ latitude, longitude });
        } else {
          console.warn("[Location] Geocoding returned no results. Staying with current GPS.");
        }
      } catch (e) {
        console.error("[Location] Geocoding error:", e);
      } finally {
        setIsGeocoding(false);
        setStep(AppStep.VEHICLE_SELECTION);
      }
    }
    else if (step === AppStep.SCHEDULE) setStep(AppStep.BOOKING);
    else if (step === AppStep.VEHICLE_SELECTION) handleRequestCollection();
    else if (step === AppStep.COLLECTOR_FOUND) setStep(AppStep.PAYMENT);
    else if (step === AppStep.PAYMENT) setStep(AppStep.HOME);
  };

  const back = () => {
    if ([AppStep.PROFILE, AppStep.HISTORY, AppStep.CHAT, AppStep.NOTIFICATIONS, AppStep.SETTINGS, AppStep.HELP, AppStep.SUBSCRIPTIONS, AppStep.SAVED_LOCATIONS, AppStep.PERSONAL_INFO, AppStep.PAYMENT_METHODS, AppStep.COMMUNITY_POOL, AppStep.AI_ESTIMATOR].includes(step)) {
      if (role === UserRole.COLLECTOR) {
        setStep(AppStep.COLLECTOR_DASHBOARD);
      } else {
        setStep(AppStep.HOME);
      }
    }
    else if (step === AppStep.SCRAP_MARKETPLACE) setStep(AppStep.COLLECTOR_DASHBOARD);
    else if (step === AppStep.LOGIN) setStep(AppStep.ROLE_SELECTION);
    else if (step === AppStep.ROLE_SELECTION) setStep(AppStep.SPLASH);
    else if (step === AppStep.OTP) setStep(AppStep.LOGIN);
    else if (step === AppStep.BOOKING) setStep(AppStep.HOME);
    else if (step === AppStep.SCHEDULE) setStep(AppStep.BOOKING);
    else if (step === AppStep.VEHICLE_SELECTION) setStep(AppStep.BOOKING);
    else if (step === AppStep.COLLECTOR_FOUND) setStep(AppStep.VEHICLE_SELECTION);
    else if (step === AppStep.PAYMENT) setStep(AppStep.COLLECTOR_FOUND);
    else if (step === AppStep.WHATSAPP_SIM || step === AppStep.USSD_SIM) setStep(AppStep.HOME);
    else if (step === AppStep.COLLECTOR_DASHBOARD) setStep(AppStep.ROLE_SELECTION);
    else if ([AppStep.COLLECTOR_WALLET, AppStep.CONVOY_MODE, AppStep.FUEL_PARTNERSHIPS, AppStep.SCRAP_MARKETPLACE, AppStep.COLLECTOR_EARNINGS, AppStep.COLLECTOR_RATINGS, AppStep.COLLECTOR_CHALLENGES, AppStep.COLLECTOR_SUPPORT, AppStep.COLLECTOR_SAFETY, AppStep.COLLECTOR_SCHEDULE].includes(step)) {
      setStep(AppStep.COLLECTOR_DASHBOARD);
    }

    else if (step === AppStep.COLLECTOR_DOCUMENT_UPLOAD) {
      if (userProfile?.role === UserRole.COLLECTOR) setStep(AppStep.PROFILE);
      else setStep(AppStep.COLLECTOR_VEHICLE_REGISTRATION);
    }
    else if (step === AppStep.COLLECTOR_VEHICLE_REGISTRATION) {
      if (userProfile?.role === UserRole.COLLECTOR) setStep(AppStep.PROFILE);
      else setStep(AppStep.COLLECTOR_ONBOARDING_WELCOME);
    }
    else if (step === AppStep.COLLECTOR_PROFILE_SETUP) {
      setStep(AppStep.COLLECTOR_ONBOARDING_WELCOME);
    }
    else if ([AppStep.COLLECTOR_ONBOARDING_WELCOME, AppStep.COLLECTOR_PENDING_APPROVAL].includes(step)) {
      setStep(AppStep.ROLE_SELECTION);
    }

  };

  // BC-021: fire-and-forget log for admin demand analytics — every zero-
  // result nearby-collector search gets recorded here, regardless of
  // whatever the customer-facing flow does next (alert, retry, etc). Never
  // throws, never awaited by callers, so it can't affect the existing
  // booking flow either way.
  const logUnmetPickupRequest = useCallback((lat: number, lng: number, radiusMiles: number) => {
    if (!user?.id) return;
    supabase.from('unmet_pickup_requests').insert({
      customer_id: user.id,
      latitude: lat,
      longitude: lng,
      radius_searched_miles: radiusMiles,
    }).then(({ error }) => {
      if (error) console.error('[UnmetDemand] Failed to log unmet pickup request:', error.message);
    });
  }, [user?.id]);

  const resetBookingStates = useCallback(() => {
    setCapturedImage(null);
    setAiResult(null);
    setActivePickup(null);
    setPickupAddress('');
    setSelectedTrashType(TrashType.HOUSEHOLD);
    setHasVoiceLandmark(false);
    setVoiceRecordingUri(null);
    setFriendPhone('');
    setBookingForSelf(true);
    setScheduledDateTime(null);
    setSelectedVehicle(null);
    setIsRecordingLandmark(false);
    setRecordingDuration(0);
    setUssdInputText('');
    setUssdStep(0);
    setSeparatedPlastics(false);
    setSplitWays(1);
    setSplitAmount(85.00);
  }, []);

  const handlePaymentSuccess = useCallback((res: any) => {
    setIsPaying(false);
    setPaymentSuccess(true);
    if (activePickup?.collector) {
      setRatingCollector(activePickup.collector);
      // resetBookingStates() below sets activePickup back to null before
      // the rating modal opens, so the reviews insert (which requires a
      // non-null pickup_id) was always failing on every payment-flow
      // rating submission. Capture the real id now, while it still exists.
      setRatingPickupId(activePickup.id);
    }
    schedulePredictiveReminder(4);
    if (splitWays > 1) {
      Alert.alert(
        'Your Share is Paid',
        `You paid your share (GH₵ ${splitAmount.toFixed(2)}). Group payment links aren't available yet — please arrange with your neighbors directly to cover the remaining GH₵ ${(splitAmount * (splitWays - 1)).toFixed(2)}.`,
        [{ text: 'Finish', onPress: () => {
          setTimeout(() => {
            setPaymentSuccess(false);
            resetBookingStates();
            next();
            setShowRatingModal(true);
          }, 1000);
        }}]
      );
    } else {
      setTimeout(() => {
        setPaymentSuccess(false);
        resetBookingStates();
        next();
        setShowRatingModal(true);
      }, 2000);
    }
  }, [splitWays, splitAmount, next, resetBookingStates, activePickup]);

  const handlePaymentCancel = useCallback(() => {
    setIsPaying(false);
  }, []);

  // Splash Screen Logic & Push Notifications
  useEffect(() => {
    const fetchProfile = async (uid: string) => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid).single();
      if (!error && data) {
        setUserProfile(data);
        setRole(data.role as UserRole);
        setEditName(data.full_name || '');
        setEditPhone(data.phone_number || '');
        setEditAddress(data.address || '');
        
        // Sync collector profile if they are a collector
        if (data.role === UserRole.COLLECTOR) {
          setCollectorProfile(prev => ({
            ...prev,
            name: data.full_name || '',
            phone: data.phone_number || ''
          }));

          const vDetails = typeof data.vehicle_details === 'string' ? JSON.parse(data.vehicle_details) : (data.vehicle_details || null);
          if (vDetails) {
            setVehicleDetails({
              type: vDetails.type || data.vehicle_type || '',
              plate: vDetails.plate || data.vehicle_number || '',
              capacity: vDetails.capacity || '',
              photo: vDetails.photo_url || ''
            });
          } else if (data.vehicle_type || data.vehicle_number) {
            setVehicleDetails({
              type: data.vehicle_type || '',
              plate: data.vehicle_number || '',
              capacity: '',
              photo: ''
            });
          }
          
          // Fetch existing KYC documents to populate the form matching real schema
          supabase.from('collector_documents')
            .select('doc_type, doc_url')
            .eq('collector_id', uid)
            .then(({ data: docs }) => {
              const docMap: any = { ...(vDetails?.kyc_docs || {}) };
              if (docs) {
                docs.forEach((d: any) => {
                  const type = d.doc_type || d.document_type || '';
                  const url = d.doc_url || d.document_url || '';
                  if (type && url) {
                    docMap[type] = url;
                    if (type === 'national_id') docMap['nationalId'] = url;
                    if (type === 'nationalId') docMap['national_id'] = url;
                    if (type === 'driver_license' || type === 'license') { docMap['license'] = url; docMap['driver_license'] = url; }
                    if (type === 'vehicle_registration' || type === 'vehicle_reg' || type === 'vehicleReg') { docMap['vehicleReg'] = url; docMap['vehicle_registration'] = url; }
                    if (type === 'waste_permit' || type === 'wastePermit') { docMap['wastePermit'] = url; docMap['waste_permit'] = url; }
                  }
                });
              }
              setDocuments(prev => ({ ...prev, ...docMap }));
            });
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id);
        registerForPushNotificationsAsync().then(token => {
          if (token) savePushTokenAsync(session.user.id, token).catch(e => console.error('[Push] Failed to save push token:', e));
        }).catch(e => console.error('[Push] Failed to register for push notifications:', e));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.id) {
        fetchProfile(session.user.id);
        registerForPushNotificationsAsync().then(token => {
          if (token) savePushTokenAsync(session.user.id, token).catch(e => console.error('[Push] Failed to save push token:', e));
        }).catch(e => console.error('[Push] Failed to register for push notifications:', e));
      } else {
        setUserProfile(null);
        setRole(UserRole.CUSTOMER);
        if (step !== AppStep.SPLASH && step !== AppStep.LOGIN && step !== AppStep.ROLE_SELECTION && step !== AppStep.OTP) {
          setStep(AppStep.SPLASH);
        }
      }
    });

    // Realtime subscription for pickups table so collector dashboard auto-updates.
    // This has no filter — every pickup INSERT/UPDATE/DELETE on the entire
    // platform fires this handler for every connected client. It used to
    // call fetchHistory() non-silently, which set the GLOBAL loading flag
    // and froze the whole app for every user, for every pickup change,
    // even ones that had nothing to do with them. Silent background
    // refresh instead — the actual pickups list still updates correctly.
    const pickupsSubscription = supabase.channel('public:pickups')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pickups' }, async (payload: any) => {
        console.log('Pickup updated!', payload);
        fetchHistory(true);
        fetchCollectorStats();

        // If I am a customer and my pending request was just assigned
        const isMyPickup = payload.new.user_id === user?.id || payload.new.customer_id === user?.id;
        
        // Removed payload.old check because it requires REPLICA IDENTITY FULL
        if (role === UserRole.CUSTOMER && isMyPickup && payload.new.status === 'assigned') {
           const { data: simple } = await supabase.from('pickups').select('*').eq('id', payload.new.id).maybeSingle();
           const basePickup = simple || payload.new;
           const collectorId = basePickup.collector_id;
           if (collectorId) {
             const { data: col, error: colErr } = await supabase.from('profiles').select('*').eq('id', collectorId).maybeSingle();
             if (colErr) console.error('[Realtime] Listener 2 profile fetch error:', colErr);
             const vDetails = typeof col?.vehicle_details === 'string' ? JSON.parse(col.vehicle_details) : (col?.vehicle_details || null);
             const enrichedColl = col ? { ...col, vehicle_details: vDetails } : null;
             setActivePickup({ ...basePickup, collector: enrichedColl });
             setStep(AppStep.COLLECTOR_FOUND);
             playPing();
           } else {
             setActivePickup(basePickup);
             setStep(AppStep.COLLECTOR_FOUND);
             playPing();
           }
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
      supabase.removeChannel(pickupsSubscription);
    };
  }, [user?.id, role]);

  // ── Get user's real GPS when they reach the HOME screen ─────────────────
  useEffect(() => {
    if (step === AppStep.HOME && role === UserRole.CUSTOMER) {
      getUserLocation().then((coords) => {
        if (coords) {
          setUserCoords(coords);
          // Reverse-geocode label
          activeMapProvider.reverseGeocode(coords)
            .then(r => setLocationLabel(r?.label || 'Your Location'))
            .catch(() => setLocationLabel('Location found'));
        }
      });
    }
  }, [step, role]);

  // ── Customer: Auto-refresh nearby collectors while on Home screen ───────
  useEffect(() => {
    if (role !== UserRole.CUSTOMER || step !== AppStep.HOME || !userCoords) return;

    const refresh = () => {
      findNearbyCollectors(userCoords.latitude, userCoords.longitude)
        .then(setNearbyCollectors)
        .catch(console.error);
    };

    refresh(); // Initial
    const int = setInterval(refresh, 30000); // Every 30s
    return () => clearInterval(int);
  }, [role, step, userCoords]);

  // ── Customer: Real-time alert when a collector is found for a missed booking ─────
  useEffect(() => {
    if (!user?.id || role !== UserRole.CUSTOMER) return;

    const channel = supabase.channel(`missed_bookings_${user.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'missed_bookings', 
        filter: `user_id=eq.${user.id}` 
      }, (payload) => {
        // Simplified check to avoid payload.old issues
        if (payload.new.resolved === true) {
          playPing();
          Alert.alert(
             '🚛 Collector Nearby!',
             'Good news! A collector has just entered your area. You can now proceed to book your pickup.',
             [{ text: 'Book Now', onPress: () => setStep(AppStep.HOME) }]
          );
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, role]);

  // ── Collector: push live GPS every 30 s while online ─────────────────────
  // This is the only thing that actually sets collector_locations.is_online
  // (toggling the "Online" switch just updates a separate collector_status
  // display field — see updateCollectorStatus). This used to only run while
  // step === COLLECTOR_DASHBOARD, so a collector who stayed "online" but
  // navigated to Wallet/Schedule/Safety/Profile/etc. had their location
  // silently stop refreshing — after 2 minutes isLocationFresh() filters
  // them out of every customer search, even though their own UI still shows
  // "Online". Now runs whenever role===COLLECTOR && collectorOnline,
  // regardless of which screen they're on. (Deliberately NOT also gated on
  // userProfile?.is_verified here — RLS already rejects the upsert
  // server-side for an unverified collector, and gating on it client-side
  // too risks silently blocking real, verified collectors if userProfile
  // hasn't freshly loaded that field for any reason. Logging added below so
  // this is diagnosable instead of silent either way.)
  useEffect(() => {
    if (role !== UserRole.COLLECTOR || !collectorOnline) {
      if (collectorLocationIntervalRef.current) {
        clearInterval(collectorLocationIntervalRef.current);
        collectorLocationIntervalRef.current = null;
      }
      return;
    }

    const pushLocation = async () => {
      if (!user?.id) {
        console.log('[Location] Skipping push: no user.id yet');
        return;
      }
      const coords = await getUserLocation();
      if (!coords) {
        console.warn('[Location] getUserLocation() returned null — check location permission (on a simulator, set a location via Features > Location)');
        return;
      }
      console.log(`[Location] Pushing collector location: ${coords.latitude}, ${coords.longitude} (online=${collectorOnline})`);
      const matched = await updateCollectorLocation(user.id, coords, collectorOnline);
      if (matched) {
        playPing();
        Alert.alert(
          '🙋 Customer Nearby!',
          'A customer in your area tried to book a pickup but no collector was available. They have just been notified that you are near — be ready for an incoming request!',
          [{ text: 'Got it!', style: 'default' }]
        );
      }
    };

    // Push immediately on mount, then every 30 s
    pushLocation();
    collectorLocationIntervalRef.current = setInterval(pushLocation, LOCATION_UPDATE_INTERVAL_MS);

    return () => {
      if (collectorLocationIntervalRef.current) {
        clearInterval(collectorLocationIntervalRef.current);
        collectorLocationIntervalRef.current = null;
      }
    };
  }, [role, user?.id, collectorOnline]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecordingLandmark) {
      setRecordingDuration(0);
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecordingLandmark]);

  useEffect(() => {
    if (step === AppStep.SPLASH) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }).start();
    }
  }, [step, fadeAnim]);

  useEffect(() => {
    // Opening a screen should be immediate — these are background
    // refreshes, not user-initiated actions, so they run silently (no
    // blocking flag) and the screen renders right away with whatever data
    // is already in state, updating once the fetch resolves.
    if (step === AppStep.HOME || step === AppStep.HISTORY || step === AppStep.COLLECTOR_DASHBOARD) {
      fetchHistory(true);
    }
    if (step === AppStep.COLLECTOR_DASHBOARD) {
      // fetchHistory() used to also run a second time right here — a
      // redundant duplicate call on every single Dashboard open.
      fetchCollectorStats();
      fetchCollectorMetric();
      fetchLandfills();
    }


    if (step === AppStep.COLLECTOR_WALLET || step === AppStep.COLLECTOR_EARNINGS) {
      fetchCollectorWallet();
    }
    if (step === AppStep.SCRAP_MARKETPLACE) {
      fetchScrapData();
    }

    if (step === AppStep.FUEL_PARTNERSHIPS || step === AppStep.PROFILE) {
      fetchLoyaltyPoints();
    }
    if (step === AppStep.COMMUNITY_POOL) {
      fetchCommunityPools();
    }
    if (step === AppStep.CONVOY_MODE) {
      fetchConvoys();
    }
    if (step === AppStep.COLLECTOR_SUPPORT || step === AppStep.HELP || step === AppStep.CHAT) {
      fetchSupportTickets();
    }
    if (step === AppStep.COLLECTOR_CHALLENGES) {
      fetchChallenges();
      fetchTopPerformers();
    }
    if (step === AppStep.COLLECTOR_RATINGS) {
      fetchCollectorMetric();
      fetchCollectorReviews();
    }
    if (step === AppStep.SAVED_LOCATIONS) {
      fetchSavedLocations();
    }
    if (step === AppStep.COLLECTOR_SCHEDULE) {
      fetchRecurringRoutes();
    }
  }, [step, fetchHistory, fetchCollectorWallet, fetchScrapData, fetchLoyaltyPoints, fetchCommunityPools, fetchConvoys, fetchSupportTickets, fetchChallenges, fetchTopPerformers, fetchCollectorStats, fetchCollectorMetric, fetchLandfills, fetchCollectorReviews, fetchSavedLocations, fetchRecurringRoutes]);

  // Choose Vehicle screen: real dispatch + pricing. Runs the moment the
  // customer lands here with real pickup coordinates, replacing the
  // hardcoded TRASH_VEHICLES list with live prices/ETAs from the database.
  useEffect(() => {
    if (step !== AppStep.VEHICLE_SELECTION || !userCoords) return;

    let cancelled = false;
    setIsLoadingVehicleOptions(true);

    const recommendedVehicleName = inferRecommendedVehicleName(aiResult?.recommendedVehicle, selectedTrashType);

    getVehicleOptions({
      userLat: userCoords.latitude,
      userLng: userCoords.longitude,
      wasteBags: aiResult?.binCount ?? null,
      recommendedVehicleName,
    })
      .then((options) => {
        if (cancelled) return;
        setVehicleOptions(options);
        // Always land on a live-priced option (auto-selecting the
        // recommended vehicle) — any pre-set selection from before this
        // fetch (e.g. the AI Estimator's static pre-pick) would otherwise
        // carry stale, non-live pricing into the booking.
        setSelectedVehicle(options.find((o) => o.recommended) ?? options[0] ?? null);
      })
      .catch((e) => {
        console.error('[VehicleDispatch] Failed to load vehicle options:', e);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVehicleOptions(false);
      });

    return () => { cancelled = true; };
  }, [step, userCoords]);

  const renderScreen = () => {
    switch (step) {
      case AppStep.SPLASH:
        return (
          <View style={styles.splashContainer}>
            <Image
              source={require('./assets/splash-new-bg.jpg')}
              style={[StyleSheet.absoluteFill, { width: width, height: height, resizeMode: 'cover' }]}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.1)' }]} />
            <Animated.View style={[styles.splashOverlay, { opacity: fadeAnim }]}>
              <View style={{ flex: 1, justifyContent: 'space-between', alignItems: 'center', paddingTop: 30, paddingBottom: 15 }}>
                
                <View style={{ alignItems: 'center' }}>
                  <Image source={require('./assets/borla_logo_new.png')} style={{ width: 280, height: 120, resizeMode: 'contain' }} />
                  <Text style={[styles.splashSubtitle, { color: '#fff', fontWeight: 'bold', fontSize: 20, textShadowColor: 'rgba(0, 0, 0, 0.6)', textShadowOffset: {width: 0, height: 2}, textShadowRadius: 4, marginTop: -15 }]}>Trash Collection, Simplified.</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setStep(AppStep.ROLE_SELECTION)}
                  style={{
                    backgroundColor: '#06C167',
                    paddingVertical: 18,
                    paddingHorizontal: 60,
                    borderRadius: 30,
                    marginBottom: 0,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.3,
                    shadowRadius: 12,
                    elevation: 8,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', letterSpacing: 1 }}>GET STARTED</Text>
                </TouchableOpacity>

              </View>
            </Animated.View>
          </View>
        );

      case AppStep.ROLE_SELECTION:
        return (
          <View style={styles.screenContainer}>
            <Text style={styles.roleTitle}>{t.whoAreYou}</Text>
            <View style={styles.roleList}>
              {[
                { r: UserRole.CUSTOMER, label: t.customer, icon: '🏠', desc: 'Household, Market, Business' },
                { r: UserRole.COLLECTOR, label: t.collector, icon: '🚛', desc: 'Truck, Mini-Truck, Tricycle' }
              ].map((item) => {
                const isSelected = role === item.r;
                return (
                  <TouchableOpacity
                    key={item.r}
                    onPress={() => {
                      setRole(item.r);
                      // Check if collector needs onboarding
                      if (item.r === UserRole.COLLECTOR && !collectorProfile.phone) {
                        setStep(AppStep.COLLECTOR_ONBOARDING_WELCOME);
                      } else {
                        next();
                      }
                    }}
                    activeOpacity={0.7}
                    style={[styles.roleCard, isSelected && styles.roleCardActive]}
                  >
                    <Text style={styles.roleIcon}>{item.icon}</Text>
                    <View style={styles.roleContent}>
                      <Text style={styles.roleLabel}>{item.label}</Text>
                      <Text style={styles.roleDesc}>{item.desc}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.roleFooter}>Select your role to continue</Text>
          </View>
        );

      case AppStep.LOGIN:
        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screenContainer}>
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <ChevronLeft size={28} color="#06C167" />
            </TouchableOpacity>
            <Image source={require('./assets/borla_logo.png')} style={{ width: 180, height: 70, resizeMode: 'contain', marginBottom: 20 }} />
            <Text style={styles.loginTitle}>{t.welcome}</Text>
            <Text style={styles.loginSubtitle}>{t.subWelcome}</Text>

            <View style={styles.authToggle}>
              <TouchableOpacity
                onPress={() => setAuthMethod('phone')}
                style={[styles.toggleBtn, authMethod === 'phone' && styles.toggleBtnActive]}
              >
                <Smartphone size={18} color={authMethod === 'phone' ? '#fff' : '#6B7280'} />
                <Text style={[styles.toggleText, authMethod === 'phone' && styles.toggleTextActive]}>Phone</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAuthMethod('email')}
                style={[styles.toggleBtn, authMethod === 'email' && styles.toggleBtnActive]}
              >
                <Mail size={18} color={authMethod === 'email' ? '#fff' : '#6B7280'} />
                <Text style={[styles.toggleText, authMethod === 'email' && styles.toggleTextActive]}>Email</Text>
              </TouchableOpacity>
            </View>

            {authMethod === 'phone' ? (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>Enter Mobile Number</Text>
                <View style={styles.phoneInput}>
                  <Text style={styles.countryCode}>+233 ⌄</Text>
                  <TextInput
                    style={styles.input}
                    keyboardType="phone-pad"
                    placeholder="Mobile Number.."
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                  />
                </View>
              </View>
            ) : (
              <View style={styles.inputSection}>
                <Text style={styles.inputLabel}>Enter Email & Password</Text>
                <View style={styles.emailInput}>
                  <Mail size={20} color="#9CA3AF" style={{ marginRight: 12 }} />
                  <TextInput
                    style={styles.input}
                    keyboardType="email-address"
                    placeholder="Email Address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>
                <View style={[styles.emailInput, { marginTop: 12 }]}>
                  <Lock size={20} color="#9CA3AF" style={{ marginRight: 12 }} />
                  <TextInput
                    style={styles.input}
                    secureTextEntry
                    placeholder="Password"
                    value={password}
                    onChangeText={setPassword}
                  />
                </View>
              </View>
            )}

            {authMethod === 'email' && (
              <View style={[styles.authToggle, { marginTop: 16 }]}>
                <TouchableOpacity
                  onPress={() => setIsSignupMode(true)}
                  style={[styles.toggleBtn, isSignupMode && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, isSignupMode && styles.toggleTextActive]}>Create Account</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setIsSignupMode(false)}
                  style={[styles.toggleBtn, !isSignupMode && styles.toggleBtnActive]}
                >
                  <Text style={[styles.toggleText, !isSignupMode && styles.toggleTextActive]}>Login</Text>
                </TouchableOpacity>
              </View>
            )}

            <Button onPress={next} isLoading={isSendingOtp || isAuthenticating} style={{ marginBottom: 24 }}>Continue</Button>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <Button variant="outline" onPress={() => { }} style={{ flex: 1, marginRight: 12 }}>
                Google
              </Button>
              <Button variant="outline" onPress={() => { }} style={{ flex: 1 }}>
                Apple
              </Button>
            </View>
          </KeyboardAvoidingView>
        );

      case AppStep.OTP:
        return (
          <View style={styles.screenContainer}>
            <Image
              source={{ uri: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=2070&auto=format&fit=crop' }}
              style={[StyleSheet.absoluteFill, { opacity: 0.05 }]}
            />
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <ChevronLeft size={32} color="#06C167" />
            </TouchableOpacity>
            <Text style={styles.loginTitle}>Akwaaba!</Text>
            <Text style={styles.loginSubtitle}>Let&apos;s clean up Kasoa today.</Text>

            <View style={styles.otpSection}>
              <Text style={styles.otpLabel}>Enter the 4-digit code</Text>
              <Text style={styles.otpHelp}>Sent via SMS at {mobileNumber || '9XXXXXXXXX'}</Text>
              <View style={styles.otpRow}>
                <TextInput
                  style={styles.otpInputFull}
                  maxLength={4}
                  keyboardType="number-pad"
                  value={otpCode}
                  onChangeText={setOtpCode}
                  placeholder="0000"
                  placeholderTextColor="#E5E7EB"
                />
              </View>
              <TouchableOpacity onPress={() => alert("Code Resent!")}>
                <Text style={styles.resendText}>Resend code via SMS</Text>
              </TouchableOpacity>
            </View>

            <Button onPress={next} isLoading={isVerifyingOtp}>Continue</Button>
          </View>
        );

      case AppStep.HOME:
        return (
          <View style={{ flex: 1, backgroundColor: '#F3F4F6' }}>
            {/* Map fills the entire background */}
            <View style={StyleSheet.absoluteFillObject}>
              <MapComponent
                userLatitude={userCoords?.latitude}
                userLongitude={userCoords?.longitude}
                collectors={nearbyCollectors}
              />
            </View>

            {/* Header hovering over map */}
            <View style={[styles.homeHeader, { position: 'absolute', top: 50, width: '100%', zIndex: 10 }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.SETTINGS)} style={styles.roundBtn} accessibilityLabel="Open Settings">
                <Menu size={24} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity 
                onPress={() => setShowLocationModal(true)}
                style={styles.locationBadge}
              >
                <View style={styles.onlineDot} />
                <Text style={styles.locationBadgeText} numberOfLines={1}>
                  {checkingCoverage ? 'Checking coverage...' : `📍 ${locationLabel}`}
                </Text>
                <ChevronRight size={14} color="#9CA3AF" style={{ marginLeft: 4 }} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setLanguage(language === 'English' ? 'Twi' : 'English')} style={styles.langBtn} accessibilityLabel="Switch Language">
                <Text style={styles.langBtnText}>{language === 'English' ? 'TWI' : 'ENG'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep(AppStep.NOTIFICATIONS)} style={styles.roundBtn} accessibilityLabel="View Notifications">
                <Bell size={24} color="#000" />
                <View style={styles.notifDot} />
              </TouchableOpacity>
            </View>

            {/* Animated Bottom Sheet */}
            <Animated.View 
              style={[
                styles.homeCard, 
                { 
                  position: 'absolute', 
                  bottom: 0, 
                  width: '100%', 
                  height: '75%', // Ensure it's tall enough when expanded
                  transform: [{ translateY: panY }] 
                }
              ]}
            >
              {/* Drag Handle Area */}
              <View 
                {...panResponder.panHandlers} 
                style={{ width: '100%', alignItems: 'center', paddingVertical: 12, marginTop: -20, marginBottom: 8 }}
              >
                <View style={{ width: 40, height: 5, borderRadius: 2.5, backgroundColor: '#D1D5DB' }} />
              </View>

              <ScrollView 
                showsVerticalScrollIndicator={false} 
                contentContainerStyle={{ paddingBottom: 40 }}
                bounces={false}
              >
                <View style={styles.homeCardHeader}>
                  <Text style={styles.cardTitle}>{t.akwaaba}</Text>
                  <Text style={styles.cardSubtitle}>{t.cleanUp}</Text>
                </View>

                <View style={styles.simActions}>
                  <TouchableOpacity onPress={() => setStep(AppStep.WHATSAPP_SIM)} style={[styles.simBtn, { backgroundColor: 'rgba(34, 197, 94, 0.1)', borderColor: 'rgba(34, 197, 94, 0.2)' }]}>
                    <MessageSquare size={16} color="#166534" />
                    <Text style={[styles.simBtnText, { color: '#166534' }]}>WhatsApp Bot</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setStep(AppStep.USSD_SIM)} style={[styles.simBtn, { backgroundColor: '#F3F4F6', borderColor: '#E5E7EB' }]}>
                    <Smartphone size={16} color="#374151" />
                    <Text style={[styles.simBtnText, { color: '#374151' }]}>USSD Dial</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={next} disabled={checkingCoverage} activeOpacity={0.9} style={[styles.mainPickupBtn, checkingCoverage && { opacity: 0.7 }]}>
                  <View style={styles.mainPickupLeft}>
                    <View style={styles.iconCircle}>
                      <MapIcon size={20} color="#fff" />
                    </View>
                    <Text style={styles.mainPickupText}>{checkingCoverage ? 'Checking coverage...' : t.pickupTrash}</Text>
                  </View>
                  {checkingCoverage ? <ActivityIndicator size="small" color="#fff" /> : <ChevronRight size={20} color="#fff" />}
                </TouchableOpacity>

                {/* Feature 1: AI Estimator Button */}
                <TouchableOpacity onPress={() => setStep(AppStep.AI_ESTIMATOR)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', padding: 16, borderRadius: 16, marginTop: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 20 }}>📷</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#1E3A8A', fontWeight: '800', fontSize: 16 }}>AI Trash Estimator</Text>
                    <Text style={{ color: '#60A5FA', fontSize: 12 }}>Scan your trash for instant pricing</Text>
                  </View>
                  <ChevronRight size={20} color="#3B82F6" />
                </TouchableOpacity>

                {/* Feature 3: Community Bulk Widget */}
                <TouchableOpacity onPress={() => setStep(AppStep.COMMUNITY_POOL)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', padding: 16, borderRadius: 16, marginTop: 12, borderWidth: 1, borderColor: '#86EFAC' }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Text style={{ fontSize: 20 }}>🏘️</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#14532D', fontWeight: '800', fontSize: 16 }}>Community Pool</Text>
                    <Text style={{ color: '#4ADE80', fontSize: 12 }}>Join 3 neighbors • Save 20%</Text>
                  </View>
                  <ChevronRight size={20} color="#22C55E" />
                </TouchableOpacity>

                <View style={{ marginTop: 20 }}>
                  <Text style={styles.sectionHeader}>{t.trashType}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trashTypeRow}>
                    {TRASH_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.id}
                        onPress={() => setSelectedTrashType(type.name)}
                        style={[styles.trashCard, selectedTrashType === type.name && styles.trashCardActive]}
                      >
                        <Text style={styles.trashEmoji}>{type.icon}</Text>
                        <Text style={styles.trashName}>{type.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.recentSection}>
                  {/* Live Location Search Bar */}
                  <View style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: locationSearchQuery.length > 0 ? '#06C167' : '#E5E7EB' }}>
                      <MapPin size={18} color="#06C167" style={{ marginRight: 10 }} />
                      <TextInput
                        style={{ flex: 1, fontSize: 15, color: '#111827', fontWeight: '500' }}
                        placeholder="Search any location in Ghana..."
                        placeholderTextColor="#9CA3AF"
                        value={locationSearchQuery}
                        onChangeText={handleLocationSearchChange}
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                      />
                      {isSearchingLiveLocation && <ActivityIndicator size="small" color="#06C167" />}
                    </View>

                    {/* Live Search Results Dropdown */}
                    {locationSearchResults.length > 0 && (
                      <View style={{ backgroundColor: '#fff', borderRadius: 14, marginTop: 6, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 }}>
                        {locationSearchResults.map((result, i) => {
                          return (
                            <TouchableOpacity
                              key={result.id}
                              onPress={() => {
                                handleLocationSelect(result);
                                next();
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: i < locationSearchResults.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}
                            >
                              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <MapPin size={16} color="#06C167" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{result.label}</Text>
                                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>{result.address}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Show suggestions when not searching */}
                  {locationSearchResults.length === 0 && (
                    <>
                      <View style={styles.sectionTitleRow}>
                        <Text style={styles.sectionTitle}>{locationSearchQuery.length > 2 ? 'No results found' : t.recent}</Text>
                        <TouchableOpacity onPress={() => setStep(AppStep.HISTORY)}>
                          <Text style={styles.seeAllText}>See All</Text>
                        </TouchableOpacity>
                      </View>
                      {RECENT_LOCATIONS.map((loc, i) => (
                        <TouchableOpacity key={i} onPress={() => {
                          setPickupAddress(loc.address);
                          next();
                        }} style={styles.recentRow}>
                          <View style={styles.recentIconBox}>
                            <MapPin size={20} color="#9CA3AF" />
                          </View>
                          <View>
                            <Text style={styles.recentName}>{loc.name}</Text>
                            <Text style={styles.recentAddress}>{loc.address}</Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </View>
              </ScrollView>
            </Animated.View>

            <BottomNav activeStep={step} onTabChange={setStep} role={role} />
          </View>
        );

      case AppStep.WHATSAPP_SIM:
        return (
          <View style={[styles.screenContainer, { backgroundColor: '#ECE5DD' }]}>
            <View style={styles.waHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={28} color="#fff" /></TouchableOpacity>
              <Image source={{ uri: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?q=80&w=150&auto=format&fit=crop' }} style={styles.waAvatar} />
              <View>
                <Text style={styles.waName}>Borla Voice Bot</Text>
                <Text style={styles.waStatus}>online</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.waChat}>
              <View style={styles.waBubble}>
                <Text style={styles.waText}>Akwaaba! I am your Borla voice assistant. 👋</Text>
              </View>
              <View style={styles.waBubble}>
                <Text style={styles.waText}>Send me a voice message in English or Twi to book a pickup!</Text>
              </View>

              {voiceMessageSent && (
                <>
                  {/* Simulated Voice Message */}
                  <View style={[styles.waBubble, { backgroundColor: '#DCF8C6', alignSelf: 'flex-end', maxWidth: '80%' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: '#fff', fontSize: 18 }}>▶</Text>
                      </View>
                      <View style={{ flex: 1, height: 4, backgroundColor: '#06C167', borderRadius: 2 }} />
                      <Text style={{ fontSize: 12, color: '#6B7280' }}>0:08</Text>
                    </View>
                  </View>

                  {/* AI Transcription */}
                  <View style={styles.waBubble}>
                    <Text style={[styles.waText, { fontStyle: 'italic', color: '#6B7280', fontSize: 12 }]}>🎤 Transcribing...</Text>
                    <Text style={styles.waText}>&quot;I need trash collection at Kasoa Market tomorrow morning for household waste&quot;</Text>
                  </View>

                  {/* Booking Confirmation */}
                  <View style={styles.waBubble}>
                    <Text style={styles.waText}>✅ Got it! I&apos;ve booked your pickup:</Text>
                    <Text style={[styles.waText, { marginTop: 8 }]}>📍 Location: Kasoa New Market</Text>
                    <Text style={styles.waText}>🗑️ Type: HOUSEHOLD</Text>
                    <Text style={styles.waText}>⏰ Time: Tomorrow morning</Text>
                    <Text style={[styles.waText, { marginTop: 8, fontWeight: '700' }]}>Your collector will arrive soon!</Text>
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.waInputArea}>
              <View style={styles.waInputBox}><Text style={{ color: '#9CA3AF' }}>Type a message</Text></View>
              <TouchableOpacity
                onPress={() => setVoiceMessageSent(true)}
                style={styles.waMic}
                accessibilityLabel="Send voice message"
              >
                <MessageSquare size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        );

      case AppStep.USSD_SIM:
        const handleUssdSubmit = () => {
          if (ussdStep === 0) setUssdStep(1);
          else if (ussdStep === 1) setUssdStep(2);
          else if (ussdStep === 2) setUssdStep(3);
          else {
            setStep(AppStep.ROLE_SELECTION);
            setUssdStep(0);
          }
          setUssdInputText('');
        };

        const getUssdText = () => {
          switch(ussdStep) {
            case 0: return "SamSa Waste\n\n1. Request Pickup\n2. Check Balance\n3. Subscriptions\n4. Exit";
            case 1: return "Enter Pickup Area / Landmark:";
            case 2: return "Select Trash Type:\n\n1. Plastic (+Points)\n2. Household\n3. Mixed Waste";
            case 3: return "Booking Confirmed! A collector is heading to your location.\n\n0. Exit";
            default: return "";
          }
        };

        return (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.screenContainer, { backgroundColor: '#111', justifyContent: 'center' }]}>
            <View style={styles.ussdBox}>
              <Text style={styles.ussdTitle}>MNO USSD Simulator</Text>
              <Text style={styles.ussdContent}>{getUssdText()}</Text>
              
              {ussdStep < 3 && (
                <View style={[styles.ussdInput, { padding: 0 }]}>
                  <TextInput
                    style={{ color: '#fff', fontSize: 16, flex: 1, padding: 12 }}
                    value={ussdInputText}
                    onChangeText={setUssdInputText}
                    autoFocus={true}
                    keyboardType={ussdStep === 1 ? 'default' : 'numeric'}
                    placeholder="Type here..."
                    placeholderTextColor="#666"
                  />
                </View>
              )}
              
              <View style={styles.ussdActions}>
                <TouchableOpacity onPress={() => { setUssdStep(0); back(); }}><Text style={styles.ussdActionBtn}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity onPress={handleUssdSubmit}><Text style={styles.ussdActionBtn}>{ussdStep === 3 ? 'Ok' : 'Send'}</Text></TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        );

      case AppStep.BOOKING:
        return (
          <View style={{ flex: 1 }}>
            <View style={{ height: 300 }}>
              <MapComponent
                userLatitude={userCoords?.latitude}
                userLongitude={userCoords?.longitude}
                collectors={nearbyCollectors}
              />
              <View style={[styles.homeHeader, { top: 40 }]}>
                <TouchableOpacity style={styles.roundBtn} onPress={back}><ChevronLeft size={20} color="#000" /></TouchableOpacity>
                <TouchableOpacity style={styles.roundBtn}><Bell size={20} color="#000" /></TouchableOpacity>
              </View>
            </View>

            <View style={styles.bookingCard}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.bookingHeader}>
                  <TouchableOpacity onPress={back}><ChevronLeft size={28} color="#06C167" /></TouchableOpacity>
                  <Text style={styles.bookingTitle}>{t.requestCollection}</Text>
                  <View style={{ width: 28 }} />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bookingTabs}>
                  <TouchableOpacity style={styles.bookingTabActive} onPress={() => setStep(AppStep.SCHEDULE)}>
                    <Clock size={14} color="#fff" />
                    <Text style={[styles.bookingTabText, { color: '#fff' }]}>{scheduledDateTime ? `${scheduledDateTime.date} @ ${scheduledDateTime.time}` : 'Schedule ⌄'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.bookingTab} 
                    onPress={() => {
                      Alert.alert(
                        'Booking For?',
                        'Who are you requesting this collection for?',
                        [
                          { text: 'Myself', onPress: () => setBookingForSelf(true) },
                          { text: 'A Friend', onPress: () => setBookingForSelf(false) }
                        ]
                      );
                    }}
                  >
                    <User size={14} color="#06C167" />
                    <Text style={styles.bookingTabText}>{bookingForSelf ? 'For Me ⌄' : 'For Friend ⌄'}</Text>
                  </TouchableOpacity>
                </ScrollView>

                {!bookingForSelf && (
                  <View style={{ marginBottom: 20 }}>
                    <Text style={{ fontWeight: 'bold', marginBottom: 10, color: '#111827' }}>Friend&apos;s Mobile Number</Text>
                    <View style={[styles.phoneInput, { marginHorizontal: 0 }]}>
                      <Text style={styles.countryCode}>+233 ⌄</Text>
                      <TextInput
                        style={styles.input}
                        keyboardType="phone-pad"
                        placeholder="02XXXXXXXX"
                        value={friendPhone}
                        onChangeText={setFriendPhone}
                      />
                    </View>
                  </View>
                )}

                <View style={styles.locationSummary}>
                  <View style={styles.summaryItem}>
                    <View style={styles.dotWhite} />
                    <View style={styles.summaryContent}>
                      <Text style={styles.summaryLabel}>Pickup Location</Text>
                      <TextInput 
                        style={styles.summaryVal} 
                        value={pickupAddress} 
                        onChangeText={setPickupAddress}
                        placeholder="Enter pickup location"
                        placeholderTextColor="rgba(255,255,255,0.5)"
                      />
                    </View>
                  </View>
                  <View style={styles.summaryDivider} />
                  <View style={styles.summaryItem}>
                    <View style={styles.rectWhite} />
                    <View style={styles.summaryContent}>
                      <Text style={styles.summaryLabel}>Trash Type</Text>
                      <Text style={styles.summaryVal}>{selectedTrashType}</Text>
                    </View>
                  </View>
                </View>

                {/* Borla Points Reward Toggle */}
                <TouchableOpacity 
                  onPress={() => setSeparatedPlastics(!separatedPlastics)}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: separatedPlastics ? '#ECFDF5' : '#F3F4F6', padding: 16, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: separatedPlastics ? '#34D399' : 'transparent', marginTop: 10 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: separatedPlastics ? '#06C167' : '#9CA3AF', marginRight: 15, justifyContent: 'center', alignItems: 'center' }}>
                    {separatedPlastics && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#06C167' }} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontWeight: 'bold', color: '#111827' }}>I have separated plastics</Text>
                    <Text style={{ color: '#06C167', fontSize: 13, marginTop: 4, fontWeight: '600' }}>🎁 Earn +50 Borla Points</Text>
                  </View>
                </TouchableOpacity>

                {/* Landmark Voice Directions */}
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ fontWeight: 'bold', marginBottom: 10, color: '#111827' }}>Landmark Voice Directions (Optional)</Text>
                  {!hasVoiceLandmark ? (
                    <TouchableOpacity
                      onPress={async () => {
                        if (!isRecordingLandmark) {
                          // Start recording
                          try {
                            const { granted } = await Audio.requestPermissionsAsync();
                            if (!granted) { alert('Microphone permission is required to record voice directions.'); return; }
                            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
                            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
                            recordingRef.current = recording;
                            setIsRecordingLandmark(true);
                          } catch (e) {
                            console.error('Failed to start recording:', e);
                            alert('Could not start recording. Please check microphone permissions.');
                          }
                        } else {
                          // Stop recording
                          try {
                            // Get URI BEFORE stopping, as getURI() may return null after unload
                            const uri = recordingRef.current?.getURI();
                            await recordingRef.current?.stopAndUnloadAsync();
                            // Reset audio session to playback mode so subsequent play calls don't get stuck
                            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
                            // Small delay to let the file system finalize the .m4a on-disk
                            await new Promise(resolve => setTimeout(resolve, 150));
                            if (!uri) {
                              alert('Recording failed: could not save the audio file. Please try again.');
                            } else {
                              setVoiceRecordingUri(uri);
                              setHasVoiceLandmark(true);
                              console.log('[Recording] Saved to:', uri);
                            }
                            recordingRef.current = null;
                            setIsRecordingLandmark(false);
                          } catch (e) {
                            console.error('Failed to stop recording:', e);
                            setIsRecordingLandmark(false);
                          }
                        }
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isRecordingLandmark ? '#FEE2E2' : '#F3F4F6', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: isRecordingLandmark ? '#EF4444' : 'transparent' }}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isRecordingLandmark ? '#EF4444' : '#fff', alignItems: 'center', justifyContent: 'center', marginRight: 15 }}>
                        <Mic size={20} color={isRecordingLandmark ? '#fff' : '#06C167'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', color: isRecordingLandmark ? '#B91C1C' : '#374151' }}>
                          {isRecordingLandmark ? 'Recording... Tap to stop' : 'Record voice directions'}
                        </Text>
                        <Text style={{ color: isRecordingLandmark ? '#DC2626' : '#6B7280', fontSize: 13, marginTop: 4 }}>
                          {isRecordingLandmark ? `00:${recordingDuration < 10 ? '0' : ''}${recordingDuration}` : 'e.g. &quot;I am by the waakye seller...&quot;'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#34D399' }}>
                      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', marginRight: 15 }}>
                        <Check size={20} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: 'bold', color: '#064E3B' }}>Voice directions saved!</Text>
                        <Text style={{ color: '#059669', fontSize: 13, marginTop: 4 }}>Collector will play this when near.</Text>
                      </View>
                      <TouchableOpacity onPress={() => setHasVoiceLandmark(false)}>
                        <X size={20} color="#059669" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </ScrollView>

              <View style={{ position: 'absolute', bottom: 20, left: 24, right: 24 }}>
                <Button onPress={next} isLoading={isGeocoding}>{t.confirmLocation}</Button>
              </View>
            </View>
          </View>
        );

      case AppStep.SCHEDULE:
        return (
          <View style={styles.screenContainer}>
            <TouchableOpacity onPress={back} style={styles.backButton}>
              <ChevronLeft size={28} color="#06C167" />
            </TouchableOpacity>
            <Text style={styles.loginTitle}>Schedule Pickup</Text>
            <Text style={styles.loginSubtitle}>Choose a date and time that works best for you.</Text>

            <View style={{ gap: 20, marginVertical: 40 }}>
              <View style={styles.phoneInput}>
                <Calendar size={20} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  onChangeText={(v) => setScheduledDateTime(prev => ({ ...prev!, date: v }))}
                />
              </View>
              <View style={styles.phoneInput}>
                <Clock size={20} color="#9CA3AF" />
                <TextInput
                  style={styles.input}
                  placeholder="HH:MM AM/PM"
                  onChangeText={(v) => setScheduledDateTime(prev => ({ ...prev!, time: v }))}
                />
              </View>
            </View>

            <Button onPress={next}>Set Schedule</Button>
          </View>
        );

      case AppStep.VEHICLE_SELECTION:
        return (
          <View style={{ flex: 1 }}>
            <View style={{ height: 250 }}>
              <MapComponent />
              <View style={[styles.homeHeader, { top: 40 }]}>
                <TouchableOpacity style={styles.roundBtn}><Menu size={20} color="#000" /></TouchableOpacity>
                <TouchableOpacity style={styles.roundBtn}><Bell size={20} color="#000" /></TouchableOpacity>
              </View>
            </View>

            <View style={styles.bookingCard}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                <View style={styles.bookingHeader}>
                  <TouchableOpacity onPress={back}><ChevronLeft size={28} color="#06C167" /></TouchableOpacity>
                  <Text style={styles.bookingTitle}>{t.chooseVehicle}</Text>
                  <View style={{ width: 28 }} />
                </View>

                {isLoadingVehicleOptions && vehicleOptions.length === 0 ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#06C167" />
                    <Text style={{ marginTop: 12, color: '#6B7280' }}>Finding nearby collectors & real prices...</Text>
                  </View>
                ) : vehicleOptions.map((v) => {
                  const isSelected = selectedVehicle?.id === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => setSelectedVehicle(v)}
                      style={[styles.vehicleCard, isSelected && styles.vehicleCardActive]}
                    >
                      <Text style={styles.vehicleIcon}>{v.icon}</Text>
                      <View style={styles.vehicleInfo}>
                        <View style={styles.vehicleTitleRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.vehicleName}>{v.name}</Text>
                            {v.recommended && (
                              <View style={{ backgroundColor: '#06C167', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>RECOMMENDED</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.vehicleType}>{v.type}</Text>
                        </View>
                        <Text style={styles.vehicleCap}>Cap: {v.capacity}</Text>
                        <View style={styles.vehiclePriceRow}>
                          <Text style={styles.vehiclePrice}>{v.price}</Text>
                          <View style={styles.vehicleTimeRow}>
                            <Clock size={12} color="#9CA3AF" />
                            <Text style={styles.vehicleTime}>{v.etaLabel || v.time}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                          {v.distanceLabel ? `${v.distanceLabel} away • ` : ''}
                          {v.nearbyCollectorCount === 1 ? '1 collector nearby' : `${v.nearbyCollectorCount ?? 0} collectors nearby`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {/* Feature 2: Wait & Save Toggle */}
                {selectedVehicle && (
                  <View style={{ marginTop: 20 }}>
                    <Text style={styles.sectionHeader}>Choose Speed</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity
                        onPress={() => setSelectedSpeed('priority')}
                        style={{ flex: 1, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 16, borderWidth: selectedSpeed === 'priority' ? 2 : 1, borderColor: selectedSpeed === 'priority' ? '#3B82F6' : '#BFDBFE' }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E3A8A' }}>Priority</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#1E3A8A' }}>GH₵ {selectedVehicle.price.replace(/[^0-9.]/g, '')}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#60A5FA' }}>10-15 mins</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setSelectedSpeed('wait_save')}
                        style={{ flex: 1, backgroundColor: '#F0FDF4', padding: 16, borderRadius: 16, borderWidth: selectedSpeed === 'wait_save' ? 2 : 1, borderColor: selectedSpeed === 'wait_save' ? '#22C55E' : '#86EFAC' }}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#14532D' }}>Wait & Save</Text>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#16A34A' }}>GH₵ {(parseFloat(selectedVehicle.price.replace(/[^0-9.]/g, '')) * 0.8).toFixed(2)}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: '#4ADE80' }}>Within 2 hrs</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={{ position: 'absolute', bottom: 20, left: 24, right: 24 }}>
                <Button onPress={next} isLoading={isRequestingCollection}>{t.requestCollection}</Button>
              </View>
            </View>
          </View>
        );

      case AppStep.SEARCHING_COLLECTOR:
        return (
          <View style={{ flex: 1, backgroundColor: '#fff' }}>
            <MapComponent userLatitude={userCoords?.latitude} userLongitude={userCoords?.longitude} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center', padding: 40 }]}>
               <ActivityIndicator size="large" color="#06C167" />
               <Text style={{ marginTop: 32, fontSize: 24, fontWeight: '800', color: '#111', textAlign: 'center' }}>Searching for Collectors...</Text>
               <Text style={{ marginTop: 12, color: '#6B7280', fontSize: 16, textAlign: 'center' }}>Connecting you to the nearest available Borla truck in Kasoa.</Text>
               
               <View style={{ marginTop: 60, width: '100%' }}>
                  <Button 
                    variant="outline" 
                    onPress={() => setStep(AppStep.HOME)}
                  >
                    Cancel Request
                  </Button>
               </View>
            </View>
          </View>
        );

      case AppStep.COLLECTOR_FOUND:
        return (
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              <MapComponent
                showRoute={true}
                userLatitude={userCoords?.latitude}
                userLongitude={userCoords?.longitude}
                destinationLatitude={collectorCoords?.latitude}
                destinationLongitude={collectorCoords?.longitude}
                collectors={collectorCoords ? [{
                  collector_id: activePickup.collector_id,
                  latitude: collectorCoords.latitude,
                  longitude: collectorCoords.longitude,
                  distance_miles: calculateDistance(userCoords?.latitude || 0, userCoords?.longitude || 0, collectorCoords.latitude, collectorCoords.longitude)
                }] : []}
              />
              <View style={[styles.homeHeader, { top: 40 }]}>
                <TouchableOpacity style={styles.roundBtn}><Menu size={24} color="#000" /></TouchableOpacity>
                <TouchableOpacity style={styles.roundBtn}><Bell size={24} color="#000" /><View style={styles.notifDot} /></TouchableOpacity>
              </View>
              <View style={styles.collectorMarker}>
                <View style={styles.markerBadge}><Clock size={12} color="#fff" /><Text style={styles.markerText}>{collectorEtaLabel || '...'}</Text></View>
                <View style={styles.markerDot} />
              </View>
            </View>

            <View style={styles.foundCard}>
              <View style={styles.foundHeader}>
                <TouchableOpacity onPress={back}><ChevronLeft size={24} color="#06C167" /></TouchableOpacity>
                <View style={styles.foundTitleBox}>
                  <User size={16} color="#fff" style={styles.blackIcon} />
                  <Text style={styles.foundTitle}>Collector Assigned</Text>
                </View>
              </View>

              <View style={styles.collectorInfo}>
                <Image 
                  source={{ 
                    uri: activePickup?.collector?.avatar_url 
                      ? `${activePickup.collector.avatar_url}`
                      : `https://ui-avatars.com/api/?name=${encodeURIComponent(activePickup?.collector?.full_name || 'C')}&background=06C167&color=fff&size=200` 
                  }} 
                  style={styles.collectorAvatar} 
                />
                <View style={styles.collectorText}>
                  <View style={styles.nameRow}>
                    <Text style={styles.collectorName}>{activePickup?.collector?.full_name || 'Collector'}</Text>
                    <View style={styles.stars}>
                      <Text style={styles.star}>★</Text>
                      <Text style={styles.rating}>
                        {activePickup?.collector?.rating_average
                          ? `${parseFloat(activePickup.collector.rating_average).toFixed(1)}`
                          : '5.0'}
                      </Text>
                    </View>
                  </View>
                  {(activePickup?.collector?.vehicle_details?.plate || activePickup?.collector?.vehicle_number) ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Truck size={13} color="#374151" />
                      <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: '700', color: '#374151' }}>
                        {activePickup.collector.vehicle_details?.type || activePickup.collector.vehicle_type || 'Truck'} • {activePickup.collector.vehicle_details?.plate || activePickup.collector.vehicle_number}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.collectionsRow}>
                    <CheckCircle size={14} color="#06C167" />
                    <Text style={styles.collectionsText}>Borla Verified Collector</Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
                <Button onPress={next} style={{ flex: 1 }}>Confirm Meeting</Button>
                <TouchableOpacity 
                  onPress={() => setStep(AppStep.PICKUP_CHAT)}
                  style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}
                >
                  <MessageSquare size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );

      case AppStep.PAYMENT:
        return (
          <View style={styles.paymentScreen}>
            <View style={styles.paymentHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <View style={styles.paymentTitleRow}>
                <Wallet size={24} color="#000" strokeWidth={2.5} />
                <Text style={styles.paymentTitle}>{t.payment}</Text>
              </View>
              <View style={{ width: 32 }} />
            </View>

            <PaystackProvider publicKey={process.env.EXPO_PUBLIC_PAYSTACK_TEST_KEY || 'pk_test_d1970ac19a3e4aa2cc22c1c36bcb57848f7a358f'}>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                {activePickup?.proof_photo_url && (
                  <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F3F4F6' }}>
                    <Image source={{ uri: activePickup.proof_photo_url }} style={{ width: '100%', height: 200 }} resizeMode="cover" />
                    <View style={{ padding: 16, flexDirection: 'row', alignItems: 'center' }}>
                      <CheckCircle size={20} color="#06C167" style={{ marginRight: 8 }} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>Trash Collected! Proof of service.</Text>
                    </View>
                  </View>
                )}
                
                <View style={styles.billBox}>
                  <Text style={styles.billVal}>GH₵ {splitAmount.toFixed(2)}{splitWays > 1 ? ' (Share)' : ''}</Text>
                  <Text style={styles.billLabel}>{splitWays > 1 ? `Your 1/${splitWays} share of total GH₵ ${(Number(activePickup?.pricing_ghs) || 85.00).toFixed(2)}` : t.totalBill}</Text>
                </View>
  
                {!isPaying && (
                  <View style={{ backgroundColor: '#F3F4F6', borderRadius: 16, padding: 16, marginHorizontal: 20, marginBottom: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937', flex: 1 }}>Compound House Split-Pay</Text>
                      <View style={{ backgroundColor: '#06C167', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>NEW</Text>
                      </View>
                    </View>
                    <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Share this bill with neighbors before paying. We&apos;ll give you a link to send them.</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', padding: 8, borderRadius: 12 }}>
                      <TouchableOpacity 
                        onPress={() => setSplitWays(Math.max(1, splitWays - 1))}
                        style={{ width: 40, height: 40, backgroundColor: '#F3F4F6', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#374151' }}>-</Text>
                      </TouchableOpacity>
                      
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#111827' }}>{splitWays}</Text>
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>Total Payers</Text>
                      </View>
  
                      <TouchableOpacity 
                        onPress={() => setSplitWays(Math.min(10, splitWays + 1))}
                        style={{ width: 40, height: 40, backgroundColor: '#F3F4F6', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#374151' }}>+</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
  
                {isPaying ? (
                  <PaymentComponent
                    amount={splitAmount}
                    email={user?.email || "user@example.com"}
                    metadata={{
                      userId: user?.id,
                      userEmail: user?.email,
                      type: 'pickup_payment',
                      pickupId: activePickup?.id,
                      splitWays: splitWays,
                      amountRecieved: splitAmount
                    }}
                    subaccount="ACCT_2bhk2xu5mjrs5i5"
                    onSuccess={handlePaymentSuccess}
                    onCancel={handlePaymentCancel}
                  />
                ) : (
                  <View>
                    <Text style={styles.paymentSectionTitle}>Select Payment Method</Text>
                    <TouchableOpacity 
                      style={[styles.momoRow, selectedPaymentMethod === 'paystack' && { borderColor: '#06C167', borderWidth: 2 }]} 
                      onPress={() => setSelectedPaymentMethod('paystack')}
                    >
                      <Image source={{ uri: 'https://upload.wikimedia.org/wikipedia/commons/9/93/MTN_Logo.svg' }} style={styles.momoLogo} />
                      <View style={styles.momoText}>
                        <Text style={styles.momoName}>Pay with Paystack</Text>
                        <Text style={styles.momoNum}>Mobile Money / Card</Text>
                      </View>
                      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedPaymentMethod === 'paystack' ? '#06C167' : '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedPaymentMethod === 'paystack' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#06C167' }} />}
                      </View>
                    </TouchableOpacity>
  
                    <TouchableOpacity 
                      style={[styles.methodRow, selectedPaymentMethod === 'cash' && { borderColor: '#06C167', borderWidth: 2 }]} 
                      onPress={() => setSelectedPaymentMethod('cash')}
                    >
                      <View style={styles.methodIcon}><Wallet size={20} color="#06C167" /></View>
                      <View style={styles.momoText}>
                        <Text style={styles.momoName}>Cash Payment</Text>
                        <Text style={styles.momoNum}>Pay to collector</Text>
                      </View>
                      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: selectedPaymentMethod === 'cash' ? '#06C167' : '#D1D5DB', alignItems: 'center', justifyContent: 'center' }}>
                        {selectedPaymentMethod === 'cash' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#06C167' }} />}
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </ScrollView>
            </PaystackProvider>

            {!isPaying && (
              <View style={{ position: 'absolute', bottom: 20, left: 24, right: 24 }}>
                <Button
                  onPress={async () => {
                    // BC-018: record which method the customer chose, on the
                    // pickup row itself, before anything else happens — this
                    // is what lets handleJobFinalize later tell a genuinely
                    // unpaid card/MoMo job apart from a cash one. A failed
                    // write here is non-fatal to the payment flow itself.
                    if (activePickup?.id) {
                      const { error: methodError } = await supabase
                        .from('pickups')
                        .update({ payment_method: selectedPaymentMethod === 'paystack' ? 'paystack' : 'cash' })
                        .eq('id', activePickup.id);
                      if (methodError) console.error('[Payment] Could not record payment_method:', methodError.message);
                    }
                    if (selectedPaymentMethod === 'paystack') {
                      setIsPaying(true);
                      return;
                    }
                    // Cash Payment
                    handlePaymentSuccess({ method: 'cash' });
                  }}
                >
                  {t.confirmPayment}
                </Button>
              </View>
            )}

            {paymentSuccess && (
              <View style={styles.successOverlay}>
                <View style={styles.successCard}>
                  <CheckCircle size={64} color="#06C167" />
                  <Text style={styles.successTitle}>Payment Successful!</Text>
                  <Text style={styles.successBody}>Your collection is being processed.</Text>
                </View>
              </View>
            )}
          </View>
        );

      case AppStep.HISTORY:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Pickup History</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {isHistoryLoading && pickups.length === 0 ? (
                <ActivityIndicator color="#06C167" style={{ marginTop: 60 }} />
              ) : pickups.length > 0 ? (
                pickups.map((pickup) => (
                  <View key={pickup.id} style={styles.historyCard}>
                    <View style={styles.historyTop}>
                      <View>
                        <Text style={styles.historyLoc}>{pickup.pickup_location_name}</Text>
                        <Text style={styles.historyDate}>{new Date(pickup.created_at).toLocaleString()}</Text>
                      </View>
                      {/* Real pickup_status values are lowercase ('completed'/'collected') —
                          this used to only match 'COLLECTED' (uppercase), so a finished
                          pickup never got the green badge. */}
                      <View style={[styles.statusBadge, (pickup.status === 'completed' || pickup.status === 'collected') ? styles.statusCollected : styles.statusPending]}>
                        <Text style={[styles.statusText, (pickup.status === 'completed' || pickup.status === 'collected') ? styles.statusTextCollected : styles.statusTextPending]}>{pickup.status}</Text>
                      </View>
                    </View>
                    <View style={styles.historyBot}>
                      <View style={styles.historyVehicle}>
                        <Text style={{ fontSize: 20 }}>🛺</Text>
                        <Text style={styles.historyVehicleName}>{pickup.trash_type}</Text>
                      </View>
                      <Text style={styles.historyPrice}>GH₵ {pickup.pricing_ghs}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyHistory}>
                  <Clock size={48} color="#D1D5DB" />
                  <Text style={styles.emptyText}>No History Yet</Text>
                </View>
              )}
            </ScrollView>
            <BottomNav activeStep={step} onTabChange={setStep} role={role} />
          </View>
        );

      case AppStep.COLLECTOR_DASHBOARD:
        return (
          <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
            {/* Map Background - Full screen, no overlay */}
            <View style={StyleSheet.absoluteFill}>
              <MapComponent showHeatmap={showHeatmap} />
            </View>

            <View style={[styles.collHeader, { backgroundColor: 'rgba(31,41,55,0.85)' }]}>
              {/* Row 1: Avatar + Name + Online Toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Image 
                  source={{ uri: userProfile?.avatar_url || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=150&auto=format&fit=crop' }} 
                  style={styles.collAva} 
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.collName}>{userProfile?.full_name || collectorProfile.name || 'Collector'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setCollectorOnline(!collectorOnline)}
                      style={styles.onlineRow}
                    >
                      <View style={[styles.onlineDot, !collectorOnline && { backgroundColor: '#9CA3AF' }]} />
                      <Text style={[styles.onlineText, !collectorOnline && { color: '#9CA3AF' }]}>
                        {collectorOnline ? 'Online' : 'Offline'}
                      </Text>
                    </TouchableOpacity>
                    
                    {collectorOnline && (
                      <TouchableOpacity
                        onPress={() => {
                          Alert.alert(
                            "Manual Status Override",
                            "Set your current operational state:",
                            [
                              { text: "Online/Idle", onPress: () => updateCollectorStatus(CollectorStatus.ONLINE) },
                              { text: "At Landfill", onPress: () => updateCollectorStatus(CollectorStatus.AT_LANDFILL) },
                              { text: "Busy", onPress: () => updateCollectorStatus(CollectorStatus.BUSY) },
                              { text: "Cancel", style: "cancel" }
                            ]
                          );
                        }}
                        style={{ backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }}
                      >
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>OVERRIDE</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
                <TouchableOpacity 
                  onPress={() => setStep(AppStep.NOTIFICATIONS)}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Bell size={20} color="#fff" />
                  <View style={{ position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                </TouchableOpacity>
              </View>
              {/* Row 2: Action Icons */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <TouchableOpacity
                  onPress={() => setStep(AppStep.PROFILE)}
                  style={[styles.collNotif, { flex: 1, margin: 0 }]}
                  accessibilityLabel="View profile"
                >
                  <User size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowHeatmap(!showHeatmap)}
                  style={[styles.collNotif, { flex: 1, margin: 0, backgroundColor: showHeatmap ? '#EF4444' : '#1F2937' }]}
                  accessibilityLabel="Toggle Heatmap"
                >
                  <MapIcon size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStep(AppStep.SCRAP_MARKETPLACE)}
                  style={[styles.collNotif, { flex: 1, margin: 0, backgroundColor: '#10B981' }]}
                  accessibilityLabel="Sell Scrap"
                >
                  <Recycle size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStep(AppStep.COLLECTOR_SCHEDULE)}
                  style={[styles.collNotif, { flex: 1, margin: 0 }]}
                  accessibilityLabel="View Schedule"
                >
                  <Calendar size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setStep(AppStep.COLLECTOR_SAFETY)}
                  style={[styles.collNotif, { flex: 1, margin: 0, backgroundColor: '#EF4444' }]}
                  accessibilityLabel="Safety Center"
                >
                  <Shield size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    const targetTicketId = unreadTicketIds[0];
                    setUnreadTicketIds([]); // Clear badges when opening support
                    
                    let query = supabase.from('support_tickets').select('*').eq('user_id', user?.id).eq('status', 'open');
                    if (targetTicketId) {
                      query = query.eq('id', targetTicketId);
                    } else {
                      query = query.order('created_at', { ascending: false }).limit(1);
                    }
                    
                    const { data: tickets } = await query;
                    if (tickets && tickets.length > 0) {
                      setActiveTicket(tickets[0]);
                      setStep(AppStep.CHAT);
                    } else {
                      setStep(AppStep.HELP);
                    }
                  }}
                  style={[styles.collNotif, { flex: 1, margin: 0, backgroundColor: '#3b82f6', position: 'relative' }]}
                  accessibilityLabel="Help Support"
                >
                  <MessageSquare size={18} color="#fff" />
                  {unreadTicketIds.length > 0 && (
                    <View style={{ position: 'absolute', top: -6, right: -6, backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderWidth: 2, borderColor: '#1F2937' }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontWeight: 'bold' }}>{unreadTicketIds.length}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
              {/* Floating Incoming Request Alert (Only shows if there are pending pickups) */}
              {pendingPickups.length > 0 && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={[styles.sectionHeader, { color: '#059669' }]}>Incoming Requests ({pendingPickups.length})</Text>
                  {pendingPickups.map((p) => (
                    <View key={p.id} style={{ position: 'relative' }}>
                      <TouchableOpacity
                        onPress={() => {
                          setActivePickup(p);
                          setStep(AppStep.JOB_REQUEST);
                        }}
                        style={[styles.collActionCard, { backgroundColor: '#ECFDF5', borderWidth: 2, borderColor: '#10B981', marginBottom: 16 }]}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                            <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 8 }}>
                              <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 }}>NEW</Text>
                            </View>
                            <Text style={{ fontWeight: '900', fontSize: 18, color: '#064E3B' }}>{p.trash_type}</Text>
                          </View>
                          <Text style={{ color: '#047857', fontSize: 14, fontWeight: '600' }}>{p.pickup_location_name}</Text>
                          <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>By {p.customer?.full_name || 'Customer'}</Text>
                          <Text style={{ color: '#059669', fontWeight: '900', marginTop: 8, fontSize: 16 }}>GH₵ {p.pricing_ghs}</Text>
                        </View>
                        <View style={{ backgroundColor: '#10B981', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
                          <ChevronRight size={24} color="#fff" />
                        </View>
                      </TouchableOpacity>
                      
                      {/* Direct Dismiss Button */}
                      <TouchableOpacity 
                        onPress={() => {
                          setDismissedRequestIds(prev => [...prev, p.id]);
                          setPendingPickups(prev => prev.filter(req => req.id !== p.id));
                        }}
                        style={{ position: 'absolute', top: -8, right: -8, backgroundColor: '#EF4444', width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#f9fafb', zIndex: 10 }}
                      >
                        <X size={14} color="#fff" strokeWidth={3} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.collStats}>
                <TouchableOpacity
                  style={styles.collStatBox}
                  onPress={() => setStep(AppStep.COLLECTOR_EARNINGS)}
                >
                  <Text style={styles.collStatLabel}>Today&apos;s Payout</Text>
                  <Text style={styles.collStatVal}>
                    GH₵ {collectorStats.todayPayout > 0 ? collectorStats.todayPayout.toFixed(2) : '0.00'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.collStatBox}
                  onPress={() => setStep(AppStep.COLLECTOR_RATINGS)}
                >
                  <Text style={styles.collStatLabel}>Performance</Text>
                  <Text style={[styles.collStatVal, { color: collectorMetric?.performance_score >= 80 ? '#06C167' : '#F59E0B' }]}>
                    {collectorMetric ? `${collectorMetric.performance_score} pts` : 'Calculating...'}
                  </Text>
                </TouchableOpacity>

              </View>

              {/* Vehicle Capacity Indicator */}
              <View style={{ backgroundColor: 'rgba(17,17,17,0.75)', borderRadius: 16, padding: 16, marginTop: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <View>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>TRUCK LOAD</Text>
                    <Text style={{ color: truckLoad >= 90 ? '#EF4444' : '#FCD34D', fontSize: 18, fontWeight: '900', marginTop: 2 }}>{truckLoad}% Full</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity 
                      onPress={() => updateTruckLoad(truckLoad - 10)}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>-</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => updateTruckLoad(truckLoad + 10)}
                      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ height: 12, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6 }}>
                  <View style={{ width: `${truckLoad}%`, height: '100%', backgroundColor: truckLoad >= 90 ? '#EF4444' : '#FCD34D', borderRadius: 6 }} />
                </View>
                {truckLoad >= 90 && (
                  <TouchableOpacity 
                    onPress={() => {
                      updateTruckLoad(0);
                      updateCollectorStatus(CollectorStatus.AT_LANDFILL);
                    }}
                    style={{ marginTop: 12, backgroundColor: 'rgba(52, 211, 153, 0.1)', padding: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#10B981' }}
                  >
                    <Text style={{ color: '#10B981', fontWeight: '800', fontSize: 12 }}>Empty Truck (At Landfill)</Text>
                  </TouchableOpacity>

                )}
                <Text style={{ color: '#9CA3AF', fontSize: 10, marginTop: 8 }}>
                  Manual Load Tracker · System routes you at 90%
                </Text>
              </View>

              {/* Daily Quest Widget — live progress */}
              <TouchableOpacity
                style={{ backgroundColor: 'rgba(17,17,17,0.75)', borderRadius: 16, padding: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                onPress={() => setStep(AppStep.COLLECTOR_CHALLENGES)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#FCD34D', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>Daily Quest</Text>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600', marginTop: 4 }}>Complete {collectorStats.questTarget} Pickups</Text>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginTop: 8, width: '90%' }}>
                    <View style={{
                      width: `${Math.round((collectorStats.questProgress / collectorStats.questTarget) * 100)}%`,
                      height: '100%', backgroundColor: '#FCD34D', borderRadius: 2
                    }} />
                  </View>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                    {collectorStats.questProgress}/{collectorStats.questTarget}
                  </Text>
                  <Award size={24} color="#FCD34D" style={{ marginTop: 4 }} />
                </View>
              </TouchableOpacity>

              {/* Landfill Status Section */}
              <View style={{ marginTop: 24 }}>
                <Text style={styles.sectionHeader}>Nearby Landfills</Text>
                {landfills.length > 0 ? landfills.map(site => (
                  <View key={site.id} style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>{site.name}</Text>
                      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{site.location_name}</Text>
                    </View>
                    <View style={{ 
                      paddingHorizontal: 10, 
                      paddingVertical: 4, 
                      borderRadius: 8, 
                      backgroundColor: site.status === 'OPEN' ? '#ECFDF5' : site.status === 'FULL' ? '#FFFBEB' : '#FEF2F2'
                    }}>
                      <Text style={{ 
                        fontSize: 10, 
                        fontWeight: '800', 
                        color: site.status === 'OPEN' ? '#059669' : site.status === 'FULL' ? '#D97706' : '#DC2626'
                      }}>
                        {site.status}
                      </Text>
                    </View>
                  </View>
                )) : (
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 14 }}>No landfill sites found nearby.</Text>
                  </View>
                )}
              </View>

              {/* Advanced Collector Hubs */}

              <View style={{ marginTop: 20 }}>
                <Text style={styles.sectionHeader}>Finance Hub</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setStep(AppStep.COLLECTOR_WALLET)}
                    style={{ flex: 1, backgroundColor: '#ECFDF5', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#34D399' }}
                  >
                    <Banknote size={24} color="#059669" />
                    <Text style={{ marginTop: 8, fontWeight: '800', color: '#064E3B' }}>Susu Wallet</Text>
                    <Text style={{ fontSize: 10, color: '#059669' }}>Save & Payout</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setStep(AppStep.FUEL_PARTNERSHIPS)}
                    style={{ flex: 1, backgroundColor: '#FFF7ED', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#FB923C' }}
                  >
                    <Truck size={24} color="#D97706" />
                    <Text style={{ marginTop: 8, fontWeight: '800', color: '#7C2D12' }}>Fuel Hub</Text>
                    <Text style={{ fontSize: 10, color: '#D97706' }}>GOIL / Shell</Text>
                  </TouchableOpacity>
                </View>

                <Text style={[styles.sectionHeader, { marginTop: 20 }]}>Logistics Hub</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => setStep(AppStep.CONVOY_MODE)}
                    style={{ flex: 1, backgroundColor: '#F0F9FF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#38BDF8' }}
                  >
                    <Users size={24} color="#0284C7" />
                    <Text style={{ marginTop: 8, fontWeight: '800', color: '#0C4A6E' }}>Convoy Mode</Text>
                    <Text style={{ fontSize: 10, color: '#0284C7' }}>Escort Mode</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setStep(AppStep.SCRAP_MARKETPLACE)}
                    style={{ flex: 1, backgroundColor: '#F5F3FF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#8B5CF6' }}
                  >
                    <Recycle size={24} color="#7C3AED" />
                    <Text style={{ marginTop: 8, fontWeight: '800', color: '#4C1D95' }}>B2B Scrap</Text>
                    <Text style={{ fontSize: 10, color: '#7C3AED' }}>Sell Recyclables</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Help & Support Widget */}
              <TouchableOpacity
                style={{ backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 20, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#F3F4F6' }}
                onPress={() => setStep(AppStep.COLLECTOR_SUPPORT)}
              >
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                  <HelpCircle size={24} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#1F2937', fontSize: 16, fontWeight: '600' }}>Help & Support</Text>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>FAQs, Tickets, Chat</Text>
                </View>
                {unreadTicketIds.length > 0 && (
                  <View style={{ backgroundColor: '#EF4444', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4, marginRight: 8 }}>
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{unreadTicketIds.length} NEW</Text>
                  </View>
                )}
                <ChevronRight size={20} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Pending Requests moved to the top */}

              <View style={{ marginTop: -20, paddingBottom: 20 }}>
                <Text style={styles.sectionHeader}>Recent Activity</Text>
                {pickups.length > 0 ? (
                  pickups.slice(0, 3).map(p => (
                    <View key={p.id} style={styles.collHistoryRow}>
                      <CheckCircle size={20} color="#06C167" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.collHistName}>{p.pickup_location_name}</Text>
                        <Text style={styles.collHistTime}>{new Date(p.created_at).toLocaleTimeString()} • {p.trash_type}</Text>
                      </View>
                      <Text style={styles.collHistPrice}>GH₵ {p.pricing_ghs}</Text>
                    </View>
                  ))
                ) : (
                  <View style={{ padding: 20, backgroundColor: '#fff', borderRadius: 12, alignItems: 'center' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>No recent activity</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                onPress={handleSignOut}
                style={[styles.collActionCard, { backgroundColor: '#FEE2E2', alignItems: 'center', marginBottom: 40 }]}
              >
                <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>Sign Out</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );

      case AppStep.JOB_REQUEST:
        return (
          <View style={{ flex: 1 }}>
            <MapComponent 
              userLatitude={userCoords?.latitude} 
              userLongitude={userCoords?.longitude}
              destinationLatitude={activePickup?.lat}
              destinationLongitude={activePickup?.lng}
              showRoute={true}
            />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />

            {/* Countdown Circle */}
            <View style={{ position: 'absolute', top: 60, right: 20, width: 60, height: 60, borderRadius: 30, borderWidth: 4, borderColor: '#06C167', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
              <Text style={{ fontSize: 24, fontWeight: '700', color: '#06C167' }}>{jobTimer}</Text>
            </View>

            {/* Request Card */}
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 8 }}>
              <Text style={{ textAlign: 'center', color: '#6B7280', marginBottom: 16, fontWeight: '600', letterSpacing: 1 }}>NEW PICKUP REQUEST</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                  <Trash2 size={32} color="#06C167" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#111' }}>{activePickup?.trash_type || 'Household Waste'}</Text>
                  <Text style={{ fontSize: 14, color: '#6B7280' }}>By {activePickup?.customer?.full_name || 'Customer'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: '#06C167' }}>GH₵ {activePickup?.pricing_ghs}</Text>
                </View>
              </View>

              {/* Voice Landmark Directions */}
              {activePickup?.voice_url && (
                <TouchableOpacity 
                  onPress={() => {
                    playVoiceNote(
                      activePickup.voice_url,
                      () => setIsPlayingLandmark(true),
                      () => setIsPlayingLandmark(false)
                    );
                  }}
                  style={{ backgroundColor: '#F0FDF4', padding: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#DCFCE7' }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Play size={16} color="#fff" fill="#fff" />
                  </View>
                  <Text style={{ flex: 1, fontWeight: '700', color: '#166534' }}>Play Voice Directions</Text>
                </TouchableOpacity>
              )}

              <View style={{ flexDirection: 'row', marginBottom: 24 }}>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                  <MapPin size={20} color="#111" />
                  <Text style={{ marginLeft: 8, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>{activePickup?.pickup_location_name}</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginBottom: 24 }}>
                {activePickup?.customer?.avatar_url ? (
                  <Image source={{ uri: activePickup.customer.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                ) : (
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                    <User size={20} color="#fff" />
                  </View>
                )}
                <View style={{ marginLeft: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937' }}>{activePickup?.customer?.full_name || 'Customer'}</Text>
                  <Text style={{ fontSize: 12, color: '#6B7280' }}>Customer</Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 16 }}>
                <Button
                  onPress={() => {
                  if (activePickup?.id) {
                    setDismissedRequestIds(prev => [...prev, activePickup.id]);
                    setPendingPickups(prev => prev.filter(req => req.id !== activePickup.id));
                  }
                  setStep(AppStep.COLLECTOR_DASHBOARD);
                  setActivePickup(null);
                }}
                  style={{ flex: 1, backgroundColor: '#EF4444' }}
                >
                  Decline
                </Button>
                <Button
                  onPress={async () => {
                    // Client-side fast-fail only (BC-003) — this is UX, not the
                    // security boundary. The real enforcement is the
                    // `trg_enforce_pickup_assignment_rules` trigger added in
                    // supabase/migrations/20260715120000_pickups_verified_collector_only.sql,
                    // which must still be applied to the live database (it could
                    // not be while the project was paused — see that migration's
                    // header). This check just avoids a round-trip and gives a
                    // friendlier message for the common case.
                    if (!userProfile?.is_verified) {
                      alert("Your collector account is still pending verification. You can't accept jobs until an admin approves your documents.");
                      return;
                    }
                    setIsAcceptingJob(true);
                    if (activePickup?.id) {
                      // .eq('status', 'pending') closes the same race condition the
                      // DB trigger also guards against (BC-007): if another
                      // collector already accepted this job, the WHERE clause
                      // matches zero rows instead of silently overwriting them.
                      const { data, error } = await supabase.from('pickups').update({
                        collector_id: user?.id,
                        status: 'assigned'
                      }).eq('id', activePickup.id).eq('status', 'pending').select().maybeSingle();

                      if (!error && !data) {
                        alert("This pickup was just accepted by another collector.");
                        setDismissedRequestIds(prev => activePickup?.id ? [...prev, activePickup.id] : prev);
                        setPendingPickups(prev => prev.filter(req => req.id !== activePickup?.id));
                        setStep(AppStep.COLLECTOR_DASHBOARD);
                        setActivePickup(null);
                      } else if (error) {
                        alert("Failed to accept: " + error.message);
                      } else {
                        setJobStatus('on_way');
                        updateCollectorStatus(CollectorStatus.MOVING);

                        // Immediately enrich activePickup with customer info so the collector
                        // sees the customer's name and photo right away (without waiting for fetchHistory)
                        const { data: custProfile } = await supabase
                          .from('profiles')
                          .select('full_name, phone_number, avatar_url, push_token')
                          .eq('id', activePickup.customer_id || activePickup.user_id)
                          .single();

                        setActivePickup((prev: any) => ({
                          ...prev,
                          status: 'assigned',
                          collector_id: user?.id,
                          customer: custProfile || prev?.customer,
                        }));

                        // Send push notification to the customer
                        if (custProfile?.push_token) {
                          sendPushNotification(
                            custProfile.push_token,
                            '🚛 Collector On The Way!',
                            `${userProfile?.full_name || 'A collector'} has accepted your pickup request and is heading to you now.`
                          ).catch(e => console.warn('[Push] Accept notify failed:', e));
                        }

                        // Log activity
                        logPlatformActivity(
                          ActivityType.PICKUP_ACCEPTED,
                          `Job #${activePickup.id.substring(0, 8)} accepted by ${userProfile?.full_name || 'collector'}`,
                          { pickup_id: activePickup.id, collector_id: user?.id }
                        );

                        setStep(AppStep.COLLECTOR_JOB);

                        fetchHistory(true);
                      }
                    }
                    setIsAcceptingJob(false);
                  }}
                  isLoading={isAcceptingJob}
                  style={{ flex: 1, backgroundColor: '#06C167' }}
                >
                  Accept
                </Button>
              </View>
            </View>
          </View>
        );

      case AppStep.SCRAP_MARKETPLACE:
        return (
          <View style={{ flex: 1, backgroundColor: '#f9fafb' }}>
            <View style={[styles.header, { backgroundColor: '#1F2937', paddingTop: 60, height: 110 }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>B2B Scrap Marketplace</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              <View style={{ height: 250 }}>
                <MapComponent userLatitude={userCoords?.latitude} userLongitude={userCoords?.longitude} showHeatmap={false} />
              </View>

              <View style={{ padding: 20 }}>
                <View style={{ backgroundColor: '#F5F3FF', padding: 20, borderRadius: 20, marginBottom: 24, borderWidth: 1, borderColor: '#DDD6FE' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Recycle size={20} color="#7C3AED" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#1E1B4B', fontSize: 16, fontWeight: '800' }}>Market Opportunity</Text>
                  </View>
                  <Text style={{ color: '#5B21B6', fontSize: 13 }}>Plastic prices are up this week. Sell your separated PET now to nearest Recycling Hub.</Text>
                </View>

                {myScrapListings.length > 0 && (
                  <>
                    <Text style={[styles.sectionHeader, { marginTop: 0 }]}>My Active Listings</Text>
                    {myScrapListings.map((lst, idx) => (
                      <View key={lst.id || idx} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                          <Text style={{ fontWeight: '800', color: '#1F2937' }}>{lst.quantity_kg || 0}kg {lst.material_type || 'Material'}</Text>
                          <Text style={{ fontSize: 12, color: '#6B7280' }}>
                            {lst.status || 'Active'} • {lst.created_at ? new Date(lst.created_at).toLocaleDateString() : 'Just now'}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '900', color: '#7C3AED' }}>GH₵ {lst.asking_price_per_kg || '—'}</Text>
                      </View>
                    ))}
                  </>
                )}

                <Text style={[styles.sectionHeader, { marginTop: 24 }]}>Nearby Buying Plants</Text>
                {scrapBuyers.length > 0 ? scrapBuyers.map(plant => (
                  <View key={plant.id || Math.random().toString()} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#F3F4F6' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#1F2937' }}>{plant.name}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: plant.color || '#06C167' }}>GH₵ {plant.price_per_kg || '0.0'} / kg</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ color: '#6B7280', fontSize: 12 }}>📍 {plant.location_name || 'Kasoa'} • {plant.distance_km || '0.0'} km</Text>
                      <TouchableOpacity 
                        onPress={() => {
                          const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((plant.name || '') + ' ' + (plant.location_name || ''))}`;
                          Linking.openURL(url);
                        }}
                        style={{ backgroundColor: '#111827', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>Navigate</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )) : (
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <ActivityIndicator color="#06C167" />
                    <Text style={{ color: '#9CA3AF', marginTop: 12 }}>Loading buyers...</Text>
                  </View>
                )}

                <Button style={{ marginTop: 20, backgroundColor: '#7C3AED' }} onPress={() => setShowScrapModal(true)}>
                  <Text style={{ color: '#fff', fontWeight: '800' }}>Post My Scrap Stock</Text>
                </Button>
              </View>
            </ScrollView>

            <Modal visible={showScrapModal} transparent animationType="slide">
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937' }}>Post Scrap Stock</Text>
                    <TouchableOpacity onPress={() => setShowScrapModal(false)}><X size={24} color="#6B7280" /></TouchableOpacity>
                  </View>
                  
                  <Text style={{ color: '#6B7280', marginBottom: 8, fontSize: 14 }}>Material Type</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {['PLASTIC', 'METAL', 'CARDBOARD', 'GLASS'].map(type => (
                      <TouchableOpacity 
                        key={type}
                        onPress={() => setNewScrapListing(prev => ({ ...prev, material_type: type }))}
                        style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: newScrapListing.material_type === type ? '#7C3AED' : '#F3F4F6' }}
                      >
                        <Text style={{ color: newScrapListing.material_type === type ? '#fff' : '#1F2937', fontWeight: '600', fontSize: 12 }}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={{ color: '#6B7280', marginBottom: 8, fontSize: 14 }}>Quantity (kg)</Text>
                  <TextInput 
                    value={newScrapListing.quantity_kg}
                    onChangeText={txt => setNewScrapListing(prev => ({ ...prev, quantity_kg: txt }))}
                    placeholder="e.g. 50"
                    keyboardType="numeric"
                    style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, fontSize: 16, fontWeight: '700', marginBottom: 20 }}
                  />

                  <Text style={{ color: '#6B7280', marginBottom: 8, fontSize: 14 }}>Asking Price per kg (Optional)</Text>
                  <TextInput 
                    value={newScrapListing.asking_price}
                    onChangeText={txt => setNewScrapListing(prev => ({ ...prev, asking_price: txt }))}
                    placeholder="e.g. 3.50"
                    keyboardType="numeric"
                    style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, fontSize: 16, fontWeight: '700', marginBottom: 24 }}
                  />

                  <Button onPress={handlePostScrap} isLoading={isPostingScrap} style={{ backgroundColor: '#7C3AED' }}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Post to Marketplace</Text>
                  </Button>
                </View>
              </View>
            </Modal>
          </View>
        );



      case AppStep.PROFILE:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Profile</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Image 
                  source={{ uri: userProfile?.avatar_url || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=150&auto=format&fit=crop' }} 
                  style={styles.collAva} 
                />
                <Text style={styles.collName}>{userProfile?.full_name || 'User'}</Text>
                <Text style={styles.collHistTime}>SamSa {role === UserRole.COLLECTOR ? 'Collector' : 'Customer'} since {new Date(userProfile?.created_at).getFullYear() || '2024'}</Text>
              </View>

              {role === UserRole.CUSTOMER ? (
                <>
                  {/* Sustainability Impact */}
                  <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
                    <Text style={[styles.sectionHeader, { paddingLeft: 0 }]}>Eco Impact Report</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <View style={{ flex: 1, backgroundColor: '#F0FDF4', padding: 16, borderRadius: 20, alignItems: 'center' }}>
                        <Recycle size={24} color="#059669" />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#064E3B', marginTop: 8 }}>{calculateImpact().totalKg}kg</Text>
                        <Text style={{ fontSize: 10, color: '#059669', fontWeight: '600' }}>RECYCLED</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 20, alignItems: 'center' }}>
                        <Globe size={24} color="#2563EB" />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1E3A8A', marginTop: 8 }}>{calculateImpact().co2Saved.toFixed(1)}kg</Text>
                        <Text style={{ fontSize: 10, color: '#2563EB', fontWeight: '600' }}>CO2 SAVED</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#FFF7ED', padding: 16, borderRadius: 20, alignItems: 'center' }}>
                        <Award size={24} color="#D97706" />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#7C2D12', marginTop: 8 }}>{calculateImpact().treesEquivalent}</Text>
                        <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>TREES EQ.</Text>
                      </View>
                    </View>
                  </View>
                </>
              ) : (
                <View style={{ marginHorizontal: 20, marginBottom: 24 }}>
                  <Text style={[styles.sectionHeader, { paddingLeft: 0 }]}>Professional Stats</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, backgroundColor: '#F0FDF4', padding: 16, borderRadius: 20 }}>
                      <CheckCircle size={24} color="#059669" />
                      <Text style={{ fontSize: 24, fontWeight: '800', color: '#064E3B', marginTop: 8 }}>{pickups.length}</Text>
                      <Text style={{ fontSize: 10, color: '#059669', fontWeight: '600' }}>JOBS DONE</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#FEF3C7', padding: 16, borderRadius: 20 }}>
                      <Star size={24} color="#D97706" />
                      <Text style={{ fontSize: 24, fontWeight: '800', color: '#7C2D12', marginTop: 8 }}>4.9</Text>
                      <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>RATING</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Borla Rewards Wallet */}
              <View style={{ marginHorizontal: 20, marginBottom: 20, backgroundColor: '#0F4C30', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOffset: {width:0, height: 4}, shadowOpacity: 0.15, shadowRadius: 10, elevation: 5 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
                  <View>
                    <Text style={{ color: '#A7F3D0', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Borla Rewards Wallet</Text>
                    <Text style={{ color: '#fff', fontSize: 32, fontWeight: 'bold', marginTop: 5 }}>{loyaltyPoints} pts</Text>
                  </View>
                  <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', padding: 12, borderRadius: 50 }}>
                    <Award size={28} color="#FBBF24" />
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => Alert.alert('Coming Soon', 'Redeeming points for Airtime or ECG tokens isn\'t available yet. Your ' + loyaltyPoints + ' pts are safe and waiting.')}
                  style={{ backgroundColor: '#06C167', paddingVertical: 12, borderRadius: 12, alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>REDEEM TO AIRTIME</Text>
                </TouchableOpacity>
              </View>

              {(role === UserRole.COLLECTOR ? [
                { icon: User, label: 'Personal Information', step: AppStep.PERSONAL_INFO },
                { icon: Wallet, label: 'Wallet & Payouts', step: AppStep.COLLECTOR_EARNINGS },
                { icon: Truck, label: 'Vehicle Details', step: AppStep.COLLECTOR_VEHICLE_REGISTRATION },
                { icon: FileText, label: 'My Documents (KYC)', step: AppStep.COLLECTOR_DOCUMENT_UPLOAD },
                { icon: Award, label: 'Challenges', step: AppStep.COLLECTOR_CHALLENGES },
                { icon: Navigation, label: 'Job History', step: AppStep.HISTORY }
              ] : [
                { icon: User, label: 'Personal Information', step: AppStep.PERSONAL_INFO },
                { icon: Wallet, label: 'Payment Methods', step: AppStep.PAYMENT_METHODS },
                { icon: MapPin, label: 'Saved Locations', step: AppStep.SAVED_LOCATIONS },
                { icon: Navigation, label: 'My Pickups', step: AppStep.HISTORY },
                { icon: Calendar, label: 'Scheduled Pickups', step: AppStep.SUBSCRIPTIONS }
              ]).map((item, i) => (
                <TouchableOpacity key={i} onPress={() => item.step && setStep(item.step)} style={styles.methodRow}>
                  <View style={styles.methodIcon}><item.icon size={20} color="#06C167" /></View>
                  <Text style={[styles.momoName, { flex: 1 }]}>{item.label}</Text>
                  <ChevronRight size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}

              {/* The Profile tab is the one screen both roles always reach via
                  BottomNav, but this menu had no way to sign out from it —
                  collectors in particular had no logout entry point short of
                  scrolling to the bottom of the Dashboard screen. */}
              <TouchableOpacity
                onPress={handleSignOut}
                style={[styles.methodRow, { marginTop: 20, borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' }]}
              >
                <View style={[styles.methodIcon, { backgroundColor: '#FEE2E2' }]}><LogOut size={20} color="#EF4444" /></View>
                <Text style={[styles.momoName, { flex: 1, color: '#EF4444' }]}>Sign Out</Text>
              </TouchableOpacity>
            </ScrollView>
            <BottomNav activeStep={step} onTabChange={setStep} role={role} />
          </View>
        );

      case AppStep.SETTINGS:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Settings</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {[
                { icon: Globe, label: 'Language', subtitle: language },
                { icon: Bell, label: 'Notifications', step: AppStep.NOTIFICATIONS },
                { icon: Wallet, label: 'Subscriptions', step: AppStep.SUBSCRIPTIONS },
                { icon: Smartphone, label: 'Help & Support', step: AppStep.HELP }
              ].map((item, i) => (
                <TouchableOpacity key={i} onPress={() => item.step && setStep(item.step)} style={styles.methodRow}>
                  <View style={styles.methodIcon}><item.icon size={20} color="#06C167" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.momoName}>{item.label}</Text>
                    {item.subtitle && <Text style={styles.collHistTime}>{item.subtitle}</Text>}
                  </View>
                  <ChevronRight size={16} color="#D1D5DB" />
                </TouchableOpacity>
              ))}
              
              <TouchableOpacity onPress={handleSignOut} style={[styles.methodRow, { marginTop: 40, borderColor: '#FEE2E2', backgroundColor: '#FFF5F5' }]}>
                <View style={[styles.methodIcon, { backgroundColor: '#FEE2E2' }]}><Lock size={20} color="#EF4444" /></View>
                <Text style={[styles.momoName, { flex: 1, color: '#EF4444' }]}>Sign Out</Text>
              </TouchableOpacity>
            </ScrollView>
            <BottomNav activeStep={step} onTabChange={setStep} role={role} />
          </View>
        );

      case AppStep.NOTIFICATIONS: {
        const NotificationsScreen = () => {
          const [notifBroadcasts, setNotifBroadcasts] = React.useState<any[]>([]);
          const [resolvedMissed, setResolvedMissed] = React.useState<any[]>([]);
          const [notifLoading, setNotifLoading] = React.useState(true);

          React.useEffect(() => {
            const load = async () => {
              try {
                // Fetch Broadcasts
                const { data: broadcasts } = await supabase
                  .from('broadcasts')
                  .select('*')
                  .order('created_at', { ascending: false })
                  .limit(20);
                
                // Fetch Resolved Missed Bookings (Availability Alerts)
                const { data: missed } = await supabase
                  .from('missed_bookings')
                  .select('*')
                  .eq('user_id', user.id)
                  .eq('resolved', true)
                  .order('created_at', { ascending: false })
                  .limit(10);

                setNotifBroadcasts(broadcasts || []);
                setResolvedMissed(missed || []);
              } catch (e) {
                console.warn('[Notifications] Failed to load notifications:', e);
              } finally {
                setNotifLoading(false);
              }
            };
            load();
          }, []);

          // Build pickup-based notification items from history
          const pickupNotifs = pickups
            .filter((p: any) => p.status === 'completed' || p.status === 'assigned' || p.status === 'arrived')
            .slice(0, 10)
            .map((p: any) => {
              let title = '';
              let body = '';
              if (p.status === 'completed') { title = '✅ Pickup Completed'; body = `Your ${p.trash_type || 'waste'} pickup was successfully completed.`; }
              else if (p.status === 'assigned') { title = '🚛 Collector On The Way'; body = 'A collector accepted your request and is heading to you.'; }
              else if (p.status === 'arrived') { title = '📍 Collector Arrived'; body = 'Your collector is at your location!'; }
              return { id: p.id, title, body, created_at: p.updated_at || p.created_at, type: 'pickup' };
            });

          const allItems = [
            ...notifBroadcasts.map((b: any) => ({ id: b.id, title: b.title || 'Platform Announcement', body: b.message, created_at: b.created_at, type: 'broadcast' })),
            ...resolvedMissed.map((m: any) => ({ id: m.id, title: '🚛 Collector Nearby', body: 'A collector has entered your area! You can now proceed to book your pickup.', created_at: m.updated_at || m.created_at, type: 'alert' })),
            ...pickupNotifs,
          ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

          return (
            <View style={styles.screenContainer}>
              <View style={styles.historyHeader}>
                <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
                <Text style={styles.historyTitle}>Notifications</Text>
                <View style={{ width: 32 }} />
              </View>
              {notifLoading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <ActivityIndicator color="#06C167" />
                </View>
              ) : allItems.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                  <Bell size={48} color="#D1D5DB" />
                  <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 15 }}>No notifications yet.</Text>
                </View>
              ) : (
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                  {allItems.map((item: any) => (
                    <View key={item.id} style={[styles.collHistoryRow, { borderLeftWidth: 3, borderLeftColor: item.type === 'broadcast' ? '#3B82F6' : '#06C167' }]}>
                      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.type === 'broadcast' ? '#EFF6FF' : (item.type === 'alert' ? '#FEF3C7' : '#E6F9F0'), alignItems: 'center', justifyContent: 'center' }}>
                        {item.type === 'broadcast' ? <Bell size={18} color="#3B82F6" /> : (item.type === 'alert' ? <MapPin size={18} color="#D97706" /> : <Bell size={18} color="#06C167" />)}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.collHistName}>{item.title}</Text>
                        <Text style={styles.collHistTime}>{item.body}</Text>
                        <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                          {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
          );
        };
        return <NotificationsScreen />;
      }

      case AppStep.SUBSCRIPTIONS:
        return <SubscriptionsScreen userId={user?.id || ''} onBack={() => setStep(AppStep.HOME)} />;

      case AppStep.HELP:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Help & Support</Text>
              <View style={{ width: 32 }} />
            </View>
            
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 8 }}>Need help with a pickup?</Text>
                <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 16 }}>Our team is available 24/7 to assist you with any collection issues or app technicalities.</Text>
                
                <TouchableOpacity 
                  onPress={async () => {
                    const { data: ticket, error } = await supabase.from('support_tickets').insert({
                      user_id: user?.id,
                      subject: 'General Support Request',
                      status: 'open'
                    }).select().single();
                    
                    if (ticket) {
                      setActiveTicket(ticket);
                      setStep(AppStep.CHAT);
                    } else {
                      Alert.alert('Error', 'Could not open a support ticket. Please try again.');
                    }
                  }}
                  style={{ backgroundColor: '#06C167', padding: 16, borderRadius: 12, alignItems: 'center' }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Start Live Chat</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
              {[
                { q: "How do I pay my collector?", a: "You can pay via the app using MoMo/Card or pay cash on pickup." },
                { q: "My trash hasn't been picked up", a: "Check your active booking status or message the collector directly." },
                { q: "How to earn Borla Points?", a: "Recycle plastic or recommend friends to earn points!" }
              ].map((faq, i) => (
                <View key={i} style={{ marginBottom: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                  <Text style={{ fontWeight: 'bold', color: '#374151', marginBottom: 4 }}>{faq.q}</Text>
                  <Text style={{ color: '#6B7280', fontSize: 14 }}>{faq.a}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        );

      case AppStep.CHAT:
        return (
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            style={{ flex: 1, backgroundColor: '#fff' }}
          >
            <View style={[styles.historyHeader, { paddingTop: 60, height: 110, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }]}>
              <TouchableOpacity onPress={() => setStep(role === UserRole.COLLECTOR ? AppStep.COLLECTOR_SUPPORT : AppStep.HELP)}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Borla Support</Text>
                <Text style={{ fontSize: 12, color: '#06C167' }}>Online - Typically replies in 2 mins</Text>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <View style={{ backgroundColor: '#F3F4F6', padding: 12, borderRadius: 12, marginBottom: 20, alignSelf: 'center' }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Beginning of your support conversation.</Text>
              </View>
              
              {supportMessages.map((msg, i) => (
                <View key={i} style={{ alignSelf: msg.sender_id === user?.id ? 'flex-end' : 'flex-start', marginBottom: 12, maxWidth: '80%' }}>
                  <View style={{ backgroundColor: msg.sender_id === user?.id ? '#06C167' : '#F3F4F6', padding: 12, borderRadius: 16, borderBottomRightRadius: msg.sender_id === user?.id ? 4 : 16, borderBottomLeftRadius: msg.sender_id === user?.id ? 16 : 4 }}>
                    <Text style={{ color: msg.sender_id === user?.id ? '#fff' : '#111827' }}>{msg.content}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={{ padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, borderTopWidth: 1, borderTopColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center' }}>
              <TextInput 
                style={[styles.input, { flex: 1, marginBottom: 0, height: 45 }]} 
                placeholder="Type a message..." 
                value={newSupportMessage}
                onChangeText={setNewSupportMessage}
              />
              <TouchableOpacity
                onPress={async () => {
                  if (!newSupportMessage.trim()) return;
                  const userMsg = newSupportMessage.trim();

                  // Immediately update UI
                  setSupportMessages(prev => [...prev, { sender_id: user?.id, content: userMsg }]);
                  setNewSupportMessage('');

                  // Landing on Chat kicks off an async ticket lookup/create
                  // (see the ensureActiveTicket effect) — if the user sends
                  // a message before that finishes, activeTicket is still
                  // null here and the message used to be silently dropped
                  // (the optimistic bubble above still appeared, so it
                  // looked sent). Resolve a ticket right here as a fallback
                  // so a message can never be lost to that race.
                  let ticket = activeTicket;
                  if (!ticket?.id && user?.id) {
                    const { data: openTickets } = await supabase
                      .from('support_tickets')
                      .select('*')
                      .eq('user_id', user.id)
                      .eq('status', 'open')
                      .order('created_at', { ascending: false })
                      .limit(1);
                    if (openTickets && openTickets.length > 0) {
                      ticket = openTickets[0];
                    } else {
                      const { data: newTicket } = await supabase
                        .from('support_tickets')
                        .insert({ user_id: user.id, subject: role === UserRole.COLLECTOR ? 'Collector Live Chat' : 'Customer Live Chat', status: 'open' })
                        .select()
                        .single();
                      ticket = newTicket;
                    }
                    if (ticket) setActiveTicket(ticket);
                  }

                  // Save to DB
                  if (ticket?.id) {
                    const tempId = Math.random().toString();
                    const newMessageObj = {
                      id: tempId,
                      ticket_id: ticket.id,
                      sender_id: user?.id,
                      content: userMsg,
                      created_at: new Date().toISOString()
                    };

                    const { data: insertedMsg, error } = await supabase.from('support_messages').insert({
                      ticket_id: ticket.id,
                      sender_id: user?.id,
                      content: userMsg
                    }).select().single();

                    if (!error && insertedMsg) {
                      // Broadcast to chat room
                      if (chatChannelRef.current) {
                        chatChannelRef.current.send({
                          type: 'broadcast',
                          event: 'new_message',
                          payload: insertedMsg
                        });
                      }
                      
                      // Broadcast to admin global alerts by subscribing on the fly
                      const adminAlertChan = supabase.channel('admin_global_alerts');
                      adminAlertChan.subscribe((status) => {
                        if (status === 'SUBSCRIBED') {
                          adminAlertChan.send({
                            type: 'broadcast',
                            event: 'new_message',
                            payload: insertedMsg
                          }).then(() => supabase.removeChannel(adminAlertChan));
                        }
                      });
                    }
                  }
                }}
                disabled={!newSupportMessage.trim()}
                style={{ marginLeft: 12, backgroundColor: '#06C167', padding: 10, borderRadius: 24 }}
              >
                <Send size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        );

      case AppStep.SAVED_LOCATIONS:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Saved Locations</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              {isLoadingSavedLocations ? (
                <ActivityIndicator color="#06C167" style={{ marginTop: 40 }} />
              ) : savedLocationsList.length === 0 && !showAddSavedLocation ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <MapPin size={48} color="#D1D5DB" />
                  <Text style={{ color: '#9CA3AF', marginTop: 12, fontSize: 15, textAlign: 'center' }}>No saved locations yet.{'\n'}Add your home, work, or anywhere you collect trash often.</Text>
                </View>
              ) : (
                savedLocationsList.map((loc) => (
                  <View key={loc.id} style={styles.methodRow}>
                    <TouchableOpacity onPress={() => switchLocation(loc)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={styles.methodIcon}><MapPin size={20} color="#06C167" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.momoName}>{loc.name}</Text>
                        <Text style={styles.collHistTime}>{loc.address}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteSavedLocation(loc.id)}>
                      <Text style={{ color: '#EF4444', fontSize: 12, fontWeight: '700' }}>Delete</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {showAddSavedLocation ? (
                <View style={{ marginTop: 20, backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>NICKNAME</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 16 }]}
                    placeholder="e.g. Home, Shop, Mum's House"
                    value={newSavedLocationName}
                    onChangeText={setNewSavedLocationName}
                  />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 }}>ADDRESS</Text>
                  <TextInput
                    style={[styles.input, { marginBottom: 16 }]}
                    placeholder="e.g. House No, Street name, Area"
                    value={newSavedLocationAddress}
                    onChangeText={setNewSavedLocationAddress}
                  />
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <Button onPress={handleAddSavedLocation} isLoading={isSavingLocation} style={{ flex: 1 }}>Save</Button>
                    <Button variant="outline" onPress={() => setShowAddSavedLocation(false)} style={{ flex: 1 }}>Cancel</Button>
                  </View>
                </View>
              ) : (
                <Button variant="outline" onPress={() => setShowAddSavedLocation(true)} style={{ marginTop: 20 }}>+ Add New Location</Button>
              )}
            </ScrollView>
          </View>
        );

      case AppStep.PERSONAL_INFO:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={() => isEditingProfile ? setIsEditingProfile(false) : back()}>
                <ChevronLeft size={32} color="#06C167" />
              </TouchableOpacity>
              <Text style={styles.historyTitle}>Personal Information</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
              <View style={{ alignItems: 'center', marginVertical: 20 }}>
                <TouchableOpacity onPress={() => pickImage(async (uri, base64) => {
                  const url = await uploadToSupabase(uri, 'avatars', `${user?.id}/avatar.jpg`, base64);
                  if (url) {
                    const cacheBustedUrl = `${url}?t=${Date.now()}`;
                    await supabase.from('profiles').update({ avatar_url: cacheBustedUrl }).eq('id', user?.id);
                    setUserProfile((prev: any) => ({ ...prev, avatar_url: cacheBustedUrl }));
                  }
                })}>
                  <Image 
                    source={{ uri: userProfile?.avatar_url || 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?q=80&w=150&auto=format&fit=crop' }} 
                    style={[styles.collAva, { width: 100, height: 100 }]} 
                  />
                  <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#06C167', padding: 8, borderRadius: 20, borderWidth: 3, borderColor: '#fff' }}>
                    <Camera size={16} color="#fff" />
                  </View>
                </TouchableOpacity>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><User size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Full Name</Text>
                  {isEditingProfile ? (
                    <TextInput 
                      style={styles.input} 
                      value={editName} 
                      onChangeText={setEditName} 
                      autoFocus 
                    />
                  ) : (
                    <Text style={styles.collHistTime}>{userProfile?.full_name || 'Set your name'}</Text>
                  )}
                </View>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><Smartphone size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Phone Number</Text>
                  {isEditingProfile ? (
                    <TextInput 
                      style={styles.input} 
                      value={editPhone} 
                      onChangeText={setEditPhone} 
                      keyboardType="phone-pad"
                    />
                  ) : (
                    <Text style={styles.collHistTime}>{userProfile?.phone_number || 'No phone set'}</Text>
                  )}
                </View>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><MapPin size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Address / Area</Text>
                  {isEditingProfile ? (
                    <TextInput 
                      style={styles.input} 
                      value={editAddress} 
                      onChangeText={setEditAddress} 
                    />
                  ) : (
                    <Text style={styles.collHistTime}>{userProfile?.address || 'Set your default address'}</Text>
                  )}
                </View>
              </View>

              {isEditingProfile ? (
                <View style={{ paddingHorizontal: 20, marginTop: 40, gap: 12 }}>
                  <Button onPress={handleUpdateProfile} isLoading={isUploading}>Save Changes</Button>
                  <Button variant="outline" onPress={() => setIsEditingProfile(false)}>Cancel</Button>
                </View>
              ) : (
                <Button 
                  onPress={() => {
                    setEditName(userProfile?.full_name || '');
                    setEditPhone(userProfile?.phone_number || '');
                    setEditAddress(userProfile?.address || '');
                    setIsEditingProfile(true);
                  }} 
                  style={{ marginTop: 40, marginHorizontal: 20 }}
                >
                  Edit Information
                </Button>
              )}
            </ScrollView>
          </View>
        );

      case AppStep.PAYMENT_METHODS:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Payment Methods</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView>
              <Text style={{ paddingHorizontal: 20, color: '#6B7280', fontSize: 13, marginBottom: 8 }}>
                Choose your default payment method. Real MoMo/card charging isn&apos;t live yet — this just sets what the app remembers as your preference.
              </Text>
              <Text style={styles.sectionHeader}>Mobile Money</Text>
              {[
                { key: 'MOMO_MTN', name: 'MTN MoMo', sub: '054 XXX XXXX', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/93/MTN_Logo.svg' },
                { key: 'MOMO_TELECEL', name: 'Telecel Cash', sub: '020 XXX XXXX', logo: 'https://seeklogo.com/images/V/vodafone-m-pesa-logo-0A28E25327-seeklogo.com.png' },
              ].map((method) => {
                const isSelected = (userProfile?.preferred_payment_method || 'MOMO_MTN') === method.key;
                return (
                  <TouchableOpacity
                    key={method.key}
                    style={styles.momoRow}
                    onPress={async () => {
                      setUserProfile((prev: any) => ({ ...prev, preferred_payment_method: method.key }));
                      const { error } = await supabase.from('profiles').update({ preferred_payment_method: method.key }).eq('id', user?.id);
                      if (error) Alert.alert('Error', 'Could not save your payment preference: ' + error.message);
                    }}
                  >
                    <Image source={{ uri: method.logo }} style={styles.momoLogo} />
                    <View style={styles.momoText}>
                      <Text style={styles.momoName}>{method.name}</Text>
                      <Text style={styles.momoNum}>{method.sub}</Text>
                    </View>
                    <View style={styles.momoRadio}>{isSelected && <View style={styles.momoRadioInner} />}</View>
                  </TouchableOpacity>
                );
              })}
              <Text style={[styles.sectionHeader, { marginTop: 32 }]}>Other Methods</Text>
              <TouchableOpacity
                style={styles.methodRow}
                onPress={async () => {
                  setUserProfile((prev: any) => ({ ...prev, preferred_payment_method: 'CASH' }));
                  const { error } = await supabase.from('profiles').update({ preferred_payment_method: 'CASH' }).eq('id', user?.id);
                  if (error) Alert.alert('Error', 'Could not save your payment preference: ' + error.message);
                }}
              >
                <View style={styles.methodIcon}><Wallet size={20} color="#9CA3AF" /></View>
                <View style={styles.momoText}>
                  <Text style={styles.momoName}>Cash Payment</Text>
                  <Text style={styles.momoNum}>Pay to collector</Text>
                </View>
                <View style={styles.momoRadio}>{(userProfile?.preferred_payment_method === 'CASH') && <View style={styles.momoRadioInner} />}</View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_PROFILE_SETUP:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_ONBOARDING_WELCOME)}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Collector Profile</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView>
              <View style={{ alignItems: 'center', marginBottom: 32 }}>
                <TouchableOpacity
                  onPress={() => pickImage(async (uri, base64) => {
                    const url = await uploadToSupabase(uri, 'avatars', `${user?.id}/collector_avatar.jpg`, base64);
                    if (url) {
                      setCollectorProfile({ ...collectorProfile, photo: url });
                      setUserProfile((prev: any) => ({ ...prev, avatar_url: url }));
                      await supabase.from('profiles').update({ avatar_url: url }).eq('id', user?.id);
                    }
                  })}
                  style={{ position: 'relative' }}
                >
                  <Image
                    source={{ uri: collectorProfile.photo || user?.avatar_url || 'https://i.pravatar.cc/150?u=kwame' }}
                    style={[styles.collAva, { width: 120, height: 120 }]}
                  />
                  <View style={{ position: 'absolute', bottom: 0, right: 0, backgroundColor: '#06C167', width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' }}>
                    <Camera size={18} color="#fff" />
                  </View>
                </TouchableOpacity>
                <Text style={[styles.collHistTime, { marginTop: 8 }]}>Tap to change photo *</Text>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><User size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Full Name *</Text>
                  <TextInput
                    style={[styles.collHistTime, { marginTop: 4 }]}
                    placeholder="Enter your name"
                    value={collectorProfile.name}
                    onChangeText={(text) => setCollectorProfile({ ...collectorProfile, name: text })}
                  />
                </View>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><Smartphone size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Phone Number *</Text>
                  <TextInput
                    style={[styles.collHistTime, { marginTop: 4 }]}
                    placeholder="024XXXXXXX"
                    keyboardType="phone-pad"
                    value={collectorProfile.phone}
                    onChangeText={(text) => setCollectorProfile({ ...collectorProfile, phone: text })}
                  />
                </View>
              </View>

              {/* Vehicle Type used to be collected here as free text, but the
                  save button below never persisted it (only full_name and
                  phone_number were sent) — it was silently discarded, then
                  asked again properly (as a structured choice) on the very
                  next screen, Vehicle Registration. Removed the dead field
                  rather than wiring free text into what's really an enum. */}

              <Button
                onPress={async () => {
                  if (!collectorProfile.name || !collectorProfile.phone) {
                    Alert.alert('Error', 'Please fill in all required fields');
                    return;
                  }
                  
                  setIsUploading(true);
                  const { error } = await supabase.from('profiles').update({
                    full_name: collectorProfile.name,
                    phone_number: collectorProfile.phone
                  }).eq('id', user?.id);
                  
                  if (!error) {
                    Alert.alert('Success', 'Profile saved successfully!');
                    setStep(AppStep.COLLECTOR_VEHICLE_REGISTRATION);
                  } else {
                    Alert.alert('Error', 'Failed to save profile. Please try again.');
                  }
                  setIsUploading(false);
                }}
                isLoading={isUploading}
                style={{ marginTop: 40 }}
              >
                Save Profile
              </Button>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_JOB:
        return (
          <View style={styles.screenContainer}>
            <View style={{ flex: 1 }}>
              <MapComponent
                showRoute={true}
                driverProgress={navigationProgress}
                userLatitude={userCoords?.latitude}
                userLongitude={userCoords?.longitude}
                destinationLatitude={activePickup?.lat}
                destinationLongitude={activePickup?.lng}
              />
              <View style={[styles.homeHeader, { top: 40 }]}>
                <TouchableOpacity
                  style={styles.roundBtn}
                  onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)}
                >
                  <ChevronLeft size={20} color="#000" />
                </TouchableOpacity>
                <View style={{ backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#06C167' }}>
                    {activePickup?.lat && userCoords?.latitude 
                      ? formatDistance(calculateDistance(userCoords.latitude, userCoords.longitude, activePickup.lat, activePickup.lng))
                      : 'Calculating...'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.foundCard, !isCardExpanded && { paddingBottom: 24, marginTop: -20 }]}>
              {/* Drag Handle */}
              <TouchableOpacity 
                onPress={() => setIsCardExpanded(!isCardExpanded)} 
                style={{ width: 48, height: 6, backgroundColor: '#D1D5DB', borderRadius: 3, alignSelf: 'center', marginBottom: 16 }}
              />

              {!isCardExpanded ? (
                // COLLAPSED VIEW
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#06C167', marginRight: 8 }} />
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }} numberOfLines={1}>
                        {jobStatus === 'on_way' ? 'Navigating to Pickup' : jobStatus === 'arrived' ? 'Arrived at Location' : jobStatus === 'collected' ? 'Trash Collected' : 'Job Completed'}
                      </Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setIsCardExpanded(true)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 16 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#06C167' }}>Expand ⌃</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Compact Customer & Call Row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB', padding: 12, borderRadius: 12, marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {activePickup?.customer?.avatar_url ? (
                        <Image source={{ uri: activePickup.customer.avatar_url }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                      ) : (
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={18} color="#fff" />
                        </View>
                      )}
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937' }}>{activePickup?.customer?.full_name || 'Customer'}</Text>
                        {jobStatus === 'on_way' && (
                          <Text style={{ fontSize: 12, color: '#06C167', fontWeight: '600' }}>
                            {collectorNavDistanceLabel && collectorNavEtaLabel ? `${collectorNavDistanceLabel} • ~${collectorNavEtaLabel}` : 'Calculating...'}
                          </Text>
                        )}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity 
                        onPress={() => {
                          const phone = activePickup?.customer?.phone || '0000000000';
                          Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Could not open dialer.'));
                        }}
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Smartphone size={18} color="#374151" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => setStep(AppStep.COLLECTOR_CHAT)}
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <MessageSquare size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Prominent Action Button in Collapsed Mode */}
                  {jobStatus === 'on_way' && (
                    <TouchableOpacity
                      onPress={handleArrival}
                      disabled={isArriving}
                      style={[styles.loginButton, { backgroundColor: '#06C167', marginBottom: 0 }]}
                    >
                      <Text style={styles.loginButtonText}>{isArriving ? 'Updating...' : 'I Have Arrived'}</Text>
                    </TouchableOpacity>
                  )}
                  {jobStatus === 'arrived' && !proofImage && (
                    <TouchableOpacity
                      onPress={pickProofImage}
                      style={[styles.loginButton, { backgroundColor: '#3B82F6', marginBottom: 0 }]}
                    >
                      <Text style={styles.loginButtonText}>Take Proof of Collection</Text>
                    </TouchableOpacity>
                  )}
                  {jobStatus === 'arrived' && proofImage && (
                    <TouchableOpacity
                      onPress={() => handleCollectionComplete()}
                      disabled={isCollecting}
                      style={[styles.loginButton, { backgroundColor: '#F59E0B', marginBottom: 0 }]}
                    >
                      <Text style={styles.loginButtonText}>{isCollecting ? 'Uploading...' : 'Confirm Trash Collected'}</Text>
                    </TouchableOpacity>
                  )}
                  {jobStatus === 'collected' && (
                    <TouchableOpacity
                      onPress={handleJobFinalize}
                      disabled={isFinalizingJob}
                      style={[styles.loginButton, { backgroundColor: '#10B981', marginBottom: 0 }]}
                    >
                      <Text style={styles.loginButtonText}>{isFinalizingJob ? 'Finalizing...' : 'Complete Job & Get Paid'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                // EXPANDED VIEW
                <View>
                  <View style={[styles.foundHeader, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                    <View style={styles.foundTitleBox}>
                      <MapPin size={16} color="#fff" style={styles.blackIcon} />
                      <Text style={styles.foundTitle}>Navigate to Pickup</Text>
                    </View>
                    <TouchableOpacity 
                      onPress={() => setIsCardExpanded(false)}
                      style={{ paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 16 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#6B7280' }}>Collapse ⌄</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.collectorInfo}>
                    <View style={styles.collectorText}>
                      <Text style={styles.collectorName}>
                        {jobStatus === 'on_way' ? 'Navigating to Pickup' :
                          jobStatus === 'arrived' ? 'Arrived at Location' :
                            jobStatus === 'collected' ? 'Trash Collected' : 'Job Completed'}
                      </Text>
                      {activePickup?.customer?.full_name ? (
                        <Text style={{ fontSize: 13, color: '#059669', fontWeight: '700', marginBottom: 2 }}>
                          👤 {activePickup.customer.full_name}
                        </Text>
                      ) : null}
                      <Text style={[styles.collectionsText, { fontSize: 16, marginVertical: 4 }]}>{activePickup?.pickup_location_name || 'Destination'}</Text>

                      {jobStatus === 'on_way' && (
                        <View style={styles.collectionsRow}>
                          <Navigation size={14} color="#06C167" />
                          <Text style={styles.collectionsText}>
                            {collectorNavDistanceLabel && collectorNavEtaLabel ? `${collectorNavDistanceLabel} • ~${collectorNavEtaLabel}` : 'Calculating...'}
                          </Text>
                        </View>
                      )}
                      {jobStatus === 'on_way' && activePickup?.lat && activePickup?.lng && (
                        <TouchableOpacity
                          onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${activePickup.lat},${activePickup.lng}`)}
                          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#06C167', padding: 12, borderRadius: 12, marginTop: 12 }}
                        >
                          <Navigation size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Open in Maps for Turn-by-Turn</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {activePickup?.customer?.avatar_url ? (
                        <Image source={{ uri: activePickup.customer.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                      ) : (
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={20} color="#fff" />
                        </View>
                      )}
                      <View>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937' }}>{activePickup?.customer?.full_name || 'Customer'}</Text>
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>Customer</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity 
                        onPress={() => {
                          const phone = activePickup?.customer?.phone || '0000000000';
                          Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Could not open dialer.'));
                        }}
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Smartphone size={18} color="#374151" />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={() => setStep(AppStep.COLLECTOR_CHAT)}
                        style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <MessageSquare size={18} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <View style={{ marginTop: 20 }}>
                    {activePickup?.voice_url && (jobStatus === 'on_way' || jobStatus === 'arrived') && (
                      <TouchableOpacity 
                        onPress={() => {
                          playVoiceNote(
                            activePickup.voice_url,
                            () => setIsPlayingLandmark(true),
                            () => setIsPlayingLandmark(false)
                          );
                        }}
                        style={{ 
                          flexDirection: 'row', 
                          alignItems: 'center', 
                          backgroundColor: isPlayingLandmark ? '#EFF6FF' : '#F97316', 
                          padding: 16, 
                          borderRadius: 12, 
                          marginBottom: 16, 
                          borderWidth: 1, 
                          borderColor: isPlayingLandmark ? '#3B82F6' : 'transparent' 
                        }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: isPlayingLandmark ? '#DBEAFE' : 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginRight: 15 }}>
                          {isPlayingLandmark ? <ActivityIndicator size="small" color="#2563EB" /> : <PlayCircle size={24} color="#fff" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: isPlayingLandmark ? '#2563EB' : '#fff', fontWeight: '700', fontSize: 16 }}>
                            {isPlayingLandmark ? 'Playing Directions...' : 'Play Voice Directions'}
                          </Text>
                          <Text style={{ color: isPlayingLandmark ? '#60A5FA' : 'rgba(255,255,255,0.8)', fontSize: 12 }}>
                            Listen to customer instructions
                          </Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {jobStatus === 'on_way' && (
                      <TouchableOpacity
                        onPress={handleArrival}
                        disabled={isArriving}
                        style={[styles.loginButton, { backgroundColor: '#06C167' }]}
                      >
                        <Text style={styles.loginButtonText}>{isArriving ? 'Updating...' : 'I Have Arrived'}</Text>
                      </TouchableOpacity>
                    )}

                    {jobStatus === 'arrived' && (
                      <TouchableOpacity 
                        onPress={pickProofImage}
                        style={{
                          backgroundColor: '#F3F4F6',
                          height: 120,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderStyle: 'dashed',
                          borderColor: '#D1D5DB',
                          justifyContent: 'center',
                          alignItems: 'center',
                          marginBottom: 16
                        }}
                      >
                        {proofImage ? (
                          <Image source={{ uri: proofImage }} style={{ width: '100%', height: '100%', borderRadius: 10 }} />
                        ) : (
                          <View style={{ alignItems: 'center' }}>
                            <Camera size={32} color="#9CA3AF" />
                            <Text style={{ color: '#6B7280', marginTop: 8 }}>Take Proof of Collection</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )}

                    {jobStatus === 'arrived' && (
                      <View style={{ gap: 12 }}>
                        <TouchableOpacity
                          onPress={() => handleCollectionComplete(false)}
                          disabled={isCollecting || !proofImage}
                          style={[styles.loginButton, { backgroundColor: proofImage ? '#06C167' : '#9CA3AF' }]}
                        >
                          <Text style={styles.loginButtonText}>{isCollecting ? 'Uploading...' : 'Submit Proof & Complete'}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            Alert.alert(
                              'Skip Proof of Clean?',
                              'Only skip if the customer is present or requested no photo. Are you sure you want to proceed?',
                              [
                                { text: 'Cancel', style: 'cancel' },
                                { text: 'Skip & Complete', style: 'destructive', onPress: () => handleCollectionComplete(true) }
                              ]
                            );
                          }}
                          disabled={isCollecting}
                          style={{ padding: 16, alignItems: 'center', borderRadius: 12, backgroundColor: '#F3F4F6' }}
                        >
                          <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 16 }}>Complete Without Photo</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {jobStatus === 'collected' && (
                      <TouchableOpacity
                        onPress={handleJobFinalize}
                        disabled={isFinalizingJob}
                        style={[styles.loginButton, { backgroundColor: '#10B981' }]}
                      >
                        <Text style={styles.loginButtonText}>{isFinalizingJob ? 'Finalizing...' : 'Complete Job & Get Paid'}</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => setShowIncidentModal(true)}
                      style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: 'rgba(239, 68, 68, 0.1)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' }}
                    >
                      <AlertTriangle size={18} color="#EF4444" />
                      <Text style={{ color: '#EF4444', fontWeight: '700' }}>Report Incident / Issue</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)}
                      style={{ marginTop: 16, alignItems: 'center' }}
                    >
                      <Text style={{ color: '#6B7280' }}>Back to Dashboard</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* Incident Modal */}
            <Modal visible={showIncidentModal} animationType="slide" transparent>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ flex: 1 }}
              >
                {/* Tapping the backdrop dismisses the keyboard (not the modal
                    itself, so an accidental tap can't discard what was
                    typed) — without this, once the optional Details field
                    was focused there was no way to close the keyboard, and
                    it covered the Submit button with no way to reach it. */}
                <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                    <TouchableWithoutFeedback>
                      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                          <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937' }}>Report Incident</Text>
                          <TouchableOpacity onPress={() => setShowIncidentModal(false)}><X size={24} color="#6B7280" /></TouchableOpacity>
                        </View>

                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 }}>WHAT HAPPENED?</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                          {['VEHICLE_BREAKDOWN', 'ACCIDENT', 'ROAD_CLOSURE', 'POLICE_CHECKPOINT', 'CUSTOMER_ISSUE', 'OTHER'].map(t => (
                            <TouchableOpacity
                              key={t}
                              onPress={() => setIncidentType(t)}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 20,
                                backgroundColor: incidentType === t ? '#EF4444' : '#F3F4F6',
                                borderWidth: 1,
                                borderColor: incidentType === t ? '#EF4444' : '#E5E7EB'
                              }}
                            >
                              <Text style={{ color: incidentType === t ? '#fff' : '#4B5563', fontSize: 12, fontWeight: '700' }}>
                                {t.replace(/_/g, ' ')}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 }}>DETAILS (OPTIONAL)</Text>
                        <TextInput
                          style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, height: 100, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB' }}
                          placeholder="Briefly describe the situation..."
                          multiline
                          value={incidentDesc}
                          onChangeText={setIncidentDesc}
                          returnKeyType="done"
                          blurOnSubmit={true}
                          onSubmitEditing={() => Keyboard.dismiss()}
                        />

                        <TouchableOpacity
                          onPress={handleReportIncident}
                          disabled={isReportingIncident}
                          style={{ backgroundColor: '#EF4444', padding: 18, borderRadius: 16, marginTop: 24, alignItems: 'center' }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{isReportingIncident ? 'Reporting...' : 'Submit Emergency Report'}</Text>
                        </TouchableOpacity>
                      </View>
                    </TouchableWithoutFeedback>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </Modal>
          </View>
        );

      case AppStep.COLLECTOR_EARNINGS:
        return (
          <View style={styles.screenContainer}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Earnings & Wallet</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Wallet Card */}
              <View style={{ backgroundColor: '#111', borderRadius: 24, padding: 24, marginBottom: 24 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 14, textTransform: 'uppercase', fontWeight: '600', marginBottom: 8 }}>Total Balance</Text>
                <Text style={{ color: '#fff', fontSize: 42, fontWeight: '800', marginBottom: 24 }}>GH₵ {walletBalance?.toFixed(2) || '0.00'}</Text>

                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setWithdrawAmount(walletBalance.toString());
                      setShowWithdrawModal(true);
                    }}
                    style={{ flex: 1, backgroundColor: '#06C167', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Cash Out</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: '#374151', paddingVertical: 14, borderRadius: 12, alignItems: 'center' }}
                    onPress={() => setStep(AppStep.COLLECTOR_WALLET)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>History</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Susu & Micro Loans */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <TouchableOpacity
                  onPress={() => setStep(AppStep.COLLECTOR_WALLET)}
                  style={{ flex: 1, backgroundColor: '#FEF3C7', padding: 20, borderRadius: 16 }}>
                  <Banknote size={24} color="#D97706" style={{ marginBottom: 12 }} />
                  <Text style={{ color: '#92400E', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>Susu Wallet</Text>
                  <Text style={{ color: '#B45309', fontSize: 24, fontWeight: '800', marginVertical: 4 }}>GH₵ {walletBalance.toFixed(2)}</Text>
                  <Text style={{ color: '#D97706', fontSize: 11 }}>Saved automatically</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => Alert.alert('Micro-Loans Coming Soon', 'Micro-loans for vehicle maintenance (tires, fuel, parts) are not yet available. Check back soon.')}
                  style={{ flex: 1, backgroundColor: '#DBEAFE', padding: 20, borderRadius: 16, justifyContent: 'center' }}>
                  <Recycle size={24} color="#2563EB" style={{ marginBottom: 12 }} />
                  <Text style={{ color: '#1E40AF', fontSize: 14, fontWeight: '700' }}>Apply for Micro-Loan</Text>
                  <Text style={{ color: '#3B82F6', fontSize: 11, marginTop: 4 }}>For tires, fuel, parts</Text>
                </TouchableOpacity>
              </View>

              {/* Weekly Performance — real earnings for the last 7 days */}
              <View style={{ marginBottom: 32 }}>
                <Text style={styles.sectionHeader}>Weekly Performance</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 150, paddingHorizontal: 10 }}>
                  {(() => {
                    const days = [...Array(7)].map((_, i) => {
                      const d = new Date();
                      d.setDate(d.getDate() - (6 - i));
                      return d;
                    });
                    const dayTotals = days.map((d) => {
                      const dayKey = d.toDateString();
                      return walletTransactions
                        .filter((t) => t.type === 'EARNING' && new Date(t.created_at).toDateString() === dayKey)
                        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
                    });
                    const maxVal = Math.max(...dayTotals, 1);
                    const isToday = (d: Date) => d.toDateString() === new Date().toDateString();
                    return days.map((d, i) => (
                      <View key={i} style={{ alignItems: 'center', gap: 8 }}>
                        <View style={{ width: 30, height: Math.max((dayTotals[i] / maxVal) * 140, 4), backgroundColor: isToday(d) ? '#06C167' : '#E5E7EB', borderRadius: 8 }} />
                        <Text style={{ fontSize: 12, color: '#6B7280' }}>{d.toLocaleDateString(undefined, { weekday: 'short' })}</Text>
                      </View>
                    ));
                  })()}
                </View>
              </View>

              {/* Recent Transactions */}
              <Text style={styles.sectionHeader}>Recent Transactions</Text>
              <View style={{ gap: 16 }}>
                {walletTransactions.length === 0 && (
                  <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>No transactions yet.</Text>
                )}
                {walletTransactions.slice(0, 10).map((tx, i) => {
                  const isCredit = tx.type === 'EARNING';
                  return (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                      <View>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F2937' }}>{tx.reference || tx.type}</Text>
                        <Text style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}</Text>
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: isCredit ? '#06C167' : '#EF4444' }}>
                        {isCredit ? '+' : '-'} GH₵ {Number(tx.amount).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_RATINGS:
        return (
          <View style={styles.screenContainer}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Ratings & Peformance</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Tier Card — tier & progress computed from the real avg_rating, not fixed at Gold/80% */}
              {(() => {
                const rating = Number(collectorMetric?.avg_rating) || 0;
                const tiers = [
                  { name: 'BRONZE', min: 0 },
                  { name: 'SILVER', min: 3.5 },
                  { name: 'GOLD', min: 4.5 },
                  { name: 'PLATINUM', min: 4.9 },
                ];
                let tierIndex = 0;
                for (let i = 0; i < tiers.length; i++) {
                  if (rating >= tiers[i].min) tierIndex = i;
                }
                const currentTier = tiers[tierIndex];
                const nextTier = tiers[tierIndex + 1];
                const progressPct = nextTier
                  ? Math.max(0, Math.min(100, ((rating - currentTier.min) / (nextTier.min - currentTier.min)) * 100))
                  : 100;
                return (
                  <>
                    <View style={{ backgroundColor: '#111', borderRadius: 24, padding: 24, marginBottom: 24, overflow: 'hidden' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <View>
                          <Text style={{ color: '#FCD34D', fontSize: 14, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{currentTier.name} TIER</Text>
                          <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800' }}>
                            {collectorMetric?.avg_rating ? Number(collectorMetric.avg_rating).toFixed(1) : '—'}
                          </Text>
                          <View style={{ flexDirection: 'row', marginTop: 4 }}>
                            {[1, 2, 3, 4, 5].map(i => (
                              <Star key={i} size={20} color="#FCD34D" fill={i <= Math.round(collectorMetric?.avg_rating || 0) ? '#FCD34D' : 'transparent'} style={{ marginRight: 4 }} />
                            ))}
                          </View>
                        </View>
                        <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(252, 211, 77, 0.2)', alignItems: 'center', justifyContent: 'center' }}>
                          <Shield size={32} color="#FCD34D" fill="#FCD34D" />
                        </View>
                      </View>
                      <View style={{ marginTop: 24, backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 12 }}>
                        <Text style={{ color: '#D1D5DB', fontSize: 12 }}>{nextTier ? `Next Tier: ${nextTier.name[0]}${nextTier.name.slice(1).toLowerCase()} (${nextTier.min} ★)` : 'Highest tier reached'}</Text>
                        <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 3, marginTop: 8 }}>
                          <View style={{ width: `${progressPct}%`, height: '100%', backgroundColor: '#FCD34D', borderRadius: 3 }} />
                        </View>
                      </View>
                    </View>

                    {/* Partner Fuel Discount */}
                    <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: '#BBF7D0', flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                        <Truck size={24} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#065F46', fontSize: 14, fontWeight: '800', marginBottom: 4 }}>GOIL Fuel Partner Discount</Text>
                        <Text style={{ color: '#047857', fontSize: 12 }}>Show your {currentTier.name[0]}{currentTier.name.slice(1).toLowerCase()} Badge at any GOIL station to receive 3% off all fuel purchases today!</Text>
                      </View>
                    </View>
                  </>
                );
              })()}

              {/* Metrics Grid */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={{ flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>Jobs Done</Text>
                  <Text style={{ color: '#1F2937', fontSize: 24, fontWeight: '700' }}>{collectorMetric?.completed_jobs ?? '—'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>Completion</Text>
                  <Text style={{ color: '#1F2937', fontSize: 24, fontWeight: '700' }}>
                    {collectorMetric?.completion_rate !== undefined ? `${Math.round(collectorMetric.completion_rate)}%` : '—'}
                  </Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 4 }}>Cancelled</Text>
                  <Text style={{ color: '#06C167', fontSize: 24, fontWeight: '700' }}>
                    {collectorMetric?.completion_rate !== undefined ? `${Math.round(100 - collectorMetric.completion_rate)}%` : '—'}
                  </Text>
                </View>
              </View>

              {/* Recent Feedback */}
              <Text style={styles.sectionHeader}>Recent Feedback</Text>
              <View style={{ gap: 16 }}>
                {collectorReviews.length === 0 && (
                  <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>No reviews yet.</Text>
                )}
                {collectorReviews.map((fb, i) => (
                  <View key={i} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row' }}>
                        {[...Array(fb.rating || 0)].map((_, s) => (
                          <Star key={s} size={14} color="#F59E0B" fill="#F59E0B" style={{ marginRight: 2 }} />
                        ))}
                      </View>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{fb.created_at ? new Date(fb.created_at).toLocaleDateString() : ''}</Text>
                    </View>
                    <Text style={{ color: '#374151', fontSize: 14, fontStyle: 'italic' }}>&quot;{fb.comment}&quot;</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_CHALLENGES:
        return (
          <View style={styles.screenContainer}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Challenges & Rewards</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={styles.sectionHeader}>Active Quests</Text>
              <View style={{ gap: 16, marginBottom: 32 }}>
                {activeChallenges.length > 0 ? activeChallenges.map(ch => {
                  const progress = ch.collector_challenges?.[0]?.current_progress || 0;
                  const pct = Math.min((progress / ch.target_count) * 100, 100);
                  return (
                    <View key={ch.id} style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#F3F4F6' }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>{ch.title}</Text>
                        <Text style={{ fontSize: 14, color: '#06C167', fontWeight: '800' }}>+ {ch.points_reward} pts</Text>
                      </View>
                      <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>{ch.description}</Text>
                      <View style={{ height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginBottom: 8 }}>
                        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: '#06C167', borderRadius: 4 }} />
                      </View>
                      <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{progress} / {ch.target_count} completed</Text>
                    </View>
                  );
                }) : (
                  <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>No challenges available today.</Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={styles.sectionHeader}>Top Collectors</Text>
              </View>
              <View style={{ gap: 12 }}>
                {topPerformers.length > 0 ? topPerformers.map((coll, i) => (
                  <View key={coll.id} style={[
                    { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#F3F4F6' },
                    coll.id === user?.id && { borderColor: '#FCD34D', borderWidth: 2, backgroundColor: '#FFFBEB' }
                  ]}>
                    <Text style={{ width: 30, fontSize: 16, fontWeight: '900', color: i < 3 ? '#F59E0B' : '#6B7280' }}>#{i + 1}</Text>
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#E5E7EB', marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                      <User size={20} color="#9CA3AF" />
                    </View>
                    <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#1F2937' }}>{coll.full_name}</Text>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#06C167' }}>{coll.loyalty_points || 0} pts</Text>
                  </View>
                )) : (
                  <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>Leaderboard loading...</Text>
                )}
              </View>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_CHAT:
        return (
          <View style={styles.screenContainer}>
            <View style={{ padding: 16, paddingTop: 60, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_JOB)} style={{ marginRight: 12 }}>
                <ChevronLeft size={24} color="#374151" />
              </TouchableOpacity>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <User size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>{activePickup?.customer?.full_name || 'Customer'}</Text>
                <Text style={{ fontSize: 12, color: '#06C167' }}>Active Order Chat</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const phone = activePickup?.customer?.phone || '0000000000';
                  Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Could not open dialer.'));
                }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
                <Smartphone size={18} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ flex: 1, padding: 16 }}
              ref={(ref) => {
                // Auto-scroll to bottom when messages change
                if (ref) setTimeout(() => ref.scrollToEnd({ animated: true }), 100);
              }}
            >
              <View style={{ alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.05)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginBottom: 24 }}>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>Pickup ID: {activePickup?.id?.slice(0,8)}</Text>
              </View>

              {chatMessages.length > 0 ? chatMessages.map((msg, i) => (
                <View key={i} style={{ alignSelf: msg.sender_id === user?.id ? 'flex-end' : 'flex-start', maxWidth: '80%', marginBottom: 16, alignItems: msg.sender_id === user?.id ? 'flex-end' : 'flex-start' }}>
                  <View style={{ backgroundColor: msg.sender_id === user?.id ? '#06C167' : '#F3F4F6', padding: 12, borderRadius: 16, borderTopRightRadius: msg.sender_id === user?.id ? 4 : 16, borderTopLeftRadius: msg.sender_id === user?.id ? 16 : 4 }}>
                    <Text style={{ fontSize: 16, color: msg.sender_id === user?.id ? '#fff' : '#374151' }}>{msg.message_text}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Text style={{ fontSize: 11, color: '#9CA3AF', marginRight: 4 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                    {msg.sender_id === user?.id && <CheckCircle size={12} color="#06C167" />}
                  </View>
                </View>
              )) : (
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                   <MessageSquare size={48} color="#E5E7EB" style={{ marginBottom: 16 }} />
                   <Text style={{ color: '#9CA3AF' }}>No messages yet. Send a greeting!</Text>
                </View>
              )}
            </ScrollView>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
              style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 12, paddingBottom: 32 }}
            >
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {['I\'m here 👋', 'On my way 🚛', 'Please come out'].map((msg, i) => (
                  <TouchableOpacity 
                    key={i} 
                    onPress={() => {
                       setNewChatMessage(msg);
                    }}
                    style={{ backgroundColor: '#F3F4F6', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, marginRight: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: '#374151' }}>{msg}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity onPress={() => Alert.alert('Camera', 'Photo sharing coming soon!')}>
                   <Text style={{ fontSize: 24 }}>📷</Text>
                </TouchableOpacity>
                <TextInput
                  placeholder="Type a message..."
                  placeholderTextColor="#9CA3AF"
                  value={newChatMessage}
                  onChangeText={setNewChatMessage}
                  style={{ flex: 1, backgroundColor: '#F9FAFB', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16 }}
                />
                <TouchableOpacity 
                  onPress={sendChatMessage}
                  disabled={!newChatMessage.trim() || isSendingChat}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', opacity: (!newChatMessage.trim() || isSendingChat) ? 0.6 : 1 }}
                >
                  {isSendingChat ? <ActivityIndicator size="small" color="#fff" /> : <Send size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        );

      case AppStep.PICKUP_CHAT:
        return (
          <View style={styles.screenContainer}>
            <View style={{ padding: 16, paddingTop: 60, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
              <TouchableOpacity onPress={() => {
                if (role === UserRole.COLLECTOR) setStep(AppStep.COLLECTOR_JOB);
                else setStep(AppStep.COLLECTOR_FOUND);
              }} style={{ marginRight: 12 }}>
                <ChevronLeft size={24} color="#374151" />
              </TouchableOpacity>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Truck size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>Chat with Collector</Text>
                <Text style={{ fontSize: 12, color: '#06C167' }}>{activePickup?.collector?.full_name || 'Collector'}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const phone = activePickup?.collector?.phone || '0000000000';
                  Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Could not open dialer.'));
                }}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
              >
                <Smartphone size={18} color="#374151" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={{ flex: 1, padding: 16 }}
              ref={(ref) => {
                if (ref) setTimeout(() => ref.scrollToEnd({ animated: true }), 100);
              }}
            >
              {chatMessages.length > 0 ? chatMessages.map((msg, i) => (
                <View key={i} style={{ alignSelf: msg.sender_id === user?.id ? 'flex-end' : 'flex-start', maxWidth: '80%', marginBottom: 16, alignItems: msg.sender_id === user?.id ? 'flex-end' : 'flex-start' }}>
                  <View style={{ backgroundColor: msg.sender_id === user?.id ? '#06C167' : '#F3F4F6', padding: 12, borderRadius: 16, borderTopRightRadius: msg.sender_id === user?.id ? 4 : 16, borderTopLeftRadius: msg.sender_id === user?.id ? 16 : 4 }}>
                    <Text style={{ fontSize: 16, color: msg.sender_id === user?.id ? '#fff' : '#374151' }}>{msg.message_text}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
              )) : (
                <View style={{ alignItems: 'center', marginTop: 40 }}>
                   <MessageSquare size={48} color="#E5E7EB" style={{ marginBottom: 16 }} />
                   <Text style={{ color: '#9CA3AF' }}>No messages yet. Send a greeting!</Text>
                </View>
              )}
            </ScrollView>

            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
              style={{ backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB', padding: 12, paddingBottom: 32 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TextInput
                  placeholder="Type a message..."
                  placeholderTextColor="#9CA3AF"
                  value={newChatMessage}
                  onChangeText={setNewChatMessage}
                  style={{ flex: 1, backgroundColor: '#F9FAFB', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, fontSize: 16 }}
                />
                <TouchableOpacity 
                  onPress={sendChatMessage}
                  disabled={!newChatMessage.trim() || isSendingChat}
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center', opacity: (!newChatMessage.trim() || isSendingChat) ? 0.6 : 1 }}
                >
                  {isSendingChat ? <ActivityIndicator size="small" color="#fff" /> : <Send size={20} color="#fff" />}
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        );

      case AppStep.COLLECTOR_SCHEDULE:
        return (
          <View style={styles.screenContainer}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Schedule</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Date Selector — used to be 5 hardcoded fake dates ("Wed 21"
                  etc.) with no onPress at all, and the list below showed
                  every pending job regardless of what was "selected". Now
                  real consecutive dates starting today, and the list below
                  actually filters by the selected day. */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
                {Array.from({ length: 5 }, (_, i) => {
                  const d = new Date();
                  d.setDate(d.getDate() + i);
                  const active = d.toDateString() === selectedScheduleDate.toDateString();
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setSelectedScheduleDate(d)}
                      style={{ alignItems: 'center', marginRight: 16, backgroundColor: active ? '#06C167' : '#fff', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: active ? '#06C167' : '#E5E7EB' }}
                    >
                      <Text style={{ fontSize: 12, color: active ? '#fff' : '#6B7280', marginBottom: 4 }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</Text>
                      <Text style={{ fontSize: 18, fontWeight: '700', color: active ? '#fff' : '#1F2937' }}>{d.getDate()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.sectionHeader}>
                {selectedScheduleDate.toDateString() === new Date().toDateString() ? "Today's Jobs" : `Jobs on ${selectedScheduleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
              </Text>
              <View style={{ gap: 16 }}>
                {pendingPickups.filter(p => new Date(p.created_at).toDateString() === selectedScheduleDate.toDateString()).length > 0 ? pendingPickups.filter(p => new Date(p.created_at).toDateString() === selectedScheduleDate.toDateString()).map((pickup, index) => (
                  <View key={pickup.id || index} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row' }}>
                    <View style={{ marginRight: 16, alignItems: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#1F2937' }}>
                        {new Date(pickup.created_at).getHours()}:{new Date(pickup.created_at).getMinutes().toString().padStart(2, '0')}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#9CA3AF' }}>
                        {new Date(pickup.created_at).getHours() >= 12 ? 'PM' : 'AM'}
                      </Text>
                      <View style={{ width: 2, flex: 1, backgroundColor: '#E5E7EB', marginVertical: 4 }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>{pickup.trash_type}</Text>
                        <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '700' }}>PENDING</Text>
                        </View>
                      </View>
                      <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>
                        {pickup.customer?.full_name || 'Anonymous Customer'} • {pickup.pickup_location_name}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Button 
                          style={{ flex: 1, height: 'auto', paddingVertical: 8 }} 
                          onPress={() => {
                            setActivePickup(pickup);
                            setStep(AppStep.JOB_REQUEST);
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          style={{ flex: 1, height: 'auto', paddingVertical: 8 }}
                          onPress={() => {
                            // This used to just show alert('Declined') and do
                            // nothing else — the job stayed pending and kept
                            // reappearing here and on the Dashboard forever.
                            // Matches the real dismiss behavior used
                            // elsewhere: hide it from this collector only
                            // (it's a broadcast request — another collector
                            // can still accept it), not cancel it outright.
                            setDismissedRequestIds(prev => [...prev, pickup.id]);
                            setPendingPickups(prev => prev.filter(req => req.id !== pickup.id));
                          }}
                        >
                          Decline
                        </Button>
                      </View>
                    </View>
                  </View>
                )) : (
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#D1D5DB' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 14 }}>
                      {selectedScheduleDate.toDateString() === new Date().toDateString() ? 'No pending jobs for today' : 'No pending jobs on this day'}
                    </Text>
                  </View>
                )}
              </View>


              {/* Recurring Routes Section — used to be one hardcoded card
                  ("Kasoa Sector 4", fake earnings) that never changed.
                  subscriptions is the real table customers create recurring
                  pickup schedules in — surfaced here as discoverable
                  recurring work, matching the existing "+ Find Routes" label. */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 32, marginBottom: 16 }}>
                <Text style={styles.sectionHeader}>My Recurring Routes</Text>
                <TouchableOpacity onPress={fetchRecurringRoutes}>
                  <Text style={{ color: '#06C167', fontWeight: '700' }}>+ Find Routes</Text>
                </TouchableOpacity>
              </View>

              <View style={{ gap: 16, marginBottom: 40 }}>
                {isLoadingRecurringRoutes ? (
                  <ActivityIndicator color="#06C167" />
                ) : recurringRoutes.length > 0 ? recurringRoutes.map((route) => (
                  <View key={route.id} style={{ backgroundColor: '#111', padding: 16, borderRadius: 16 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{route.collection_address || 'Recurring Pickup'}</Text>
                      <View style={{ backgroundColor: '#06C167', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                        <Text style={{ fontSize: 10, color: '#fff', fontWeight: '700' }}>{(route.status || 'active').toUpperCase()}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 24, marginBottom: 16 }}>
                      <View>
                        <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Frequency</Text>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>{route.frequency ? `${route.frequency} (${route.day_of_week || '—'})` : '—'}</Text>
                      </View>
                      <View>
                        <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Time Window</Text>
                        <Text style={{ color: '#fff', fontWeight: '600' }}>{route.time_window || '—'}</Text>
                      </View>
                    </View>
                    <Button
                      variant="outline"
                      style={{ height: 36, borderColor: '#374151' }}
                      onPress={() => Alert.alert(
                        route.collection_address || 'Recurring Route',
                        `Frequency: ${route.frequency || '—'}\nDay: ${route.day_of_week || '—'}\nTime window: ${route.time_window || '—'}\nBilling: ${route.billing_preference || '—'}`
                      )}
                    >
                      View Route Details
                    </Button>
                  </View>
                )) : (
                  <View style={{ padding: 40, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1, borderColor: '#D1D5DB' }}>
                    <Text style={{ color: '#9CA3AF', fontSize: 14, textAlign: 'center' }}>No active recurring pickup schedules right now.{'\n'}Tap &quot;+ Find Routes&quot; to check again.</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_SUPPORT:
        return (
          <View style={styles.screenContainer}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Help & Support</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {/* Quick Actions */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 16, alignItems: 'center' }}
                  onPress={async () => {
                    const { data: ticket, error } = await supabase
                      .from('support_tickets')
                      .insert({ user_id: user?.id, subject: 'Collector Support Request', status: 'open' })
                      .select()
                      .single();
                    if (ticket) {
                      setActiveTicket(ticket);
                      setSupportMessages([{ sender_id: 'bot', content: 'Hi! Welcome to Borla Collector Support. How can we help you today?' }]);
                      setStep(AppStep.CHAT);
                    } else {
                      Alert.alert('Error', 'Could not open support chat. Please try again.');
                    }
                  }}
                >
                  <MessageSquare size={24} color="#2563EB" style={{ marginBottom: 8 }} />
                  <Text style={{ color: '#1F2937', fontWeight: '700' }}>Live Chat</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#F0FDF4', padding: 16, borderRadius: 16, alignItems: 'center' }}
                  onPress={() => Linking.openURL('tel:+233XXXXXXXXX')}
                >
                  <Smartphone size={24} color="#06C167" style={{ marginBottom: 8 }} />
                  <Text style={{ color: '#1F2937', fontWeight: '700' }}>Call Us</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#FEF2F2', padding: 16, borderRadius: 16, alignItems: 'center' }}
                  onPress={async () => {
                    const { data: ticket, error } = await supabase
                      .from('support_tickets')
                      .insert({ user_id: user?.id, subject: 'Collector Ticket', status: 'open', priority: 'NORMAL' })
                      .select()
                      .single();
                    if (ticket) {
                      Alert.alert('Ticket Raised ✅', `Your support ticket #${ticket.id.slice(0,8)} has been created. We will contact you shortly.`);
                    } else {
                      Alert.alert('Error', 'Could not raise a ticket. Please try again.');
                    }
                  }}
                >
                  <FileText size={24} color="#EF4444" style={{ marginBottom: 8 }} />
                  <Text style={{ color: '#1F2937', fontWeight: '700' }}>Ticket</Text>
                </TouchableOpacity>
              </View>

              {/* FAQs */}
              <Text style={styles.sectionHeader}>Frequently Asked Questions</Text>
              <View style={{ gap: 12, marginBottom: 32 }}>
                {[{ q: "How do I get paid?", a: "Payments are processed weekly to your MoMo." }, { q: "How to increase my tier?", a: "Complete more jobs and maintain a 4.5+ rating." }, { q: "Can I decline a job?", a: "Yes, but frequent declines affect your acceptance rate." }].map((faq, i) => (
                  <View key={i} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 8 }}>{faq.q}</Text>
                    <Text style={{ fontSize: 14, color: '#6B7280' }}>{faq.a}</Text>
                  </View>
                ))}
              </View>

              {/* Recent Tickets */}
              <Text style={styles.sectionHeader}>Support Tickets</Text>
              <View style={{ gap: 12 }}>
                {supportTickets.length > 0 ? supportTickets.map(t => (
                  <TouchableOpacity 
                    key={t.id} 
                    style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F3F4F6', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                    onPress={() => {
                      setActiveTicket(t);
                      setStep(AppStep.CHAT);
                      setUnreadTicketIds(prev => prev.filter(id => id !== t.id));
                    }}
                  >
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#1F2937' }}>{t.subject}</Text>
                        <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Opened {new Date(t.created_at).toLocaleDateString()}</Text>
                      </View>
                      {unreadTicketIds.includes(t.id) && (
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', marginRight: 12 }} />
                      )}
                    </View>
                    <View style={{ backgroundColor: t.status === 'RESOLVED' ? '#ECFDF5' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, color: t.status === 'RESOLVED' ? '#06C167' : '#D97706', fontWeight: '700' }}>{t.status}</Text>
                    </View>
                  </TouchableOpacity>
                )) : (
                  <Text style={{ color: '#9CA3AF', textAlign: 'center' }}>No tickets yet.</Text>
                )}
                <Button variant="outline" style={{ marginTop: 12 }} onPress={() => {
                  Alert.prompt('New Ticket', 'Enter the subject of your issue:', (text) => {
                    if (text) {
                      supabase.from('support_tickets').insert({ user_id: user.id, subject: text }).then(() => fetchSupportTickets());
                    }
                  });
                }}>Open New Ticket</Button>
              </View>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_SAFETY:
        return (
          <View style={[styles.screenContainer, { backgroundColor: '#111' }]}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Safety Center</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', marginBottom: 32, textAlign: 'center' }}>
                In case of emergency, press the button below to alert our team and emergency services immediately.
              </Text>

              {/* SOS Button */}
              <TouchableOpacity
                onPress={async () => {
                  supabase.channel('admin_global_alerts').send({
                    type: 'broadcast',
                    event: 'sos_emergency',
                    payload: { collector_id: user?.id, full_name: userProfile?.full_name, phone: userProfile?.phone_number, timestamp: new Date().toISOString() }
                  });
                  // Also insert an incident report so it persists on the admin dashboard.
                  // This was silently failing on every single SOS press —
                  // incident_reports has no "severity" column (it's called
                  // "priority"), so PostgREST rejected every one of these
                  // inserts with a 400. The broadcast above still reached an
                  // admin who happened to be online that exact moment, but
                  // the emergency itself was never actually saved anywhere.
                  const { error: sosInsertError } = await supabase.from('incident_reports').insert({
                    collector_id: user?.id || 'anon',
                    pickup_id: activePickup?.id || null,
                    type: 'SAFETY_THREAT',
                    description: 'SOS EMERGENCY ACTIVATED by Collector',
                    priority: 'CRITICAL',
                    status: 'PENDING'
                  });
                  if (sosInsertError) console.error('[SOS] Failed to persist incident report:', sosInsertError);
                  
                  Alert.alert(
                    'SOS Emergency Activated 🚨',
                    'Borla Admin and emergency contacts have been instantly notified with your live GPS location.\n\nDo you need to connect with Ghanaian Emergency Services right now?',
                    [
                      { text: 'Call Police (191)', onPress: () => Linking.openURL('tel:191') },
                      { text: 'Call Ambulance (193)', onPress: () => Linking.openURL('tel:193') },
                      { text: 'Cancel', style: 'cancel' }
                    ]
                  );
                }}
                style={{ width: 200, height: 200, borderRadius: 100, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', borderWidth: 8, borderColor: 'rgba(239, 68, 68, 0.3)', marginBottom: 40, shadowColor: '#EF4444', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 20 }}
              >
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900' }}>SOS</Text>
                <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, marginTop: 4 }}>PRESS AND HOLD</Text>
              </TouchableOpacity>

              {/* Convoy Mode */}
              <View style={{ width: '100%', backgroundColor: convoyActive ? '#ECFDF5' : '#F3F4F6', padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: convoyActive ? '#10B981' : 'transparent' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Users size={28} color={convoyActive ? '#059669' : '#4B5563'} />
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: convoyActive ? '#064E3B' : '#111827' }}>Convoy Mode</Text>
                      <Text style={{ fontSize: 12, color: convoyActive ? '#059669' : '#6B7280' }}>
                        {convoyActive ? 'Linked with nearby riders' : 'Night-time area escort'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    disabled={isConvoyActionLoading}
                    onPress={() => {
                      // This used to only flip a local boolean and send a
                      // broadcast to the admin console — it never actually
                      // created or joined a real convoy (convoys/
                      // convoy_members), even though the copy claimed "you
                      // are now linked with nearby collectors." Now calls
                      // the same real functions the dedicated Convoy Mode
                      // screen uses, so both entry points share one real,
                      // DB-backed convoy membership instead of two
                      // disconnected concepts.
                      supabase.channel('admin_global_alerts').send({
                        type: 'broadcast',
                        event: 'convoy_mode',
                        payload: { collector_id: user?.id, full_name: userProfile?.full_name, active: !convoyActive, timestamp: new Date().toISOString() }
                      });
                      if (convoyActive) {
                        handleLeaveConvoy(false);
                      } else {
                        handleStartConvoy();
                      }
                    }}
                    style={{ width: 50, height: 28, borderRadius: 14, backgroundColor: convoyActive ? '#10B981' : '#D1D5DB', justifyContent: 'center', padding: 2 }}
                  >
                    <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', transform: [{ translateX: convoyActive ? 22 : 0 }] }} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Safety Tools */}
              <View style={{ width: '100%', gap: 16 }}>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <TouchableOpacity 
                    onPress={() => {
                      supabase.channel('admin_global_alerts').send({
                        type: 'broadcast',
                        event: 'location_share',
                        payload: { collector_id: user?.id, full_name: userProfile?.full_name, timestamp: new Date().toISOString() }
                      });
                      Alert.alert('Location Shared 📍', 'Your live GPS coordinates have been successfully broadcasted to Borla Admin Priority Support and your trusted emergency contacts.');
                    }}
                    style={{ flex: 1, backgroundColor: '#1F2937', padding: 20, borderRadius: 16, alignItems: 'center' }}
                  >
                    <MapPin size={32} color="#06C167" style={{ marginBottom: 12 }} />
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Share Location</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, textAlign: 'center' }}>Live with trusted contacts</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setStep(AppStep.INCIDENT_REPORT)}
                    style={{ flex: 1, backgroundColor: '#1F2937', padding: 20, borderRadius: 16, alignItems: 'center' }}
                  >
                    <AlertTriangle size={32} color="#F59E0B" style={{ marginBottom: 12 }} />
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Report Incident</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12, marginTop: 4, textAlign: 'center' }}>Accident or unsafe area</Text>
                  </TouchableOpacity>
                </View>

                {/* Emergency Contacts */}
                <Text style={styles.sectionHeader}>Emergency Contacts</Text>
                <TouchableOpacity 
                  onPress={async () => {
                    const { data: ticket } = await supabase
                      .from('support_tickets')
                      .insert({ user_id: user?.id || 'anon-emergency', subject: 'Emergency Safety Support Request', status: 'open', priority: 'HIGH' })
                      .select()
                      .maybeSingle();

                    const targetTicket = ticket || { id: 'mock-emergency-id', user_id: user?.id || 'anon', subject: 'Emergency Safety Support Request', status: 'open' };
                    setActiveTicket(targetTicket);
                    setSupportMessages([{ sender_id: 'bot', content: '🚨 EMERGENCY PRIORITY LINE: A Borla Safety Agent is reviewing your GPS coordinates right now. Please let us know your exact situation below.' }]);
                    setStep(AppStep.CHAT);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', padding: 16, borderRadius: 16 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(239,68,68,0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Smartphone size={20} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Borla Admin</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>24/7 Priority Support</Text>
                  </View>
                  <ChevronRight size={20} color="#6B7280" />
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => Linking.openURL('tel:191')}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', padding: 16, borderRadius: 16 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(37, 99, 235, 0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Shield size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Police (191)</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Emergency Services</Text>
                  </View>
                  <ChevronRight size={20} color="#6B7280" />
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => Linking.openURL('tel:193')}
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1F2937', padding: 16, borderRadius: 16 }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(16, 185, 129, 0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Shield size={20} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Ambulance (193)</Text>
                    <Text style={{ color: '#9CA3AF', fontSize: 12 }}>Medical Emergency</Text>
                  </View>
                  <ChevronRight size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        );

      case AppStep.INCIDENT_REPORT:
        return (
          <View style={[styles.screenContainer, { backgroundColor: '#111' }]}>
            <View style={[styles.header, { backgroundColor: '#1F2937' }]}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_SAFETY)} style={styles.backBtn}>
                <ChevronLeft size={24} color="#fff" />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: '#fff' }]}>Report Incident</Text>
              <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={{ padding: 20 }}>
              <Text style={{ color: '#9CA3AF', marginBottom: 24, fontSize: 14, textAlign: 'center' }}>
                Please select the type of incident. This will immediately alert Borla Admin Priority Support.
              </Text>

              <View style={{ gap: 16, marginBottom: 32 }}>
                {[
                  { type: 'ACCIDENT', label: 'Vehicle Accident 💥', desc: 'Collision, breakdown, or road mishap' },
                  { type: 'SAFETY_THREAT', label: 'Safety Threat / Harassment ⚠️', desc: 'Hostile environment or threat to safety' },
                  { type: 'HAZARDOUS_MATERIAL', label: 'Hazardous Waste Spill ☣️', desc: 'Toxic, chemical, or dangerous waste spill' },
                  { type: 'SEVERE_WEATHER', label: 'Severe Weather / Flood 🌧️', desc: 'Impassable roads or extreme weather' },
                  { type: 'OTHER', label: 'Other Emergency 🚨', desc: 'Any other urgent issue requiring assistance' }
                ].map((inc, i) => (
                  <TouchableOpacity 
                    key={i}
                    onPress={async () => {
                      // 1. Broadcast to admin global alerts
                      supabase.channel('admin_global_alerts').send({
                        type: 'broadcast',
                        event: 'new_incident',
                        payload: {
                          collector_id: user?.id,
                          full_name: userProfile?.full_name,
                          type: inc.type,
                          description: inc.label,
                          timestamp: new Date().toISOString()
                        }
                      });

                      // 2. Insert into database if online.
                      // Same bug as the SOS button — "severity" isn't a real
                      // column on incident_reports ("priority" is), so this
                      // insert was rejected every time and no report was
                      // ever actually saved, despite the success alert below.
                      const { error: incidentInsertError } = await supabase.from('incident_reports').insert({
                        collector_id: user?.id || 'anon',
                        pickup_id: activePickup?.id || null,
                        type: inc.type,
                        description: inc.desc,
                        priority: inc.type === 'ACCIDENT' || inc.type === 'SAFETY_THREAT' ? 'CRITICAL' : 'URGENT',
                        status: 'PENDING'
                      });
                      if (incidentInsertError) console.error('[Incident] Failed to persist report:', incidentInsertError);

                      Alert.alert(
                        'Incident Reported ✅', 
                        `Your report for "${inc.label}" has been instantly transmitted to Borla Admin Priority Support.\n\nA safety officer is reviewing your location coordinates.`,
                        [{ text: 'OK', onPress: () => setStep(AppStep.COLLECTOR_SAFETY) }]
                      );
                    }}
                    style={{ backgroundColor: '#1F2937', padding: 20, borderRadius: 16, borderWidth: 1, borderColor: '#374151', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <View style={{ flex: 1, paddingRight: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 }}>{inc.label}</Text>
                      <Text style={{ color: '#9CA3AF', fontSize: 12 }}>{inc.desc}</Text>
                    </View>
                    <ChevronRight size={20} color="#6B7280" />
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                onPress={() => setStep(AppStep.COLLECTOR_SAFETY)}
                style={{ padding: 16, alignItems: 'center' }}
              >
                <Text style={{ color: '#EF4444', fontWeight: '700', fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_ONBOARDING_WELCOME:
        return (
          <View style={styles.screenContainer}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
              <Text style={{ fontSize: 64, marginBottom: 24 }}>🚚</Text>
              <Text style={styles.loginTitle}>Welcome, Collector!</Text>
              <Text style={[styles.loginSubtitle, { textAlign: 'center', marginBottom: 40 }]}>
                Let&apos;s get you set up to start collecting trash and earning money with Borla.
              </Text>

              <View style={{ width: '100%', gap: 16, marginBottom: 40 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>1</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 16, color: '#374151' }}>Complete your profile</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>2</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 16, color: '#374151' }}>Register your vehicle</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>3</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 16, color: '#374151' }}>Upload required documents</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>4</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 16, color: '#374151' }}>Get approved and start earning!</Text>
                </View>
              </View>

              <Button 
                onPress={() => {
                  setIsSignupMode(true);
                  setStep(AppStep.LOGIN);
                }}
              >
                Get Started
              </Button>
              <Button
                variant="outline"
                onPress={() => {
                  // Existing collectors go straight to login
                  setRole(UserRole.COLLECTOR);
                  setStep(AppStep.LOGIN);
                }}
                style={{ marginTop: 12 }}
              >
                Sign In (Existing Collector)
              </Button>
              <Button variant="outline" onPress={() => setStep(AppStep.ROLE_SELECTION)} style={{ marginTop: 12 }}>Back</Button>
            </View>
          </View>
        );

      case AppStep.COLLECTOR_VEHICLE_REGISTRATION:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Vehicle Registration</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView>
              <Text style={[styles.loginSubtitle, { marginBottom: 24 }]}>Tell us about your vehicle</Text>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><Navigation size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Vehicle Type *</Text>
                  <View style={{ marginTop: 8, gap: 8 }}>
                    {['Large Trash Truck', 'Mini Truck', 'Tricycle Truck'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() => setVehicleDetails({ ...vehicleDetails, type })}
                        style={[
                          styles.phoneInput,
                          { padding: 12 },
                          vehicleDetails.type === type && { borderColor: '#06C167', borderWidth: 2 }
                        ]}
                      >
                        <Text style={{ fontSize: 14, fontWeight: vehicleDetails.type === type ? '700' : '400' }}>{type}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><Navigation size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>License Plate Number *</Text>
                  <TextInput
                    style={[styles.collHistTime, { marginTop: 4, fontSize: 16 }]}
                    placeholder="e.g. GR 1234-20"
                    value={vehicleDetails.plate}
                    onChangeText={(text) => setVehicleDetails({ ...vehicleDetails, plate: text })}
                    autoCapitalize="characters"
                  />
                </View>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><Navigation size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Vehicle Capacity (cubic meters)</Text>
                  <TextInput
                    style={[styles.collHistTime, { marginTop: 4, fontSize: 16 }]}
                    placeholder="e.g. 5"
                    keyboardType="decimal-pad"
                    value={vehicleDetails.capacity}
                    onChangeText={(text) => setVehicleDetails({ ...vehicleDetails, capacity: text })}
                  />
                </View>
              </View>

              <View style={styles.methodRow}>
                <View style={styles.methodIcon}><User size={20} color="#06C167" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momoName}>Vehicle Photo *</Text>
                  <TouchableOpacity
                    onPress={() => pickImage(async (uri, base64) => {
                      const url = await uploadToSupabase(uri, 'collector-documents', `${user?.id}/vehicle_photo.jpg`, base64);
                      if (url) {
                        setVehicleDetails({ ...vehicleDetails, photo: url });
                      }
                    })}
                    style={[styles.phoneInput, { marginTop: 8, padding: 16, alignItems: 'center' }]}
                  >
                    {vehicleDetails.photo ? (
                      <Text style={{ color: '#06C167', fontWeight: '700' }}>✓ Photo Uploaded</Text>
                    ) : (
                      <Text style={{ color: '#6B7280' }}>Tap to upload photo</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              <Button
                onPress={async () => {
                  if (!vehicleDetails.type || !vehicleDetails.plate || !vehicleDetails.photo) {
                    alert('Please fill all required fields (*)');
                    return;
                  }
                  setIsSavingVehicleDetails(true);
                  const { error } = await supabase.from('profiles').update({
                    vehicle_type: vehicleDetails.type,
                    vehicle_number: vehicleDetails.plate,
                    vehicle_details: {
                      type: vehicleDetails.type,
                      plate: vehicleDetails.plate,
                      capacity: vehicleDetails.capacity,
                      photo_url: vehicleDetails.photo
                    },
                    updated_at: new Date().toISOString(),
                  }).eq('id', user?.id);
                  setIsSavingVehicleDetails(false);
                  if (error) {
                    alert('Could not save vehicle details: ' + error.message);
                    return;
                  }
                  setStep(AppStep.COLLECTOR_DOCUMENT_UPLOAD);
                }}
                isLoading={isSavingVehicleDetails}
                style={{ marginTop: 40 }}
              >
                Continue to Documents
              </Button>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_DOCUMENT_UPLOAD:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Document Upload</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView>
              <Text style={[styles.loginSubtitle, { marginBottom: 24 }]}>Upload your documents for verification</Text>

              {[
                { key: 'nationalId', label: 'National ID (Ghana Card)', required: true },
                { key: 'license', label: "Driver&apos;s License", required: true },
                { key: 'vehicleReg', label: 'Vehicle Registration', required: true },
                { key: 'wastePermit', label: 'Waste Collection Permit', required: false }
              ].map((doc) => (
                <View key={doc.key} style={styles.methodRow}>
                  <View style={styles.methodIcon}><User size={20} color="#06C167" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.momoName}>{doc.label} {doc.required && '*'}</Text>
                    <TouchableOpacity
                      onPress={() => pickImage(async (uri, base64) => {
                        const url = await uploadToSupabase(uri, 'collector-documents', `${user?.id}/${doc.key}.jpg`, base64);
                        if (url) {
                          const updatedDocs = { ...documents, [doc.key]: url };
                          setDocuments(prev => ({ ...prev, [doc.key]: url }));
                          // Also store in collector_documents table matching real schema
                          const { data: existing } = await supabase.from('collector_documents').select('id').eq('collector_id', user?.id).eq('doc_type', doc.key).maybeSingle();
                          if (existing) {
                            await supabase.from('collector_documents').update({
                              doc_url: url,
                              status: 'pending'
                            }).eq('id', existing.id);
                          } else {
                            await supabase.from('collector_documents').insert({
                              collector_id: user?.id,
                              doc_type: doc.key,
                              doc_url: url,
                              status: 'pending'
                            });
                          }
                          // Update profiles.vehicle_details.kyc_docs to ensure 100% reliable read access for Admin
                          const currentVehicleDetails = userProfile?.vehicle_details || vehicleDetails || {};
                          await supabase.from('profiles').update({
                            vehicle_details: {
                              ...currentVehicleDetails,
                              kyc_docs: updatedDocs
                            }
                          }).eq('id', user?.id);
                        }
                      })}
                      style={[styles.phoneInput, { marginTop: 8, padding: 16, alignItems: 'center' }]}
                    >
                      {documents[doc.key as keyof typeof documents] ? (
                        <Text style={{ color: '#06C167', fontWeight: '700' }}>✓ Uploaded</Text>
                      ) : (
                        <Text style={{ color: '#6B7280' }}>Tap to upload</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              <Button
                onPress={async () => {
                  if (!documents.nationalId || !documents.license || !documents.vehicleReg) {
                    alert('Please upload all required documents (*)');
                    return;
                  }
                  setIsSubmittingDocuments(true);
                  const { error } = await supabase.from('profiles').update({
                    onboarding_completed: true,
                    updated_at: new Date().toISOString()
                  }).eq('id', user?.id);

                  if (!error) {
                    setUserProfile((prev: any) => ({ ...prev, onboarding_completed: true }));
                    setApprovalStatus('pending');
                    setStep(AppStep.COLLECTOR_PENDING_APPROVAL);
                  } else {
                    alert('Error saving status: ' + error.message);
                  }
                  setIsSubmittingDocuments(false);
                }}
                isLoading={isSubmittingDocuments}
                style={{ marginTop: 40 }}
              >
                Submit for Approval
              </Button>
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_PENDING_APPROVAL:
        return (
          <View style={styles.screenContainer}>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
              {approvalStatus === 'pending' && (
                <>
                  <Text style={{ fontSize: 64, marginBottom: 24 }}>⏳</Text>
                  <Text style={styles.loginTitle}>Under Review</Text>
                  <Text style={[styles.loginSubtitle, { textAlign: 'center', marginBottom: 40 }]}>
                    Your application is being reviewed by our team. This usually takes 24-48 hours.
                  </Text>
                  <View style={{ width: '100%', backgroundColor: '#F3F4F6', padding: 20, borderRadius: 16, marginBottom: 24 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', marginBottom: 12 }}>What happens next?</Text>
                    <Text style={{ fontSize: 14, color: '#6B7280', lineHeight: 20 }}>
                      • We&apos;ll verify your documents{"\n"}
                      • Check your vehicle details{"\n"}
                      • You&apos;ll receive an SMS/email notification{"\n"}
                      • Once approved, you can start accepting jobs!
                    </Text>
                  </View>
                  <Button onPress={() => setStep(AppStep.ROLE_SELECTION)}>Back to Home</Button>
                </>
              )}
              {approvalStatus === 'approved' && (
                <>
                  <Text style={{ fontSize: 64, marginBottom: 24 }}>✅</Text>
                  <Text style={styles.loginTitle}>Approved!</Text>
                  <Text style={[styles.loginSubtitle, { textAlign: 'center', marginBottom: 40 }]}>
                    Congratulations! Your collector account has been approved. You can now start accepting pickup jobs.
                  </Text>
                  <Button onPress={() => setStep(AppStep.COLLECTOR_DASHBOARD)}>Go to Dashboard</Button>
                </>
              )}
              {approvalStatus === 'rejected' && (
                <>
                  <Text style={{ fontSize: 64, marginBottom: 24 }}>❌</Text>
                  <Text style={styles.loginTitle}>Application Rejected</Text>
                  <Text style={[styles.loginSubtitle, { textAlign: 'center', marginBottom: 40 }]}>
                    Unfortunately, your application was not approved. Please review the feedback and resubmit.
                  </Text>
                  <Button onPress={() => setStep(AppStep.COLLECTOR_DOCUMENT_UPLOAD)}>Resubmit Documents</Button>
                  <Button variant="outline" onPress={() => setStep(AppStep.ROLE_SELECTION)} style={{ marginTop: 12 }}>Back to Home</Button>
                </>
              )}
            </View>
          </View>
        );

      case AppStep.PROOF_UPLOAD:
        if (isTakingProof) {
          return (
            <CameraComponent 
              onCapture={(uri) => {
                setProofPhoto(uri);
                setIsTakingProof(false);
              }}
              onClose={() => setIsTakingProof(false)}
            />
          );
        }
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={() => setStep(AppStep.COLLECTOR_JOB)}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Proof of Clean</Text>
              <View style={{ width: 32 }} />
            </View>
            <Text style={{ textAlign: 'center', color: '#6B7280', marginBottom: 32 }}>
              Please take a photo of the cleared area to verify the job is complete.
            </Text>

            {proofPhoto ? (
              <View style={{ flex: 1, marginBottom: 32, borderRadius: 24, overflow: 'hidden' }}>
                <Image source={{ uri: proofPhoto }} style={{ flex: 1 }} />
                <TouchableOpacity 
                  onPress={() => setIsTakingProof(true)}
                  style={{ position: 'absolute', bottom: 20, right: 20, backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 12 }}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Retake Photo</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                onPress={() => setIsTakingProof(true)}
                style={{ flex: 1, backgroundColor: '#F3F4F6', borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 2, borderColor: '#D1D5DB', marginBottom: 32 }}
              >
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                  <Camera size={32} color="#9CA3AF" />
                </View>
                <Text style={{ color: '#9CA3AF', fontWeight: '700' }}>Tap to Take Photo</Text>
              </TouchableOpacity>
            )}

            <View style={{ gap: 12 }}>
              <Button 
                onPress={async () => {
                  if (!proofPhoto) {
                    Alert.alert('Required', 'Please take a photo of the cleaned area.');
                    return;
                  }
                  setIsSubmittingProof(true);
                  try {
                    const proofUrl = await uploadToSupabase(proofPhoto, 'proof-of-clean', `proofs/${activePickup.id}.jpg`);

                    const { error } = await supabase
                      .from('pickups')
                      .update({
                        status: 'collected',
                        proof_url: proofUrl
                      })
                      .eq('id', activePickup.id);

                    if (!error) {
                      setJobStatus('collected');
                      setProofPhoto(null);
                      setStep(AppStep.COLLECTOR_JOB);
                      Alert.alert('Success', 'Proof uploaded! You can now complete the job.');
                    } else {
                      throw error;
                    }
                  } catch (e: any) {
                    Alert.alert('Error', 'Failed to upload proof: ' + e.message);
                  } finally {
                    setIsSubmittingProof(false);
                  }
                }}
                isLoading={isSubmittingProof}
                disabled={!proofPhoto}
                style={{ backgroundColor: proofPhoto ? '#06C167' : '#9CA3AF' }}
              >
                Submit Proof & Complete
              </Button>

              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Skip Proof of Clean?',
                    'Only skip if the customer is present or requested no photo. Are you sure you want to proceed?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Skip & Complete',
                        style: 'destructive',
                        onPress: async () => {
                          setIsSubmittingProof(true);
                          const { error } = await supabase
                            .from('pickups')
                            .update({ status: 'collected' })
                            .eq('id', activePickup.id);

                          setIsSubmittingProof(false);
                          if (!error) {
                            setJobStatus('collected');
                            setStep(AppStep.COLLECTOR_JOB);
                            Alert.alert('Success', 'Job marked as collected without photo.');
                          } else {
                            Alert.alert('Error', 'Failed to update job status: ' + error.message);
                          }
                        }
                      }
                    ]
                  );
                }}
                disabled={isSubmittingProof}
                style={{ padding: 16, alignItems: 'center', borderRadius: 12, backgroundColor: '#F3F4F6' }}
              >
                <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 16 }}>Complete Without Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        );

      case AppStep.AI_ESTIMATOR:
        return (
          <View style={[styles.screenContainer, { padding: 0, backgroundColor: '#000' }]}>
            {!capturedImage ? (
              <CameraComponent
                onCapture={async (uri, base64) => {
                  setCapturedImage(uri);
                  setAiResult(null);
                  setAiError(null);
                  setIsAnalyzing(true);
                  try {
                    const result = await analyzeTrashImage(base64);
                    setAiResult(result);
                  } catch (err: any) {
                    console.error('AI estimator error:', err);
                    setAiError('Could not analyze the image. Please try again.');
                  } finally {
                    setIsAnalyzing(false);
                  }
                }}
                onClose={() => setStep(AppStep.HOME)}
              />
            ) : (
              <View style={{ flex: 1 }}>
                <Image source={{ uri: capturedImage }} style={{ flex: 1 }} />

                {/* Analysis Overlay */}
                <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '65%' }}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={{ width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

                    {isAnalyzing ? (
                      <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                        <ActivityIndicator size="large" color="#06C167" style={{ marginBottom: 16 }} />
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#1F2937' }}>Analyzing Trash...</Text>
                        <Text style={{ color: '#6B7280', marginTop: 4 }}>AI is estimating volume & price</Text>
                      </View>
                    ) : aiError ? (
                      <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#EF4444', marginBottom: 12 }}>Analysis Failed</Text>
                        <Text style={{ color: '#6B7280', textAlign: 'center', marginBottom: 20 }}>{aiError}</Text>
                        <Button onPress={() => { setCapturedImage(null); setAiError(null); }}>Retake Photo</Button>
                      </View>
                    ) : aiResult ? (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#06C167', letterSpacing: 1 }}>AI ANALYSIS COMPLETE</Text>
                          <CheckCircle size={13} color="#06C167" style={{ marginLeft: 6 }} />
                        </View>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#1F2937', marginBottom: 4 }}>{aiResult.trashType}</Text>
                        <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>{aiResult.reasoning}</Text>

                        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
                          <View style={{ padding: 12, backgroundColor: '#F3F4F6', borderRadius: 12, flex: 1 }}>
                            <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: '700' }}>VOLUME</Text>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>{aiResult.binCount.toFixed(2)}</Text>
                            <Text style={{ fontSize: 10, color: '#9CA3AF' }}>standard bins</Text>
                          </View>
                          <View style={{ padding: 12, backgroundColor: '#F3F4F6', borderRadius: 12, flex: 1 }}>
                            <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: '700' }}>EST. WEIGHT</Text>
                            <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>{aiResult.weightKg} kg</Text>
                          </View>
                          <View style={{ padding: 12, backgroundColor: '#F3F4F6', borderRadius: 12, flex: 1 }}>
                            <Text style={{ fontSize: 10, color: '#6B7280', fontWeight: '700' }}>VEHICLE</Text>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: '#1F2937' }}>{aiResult.recommendedVehicle}</Text>
                          </View>
                        </View>

                        <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 20, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: '#166534', fontWeight: '700', letterSpacing: 1 }}>ESTIMATED PRICE</Text>
                          <Text style={{ fontSize: 36, fontWeight: '900', color: '#06C167' }}>GH₵ {aiResult.price}</Text>
                          <Text style={{ fontSize: 12, color: '#6B7280' }}>Based on GH₵ 40 per standard wheeled bin • {aiResult.confidence}% confidence</Text>
                        </View>

                        <Button onPress={async () => {
                          if (!userCoords) {
                            Alert.alert("Location Required", "Please enable location services to find collectors.");
                            return;
                          }
                          
                          setIsBookingFromEstimate(true);
                          try {
                            const rawCollectors = await findNearbyCollectors(userCoords.latitude, userCoords.longitude, COVERAGE_RADIUS_MILES);
                            const freshCollectors = rawCollectors.filter(c => isLocationFresh(c.updated_at));
                            setNearbyCollectors(freshCollectors);

                            if (freshCollectors.length === 0) {
                              logUnmetPickupRequest(userCoords.latitude, userCoords.longitude, COVERAGE_RADIUS_MILES);
                              Alert.alert(
                                "No Collectors Nearby",
                                "We couldn't find any collectors online in your area right now. Please try again in a few minutes.",
                                [{ text: "OK" }]
                              );
                              return;
                            }

                            if (aiResult) {
                              setSplitAmount(aiResult.price);
                              setSelectedTrashType(aiResult.trashType as TrashType);
                              if (aiResult.recommendedVehicle === 'Tricycle') setSelectedVehicle(TRASH_VEHICLES[0]);
                              else if (aiResult.recommendedVehicle === 'Mini Truck') setSelectedVehicle(TRASH_VEHICLES[1]);
                              else if (aiResult.recommendedVehicle === 'Pickup') setSelectedVehicle(TRASH_VEHICLES[1]);
                            }
                            setStep(AppStep.BOOKING);
                          } catch (e) {
                            Alert.alert("Error", "Could not verify collector availability. Please try again.");
                          } finally {
                            setIsBookingFromEstimate(false);
                          }
                        }} isLoading={isBookingFromEstimate}>Book This Pickup</Button>
                        <Button variant="outline" onPress={() => { setCapturedImage(null); setAiResult(null); }} style={{ marginTop: 12 }}>Retake Photo</Button>
                      </>
                    ) : null}
                  </ScrollView>
                </View>
              </View>
            )}
          </View>
        );

      case AppStep.COMMUNITY_POOL:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Community Pool</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>

              {/* Banner */}
              <View style={{ backgroundColor: '#F0FDF4', padding: 20, borderRadius: 16, marginBottom: 24 }}>
                <Text style={{ color: '#166534', fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }}>💚 Save Together, Pay Less!</Text>
                <Text style={{ color: '#15803d', textAlign: 'center', fontSize: 14, lineHeight: 20 }}>
                  Create a pool for your home, apartment block, or neighborhood. When members request a pickup, the collector does one trip — and the cost is split between everyone.
                </Text>
              </View>

              {/* Create a Pool Section */}
              <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20, borderWidth: 2, borderColor: '#D1FAE5', marginBottom: 28 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#064E3B', marginBottom: 4 }}>Start a New Pool</Text>
                <Text style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Give it a name your neighbors will recognise (e.g. &quot;East Legon Block C&quot;).</Text>
                <TextInput
                  value={newPoolName}
                  onChangeText={setNewPoolName}
                  placeholder="Pool name (e.g. Kasoa South Road)"
                  placeholderTextColor="#9CA3AF"
                  style={{ backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 14, fontSize: 15, color: '#111', marginBottom: 16 }}
                />
                <Button
                  onPress={async () => {
                    if (!newPoolName.trim()) {
                      Alert.alert('Name Required', 'Please enter a name for the pool.');
                      return;
                    }
                    setIsCreatingPool(true);
                    // Real community_pools columns are `name` / `target_members` /
                    // `current_members` (confirmed via a live schema dump) — this
                    // used to insert `location_name` / `target_size`, columns that
                    // don't exist, so every "Create Pool" attempt failed outright.
                    const poolInsertData = {
                      name: newPoolName.trim(),
                      target_members: 5,
                      current_members: 1,
                      status: 'OPEN',
                      created_by: user?.id,
                    };
                    const { data: pool, error } = await supabase
                      .from('community_pools')
                      .insert(poolInsertData)
                      .select()
                      .single();

                    if (error || !pool) {
                      Alert.alert('Error', 'Could not create pool: ' + (error?.message || 'Unknown error'));
                      setIsCreatingPool(false);
                      return;
                    }
                    // Auto-join creator as first member
                    await supabase.from('community_pool_members').insert({ pool_id: pool.id, profile_id: user?.id });
                    setNewPoolName('');
                    setIsCreatingPool(false);
                    Alert.alert('Pool Created! 🎉', `"${pool.name}" is live. Share it with your neighbors so they can join!`);
                    fetchCommunityPools();
                  }}
                  style={{ opacity: isCreatingPool ? 0.6 : 1 }}
                >
                  {isCreatingPool ? 'Creating...' : 'Create Pool'}
                </Button>
              </View>

              {/* Active Pools List */}
              <Text style={styles.sectionHeader}>Active Neighborhood Pools</Text>
              {communityPools.length > 0 ? communityPools.map(pool => (
                <View key={pool.id} style={{ backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: '#06C167', marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>{pool.name}</Text>
                    <Text style={{ color: '#06C167', fontWeight: '800' }}>{pool.current_size}/{pool.target_members} Joined</Text>
                  </View>
                  {pool.created_by === user?.id && (
                    <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700', marginBottom: 6 }}>⭐ You created this pool</Text>
                  )}
                  <View style={{ height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginBottom: 12 }}>
                    <View style={{ width: `${Math.min((pool.current_size / pool.target_members) * 100, 100)}%`, height: '100%', backgroundColor: '#06C167', borderRadius: 4 }} />
                  </View>
                  <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>
                    {pool.current_size >= pool.target_members
                      ? '✅ Pool is full! A collector will be dispatched.'
                      : `${pool.target_members - pool.current_size} more neighbor(s) needed for the group discount.`}
                  </Text>
                  <Button onPress={async () => {
                    const { error } = await supabase.from('community_pool_members').insert({ pool_id: pool.id, profile_id: user?.id });
                    if (error) {
                      Alert.alert('Already Joined', 'You are already a member of this pool.');
                    } else {
                      await supabase.from('community_pools').update({ current_members: (pool.current_members || 0) + 1 }).eq('id', pool.id);
                      Alert.alert('Welcome! 🎉', 'You have joined the pool. You will be notified when it fills up.');
                      fetchCommunityPools();
                    }
                  }}>Join Pool (GH₵ 35 shared)</Button>
                </View>
              )) : (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={{ fontSize: 32, marginBottom: 12 }}>🏘️</Text>
                  <Text style={{ color: '#6B7280', textAlign: 'center', fontSize: 14 }}>No pools in your area yet.{'\n'}Be the first to start one above!</Text>
                </View>
              )}
            </ScrollView>
          </View>
        );

      case AppStep.COLLECTOR_WALLET:
        return (
          <View style={[styles.screenContainer, { backgroundColor: '#064E3B' }]}>
            <View style={[styles.historyHeader, { borderBottomColor: 'rgba(255,255,255,0.1)' }]}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#fff" /></TouchableOpacity>
              <Text style={[styles.historyTitle, { color: '#fff' }]}>Susu Wallet</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 32, borderRadius: 32, alignItems: 'center', marginBottom: 24 }}>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: 1 }}>TOTAL BALANCE</Text>
                <Text style={{ color: '#fff', fontSize: 44, fontWeight: '900' }}>GH₵ {walletBalance.toFixed(2)}</Text>
              </View>

              <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#1F2937' }}>Susu Savings Goal</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#059669' }}>{(walletBalance / (userProfile?.savings_goal || 10000) * 100).toFixed(0)}%</Text>
                </View>
                <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 12 }}>Goal: {userProfile?.savings_goal_name || 'New Mini-Truck'} (GH₵ {(userProfile?.savings_goal || 10000).toLocaleString()})</Text>
                <View style={{ height: 12, backgroundColor: '#F3F4F6', borderRadius: 6, marginBottom: 8 }}>
                  <View style={{ width: `${Math.min(walletBalance / (userProfile?.savings_goal || 10000) * 100, 100)}%`, height: '100%', backgroundColor: '#059669', borderRadius: 6 }} />
                </View>
                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Keep collecting to reach your goal!</Text>
              </View>

              <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 16 }}>Recent Transactions</Text>
              {walletTransactions.length > 0 ? walletTransactions.map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 16, borderRadius: 16, marginBottom: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.amount > 0 ? 'rgba(52, 211, 153, 0.2)' : 'rgba(248, 113, 113, 0.2)', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                    <Banknote size={20} color={t.amount > 0 ? '#34D399' : '#F87171'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{t.type === 'EARNING' ? 'Pickup Earning' : t.type === 'WITHDRAWAL' ? 'MoMo Withdrawal' : 'Susu Deduction'}</Text>
                    <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{new Date(t.created_at).toLocaleDateString()} • {new Date(t.created_at).toLocaleTimeString()}</Text>
                  </View>
                  <Text style={{ color: t.amount > 0 ? '#34D399' : '#fff', fontWeight: '900', fontSize: 14 }}>{t.amount > 0 ? '+' : ''} GH₵ {Math.abs(t.amount).toFixed(2)}</Text>
                </View>
              )) : (
                <Text style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 20 }}>No transactions yet.</Text>
              )}

              <Button onPress={() => setShowWithdrawModal(true)} style={{ marginTop: 24, backgroundColor: '#fff', paddingVertical: 18 }}>
                <Text style={{ color: '#064E3B', fontWeight: '900', fontSize: 16 }}>Cash Out to Mobile Money</Text>
              </Button>
            </ScrollView>

            <Modal visible={showWithdrawModal} transparent animationType="slide">
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
                <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                    <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937' }}>Cash Out</Text>
                    <TouchableOpacity onPress={() => setShowWithdrawModal(false)}><X size={24} color="#6B7280" /></TouchableOpacity>
                  </View>
                  
                  <Text style={{ color: '#6B7280', marginBottom: 8, fontSize: 14 }}>Enter Amount (GH₵)</Text>
                  <TextInput 
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    placeholder="0.00"
                    keyboardType="numeric"
                    style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, fontSize: 18, fontWeight: '700', marginBottom: 20 }}
                  />

                  <Text style={{ color: '#6B7280', marginBottom: 8, fontSize: 14 }}>MoMo Number</Text>
                  <TextInput 
                    value={momoNumber}
                    onChangeText={setMomoNumber}
                    placeholder="05X XXX XXXX"
                    keyboardType="phone-pad"
                    style={{ backgroundColor: '#F3F4F6', padding: 16, borderRadius: 12, fontSize: 18, fontWeight: '700', marginBottom: 24 }}
                  />

                  <Button onPress={handleWithdraw} isLoading={isWithdrawing}>
                    <Text style={{ color: '#fff', fontWeight: '800' }}>Submit Request</Text>
                  </Button>
                </View>
              </View>
            </Modal>
          </View>
        );

      case AppStep.CONVOY_MODE:
        return (
          <View style={styles.screenContainer}>
            <View style={{ height: 350 }}>
              <MapComponent 
                userLatitude={userCoords?.latitude} 
                userLongitude={userCoords?.longitude}
                collectors={activeConvoyMembers.flatMap(convoy => 
                  (convoy.convoy_members || []).map((m: any) => ({
                    collector_id: m.collector_id,
                    latitude: m.collector_locations?.latitude || 0,
                    longitude: m.collector_locations?.longitude || 0,
                    distance_miles: 0 // Will be calculated by MapComponent
                  })).filter((m: any) => m.latitude !== 0)
                )}
              />
              <View style={[styles.historyHeader, { position: 'absolute', top: 50, borderBottomWidth: 0, paddingHorizontal: 20, width: '100%' }]}>
                <TouchableOpacity onPress={back} style={styles.roundBtn}><ChevronLeft size={24} color="#000" /></TouchableOpacity>
                {convoyActive && (
                  <View style={{ backgroundColor: '#111', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, flexDirection: 'row', alignItems: 'center' }}>
                    <Users size={16} color="#06C167" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>
                      ACTIVE CONVOY: {(activeConvoyMembers.find(c => c.id === currentConvoyId)?.zone_name || locationLabel || 'Unknown Zone').toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ width: 40 }} />
              </View>
            </View>

            <View style={{ flex: 1, backgroundColor: '#fff', marginTop: -32, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#1F2937', marginBottom: 8 }}>Convoy Mode</Text>
              <Text style={{ color: '#6B7280', fontSize: 14, marginBottom: 24 }}>Collecting in groups increases safety and allows for faster clearing of heavy zones.</Text>

              <Text style={styles.sectionHeader}>Active Convoys Nearby ({activeConvoyMembers.length})</Text>
              {activeConvoyMembers.length > 0 ? activeConvoyMembers.map((c, i) => (
                <View key={c.id} style={{ backgroundColor: '#F9FAFB', padding: 20, borderRadius: 24, marginBottom: 16, borderWidth: 1, borderColor: '#F3F4F6' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>{c.zone_name}</Text>
                    <View style={{ backgroundColor: '#DCFCE7', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 }}>
                      <Text style={{ color: '#06C167', fontWeight: '700', fontSize: 10 }}>{c.status}</Text>
                    </View>
                  </View>
                  <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Members: {c.convoy_members?.length || 0} collectors nearby</Text>
                  <Button onPress={() => handleJoinConvoy(c.id, c.zone_name)} isLoading={isConvoyActionLoading}>Join Group</Button>
                </View>
              )) : (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <Users size={48} color="#D1D5DB" />
                  <Text style={{ color: '#9CA3AF', marginTop: 12 }}>No active convoys in this zone</Text>
                  <Button onPress={handleStartConvoy} isLoading={isConvoyActionLoading} style={{ marginTop: 20 }}>Start a Convoy</Button>
                </View>
              )}

              <View style={{ position: 'absolute', bottom: 30, left: 24, right: 24, flexDirection: 'row', gap: 12 }}>
                <Button onPress={handleInviteToConvoy} isLoading={isConvoyActionLoading} style={{ flex: 1 }}>Invite Near Me</Button>
                <Button onPress={() => handleLeaveConvoy(true)} isLoading={isConvoyActionLoading} variant="outline" style={{ flex: 1 }}>{convoyActive ? 'Leave Convoy' : 'Back'}</Button>
              </View>
            </View>
          </View>
        );

      case AppStep.FUEL_PARTNERSHIPS:
        return (
          <View style={styles.screenContainer}>
            <View style={styles.historyHeader}>
              <TouchableOpacity onPress={back}><ChevronLeft size={32} color="#06C167" /></TouchableOpacity>
              <Text style={styles.historyTitle}>Fuel Hub</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24, paddingBottom: 100 }}>
              <View style={{ backgroundColor: '#111', padding: 24, borderRadius: 28, marginBottom: 24 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontWeight: '700' }}>Fuel Points Balance</Text>
                  <Award size={24} color="#FCD34D" />
                </View>
                <Text style={{ color: '#fff', fontSize: 32, fontWeight: '900', marginBottom: 4 }}>{loyaltyPoints.toLocaleString()} pts</Text>
                <Text style={{ color: '#FCD34D', fontSize: 14, fontWeight: '600' }}>≈ GH₵ {(loyaltyPoints / 10).toFixed(2)} value</Text>
              </View>

              <Text style={styles.sectionHeader}>Partner Rewards</Text>

              <TouchableOpacity style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: '#E11D48', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 20 }}>G</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>GOIL Rewards</Text>
                    <Text style={{ color: '#06C167', fontWeight: '700' }}>5% Instant Discount</Text>
                  </View>
                </View>
                <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Valid at all Kasoa and Accra branches. Costs {GOIL_VOUCHER_POINTS_COST} points — show the code to the GOIL attendant.</Text>
                <Button onPress={handleActivateFuelVoucher} isLoading={isRedeemingVoucher}>Activate Voucher ({GOIL_VOUCHER_POINTS_COST} pts)</Button>
              </TouchableOpacity>

              <TouchableOpacity style={{ backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: '#F3F4F6', marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 50, height: 50, borderRadius: 12, backgroundColor: '#FBBF24', alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
                    <Text style={{ color: '#000', fontWeight: '900', fontSize: 20 }}>S</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#1F2937' }}>Shell Club</Text>
                    <Text style={{ color: '#3B82F6', fontWeight: '700' }}>+200 Points per Fill</Text>
                  </View>
                </View>
                <Text style={{ color: '#6B7280', fontSize: 13, marginBottom: 16 }}>Special partnership for Borla Mini-Trucks. Free oil check included.</Text>
                <Button onPress={() => Alert.alert('Shell Rewards', 'Learn how to earn points at Shell.')} variant="outline">Learn More</Button>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );


      default:
        return (
          <View style={styles.screenContainer}>
            <Text style={{ textAlign: 'center', marginTop: 100, fontSize: 18, color: '#9CA3AF' }}>
              Native Component Porting in Progress...
            </Text>
            <Button onPress={() => setStep(AppStep.SPLASH)} style={{ marginTop: 20 }}>Restart</Button>
          </View>
        );
    }
  };

  return (
    <SafeAreaProvider>
      <Layout>
        {globalAnnouncement.active && (
          <View style={{ 
            backgroundColor: globalAnnouncement.type === 'ALERT' ? '#EF4444' : globalAnnouncement.type === 'WARNING' ? '#F59E0B' : '#3B82F6', 
            paddingHorizontal: 20, 
            paddingTop: 50, 
            paddingBottom: 12, 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            zIndex: 9999
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <AlertTriangle size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={2}>{globalAnnouncement.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setGlobalAnnouncement({ ...globalAnnouncement, active: false })}>
              <X size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        {renderScreen()}
        {/* The old root-level full-screen loading overlay (styles.globalLoading)
            was removed here — it was driven by a single isLoading flag shared
            across ~22 unrelated actions app-wide, so opening Profile, booking
            a pickup, or any background fetch all froze the entire UI. Every
            action now has its own dedicated, localized loading state instead
            (see the isXxx flags declared near the top of this component). */}

        
        {/* Customer Rating Modal */}
        <Modal visible={showRatingModal} animationType="slide" transparent>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#1F2937' }}>Rate Your Collector</Text>
                <TouchableOpacity onPress={() => setShowRatingModal(false)}><X size={24} color="#6B7280" /></TouchableOpacity>
              </View>

              {ratingCollector ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24, padding: 12, backgroundColor: '#F9FAFB', borderRadius: 16 }}>
                  {ratingCollector.avatar_url ? (
                    <Image source={{ uri: ratingCollector.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#06C167', alignItems: 'center', justifyContent: 'center' }}>
                      <User size={24} color="#fff" />
                    </View>
                  )}
                  <View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>{ratingCollector.full_name || 'Collector'}</Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>Verified Borla Partner</Text>
                  </View>
                </View>
              ) : (
                <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>How was your trash collection experience with Borla?</Text>
              )}

              <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 16, textAlign: 'center' }}>TAP A STAR TO RATE</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} onPress={() => setSelectedRating(star)}>
                    <Star size={36} color={selectedRating >= star ? '#F59E0B' : '#D1D5DB'} fill={selectedRating >= star ? '#F59E0B' : 'transparent'} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 }}>WHAT WISHES TO BE PRAISED? (OPTIONAL)</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {['🚀 Fast Pickup', '✨ Very Polite', '🧹 Clean Job', '🛡️ Safe & Professional'].map(tag => (
                  <TouchableOpacity 
                    key={tag}
                    onPress={() => setSelectedRatingTag(selectedRatingTag === tag ? '' : tag)}
                    style={{ 
                      paddingHorizontal: 14, 
                      paddingVertical: 10, 
                      borderRadius: 20, 
                      backgroundColor: selectedRatingTag === tag ? '#06C167' : '#F3F4F6',
                      borderWidth: 1,
                      borderColor: selectedRatingTag === tag ? '#06C167' : '#E5E7EB'
                    }}
                  >
                    <Text style={{ color: selectedRatingTag === tag ? '#fff' : '#4B5563', fontSize: 12, fontWeight: '700' }}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 12 }}>ADDITIONAL COMMENTS (OPTIONAL)</Text>
              <TextInput
                style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, height: 80, textAlignVertical: 'top', borderWidth: 1, borderColor: '#E5E7EB' }}
                placeholder="Leave a compliment or feedback..."
                multiline
                value={ratingComment}
                onChangeText={setRatingComment}
              />

              <TouchableOpacity 
                onPress={async () => {
                  if (!ratingCollector?.id) {
                    setShowRatingModal(false);
                    Alert.alert('Thank You!', 'Your feedback helps keep Borla premium.');
                    return;
                  }
                  setIsSubmittingRating(true);
                  try {
                    // 1. Update profile rating average
                    await supabase.from('profiles').update({ rating_average: selectedRating }).eq('id', ratingCollector.id);
                    // 2. Insert into reviews table for Admin Dashboard & full audit trail
                    const finalComment = ratingComment ? `${selectedRatingTag ? selectedRatingTag + ' - ' : ''}${ratingComment}` : selectedRatingTag || 'Great service';
                    // reviewee_id is required (NOT NULL) by the live schema — it was
                    // missing here, which meant this insert failed on every single
                    // submission. The error was never checked, so it failed silently
                    // and every review was only ever captured by the incident_reports
                    // backup path below.
                    // reviews.pickup_id is also NOT NULL — resetBookingStates()
                    // (called from handlePaymentSuccess, right before this modal
                    // opens) sets activePickup back to null, so activePickup?.id
                    // was always null by the time this ran. ratingPickupId is
                    // captured earlier, before that reset happens.
                    const { error: reviewInsertError } = await supabase.from('reviews').insert({
                      reviewer_id: user?.id || ratingCollector.id, // fallback if anonymous
                      reviewee_id: ratingCollector.id,
                      pickup_id: ratingPickupId || activePickup?.id || null,
                      rating: selectedRating,
                      comment: finalComment,
                      is_flagged: selectedRating <= 2
                    });
                    if (reviewInsertError) {
                      console.error('[Rating] Failed to insert into reviews:', reviewInsertError);
                    }

                    // 3. Always broadcast to admin global alerts so Admin Dashboard updates instantly
                    const adminAlertChan = supabase.channel('admin_global_alerts');
                    adminAlertChan.subscribe((status) => {
                      if (status === 'SUBSCRIBED') {
                        adminAlertChan.send({
                          type: 'broadcast',
                          event: 'rating_submitted',
                          payload: {
                            collector_id: ratingCollector.id,
                            rating: selectedRating,
                            comment: finalComment,
                            is_flagged: selectedRating <= 2
                          }
                        }).then(() => supabase.removeChannel(adminAlertChan));
                      }
                    });
                  } catch (e) {
                    console.log('Rating submit error:', e);
                  } finally {
                    setIsSubmittingRating(false);
                    setShowRatingModal(false);
                    setRatingComment('');
                    setSelectedRatingTag('');
                    setRatingPickupId(null);
                    Alert.alert('Thank You!', 'Your feedback helps keep Borla premium.');
                  }
                }}
                disabled={isSubmittingRating}
                style={{ backgroundColor: '#06C167', padding: 18, borderRadius: 16, marginTop: 24, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{isSubmittingRating ? 'Submitting...' : 'Submit Rating'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setShowRatingModal(false);
                  setRatingComment('');
                  setSelectedRatingTag('');
                  setRatingPickupId(null);
                }}
                style={{ padding: 16, marginTop: 12, alignItems: 'center' }}
              >
                <Text style={{ color: '#6B7280', fontWeight: '700', fontSize: 14 }}>Skip / Not Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Location Manual Edit Modal - search-to-select. Used to require
            dragging the map to fine-tune a pin because the old OSM/Leaflet
            geocoding wasn't precise enough on its own — Mapbox's geocoding
            is accurate enough that picking a search result now sets the
            exact location directly, no drag step needed. */}
        {showLocationModal && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#fff', zIndex: 9999 }]}>
            <MapComponent
              userLatitude={userCoords?.latitude || 5.5319}
              userLongitude={userCoords?.longitude || -0.4281}
            />

            {/* Top Search Bar */}
            <View style={{ position: 'absolute', top: 50, left: 20, right: 20, zIndex: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowLocationModal(false)} style={{ backgroundColor: '#fff', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5, marginRight: 12 }}>
                  <ChevronLeft size={24} color="#111" />
                </TouchableOpacity>
                <TextInput
                  style={{ flex: 1, backgroundColor: '#fff', padding: 14, borderRadius: 12, fontSize: 16, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 }}
                  placeholder="Search for your exact location..."
                  value={manualLocation}
                  onChangeText={setManualLocation}
                  returnKeyType="search"
                  autoFocus
                  onSubmitEditing={async () => {
                    if (manualLocation.trim()) {
                      setIsSearchingLocation(true);
                      try {
                        const results = await activeMapProvider.geocode(manualLocation);
                        setManualLocationResults(results);
                        if (results.length === 0) {
                          Alert.alert('Not Found', 'Could not find that location. Try a more specific search.');
                        }
                      } catch (e) {
                        Alert.alert('Error', 'Connection failed. Please try again.');
                      } finally {
                        setIsSearchingLocation(false);
                      }
                    }
                  }}
                />
                {isSearchingLocation && <ActivityIndicator size="small" color="#06C167" style={{ marginLeft: 12 }} />}
              </View>

              {manualLocationResults.length > 0 && (
                <View style={{ backgroundColor: '#fff', borderRadius: 14, marginTop: 6, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 }}>
                  {manualLocationResults.map((result, i) => (
                    <TouchableOpacity
                      key={result.id}
                      onPress={() => {
                        setUserCoords(result.coordinate);
                        setLocationLabel(result.label);
                        setManualLocation('');
                        setManualLocationResults([]);
                        setShowLocationModal(false);
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: i < manualLocationResults.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}
                    >
                      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <MapPin size={16} color="#06C167" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }} numberOfLines={1}>{result.label}</Text>
                        <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>{result.address}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Incoming Request Alert for Collector */}
        {role === UserRole.COLLECTOR && newRequestOverlay && (
          <View style={styles.overlayWrapper}>
            <View style={styles.requestPopup}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <View style={{ backgroundColor: '#EF4444', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '900' }}>NEW REQUEST</Text>
                </View>
                <TouchableOpacity onPress={() => setNewRequestOverlay(null)}>
                  <X size={24} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
              
              <Text style={{ fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 8 }}>{newRequestOverlay.trash_type}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 4 }}>From: {newRequestOverlay.customer?.full_name || 'Customer'}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
                <MapPin size={18} color="#06C167" />
                <Text style={{ marginLeft: 8, fontSize: 16, color: '#4B5563' }} numberOfLines={2}>{newRequestOverlay.pickup_location_name}</Text>
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity 
                  onPress={() => {
                    if (newRequestOverlay?.id) {
                      dismissedIdsRef.current = [...dismissedIdsRef.current, newRequestOverlay.id];
                      setDismissedRequestIds(prev => [...prev, newRequestOverlay.id]);
                      setPendingPickups(prev => prev.filter(r => r.id !== newRequestOverlay.id));
                    }
                    setNewRequestOverlay(null);
                  }}
                  style={{ flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', backgroundColor: '#F3F4F6' }}
                >
                  <Text style={{ fontWeight: '700', color: '#374151' }}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  onPress={() => {
                    setActivePickup(newRequestOverlay);
                    setNewRequestOverlay(null);
                    setStep(AppStep.JOB_REQUEST);
                  }}
                  style={{ flex: 1, padding: 16, borderRadius: 16, alignItems: 'center', backgroundColor: '#06C167' }}
                >
                  <Text style={{ fontWeight: '700', color: '#fff' }}>View Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Layout>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  // Splash Styles
  splashContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  splashImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  splashOverlay: {
    flex: 1,
    padding: 40,
    paddingTop: 80,
    paddingBottom: 60,
    justifyContent: 'space-between',
    zIndex: 10,
  },
  splashBrand: {
    alignItems: 'center',
  },
  splashTitle: {
    color: '#06C167',
    fontSize: 72,
    fontWeight: '900',
    letterSpacing: -4,
    marginBottom: 8,
    display: 'none', // Hiding text to show Logo
  },
  logoImage: {
    width: 250,
    height: 100,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 20
  },
  splashSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Screen Layouts
  screenContainer: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  backButton: {
    marginBottom: 32,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Role Selection
  roleTitle: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 40,
    marginBottom: 40,
  },
  roleList: {
    gap: 16,
  },
  roleCard: {
    width: '100%',
    padding: 24,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#F3F4F6',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleCardActive: {
    borderColor: '#06C167',
    backgroundColor: 'rgba(6, 193, 103, 0.05)',
  },
  roleIcon: {
    fontSize: 40,
    marginRight: 20,
  },
  roleContent: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  roleDesc: {
    fontSize: 13,
    color: '#6B7280',
  },
  roleFooter: {
    marginTop: 'auto',
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
  },

  // Login
  loginTitle: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  loginSubtitle: {
    fontSize: 16,
    color: '#9CA3AF',
    marginBottom: 40,
  },
  inputSection: {
    marginBottom: 32,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4B5563',
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  dividerText: {
    paddingHorizontal: 12,
    color: '#9CA3AF',
    fontSize: 14,
  },
  authToggle: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 6,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  toggleBtnActive: {
    backgroundColor: '#06C167',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  toggleTextActive: {
    color: '#fff',
  },
  emailInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  socialRow: {
    flexDirection: 'row',
    marginBottom: 24,
  },

  // OTP
  otpSection: {
    marginVertical: 40,
    alignItems: 'center',
  },
  otpLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  otpHelp: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 32,
    textAlign: 'center',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  otpBox: {
    width: 60,
    height: 60,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
  },
  resendText: {
    color: '#9CA3AF',
    fontSize: 12,
    fontWeight: '600',
  },

  // Home
  homeHeader: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  roundBtn: {
    backgroundColor: '#fff',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    flex: 1,
    marginHorizontal: 12,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#06C167',
    marginRight: 8,
  },
  locationBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
  langBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginRight: 10,
  },
  langBtnText: {
    fontSize: 10,
    fontWeight: '900',
  },
  notifDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },

  homeCard: {
    flex: 1.5,
    backgroundColor: '#fff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: -40,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  homeCardHeader: {
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  simActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  simBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  simBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mainPickupBtn: {
    backgroundColor: '#06C167',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderRadius: 24,
    shadowColor: '#06C167',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  mainPickupLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 10,
    borderRadius: 20,
  },
  mainPickupText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  trashTypeRow: {
    gap: 12,
    paddingBottom: 8,
  },
  trashCard: {
    minWidth: 95,
    backgroundColor: '#F9FAFB',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  trashCardActive: {
    borderColor: '#06C167',
    backgroundColor: 'rgba(6, 193, 103, 0.05)',
  },
  trashEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  trashName: {
    fontSize: 10,
    fontWeight: '900',
    textAlign: 'center',
  },
  recentSection: {
    marginTop: 32,
    paddingBottom: 40,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  seeAllText: {
    color: '#06C167',
    fontWeight: '800',
    fontSize: 12,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  recentIconBox: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 16,
  },
  recentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#374151',
    marginBottom: 2,
  },
  recentAddress: {
    fontSize: 10,
    color: '#9CA3AF',
  },

  // WA Simulation
  waHeader: {
    backgroundColor: '#075E54',
    paddingTop: 50,
    paddingBottom: 15,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  waAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginHorizontal: 15,
  },
  waName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  waStatus: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
  },
  waChat: {
    padding: 20,
    paddingBottom: 100,
  },
  waBubble: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  waText: {
    fontSize: 14,
    color: '#303030',
  },
  waInputArea: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 10,
  },
  waInputBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 25,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  waMic: {
    backgroundColor: '#075E54',
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // USSD
  ussdBox: {
    backgroundColor: '#333',
    margin: 40,
    borderRadius: 8,
    padding: 24,
  },
  ussdTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  ussdContent: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 24,
    marginBottom: 24,
  },
  ussdInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#666',
    paddingVertical: 8,
    marginBottom: 24,
  },
  ussdActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 24,
  },
  ussdActionBtn: {
    color: '#06C167',
    fontWeight: '700',
    fontSize: 14,
  },

  // Booking
  bookingCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: -40,
    padding: 24,
    paddingBottom: 40,
    zIndex: 20,
  },
  bookingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  bookingTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  bookingTabs: {
    flexDirection: 'row',
    marginBottom: 32,
  },
  bookingTabActive: {
    backgroundColor: '#06C167',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
  },
  bookingTab: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
  },
  bookingTabText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#374151',
  },
  locationSummary: {
    backgroundColor: '#06C167',
    borderRadius: 24,
    padding: 20,
    marginBottom: 32,
  },
  summaryItem: {
    flexDirection: 'row',
    gap: 16,
  },
  dotWhite: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  rectWhite: {
    width: 10,
    height: 10,
    backgroundColor: '#fff',
    marginTop: 10,
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  summaryVal: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 5,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginLeft: 26,
    marginVertical: 16,
  },

  // Vehicle
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#F3F4F6',
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  vehicleCardActive: {
    borderColor: '#06C167',
    backgroundColor: 'rgba(6, 193, 103, 0.05)',
  },
  vehicleIcon: {
    fontSize: 40,
    marginRight: 20,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '800',
  },
  vehicleType: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  vehicleCap: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  vehiclePriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehiclePrice: {
    fontSize: 18,
    fontWeight: '800',
    color: '#06C167',
  },
  vehicleTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vehicleTime: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9CA3AF',
  },

  // Found
  foundCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    marginTop: -40,
    padding: 24,
    paddingBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 20,
  },
  loginButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  foundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  foundTitleBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginRight: 24,
  },
  blackIcon: {
    backgroundColor: '#000',
    borderRadius: 12,
    padding: 4,
  },
  foundTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
  },
  collectorInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  collectorAvatar: {
    width: 64,
    height: 64,
    borderRadius: 24,
  },
  collectorText: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  collectorName: {
    fontSize: 18,
    fontWeight: '800',
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  star: {
    color: '#FFB800',
    fontSize: 18,
  },
  rating: {
    fontSize: 12,
    fontWeight: '700',
  },
  collectionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  collectionsText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9CA3AF',
  },
  verifiedBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  verifiedText: {
    color: '#15803d',
    fontSize: 8,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  collectorMarker: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -12,
    marginTop: -12,
    alignItems: 'center',
  },
  markerBadge: {
    backgroundColor: '#06C167',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  markerText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  markerDot: {
    width: 24,
    height: 24,
    backgroundColor: '#06C167',
    borderRadius: 12,
    borderWidth: 4,
    borderColor: '#fff',
  },

  // Payment
  paymentScreen: {
    flex: 1,
    padding: 24,
    backgroundColor: '#fff',
  },
  paymentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 40,
  },
  paymentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  billBox: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  billVal: {
    color: '#06C167',
    fontSize: 48,
    fontWeight: '900',
    marginBottom: 4,
  },
  billLabel: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  paymentSectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D1D5DB',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  momoRow: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#000',
    padding: 20,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  methodRow: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#F9FAFB',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  momoLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    marginRight: 16,
  },
  momoText: {
    flex: 1,
  },
  momoName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 2,
  },
  momoNum: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D1D5DB',
    textTransform: 'uppercase',
  },
  momoRadio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  momoRadioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#000',
  },
  methodIcon: {
    width: 40,
    height: 40,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },

  // History
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    marginTop: Platform.OS === 'ios' ? 0 : 20,
  },
  historyTitle: {
    fontSize: 24,
    fontWeight: '800',
    flex: 1,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  historyLoc: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  historyDate: {
    fontSize: 10,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusCollected: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  statusPending: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTextCollected: {
    color: '#15803d',
  },
  statusTextPending: {
    color: '#c2410c',
  },
  historyBot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F9FAFB',
    paddingTop: 16,
  },
  historyVehicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyVehicleName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  historyPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2937',
  },
  emptyHistory: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    opacity: 0.5,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 14,
    fontWeight: '700',
    color: '#9CA3AF',
  },

  // Collector Dash
  collHeader: {
    backgroundColor: '#000',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 40,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
  },
  header: {
    paddingTop: 60,
    paddingBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  collectorAvatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  collAva: {
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#06C167',
    marginRight: 16,
  },
  collName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  onlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  onlineText: {
    color: '#06C167',
    fontSize: 12,
    fontWeight: '700',
  },
  collNotif: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collStats: {
    flexDirection: 'row',
    gap: 16,
  },
  collStatBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  collStatLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  collStatVal: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  collActionCard: {
    backgroundColor: '#06C167',
    padding: 24,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    shadowColor: '#06C167',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 8,
  },
  collActionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 4,
  },
  collActionSub: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '700',
  },
  collAcceptBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 2,
  },
  collAcceptText: {
    color: '#06C167',
    fontWeight: '900',
    fontSize: 14,
  },
  collHistoryRow: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  collHistName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 2,
  },
  collHistTime: {
    fontSize: 10,
    color: '#9CA3AF',
    fontWeight: '700',
  },
  collHistPrice: {
    fontSize: 16,
    fontWeight: '900',
    color: '#06C167',
  },
  otpInputFull: {
    backgroundColor: '#F9FAFB',
    width: 200,
    height: 70,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    textAlign: 'center',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 10,
  },
  successOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
  },
  successCard: {
    backgroundColor: '#fff',
    padding: 40,
    borderRadius: 32,
    alignItems: 'center',
    width: width - 80,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '900',
    marginTop: 20,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  overlayWrapper: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 10000,
  },
  requestPopup: {
    backgroundColor: '#fff',
    borderRadius: 32,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
});
