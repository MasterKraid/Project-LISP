
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SearchableDropdown from './SearchableDropdown';

import { apiService } from '../services/api';

const PageHeader: React.FC<{ title: string, subtitle?: React.ReactNode, showBackLink?: boolean, backLink?: string, backText?: string, showActingAs?: boolean }> = ({ title, subtitle, showBackLink = true, backLink, backText, showActingAs = true }) => {
    const { user, actingAsClient, setActingAsClient } = useAuth();
    const [clients, setClients] = React.useState<any[]>([]);

    React.useEffect(() => {
        if (user && (user.role === 'ADMIN' || user.master_data_entry)) {
            apiService.getClientWallets().then(data => {
                setClients(data);
            });
        }
    }, [user]);

    const getDashboardLink = () => {
        if (!user) return "/";
        return user.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard';
    };

    const hasRemoteEntryAccess = user && (user.role === 'ADMIN' || !!user.master_data_entry);

    return (
        <header className="border-b border-gray-200 pb-5 mb-6 flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div>
                <h1 className="m-0 text-left text-2xl font-bold text-gray-800 flex items-center gap-3 flex-wrap">
                    {title}
                </h1>
                {subtitle && <div className="mt-1">{subtitle}</div>}
            </div>
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                {showActingAs && hasRemoteEntryAccess && clients.length > 0 && (
                    <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 min-w-[280px]">
                        <i className="fa-solid fa-user-tie text-indigo-500 text-sm"></i>
                        <span className="text-xs font-bold text-indigo-800 uppercase tracking-wider whitespace-nowrap">Acting As:</span>
                        <div className="flex-1 flex items-center gap-2">
                            <div className="flex-1">
                                <SearchableDropdown
                                    options={[
                                        { value: '', label: '-- Self (Default) --' },
                                        ...clients.map(c => ({ value: c.id.toString(), label: `${c.alias || c.username} (UID: ${c.id}) - Bal: ₹${(c.wallet_balance || 0).toFixed(0)}` }))
                                    ]}
                                    value={actingAsClient ? actingAsClient.id.toString() : ''}
                                    onChange={(clientId) => {
                                        if (!clientId || clientId === '') {
                                            setActingAsClient(null);
                                        } else {
                                            const client = clients.find(c => c.id.toString() === clientId);
                                            if (client) setActingAsClient(client);
                                        }
                                    }}
                                    placeholder="Search client..."
                                />
                            </div>
                            {actingAsClient && (
                                <span className="text-[10px] font-black text-indigo-700 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full shrink-0" title="Active Client Wallet Balance">
                                    ₹{(actingAsClient.wallet_balance || 0).toFixed(2)}
                                </span>
                            )}
                            {actingAsClient && (
                                <button
                                    onClick={() => {
                                        setActingAsClient(null);
                                    }}
                                    className="flex items-center justify-center w-6 h-6 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-200 hover:text-rose-700 transition-colors shrink-0"
                                    title="Exit Acting As"
                                >
                                    <i className="fa-solid fa-times text-xs"></i>
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {showBackLink && (
                    <Link to={backLink || getDashboardLink()} className="inline-block px-4 py-2 bg-gray-500 text-white no-underline rounded-md text-sm font-medium transition-colors hover:bg-gray-600 whitespace-nowrap">
                        <i className="fa-solid fa-arrow-left mr-2"></i>
                        {backText || "Back to Dashboard"}
                    </Link>
                )}
            </div>
        </header>
    );
};

export default PageHeader;
