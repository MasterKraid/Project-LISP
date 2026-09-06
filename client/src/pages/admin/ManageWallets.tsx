import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/PageHeader';
import ChoiceModal from '../../components/ChoiceModal';
import PaymentDueModal from '../../components/PaymentDueModal';
import { apiService } from '../../services/api';
import { User, Transaction, AdminSettings } from '../../types';

const parseISTDate = (istDateStr: string): Date | null => {
    if (!istDateStr) return null;
    const parts = istDateStr.split(' | ')[0].split('/');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-based index
    const year = parseInt(parts[2], 10);
    return new Date(year, month, day);
};

const ManageWallets: React.FC = () => {
    const [clients, setClients] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Wallet Filters State
    const [minBalance, setMinBalance] = useState('');
    const [maxBalance, setMaxBalance] = useState('');
    const [onlyNegative, setOnlyNegative] = useState(false);
    const [onlyNegativeAllowed, setOnlyNegativeAllowed] = useState(false);

    // Transaction Date Filters State
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [historyTransactions, setHistoryTransactions] = useState<Transaction[]>([]);
    const [historyClient, setHistoryClient] = useState<User | null>(null);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    // Choice Modal State
    const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
    const [pendingTxId, setPendingTxId] = useState<number | null>(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<User | null>(null);
    const [action, setAction] = useState<'add' | 'deduct' | 'settle' | null>(null);
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');

    // Admin Lab & UPI Settings State
    const [settings, setSettings] = useState<AdminSettings | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [settingsForm, setSettingsForm] = useState<AdminSettings>({ upi_id: '', org_name: '', lab_name: '' });
    const [isSavingSettings, setIsSavingSettings] = useState(false);

    // Payment Due QR Modal State
    const [paymentDueClient, setPaymentDueClient] = useState<User | null>(null);
    const [isPaymentDueModalOpen, setIsPaymentDueModalOpen] = useState(false);

    useEffect(() => {
        apiService.getAdminSettings().then(data => {
            setSettings(data);
            setSettingsForm(data);
        }).catch(console.error);
    }, []);

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSavingSettings(true);
        try {
            const res = await apiService.updateAdminSettings(settingsForm);
            setSettings(res.settings);
            alert("Settings saved successfully!");
            setIsSettingsModalOpen(false);
        } catch (err) {
            alert(`Failed to save settings: ${err}`);
        } finally {
            setIsSavingSettings(false);
        }
    };

    useEffect(() => {
        fetchClients(searchTerm);
    }, [searchTerm]);

    const fetchClients = async (query?: string) => {
        setIsLoading(true);
        try {
            const data = await apiService.getClientWallets(query);
            setClients(data);
        } catch (error) {
            console.error("Failed to fetch client wallets", error);
        } finally {
            setIsLoading(false);
        }
    };

    const openHistoryModal = async (client: User) => {
        setIsHistoryModalOpen(true);
        setIsLoadingHistory(true);
        try {
            // First fetch latest client wallets to get the fresh balance
            const freshClients = await apiService.getClientWallets(searchTerm);
            setClients(freshClients);
            const freshClient = freshClients.find(c => c.id === client.id) || client;
            setHistoryClient(freshClient);

            const data = await apiService.getTransactionsByUser(client.id);
            setHistoryTransactions(data);
        } catch (error) {
            console.error("Failed to fetch history", error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    const handleRevert = async (txId: number) => {
        try {
            await apiService.revertTransaction(txId);
            if (historyClient) openHistoryModal(historyClient);
        } catch (error) {
            alert(`Error reverting: ${error}`);
        }
    };

    const handleSimpleDelete = async (txId: number) => {
        try {
            await apiService.deleteTransactionRecord(txId);
            if (historyClient) openHistoryModal(historyClient);
        } catch (error) {
            alert(`Error deleting: ${error}`);
        }
    };

    const openModal = (client: User, act: 'add' | 'deduct' | 'settle') => {
        setEditingClient(client);
        setAction(act);
        setIsModalOpen(true);
        setAmount('');
        setNotes('');
    };

    const handleWalletUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingClient || !action) return;
        try {
            await apiService.updateWallet(editingClient.id, action, action !== 'settle' ? parseFloat(amount) : undefined, notes);
            setIsModalOpen(false);
            fetchClients(searchTerm);
        } catch (error) {
            alert(`Error updating wallet: ${error}`);
        }
    };

    const handlePermissionChange = async (client: User, allow: boolean) => {
        let until: string | undefined = undefined;
        if (allow) {
            const dateStr = prompt("Limit negative exposure? (Enter date YYYY-MM-DD or leave blank)", new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
            if (dateStr !== null) until = dateStr || undefined;
            else return;
        }

        try {
            await apiService.updateWalletPermissions(client.id, allow, until);
            fetchClients(searchTerm);
        } catch (error) {
            alert(`Error updating permissions: ${error}`);
        }
    }

    const filteredClients = clients.filter(client => {
        const balance = client.wallet_balance;
        if (minBalance !== '' && balance < parseFloat(minBalance)) return false;
        if (maxBalance !== '' && balance > parseFloat(maxBalance)) return false;
        if (onlyNegative && balance >= 0) return false;
        if (onlyNegativeAllowed && !client.allow_negative_balance) return false;
        return true;
    });

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                <PageHeader title="Wallet Management" showActingAs={false} />

                <div className="relative flex flex-col">
                    <div className="md:absolute static top-0 right-6 md:-translate-y-[5px] mb-4 md:mb-0 flex items-center gap-2 justify-end order-1 md:order-none">
                        <button
                            onClick={() => setIsSettingsModalOpen(true)}
                            className="p-2 px-3 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg shadow-sm flex items-center gap-1.5 text-xs font-bold transition-all"
                            title="Payment & Laboratory Settings"
                        >
                            <i className="fa-solid fa-gear text-slate-500"></i>
                            <span className="hidden sm:inline">Settings</span>
                        </button>
                        <div className="search-container w-full md:w-64 bg-white shadow-sm md:shadow-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-700 text-xs mr-2"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search clients..."
                                className="search-input"
                            />
                        </div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 order-2">
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Min Balance (₹)</label>
                            <input
                                type="number"
                                value={minBalance}
                                onChange={e => setMinBalance(e.target.value)}
                                placeholder="Min"
                                className="w-full p-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Max Balance (₹)</label>
                            <input
                                type="number"
                                value={maxBalance}
                                onChange={e => setMaxBalance(e.target.value)}
                                placeholder="Max"
                                className="w-full p-2 border border-slate-200 bg-white rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
                            />
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                            <input
                                type="checkbox"
                                id="onlyNegativeCheckbox"
                                checked={onlyNegative}
                                onChange={e => setOnlyNegative(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="onlyNegativeCheckbox" className="text-xs font-bold text-slate-600 cursor-pointer uppercase tracking-tight">Show Only Due</label>
                        </div>
                        <div className="flex items-center gap-2 pt-5">
                            <input
                                type="checkbox"
                                id="onlyNegativeAllowedCheckbox"
                                checked={onlyNegativeAllowed}
                                onChange={e => setOnlyNegativeAllowed(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="onlyNegativeAllowedCheckbox" className="text-xs font-bold text-slate-600 cursor-pointer uppercase tracking-tight">Negative Allowed</label>
                        </div>
                    </div>

                    <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl order-2">
                        <legend className="px-3 flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                <i className="fa-solid fa-wallet text-xs"></i>
                            </div>
                            <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Account Directory</span>
                        </legend>

                        {isLoading && clients.length === 0 ? (
                            <div className="py-20 text-center">
                                <i className="fa-solid fa-spinner fa-spin text-xl text-gray-300 mb-2"></i>
                                <p className="text-gray-400 italic text-sm">Accessing ledger records...</p>
                            </div>
                        ) : filteredClients.length === 0 ? (
                            <div className="py-20 text-center bg-gray-50 rounded-xl border border-dashed border-gray-200">
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">No records match your filter criteria</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {filteredClients.map(client => (
                                    <div key={client.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col">
                                        <div className={`absolute top-0 left-0 w-1 h-full ${client.wallet_balance < 0 ? 'bg-red-500' : 'bg-green-500'}`}></div>

                                        <div className="flex justify-between items-start mb-3">
                                            <div className="pl-1">
                                                <h3 className="font-bold text-gray-800 text-sm leading-tight">{client.alias || client.username}</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{client.username} <span className="ml-1 opacity-50 font-mono">#ID:{client.id.toString().padStart(4, '0')}</span></p>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {client.wallet_balance < 0 && (
                                                    <button
                                                        onClick={() => {
                                                            setPaymentDueClient(client);
                                                            setIsPaymentDueModalOpen(true);
                                                        }}
                                                        className="w-6 h-6 flex items-center justify-center bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white rounded-md border border-rose-200 transition-all shadow-xs"
                                                        title="Generate Payment Due QR"
                                                    >
                                                        <i className="fa-solid fa-qrcode text-[10px]"></i>
                                                    </button>
                                                )}
                                                <button onClick={() => openHistoryModal(client)} className="w-6 h-6 flex items-center justify-center bg-slate-50 text-slate-400 hover:bg-slate-800 hover:text-white rounded-md border border-slate-100 transition-all" title="Client Wallet History">
                                                    <i className="fa-solid fa-cog text-[10px]"></i>
                                                </button>
                                                <div className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${client.wallet_balance < 0 ? 'bg-red-50 text-red-600 border-red-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                                                    {client.wallet_balance < 0 ? 'DUE' : 'CLEAR'}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-gray-50 rounded-lg p-3 mb-4 flex justify-between items-center border border-gray-100">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Balance</span>
                                            <span className={`text-lg font-bold ${client.wallet_balance < 0 ? 'text-red-700' : 'text-green-700'}`}>
                                                ₹{Math.abs(client.wallet_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                {client.wallet_balance < 0 && <span className="text-[10px] ml-1 opacity-50 font-normal">Dr</span>}
                                            </span>
                                        </div>

                                        <div className="flex-grow space-y-3 mb-6">
                                            <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                                                <label className="flex items-center gap-2 cursor-pointer group/label">
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${client.allow_negative_balance ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}>
                                                        {!!client.allow_negative_balance && <i className="fa-solid fa-check text-[8px]"></i>}
                                                    </div>
                                                    <input type="checkbox" className="hidden" checked={!!client.allow_negative_balance} onChange={() => handlePermissionChange(client, !client.allow_negative_balance)} />
                                                    <span className="text-[11px] font-bold text-gray-600 uppercase group-hover/label:text-blue-600">Allow Negative</span>
                                                </label>
                                                <i className="fa-solid fa-shield-halved text-gray-300 text-xs"></i>
                                            </div>

                                            {!!client.allow_negative_balance && (
                                                <div className="flex items-center gap-1.5 px-1">
                                                    <i className="fa-solid fa-clock text-[9px] text-gray-300"></i>
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase">
                                                        Valid: <span className="text-gray-600 font-bold ml-1">{client.negative_balance_allowed_until ? new Date(client.negative_balance_allowed_until).toLocaleDateString('en-GB') : 'UNLIMITED'}</span>
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-3 gap-1.5">
                                            <button onClick={() => openModal(client, 'add')} className="flex flex-col items-center justify-center py-1.5 px-1 bg-green-50 text-green-700 rounded-lg hover:bg-green-600 hover:text-white transition-all border border-green-100 shadow-sm">
                                                <i className="fa-solid fa-plus text-[9px] mb-0.5"></i>
                                                <span className="text-[8px] font-black uppercase">Credit</span>
                                            </button>
                                            <button onClick={() => openModal(client, 'deduct')} className="flex flex-col items-center justify-center py-1.5 px-1 bg-red-50 text-red-700 rounded-lg hover:bg-red-600 hover:text-white transition-all border border-red-100 shadow-sm">
                                                <i className="fa-solid fa-minus text-[9px] mb-0.5"></i>
                                                <span className="text-[8px] font-black uppercase">Debit</span>
                                            </button>
                                            <button onClick={() => openModal(client, 'settle')} className="flex flex-col items-center justify-center py-1.5 px-1 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-800 hover:text-white transition-all border border-gray-100 shadow-sm">
                                                <i className="fa-solid fa-check-double text-[9px] mb-0.5"></i>
                                                <span className="text-[8px] font-black uppercase">Settle</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </fieldset>
                </div>

                {/* Transaction Modal */}
                {isModalOpen && editingClient && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                        <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm border border-gray-200">
                            <form onSubmit={handleWalletUpdate} className="space-y-6">
                                <div className="flex items-center gap-3 border-b border-gray-100 pb-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white shadow-sm ${action === 'add' ? 'bg-green-600' : action === 'deduct' ? 'bg-red-600' : 'bg-gray-800'}`}>
                                        <i className={`fa-solid ${action === 'add' ? 'fa-plus' : action === 'deduct' ? 'fa-minus' : 'fa-check-double'} text-xs`}></i>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight">{action} Funds</h2>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{editingClient.alias || editingClient.username}</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {action !== 'settle' && (
                                        <div className="space-y-1">
                                            <label htmlFor="amount" className="text-[10px] font-bold text-gray-400 uppercase ml-1">Amount (₹)</label>
                                            <input id="amount" type="number" value={amount} onChange={e => setAmount(e.target.value)} required placeholder="0.00" className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-50 outline-none text-lg font-bold" step="0.01" />
                                        </div>
                                    )}
                                    <div className="space-y-1">
                                        <label htmlFor="notes" className="text-[10px] font-bold text-gray-400 uppercase ml-1">Reference Notes</label>
                                        <textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Transaction details..." className="w-full p-2 border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-blue-50 outline-none text-sm" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-2 pt-4 border-t border-gray-300">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 transition-all text-xs">Cancel</button>
                                    <button type="submit" className={`px-4 py-2 text-white font-bold rounded-lg shadow-sm transition-all text-xs ${action === 'add' ? 'bg-green-600 hover:bg-green-700' : action === 'deduct' ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-800 hover:bg-black'}`}>
                                        Confirm {action}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                {/* Transaction History Modal (Cog) */}
                {isHistoryModalOpen && historyClient && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-white">
                                        <i className="fa-solid fa-clock-rotate-left"></i>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Wallet Ledger</h2>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{historyClient.alias || historyClient.username}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsHistoryModalOpen(false)} className="w-8 h-8 flex items-center justify-center bg-white text-gray-400 hover:text-red-500 rounded-lg border border-gray-100 transition-all">
                                    <i className="fa-solid fa-xmark"></i>
                                </button>
                            </div>

                            <div className="p-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center px-6">
                                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Available Balance</span>
                                <div className="flex items-center gap-3">
                                    {historyClient.wallet_balance < 0 && (
                                        <button
                                            onClick={() => {
                                                setPaymentDueClient(historyClient);
                                                setIsPaymentDueModalOpen(true);
                                            }}
                                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                                        >
                                            <i className="fa-solid fa-qrcode"></i>
                                            <span>Payment Due QR</span>
                                        </button>
                                    )}
                                    <span className={`text-xl font-bold ${historyClient.wallet_balance < 0 ? 'text-red-600' : 'text-blue-700'}`}>
                                        ₹{Math.abs(historyClient.wallet_balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        {historyClient.wallet_balance < 0 && <span className="text-xs ml-1 opacity-50 uppercase">Dr</span>}
                                    </span>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 items-center justify-between px-6">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap"><i className="fa-solid fa-filter mr-1"></i> Filter By Date:</span>
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="p-1.5 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-100 flex-grow sm:flex-grow-0"
                                    />
                                    <span className="text-xs text-gray-400 font-bold uppercase">To</span>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="p-1.5 border border-gray-200 bg-white rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-100 flex-grow sm:flex-grow-0"
                                    />
                                    {(startDate || endDate) && (
                                        <button
                                            type="button"
                                            onClick={() => { setStartDate(''); setEndDate(''); }}
                                            className="text-[10px] font-black text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded transition-colors uppercase shrink-0"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="flex-grow overflow-y-auto p-4 space-y-3">
                                {(() => {
                                    const filteredTransactions = historyTransactions.filter(tx => {
                                        if (!startDate && !endDate) return true;
                                        const txDate = parseISTDate(tx.date);
                                        if (!txDate) return true;
                                        if (startDate) {
                                            const start = new Date(startDate);
                                            start.setHours(0, 0, 0, 0);
                                            if (txDate < start) return false;
                                        }
                                        if (endDate) {
                                            const end = new Date(endDate);
                                            end.setHours(23, 59, 59, 999);
                                            if (txDate > end) return false;
                                        }
                                        return true;
                                    });

                                    return isLoadingHistory ? (
                                        <div className="py-20 text-center"><i className="fa-solid fa-spinner fa-spin text-slate-300 mr-2"></i>Accessing history...</div>
                                    ) : filteredTransactions.length === 0 ? (
                                        <div className="py-20 text-center text-gray-400 italic">No transactions found matching your filters.</div>
                                    ) : (
                                        filteredTransactions.map(tx => (
                                            <div key={tx.id} className="p-4 border border-gray-100 rounded-xl hover:bg-slate-50 transition-colors flex justify-between items-center group">
                                                <div className="flex-grow">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`w-2 h-2 rounded-full ${tx.amount_deducted > 0 ? 'bg-red-400' : 'bg-green-400'}`}></span>
                                                        <p className="text-sm font-bold text-gray-800">
                                                            {tx.type === 'RECEIPT_DEDUCTION' ? `Receipt #RCPT-${String(tx.receipt_id).padStart(6, '0')}` :
                                                                tx.type === 'ADMIN_CREDIT' ? 'Credit Added' :
                                                                    tx.type === 'ADMIN_DEBIT' ? 'Funds Deducted' : 'Wallet Settlement'}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase">
                                                        <span>{tx.date.split(' | ')[0]}</span>
                                                        <span>•</span>
                                                        <span className="text-gray-500 italic">{tx.notes || 'No reference notes'}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right flex items-center gap-4">
                                                    <div>
                                                        <p className={`text-sm font-black ${tx.amount_deducted > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                            {tx.amount_deducted > 0 ? '-' : '+'} ₹{Math.abs(tx.amount_deducted).toFixed(2)}
                                                        </p>
                                                        <p className="text-[9px] text-gray-400 font-mono">Bal: ₹{Number(tx.balance_snapshot || 0).toFixed(2)}</p>
                                                    </div>
                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                                        <button onClick={() => {
                                                            setPendingTxId(tx.id);
                                                            setIsChoiceModalOpen(true);
                                                        }} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white border border-red-100 transition-all">
                                                            <i className="fa-solid fa-trash-can text-xs"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    );
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                <ChoiceModal
                    isOpen={isChoiceModalOpen}
                    onClose={() => setIsChoiceModalOpen(false)}
                    title="Manage Transaction"
                    message="Choose how you would like to undo this transaction. Reverting will nuclear the related receipt, while Delete will only remove this record."
                    onRevert={() => pendingTxId && handleRevert(pendingTxId)}
                    onDelete={() => pendingTxId && handleSimpleDelete(pendingTxId)}
                />

                {/* Laboratory & UPI Settings Modal */}
                {isSettingsModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 animate-in fade-in zoom-in-95 duration-150">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-slate-800 text-white flex items-center justify-center text-sm">
                                        <i className="fa-solid fa-gear"></i>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-base text-gray-800">Laboratory & UPI Settings</h3>
                                        <p className="text-[11px] text-gray-400 font-medium">Configure Payment VPA & Lab Details</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsSettingsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                                    <i className="fa-solid fa-xmark text-lg"></i>
                                </button>
                            </div>

                            <form onSubmit={handleSaveSettings} className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Laboratory / Brand Name</label>
                                    <input
                                        type="text"
                                        value={settingsForm.lab_name || ''}
                                        onChange={e => setSettingsForm({ ...settingsForm, lab_name: e.target.value })}
                                        placeholder="e.g., Kraid Central Diagnostics"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-0.5">Displayed prominently on document headers and portal.</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">UPI ID (VPA)</label>
                                    <input
                                        type="text"
                                        value={settingsForm.upi_id || ''}
                                        onChange={e => setSettingsForm({ ...settingsForm, upi_id: e.target.value })}
                                        placeholder="e.g., paytmqr@paytm, name@okaxis"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-blue-100"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-0.5">Used to generate dynamic settlement QR codes for clients.</p>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Organization / Payee Name</label>
                                    <input
                                        type="text"
                                        value={settingsForm.org_name || ''}
                                        onChange={e => setSettingsForm({ ...settingsForm, org_name: e.target.value })}
                                        placeholder="e.g., Treat & Cure"
                                        className="w-full p-2.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-100"
                                    />
                                </div>

                                <div className="flex justify-end gap-2 pt-4 border-t border-gray-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsSettingsModalOpen(false)}
                                        className="px-4 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-200 text-xs"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSavingSettings}
                                        className="px-5 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 shadow-sm text-xs flex items-center gap-1.5"
                                    >
                                        {isSavingSettings ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-check"></i>}
                                        <span>Save Settings</span>
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Dynamic UPI Payment Due QR Modal */}
                <PaymentDueModal
                    isOpen={isPaymentDueModalOpen}
                    onClose={() => setIsPaymentDueModalOpen(false)}
                    client={paymentDueClient}
                    settings={settings}
                />
            </div>
        </div >
    );
};

export default ManageWallets;