import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const EstimateForm: React.FC = () => {
    const { user } = useAuth();

    return (
        <div className="min-h-[85vh] flex items-center justify-center p-4 sm:p-8">
            {/* Under Construction Poster */}
            <div className="relative max-w-lg w-full overflow-hidden rounded-3xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-white to-amber-50/60 p-8 sm:p-12 shadow-2xl shadow-amber-500/10 text-center">
                {/* Top Caution Stripe Bar */}
                <div 
                    className="absolute top-0 left-0 right-0 h-3.5 opacity-90"
                    style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 15px, #1e293b 15px, #1e293b 30px)'
                    }}
                />

                <div className="flex flex-col items-center justify-center pt-2 space-y-6">
                    {/* Visual Icon Badge */}
                    <div className="relative w-24 h-24 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-900 flex items-center justify-center shadow-lg shadow-amber-500/30 ring-4 ring-amber-200">
                        <i className="fa-solid fa-person-digging text-4xl text-slate-900 animate-pulse"></i>
                        <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center text-xs shadow">
                            <i className="fa-solid fa-triangle-exclamation"></i>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-slate-900 text-amber-300 shadow-sm">
                            <i className="fa-solid fa-helmet-safety text-amber-400"></i> Under Construction
                        </span>

                        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900">
                            Under Construction
                        </h1>
                    </div>

                    <div className="pt-2">
                        <Link 
                            to={user?.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard'} 
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 text-sm font-bold shadow-md transition-all hover:translate-y-[-1px]"
                        >
                            <i className="fa-solid fa-arrow-left"></i> Return to Dashboard
                        </Link>
                    </div>
                </div>

                {/* Bottom Caution Stripe Bar */}
                <div 
                    className="absolute bottom-0 left-0 right-0 h-2 opacity-60"
                    style={{
                        backgroundImage: 'repeating-linear-gradient(45deg, #f59e0b, #f59e0b 15px, #1e293b 15px, #1e293b 30px)'
                    }}
                />
            </div>
        </div>
    );
};

export default EstimateForm;