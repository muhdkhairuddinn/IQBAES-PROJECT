import React, { useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';
import { useAuth } from '../contexts/AuthContext';

export const ForgotPasswordModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
    const [email, setEmail] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [magicLink, setMagicLink] = useState('');
    const { requestPasswordReset } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const message = await requestPasswordReset(email);
            setSubmitted(true);
            // No magic link needed - real email will be sent
            setMagicLink('');
        } catch (error: any) {
            console.error('Password reset error:', error);
            // Still show success message for security (don't reveal if email exists)
            setSubmitted(true);
            setMagicLink('');
        } finally {
            setIsLoading(false);
        }
    };
    
    // Reset state when modal is closed
    const handleClose = () => {
        onClose();
        setTimeout(() => {
            setSubmitted(false);
            setEmail('');
            setMagicLink('');
        }, 300); // delay to allow modal to fade out
    }

    return (
        <Modal isOpen={isOpen} onClose={handleClose} title="Reset Password">
            {submitted ? (
                <div className="text-center">
                    <Icon path="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-16 h-16 text-green-500 mx-auto mb-4"/>
                    <p className="text-lg font-semibold text-slate-800">Instructions Sent</p>
                    <p className="text-slate-600 mt-2 mb-4">If an account with that email exists, we've sent a password reset link to your email address. Please check your inbox and follow the instructions.</p>
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                        <p className="text-sm text-blue-800">
                            <strong>📧 Check your email:</strong> The reset link will expire in 1 hour for security reasons.
                        </p>
                        <p className="text-xs text-blue-600 mt-2">
                            Don't see the email? Check your spam folder or try again with a different email address.
                        </p>
                    </div>
                    <button onClick={handleClose} className="mt-6 w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md hover:bg-indigo-700">
                        Close
                    </button>
                </div>
            ) : (
                <form onSubmit={handleSubmit}>
                    <p className="text-slate-600 mb-4">
                        Enter your email address and we'll send you a secure link to reset your password.
                    </p>
                    <div>
                        <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700">Email Address</label>
                        <input
                            id="reset-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            placeholder="you@example.com"
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="flex justify-end pt-6 mt-4 border-t">
                         <button type="button" onClick={handleClose} className="text-slate-600 font-semibold py-2 px-4 rounded-lg mr-2">Cancel</button>
                        <button type="submit" disabled={isLoading} className="bg-indigo-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-indigo-400 flex items-center min-w-[120px] justify-center">
                            {isLoading ? <LoadingSpinner size="h-5 w-5" color="border-white" /> : 'Send Link'}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};