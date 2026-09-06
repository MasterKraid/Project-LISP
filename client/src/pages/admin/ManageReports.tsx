import React, { useState, useEffect, useRef } from 'react';
import { apiService } from '../../services/api';
import { User, LabReport, Document } from '../../types';
import PageHeader from '../../components/PageHeader';
import SearchableDropdown from '../../components/SearchableDropdown';
import { sendLocalNotification } from '../../utils/notifications';

const ManageReports: React.FC = () => {
    const [reports, setReports] = useState<LabReport[]>([]);
    const [receipts, setReceipts] = useState<Document[]>([]);
    const [clients, setClients] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    const [alarms, setAlarms] = useState<{ warningCount: number; alarmCount: number; criticalList: any[] } | null>(null);
    const [dismissedAlarms, setDismissedAlarms] = useState(() => sessionStorage.getItem('dismissedPendingAlarm') === 'true');

    const [hoveredTooltip, setHoveredTooltip] = useState<{
        rect: DOMRect;
        clientName: string;
        uid: string | number;
        testNames?: string;
    } | null>(null);

    useEffect(() => {
        apiService.getPendingReportAlarms().then(data => {
            setAlarms(data);
        }).catch(console.error);
    }, []);

    const dismissAlarmBanner = () => {
        sessionStorage.setItem('dismissedPendingAlarm', 'true');
        setDismissedAlarms(true);
    };

    // Form state: Map of category to selected file
    const [categoryFiles, setCategoryFiles] = useState<Record<'With Header' | 'Without Header' | 'Bill' | 'Others', File | null>>({
        'With Header': null,
        'Without Header': null,
        'Bill': null,
        'Others': null
    });

    // Selected receipt for upload target
    const [selectedReceipt, setSelectedReceipt] = useState<Document | null>(null);

    // Right side tabs & filters
    const [activeRightTab, setActiveRightTab] = useState<'pending' | 'directory'>('pending');
    
    // Sort / Filter states
    const [selectedClientId, setSelectedClientId] = useState<string>('all');
    const [selectedDate, setSelectedDate] = useState<string>(() => {
        const today = new Date();
        const y = today.getFullYear();
        const m = String(today.getMonth() + 1).padStart(2, '0');
        const d = String(today.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const tempCategoryRef = useRef<'With Header' | 'Without Header' | 'Bill' | 'Others' | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [fetchedReports, fetchedReceipts, fetchedClients] = await Promise.all([
                apiService.getReportsAdmin(),
                apiService.getReceipts(),
                apiService.getClientWallets()
            ]);
            setReports(fetchedReports);
            setReceipts(fetchedReceipts);
            setClients(fetchedClients);
        } catch (err) {
            console.error("Failed to fetch data", err);
            alert("Error loading data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDownload = async (report: any) => {
        try {
            const response = await fetch(`/api/reports/${report.id}/download`);
            if (response.status === 403) {
                const errData = await response.json();
                alert(errData.message || "Download blocked: Wallet account balance is negative.");
                return;
            }
            if (!response.ok) throw new Error('File download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            
            const sanitizedCustomerName = report.customer_name.replace(/[^a-zA-Z0-9]/g, '_');
            const sanitizedCategory = (report.category || 'report').toLowerCase().replace(/\s+/g, '_');
            const filename = `${sanitizedCustomerName}_${sanitizedCategory}.pdf`;
            a.download = filename;

            document.body.appendChild(a);
            a.click();

            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error("Download failed:", err);
            alert("Failed to download file.");
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedReceipt) {
            alert("Please select a target customer from the right panel first.");
            return;
        }

        const activePairs = Object.entries(categoryFiles).filter(([_, f]) => f !== null) as [ 'With Header' | 'Without Header' | 'Bill' | 'Others', File ][];
        if (activePairs.length === 0) {
            alert("Please select or drop at least one PDF file in the category dropzones.");
            return;
        }

        const clientId = selectedReceipt.acting_as_client_id || selectedReceipt.created_by_user_id;
        const customerId = selectedReceipt.customer_id;

        if (!clientId || !customerId) {
            alert("Invalid client or customer record associated with this receipt.");
            return;
        }

        try {
            setUploading(true);
            const customerName = selectedReceipt.customer_name;
            
            // Upload all files in parallel
            await Promise.all(activePairs.map(async ([cat, f]) => {
                const formData = new FormData();
                formData.append('client_id', clientId.toString());
                formData.append('customer_id', customerId.toString());
                formData.append('category', cat);
                formData.append('report', f);
                return apiService.uploadReport(formData);
            }));

            // Reset selected receipt and categoryFiles
            setSelectedReceipt(null);
            setCategoryFiles({
                'With Header': null,
                'Without Header': null,
                'Bill': null,
                'Others': null
            });

            // Refresh lists
            fetchData();
            sendLocalNotification('Reports Uploaded Successfully!', {
                body: `PDF report(s) for customer ${customerName} have been processed and uploaded successfully!`,
                tag: 'report-upload-success'
            });
            alert("Reports uploaded successfully!");
        } catch (err: any) {
            console.error("Upload error", err);
            alert(err.message || "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm("Are you sure you want to delete this report?")) return;
        try {
            await apiService.deleteReport(id);
            fetchData();
        } catch (err: any) {
            alert("Failed to delete report.");
        }
    };

    // Drag & Drop Handlers
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent, category: 'With Header' | 'Without Header' | 'Bill' | 'Others') => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile.type === 'application/pdf' || droppedFile.name.endsWith('.pdf')) {
                setCategoryFiles(prev => ({ ...prev, [category]: droppedFile }));
            } else {
                alert("Only PDF files are supported.");
            }
        }
    };

    const handleDropzoneClick = (category: 'With Header' | 'Without Header' | 'Bill' | 'Others') => {
        if (fileInputRef.current) {
            tempCategoryRef.current = category;
            fileInputRef.current.click();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            if (selectedFile.type === 'application/pdf' || selectedFile.name.endsWith('.pdf')) {
                if (tempCategoryRef.current) {
                    setCategoryFiles(prev => ({ ...prev, [tempCategoryRef.current!]: selectedFile }));
                }
            } else {
                alert("Only PDF files are supported.");
            }
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClearFile = (category: 'With Header' | 'Without Header' | 'Bill' | 'Others') => {
        setCategoryFiles(prev => ({ ...prev, [category]: null }));
    };

    const categories = [
        { id: 'With Header', label: 'With Header', icon: 'fa-file-invoice', color: 'indigo', desc: 'Official report with letterhead' },
        { id: 'Without Header', label: 'Without Header', icon: 'fa-file-signature', color: 'amber', desc: 'Plain report without letterhead' },
        { id: 'Bill', label: 'Bill', icon: 'fa-receipt', color: 'emerald', desc: 'Invoices & billing statements' },
        { id: 'Others', label: 'Others', icon: 'fa-ellipsis-h', color: 'slate', desc: 'Additional charts or documents' }
    ] as const;

    const filteredReceipts = React.useMemo(() => {
        return receipts.filter(rcpt => {
            if (!rcpt.display_date) return false;

            // Extract transacted date (DD/MM/YYYY)
            const datePart = rcpt.display_date.split(' ')[0];
            const [rcptD, rcptM, rcptY] = datePart.split('/');

            // Select Date normalization
            const target = selectedDate ? new Date(selectedDate) : null;
            if (target) {
                const targetY = target.getFullYear();
                const targetM = target.getMonth() + 1;
                const targetD = target.getDate();
                if (Number(rcptY) !== targetY || Number(rcptM) !== targetM || Number(rcptD) !== targetD) {
                    return false;
                }
            }

            // Client filter
            if (selectedClientId !== 'all') {
                const targetClientId = rcpt.acting_as_client_id || rcpt.created_by_user_id || 0;
                if (Number(targetClientId) !== Number(selectedClientId)) {
                    return false;
                }
            }

            return true;
        });
    }, [receipts, selectedDate, selectedClientId]);

    const clientOptions = React.useMemo(() => {
        const list = clients.map(c => ({
            value: c.id.toString(),
            label: `${c.alias || c.username} [UID: ${c.id}]`
        }));
        return [{ value: 'all', label: 'All Clients' }, ...list];
    }, [clients]);

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                <PageHeader title="Lab Reports Management" showActingAs={false} />

                {/* Dismissible Pending Reports Alarm Warning Banner */}
                {!dismissedAlarms && alarms && (alarms.alarmCount > 0 || alarms.warningCount > 0) && (
                    <div className="bg-red-50 border border-red-200 p-4 mb-6 rounded-xl space-y-3 text-slate-800 shadow-sm animate-in fade-in">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 text-xs">
                                <i className="fa-solid fa-circle-exclamation text-red-600 text-xl shrink-0 mt-0.5 animate-pulse"></i>
                                <div>
                                    <span className="font-bold text-red-800 text-sm block mb-1">Pending Lab Reports Warning!</span>
                                    There are <strong className="text-red-700">{alarms.warningCount} Day-2 Reminders</strong> and <strong className="text-red-800 font-black">{alarms.alarmCount} Day-3+ Critical Alarms</strong> pending upload.
                                </div>
                            </div>
                            <button
                                onClick={dismissAlarmBanner}
                                className="text-slate-400 hover:text-slate-800 font-bold shrink-0 transition-colors px-1 animate-pulse"
                                title="Dismiss banner for session"
                            >
                                <i className="fa-solid fa-times text-xs"></i>
                            </button>
                        </div>
                        {alarms.criticalList && alarms.criticalList.length > 0 && (
                            <div className="bg-white/80 border border-red-100 rounded-xl p-3 space-y-2 text-xs">
                                <span className="font-bold text-[10px] text-red-700 uppercase tracking-wider block">Top Critical Pending (3+ Days):</span>
                                <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                                    {alarms.criticalList.map((item: any) => (
                                        <div key={item.id} className="flex justify-between items-center bg-red-50/40 p-2 rounded-lg border border-red-50 gap-4">
                                            <div className="min-w-0 flex-1">
                                                <span className="font-bold text-slate-700">{item.customer_name}</span>{" "}
                                                <span className="text-[10px] text-slate-500 font-mono">({item.display_doc_id})</span>
                                                <span className="text-[10px] bg-red-100 text-red-800 font-bold px-1.5 py-0.5 rounded-full ml-2">
                                                    {item.days_pending} Days Pending
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await apiService.dismissPendingAlarm(item.id);
                                                        // Refresh alarms list
                                                        const freshData = await apiService.getPendingReportAlarms();
                                                        setAlarms(freshData);
                                                    } catch (err) {
                                                        alert("Failed to dismiss alarm");
                                                    }
                                                }}
                                                className="px-2 py-0.5 bg-red-650 hover:bg-red-700 text-white rounded font-bold text-[9px] uppercase tracking-wider transition-colors shrink-0 flex items-center gap-1 shadow-sm"
                                                title="Mark this alarm as done"
                                            >
                                                <i className="fa-solid fa-check text-[8px]"></i> Done
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    {/* Left Upload Form Panel */}
                    <div className="lg:col-span-5 min-w-0">
                        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl min-w-0 h-full">
                            <legend className="px-3 flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                                </div>
                                <span className="text-base md:text-lg font-bold text-gray-800 uppercase">Upload Reports</span>
                            </legend>

                            <form onSubmit={handleUpload} className="space-y-4 h-full flex flex-col">
                                <div className="space-y-4 flex-grow">
                                    {/* Selected Target Customer Card */}
                                    {!selectedReceipt ? (
                                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center text-slate-400 font-bold text-xs mb-4 uppercase tracking-wider flex flex-col items-center justify-center gap-2 min-h-[140px] animate-pulse">
                                            <i className="fa-solid fa-arrow-pointer text-xl text-indigo-550"></i>
                                            <span>Select a customer from the right panel to upload</span>
                                        </div>
                                    ) : (
                                        <div className="bg-indigo-50/70 border border-indigo-150 rounded-2xl p-4 mb-4 flex justify-between items-center gap-4 shadow-sm animate-in fade-in duration-200">
                                            <div className="space-y-0.5 min-w-0 flex-1">
                                                <div className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">Active Target Customer</div>
                                                <div className="text-sm font-black text-indigo-900 truncate">{selectedReceipt.customer_name}</div>
                                                <div className="text-[9px] text-indigo-600 font-mono font-bold uppercase tracking-wider truncate">
                                                    {selectedReceipt.display_doc_id} • UID: {selectedReceipt.customer_id}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedReceipt(null)}
                                                className="px-2.5 py-1.5 bg-white hover:bg-red-50 text-red-500 rounded-lg border border-indigo-200 hover:border-red-200 text-[10px] font-bold transition-all shrink-0 active:scale-95"
                                            >
                                                Change
                                            </button>
                                        </div>
                                    )}

                                    {/* Multi-File 2x2 Dropzones Panel */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-1 block">Drag and Drop PDF into Category Dropzones</label>
                                        
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept=".pdf,application/pdf"
                                            onChange={handleFileChange}
                                            className="hidden"
                                        />

                                        <div className={`grid grid-cols-2 gap-3 transition-all duration-300 ${!selectedReceipt ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                                            {categories.map(cat => {
                                                // Find if there is an already uploaded report in this category
                                                const existingReport = selectedReceipt
                                                    ? reports.find(r => r.customer_id === selectedReceipt.customer_id && (r.category === cat.id || (!r.category && cat.id === 'Others')))
                                                    : null;

                                                const catFile = categoryFiles[cat.id];
                                                const isFileSelected = catFile !== null;

                                                // State 1: Already uploaded in database
                                                if (existingReport) {
                                                    return (
                                                        <div
                                                            key={cat.id}
                                                            onClick={(e) => e.stopPropagation()} // Prevents file select trigger
                                                            className="flex flex-col items-center justify-between p-3 border border-emerald-250 bg-emerald-50/40 rounded-xl text-center h-36 relative select-none animate-in fade-in duration-200"
                                                        >
                                                            <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                                                                <i className="fa-solid fa-circle-check text-base"></i>
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <div className="text-[11px] font-black text-emerald-800 leading-tight">{cat.label}</div>
                                                                <div className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200 uppercase tracking-widest inline-block scale-90">
                                                                    Uploaded
                                                                </div>
                                                            </div>
                                                            <div className="w-full flex items-center justify-between gap-1 mt-1 bg-white px-2 py-1 rounded border border-emerald-100 shadow-sm max-w-full">
                                                                <span className="text-[8px] font-mono font-bold text-slate-500 truncate flex-1 text-left">
                                                                    {existingReport.file_path.split('/').pop()}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDelete(existingReport.id)}
                                                                    className="text-red-500 hover:text-red-700 font-bold shrink-0 p-0.5 hover:bg-red-50 rounded"
                                                                    title="Delete Report"
                                                                >
                                                                    <i className="fa-solid fa-trash-can text-xs"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                }

                                                // State 2: Staged or Empty dropzone
                                                const colorClasses = isFileSelected ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200' : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/10';

                                                return (
                                                    <div
                                                        key={cat.id}
                                                        onDragOver={handleDragOver}
                                                        onDrop={(e) => handleDrop(e, cat.id)}
                                                        onClick={() => handleDropzoneClick(cat.id)}
                                                        className={`flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-xl cursor-pointer transition-all text-center space-y-1 h-36 ${colorClasses}`}
                                                    >
                                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
                                                            isFileSelected ? 'bg-white shadow-sm' : 'bg-gray-50'
                                                        }`}>
                                                            {isFileSelected ? (
                                                                <i className="fa-solid fa-circle-check text-green-500 text-base animate-scale"></i>
                                                            ) : (
                                                                <i className={`fa-solid ${cat.icon} text-gray-400 text-xs`}></i>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="text-[11px] font-bold text-gray-800 leading-tight">{cat.label}</div>
                                                            <div className="text-[9px] text-gray-400 font-medium px-1 leading-tight">{cat.desc}</div>
                                                        </div>
                                                        {isFileSelected && (
                                                            <div className="w-full mt-1 bg-white/95 px-1.5 py-0.5 rounded border border-gray-200 shadow-sm text-[9px] font-bold text-gray-700 truncate flex items-center justify-between gap-1" onClick={(e) => e.stopPropagation()}>
                                                                <span className="truncate flex-1 text-left">{catFile.name}</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleClearFile(cat.id)}
                                                                    className="text-red-500 hover:text-red-700 font-bold"
                                                                >
                                                                    <i className="fa-solid fa-xmark"></i>
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="pt-4 mt-auto">
                                        <button
                                            type="submit"
                                            disabled={uploading || !selectedReceipt || !Object.values(categoryFiles).some(f => f !== null)}
                                            className={`w-full py-3 font-bold rounded-xl transition-all shadow-md flex justify-center items-center gap-2 text-sm ${
                                                (!selectedReceipt || !Object.values(categoryFiles).some(f => f !== null))
                                                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none'
                                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100 hover:scale-[1.01] active:scale-95'
                                            }`}
                                        >
                                            {uploading ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-circle-check"></i>}
                                            {uploading ? 'Processing Uploads...' : 'Confirm & Upload Reports'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </fieldset>
                    </div>

                    {/* Right Directory / Pending Panel */}
                    <div className="lg:col-span-7 min-w-0">
                        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl min-w-0 h-full">
                            <legend className="px-3 flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-folder-open text-xs"></i>
                                </div>
                                <span className="text-base md:text-lg font-bold text-gray-800 uppercase">Automated Workspace</span>
                            </legend>

                            {/* Dual Tabs Selector */}
                            <div className="flex border-b border-slate-200 mb-4 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setActiveRightTab('pending')}
                                    className={`pb-2 px-3 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                                        activeRightTab === 'pending'
                                            ? 'border-indigo-600 text-indigo-650'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Pending Uploads
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveRightTab('directory')}
                                    className={`pb-2 px-3 font-bold text-xs uppercase tracking-wider transition-all border-b-2 ${
                                        activeRightTab === 'directory'
                                            ? 'border-indigo-600 text-indigo-650'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                    }`}
                                >
                                    Uploaded Directory
                                </button>
                            </div>

                            {activeRightTab === 'pending' ? (
                                <div className="space-y-4">
                                    {/* Sort & Filter Panel */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 border border-slate-200/60 rounded-2xl shadow-sm items-end relative z-20">
                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">Statement Date</label>
                                            <div className="flex items-center gap-2 bg-white px-2.5 py-1.5 border border-slate-200 rounded-xl h-10">
                                                <i className="fa-solid fa-calendar-day text-slate-400 text-xs text-center shrink-0"></i>
                                                <input
                                                    type="date"
                                                    value={selectedDate}
                                                    onChange={e => setSelectedDate(e.target.value)}
                                                    className="w-full border-none outline-none text-xs font-bold text-slate-700 font-mono bg-transparent"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">Franchise / B2B Client</label>
                                            <SearchableDropdown
                                                options={clientOptions}
                                                value={selectedClientId}
                                                onChange={(val) => setSelectedClientId(val)}
                                                placeholder="Search or Select Client"
                                            />
                                        </div>
                                    </div>

                                    {/* Record counts */}
                                    <div className="flex justify-between items-center px-1">
                                        <span className="text-[10px] font-black bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1 rounded-full uppercase tracking-wider">
                                            {filteredReceipts.length} Receipts Found
                                        </span>
                                    </div>

                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                                            <i className="fa-solid fa-spinner fa-spin text-3xl text-indigo-550"></i>
                                            <span className="text-xs font-bold uppercase tracking-widest italic">Synchronizing transacted registry...</span>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm max-h-[50vh] overflow-y-auto custom-scrollbar-minimal">
                                            <table className="w-full min-w-[750px] text-left border-collapse">
                                                <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10">
                                                    <tr className="border-b border-slate-200">
                                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-4">Patient Name</th>
                                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Client Name</th>
                                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Receipt ID</th>
                                                        <th className="p-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                                                        <th className="p-3 text-right pr-4 w-24">Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 text-xs">
                                                    {filteredReceipts.map(rcpt => {
                                                        const isSelected = selectedReceipt?.id === rcpt.id;
                                                        const customerReports = reports.filter(r => r.customer_id === rcpt.customer_id);
                                                        const hasUploadedReport = customerReports.length > 0;

                                                        return (
                                                            <tr
                                                                key={rcpt.id}
                                                                onClick={() => setSelectedReceipt(rcpt)}
                                                                className={`border-b border-slate-100 cursor-pointer transition-all duration-155 hover:relative hover:z-20 ${
                                                                    isSelected 
                                                                        ? 'bg-indigo-50/30 font-medium' 
                                                                        : !hasUploadedReport 
                                                                            ? 'bg-red-50/50 hover:bg-red-100/50' 
                                                                            : 'hover:bg-slate-50'
                                                                }`}
                                                            >
                                                                {/* Left Selection Border indicator mapped on first cell */}
                                                                <td className={`p-3 pl-4 transition-all ${
                                                                    isSelected ? 'border-l-4 border-l-indigo-650 bg-indigo-50/20' : ''
                                                                }`}>
                                                                    <div className="inline-block">
                                                                        <span 
                                                                            className="font-bold text-slate-800 hover:text-indigo-650 transition-colors flex items-center gap-1.5 cursor-help"
                                                                            onMouseEnter={(e) => {
                                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                                setHoveredTooltip({
                                                                                    rect,
                                                                                    clientName: rcpt.created_by_user || 'Direct Billing',
                                                                                    uid: rcpt.acting_as_client_id || rcpt.created_by_user_id || 'N/A',
                                                                                    testNames: rcpt.test_names || undefined
                                                                                });
                                                                            }}
                                                                            onMouseLeave={() => setHoveredTooltip(null)}
                                                                        >
                                                                            {isSelected && <span className="text-indigo-600 font-black animate-pulse">&gt;</span>}
                                                                            {rcpt.customer_name}
                                                                        </span>
                                                                    </div>
                                                                    <div className="text-[9px] text-slate-400 font-mono">{rcpt.display_customer_id}</div>
                                                                </td>
                                                                <td className={`p-3 ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                                                                    <div className="font-bold text-slate-700 truncate max-w-[150px]" title={rcpt.created_by_user}>
                                                                        {rcpt.created_by_user || 'Walk-in'}
                                                                    </div>
                                                                    {rcpt.test_names && (
                                                                        <div 
                                                                            className="text-[9px] text-indigo-600 font-medium truncate max-w-[150px] cursor-help"
                                                                            title={rcpt.test_names}
                                                                        >
                                                                            {rcpt.test_names}
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className={`p-3 font-mono font-medium text-slate-650 ${isSelected ? 'bg-indigo-50/20' : ''}`}>{rcpt.display_doc_id}</td>
                                                                <td className={`p-3 ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                                                                    {hasUploadedReport ? (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-600 border border-green-150 shadow-sm">
                                                                            <i className="fa-solid fa-check-circle mr-1"></i> Uploaded
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-150 animate-pulse">
                                                                            <i className="fa-solid fa-clock mr-1"></i> Pending
                                                                        </span>
                                                                    )}
                                                                </td>
                                                                <td className={`p-3 text-right pr-4 w-24 ${isSelected ? 'bg-indigo-50/20' : ''}`}>
                                                                    <button
                                                                        type="button"
                                                                        className={`px-2 py-1 rounded text-[10px] font-bold transition-all shadow-sm ${
                                                                            isSelected
                                                                                ? 'bg-indigo-600 text-white'
                                                                                : 'bg-white hover:bg-slate-50 text-indigo-650 border border-slate-200'
                                                                        }`}
                                                                    >
                                                                        {isSelected ? 'Selected' : 'Select'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {filteredReceipts.length === 0 && (
                                                         <tr>
                                                             <td colSpan={5} className="p-10 text-center text-slate-400 italic font-bold text-xs uppercase tracking-wider">
                                                                 No receipts found matching the filters.
                                                             </td>
                                                         </tr>
                                                     )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {loading ? (
                                        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
                                            <i className="fa-solid fa-spinner fa-spin text-3xl"></i>
                                            <span className="text-xs font-bold uppercase tracking-widest italic">Retrieving secure records...</span>
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm max-h-[50vh] overflow-y-auto custom-scrollbar-minimal">
                                            <table className="w-full min-w-[700px] text-left border-collapse">
                                                <thead className="bg-gray-50/80 sticky top-0 backdrop-blur-sm z-10">
                                                    <tr className="border-b border-gray-200">
                                                        <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4">Assigned To</th>
                                                        <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Patient Name</th>
                                                        <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Category</th>
                                                        <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Upload Date</th>
                                                        <th className="p-3 text-[10px] font-bold text-gray-500 uppercase tracking-widest">Status</th>
                                                        <th className="p-3 text-right pr-4">Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 text-sm">
                                                    {reports.map(report => (
                                                        <tr key={report.id} className="hover:bg-gray-50/50 transition-colors group">
                                                            <td className="p-3 pl-4">
                                                                <div className="font-bold text-gray-800">{report.alias || report.username}</div>
                                                                <div className="text-[10px] text-gray-400 font-mono italic">REF: #{report.id.toString().padStart(4, '0')}</div>
                                                            </td>
                                                            <td className="p-3 text-gray-600 font-medium">{report.customer_name}</td>
                                                            <td className="p-3">
                                                                {report.category === 'With Header' && (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-sm">With Header</span>
                                                                )}
                                                                {report.category === 'Without Header' && (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 shadow-sm">Without Header</span>
                                                                )}
                                                                {report.category === 'Bill' && (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm">Bill</span>
                                                                )}
                                                                {(!report.category || report.category === 'Others') && (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shadow-sm">Others</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-gray-500 text-xs">{report.uploaded_at.split(' | ')[0]}</td>
                                                            <td className="p-3">
                                                                {report.is_read ? (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-50 text-green-600 border border-green-100">
                                                                        <i className="fa-solid fa-check-circle mr-1"></i> READ
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-600 border border-orange-100 animate-pulse">
                                                                        <i className="fa-solid fa-envelope mr-1"></i> UNREAD
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-right pr-4">
                                                                <div className="flex justify-end gap-1.5">
                                                                    <a
                                                                        href={`/api/reports/${report.id}/download?inline=true`}
                                                                        target="_blank"
                                                                        rel="noreferrer"
                                                                        className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-blue-600 hover:text-white rounded border border-gray-100 transition-all shadow-sm"
                                                                        title="View PDF"
                                                                    >
                                                                        <i className="fa-solid fa-eye text-xs"></i>
                                                                    </a>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDownload(report)}
                                                                        className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-indigo-600 hover:text-white rounded border border-gray-100 transition-all shadow-sm"
                                                                        title="Download PDF"
                                                                    >
                                                                        <i className="fa-solid fa-download text-xs"></i>
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDelete(report.id)}
                                                                        className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-red-600 hover:text-white rounded border border-gray-100 transition-all shadow-sm"
                                                                        title="Delete"
                                                                    >
                                                                        <i className="fa-solid fa-trash-can text-xs"></i>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {reports.length === 0 && (
                                                        <tr>
                                                            <td colSpan={6} className="p-10 text-center text-gray-400 italic text-xs uppercase font-bold tracking-widest">
                                                                No digital reports found in directory.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </fieldset>
                    </div>
                </div>
            </div>

            {/* Fixed Position Tooltip Portal (Above Everything) */}
            {hoveredTooltip && (
                <div
                    style={{
                        top: `${hoveredTooltip.rect.top - 18}px`,
                        left: `${hoveredTooltip.rect.left}px`,
                        transform: 'translateY(-100%)',
                        maxWidth: '340px'
                    }}
                    className="fixed z-[999999] pointer-events-none bg-slate-950/95 backdrop-blur-md text-white rounded-2xl p-3 px-3.5 shadow-2xl border-2 border-slate-700 animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="text-[12px] font-bold text-white flex items-center gap-1.5 tracking-wide">
                        <i className="fa-solid fa-user-tie text-indigo-400 text-[10px]"></i>
                        <span>{hoveredTooltip.clientName}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-indigo-300 font-mono mt-1 pt-1 border-t border-slate-800 flex items-center gap-1.5">
                        <span className="text-slate-400 text-[9px] uppercase font-sans tracking-wider font-extrabold">Client UID:</span>
                        <span className="text-emerald-400 font-black">{hoveredTooltip.uid}</span>
                    </div>
                    {hoveredTooltip.testNames && (
                        <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-slate-300">
                            <span className="text-[9px] uppercase font-sans tracking-wider font-extrabold text-amber-400 block mb-0.5">
                                <i className="fa-solid fa-flask-vial mr-1"></i> Ordered Tests:
                            </span>
                            <div className="font-sans leading-relaxed text-slate-200 whitespace-normal">
                                {hoveredTooltip.testNames}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ManageReports;
