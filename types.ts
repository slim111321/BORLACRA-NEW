
export enum AppStep {
  SPLASH = 'SPLASH',
  LOGIN = 'LOGIN',
  OTP = 'OTP',
  ROLE_SELECTION = 'ROLE_SELECTION',
  HOME = 'HOME',
  BOOKING = 'BOOKING',
  SCHEDULE = 'SCHEDULE',
  VEHICLE_SELECTION = 'VEHICLE_SELECTION',
  SEARCHING_COLLECTOR = 'SEARCHING_COLLECTOR',
  COLLECTOR_FOUND = 'COLLECTOR_FOUND',
  PAYMENT = 'PAYMENT',
  COLLECTOR_DASHBOARD = 'COLLECTOR_DASHBOARD',

  WHATSAPP_SIM = 'WHATSAPP_SIM',
  USSD_SIM = 'USSD_SIM',
  PROFILE = 'PROFILE',
  COLLECTOR_PROFILE = 'COLLECTOR_PROFILE',
  HISTORY = 'HISTORY',
  CHAT = 'CHAT',
  SUBSCRIPTIONS = 'SUBSCRIPTIONS',
  NOTIFICATIONS = 'NOTIFICATIONS',
  SAVED_LOCATIONS = 'SAVED_LOCATIONS',
  SETTINGS = 'SETTINGS',
  HELP = 'HELP',
  PERSONAL_INFO = 'PERSONAL_INFO',
  PAYMENT_METHODS = 'PAYMENT_METHODS',
  COLLECTOR_PROFILE_SETUP = 'COLLECTOR_PROFILE_SETUP',
  PICKUP_NAVIGATION = 'PICKUP_NAVIGATION',
  COLLECTOR_ONBOARDING_WELCOME = 'COLLECTOR_ONBOARDING_WELCOME',
  COLLECTOR_VEHICLE_REGISTRATION = 'COLLECTOR_VEHICLE_REGISTRATION',
  COLLECTOR_DOCUMENT_UPLOAD = 'COLLECTOR_DOCUMENT_UPLOAD',
  COLLECTOR_PENDING_APPROVAL = 'COLLECTOR_PENDING_APPROVAL',
  JOB_REQUEST = 'JOB_REQUEST',
  COLLECTOR_JOB = 'COLLECTOR_JOB',
  COLLECTOR_EARNINGS = 'COLLECTOR_EARNINGS',
  COLLECTOR_RATINGS = 'COLLECTOR_RATINGS',
  COLLECTOR_CHALLENGES = 'COLLECTOR_CHALLENGES',
  COLLECTOR_CHAT = 'COLLECTOR_CHAT',
  COLLECTOR_SCHEDULE = 'COLLECTOR_SCHEDULE',
  COLLECTOR_SAFETY = 'COLLECTOR_SAFETY',
  COLLECTOR_SUPPORT = 'COLLECTOR_SUPPORT',
  AI_ESTIMATOR = 'AI_ESTIMATOR',
  COMMUNITY_POOL = 'COMMUNITY_POOL',
  PROOF_UPLOAD = 'PROOF_UPLOAD',
  LANDFILL_VERIFICATION = 'LANDFILL_VERIFICATION',
  SCRAP_MARKETPLACE = 'SCRAP_MARKETPLACE',
  COLLECTOR_WALLET = 'COLLECTOR_WALLET',
  CONVOY_MODE = 'CONVOY_MODE',
  FUEL_PARTNERSHIPS = 'FUEL_PARTNERSHIPS',
  PICKUP_CHAT = 'PICKUP_CHAT',
  INCIDENT_REPORT = 'INCIDENT_REPORT',
  CUSTOMER_PICKUP_ONGOING = 'CUSTOMER_PICKUP_ONGOING',
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  COLLECTOR = 'COLLECTOR',
  ADMIN = 'ADMIN'
}

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export enum CollectorStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  BUSY = 'BUSY',
  MOVING = 'MOVING',
  AT_LANDFILL = 'AT_LANDFILL',
  IDLE = 'IDLE'
}


export interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  avatar_url?: string;
  wallet_balance: number;
  status: UserStatus;
  collector_status?: CollectorStatus;
  push_token?: string;

  is_verified: boolean;
  updated_at: string;
}

export interface TrashVehicle {
  id: string;
  name: string;
  capacity: string;
  price: string;
  time: string;
  type: string;
  icon: string;
  description: string;
}

export interface LocationItem {
  name: string;
  address: string;
}

export enum TrashType {
  HOUSEHOLD = 'Household',
  MARKET = 'Market Waste',
  PLASTIC = 'Plastic / Recycling',
  MIXED = 'Mixed Waste'
}

export interface CardOnFile {
  id: string;
  user_id: string;
  authorization_code: string;
  last4: string;
  exp_month: string;
  exp_year: string;
  card_type: string;
  bank: string;
  created_at: string;
}

export type SubscriptionFrequency = 'weekly' | 'bi-weekly' | 'monthly';
export type SubscriptionBilling = 'prepaid' | 'postpaid' | 'pay_on_pickup';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';

export interface TrashSubscription {
  id: string;
  user_id: string;
  frequency: SubscriptionFrequency;
  day_of_week: string;
  time_window: string;
  billing_preference: SubscriptionBilling;
  collection_address: string;
  card_id?: string;
  status: SubscriptionStatus;
  created_at: string;
  next_pickup_date?: string;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'failed';

export interface Invoice {
  id: string;
  user_id: string;
  subscription_id: string;
  amount_due: number;
  period_start: string;
  period_end: string;
  status: InvoiceStatus;
  due_date: string;
  created_at: string;
  paid_at?: string;
}
