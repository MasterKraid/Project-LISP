import React, { useState, useEffect } from 'react';
import { User, AdminSettings } from '../types';
import { apiService } from '../services/api';

interface PaymentDueModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: User | null;
    settings?: AdminSettings | null;
}

const PaymentDueModal: React.FC<PaymentDueModalProps> = ({ isOpen, onClose, client, settings: propSettings }) => {
    const [copied, setCopied] = useState(false);
    const [loadedSettings, setLoadedSettings] = useState<AdminSettings | null>(null);
    const [customAmount, setCustomAmount] = useState<string>('500');

    useEffect(() => {
        if (isOpen && !propSettings) {
            apiService.getAdminSettings().then(data => {
                setLoadedSettings(data);
            }).catch(console.error);
        }
    }, [isOpen, propSettings]);

    if (!isOpen || !client) return null;

    const activeSettings = propSettings || loadedSettings;
    const clientBalance = client.wallet_balance || 0;
    const dueAmount = clientBalance < 0 ? Math.abs(clientBalance) : 0;
    const isZeroBalance = clientBalance === 0;
    const effectiveAmount = dueAmount > 0 ? dueAmount : (parseFloat(customAmount) || 0);

    const upiId = activeSettings?.upi_id || '';
    const orgName = activeSettings?.organization_name || activeSettings?.org_name || 'N/A';
    const clientName = client.alias || client.username;

    const amountParam = effectiveAmount > 0 ? `&am=${effectiveAmount.toFixed(2)}` : '';
    const noteText = dueAmount > 0 ? `Settlement UID ${client.id} ${clientName}` : `Recharge UID ${client.id} ${clientName}`;
    const upiUri = upiId
        ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(orgName)}${amountParam}&cu=INR&tn=${encodeURIComponent(noteText)}`
        : '';
    const qrUrl = upiUri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUri)}`
        : '';

    const handleCopy = () => {
        if (!upiId) return;
        navigator.clipboard.writeText(upiId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(console.error);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-100 bg-slate-900 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center text-sm border border-slate-700">
                            <i className="fa-solid fa-qrcode"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-base tracking-tight">Payment Settlement QR</h3>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                {/* Body Content */}
                <div className="p-6 text-center space-y-5">
                    {/* Client & Amount summary */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-left">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Client Name</span>
                            <span className="text-xs font-mono text-slate-500">UID: #{client.id.toString().padStart(4, '0')}</span>
                        </div>
                        <div className="font-bold text-slate-800 text-base mb-3">{clientName}</div>

                        <div className="flex justify-between items-end pt-2 border-t border-slate-200/80">
                            <div>
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                                    {dueAmount > 0 ? 'Outstanding Due Amount' : 'Wallet Balance / Recharge'}
                                </span>
                                {isZeroBalance && (
                                    <span className="text-xs text-amber-600 font-medium">Balance is ₹0.00</span>
                                )}
                            </div>
                            <span className="text-2xl font-black text-rose-600">
                                ₹{effectiveAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                        </div>

                        {isZeroBalance && (
                            <div className="pt-2 mt-2 border-t border-slate-200/60 flex items-center justify-between gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Preset:</span>
                                <div className="flex gap-1.5">
                                    {['200', '500', '1000', '2000'].map((amt) => (
                                        <button
                                            key={amt}
                                            type="button"
                                            onClick={() => setCustomAmount(amt)}
                                            className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all ${
                                                customAmount === amt
                                                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                            }`}
                                        >
                                            ₹{amt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {dueAmount > 0 && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-left flex items-start gap-2.5">
                            <i className="fa-solid fa-circle-exclamation text-rose-600 mt-0.5 text-sm shrink-0"></i>
                            <div className="text-xs text-rose-900 leading-relaxed">
                                <span className="font-bold block text-rose-700 uppercase text-[10px] tracking-wider mb-0.5">Payment Due Disclaimer</span>
                                <span>Your wallet balance is negative. Please settle your bill via the UPI QR code below.</span>
                            </div>
                        </div>
                    )}

                    {/* QR Code Container */}
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-inner">
                        {qrUrl ? (
                            <img
                                src={qrUrl}
                                alt="UPI QR Code"
                                className="w-56 h-56 rounded-lg object-contain"
                            />
                        ) : (
                            <div className="w-56 h-56 flex flex-col items-center justify-center text-slate-400 text-xs">
                                <i className="fa-solid fa-qrcode text-4xl mb-2 text-slate-300"></i>
                                <span>UPI ID not configured</span>
                            </div>
                        )}
                        <p className="text-[11px] text-slate-400 font-semibold mt-2">Scan with Google Pay, PhonePe, Paytm, or BHIM</p>
                    </div>

                    {/* UPI Details & Copy */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div className="text-left">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">UPI ID / VPA</p>
                            <p className="text-xs font-mono font-bold text-slate-800 select-all">{upiId}</p>
                        </div>
                        <button
                            onClick={handleCopy}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-sm transition-all"
                        >
                            <i className={`fa-solid ${copied ? 'fa-check text-emerald-600' : 'fa-copy text-slate-400'}`}></i>
                            <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                    </div>

                    {/* Direct UPI pay button on mobile */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <a
                            href={upiUri}
                            className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                        >
                            <i className="fa-solid fa-mobile-screen-button"></i>
                            <span>Pay in UPI App</span>
                        </a>
                        <button
                            onClick={onClose}
                            className="py-2.5 px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-all"
                        >
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PaymentDueModal;
