
import React from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  zIndex?: number; // Optional z-index for nested modals (default: 50)
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, zIndex = 50 }) => {
  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center`}
      style={{ zIndex }}
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative bg-white rounded-none shadow-xl max-w-4xl w-full m-4 max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between p-6 border-b rounded-none flex-shrink-0">
          <h3 className="text-2xl font-semibold text-slate-900" id="modal-title">
            {title}
          </h3>
          <button
            type="button"
            className="text-slate-400 bg-transparent hover:bg-slate-200 hover:text-slate-900 rounded-lg text-sm p-1.5 ml-auto inline-flex items-center"
            onClick={onClose}
            aria-label="Close modal"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              ></path>
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 min-h-0">
          {children}
        </div>
        {footer && (
          <div className="flex-shrink-0 border-t bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};