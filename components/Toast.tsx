import React, { useEffect, useState } from 'react';

export interface ToastConfig {
  message: string;
  subtitle?: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface ToastProps extends ToastConfig {
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, subtitle, type = 'success', duration = 4000, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getColors = () => {
    switch (type) {
      case 'success':
        return 'bg-green-600 text-white';
      case 'error':
        return 'bg-red-600 text-white';
      case 'warning':
        return 'bg-yellow-600 text-white';
      case 'info':
        return 'bg-blue-600 text-white';
      default:
        return 'bg-green-600 text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        );
      case 'error':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        );
      case 'warning':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        );
      case 'info':
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        );
      default:
        return (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        );
    }
  };

  return (
    <>
      <div 
        className={`fixed top-6 right-6 z-50 ${getColors()} px-6 py-4 rounded-lg shadow-xl flex items-center gap-3 min-w-[280px] animate-slide-in-right`}
      >
        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          {getIcon()}
        </svg>
        <div className="flex-1">
          <p className="font-semibold">{message}</p>
          {subtitle && <p className={`text-sm ${type === 'success' ? 'text-green-100' : type === 'error' ? 'text-red-100' : type === 'warning' ? 'text-yellow-100' : 'text-blue-100'}`}>{subtitle}</p>}
        </div>
      </div>
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.5s ease-out;
        }
      `}</style>
    </>
  );
};

// Toast Context for global toast management
interface ToastContextType {
  showToast: (config: ToastConfig) => void;
}

export const ToastContext = React.createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<ToastConfig | null>(null);

  const showToast = (config: ToastConfig) => {
    setToast(config);
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast && (
        <Toast
          {...toast}
          onClose={() => setToast(null)}
        />
      )}
    </ToastContext.Provider>
  );
};

// Hook to use toast
export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    // Fallback if context is not available
    return {
      showToast: (config: ToastConfig) => {
        console.log('Toast:', config.message);
      }
    };
  }
  return context;
};

