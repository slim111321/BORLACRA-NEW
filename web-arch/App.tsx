
import React, { useState } from 'react';
import { Layout } from './components/Layout';
import {
  ChevronLeft,
  Search,
  Clock,
  Calendar,
  Bell,
  Menu,
  CreditCard,
  Wallet,
  Smartphone,
  MessageSquare,
  Phone,
  CheckCircle,
  MapPin,
  Map as MapIcon,
  Navigation,
  User,
  Car,
  ChevronRight,
  Settings,
  Globe
} from 'lucide-react';
import { Button } from './components/Button';
import { BottomNav } from './components/BottomNav';
import { MapMock } from './components/MapMock';
import { supabase } from './lib/supabase';
import { TRASH_VEHICLES, RECENT_LOCATIONS, NEAR_YOU, TRASH_TYPES } from './constants';
import { AppStep, UserRole, TrashType } from './types';

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
    whereTo: "Pick up Trash?",
    requestCollection: "Request Collection",
    confirmLocation: "Confirm Location",
    chooseVehicle: "Choose Vehicle",
    collectorAssigned: "Collector Assigned",
    confirmMeeting: "Confirm Meeting",
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
    whereTo: "Yɛmfa nwura?",
    requestCollection: "Gye nwura",
    confirmLocation: "Ma yɛnhu baabi",
    chooseVehicle: "Fa lɔre",
    collectorAssigned: "Yɛanya obi",
    confirmMeeting: "Yɛahyia",
    payment: "Tua Ka",
    totalBill: "Nea wotua nyinaa",
    confirmPayment: "Tua Ka",
    whoAreYou: "Hwan ne wo?",
    customer: "Okuafoɔ",
    collector: "Nwura gyefoɔ",
    admin: "Panin"
  }
};

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>(AppStep.SPLASH);
  const [role, setRole] = useState<UserRole>(UserRole.CUSTOMER);
  const [mobileNumber, setMobileNumber] = useState('');
  const [scheduledDateTime, setScheduledDateTime] = useState<{ date: string, time: string } | null>(null);
  const [selectedTrashType, setSelectedTrashType] = useState<TrashType>(TrashType.HOUSEHOLD);
  const [language, setLanguage] = useState<'English' | 'Twi'>('English');
  const [pickups, setPickups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (step === AppStep.HOME || step === AppStep.HISTORY) {
      fetchHistory();
    }
  }, [step]);

  const fetchHistory = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('pickups')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPickups(data);
    }
    setIsLoading(false);
  };

  const handleRequestCollection = async () => {
    setIsLoading(true);
    const { error } = await supabase.from('pickups').insert([{
      trash_type: selectedTrashType,
      pickup_location_name: 'Kasoa New Market, Ghana',
      pricing_ghs: 85,
      status: 'PENDING'
    }]);

    if (!error) {
      setStep(AppStep.COLLECTOR_FOUND);
    } else {
      console.error('Error creating pickup:', error);
    }
    setIsLoading(false);
  };

  const next = () => {
    if (step === AppStep.SPLASH) setStep(AppStep.ROLE_SELECTION);
    else if (step === AppStep.ROLE_SELECTION) setStep(AppStep.LOGIN);
    else if (step === AppStep.LOGIN) setStep(AppStep.OTP);
    else if (step === AppStep.OTP) {
      if (role === UserRole.CUSTOMER) setStep(AppStep.HOME);
      else if (role === UserRole.COLLECTOR) setStep(AppStep.COLLECTOR_DASHBOARD);
      else if (role === UserRole.ADMIN) setStep(AppStep.ADMIN_DASHBOARD);
    }
    else if (step === AppStep.HOME) setStep(AppStep.BOOKING);
    else if (step === AppStep.BOOKING) setStep(AppStep.VEHICLE_SELECTION);
    else if (step === AppStep.SCHEDULE) setStep(AppStep.BOOKING);
    else if (step === AppStep.VEHICLE_SELECTION) handleRequestCollection();
    else if (step === AppStep.COLLECTOR_FOUND) setStep(AppStep.PAYMENT);
    else if (step === AppStep.PAYMENT) setStep(AppStep.HOME);
  };

  const back = () => {
    if ([AppStep.PROFILE, AppStep.HISTORY, AppStep.CHAT, AppStep.NOTIFICATIONS, AppStep.SETTINGS, AppStep.HELP, AppStep.SUBSCRIPTIONS, AppStep.SAVED_LOCATIONS].includes(step)) {
      setStep(AppStep.HOME);
    }
    else if (step === AppStep.LOGIN) setStep(AppStep.ROLE_SELECTION);
    else if (step === AppStep.ROLE_SELECTION) setStep(AppStep.SPLASH);
    else if (step === AppStep.OTP) setStep(AppStep.LOGIN);
    else if (step === AppStep.BOOKING) setStep(AppStep.HOME);
    else if (step === AppStep.SCHEDULE) setStep(AppStep.BOOKING);
    else if (step === AppStep.VEHICLE_SELECTION) setStep(AppStep.BOOKING);
    else if (step === AppStep.COLLECTOR_FOUND) setStep(AppStep.VEHICLE_SELECTION);
    else if (step === AppStep.PAYMENT) setStep(AppStep.COLLECTOR_FOUND);
    else if (step === AppStep.WHATSAPP_SIM || step === AppStep.USSD_SIM) setStep(AppStep.HOME);
  };

  const t = TRANSLATIONS[language];

  const openSchedule = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStep(AppStep.SCHEDULE);
  };

  const renderScreen = () => {
    switch (step) {
      case AppStep.SPLASH:
        return (
          <div className="relative w-full h-full bg-uber-black">
            <img
              src="https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?q=80&w=2070&auto=format&fit=crop"
              className="absolute inset-0 w-full h-full object-cover opacity-60"
              alt="Trash collection background"
            />
            <div className="relative h-full flex flex-col items-center justify-between p-10 pt-24 pb-16 z-10">
              <div className="text-center">
                <h1 className="text-white text-8xl font-black font-raleway tracking-tighter mb-2">SAMSA</h1>
                <p className="text-white/80 text-lg font-medium">Anytime, Anywhere. Trash Gone.</p>
              </div>
              <Button onClick={next}>Get Started</Button>
            </div>
          </div>
        );

      case AppStep.ROLE_SELECTION:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <h2 className="text-4xl font-bold font-raleway mb-10 text-center mt-12">{t.whoAreYou}</h2>
            <div className="space-y-6">
              {[
                { r: UserRole.CUSTOMER, label: t.customer, icon: '🏠', desc: 'Household, Market, Business' },
                { r: UserRole.COLLECTOR, label: t.collector, icon: '🚛', desc: 'Truck, Mini-Truck, Tricycle' },
                { r: UserRole.ADMIN, label: t.admin, icon: '⚙️', desc: 'Platform Management' }
              ].map((item) => (
                <button
                  key={item.r}
                  onClick={() => { setRole(item.r); next(); }}
                  title={item.label}
                  className={`w-full p-6 rounded-3xl border-2 flex items-center gap-6 transition-all ${role === item.r ? 'border-uber-green bg-uber-green/5' : 'border-gray-100 bg-white'}`}
                >
                  <div className="text-4xl">{item.icon}</div>
                  <div className="text-left">
                    <h4 className="font-bold text-xl">{item.label}</h4>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-auto text-center text-gray-400 text-sm">Select your role to continue</p>
          </div>
        );

      case AppStep.LOGIN:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <button title="Back" onClick={back} className="mb-8"><ChevronLeft size={24} /></button>
            <h2 className="text-3xl font-bold font-raleway mb-2">{t.welcome}</h2>
            <p className="text-gray-400 mb-10">{t.subWelcome}</p>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Enter Mobile Number</label>
              <div className="flex items-center bg-gray-100/80 rounded-xl p-4 border border-gray-200">
                <span className="text-gray-600 font-medium mr-2">+91 ⌄</span>
                <input
                  type="tel"
                  placeholder="Mobile Number.."
                  className="bg-transparent flex-1 outline-none text-uber-black"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                />
              </div>
            </div>

            <Button onClick={next} className="mb-6">Continue</Button>

            <div className="relative mb-8 text-center">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div>
              <span className="relative bg-uber-bg px-2 text-gray-400 text-sm">or</span>
            </div>

            <div className="flex gap-4 mb-8">
              <Button variant="outline" className="flex items-center gap-2 text-base">
                <img src="https://www.google.com/favicon.ico" className="w-4 h-4" alt="Google" /> Google
              </Button>
              <Button variant="outline" className="flex items-center gap-2 text-base">
                <Smartphone size={18} /> Apple
              </Button>
            </div>

            <Button variant="outline" className="flex items-center gap-2 text-base border-gray-200">
              <Search size={18} /> Find my account
            </Button>
          </div>
        );

      case AppStep.OTP:
        return (
          <div className="relative w-full h-full p-8 flex flex-col">
            <img
              src="https://images.unsplash.com/photo-1512428559083-a401c4c3755c?q=80&w=2070&auto=format&fit=crop"
              className="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none"
              alt="Background"
            />
            <button onClick={back} className="mb-10 text-uber-green"><ChevronLeft size={32} /></button>
            <h2 className="text-4xl font-bold font-raleway mb-2">Akwaaba !</h2>
            <p className="text-uber-textSecondary text-lg mb-8">Let's clean up Kasoa today.</p>

            <div className="mb-10 text-center">
              <p className="text-sm font-medium text-gray-700 mb-2">Enter the 4-digit code</p>
              <p className="text-xs text-gray-400 mb-6">Sent via SMS at 9XXXXXXXXX<br />Changed your number ?</p>
              <div className="flex justify-center gap-4 mb-6">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="w-14 h-14 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-xl font-bold"></div>
                ))}
              </div>
              <button className="text-xs font-medium text-gray-500">Resend code via SMS</button>
            </div>

            <Button onClick={next}>Continue</Button>
          </div>
        );

      case AppStep.HOME:
        return (
          <div className="relative w-full h-full flex flex-col">
            <div className="flex-1 relative">
              <MapMock />

              <div className="absolute top-10 left-6 right-6 flex justify-between items-center z-10">
                <button
                  onClick={() => setStep(AppStep.SETTINGS)}
                  className="bg-white p-3 rounded-full shadow-lg"
                  title="Menu"
                >
                  <Menu size={24} />
                </button>
                <div className="flex items-center bg-white/95 px-4 py-2 rounded-full shadow-lg border border-gray-100">
                  <div className="bg-uber-green w-2 h-2 rounded-full mr-2"></div>
                  <span className="text-xs font-bold text-gray-800">Location: Kasoa market</span>
                </div>
                <button
                  onClick={() => setLanguage(language === 'English' ? 'Twi' : 'English')}
                  className="bg-white px-4 py-2 rounded-full shadow-lg text-[10px] font-black border border-gray-100 hover:bg-gray-50 transition-colors"
                  title="Toggle language"
                >
                  {language === 'English' ? 'TWI' : 'ENG'}
                </button>
                <button
                  onClick={() => setStep(AppStep.NOTIFICATIONS)}
                  className="bg-white p-3 rounded-full shadow-lg relative"
                  title="Notifications"
                >
                  <Bell size={24} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-t-[40px] px-6 pt-8 pb-32 -mt-10 relative z-20 shadow-2xl">
              <div className="mb-8">
                <h3 className="text-2xl font-black font-raleway mb-1">{t.akwaaba}</h3>
                <p className="text-gray-400 text-sm">{t.cleanUp}</p>
              </div>

              <div className="flex gap-3 mb-6">
                <button
                  onClick={() => setStep(AppStep.WHATSAPP_SIM)}
                  title="WhatsApp Bot"
                  className="flex-1 bg-green-500/10 text-green-700 py-3 rounded-2xl text-[10px] font-bold flex items-center justify-center gap-2 border border-green-200"
                >
                  <MessageSquare size={14} /> WhatsApp Bot
                </button>
                <button
                  onClick={() => setStep(AppStep.USSD_SIM)}
                  title="USSD Menu"
                  className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-2xl text-[10px] font-bold flex items-center justify-center gap-2 border border-gray-200"
                >
                  <Smartphone size={14} /> USSD Dial
                </button>
              </div>

              <div className="flex gap-4 mb-8">
                <button onClick={next} className="flex-1 bg-uber-green text-white py-4 px-6 rounded-full flex items-center justify-between shadow-lg shadow-green-100 transition-transform active:scale-95">
                  <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-full"><MapIcon size={20} /></div>
                    <span className="font-bold">{t.pickupTrash}</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="mb-8">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{t.trashType}</h3>
                <div className="flex gap-3 overflow-x-auto no-scrollbar">
                  {TRASH_TYPES.map((type) => (
                    <button
                      key={type.id}
                      onClick={() => setSelectedTrashType(type.name)}
                      title={type.name}
                      className={`flex flex-col items-center justify-center min-w-[95px] p-5 rounded-3xl border-2 transition-all ${selectedTrashType === type.name ? 'border-uber-green bg-uber-green/5' : 'border-gray-50 bg-gray-50'}`}
                    >
                      <span className="text-2xl mb-2">{type.icon}</span>
                      <span className="text-[10px] font-black text-center leading-tight">{type.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <section>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800">{t.recent}</h3>
                    <button onClick={() => setStep(AppStep.HISTORY)} className="text-uber-green font-bold text-xs">See All</button>
                  </div>
                  <div className="space-y-4">
                    {RECENT_LOCATIONS.map((loc, i) => (
                      <div key={i} className="flex items-center gap-4 group cursor-pointer" onClick={() => setStep(AppStep.BOOKING)}>
                        <div className="bg-gray-100 p-3 rounded-2xl group-hover:bg-uber-green/10 transition-colors"><MapPin className="text-gray-400 group-hover:text-uber-green" size={20} /></div>
                        <div>
                          <h4 className="font-bold text-sm text-gray-700">{loc.name}</h4>
                          <p className="text-[10px] text-gray-400">{loc.address}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-800">{t.nearYou}</h3>
                    <button className="text-uber-green font-bold text-xs">See All</button>
                  </div>
                  <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                    {NEAR_YOU.map((place, i) => (
                      <div key={i} className="min-w-[140px] bg-white p-4 rounded-3xl border border-gray-100 shadow-sm active:scale-95 transition-transform">
                        <div className="text-2xl mb-2">{place.icon}</div>
                        <h4 className="font-bold text-xs mb-1">{place.name}</h4>
                        <p className="text-[10px] text-gray-400">{place.dist} • {place.time}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.SCHEDULE:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-white">
            <div className="flex items-center gap-4 mb-10">
              <button title="Back" onClick={back} className="text-uber-green p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">{t.schedulePickup}</h2>
            </div>

            <div className="flex-1 space-y-10">
              <section>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">{t.selectDate}</h3>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                  {[0, 1, 2, 3, 4, 5, 6].map((offset) => {
                    const d = new Date();
                    d.setDate(d.getDate() + offset);
                    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
                    const dateNum = d.getDate();
                    const isSelected = scheduledDateTime?.date === d.toDateString();

                    return (
                      <button
                        key={offset}
                        onClick={() => setScheduledDateTime(prev => ({ time: prev?.time || '10:00 AM', date: d.toDateString() }))}
                        className={`flex flex-col items-center justify-center min-w-[65px] h-[100px] rounded-3xl border-2 transition-all ${isSelected ? 'bg-uber-green border-uber-green text-white shadow-lg shadow-green-100' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'
                          }`}
                      >
                        <span className="text-[10px] font-bold uppercase mb-2">{dayName}</span>
                        <span className="text-lg font-bold">{dateNum}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-6">{t.selectTime}</h3>
                <div className="grid grid-cols-4 gap-3">
                  {['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map((time) => {
                    const [h, m] = time.split(':');
                    const label = parseInt(h) >= 12 ? `${parseInt(h) === 12 ? 12 : parseInt(h) - 12}:${m} PM` : `${h}:${m} AM`;
                    const isSelected = scheduledDateTime?.time === label;

                    return (
                      <button
                        key={time}
                        onClick={() => setScheduledDateTime(prev => ({ date: prev?.date || new Date().toDateString(), time: label }))}
                        className={`py-3 rounded-2xl border-2 text-[10px] font-bold transition-all ${isSelected ? 'bg-uber-black border-uber-black text-white' : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200'
                          }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100">
                <div className="flex items-center gap-4 text-gray-400 mb-2">
                  <Clock size={16} />
                  <span className="text-[10px] font-bold uppercase tracking-widest">{t.selectedWindow}</span>
                </div>
                <p className="text-lg font-bold text-gray-800">
                  {scheduledDateTime ? `${scheduledDateTime.date} at ${scheduledDateTime.time}` : 'Please select a date and time'}
                </p>
                <p className="text-[10px] text-gray-400 mt-2">Pick up within 15 mins of this time.</p>
              </div>
            </div>

            <Button
              disabled={!scheduledDateTime}
              onClick={next}
              className={!scheduledDateTime ? 'opacity-50 grayscale pointer-events-none' : ''}
            >
              Set Schedule
            </Button>
          </div>
        );

      case AppStep.BOOKING:
        return (
          <div className="relative w-full h-full flex flex-col">
            <div className="h-[300px] relative">
              <MapMock />
              <div className="absolute top-10 left-6 right-6 flex justify-between items-center">
                <button title="Menu" className="bg-white p-3 rounded-full shadow-lg"><Menu size={20} /></button>
                <button title="Notifications" className="bg-white p-3 rounded-full shadow-lg"><Bell size={20} /></button>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-t-[40px] -mt-12 px-6 pt-8 pb-20 overflow-y-auto no-scrollbar relative z-20">
              <div className="flex items-center gap-4 mb-6">
                <button title="Back" onClick={back} className="text-uber-green"><ChevronLeft size={28} /></button>
                <h2 className="text-xl font-bold font-raleway flex-1 text-center pr-8">{t.requestCollection}</h2>
              </div>

              <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
                <button
                  onClick={openSchedule}
                  className={`flex items-center gap-2 border px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold transition-colors ${scheduledDateTime ? 'bg-uber-green text-white border-uber-green' : 'bg-white border-gray-200 text-gray-800'
                    }`}
                >
                  <Clock size={14} className={scheduledDateTime ? 'text-white' : 'text-uber-green'} />
                  {scheduledDateTime ? `Pickup: ${scheduledDateTime.time}` : 'Pickup now'} ⌄
                </button>
                <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold">
                  <User size={14} className="text-uber-green" /> For Me ⌄
                </button>
                <button className="flex items-center gap-2 bg-white border border-gray-200 px-4 py-2 rounded-full whitespace-nowrap text-xs font-bold">
                  <MapIcon size={14} className="text-uber-green" /> Stop
                </button>
              </div>

              <div className="bg-uber-green text-white p-5 rounded-3xl space-y-4 mb-8 shadow-lg shadow-green-100">
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 rounded-full bg-white"></div>
                  <div className="flex-1">
                    <p className="text-xs opacity-70 mb-1">{t.pickupLocation}</p>
                    <input title="Pickup Location" className="bg-transparent border-none outline-none font-bold text-sm w-full placeholder-white" value="Kasoa New Market, Ghana" readOnly />
                  </div>
                </div>
                <div className="h-[1px] bg-white/20 ml-6"></div>
                <div className="flex items-center gap-4">
                  <div className="w-2 h-2 bg-white"></div>
                  <div className="flex-1">
                    <p className="text-xs opacity-70 mb-1">{t.trashType}</p>
                    <input title="Trash Type" className="bg-transparent border-none outline-none font-bold text-sm w-full placeholder-white" value={selectedTrashType} readOnly />
                  </div>
                </div>
              </div>

              <div className="space-y-6 mb-8">
                {RECENT_LOCATIONS.map((loc, i) => (
                  <div key={i} className="flex items-center gap-4 hover:bg-gray-50 p-2 rounded-xl transition-colors cursor-pointer">
                    <Clock size={18} className="text-gray-400" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-gray-800">{loc.name}</h4>
                      <p className="text-[10px] text-gray-400 truncate">{loc.address}</p>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-4 py-2 hover:bg-gray-50 px-2 rounded-xl cursor-pointer">
                  <Search size={18} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-600">Search in a different country</span>
                </div>
                <div className="flex items-center gap-4 py-2 hover:bg-gray-50 px-2 rounded-xl cursor-pointer">
                  <MapPin size={18} className="text-gray-400" />
                  <span className="text-sm font-bold text-gray-600">Pin location on map</span>
                </div>
              </div>

              <Button onClick={next} className="mt-auto">{t.confirmLocation}</Button>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.VEHICLE_SELECTION:
        return (
          <div className="relative w-full h-full flex flex-col">
            <div className="h-[250px] relative">
              <MapMock />
              <div className="absolute top-10 left-6 right-6 flex justify-between items-center">
                <button title="Menu" className="bg-white p-3 rounded-full shadow-lg"><Menu size={20} /></button>
                <button title="Notifications" className="bg-white p-3 rounded-full shadow-lg"><Bell size={20} /></button>
              </div>
            </div>

            <div className="flex-1 bg-white rounded-t-[40px] -mt-12 px-6 pt-8 pb-20 overflow-y-auto no-scrollbar relative z-20">
              <div className="flex items-center gap-4 mb-8">
                <button title="Back" onClick={back} className="text-uber-green"><ChevronLeft size={28} /></button>
                <h2 className="text-xl font-bold font-raleway flex-1 text-center pr-8">{t.chooseVehicle}</h2>
              </div>

              {scheduledDateTime && (
                <div className="mb-6 p-4 bg-uber-black text-white rounded-3xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Calendar size={18} className="text-uber-green" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase text-gray-400">{t.scheduledFor}</span>
                      <span className="text-xs font-bold">{scheduledDateTime.date} @ {scheduledDateTime.time}</span>
                    </div>
                  </div>
                  <button onClick={openSchedule} className="text-[10px] font-bold text-uber-green border-b border-uber-green">Edit</button>
                </div>
              )}

              <div className="space-y-4 mb-8">
                {TRASH_VEHICLES.map((v) => (
                  <div
                    key={v.id}
                    className={`flex items-center p-4 rounded-3xl border-2 transition-all cursor-pointer ${v.id === '1' ? 'border-uber-green bg-uber-green/5' : 'border-gray-100 bg-gray-50'}`}
                  >
                    <div className="text-4xl mr-6">{v.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-lg">{v.name}</h4>
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{v.type}</span>
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 font-medium">Cap: {v.capacity}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-uber-green font-bold text-lg">{v.price}</span>
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 font-bold">
                          <Clock size={12} /> {v.time}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button onClick={next}>{t.confirmCollection}</Button>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.COLLECTOR_FOUND:
        return (
          <div className="relative w-full h-full flex flex-col">
            <div className="flex-1 relative">
              <MapMock showRoute={true} />

              <div className="absolute top-10 left-6 right-6 flex justify-between items-center z-10">
                <button title="Menu" onClick={() => setStep(AppStep.SETTINGS)} className="bg-white p-3 rounded-full shadow-lg"><Menu size={24} /></button>
                <button title="Notifications" onClick={() => setStep(AppStep.NOTIFICATIONS)} className="bg-white p-3 rounded-full shadow-lg relative">
                  <Bell size={24} />
                  <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
                </button>
              </div>

              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="bg-uber-green text-white px-4 py-1 rounded-full text-xs font-bold flex items-center gap-2 mb-2 shadow-lg">
                  <Clock size={12} fill="white" /> 5:12
                </div>
                <div className="w-6 h-6 bg-uber-green rounded-full border-4 border-white shadow-xl"></div>
              </div>
            </div>

            <div className="bg-white rounded-t-[40px] px-6 pt-6 pb-24 -mt-10 relative z-20 shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <button onClick={back} className="text-uber-green"><ChevronLeft size={24} /></button>
                <div className="flex-1 flex items-center justify-center gap-2">
                  <div className="bg-uber-black p-2 rounded-full text-white"><User size={16} /></div>
                  <span className="font-bold text-gray-800">Collector Assigned</span>
                </div>
              </div>

              <div className="flex items-center gap-4 mb-6">
                <img src="https://i.pravatar.cc/150?u=kwame" className="w-16 h-16 rounded-3xl object-cover shadow-md" alt="Kwame" />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xl">Kwame Mensah</h4>
                    <div className="flex items-center gap-1">
                      <span className="text-uber-yellow text-lg">★</span>
                      <span className="text-sm font-bold">4.9 stars</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-400 font-bold mb-1">
                    <CheckCircle size={14} className="text-uber-green" /> Collections : 1,200+
                  </div>
                  <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">SamSa Verified Collector</span>
                </div>
              </div>

              <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
                <div className="bg-uber-green/10 text-uber-green px-3 py-2 rounded-full flex items-center gap-1 text-[10px] font-bold whitespace-nowrap">
                  Verified Collector
                </div>
                <div className="bg-uber-green/10 text-uber-green px-3 py-2 rounded-full flex items-center gap-1 text-[10px] font-bold whitespace-nowrap">
                  Plastic Expert
                </div>
              </div>

              <Button onClick={next}>Confirm Meeting</Button>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.PAYMENT:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button title="Back" onClick={back} className="text-uber-green p-1 hover:bg-gray-200 rounded-full"><ChevronLeft size={32} /></button>
              <div className="flex-1 flex items-center justify-center gap-2">
                <Wallet size={24} className="text-uber-black" strokeWidth={2.5} />
                <h2 className="text-2xl font-bold font-raleway">{t.payment}</h2>
              </div>
            </div>

            <div className="text-center mb-10">
              <div className="bg-white rounded-[32px] p-8 shadow-xl shadow-gray-200/50">
                <p className="text-uber-green font-bold text-5xl mb-1">GH₵ 85.00</p>
                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">{t.totalBill}</p>
              </div>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto no-scrollbar pb-10">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Mobile Money (Ghana)</h3>
                <div className="space-y-4">
                  <div className="bg-white border-2 border-uber-black p-5 rounded-3xl flex items-center justify-between shadow-md">
                    <div className="flex items-center gap-4">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/9/93/MTN_Logo.svg" className="w-10 h-10 object-contain" alt="MTN" />
                      <div>
                        <h4 className="font-bold text-gray-800">MTN MoMo</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">054 XXX XXXX</p>
                      </div>
                    </div>
                    <div className="w-6 h-6 rounded-full border-2 border-uber-black flex items-center justify-center">
                      <div className="w-3 h-3 bg-uber-black rounded-full"></div>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-3xl flex items-center gap-4 hover:border-gray-200 border-2 border-transparent transition-all cursor-pointer shadow-sm">
                    <img src="https://seeklogo.com/images/V/vodafone-m-pesa-logo-0A28E25327-seeklogo.com.png" className="w-10 h-10 object-contain" alt="Telecel" />
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-800">Telecel Cash</h4>
                      <p className="text-[10px] text-gray-400 font-bold uppercase">020 XXX XXXX</p>
                    </div>
                    <ChevronRight size={16} className="text-gray-300" />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Other Methods</h3>
                <div className="bg-white p-5 rounded-3xl flex items-center gap-4 shadow-sm active:bg-gray-50 transition-colors cursor-pointer">
                  <div className="bg-gray-100 p-2 rounded-xl"><Wallet size={20} className="text-gray-400" /></div>
                  <div className="flex-1">
                    <h4 className="font-bold text-gray-800">Cash Payment</h4>
                    <p className="text-[10px] text-gray-400 font-bold uppercase">Pay to collector</p>
                  </div>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </div>
            </div>

            <Button onClick={next} className="shadow-lg shadow-green-100">{t.confirmPayment}</Button>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.COLLECTOR_DASHBOARD:
        return (
          <div className="relative w-full h-full flex flex-col bg-uber-bg">
            <div className="bg-uber-black p-8 pt-16 pb-12 rounded-b-[40px] text-white">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <img src="https://i.pravatar.cc/150?u=kwame" className="w-14 h-14 rounded-2xl border-2 border-uber-green" alt="Kwame" />
                  <div>
                    <h2 className="font-bold text-xl">Kwame Mensah</h2>
                    <span className="text-uber-green text-xs font-bold flex items-center gap-1">● Online</span>
                  </div>
                </div>
                <button title="Notifications" className="bg-white/10 p-3 rounded-full"><Bell size={20} /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 p-4 rounded-3xl border border-white/10">
                  <p className="text-white/40 text-[10px] font-bold uppercase mb-1">Today's Payout</p>
                  <p className="text-2xl font-black">GH₵ 420</p>
                </div>
                <div className="bg-white/5 p-4 rounded-3xl border border-white/10">
                  <p className="text-white/40 text-[10px] font-bold uppercase mb-1">Collections</p>
                  <p className="text-2xl font-black">12</p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar pb-32">
              <div className="bg-uber-green p-6 rounded-[32px] text-white flex justify-between items-center shadow-lg shadow-green-100">
                <div>
                  <h3 className="font-bold text-lg mb-1">New Request!</h3>
                  <p className="text-xs opacity-80">Kasoa Market • Mini Truck</p>
                </div>
                <button className="bg-white text-uber-green px-6 py-2 rounded-full font-bold shadow-md">Accept</button>
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Recent History</h3>
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="bg-white p-5 rounded-3xl flex items-center gap-4 shadow-sm">
                      <div className="bg-gray-50 p-3 rounded-2xl"><CheckCircle className="text-uber-green" size={20} /></div>
                      <div className="flex-1">
                        <h4 className="font-bold text-sm">Kasoa Galleria</h4>
                        <p className="text-[10px] text-gray-400">Collected at 2:30 PM</p>
                      </div>
                      <span className="font-bold text-uber-green">GH₵ 85</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.ADMIN_DASHBOARD:
        return (
          <div className="relative w-full h-full flex flex-col bg-white">
            <div className="p-8 pt-16 flex justify-between items-center border-b border-gray-100">
              <h2 className="text-3xl font-black font-raleway">SAMSA ADMIN</h2>
              <div className="bg-gray-100 p-2 rounded-full"><User size={24} /></div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar pb-32">
              <section className="grid grid-cols-2 gap-4">
                <div className="bg-uber-green/10 p-6 rounded-3xl border border-uber-green/20">
                  <p className="text-uber-green text-[10px] font-bold uppercase mb-1">Active Collectors</p>
                  <p className="text-3xl font-black text-gray-800">1,204</p>
                </div>
                <div className="bg-uber-black/5 p-6 rounded-3xl border border-uber-black/10">
                  <p className="text-gray-400 text-[10px] font-bold uppercase mb-1">Total Revenue</p>
                  <p className="text-3xl font-black text-gray-800">GH₵ 12M</p>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Waste Heatmap (Kasoa)</h3>
                <div className="h-48 bg-gray-100 rounded-[32px] relative overflow-hidden flex items-center justify-center">
                  <MapMock />
                  <div className="absolute inset-0 bg-red-500/20 mix-blend-multiply"></div>
                  <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full text-[10px] font-bold shadow-sm">High Waste Zone</div>
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Recent Alerts</h3>
                <div className="space-y-4">
                  <div className="bg-red-50 p-4 rounded-3xl border border-red-100 flex items-center gap-4">
                    <div className="bg-red-500 w-2 h-2 rounded-full animate-pulse"></div>
                    <p className="text-xs font-bold text-red-900">Breakdown: Truck #402 (Barrier)</p>
                  </div>
                  <div className="bg-uber-green/5 p-4 rounded-3xl border border-uber-green/10 flex items-center gap-4">
                    <div className="bg-uber-green w-2 h-2 rounded-full"></div>
                    <p className="text-xs font-bold text-gray-700">New Collector Verified: John D.</p>
                  </div>
                </div>
              </section>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.WHATSAPP_SIM:
        return (
          <div className="relative w-full h-full bg-[#075E54] flex flex-col">
            <div className="bg-[#075E54] p-4 pt-12 flex items-center gap-3 text-white">
              <button title="Back" onClick={back}><ChevronLeft size={24} /></button>
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#075E54] font-bold">S</div>
              <div>
                <h3 className="font-bold">SamSa Bot</h3>
                <p className="text-[10px] opacity-70">online</p>
              </div>
            </div>
            <div className="flex-1 bg-[#E5DDD5] p-4 overflow-y-auto space-y-4 no-scrollbar">
              <div className="bg-white p-3 rounded-2xl rounded-tl-none max-w-[80%] shadow-sm">
                <p className="text-sm">Hi! Send a voice message or text to request a trash pickup. 🇬🇭</p>
                <span className="text-[9px] text-gray-400 float-right mt-1">10:00 AM</span>
              </div>
              <div className="bg-[#DCF8C6] p-3 rounded-2xl rounded-tr-none max-w-[80%] ml-auto shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <div className="bg-blue-500 p-2 rounded-full text-white"><Phone size={12} fill="white" /></div>
                  <div className="flex-1 h-1 bg-blue-200 rounded-full">
                    <div className="w-1/2 h-full bg-blue-500 rounded-full"></div>
                  </div>
                  <span className="text-[10px]">0:04</span>
                </div>
                <p className="text-[10px] text-gray-500 italic">"Mɛwɔ Kasoa market, trash aba, bra fa no nnɛ"</p>
                <span className="text-[9px] text-gray-400 float-right mt-1">10:05 AM</span>
              </div>
              <div className="bg-white p-3 rounded-2xl rounded-tl-none max-w-[80%] shadow-sm">
                <p className="text-sm font-bold text-uber-green mb-1">Order Created! ✅</p>
                <p className="text-xs">Location: Kasoa Market<br />Type: Market Waste<br />Collector: Kwame (Mini Truck)</p>
                <span className="text-[9px] text-gray-400 float-right mt-1">10:05 AM</span>
              </div>
            </div>
            <div className="p-3 bg-[#F0F0F0] flex items-center gap-2">
              <div className="flex-1 bg-white rounded-full px-4 py-2 text-sm text-gray-400">Type a message...</div>
              <button
                title="Send"
                onClick={() => setStep(AppStep.HOME)}
                className="bg-[#075E54] p-3 rounded-full text-white"
              >
                <Smartphone size={20} />
              </button>
            </div>
          </div>
        );

      case AppStep.USSD_SIM:
        return (
          <div className="relative w-full h-full bg-gray-900 flex flex-col items-center justify-center p-8">
            <div className="bg-white w-full rounded-3xl p-6 shadow-2xl border-4 border-gray-100">
              <div className="text-center mb-6">
                <h2 className="text-gray-400 font-bold text-xs uppercase tracking-tighter">USSD: *999#</h2>
              </div>
              <div className="space-y-4 mb-8">
                <h3 className="font-bold text-lg text-gray-800">SamSa Trash Pickup</h3>
                <ol className="text-sm text-gray-600 space-y-2">
                  <li>1. Request Pickup</li>
                  <li>2. Status</li>
                  <li>3. Register Location</li>
                  <li>4. Pricing</li>
                </ol>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 mb-6">
                <input type="text" placeholder="Enter option..." className="bg-transparent w-full text-center outline-none font-bold text-xl" />
              </div>
              <div className="flex gap-4">
                <button title="Cancel" onClick={back} className="flex-1 py-4 text-gray-400 font-bold text-sm">CANCEL</button>
                <button title="Send" onClick={() => setStep(AppStep.HOME)} className="flex-1 py-4 text-uber-green font-bold text-sm">SEND</button>
              </div>
            </div>
          </div>
        );
      case AppStep.PROFILE:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Profile</h2>
            </div>

            <div className="flex flex-col items-center mb-10">
              <div className="relative mb-4">
                <img src="https://i.pravatar.cc/150?u=customer" className="w-24 h-24 rounded-full border-4 border-white shadow-lg" alt="Profile" />
                <div className="absolute bottom-0 right-0 bg-uber-green p-2 rounded-full text-white border-2 border-white"><Settings size={14} /></div>
              </div>
              <h3 className="text-xl font-bold">Ama Serwaa</h3>
              <p className="text-gray-400 text-sm">ama.serwaa@email.com</p>
            </div>

            <div className="space-y-4 flex-1">
              {[
                { label: 'My Locations', icon: <MapPin />, step: AppStep.SAVED_LOCATIONS },
                { label: 'Subscriptions', icon: <Wallet />, step: AppStep.SUBSCRIPTIONS },
                { label: 'Settings', icon: <Settings />, step: AppStep.SETTINGS },
                { label: 'Help & Support', icon: <Phone />, step: AppStep.HELP },
              ].map((item, i) => (
                <button key={i} onClick={() => setStep(item.step)} className="w-full p-5 bg-white rounded-3xl flex items-center gap-4 shadow-sm active:bg-gray-50 transition-colors">
                  <div className="text-uber-green">{item.icon}</div>
                  <span className="flex-1 text-left font-bold text-gray-700">{item.label}</span>
                  <ChevronRight size={16} className="text-gray-300" />
                </button>
              ))}
            </div>

            <Button variant="outline" className="mt-8 border-red-100 text-red-500" onClick={() => setStep(AppStep.ROLE_SELECTION)}>Logout</Button>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.HISTORY:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Pickup History</h2>
            </div>
            <div className="space-y-4 flex-1 overflow-y-auto no-scrollbar pb-10">
              {pickups.length > 0 ? (
                pickups.map((pickup, i) => (
                  <div key={pickup.id} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-50 animate-in fade-in slide-in-from-bottom-2">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h4 className="font-bold text-gray-800">{pickup.pickup_location_name}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">{new Date(pickup.created_at).toLocaleString()}</p>
                      </div>
                      <span className={`px-2 py-1 rounded text-[10px] font-bold ${pickup.status === 'COLLECTED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                        {pickup.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-lg">🛺</div>
                        <span className="text-xs font-bold text-gray-600">{pickup.trash_type}</span>
                      </div>
                      <span className="font-bold text-gray-800">GH₵ {pickup.pricing_ghs}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center p-10 text-center opacity-40 mt-10">
                  <Clock size={48} className="mb-4" />
                  <p className="text-sm font-bold">No History Yet</p>
                </div>
              )}
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.CHAT:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Messages</h2>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center p-10">
              <div className="bg-white p-8 rounded-full mb-6 shadow-xl">
                <MessageSquare size={48} className="text-uber-green" />
              </div>
              <h3 className="text-xl font-bold mb-2">No active chats</h3>
              <p className="text-gray-400 text-sm">Your messages with collectors during pickups will appear here.</p>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.SUBSCRIPTIONS:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Subscriptions</h2>
            </div>
            <div className="space-y-6 flex-1">
              <div className="bg-uber-black p-6 rounded-[32px] text-white overflow-hidden relative shadow-2xl">
                <div className="relative z-10">
                  <h3 className="text-xl font-black mb-1">GH₵ 250 / mo</h3>
                  <p className="text-uber-green font-bold text-sm mb-6">UNLIMITED PICKUPS</p>
                  <p className="text-xs opacity-60">Ideal for households or shops with daily waste needs.</p>
                </div>
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-uber-green/20 rounded-full blur-3xl"></div>
                <Button className="mt-8 relative z-10">Subscribe Now</Button>
              </div>

              <div className="bg-white p-6 rounded-[32px] border-2 border-gray-100">
                <h3 className="text-lg font-bold mb-1">Weekly Plan</h3>
                <p className="text-gray-400 text-sm mb-4">GH₵ 75 / week • 3 Pickups</p>
                <Button variant="outline">Select Plan</Button>
              </div>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.NOTIFICATIONS:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Notifications</h2>
            </div>
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-3xl shadow-sm flex items-start gap-4 border-l-4 border-uber-green">
                <div className="bg-green-50 p-2 rounded-xl"><CheckCircle className="text-uber-green" size={20} /></div>
                <div>
                  <h4 className="font-bold text-sm">Pickup Confirmed</h4>
                  <p className="text-xs text-gray-500">Your trash from Kasoa Market was successfully collected.</p>
                </div>
              </div>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.SAVED_LOCATIONS:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">My Locations</h2>
            </div>
            <div className="space-y-4 flex-1">
              {RECENT_LOCATIONS.map((loc, i) => (
                <div key={i} className="bg-white p-5 rounded-3xl shadow-sm flex items-center gap-4">
                  <div className="bg-gray-50 p-3 rounded-2xl"><MapPin className="text-gray-400" size={20} /></div>
                  <div className="flex-1">
                    <h4 className="font-bold text-sm">{loc.name}</h4>
                    <p className="text-[10px] text-gray-400">{loc.address}</p>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="border-dashed border-2 hover:bg-gray-50"><MapPin size={18} className="mr-2" /> Add New Location</Button>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.SETTINGS:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Settings</h2>
            </div>
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-700">Dark Mode</span>
                  <div className="w-12 h-6 bg-gray-200 rounded-full relative"><div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div></div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-bold text-gray-700">Notifications</span>
                  <div className="w-12 h-6 bg-uber-green rounded-full relative"><div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm"></div></div>
                </div>
              </div>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      case AppStep.HELP:
        return (
          <div className="relative w-full h-full p-8 flex flex-col bg-uber-bg">
            <div className="flex items-center gap-4 mb-10">
              <button onClick={back} className="text-uber-green p-1"><ChevronLeft size={32} /></button>
              <h2 className="text-2xl font-bold font-raleway flex-1 text-center pr-8">Support</h2>
            </div>
            <div className="space-y-4">
              <div className="bg-white p-6 rounded-3xl shadow-sm flex items-center gap-4">
                <div className="bg-green-50 p-3 rounded-2xl"><Phone className="text-uber-green" size={24} /></div>
                <div>
                  <h4 className="font-bold">Call Support</h4>
                  <p className="text-xs text-gray-400">Available 24/7</p>
                </div>
              </div>
              <div className="bg-white p-6 rounded-3xl shadow-sm flex items-center gap-4">
                <div className="bg-green-50 p-3 rounded-2xl"><MessageSquare className="text-uber-green" size={24} /></div>
                <div>
                  <h4 className="font-bold">Live Chat</h4>
                  <p className="text-xs text-gray-400">Chat with an agent</p>
                </div>
              </div>
            </div>
            <div className="mt-4"><BottomNav activeStep={step} onTabChange={setStep} /></div>
          </div>
        );

      default:
        return (
          <div className="p-8 flex flex-col items-center justify-center h-full text-center">
            <h2 className="text-xl font-bold mb-4">Under Construction</h2>
            <p className="text-gray-400 mb-8">This screen is part of the SamSa infrastructure roll-out.</p>
            <Button onClick={back}>Go Back</Button>
          </div>
        );
    }
  };

  return (
    <Layout>
      {renderScreen()}
      {isLoading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[100] flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-uber-green border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      {![AppStep.SPLASH, AppStep.ROLE_SELECTION, AppStep.LOGIN, AppStep.OTP, AppStep.WHATSAPP_SIM, AppStep.USSD_SIM, AppStep.PAYMENT, AppStep.COLLECTOR_DASHBOARD, AppStep.ADMIN_DASHBOARD, AppStep.PROFILE, AppStep.HISTORY, AppStep.CHAT, AppStep.SUBSCRIPTIONS, AppStep.NOTIFICATIONS, AppStep.SAVED_LOCATIONS, AppStep.SETTINGS, AppStep.HELP].includes(step) && role === UserRole.CUSTOMER && (
        <BottomNav activeStep={step} onTabChange={setStep} />
      )}
    </Layout>
  );
};

export default App;
