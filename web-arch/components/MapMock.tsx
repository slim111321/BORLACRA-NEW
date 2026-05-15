
import React from 'react';
import { MapPin, Navigation, Car } from 'lucide-react';

interface MapMockProps {
  showRoute?: boolean;
}

export const MapMock: React.FC<MapMockProps> = ({ showRoute }) => {
  return (
    <div className="absolute inset-0 bg-[#e5e7eb] overflow-hidden">
      <style>
        {`
          @keyframes drawRoute {
            0% {
              stroke-dashoffset: 600;
              opacity: 0;
            }
            10% {
              opacity: 1;
            }
            100% {
              stroke-dashoffset: 0;
              opacity: 1;
            }
          }
          .animate-route {
            stroke-dasharray: 600;
            stroke-dashoffset: 600;
            animation: drawRoute 2.5s cubic-bezier(0.45, 0, 0.55, 1) forwards;
          }
        `}
      </style>

      {/* Fake Map Grid/Buildings */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="grid grid-cols-8 grid-rows-12 gap-1 w-full h-full p-2">
          {Array.from({ length: 96 }).map((_, i) => (
            <div key={i} className="bg-white rounded-sm"></div>
          ))}
        </div>
      </div>

      {/* Water body */}
      <div className="absolute top-1/3 left-1/4 w-24 h-16 bg-blue-200 rounded-full blur-sm"></div>

      {/* Road Paths */}
      <div className="absolute h-full w-4 bg-white/40 left-1/2 -translate-x-1/2"></div>
      <div className="absolute w-full h-4 bg-white/40 top-1/2 -translate-y-1/2"></div>

      {/* Cars */}
      <div className="absolute top-20 left-10 text-uber-black rotate-45"><Car size={24} /></div>
      <div className="absolute top-40 right-20 text-uber-black -rotate-12"><Car size={24} /></div>
      <div className="absolute bottom-1/4 left-1/3 text-uber-black rotate-90"><Car size={24} /></div>
      <div className="absolute top-1/2 right-1/4 text-uber-black rotate-180"><Car size={24} /></div>

      {/* Route Line */}
      {showRoute && (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          <path 
            className="animate-route"
            d="M 215 160 L 215 450 L 150 450 L 150 350 L 50 350" 
            fill="transparent" 
            stroke="#26B355" 
            strokeWidth="5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          />
        </svg>
      )}

      {/* User Location */}
      <div className="absolute top-40 left-1/2 -translate-x-1/2 flex items-center bg-white/90 px-3 py-2 rounded-full shadow-lg border border-green-50 z-10">
        <div className="bg-uber-green/20 p-1 rounded-full mr-2">
          <div className="bg-uber-green w-2 h-2 rounded-full"></div>
        </div>
        <span className="text-[10px] font-bold text-uber-green whitespace-nowrap">Location: Daria, Chandigarh</span>
      </div>

      {/* Map Pin Target */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative">
          <div className="w-12 h-12 bg-uber-black/10 rounded-full flex items-center justify-center animate-pulse">
             <div className="w-4 h-4 bg-uber-black rounded-full border-2 border-white"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
