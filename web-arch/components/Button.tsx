
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'secondary';
  fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  fullWidth = true, 
  className = '', 
  ...props 
}) => {
  const baseStyles = "py-4 px-6 rounded-xl font-semibold transition-all duration-200 flex items-center justify-center text-lg";
  
  const variants = {
    primary: "bg-uber-green text-white active:bg-green-700 shadow-lg shadow-green-200",
    outline: "bg-transparent border border-gray-300 text-uber-black hover:bg-gray-50",
    secondary: "bg-uber-gray text-uber-black hover:bg-gray-200"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
