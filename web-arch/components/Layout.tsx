
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="w-full max-w-[430px] h-[932px] bg-uber-bg rounded-[50px] shadow-2xl overflow-hidden relative border-[12px] border-uber-black">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150px] h-[30px] bg-uber-black rounded-b-3xl z-50"></div>
        <div className="w-full h-full overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
    </div>
  );
};
