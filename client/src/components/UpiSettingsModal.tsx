import React, { useState, useEffect } from 'react';
import { AdminSettings } from '../types';
import { apiService } from '../services/api';

interface UpiSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentSettings: AdminSettings | null;
    onSaved: (updated: AdminSettings) => void;
}

const UpiSettingsModal: React.FC<UpiSettingsModalProps> = ({ isOpen, onClose, currentSettings, onSaved }) => {
    const [upiId, setUpiId] = useState('');
    const [organizationName, setOrganizationName] = useState('');
    const [labName, setLabName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setSaveSuccess(false);
            setErrorMessage(null);
            if (currentSettings) {
                setUpiId(currentSettings.upi_id || '');
                setOrganizationName(currentSettings.organization_name || currentSettings.org_name || '');
                setLabName(currentSettings.lab_name || '');
            } else {
                apiService.getAdminSettings().then(data => {
                    setUpiId(data.upi_id || '');
                    setOrganizationName(data.organization_name || data.org_name || '');
                    setLabName(data.lab_name || '');
                }).catch(err => {
                    console.error("Failed to fetch settings", err);
                });
            }
        }
    }, [isOpen, currentSettings]);

    if (!isOpen) return null;

    const previewOrg = organizationName.trim() || 'N/A';
    const previewUpi = upiId.trim() || '';
    const sampleAmount = 100;
    const previewUri = previewUpi
        ? `upi://pay?pa=${encodeURIComponent(previewUpi)}&pn=${encodeURIComponent(previewOrg)}&am=${sampleAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Settlement')}`
        : '';
    const qrPreviewUrl = previewUri
        ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(previewUri)}`
        : '';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMessage(null);
        setSaveSuccess(false);

        try {
            const payload: AdminSettings = {
                upi_id: upiId.trim(),
                organization_name: organizationName.trim(),
                org_name: organizationName.trim(),
                lab_name: labName.trim()
            };

            const res = await apiService.updateAdminSettings(payload);
            const saved = res.settings || payload;
            const normalized: AdminSettings = {
                ...saved,
                organization_name: saved.organization_name || saved.org_name || organizationName.trim(),
                org_name: saved.organization_name || saved.org_name || organizationName.trim()
            };

            onSaved(normalized);
            setSaveSuccess(true);
            setTimeout(() => {
                setSaveSuccess(false);
                onClose();
            }, 800);
        } catch (err: any) {
            setErrorMessage(err.message || 'Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="p-5 border-b border-slate-100 bg-slate-900 text-white flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center text-base border border-slate-700">
                            <i className="fa-solid fa-gear"></i>
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-white">Payment & Laboratory Settings</h3>
                            <p className="text-xs text-slate-400">Configure UPI ID, Payee Name, and Laboratory Brand</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-slate-800">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
                        {/* Form Inputs */}
                        <div className="md:col-span-7 space-y-4">
                            {errorMessage && (
                                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium flex items-center gap-2">
                                    <i className="fa-solid fa-triangle-exclamation text-rose-500"></i>
                                    <span>{errorMessage}</span>
                                </div>
                            )}

                            {saveSuccess && (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-2">
                                    <i className="fa-solid fa-circle-check text-emerald-500 text-sm"></i>
                                    <span>Settings saved successfully.</span>
                                </div>
                            )}

                            {/* Organization / Payee Name */}
                            <div>
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                                    Organization / Payee Name
                                </label>
                                <input
                                    type="text"
                                    value={organizationName}
                                    onChange={e => setOrganizationName(e.target.value)}
                                    placeholder="Enter payee name"
                                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                />
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Displayed as the payee name on UPI apps upon QR scan.
                                </p>
                            </div>

                            {/* UPI ID (VPA) */}
                            <div>
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                                    UPI ID (VPA)
                                </label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={upiId}
                                        onChange={e => setUpiId(e.target.value)}
                                        placeholder="e.g., user@bank"
                                        className="w-full p-2.5 pl-9 border border-slate-300 rounded-xl text-sm font-mono outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                    />
                                    <i className="fa-solid fa-at absolute left-3 top-3 text-slate-400 text-xs"></i>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    UPI virtual payment address for receiving payments.
                                </p>
                            </div>

                            {/* Laboratory / Brand Name */}
                            <div>
                                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block mb-1">
                                    Laboratory Name
                                </label>
                                <input
                                    type="text"
                                    value={labName}
                                    onChange={e => setLabName(e.target.value)}
                                    placeholder="Enter laboratory name"
                                    className="w-full p-2.5 border border-slate-300 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                />
                            </div>
                        </div>

                        {/* Live Preview Panel */}
                        <div className="md:col-span-5 bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2">
                                QR Preview
                            </span>
                            {qrPreviewUrl ? (
                                <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-sm inline-block">
                                    <img
                                        src={qrPreviewUrl}
                                        alt="UPI QR Code Preview"
                                        className="w-36 h-36 mx-auto object-contain"
                                    />
                                </div>
                            ) : (
                                <div className="w-36 h-36 mx-auto rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                                    Enter UPI ID
                                </div>
                            )}
                            <div className="mt-3 w-full text-left bg-white p-2.5 rounded-lg border border-slate-200 text-xs space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">Payee</span>
                                    <span className="font-bold text-slate-800 text-[11px] truncate max-w-[140px]">{previewOrg}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400 text-[10px] uppercase font-bold">VPA</span>
                                    <span className="font-mono font-semibold text-slate-700 text-[11px] truncate max-w-[140px]">{previewUpi || 'Not set'}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-white text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-100 text-xs transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-sm text-xs flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                            {isSaving ? (
                                <>
                                    <i className="fa-solid fa-spinner fa-spin"></i>
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <i className="fa-solid fa-check"></i>
                                    <span>Save Settings</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UpiSettingsModal;
