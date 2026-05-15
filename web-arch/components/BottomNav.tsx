
import React from 'react';
import { Home, History, User, MessageSquare } from 'lucide-react';
import { AppStep } from '../types';

interface BottomNavProps {
  onTabChange?: (step: AppStep) => void;
  activeStep?: AppStep;
}

export const BottomNav: React.FC<BottomNavProps> = ({ onTabChange, activeStep }) => {
  return (
    <div className="bg-white border-t border-gray-100 py-4 px-8 flex justify-between items-center absolute bottom-0 left-0 right-0 z-50">
      <button
        onClick={() => onTabChange?.(AppStep.HOME)}
        title="Home"
        className={`p-2 transition-colors ${activeStep === AppStep.HOME ? 'text-uber-green' : 'text-gray-400'}`}
      >
        <Home size={24} strokeWidth={2.5} />
      </button>
      <button
        onClick={() => onTabChange?.(AppStep.HISTORY)}
        title="History"
        className={`p-2 transition-colors ${activeStep === AppStep.HISTORY ? 'text-uber-green' : 'text-gray-400'}`}
      >
        <History size={24} strokeWidth={2.5} />
      </button>
      <button
        onClick={() => onTabChange?.(AppStep.CHAT)}
        title="Messages"
        className={`p-2 transition-colors ${activeStep === AppStep.CHAT ? 'text-uber-green' : 'text-gray-400'}`}
      >
        <MessageSquare size={24} strokeWidth={2.5} />
      </button>
      <button
        onClick={() => onTabChange?.(AppStep.PROFILE)}
        title="Profile"
        className={`p-2 transition-colors ${activeStep === AppStep.PROFILE ? 'text-uber-green' : 'text-gray-400'}`}
      >
        <User size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
};
