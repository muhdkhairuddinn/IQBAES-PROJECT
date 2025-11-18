import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Icon } from './Icon';
import { LoadingSpinner } from './LoadingSpinner';
import { ForgotPasswordModal } from './ForgotPasswordModal';

interface LoginPageProps {
    onLogin?: () => void;
    onSwitchToRegister?: () => void;
    onForgotPassword?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onSwitchToRegister, onForgotPassword }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await login(username, password);
            window.location.hash = '/';
        } catch (err: any) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <>
        <ForgotPasswordModal isOpen={isForgotModalOpen} onClose={() => setIsForgotModalOpen(false)} />
        <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
             <div className="flex items-center space-x-3 mb-8">
                <div className="bg-indigo-600 p-3 rounded-lg">
                    <Icon path="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582" className="h-8 w-8 text-white"/>
                </div>
                <span className="font-bold text-4xl text-slate-800">IQBAES</span>
            </div>
            <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-lg">
                <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">Welcome Back</h2>
                <p className="text-center text-slate-500 mb-6">Log in to continue to your dashboard.</p>
                
                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg relative mb-4" role="alert">
                        <span className="block sm:inline">{error}</span>
                    </div>
                )}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-slate-700">Email Address</label>
                        <input
                            id="username"
                            type="email"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            placeholder="e.g., student@test.com"
                            className="mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                     <div>
                        <div className="flex justify-between items-center">
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
                             <button
                                type="button"
                                onClick={() => setIsForgotModalOpen(true)}
                                className="text-xs font-medium text-indigo-600 hover:text-indigo-500"
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <div className="relative mt-1">
                             <input
                                id="password"
                                type={showPassword ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                placeholder="••••••••"
                                className="block w-full px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword 
                                    ? <Icon path="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19 12 19c.996 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 2.662 10.065 6.879a10.45 10.45 0 01-8.217 8.217M12 15a3 3 0 110-6 3 3 0 010 6zM21 3L3 21" className="w-5 h-5"/>
                                    : <Icon path="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7zM15 12a3 3 0 11-6 0 3 3 0 016 0z" className="w-5 h-5"/>
                                }
                            </button>
                        </div>
                         <p className="text-xs text-slate-400 mt-1">Note: Password is not validated in this demo.</p>
                    </div>
                    
                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed">
                        {isLoading ? <LoadingSpinner size="h-5 w-5" color="border-white" /> : 'Log In'}
                    </button>
                </form>
                <p className="text-center text-sm text-slate-500 mt-6">
                    Don't have an account?{' '}
                    <button onClick={() => window.location.hash = '#/register'} className="font-medium text-indigo-600 hover:text-indigo-500">
                        Register here
                    </button>
                </p>
            </div>
            <div className="w-full max-w-md bg-slate-200 p-4 rounded-lg mt-4 text-sm text-slate-600">
                <h4 className="font-bold text-slate-700 mb-2">Demo Accounts:</h4>
                <p><strong>Student:</strong> student1@university.edu / student123</p>
                <p><strong>Lecturer:</strong> lecturer1@university.edu / lecturer123</p>
                <p><strong>Admin:</strong> admin@university.edu / admin123</p>
            </div>
        </div>
        </>
    );
};

export default LoginPage;