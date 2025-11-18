import React from 'react';
import { Modal } from './Modal';

interface IdleWarningModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  onStaySignedIn: () => void | Promise<void>;
  onLogout: () => void;
}

const IdleWarningModal: React.FC<IdleWarningModalProps> = ({ isOpen, secondsRemaining, onStaySignedIn, onLogout }) => {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <Modal isOpen={isOpen} onClose={onLogout} title="You’re idle — session will expire soon">
      <div className="space-y-3">
        <p className="text-slate-700">
          You’ve been inactive for a while. For security, you’ll be logged out unless you stay signed in.
        </p>
        <div className="flex items-center justify-between bg-yellow-50 border border-yellow-200 rounded-md px-4 py-3">
          <span className="text-yellow-800 font-medium">Auto logout in</span>
          <span className="text-yellow-900 font-bold text-lg tabular-nums">{formatted}</span>
        </div>
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-slate-100 text-slate-800 hover:bg-slate-200"
            onClick={onLogout}
          >
            Logout now
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={onStaySignedIn}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default IdleWarningModal;
