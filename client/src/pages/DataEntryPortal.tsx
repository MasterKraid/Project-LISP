import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import PageHeader from '../components/PageHeader';
import SearchableDropdown from '../components/SearchableDropdown';
import { LabReport } from '../types';

interface DataEntryReceipt {
  id: number;
  customer_id: number;
  branch_id: number;
  created_at: string;
  referred_by?: string;
  notes?: string;
  num_tests: number;
  total_mrp?: number;
  created_by_user_id: number;
  acting_as_client_id?: number;
  data_entry_done: number;
  prefix?: string;
  customer_name: string;
  mobile?: string;
  email?: string;
  dob?: string;
  age_years?: number;
  age_months?: number;
  age_days?: number;
  gender?: 'Male' | 'Female';
  created_by_user?: string;
  client_name?: string;
  display_doc_id: string;
  display_date: string;
  display_customer_id: string;
  items: { package_name: string; code_name?: string | null }[];
  lab_id?: number;
  lab_name?: string;
}

const isFieldValid = (val?: string | null): boolean => {
  if (!val) return false;
  const trimmed = val.trim();
  return trimmed !== '' && trimmed.toUpperCase() !== 'N/A';
};

const CopyableTitleField: React.FC<{
  label: string;
  value: string;
  isCopied?: boolean;
  onCopy?: () => void;
}> = ({ label, value, isCopied, onCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value || '');
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div
      onClick={handleCopy}
      className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-150 flex flex-col justify-center items-center select-none w-24 shrink-0 border ${
        isCopied
          ? 'bg-emerald-50 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
          : 'red-glowing-box'
      }`}
    >
      <div className={`text-[10px] font-bold uppercase tracking-wider leading-none mb-1 text-center ${
        isCopied ? 'text-emerald-700 font-extrabold' : 'text-red-400 group-hover:text-red-500'
      }`}>
        {label}
      </div>
      <div className={`text-xl font-black uppercase text-center truncate w-full ${
        isCopied ? 'text-emerald-800' : 'red-glowing-text'
      }`}>
        {value || 'N/A'}
      </div>
      {isCopied && !copied && (
        <div className="absolute top-1 right-1.5 text-emerald-600 text-[10px]">
          <i className="fa-solid fa-check"></i>
        </div>
      )}
      {copied && (
        <div className="absolute inset-x-0 -top-2 mx-auto w-max bg-emerald-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded shadow-lg animate-bounce z-50">
          Copied!
        </div>
      )}
    </div>
  );
};

const CopyableField: React.FC<{
  label: string;
  value: string;
  prefix?: string;
  isCopied?: boolean;
  onCopy?: () => void;
}> = ({ label, value, prefix, isCopied, onCopy }) => {
  const [copied, setCopied] = useState(false);

  if (!isFieldValid(value)) {
    return null;
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(value || '');
    setCopied(true);
    onCopy?.();
    setTimeout(() => setCopied(false), 1000);
  };

  return (
    <div
      onClick={handleCopy}
      className={`group relative p-3 rounded-xl cursor-pointer transition-all duration-150 flex items-center justify-between border ${
        isCopied
          ? 'bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-200'
          : 'bg-slate-50 hover:bg-indigo-50/50 border-slate-200 hover:border-indigo-200'
      }`}
    >
      <div className="min-w-0 pr-4">
        <div className={`text-[10px] font-bold uppercase tracking-wider leading-none mb-1 ${
          isCopied ? 'text-emerald-700 font-extrabold' : 'text-slate-400 group-hover:text-indigo-550'
        }`}>
          {label}
        </div>
        <div className={`text-sm font-semibold truncate leading-tight select-none flex items-center ${
          isCopied ? 'text-emerald-950 font-bold' : 'text-slate-700 group-hover:text-indigo-900'
        }`}>
          {prefix && (
            <span className="text-red-750 font-black mr-1.5 shrink-0 uppercase tracking-wide" style={{ color: '#991b1b', fontWeight: 900 }}>
              {prefix}
            </span>
          )}
          <span>{value}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isCopied && (
          <span className="text-emerald-600 text-xs font-bold">
            <i className="fa-solid fa-circle-check"></i>
          </span>
        )}
        <div className={`${isCopied ? 'text-emerald-600' : 'text-slate-400 group-hover:text-indigo-650'} transition-colors`}>
          <i className="fa-solid fa-copy text-xs"></i>
        </div>
      </div>
      {copied && (
        <div className="absolute right-3 -top-2 bg-emerald-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded shadow-lg animate-bounce z-50">
          Copied!
        </div>
      )}
    </div>
  );
};

const CopyableBadge: React.FC<{
  name: string;
  codeName?: string | null;
  isCopied?: boolean;
  onCopy?: () => void;
}> = ({ name, codeName, isCopied, onCopy }) => {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const codeToCopy = codeName && codeName.trim() !== '' ? codeName : name;

  const handleClick = () => {
    navigator.clipboard.writeText(codeToCopy);
    setCopiedText(codeToCopy === name ? 'Copied Name!' : 'Copied Code!');
    onCopy?.();
    setTimeout(() => setCopiedText(null), 1000);
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className={`group relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all active:scale-95 select-none border ${
        isCopied
          ? 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200'
          : 'bg-slate-100 hover:bg-indigo-550 hover:text-white border-slate-200 hover:border-indigo-650'
      }`}
      title="Click to copy"
    >
      {isCopied && (
        <i className="fa-solid fa-check text-[10px] text-emerald-600"></i>
      )}
      <span>{name}</span>
      <i className={`fa-solid fa-copy text-[10px] ${
        isCopied ? 'text-emerald-600' : 'text-slate-400 group-hover:text-indigo-200'
      }`}></i>
      
      {copiedText && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-7 bg-emerald-600 text-white text-[9px] font-black px-2 py-0.5 rounded shadow-lg z-[999] whitespace-nowrap animate-bounce">
          {copiedText}
        </div>
      )}

      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 bg-slate-800 text-white text-[9px] font-medium p-2 rounded-lg shadow-xl z-[9999] border border-slate-750 w-40 text-center space-y-0.5 animate-in fade-in zoom-in duration-70">
          <div className="text-[7px] uppercase tracking-wider text-slate-400">Test Code</div>
          <div className="font-mono text-emerald-400 font-extrabold text-[10px] truncate pl-1 pr-1">
            {codeToCopy}
          </div>
          <div className="text-[6.5px] text-slate-400 italic">Click to copy</div>
        </div>
      )}
    </div>
  );
};

const DataEntryPortal: React.FC = () => {
  const { user } = useAuth();

  const [dateFilter, setDateFilter] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');
  const [receipts, setReceipts] = useState<DataEntryReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState<DataEntryReceipt | null>(null);

  const [hoveredTooltip, setHoveredTooltip] = useState<{
    rect: DOMRect;
    clientName: string;
    uid: string | number;
  } | null>(null);

  const [labs, setLabs] = useState<any[]>([]);
  const [selectedLabId, setSelectedLabId] = useState<string>('');

  // DEW-2: Client Filtering
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('all');

  // DEW-1: Embedded Report Upload Modal State
  const [reports, setReports] = useState<LabReport[]>([]);
  const [showUploadOverlay, setShowUploadOverlay] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [categoryFiles, setCategoryFiles] = useState<{ [cat: string]: File | null }>({
    'With Header': null,
    'Without Header': null,
    'Bill': null,
    'Others': null
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeCategoryRef = useRef<'With Header' | 'Without Header' | 'Bill' | 'Others' | null>(null);

  // DEW-3: Gamification Progress Bar State (keyed by receipt ID)
  const [copiedFieldsByReceipt, setCopiedFieldsByReceipt] = useState<{ [receiptId: number]: Set<string> }>({});

  useEffect(() => {
    apiService.getLabs().then(data => {
      setLabs(data);
      if (data.length > 0) {
        setSelectedLabId(data[0].id.toString());
      }
    }).catch(console.error);

    apiService.getClientWallets().then(setClients).catch(console.error);
    apiService.getReportsAdmin().then(setReports).catch(console.error);
  }, []);

  const fetchReceipts = async () => {
    try {
      setLoading(true);
      // Format YYYY-MM-DD to DD/MM/YYYY for SQLite pattern matching
      const [y, m, d] = dateFilter.split('-');
      const formattedDate = `${d}/${m}/${y}`;
      const data = await apiService.getDataEntryReceipts(formattedDate);
      setReceipts(data);
    } catch (err) {
      console.error('Failed to load data entry receipts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter]);

  const handleMarkDone = async (id: number) => {
    try {
      await apiService.updateDataEntryStatus(id, true);
      setSelectedReceipt(null);
      fetchReceipts();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  const handleMarkIncomplete = async (id: number) => {
    const confirmRevert = window.confirm(
      'Warning: Reverting this receipt will allow it to be edited in the software.\n\nPlease remember to edit data in the master website if changing here.\n\nAre you sure you want to mark this receipt as Incomplete?'
    );
    if (!confirmRevert) return;

    try {
      await apiService.updateDataEntryStatus(id, false);
      setSelectedReceipt(null);
      fetchReceipts();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    }
  };

  // DEW-2: Client Filtering logic
  const clientOptions = useMemo(() => {
    const list = clients.map((c: any) => ({
      value: c.id.toString(),
      label: `${c.alias || c.username} [UID: ${c.id}]`
    }));
    return [{ value: 'all', label: 'All Clients' }, ...list];
  }, [clients]);

  const filteredReceipts = receipts.filter(r => {
    if (selectedLabId && r.lab_id !== parseInt(selectedLabId)) return false;
    if (selectedClientId && selectedClientId !== 'all') {
      const cid = parseInt(selectedClientId);
      const matchesActing = r.acting_as_client_id === cid;
      const matchesCreator = !r.acting_as_client_id && r.created_by_user_id === cid;
      if (!matchesActing && !matchesCreator) return false;
    }
    return true;
  });

  const pendingList = filteredReceipts.filter((r) => r.data_entry_done === 0);
  const completedList = filteredReceipts.filter((r) => r.data_entry_done === 1);
  const activeList = activeTab === 'pending' ? pendingList : completedList;

  // DEW-3: Gamification Progress Bar Calculations
  const currentCopied = useMemo(() => {
    if (!selectedReceipt) return new Set<string>();
    return copiedFieldsByReceipt[selectedReceipt.id] || new Set<string>();
  }, [selectedReceipt, copiedFieldsByReceipt]);

  const handleFieldCopied = (fieldKey: string) => {
    if (!selectedReceipt) return;
    const receiptId = selectedReceipt.id;
    setCopiedFieldsByReceipt(prev => {
      const currentSet = prev[receiptId] ? new Set(prev[receiptId]) : new Set<string>();
      currentSet.add(fieldKey);
      return { ...prev, [receiptId]: currentSet };
    });
  };

  const requiredFields = useMemo(() => {
    if (!selectedReceipt) return [];
    const list: { key: string; label: string }[] = [];

    if (isFieldValid(selectedReceipt.prefix)) {
      list.push({ key: 'prefix', label: 'Title' });
    }
    if (isFieldValid(selectedReceipt.customer_name)) {
      list.push({ key: 'customer_name', label: 'Patient Name' });
    }
    if (isFieldValid(selectedReceipt.mobile)) {
      list.push({ key: 'mobile', label: 'Mobile Number' });
    }
    if (isFieldValid(selectedReceipt.email)) {
      list.push({ key: 'email', label: 'Email Address' });
    }
    if (isFieldValid(selectedReceipt.gender)) {
      list.push({ key: 'gender', label: 'Gender' });
    }

    const ageStr = `${selectedReceipt.age_years || 0} Y / ${selectedReceipt.age_months || 0} M / ${selectedReceipt.age_days || 0} D`;
    if (isFieldValid(ageStr)) {
      list.push({ key: 'age', label: 'Patient Age' });
    }

    if (isFieldValid(selectedReceipt.dob)) {
      list.push({ key: 'dob', label: 'Date of Birth' });
    }
    if (isFieldValid(selectedReceipt.referred_by)) {
      list.push({ key: 'referred_by', label: 'Referred By' });
    }

    const testCountStr = String(selectedReceipt.items?.length || selectedReceipt.num_tests || 0);
    if (isFieldValid(testCountStr)) {
      list.push({ key: 'num_tests', label: 'Total Tests Count' });
    }

    const mrpStr = `₹${(selectedReceipt.total_mrp || 0).toFixed(0)}`;
    if (isFieldValid(mrpStr)) {
      list.push({ key: 'total_mrp', label: 'Total MRP' });
    }

    (selectedReceipt.items || []).forEach((item, idx) => {
      if (isFieldValid(item.package_name)) {
        list.push({ key: `test-${idx}`, label: item.package_name });
      }
    });

    return list;
  }, [selectedReceipt]);

  const completedCount = requiredFields.filter(f => currentCopied.has(f.key)).length;
  const totalCount = requiredFields.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isProgressComplete = totalCount > 0 && completedCount >= totalCount;

  // DEW-1: Embedded Report Upload Logic
  const patientReports = useMemo(() => {
    if (!selectedReceipt) return [];
    return reports.filter(r => r.customer_id === selectedReceipt.customer_id);
  }, [reports, selectedReceipt]);

  const categories: { id: 'With Header' | 'Without Header' | 'Bill' | 'Others'; label: string; icon: string }[] = [
    { id: 'With Header', label: 'Report With Header', icon: 'fa-file-lines' },
    { id: 'Without Header', label: 'Report Without Header', icon: 'fa-file' },
    { id: 'Bill', label: 'Final Bill / Invoice', icon: 'fa-file-invoice-dollar' },
    { id: 'Others', label: 'Others / Ancillary', icon: 'fa-paperclip' }
  ];

  const handleDrop = (e: React.DragEvent, cat: 'With Header' | 'Without Header' | 'Bill' | 'Others') => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setCategoryFiles(prev => ({ ...prev, [cat]: file }));
      } else {
        alert('Only PDF files are allowed.');
      }
    }
  };

  const handleDropzoneClick = (cat: 'With Header' | 'Without Header' | 'Bill' | 'Others') => {
    activeCategoryRef.current = cat;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && activeCategoryRef.current) {
      const file = e.target.files[0];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        setCategoryFiles(prev => ({ ...prev, [activeCategoryRef.current!]: file }));
      } else {
        alert('Only PDF files are allowed.');
      }
    }
  };

  const handleUploadReports = async () => {
    if (!selectedReceipt) return;
    const activePairs = Object.entries(categoryFiles).filter(([_, f]) => f !== null) as [ 'With Header' | 'Without Header' | 'Bill' | 'Others', File ][];
    if (activePairs.length === 0) {
      alert('Please select or drop at least one PDF file in the category dropzones.');
      return;
    }

    const clientId = selectedReceipt.acting_as_client_id || selectedReceipt.created_by_user_id;
    const customerId = selectedReceipt.customer_id;
    if (!clientId || !customerId) {
      alert('Invalid client or customer record associated with this receipt.');
      return;
    }

    try {
      setUploading(true);
      await Promise.all(activePairs.map(async ([cat, f]) => {
        const formData = new FormData();
        formData.append('client_id', clientId.toString());
        formData.append('customer_id', customerId.toString());
        formData.append('category', cat);
        formData.append('report', f);
        return apiService.uploadReport(formData);
      }));

      setCategoryFiles({
        'With Header': null,
        'Without Header': null,
        'Bill': null,
        'Others': null
      });

      const refreshed = await apiService.getReportsAdmin();
      setReports(refreshed);
      setUploadSuccessMsg('Reports uploaded successfully!');
      setTimeout(() => setUploadSuccessMsg(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadReport = async (report: LabReport) => {
    try {
      const response = await fetch(`/api/reports/${report.id}/download`);
      if (response.status === 403) {
        const errData = await response.json();
        alert(errData.message || 'Download blocked: Wallet account balance is negative.');
        return;
      }
      if (!response.ok) throw new Error('File download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
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
      console.error('Download failed:', err);
      alert('Failed to download file.');
    }
  };

  const handleDeleteReport = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this report?')) return;
    try {
      await apiService.deleteReport(id);
      setReports(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete report');
    }
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      <fieldset className="border-2 border-gray-300 p-4 sm:p-6 rounded-2xl bg-white shadow-sm space-y-6">
        <legend className="px-3 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
            <i className="fa-solid fa-keyboard text-xs"></i>
          </div>
          <span className="text-sm font-bold text-slate-800 uppercase tracking-wider">Data Entry Workspace</span>
        </legend>

        <PageHeader title="Data Entry Workspace" showActingAs={false} />

        {/* Labs Horizontal Pill Selector */}
        {labs.length > 0 && (
          <div className="space-y-2 mb-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">
              Select Processing Laboratory
            </label>
            <div className="flex flex-nowrap overflow-x-auto gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-2xl scrollbar-thin">
              {labs.map((lab) => {
                const hasPending = receipts.some(r => r.lab_id === lab.id && r.data_entry_done === 0);
                return (
                  <button
                    key={lab.id}
                    onClick={() => setSelectedLabId(lab.id.toString())}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border shrink-0 flex items-center gap-1.5 ${
                      selectedLabId === lab.id.toString()
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-md shadow-indigo-100 scale-[1.01]'
                        : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <i className="fa-solid fa-flask text-[10px]"></i>
                    <span>{lab.name}</span>
                    {hasPending && (
                      <i className="fa-solid fa-circle-exclamation text-red-500 animate-pulse text-xs" title="Pending data entry exists"></i>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* DEW-2: Filters and Date Bar (Including Client Filter) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-6">
          <div className="space-y-1">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">
              Filter Transaction Date
            </label>
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-slate-200 rounded-xl h-10 w-full sm:w-60 shadow-sm">
              <i className="fa-solid fa-calendar text-slate-400 text-sm"></i>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full border-none outline-none text-xs font-bold text-slate-700 font-mono bg-transparent"
              />
            </div>
          </div>

          <div className="space-y-1 flex-1 sm:max-w-xs w-full">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block pl-1">
              Filter Franchise / B2B Client
            </label>
            <SearchableDropdown
              options={clientOptions}
              value={selectedClientId}
              onChange={(val) => setSelectedClientId(val)}
              placeholder="All Clients"
            />
          </div>

          {(selectedClientId !== 'all') && (
            <div className="sm:self-end pb-1">
              <button
                onClick={() => setSelectedClientId('all')}
                className="text-[11px] font-bold text-indigo-650 hover:text-indigo-800 underline decoration-dotted"
              >
                Clear Client Filter
              </button>
            </div>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 mb-6 gap-3">
          <button
            onClick={() => setActiveTab('pending')}
            className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'pending'
                ? 'border-indigo-600 text-indigo-650'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <i className="fa-solid fa-clock-rotate-left"></i>
            Pending Tasks
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                pendingList.length > 0
                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {pendingList.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('completed')}
            className={`pb-3 px-4 font-bold text-xs uppercase tracking-wider transition-all border-b-2 flex items-center gap-2 ${
              activeTab === 'completed'
                ? 'border-indigo-600 text-indigo-650'
                : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            <i className="fa-solid fa-circle-check"></i>
            Finalized Registry
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                completedList.length > 0
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {completedList.length}
            </span>
          </button>
        </div>

        {/* Active Registry Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <i className="fa-solid fa-spinner fa-spin text-3xl text-indigo-600"></i>
            <span className="text-xs font-bold uppercase tracking-widest italic animate-pulse">
              Retrieving patient documents...
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full min-w-[700px] text-left border-collapse bg-white">
              <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">
                <tr>
                  <th className="p-4 pl-6">Patient Details</th>
                  <th className="p-4">Receipt Identifier</th>
                  <th className="p-4">Physician Referred</th>
                  <th className="p-4">Tests Ordered</th>
                  <th className="p-4 text-right pr-6 w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
                {activeList.map((rcpt) => (
                  <tr
                    key={rcpt.id}
                    onClick={() => {
                      setSelectedReceipt(rcpt);
                      setShowUploadOverlay(false);
                    }}
                    className="hover:bg-indigo-50/20 cursor-pointer transition-colors group"
                  >
                    <td className="p-4 pl-6">
                      <div className="inline-block">
                        <span 
                          className="font-bold text-slate-800 hover:text-indigo-650 transition-colors text-sm cursor-help"
                          onMouseEnter={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setHoveredTooltip({
                              rect,
                              clientName: rcpt.created_by_user || 'Direct Billing',
                              uid: rcpt.acting_as_client_id || rcpt.created_by_user_id || 'N/A'
                            });
                          }}
                          onMouseLeave={() => setHoveredTooltip(null)}
                        >
                          {rcpt.prefix ? `${rcpt.prefix} ` : ''}
                          {rcpt.customer_name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {rcpt.gender} • {rcpt.age_years || 0}Y {rcpt.age_months || 0}M{' '}
                        {rcpt.age_days || 0}D
                      </div>
                    </td>
                    <td className="p-4 font-mono font-bold text-slate-650">
                      <span 
                        className="cursor-help hover:text-indigo-600 transition-colors"
                        title={rcpt.client_name ? `${rcpt.display_doc_id} - ${rcpt.client_name}` : rcpt.display_doc_id}
                      >
                        {rcpt.display_doc_id}
                      </span>
                      <div className="text-[10px] text-slate-400 font-bold font-sans uppercase tracking-wider mt-0.5">
                        {rcpt.lab_name || 'N/A'}
                      </div>
                    </td>
                    <td className="p-4 font-medium">{rcpt.referred_by || 'Self Referral'}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700 border border-slate-200 text-[10px]">
                        {rcpt.items?.length || rcpt.num_tests} Tests
                      </span>
                    </td>
                    <td className="p-4 text-right pr-6 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => {
                            setSelectedReceipt(rcpt);
                            setShowUploadOverlay(false);
                          }}
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-indigo-650 border border-slate-200 hover:border-indigo-200 font-bold rounded-lg transition-all text-[11px]"
                        >
                          Inspect details
                        </button>
                        {activeTab === 'completed' && user?.role === 'ADMIN' && (
                          <button
                            onClick={() => handleMarkIncomplete(rcpt.id)}
                            className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-650 border border-red-100 hover:border-red-200 font-bold rounded-lg transition-all text-[11px]"
                            title="Revert receipt back to incomplete status"
                          >
                            Revert
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {activeList.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-12 text-center text-slate-400 italic font-bold uppercase tracking-wider text-xs"
                    >
                      No receipts found for this selected filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </fieldset>

      {/* Hidden File Input for Category Dropzones */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Detail Modal Component */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 relative">
            
            {/* Modal Header */}
            <div className="px-6 py-5 bg-indigo-900 text-white flex justify-between items-center">
              <div>
                <div className="text-[10px] font-black bg-indigo-850 px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-1">
                  Copy workspace
                </div>
                <h3 className="m-0 text-lg font-black leading-none">
                  {selectedReceipt.customer_name} •{' '}
                  <span 
                    className="cursor-help underline decoration-dotted decoration-indigo-400"
                    title={selectedReceipt.client_name ? `${selectedReceipt.display_doc_id} - ${selectedReceipt.client_name}` : selectedReceipt.display_doc_id}
                  >
                    {selectedReceipt.display_doc_id}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedReceipt(null);
                  setShowUploadOverlay(false);
                }}
                className="w-8 h-8 rounded-full bg-indigo-850 hover:bg-red-650 text-white flex items-center justify-center transition-all shrink-0 active:scale-90"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* DEW-3: Gamification Progress Bar */}
            <div className="px-6 pt-3.5 pb-2.5 bg-gradient-to-b from-indigo-50/70 via-slate-50/40 to-transparent border-b border-slate-100">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <i className={`fa-solid fa-bolt ${isProgressComplete ? 'text-emerald-500 animate-bounce' : 'text-indigo-500'}`}></i>
                    Copy Progress
                  </span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border font-mono transition-all ${
                    isProgressComplete 
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}>
                    {completedCount} / {totalCount} Copied
                  </span>
                </div>
                <div>
                  {isProgressComplete ? (
                    <span className="text-[11px] font-black text-emerald-600 flex items-center gap-1.5 animate-pulse">
                      <i className="fa-solid fa-circle-check"></i>
                      All Fields Copied! Ready to Finalize
                    </span>
                  ) : (
                    <span className="text-[10px] font-black text-indigo-600 font-mono">
                      {progressPercent}% Complete
                    </span>
                  )}
                </div>
              </div>

              {/* Animated Poppy Horizontal Track */}
              <div className="h-3 w-full bg-slate-200/80 rounded-full p-0.5 overflow-hidden shadow-inner relative">
                <div
                  style={{ width: `${progressPercent}%` }}
                  className={`h-full rounded-full transition-all duration-500 ease-out relative ${
                    isProgressComplete
                      ? 'bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.5)]'
                      : progressPercent >= 50
                        ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500'
                        : 'bg-gradient-to-r from-amber-400 to-indigo-500'
                  }`}
                >
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.3)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.3)_50%,rgba(255,255,255,0.3)_75%,transparent_75%,transparent)] bg-[length:16px_16px] animate-[progress-shimmer_1.5s_linear_infinite] opacity-60"></div>
                </div>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2 tracking-wider pl-1">
                  Patient Credentials (Click fields to Copy)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {selectedReceipt.prefix ? (
                    <div className="flex gap-3 sm:col-span-2">
                      <CopyableTitleField
                        label="Title"
                        value={selectedReceipt.prefix}
                        isCopied={currentCopied.has('prefix')}
                        onCopy={() => handleFieldCopied('prefix')}
                      />
                      <div className="flex-grow min-w-0">
                        <CopyableField
                          label="Patient Name"
                          value={selectedReceipt.customer_name}
                          isCopied={currentCopied.has('customer_name')}
                          onCopy={() => handleFieldCopied('customer_name')}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="sm:col-span-2">
                      <CopyableField
                        label="Patient Name"
                        value={selectedReceipt.customer_name}
                        isCopied={currentCopied.has('customer_name')}
                        onCopy={() => handleFieldCopied('customer_name')}
                      />
                    </div>
                  )}
                  <CopyableField
                    label="Mobile Number"
                    value={selectedReceipt.mobile || ''}
                    isCopied={currentCopied.has('mobile')}
                    onCopy={() => handleFieldCopied('mobile')}
                  />
                  <CopyableField
                    label="Email Address"
                    value={selectedReceipt.email || ''}
                    isCopied={currentCopied.has('email')}
                    onCopy={() => handleFieldCopied('email')}
                  />
                  <CopyableField
                    label="Gender"
                    value={selectedReceipt.gender || ''}
                    isCopied={currentCopied.has('gender')}
                    onCopy={() => handleFieldCopied('gender')}
                  />
                  <CopyableField
                    label="Patient Age"
                    value={`${selectedReceipt.age_years || 0} Y / ${selectedReceipt.age_months || 0} M / ${selectedReceipt.age_days || 0} D`}
                    isCopied={currentCopied.has('age')}
                    onCopy={() => handleFieldCopied('age')}
                  />
                  <CopyableField
                    label="Date of Birth"
                    value={selectedReceipt.dob || ''}
                    isCopied={currentCopied.has('dob')}
                    onCopy={() => handleFieldCopied('dob')}
                  />
                  <CopyableField
                    label="Referred By"
                    value={selectedReceipt.referred_by || 'Self Referral'}
                    isCopied={currentCopied.has('referred_by')}
                    onCopy={() => handleFieldCopied('referred_by')}
                  />
                  <CopyableField
                    label="Total Tests Count"
                    value={String(selectedReceipt.items?.length || selectedReceipt.num_tests || 0)}
                    isCopied={currentCopied.has('num_tests')}
                    onCopy={() => handleFieldCopied('num_tests')}
                  />
                  <CopyableField
                    label="Total MRP"
                    value={`₹${(selectedReceipt.total_mrp || 0).toFixed(0)}`}
                    isCopied={currentCopied.has('total_mrp')}
                    onCopy={() => handleFieldCopied('total_mrp')}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-2 tracking-wider pl-1">
                  Ordered Packages & Tests (Click names to Copy)
                </label>
                <div className="flex flex-wrap gap-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl">
                  {selectedReceipt.items && selectedReceipt.items.length > 0 ? (
                    selectedReceipt.items.map((item, idx) => (
                      <CopyableBadge
                        key={idx}
                        name={item.package_name}
                        codeName={item.code_name}
                        isCopied={currentCopied.has(`test-${idx}`)}
                        onCopy={() => handleFieldCopied(`test-${idx}`)}
                      />
                    ))
                  ) : (
                    <span className="text-slate-400 italic text-xs pl-1">No tests ordered</span>
                  )}
                </div>
              </div>

              {selectedReceipt.notes && (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wider pl-1">
                    Special Instructions / Notes
                  </label>
                  <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800 font-medium font-sans">
                    {selectedReceipt.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => {
                  setSelectedReceipt(null);
                  setShowUploadOverlay(false);
                }}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 font-bold rounded-xl text-xs uppercase tracking-wider transition-all text-slate-650"
              >
                Close workspace
              </button>

              <div className="flex items-center gap-2">
                {/* DEW-1: Trigger Embedded Report Upload Sub-Modal */}
                <button
                  type="button"
                  onClick={() => setShowUploadOverlay(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-100 flex items-center gap-2 active:scale-95"
                >
                  <i className="fa-solid fa-cloud-arrow-up text-xs"></i>
                  <span>Upload Report</span>
                  {patientReports.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-indigo-800 text-indigo-100 text-[9px] font-mono font-black">
                      {patientReports.length}
                    </span>
                  )}
                </button>

                {selectedReceipt.data_entry_done === 0 ? (
                  <button
                    onClick={() => handleMarkDone(selectedReceipt.id)}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-emerald-100 shrink-0 flex items-center gap-2"
                  >
                    <i className="fa-solid fa-check"></i> Mark Complete & Finalize
                  </button>
                ) : (
                  user?.role === 'ADMIN' && (
                    <button
                      onClick={() => handleMarkIncomplete(selectedReceipt.id)}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-red-100 shrink-0 flex items-center gap-2"
                    >
                      <i className="fa-solid fa-triangle-exclamation"></i> Revert
                    </button>
                  )
                )}
              </div>
            </div>

            {/* DEW-1: Embedded Report Upload Sub-Modal Overlay */}
            {showUploadOverlay && (
              <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl z-40 rounded-3xl p-6 overflow-y-auto flex flex-col justify-between animate-in fade-in zoom-in-95 duration-200 border border-slate-800 shadow-2xl">
                <div className="space-y-5">
                  {/* Sub-modal Header */}
                  <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowUploadOverlay(false)}
                        className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 flex items-center justify-center transition-all shrink-0 active:scale-95"
                        title="Back to Patient Credentials"
                      >
                        <i className="fa-solid fa-arrow-left text-xs"></i>
                      </button>
                      <div>
                        <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                          Single-Page Upload Hub
                        </div>
                        <h4 className="text-base font-black text-white leading-none">
                          Upload Lab Reports • <span className="font-mono text-indigo-300">{selectedReceipt.display_doc_id}</span>
                        </h4>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowUploadOverlay(false)}
                      className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-all shrink-0 active:scale-90 border border-slate-700"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>

                  {uploadSuccessMsg && (
                    <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-300 font-bold text-xs flex items-center gap-2 animate-in fade-in">
                      <i className="fa-solid fa-circle-check text-emerald-400"></i>
                      {uploadSuccessMsg}
                    </div>
                  )}

                  {/* Existing Reports Directory for this Patient */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 pl-1">
                      Uploaded Reports Directory ({patientReports.length})
                    </label>
                    {patientReports.length === 0 ? (
                      <div className="p-4 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center text-slate-400 text-xs font-semibold">
                        No reports have been uploaded yet for this patient.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-40 overflow-y-auto pr-1">
                        {patientReports.map((rep) => (
                          <div
                            key={rep.id}
                            className="p-2.5 bg-slate-900/80 border border-slate-700/80 rounded-xl flex items-center justify-between gap-2 shadow-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                {rep.category || 'Report'}
                              </span>
                              <div className="text-xs font-bold text-slate-200 truncate mt-1" title={rep.file_path}>
                                {rep.file_path.split('/').pop()}
                              </div>
                              <div className="text-[9px] text-slate-400 font-mono">
                                {rep.uploaded_at?.split(' | ')[0] || ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleDownloadReport(rep)}
                                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg border border-slate-700 text-xs shadow-xs"
                                title="Download PDF"
                              >
                                <i className="fa-solid fa-download"></i>
                              </button>
                              {user?.role === 'ADMIN' && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteReport(rep.id)}
                                  className="p-1.5 bg-slate-800 hover:bg-red-950 text-red-400 rounded-lg border border-slate-700 text-xs shadow-xs"
                                  title="Delete Report"
                                >
                                  <i className="fa-solid fa-trash-can"></i>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 4 Category Dropzones Panel */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-2 pl-1">
                      Drag and Drop PDF into Category Dropzones
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {categories.map((cat) => {
                        const existing = patientReports.find(r => r.category === cat.id || (!r.category && cat.id === 'Others'));
                        const stagedFile = categoryFiles[cat.id];
                        const isStaged = stagedFile !== null;

                        if (existing) {
                          return (
                            <div
                              key={cat.id}
                              className="flex flex-col items-center justify-between p-3 border border-emerald-500/50 bg-emerald-950/40 rounded-2xl text-center h-32 relative select-none"
                            >
                              <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                                <i className="fa-solid fa-circle-check text-sm"></i>
                              </div>
                              <div>
                                <div className="text-[11px] font-black text-emerald-200 leading-tight">{cat.label}</div>
                                <span className="text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider inline-block mt-0.5">
                                  Uploaded
                                </span>
                              </div>
                              <div className="w-full flex items-center justify-between gap-1 bg-slate-900/90 px-2 py-0.5 rounded border border-emerald-500/40 shadow-xs">
                                <span className="text-[8px] font-mono text-slate-300 truncate text-left">
                                  {existing.file_path.split('/').pop()}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadReport(existing)}
                                  className="text-emerald-400 hover:text-emerald-300 text-[10px]"
                                  title="Download"
                                >
                                  <i className="fa-solid fa-download"></i>
                                </button>
                              </div>
                            </div>
                          );
                        }

                        const borderStyle = isStaged 
                          ? 'border-indigo-500 bg-indigo-950/50 ring-2 ring-indigo-500/50 shadow-inner' 
                          : 'border-slate-700/80 hover:border-indigo-500/80 bg-slate-900/40 hover:bg-slate-900/70';

                        return (
                          <div
                            key={cat.id}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, cat.id)}
                            onClick={() => handleDropzoneClick(cat.id)}
                            className={`flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-2xl cursor-pointer transition-all text-center space-y-1 h-32 relative ${borderStyle}`}
                          >
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                              isStaged ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {isStaged ? (
                                <i className="fa-solid fa-check text-xs"></i>
                              ) : (
                                <i className={`fa-solid ${cat.icon} text-xs`}></i>
                              )}
                            </div>
                            <div className="text-[10.5px] font-bold text-slate-200 leading-tight">
                              {cat.label}
                            </div>
                            {isStaged ? (
                              <div className="w-full flex items-center justify-between gap-1 bg-slate-900/90 px-2 py-0.5 rounded border border-indigo-500/40">
                                <span className="text-[8px] font-mono text-indigo-300 truncate text-left font-bold">
                                  {stagedFile.name}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCategoryFiles(prev => ({ ...prev, [cat.id]: null }));
                                  }}
                                  className="text-red-400 hover:text-red-300 text-[10px]"
                                  title="Remove"
                                >
                                  <i className="fa-solid fa-xmark"></i>
                                </button>
                              </div>
                            ) : (
                              <span className="text-[8.5px] text-slate-400 font-medium">
                                Drag PDF or click
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sub-modal Footer */}
                <div className="pt-4 border-t border-slate-800 flex justify-between items-center gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowUploadOverlay(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs uppercase tracking-wider transition-all border border-slate-700"
                  >
                    Back to Patient Details
                  </button>

                  <button
                    type="button"
                    disabled={uploading || Object.values(categoryFiles).every(f => f === null)}
                    onClick={handleUploadReports}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs uppercase tracking-wider transition-all shadow-md shadow-indigo-950 flex items-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-cloud-arrow-up"></i>
                        Upload Staged Files
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fixed Position Tooltip Portal (Above Everything) */}
      {hoveredTooltip && (
        <div
          style={{
            top: `${hoveredTooltip.rect.top - 25}px`,
            left: `${hoveredTooltip.rect.left}px`,
            transform: 'translateY(-100%)'
          }}
          className="fixed z-[999999] pointer-events-none bg-slate-950/95 backdrop-blur-md text-white rounded-2xl p-3 px-3.5 shadow-2xl border-2 border-slate-700 whitespace-nowrap animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="text-[12px] font-bold text-white flex items-center gap-1.5 tracking-wide">
            <i className="fa-solid fa-user-tie text-indigo-400 text-[10px]"></i>
            <span>{hoveredTooltip.clientName}</span>
          </div>
          <div className="text-[10px] font-semibold text-indigo-300 font-mono mt-1 pt-1 border-t border-slate-800 flex items-center gap-1.5">
            <span className="text-slate-400 text-[9px] uppercase font-sans tracking-wider font-extrabold">Client UID:</span>
            <span className="text-emerald-400 font-black">{hoveredTooltip.uid}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataEntryPortal;
