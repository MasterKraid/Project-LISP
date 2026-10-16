import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { apiService } from '../../services/api';
import { FormattedCustomer, LabReport, Document } from '../../types';
import { useAuth } from '../../context/AuthContext';

const ViewCustomers: React.FC = () => {
    const { user } = useAuth();
    const [customers, setCustomers] = useState<FormattedCustomer[]>([]);
    const [reports, setReports] = useState<LabReport[]>([]);
    const [allReceipts, setAllReceipts] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal state for viewing customer details & files
    const [selectedCustForModal, setSelectedCustForModal] = useState<FormattedCustomer | null>(null);
    const [modalReports, setModalReports] = useState<LabReport[]>([]);
    const [isOpenModal, setIsOpenModal] = useState(false);
    const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
    const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
    const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const targetUploadCatRef = useRef<string | null>(null);

    // Custom hover tooltip state for Customer origin (admin only)
    const [hoveredTooltip, setHoveredTooltip] = useState<{
        rect: DOMRect;
        originName: string;
        originUid: number | string;
        originType?: string;
        creatorName?: string;
    } | null>(null);

    const loadCustomers = async () => {
        try {
            const data = await apiService.getAllCustomers();
            setCustomers(data);
        } catch (err) {
            console.error("Failed to fetch customers", err);
        }
    };

    const loadReports = async () => {
        try {
            let reportsData: LabReport[] = [];
            if (user?.role === 'ADMIN' || user?.role === 'GENERAL_EMPLOYEE') {
                reportsData = await apiService.getReportsAdmin();
            } else if (user?.role === 'CLIENT') {
                reportsData = await apiService.getReportsClient();
            }
            setReports(reportsData);
        } catch (err) {
            console.error("Failed to load reports", err);
        }
    };

    const loadReceipts = async () => {
        try {
            const receiptsData = await apiService.getReceipts();
            setAllReceipts(receiptsData);
        } catch (err) {
            console.error("Failed to load receipts", err);
        }
    };

    const loadData = async () => {
        setIsLoading(true);
        await Promise.all([loadCustomers(), loadReports(), loadReceipts()]);
        setIsLoading(false);
    };

    useEffect(() => {
        if (user) {
            loadData();
        }
    }, [user]);

    const reportsByCustomerId = useMemo(() => {
        const map: { [key: number]: LabReport[] } = {};
        reports.forEach(r => {
            if (r.customer_id) {
                if (!map[r.customer_id]) map[r.customer_id] = [];
                map[r.customer_id].push(r);
            }
        });
        return map;
    }, [reports]);

    const receiptsByCustomerId = useMemo(() => {
        const map: { [key: number]: Document[] } = {};
        allReceipts.forEach(r => {
            if (r.customer_id) {
                if (!map[r.customer_id]) map[r.customer_id] = [];
                map[r.customer_id].push(r);
            }
        });
        return map;
    }, [allReceipts]);

    const filteredCustomers = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        let list = [...customers];
        
        if (query) {
            list = list.filter(cust =>
                cust.name.toLowerCase().includes(query) ||
                cust.mobile?.includes(query) ||
                cust.display_id.toLowerCase().includes(query)
            );
        }

        list.sort((a, b) => {
            if (user?.role === 'CLIENT') {
                const aReports = reportsByCustomerId[a.id] || [];
                const bReports = reportsByCustomerId[b.id] || [];
                const aHasUnseen = aReports.some(r => !r.is_read);
                const bHasUnseen = bReports.some(r => !r.is_read);

                if (aHasUnseen && !bHasUnseen) return -1;
                if (!aHasUnseen && bHasUnseen) return 1;
            }
            return b.id - a.id;
        });

        return list;
    }, [customers, searchTerm, user, reportsByCustomerId]);

    const filteredClientReports = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        let list = [...reports];

        if (query) {
            list = list.filter(r =>
                r.customer_name.toLowerCase().includes(query) ||
                (r.category && r.category.toLowerCase().includes(query)) ||
                r.uploaded_at.toLowerCase().includes(query)
            );
        }

        return list;
    }, [reports, searchTerm]);

    const isNegativeAllowed = useMemo(() => {
        if (!user?.allow_negative_balance) return false;
        if (user.negative_balance_allowed_until) {
            return new Date(user.negative_balance_allowed_until) >= new Date();
        }
        return true;
    }, [user]);

    const isReportViewBlocked = user?.role === 'CLIENT' && typeof user.wallet_balance !== 'undefined' && user.wallet_balance <= -1 && !isNegativeAllowed;

    const handleOpenReportsModal = (cust: FormattedCustomer, custReports: LabReport[]) => {
        setSelectedCustForModal(cust);
        setModalReports(custReports);
        setIsOpenModal(true);
    };

    const handleDownloadReport = async (report: LabReport) => {
        if (isReportViewBlocked) {
            alert("Report viewing is locked due to an outstanding negative balance (-1 or less). Please clear your balance or contact admin.");
            return;
        }

        try {
            const response = await fetch(`/api/reports/${report.id}/download`);
            if (response.status === 403) {
                const errData = await response.json();
                alert(errData.message || "Viewing blocked: Report viewing is locked for negative balance (-1 or less).");
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

            // Update read status for B2B Client downloaded files in real-time
            if (user?.role === 'CLIENT' && !report.is_read) {
                loadReports();
                setModalReports(prev => prev.map(r => r.id === report.id ? { ...r, is_read: true } : r));
            }
        } catch (err) {
            console.error("Download failed:", err);
            alert("Failed to download file.");
        }
    };

    const handleViewReport = async (report: LabReport) => {
        if (isReportViewBlocked) {
            alert("Report viewing is locked due to an outstanding negative balance (-1 or less). Please clear your balance or contact admin.");
            return;
        }

        window.open(`/api/reports/${report.id}/download?inline=true`, '_blank');
        if (user?.role === 'CLIENT' && !report.is_read) {
            try {
                await apiService.markReportAsRead(report.id);
                loadReports();
                setModalReports(prev => prev.map(r => r.id === report.id ? { ...r, is_read: true } : r));
            } catch (err) {
                console.error(err);
            }
        }
    };

    const groupedModalReports = useMemo(() => {
        const groups: { [key: string]: LabReport[] } = {
            'With Header': [],
            'Without Header': [],
            'Bill': [],
            'Others': []
        };
        modalReports.forEach(r => {
            const cat = r.category || 'Others';
            if (groups[cat]) {
                groups[cat].push(r);
            } else {
                groups['Others'].push(r);
            }
        });
        return groups;
    }, [modalReports]);

    const customerReceipts = useMemo(() => {
        if (!selectedCustForModal) return [];
        return allReceipts.filter(r => r.customer_id === selectedCustForModal.id);
    }, [allReceipts, selectedCustForModal]);

    const handleTriggerCategoryUpload = (category: string) => {
        targetUploadCatRef.current = category;
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
            fileInputRef.current.click();
        }
    };

    const handleUploadFile = async (category: string, file: File) => {
        if (!selectedCustForModal) return;
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
            alert('Only PDF files are allowed.');
            return;
        }

        const resolvedClientId = 
            customerReceipts[0]?.acting_as_client_id || 
            customerReceipts[0]?.created_by_user_id || 
            (selectedCustForModal as any).origin_uid || 
            selectedCustForModal.created_by_user_id || 
            user?.id;

        if (!resolvedClientId) {
            alert('Could not determine client ID for this customer.');
            return;
        }

        try {
            setUploadingCategory(category);
            setUploadErrorMsg(null);
            const formData = new FormData();
            formData.append('client_id', resolvedClientId.toString());
            formData.append('customer_id', selectedCustForModal.id.toString());
            formData.append('category', category);
            formData.append('report', file);

            await apiService.uploadReport(formData);

            let refreshed: LabReport[] = [];
            if (user?.role === 'ADMIN' || user?.role === 'GENERAL_EMPLOYEE') {
                refreshed = await apiService.getReportsAdmin();
            } else if (user?.role === 'CLIENT') {
                refreshed = await apiService.getReportsClient();
            }
            setReports(refreshed);
            setModalReports(refreshed.filter(r => r.customer_id === selectedCustForModal.id));
            setUploadSuccessMsg(`Uploaded ${file.name} to ${category}!`);
            setTimeout(() => setUploadSuccessMsg(null), 3500);
        } catch (err: any) {
            console.error('Upload failed:', err);
            setUploadErrorMsg(err.message || 'Failed to upload report');
            setTimeout(() => setUploadErrorMsg(null), 4000);
        } finally {
            setUploadingCategory(null);
        }
    };

    const handleModalFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0 && targetUploadCatRef.current) {
            const file = e.target.files[0];
            handleUploadFile(targetUploadCatRef.current, file);
        }
    };

    const handleModalDrop = (e: React.DragEvent<HTMLDivElement>, category: string) => {
        e.preventDefault();
        if (user?.role !== 'ADMIN') return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const file = e.dataTransfer.files[0];
            handleUploadFile(category, file);
        }
    };

    const handleDeleteModalReport = async (reportId: number) => {
        if (!window.confirm('Are you sure you want to delete this report?')) return;
        try {
            await apiService.deleteReport(reportId);
            setReports(prev => prev.filter(r => r.id !== reportId));
            setModalReports(prev => prev.filter(r => r.id !== reportId));
        } catch (err: any) {
            alert(err.message || 'Failed to delete report');
        }
    };

    const categories = [
        { id: 'With Header', label: 'With Header', icon: 'fa-file-invoice', color: 'indigo', pastel: 'bg-indigo-50 border-indigo-150 text-indigo-850 hover:bg-indigo-100/90' },
        { id: 'Without Header', label: 'Without Header', icon: 'fa-file-signature', color: 'amber', pastel: 'bg-amber-50 border-amber-150 text-amber-850 hover:bg-amber-100/90' },
        { id: 'Bill', label: 'Bill', icon: 'fa-receipt', color: 'emerald', pastel: 'bg-emerald-50 border-emerald-150 text-emerald-850 hover:bg-emerald-100/90' },
        { id: 'Others', label: 'Others', icon: 'fa-ellipsis-h', color: 'slate', pastel: 'bg-slate-100/80 border-slate-200 text-slate-855 hover:bg-slate-200/90' }
    ] as const;

    // Helper for hover tooltip on RCPT number (RCP-8 requirement)
    const getRcptTooltip = (rcpt: Document | { id?: number; display_doc_id?: string; client_name?: string; created_by_user?: string }) => {
        const docId = rcpt.display_doc_id || `RCPT-${String(rcpt.id || 0).padStart(6, '0')}`;
        const client = rcpt.client_name || (rcpt.created_by_user ? rcpt.created_by_user.split('[')[0].trim() : '');
        return client ? `${docId} - ${client}` : docId;
    };

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                <PageHeader 
                    title={user?.role === 'CLIENT' ? 'View Reports' : 'Customer Directory'} 
                    showActingAs={false} 
                />

                {/* Client Negative Balance Lock Warning */}
                {user?.role === 'CLIENT' && isReportViewBlocked && (
                    <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-3">
                        <i className="fa-solid fa-lock text-rose-600 text-base"></i>
                        <span>Report viewing is locked due to an outstanding negative balance (-1 or less). Please clear your balance or contact admin.</span>
                    </div>
                )}

                <div className="relative flex flex-col">
                    <div className="md:absolute static top-0 right-6 md:-translate-y-[5px] mb-4 md:mb-0 flex justify-end order-1 md:order-none">
                        <div className="search-container w-full md:w-80 bg-white shadow-sm md:shadow-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-700 text-xs mr-2"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={user?.role === 'CLIENT' ? "Search by Patient, Category, Date..." : "Search by ID, Name, or Mobile..."}
                                className="search-input"
                            />
                        </div>
                    </div>

                    {/* CLIENT VIEW: RCP-7 Client Portal "View Reports" */}
                    {user?.role === 'CLIENT' ? (
                        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl order-2 min-w-0">
                            <legend className="px-3 flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-file-medical text-xs"></i>
                                </div>
                                <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">My Lab Reports</span>
                            </legend>

                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full min-w-[700px] bg-white divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Patient Details</th>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Category</th>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Receipt Ref</th>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Uploaded At</th>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Status</th>
                                            <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-sm">
                                        {isLoading ? (
                                            <tr><td colSpan={6} className="text-center py-12 text-gray-400 italic text-sm">Synchronizing your reports...</td></tr>
                                        ) : filteredClientReports.length === 0 ? (
                                            <tr><td colSpan={6} className="text-center py-12 text-gray-400 italic text-sm">No lab reports found.</td></tr>
                                        ) : (
                                            filteredClientReports.map(report => {
                                                const custReceipts = report.customer_id ? (receiptsByCustomerId[report.customer_id] || []) : [];
                                                const linkedReceipt = custReceipts[0];
                                                const rcptTooltip = linkedReceipt 
                                                    ? getRcptTooltip(linkedReceipt) 
                                                    : (user?.alias ? `RCPT-${String(report.id).padStart(6, '0')} - ${user.alias}` : `RCPT-${String(report.id).padStart(6, '0')}`);

                                                return (
                                                    <tr 
                                                        key={report.id}
                                                        onClick={() => handleViewReport(report)}
                                                        className="hover:bg-slate-50 border-b border-slate-100 cursor-pointer transition-colors group"
                                                    >
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-gray-800 text-sm">{report.customer_name}</div>
                                                            {report.customer_id && (
                                                                <div className="text-[10px] text-gray-400 font-mono italic">
                                                                    CUST-{String(report.customer_id).padStart(10, '0')}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-150">
                                                                {report.category || 'Standard'}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            {linkedReceipt ? (
                                                                <span 
                                                                    className="font-mono text-xs font-bold text-indigo-600 hover:text-indigo-800 cursor-help"
                                                                    title={rcptTooltip}
                                                                >
                                                                    {linkedReceipt.display_doc_id}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400 font-mono italic">N/A</span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 text-xs font-semibold text-gray-500">
                                                            {report.uploaded_at}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            {!report.is_read ? (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black bg-rose-50 text-rose-600 border border-rose-200 animate-pulse">
                                                                    Unread
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-150">
                                                                    Viewed
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="py-3 px-4 text-right" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                            <div className="flex gap-2 justify-end">
                                                                <button
                                                                    onClick={() => handleViewReport(report)}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded border transition-all ${
                                                                        isReportViewBlocked 
                                                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' 
                                                                            : 'bg-slate-50 text-slate-600 hover:bg-indigo-600 hover:text-white border-slate-200'
                                                                    }`}
                                                                    title={isReportViewBlocked ? "Viewing Locked" : "View PDF"}
                                                                >
                                                                    <i className={`fa-solid ${isReportViewBlocked ? 'fa-lock' : 'fa-eye'} text-xs`}></i>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDownloadReport(report)}
                                                                    className={`w-8 h-8 flex items-center justify-center rounded border transition-all ${
                                                                        isReportViewBlocked 
                                                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200' 
                                                                            : 'bg-slate-50 text-slate-600 hover:bg-green-600 hover:text-white border-slate-200'
                                                                    }`}
                                                                    title={isReportViewBlocked ? "Download Locked" : "Download PDF"}
                                                                >
                                                                    <i className={`fa-solid ${isReportViewBlocked ? 'fa-lock' : 'fa-download'} text-xs`}></i>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </fieldset>
                    ) : (
                        /* ADMIN / EMPLOYEE: Customers Directory */
                        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl order-2 min-w-0">
                            <legend className="px-3 flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-users text-xs"></i>
                                </div>
                                <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">All Registered Customers</span>
                            </legend>

                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full min-w-[800px] bg-white divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Identity</th>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Contact & Info</th>
                                            <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Registration</th>
                                            <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 text-sm">
                                        {isLoading ? (
                                            <tr><td colSpan={4} className="text-center py-12 text-gray-400 italic text-sm">Synchronizing customer records...</td></tr>
                                        ) : filteredCustomers.length === 0 ? (
                                            <tr><td colSpan={4} className="text-center py-12 text-gray-400 italic text-sm">No customers matching your search found.</td></tr>
                                        ) : (
                                            filteredCustomers.map(cust => {
                                                const custReports = reportsByCustomerId[cust.id] || [];
                                                const hasUnseenReport = custReports.some(r => !r.is_read);
                                                return (
                                                    <tr 
                                                        key={cust.id} 
                                                        onClick={() => handleOpenReportsModal(cust, custReports)}
                                                        className="hover:bg-slate-100 hover:shadow-inner active:bg-slate-200 border-b border-slate-200 cursor-pointer transition-all duration-150 group"
                                                    >
                                                        <td className="py-3 px-4">
                                                            <div className="flex items-center gap-2">
                                                                <div 
                                                                    className={`text-sm font-bold text-gray-800 ${user?.role === 'ADMIN' ? 'cursor-help hover:text-indigo-600 transition-colors inline-flex items-center gap-1.5' : ''}`}
                                                                    onMouseEnter={user?.role === 'ADMIN' ? (e) => {
                                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                                        setHoveredTooltip({
                                                                            rect,
                                                                            originName: cust.origin_name || cust.creator_name || 'System / Direct',
                                                                            originUid: cust.origin_uid || cust.created_by_user_id || 'N/A',
                                                                            originType: cust.origin_type || 'User',
                                                                            creatorName: cust.creator_name
                                                                        });
                                                                    } : undefined}
                                                                    onMouseLeave={user?.role === 'ADMIN' ? () => setHoveredTooltip(null) : undefined}
                                                                >
                                                                    <span>{cust.name}</span>
                                                                </div>
                                                                {hasUnseenReport && (
                                                                    <span 
                                                                        className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white font-extrabold text-[10px] shrink-0 border border-red-500 shadow-[0_0_8px_rgba(220,38,38,0.7)] animate-pulse"
                                                                        title="Unread Report Attached!"
                                                                    >
                                                                        !
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-gray-400 font-mono italic">{cust.display_id}</div>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                                    <i className="fa-solid fa-phone text-[10px] text-gray-400"></i>
                                                                    {cust.mobile || 'No Mobile'}
                                                                </div>
                                                                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                                                    <i className={`fa-solid ${cust.gender === 'Male' ? 'fa-mars' : 'fa-venus'} text-gray-300`}></i>
                                                                    {cust.gender || 'N/A'} • {cust.dob_formatted !== 'N/A' ? cust.dob_formatted : cust.display_age}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 text-xs font-semibold text-gray-500">
                                                            {cust.display_created_at}
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <div className="flex gap-2 justify-end">
                                                                {user?.role === 'ADMIN' && (
                                                                    <>
                                                                        <Link 
                                                                            to={`/admin/customers/edit/${cust.id}`} 
                                                                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                                            className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 hover:text-blue-500 rounded border border-slate-100 hover:border-blue-100 transition-all" 
                                                                            title="Edit Profile"
                                                                        >
                                                                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                                                                        </Link>
                                                                        <button
                                                                            onClick={async (e: React.MouseEvent) => {
                                                                                e.stopPropagation();
                                                                                if (window.confirm(`Are you sure you want to delete customer ${cust.name}? This will remove them from the directory, but preserve all their receipt and ledger history. This action cannot be undone. Do you want to proceed?`)) {
                                                                                    try {
                                                                                        await apiService.deleteCustomer(cust.id);
                                                                                        loadCustomers();
                                                                                    } catch (err: any) { alert(`Failed to delete: ${err.message || err}`); }
                                                                                }
                                                                            }}
                                                                            className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-600 hover:text-white rounded border border-red-100 transition-all"
                                                                            title="Delete Customer"
                                                                        >
                                                                            <i className="fa-solid fa-trash-can text-xs"></i>
                                                                        </button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </fieldset>
                    )}
                </div>
            </div>

            {/* Hovering Customer Profile & Reports Modal */}
            {isOpenModal && selectedCustForModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center z-50 p-4 transition-all">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-scale-up">
                        {/* Modal Header */}
                        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Patient Details & Reports</span>
                            <button
                                onClick={() => setIsOpenModal(false)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-all animate-none"
                            >
                                <i className="fa-solid fa-xmark text-sm"></i>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto bg-white custom-scrollbar-minimal flex-1">
                            {/* Center Top: Customer Face Icon & Main Info */}
                            <div className="text-center">
                                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 shadow-inner mx-auto mb-3 border border-indigo-100 relative">
                                    <i className="fa-solid fa-circle-user text-5xl"></i>
                                    {modalReports.some(r => !r.is_read) && (
                                        <span className="absolute bottom-0 right-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white font-extrabold text-[10px] shadow-md border border-white animate-pulse">
                                            !
                                        </span>
                                    )}
                                </div>
                                <h4 className="text-lg font-extrabold text-slate-800">{selectedCustForModal.name}</h4>
                                <p className="text-[10px] text-slate-400 font-mono italic uppercase tracking-wider mt-0.5">{selectedCustForModal.display_id}</p>
                                
                                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3.5 text-xs text-slate-600 font-bold bg-slate-50 p-3 rounded-xl border border-slate-100 max-w-md mx-auto">
                                    <div className="flex items-center gap-1.5"><i className="fa-solid fa-phone text-slate-400 text-[10px]"></i>{selectedCustForModal.mobile || 'No Mobile'}</div>
                                    <div className="flex items-center gap-1.5"><i className={`fa-solid ${selectedCustForModal.gender === 'Male' ? 'fa-mars text-blue-500' : 'fa-venus text-pink-500'} text-[10px]`}></i>{selectedCustForModal.gender || 'Gender: N/A'}</div>
                                    <div className="flex items-center gap-1.5"><i className="fa-solid fa-calendar text-slate-400 text-[10px]"></i>{selectedCustForModal.dob_formatted !== 'N/A' ? selectedCustForModal.dob_formatted : selectedCustForModal.display_age}</div>
                                    {selectedCustForModal.email && (
                                        <div className="flex items-center gap-1.5"><i className="fa-solid fa-envelope text-slate-400 text-[10px]"></i>{selectedCustForModal.email}</div>
                                    )}
                                </div>
                            </div>

                            {/* Demographic & Registration Grid */}
                            <div className="mt-5 p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 pb-1.5 flex justify-between">
                                    <span>Demographic Details</span>
                                    <span>Registered: {selectedCustForModal.display_created_at}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-655">
                                    <div>Email: <span className="text-slate-800 font-medium font-sans">{selectedCustForModal.email || 'N/A'}</span></div>
                                    <div>Mobile: <span className="text-slate-850 font-mono">{selectedCustForModal.mobile || 'N/A'}</span></div>
                                    <div>Gender: <span className="text-slate-850 font-medium">{selectedCustForModal.gender || 'N/A'}</span></div>
                                    <div>Age / DOB: <span className="text-slate-850 font-medium">{selectedCustForModal.dob_formatted !== 'N/A' ? selectedCustForModal.dob_formatted : selectedCustForModal.display_age}</span></div>
                                </div>
                            </div>

                            {/* Clinical & Financial Summary Dashboard */}
                            <div className="mt-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 space-y-3">
                                <div className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider border-b border-indigo-200 pb-1.5 flex justify-between">
                                    <span>Clinical & Billing Statistics</span>
                                    <span>Visits: {customerReceipts.length}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-4 text-xs font-bold text-slate-655">
                                    <div>Total Tests Done: <span className="text-indigo-800 text-sm font-black">{customerReceipts.reduce((sum, r) => sum + (r.num_tests || 0), 0)}</span></div>
                                    <div>Doctor Name: <span className="text-slate-850 font-black">{customerReceipts[0]?.referred_by || 'Self'}</span></div>
                                    <div>Total MRP Billing: <span className="text-slate-800 font-black">₹{customerReceipts.reduce((sum, r) => sum + (r.total_mrp || 0), 0).toLocaleString('en-IN')}</span></div>
                                    {(user?.role === 'ADMIN' || user?.role === 'CLIENT') && (
                                        <div>Total B2B Base: <span className="text-slate-800 font-black">₹{customerReceipts.reduce((sum, r) => sum + (r.b2b_cost || 0), 0).toLocaleString('en-IN')}</span></div>
                                    )}
                                    <div>Total Paid transacted: <span className="text-emerald-700 font-black">₹{customerReceipts.reduce((sum, r) => sum + (r.amount_final || 0), 0).toLocaleString('en-IN')}</span></div>
                                    <div>Last Visited Date: <span className="text-slate-700 font-medium font-mono">{customerReceipts[0]?.display_date.split(' ')[0] || 'N/A'}</span></div>
                                </div>
                            </div>

                            {/* Reports Scroll Section */}
                            <div className="border-t border-slate-100 pt-5 mt-5">
                                <div className="flex items-center justify-between mb-4">
                                    <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white font-extrabold text-[10px] animate-pulse">!</span>
                                        <span>Reports & Documents</span>
                                    </h5>
                                    {user?.role === 'ADMIN' && (
                                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full">
                                            Admin Upload Active
                                        </span>
                                    )}
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    onChange={handleModalFileChange}
                                    accept=".pdf,application/pdf"
                                    className="hidden"
                                />

                                {uploadSuccessMsg && (
                                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                                        <i className="fa-solid fa-circle-check text-emerald-600"></i>
                                        <span>{uploadSuccessMsg}</span>
                                    </div>
                                )}

                                {uploadErrorMsg && (
                                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                                        <i className="fa-solid fa-triangle-exclamation text-rose-600"></i>
                                        <span>{uploadErrorMsg}</span>
                                    </div>
                                )}

                                {isReportViewBlocked && (
                                    <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2.5">
                                        <i className="fa-solid fa-lock text-rose-600 text-sm"></i>
                                        <span>Report viewing is locked due to an outstanding negative balance (-1 or less).</span>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-4">
                                    {categories.map(cat => {
                                        const files = groupedModalReports[cat.id] || [];
                                        const isUploading = uploadingCategory === cat.id;

                                        if (files.length === 0) {
                                            if (user?.role === 'ADMIN') {
                                                return (
                                                    <div 
                                                        key={cat.id}
                                                        onDragOver={(e) => e.preventDefault()}
                                                        onDrop={(e) => handleModalDrop(e, cat.id)}
                                                        onClick={() => !isUploading && handleTriggerCategoryUpload(cat.id)}
                                                        className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-4 transition-all text-center space-y-2 flex flex-col items-center justify-center min-h-[120px] bg-slate-50/70 hover:bg-indigo-50/40 cursor-pointer hover:scale-[1.02] group"
                                                    >
                                                        <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0 text-indigo-600 group-hover:scale-110 transition-transform">
                                                            {isUploading ? (
                                                                <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                                                            ) : (
                                                                <i className={`fa-solid ${cat.icon} text-sm`}></i>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">{cat.label}</div>
                                                            <div className="text-[9px] font-bold text-slate-400 mt-0.5">0 Documents</div>
                                                        </div>
                                                        {isUploading ? (
                                                            <span className="text-[9px] font-bold text-indigo-600 flex items-center gap-1">
                                                                <i className="fa-solid fa-spinner fa-spin text-[8px]"></i>
                                                                <span>Uploading...</span>
                                                            </span>
                                                        ) : (
                                                            <span className="text-[9px] font-bold text-indigo-600 group-hover:text-indigo-800 flex items-center gap-1">
                                                                <i className="fa-solid fa-cloud-arrow-up text-[9px]"></i>
                                                                <span>Click or Drop PDF</span>
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div 
                                                    key={cat.id} 
                                                    className="border border-slate-100 rounded-2xl p-4 text-center space-y-2 flex flex-col items-center justify-center min-h-[120px] bg-slate-50/50 text-slate-400 opacity-60 cursor-not-allowed"
                                                >
                                                    <div className="w-9 h-9 rounded-full bg-white/95 shadow-sm flex items-center justify-center shrink-0">
                                                        <i className={`fa-solid ${cat.icon} text-sm`}></i>
                                                    </div>
                                                    <div>
                                                        <div className="text-[11px] font-extrabold uppercase tracking-wider">{cat.label}</div>
                                                        <div className="text-[9px] font-bold opacity-75 mt-0.5">0 Document(s)</div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        const pastelColors = {
                                            indigo: isReportViewBlocked ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-indigo-50 border-indigo-100 text-indigo-800 hover:bg-indigo-100/70 shadow-sm',
                                            amber: isReportViewBlocked ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-amber-50 border-amber-100 text-amber-800 hover:bg-amber-100/70 shadow-sm',
                                            emerald: isReportViewBlocked ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-emerald-50 border-emerald-100 text-emerald-800 hover:bg-emerald-100/70 shadow-sm',
                                            slate: isReportViewBlocked ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-slate-100/80 border-slate-200 text-slate-800 hover:bg-slate-200/95 shadow-sm'
                                        }[cat.color];

                                        return (
                                            <div 
                                                key={cat.id} 
                                                onDragOver={(e) => { if (user?.role === 'ADMIN') e.preventDefault(); }}
                                                onDrop={(e) => { if (user?.role === 'ADMIN') handleModalDrop(e, cat.id); }}
                                                onClick={() => !isReportViewBlocked && handleViewReport(files[0])}
                                                className={`border rounded-2xl p-4 transition-all text-center space-y-2 flex flex-col items-center justify-center min-h-[120px] ${pastelColors} cursor-pointer hover:scale-[1.02]`}
                                            >
                                                <div className="w-full flex items-center justify-between">
                                                    <div className="w-8 h-8 rounded-full bg-white/95 shadow-sm flex items-center justify-center shrink-0">
                                                        <i className={`fa-solid ${cat.icon} text-xs`}></i>
                                                    </div>
                                                    {user?.role === 'ADMIN' && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleTriggerCategoryUpload(cat.id);
                                                            }}
                                                            disabled={isUploading}
                                                            className="px-2 py-0.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-xs transition-all active:scale-95 disabled:opacity-50"
                                                            title="Upload new document to this category"
                                                        >
                                                            <i className={`fa-solid ${isUploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'} text-[8px]`}></i>
                                                            <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
                                                        </button>
                                                    )}
                                                </div>

                                                <div>
                                                    <div className="text-[11px] font-extrabold uppercase tracking-wider">{cat.label}</div>
                                                    <div className="text-[9px] font-bold opacity-75 mt-0.5">{files.length} Document(s)</div>
                                                </div>

                                                <div className="w-full mt-2 space-y-1.5" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                                                    {files.map(report => (
                                                        <div key={report.id} className="bg-white/95 p-1.5 rounded-lg border border-white/50 text-[10px] text-slate-800 font-bold flex items-center justify-between gap-1 shadow-sm hover:bg-white transition-all">
                                                            <div className="truncate flex-1 text-left flex items-center gap-1">
                                                                {!report.is_read && (
                                                                    <span 
                                                                        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-600 text-white font-extrabold text-[8px] animate-pulse border border-red-500 shrink-0 select-none"
                                                                        title="Unread Report"
                                                                    >
                                                                        !
                                                                    </span>
                                                                )}
                                                                <span className="truncate">{report.uploaded_at.split(' | ')[0]}</span>
                                                            </div>
                                                            <div className="flex gap-1 shrink-0">
                                                                <button
                                                                    onClick={() => handleViewReport(report)}
                                                                    className={`w-5 h-5 flex items-center justify-center rounded border border-slate-100 transition-colors animate-none ${
                                                                        isReportViewBlocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50 hover:bg-indigo-600 hover:text-white'
                                                                    }`}
                                                                    title={isReportViewBlocked ? "Viewing Locked" : "View PDF"}
                                                                >
                                                                    <i className={`fa-solid ${isReportViewBlocked ? 'fa-lock' : 'fa-eye'} text-[8px]`}></i>
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDownloadReport(report)}
                                                                    className={`w-5 h-5 flex items-center justify-center rounded border border-slate-100 transition-colors animate-none ${
                                                                        isReportViewBlocked ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-50 hover:bg-green-600 hover:text-white'
                                                                    }`}
                                                                    title={isReportViewBlocked ? "Download Locked" : "Download PDF"}
                                                                >
                                                                    <i className={`fa-solid ${isReportViewBlocked ? 'fa-lock' : 'fa-download'} text-[8px]`}></i>
                                                                </button>
                                                                {user?.role === 'ADMIN' && (
                                                                    <button
                                                                        onClick={() => handleDeleteModalReport(report.id)}
                                                                        className="w-5 h-5 flex items-center justify-center rounded border border-slate-100 bg-slate-50 hover:bg-red-600 hover:text-white text-slate-400 transition-colors animate-none"
                                                                        title="Delete Report"
                                                                    >
                                                                        <i className="fa-solid fa-trash-can text-[8px]"></i>
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Customer Receipts Section (RCP-8 hover tooltip) */}
                            {(user?.role === 'ADMIN' || user?.role === 'CLIENT' || user?.role === 'GENERAL_EMPLOYEE') && (
                                <div className="border-t border-slate-100 pt-5 mt-5">
                                    <h5 className="text-xs font-extrabold uppercase tracking-widest text-slate-500 flex items-center gap-2 mb-4">
                                        <i className="fa-solid fa-file-invoice-dollar text-indigo-500 text-sm"></i>
                                        <span>Customer Receipts & Billing</span>
                                    </h5>
                                    
                                    {customerReceipts.length === 0 ? (
                                        <p className="text-xs text-slate-400 italic bg-slate-50 p-4 rounded-xl border border-dashed border-slate-200 text-center font-bold">
                                            No billing history found for this patient.
                                        </p>
                                    ) : (
                                        <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                                            {customerReceipts.map(rcpt => {
                                                const tooltip = getRcptTooltip(rcpt);
                                                return (
                                                    <div key={rcpt.id} className="bg-slate-50/50 hover:bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between gap-4 transition-all">
                                                        <div className="space-y-0.5">
                                                            <div 
                                                                className="text-xs font-black text-slate-800 cursor-help flex items-center gap-1.5"
                                                                title={tooltip}
                                                            >
                                                                <span>{rcpt.display_doc_id}</span>
                                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                                                    {rcpt.lab_name || 'N/A'}
                                                                </span>
                                                            </div>
                                                            <div className="text-[10px] text-slate-400 font-mono font-medium">{rcpt.display_date}</div>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100">
                                                                {rcpt.display_amount}
                                                            </span>
                                                            <div className="flex gap-1.5">
                                                                {user?.role !== 'CLIENT' && (
                                                                    <Link 
                                                                        to={`/receipt/${rcpt.id}`} 
                                                                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-indigo-600 hover:text-white text-slate-400 hover:border-indigo-600 rounded-lg border border-slate-200 shadow-sm transition-all"
                                                                        title="View PDF Page"
                                                                    >
                                                                        <i className="fa-solid fa-file-pdf text-[11px]"></i>
                                                                    </Link>
                                                                )}
                                                                {user?.role === 'ADMIN' && (
                                                                    <Link 
                                                                        to={`/admin/receipts/edit/${rcpt.id}`} 
                                                                        className="w-7 h-7 flex items-center justify-center bg-white hover:bg-yellow-500 hover:text-white text-slate-400 hover:border-yellow-500 rounded-lg border border-slate-200 shadow-sm transition-all"
                                                                        title="Edit Receipt"
                                                                    >
                                                                        <i className="fa-solid fa-pen text-[10px]"></i>
                                                                    </Link>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Fixed Position Tooltip Portal (Above Everything) */}
            {hoveredTooltip && (
                <div
                    style={{
                        top: `${hoveredTooltip.rect.top - 14}px`,
                        left: `${hoveredTooltip.rect.left}px`,
                        transform: 'translateY(-100%)',
                        maxWidth: '340px'
                    }}
                    className="fixed z-[999999] pointer-events-none bg-slate-950/95 backdrop-blur-md text-white rounded-2xl p-3 px-3.5 shadow-2xl border-2 border-slate-700 animate-in fade-in zoom-in-95 duration-100"
                >
                    <div className="text-[9px] uppercase font-sans tracking-wider font-extrabold text-slate-400 mb-1 flex items-center gap-1.5">
                        <i className="fa-solid fa-seedling text-indigo-400 text-[10px]"></i>
                        <span>Customer Origin</span>
                    </div>
                    <div className="text-[12px] font-bold text-white flex items-center gap-1.5 tracking-wide">
                        <i className="fa-solid fa-user-tie text-indigo-400 text-[10px]"></i>
                        <span>{hoveredTooltip.originName}</span>
                    </div>
                    <div className="text-[10px] font-semibold text-indigo-300 font-mono mt-1 pt-1 border-t border-slate-800 flex items-center justify-between gap-3">
                        <span className="text-slate-400 text-[9px] uppercase font-sans tracking-wider font-extrabold">User / Client UID:</span>
                        <span className="text-emerald-400 font-black">#{String(hoveredTooltip.originUid).padStart(4, '0')}</span>
                    </div>
                    {hoveredTooltip.originType && (
                        <div className="text-[9px] text-slate-400 mt-1 flex items-center justify-between gap-3">
                            <span className="font-sans">Origin Type:</span>
                            <span className="text-indigo-300 font-semibold">{hoveredTooltip.originType}</span>
                        </div>
                    )}
                    {hoveredTooltip.creatorName && hoveredTooltip.creatorName !== hoveredTooltip.originName && (
                        <div className="text-[9px] text-slate-400 mt-0.5 flex items-center justify-between gap-3">
                            <span className="font-sans">Created By:</span>
                            <span className="text-slate-300 font-medium">{hoveredTooltip.creatorName}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ViewCustomers;
