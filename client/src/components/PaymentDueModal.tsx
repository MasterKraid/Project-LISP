import React, { useState } from 'react';
import { User, AdminSettings } from '../types';

interface PaymentDueModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: User | null;
    settings?: AdminSettings | null;
}

const PaymentDueModal: React.FC<PaymentDueModalProps> = ({ isOpen, onClose, client, settings }) => {
    const [copied, setCopied] = useState(false);

    if (!isOpen || !client) return null;

    const dueAmount = Math.abs(client.wallet_balance || 0);
    const upiId = settings?.upi_id || 'finance@upi';
    const orgName = settings?.organization_name || settings?.org_name || 'Medical Laboratory';
    const clientName = client.alias || client.username;

    const upiUri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(orgName)}&am=${dueAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Settlement UID ${client.id} ${clientName}`)}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upiUri)}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(upiId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }).catch(console.error);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center text-sm border border-amber-500/30">
                            <i className="fa-solid fa-qrcode"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-base tracking-tight">Payment Settlement QR</h3>
                            <p className="text-[11px] text-slate-300 font-medium">Instant UPI Settlement</p>
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
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Due Amount</span>
                            <span className="text-2xl font-black text-rose-600">₹{dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* QR Code Container */}
                    <div className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-inner">
                        <img
                            src={qrUrl}
                            alt="UPI QR Code"
                            className="w-56 h-56 rounded-lg object-contain"
                            onError={(e) => {
                                // In case offline / failed to load external image, show SVG placeholder
                                (e.target as HTMLElement).style.display = 'none';
                            }}
                        />
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
