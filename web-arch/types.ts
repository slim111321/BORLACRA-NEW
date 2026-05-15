
export enum AppStep {
  SPLASH = 'SPLASH',
  LOGIN = 'LOGIN',
  OTP = 'OTP',
  ROLE_SELECTION = 'ROLE_SELECTION',
  HOME = 'HOME',
  BOOKING = 'BOOKING',
  SCHEDULE = 'SCHEDULE',
  VEHICLE_SELECTION = 'VEHICLE_SELECTION',
  COLLECTOR_FOUND = 'COLLECTOR_FOUND',
  PAYMENT = 'PAYMENT',
  COLLECTOR_DASHBOARD = 'COLLECTOR_DASHBOARD',
  ADMIN_DASHBOARD = 'ADMIN_DASHBOARD',
  WHATSAPP_SIM = 'WHATSAPP_SIM',
  USSD_SIM = 'USSD_SIM',
  PROFILE = 'PROFILE',
  HISTORY = 'HISTORY',
  CHAT = 'CHAT',
  SUBSCRIPTIONS = 'SUBSCRIPTIONS',
  NOTIFICATIONS = 'NOTIFICATIONS',
  SAVED_LOCATIONS = 'SAVED_LOCATIONS',
  SETTINGS = 'SETTINGS',
  HELP = 'HELP'
}

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  COLLECTOR = 'COLLECTOR',
  ADMIN = 'ADMIN'
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
