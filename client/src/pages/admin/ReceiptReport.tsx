import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { User, Document } from '../../types';
import SearchableDropdown from '../../components/SearchableDropdown';
import CleanSelect from '../../components/CleanSelect';

const ReceiptReport: React.FC = () => {
    const [clients, setClients] = useState<User[]>([]);
    const [receipts, setReceipts] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);

    // Filter states
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [startDate, setStartDate] = useState<string>('');
    const [endDate, setEndDate] = useState<string>('');
    const [typeFilter, setTypeFilter] = useState<'ALL' | 'B2B' | 'WALK_IN'>('ALL');
    const [paymentFilter, setPaymentFilter] = useState<string>('');
    const [sizeFilter, setSizeFilter] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Custom interactive SVG tooltip state
    const [tooltip, setTooltip] = useState<{
        x: number;
        y: number;
        show: boolean;
        date: string;
        amount: number;
        mrp: number;
        b2b: number;
        count: number;
        profit: number;
    }>({
        x: 0,
        y: 0,
        show: false,
        date: '',
        amount: 0,
        mrp: 0,
        b2b: 0,
        count: 0,
        profit: 0
    });

    const [activeTab, setActiveTab] = useState<'BI' | 'LEDGER'>('BI');
    const [showClientModal, setShowClientModal] = useState(false);
    const [modalTimeframe, setModalTimeframe] = useState<number | 'lifetime'>('lifetime');
    const [periodRanges, setPeriodRanges] = useState<(number | 'lifetime')[]>([3, 6, 12, 'lifetime']);
    const [matrixMetric, setMatrixMetric] = useState<'B2B' | 'MRP'>('B2B');
    const [biMetrics, setBiMetrics] = useState<{ mostUsedTests: any[]; mostUsedLabs: any[] } | null>(null);

    // Test Breakup Modal State
    const [breakupReceipt, setBreakupReceipt] = useState<Document | null>(null);
    const [breakupItems, setBreakupItems] = useState<any[]>([]);
    const [isLoadingBreakup, setIsLoadingBreakup] = useState(false);

    const handleRowClick = async (r: Document) => {
        setBreakupReceipt(r);
        setIsLoadingBreakup(true);
        try {
            const fullReceipt = await apiService.getReceiptById(r.id);
            setBreakupItems(fullReceipt.items || []);
        } catch (err) {
            console.error("Failed to load test breakup", err);
        } finally {
            setIsLoadingBreakup(false);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [fetchedClients, fetchedReceipts, fetchedMetrics] = await Promise.all([
                    apiService.getClientWallets(),
                    apiService.getReceipts(),
                    apiService.getBIMetrics()
                ]);
                setClients(fetchedClients);
                setReceipts(fetchedReceipts);
                setBiMetrics(fetchedMetrics);
            } catch (err) {
                console.error("Failed to load report data", err);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // Filter logic
    const filteredReceipts = useMemo(() => {
        return receipts.filter(r => {
            // Search query filter
            if (searchQuery) {
                const q = searchQuery.toLowerCase().trim();
                const matchesSearch =
                    r.customer_name.toLowerCase().includes(q) ||
                    r.display_doc_id.toLowerCase().includes(q) ||
                    (r.display_customer_id && r.display_customer_id.toLowerCase().includes(q));
                if (!matchesSearch) return false;
            }

            // B2B Client specific selection filter
            if (selectedClientId) {
                const clientIdNum = parseInt(selectedClientId, 10);
                const matchesClient = r.acting_as_client_id === clientIdNum ||
                    (!r.acting_as_client_id && r.created_by_user_id === clientIdNum);
                if (!matchesClient) return false;
            }

            // Type filter (B2B vs Walk-in)
            if (typeFilter === 'B2B') {
                if (!r.acting_as_client_id) return false;
            } else if (typeFilter === 'WALK_IN') {
                if (r.acting_as_client_id) return false;
            }

            // Payment method filter
            if (paymentFilter) {
                if (paymentFilter === 'B2B_WALLET') {
                    if (!r.acting_as_client_id) return false;
                } else {
                    if (r.acting_as_client_id) return false; // Non-B2B general payments
                    if (r.payment_method?.toUpperCase() !== paymentFilter) return false;
                }
            }

            // Size / value bucket filter
            if (sizeFilter) {
                const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
                if (sizeFilter === 'SMALL' && amt >= 1000) return false;
                if (sizeFilter === 'MEDIUM' && (amt < 1000 || amt > 2500)) return false;
                if (sizeFilter === 'PREMIUM' && (amt < 2500 || amt > 5000)) return false;
                if (sizeFilter === 'ENTERPRISE' && amt <= 5000) return false;
            }

            if (startDate || endDate) {
                const parts = r.display_date.split(' ');
                if (parts[0]) {
                    const [day, month, year] = parts[0].split('/').map(Number);
                    const rDate = new Date(year, month - 1, day);

                    if (startDate) {
                        const start = new Date(startDate);
                        start.setHours(0, 0, 0, 0);
                        if (rDate < start) return false;
                    }
                    if (endDate) {
                        const end = new Date(endDate);
                        end.setHours(23, 59, 59, 999);
                        if (rDate > end) return false;
                    }
                }
            }
            return true;
        });
    }, [receipts, selectedClientId, startDate, endDate, typeFilter, paymentFilter, sizeFilter, searchQuery]);

    // Grouping & Chart Datasets
    const revenueByDate = useMemo(() => {
        const groups: {
            [date: string]: {
                amount: number;
                mrp: number;
                b2b: number;
                profit: number;
                count: number;
            }
        } = {};

        filteredReceipts.forEach(r => {
            const dateStr = r.display_date.split(' ')[0]; // DD/MM/YYYY
            const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
            const mrp = r.total_mrp || amt;
            const b2b = r.b2b_cost || 0;
            const motherB2B = r.mother_b2b_cost || 0;
            const profit = r.acting_as_client_id ? (b2b - motherB2B) : (amt - motherB2B);

            if (!groups[dateStr]) {
                groups[dateStr] = { amount: 0, mrp: 0, b2b: 0, profit: 0, count: 0 };
            }
            groups[dateStr].amount += amt;
            groups[dateStr].mrp += mrp;
            groups[dateStr].b2b += b2b;
            groups[dateStr].profit += profit;
            groups[dateStr].count += 1;
        });

        return Object.entries(groups)
            .map(([date, data]) => {
                const [d, m, y] = date.split('/').map(Number);
                return {
                    date,
                    dateObj: new Date(y, m - 1, d),
                    ...data
                };
            })
            .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
    }, [filteredReceipts]);

    const revenueByClient = useMemo(() => {
        const groups: {
            [client: string]: {
                mrp: number;
                b2b: number;
                patients: number;
                amount: number;
            }
        } = {};

        filteredReceipts.forEach(r => {
            const client = r.created_by_user || 'Direct Entry';
            const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
            const mrp = r.total_mrp || amt;
            const b2b = r.b2b_cost || 0;

            const cleanName = client.split(' [M.ENTRY')[0];
            if (!groups[cleanName]) {
                groups[cleanName] = { mrp: 0, b2b: 0, patients: 0, amount: 0 };
            }
            groups[cleanName].mrp += mrp;
            groups[cleanName].b2b += r.acting_as_client_id ? b2b : amt;
            groups[cleanName].patients += 1;
            groups[cleanName].amount += amt;
        });

        return Object.entries(groups)
            .map(([client, data]) => ({ client, ...data }))
            .sort((a, b) => b.b2b - a.b2b);
    }, [filteredReceipts]);

    const monthlyBIStats = useMemo(() => {
        const groups: {
            [month: string]: {
                b2b: number;
                profit: number;
                patients: number;
                mrp: number;
            }
        } = {};

        filteredReceipts.forEach(r => {
            const parts = r.display_date.split(' ');
            if (parts[0]) {
                const [, month, year] = parts[0].split('/'); // DD/MM/YYYY
                const monthKey = `${year}-${month}`; // YYYY-MM

                const b2b = r.b2b_cost || 0;
                const motherB2B = r.mother_b2b_cost || 0;
                const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
                const mrp = r.total_mrp || amt;
                const profit = r.acting_as_client_id ? (b2b - motherB2B) : (amt - motherB2B);

                if (!groups[monthKey]) {
                    groups[monthKey] = { b2b: 0, profit: 0, patients: 0, mrp: 0 };
                }
                groups[monthKey].b2b += r.acting_as_client_id ? b2b : amt;
                groups[monthKey].mrp += mrp;
                groups[monthKey].profit += profit;
                groups[monthKey].patients += 1;
            }
        });

        return Object.entries(groups)
            .map(([month, data]) => ({ month, ...data }))
            .sort((a, b) => a.month.localeCompare(b.month)); // Oldest first
    }, [filteredReceipts]);

    const modalClientStats = useMemo(() => {
        let targetReceipts = filteredReceipts;
        if (modalTimeframe !== 'lifetime') {
            const now = new Date();
            const cutoffDate = new Date(now.getFullYear(), now.getMonth() - modalTimeframe, 1);
            cutoffDate.setHours(0, 0, 0, 0);

            targetReceipts = filteredReceipts.filter(r => {
                const parts = r.display_date.split(' ');
                if (parts[0]) {
                    const [day, month, year] = parts[0].split('/').map(Number);
                    const rDate = new Date(year, month - 1, day);
                    return rDate >= cutoffDate;
                }
                return false;
            });
        }

        const groups: {
            [client: string]: {
                mrp: number;
                b2b: number;
                patients: number;
            }
        } = {};

        targetReceipts.forEach(r => {
            const client = r.created_by_user || 'Direct Entry';
            const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
            const mrp = r.total_mrp || amt;
            const b2b = r.b2b_cost || 0;

            const cleanName = client.split(' [M.ENTRY')[0];
            if (!groups[cleanName]) {
                groups[cleanName] = { mrp: 0, b2b: 0, patients: 0 };
            }
            groups[cleanName].mrp += mrp;
            groups[cleanName].b2b += r.acting_as_client_id ? b2b : amt;
            groups[cleanName].patients += 1;
        });

        return Object.entries(groups)
            .map(([client, data]) => ({ client, ...data }))
            .sort((a, b) => b.b2b - a.b2b);
    }, [filteredReceipts, modalTimeframe]);

    const ticketSizeBuckets = useMemo(() => {
        const buckets = {
            'Small (<₹1k)': 0,
            'Medium (₹1k-₹2.5k)': 0,
            'Premium (₹2.5k-₹5k)': 0,
            'Enterprise (>₹5k)': 0
        };
        filteredReceipts.forEach(r => {
            const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
            if (amt < 1000) buckets['Small (<₹1k)']++;
            else if (amt <= 2500) buckets['Medium (₹1k-₹2.5k)']++;
            else if (amt <= 5000) buckets['Premium (₹2.5k-₹5k)']++;
            else buckets['Enterprise (>₹5k)']++;
        });
        return Object.entries(buckets).map(([name, count]) => ({ name, count }));
    }, [filteredReceipts]);

    // Calculate metrics
    const totalCount = filteredReceipts.length;
    const metrics = useMemo(() => {
        let amount = 0;
        let mrp = 0;
        let b2bSubmissions = 0; // sum of b2b_cost for B2B client receipts
        let b2bPatientBillings = 0; // sum of amount_final for B2B client receipts
        let directRetail = 0; // sum of amount_final for walk-in receipts
        let motherB2BTotal = 0; // sum of mother_b2b_cost for all receipts

        filteredReceipts.forEach(r => {
            const amt = r.amount_final || parseFloat(r.display_amount.replace('₹', '').replace(/,/g, '')) || 0;
            const mVal = r.total_mrp || amt;
            const bVal = r.b2b_cost || 0;
            const motherB2B = r.mother_b2b_cost || 0;

            amount += amt;
            mrp += mVal;
            motherB2BTotal += motherB2B;

            if (r.acting_as_client_id) {
                b2bSubmissions += bVal;
                b2bPatientBillings += amt;
            } else {
                directRetail += amt;
            }
        });

        const totalB2B = b2bSubmissions + directRetail;
        const totalProfit = totalB2B - motherB2BTotal;

        return { 
            amount, 
            mrp, 
            b2bSubmissions, 
            b2bPatientBillings, 
            directRetail, 
            motherB2BTotal,
            totalB2B,
            netProfit: totalProfit, 
            average: totalCount > 0 ? amount / totalCount : 0 
        };
    }, [filteredReceipts, totalCount]);

    const totalB2B = metrics.totalB2B;
    const totalMotherB2B = metrics.motherB2BTotal;
    const totalProfit = metrics.netProfit;

    // Custom SVG Line Chart for revenue trend
    const renderLineChart = () => {
        if (revenueByDate.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400">
                    <i className="fa-solid fa-chart-line text-2xl mb-2 opacity-55"></i>
                    <p className="text-xs font-semibold uppercase tracking-wider italic">No timeline data available</p>
                </div>
            );
        }

        const width = 600;
        const height = 325;
        const paddingLeft = 40;
        const paddingRight = 20;
        const paddingTop = 20;
        const paddingBottom = 30;

        const minAmt = 0;
        const maxAmt = Math.max(...revenueByDate.map(d => d.amount), 1000) * 1.1; // 10% ceiling room

        const points = revenueByDate.map((d, i) => {
            const x = paddingLeft + (i / (revenueByDate.length - 1 || 1)) * (width - paddingLeft - paddingRight);
            const y = height - paddingBottom - ((d.amount - minAmt) / (maxAmt - minAmt)) * (height - paddingTop - paddingBottom);
            return { x, y, ...d };
        });

        let pathD = "";
        if (points.length > 0) {
            pathD = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
        }

        let areaD = "";
        if (points.length > 0) {
            areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
        }

        return (
            <div className="relative z-20 overflow-visible">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
                    <defs>
                        <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>

                    <style>{`
                        .chart-point {
                            transition: r 0.15s ease-in-out, stroke-width 0.15s ease-in-out, fill 0.15s ease-in-out;
                        }
                        .chart-point:hover {
                            r: 7px;
                            stroke-width: 3.5px;
                            fill: #6366f1;
                            stroke: #ffffff;
                        }
                    `}</style>

                    {/* Horizontal grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, index) => {
                        const y = paddingTop + ratio * (height - paddingTop - paddingBottom);
                        const labelVal = maxAmt - ratio * (maxAmt - minAmt);
                        return (
                            <g key={index}>
                                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="#f1f5f9" strokeWidth="1.5" />
                                <text x={paddingLeft - 8} y={y + 3} fill="#94a3b8" fontSize="8" fontWeight="bold" textAnchor="end">
                                    ₹{labelVal >= 1000 ? `${(labelVal / 1000).toFixed(1)}k` : labelVal.toFixed(0)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Area under curve */}
                    {areaD && <path d={areaD} fill="url(#areaGradient)" className="transition-all duration-500 ease-in-out" />}

                    {/* Line path */}
                    {pathD && <path d={pathD} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-500 ease-in-out" />}

                    {/* Data dots */}
                    {points.map((p, i) => (
                        <g
                            key={i}
                            className="group cursor-pointer"
                            onMouseEnter={() => {
                                setTooltip({
                                    x: p.x,
                                    y: p.y,
                                    show: true,
                                    date: p.date,
                                    amount: p.amount,
                                    mrp: p.mrp,
                                    b2b: p.b2b,
                                    count: p.count,
                                    profit: p.profit
                                });
                            }}
                            onMouseLeave={() => {
                                setTooltip(prev => ({ ...prev, show: false }));
                            }}
                        >
                            <circle cx={p.x} cy={p.y} r="4.5" fill="#ffffff" stroke="#4f46e5" strokeWidth="2.5" className="chart-point" />
                        </g>
                    ))}

                    {/* X Axis Labels */}
                    {points.map((p, i) => {
                        const step = Math.max(1, Math.ceil(points.length / 6));
                        if (i % step !== 0 && i !== points.length - 1) return null;
                        return (
                            <text key={i} x={p.x} y={height - 8} fill="#94a3b8" fontSize="8" fontWeight="black" textAnchor="middle">
                                {p.date.split('/').slice(0, 2).join('/')}
                            </text>
                        );
                    })}
                </svg>

                {/* Custom hovering interactive tooltip modal */}
                {tooltip.show && (
                    <div
                        className="absolute bg-slate-950/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-2xl border border-slate-800/80 pointer-events-none transition-all duration-150 z-50"
                        style={{
                            left: `${(tooltip.x / width) * 100}%`,
                            top: `${(tooltip.y / height) * 100 - 10}%`,
                            transform: 'translate(-50%, -100%)',
                            minWidth: '220px'
                        }}
                    >
                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between items-center border-b border-slate-850 pb-1.5 mb-1.5">
                                <span className="font-mono text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">{tooltip.date}</span>
                                <span className="bg-indigo-500/25 text-indigo-300 text-[8px] px-2 py-0.5 rounded-full font-black uppercase">
                                    {tooltip.count} Receipt{tooltip.count > 1 ? 's' : ''}
                                </span>
                            </div>

                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-medium">MRP Billing:</span>
                                <span className="font-extrabold text-white">₹{tooltip.mrp.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-400 font-medium">B2B Base Cost:</span>
                                <span className="font-extrabold text-slate-300">₹{tooltip.b2b.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            </div>

                            <div className="border-t border-slate-800/80 pt-1.5 flex justify-between items-center">
                                <span className="text-emerald-400 font-extrabold flex items-center gap-1">
                                    <i className="fa-solid fa-chart-line text-[9px]"></i>
                                    Net Profit:
                                </span>
                                <span className="font-black text-emerald-400 text-sm">
                                    ₹{tooltip.profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                </span>
                            </div>

                            <div className="flex justify-between items-center text-[10px] text-slate-500 italic mt-1 font-semibold pt-1 border-t border-slate-850">
                                <span>Collected Cash:</span>
                                <span>₹{tooltip.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    // Custom SVG Bar Chart for clients comparison
    const renderClientChart = () => {
        if (revenueByClient.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400">
                    <i className="fa-solid fa-users text-2xl mb-2 opacity-55"></i>
                    <p className="text-xs font-semibold uppercase tracking-wider italic">No client share data available</p>
                </div>
            );
        }

        const topClients = revenueByClient.slice(0, 5);
        const maxVal = Math.max(...topClients.map(c => c.b2b), 100);

        return (
            <div className="space-y-3.5">
                {topClients.map((item, index) => {
                    const pct = (item.b2b / maxVal) * 100;
                    return (
                        <div key={index} className="space-y-1">
                            <div className="flex justify-between items-center text-xs font-bold">
                                <span className="text-slate-700 truncate max-w-[180px]">{item.client}</span>
                                <span className="text-indigo-600 font-black">₹{item.b2b.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                            </div>
                            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                    className="bg-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                                    style={{ width: `${pct}%` }}
                                ></div>
                            </div>
                        </div>
                    );
                })}
                <div className="pt-2 text-center border-t border-slate-100 mt-2">
                    <button 
                        type="button" 
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowClientModal(true);
                        }}
                        className="text-[10px] font-black text-indigo-600 hover:text-indigo-855 transition-colors uppercase tracking-widest"
                    >
                        EXPAND MODAL
                    </button>
                </div>
            </div>
        );
    };

    const getStatsForWindow = (monthsCount: number | 'lifetime', metric: 'B2B' | 'MRP' = 'B2B') => {
        if (monthlyBIStats.length === 0) return { volume: 0, profit: 0, growth: 0, hasData: false };

        const len = monthlyBIStats.length;
        const currentPeriodMonths = monthsCount === 'lifetime' ? len : Math.min(monthsCount, len);
        
        const currentSlice = monthlyBIStats.slice(len - currentPeriodMonths);
        const volume = currentSlice.reduce((sum, m) => sum + (metric === 'B2B' ? m.b2b : (m.mrp || 0)), 0);
        const profit = currentSlice.reduce((sum, m) => sum + m.profit, 0);

        let growth = 0;
        let hasData = false;
        if (len > 0) {
            const currentMonthVal = metric === 'B2B' ? monthlyBIStats[len - 1].b2b : (monthlyBIStats[len - 1].mrp || 0);
            let priorIdx = 0;
            if (monthsCount !== 'lifetime') {
                priorIdx = len - 1 - monthsCount;
            }
            if (priorIdx >= 0 && priorIdx < len) {
                const priorVal = metric === 'B2B' ? monthlyBIStats[priorIdx].b2b : (monthlyBIStats[priorIdx].mrp || 0);
                if (priorVal > 0) {
                    growth = ((currentMonthVal - priorVal) / priorVal) * 100;
                    hasData = true;
                } else if (currentMonthVal > 0) {
                    growth = 100;
                    hasData = true;
                }
            } else if (monthsCount === 'lifetime' && len > 1) {
                const priorVal = metric === 'B2B' ? monthlyBIStats[0].b2b : (monthlyBIStats[0].mrp || 0);
                if (priorVal > 0) {
                    growth = ((currentMonthVal - priorVal) / priorVal) * 100;
                    hasData = true;
                }
            }
        }

        return { volume, profit, growth, hasData };
    };

    const renderLabUtilizationChart = () => {
        if (!biMetrics || biMetrics.mostUsedLabs.length === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400">
                    <i className="fa-solid fa-house-chimney-medical text-2xl mb-2 opacity-55"></i>
                    <p className="text-xs font-semibold uppercase tracking-wider italic">No laboratory data logged yet.</p>
                </div>
            );
        }

        const totalLabsCount = biMetrics.mostUsedLabs.reduce((sum, l) => sum + l.count, 0);
        let accumulatedPercent = 0;
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#3b82f6', '#8b5cf6', '#14b8a6'];

        return (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <div className="relative w-28 h-28 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        {/* Background ring */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />

                        {biMetrics.mostUsedLabs.map((lab, idx) => {
                            const pct = (lab.count / totalLabsCount) * 100;
                            if (pct === 0) return null;
                            const strokeDasharray = `${pct} ${100 - pct}`;
                            const strokeDashoffset = 100 - accumulatedPercent;
                            accumulatedPercent += pct;

                            return (
                                <circle
                                    key={idx}
                                    cx="18"
                                    cy="18"
                                    r="15.915"
                                    fill="none"
                                    stroke={colors[idx % colors.length]}
                                    strokeWidth="3.2"
                                    strokeDasharray={strokeDasharray}
                                    strokeDashoffset={strokeDashoffset}
                                    className="transition-all duration-500 ease-in-out"
                                />
                            );
                        })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-sm font-black text-slate-800">{totalLabsCount}</span>
                        <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest leading-none">Total Labs</span>
                    </div>
                </div>
                {/* Legend list */}
                <div className="flex-1 space-y-1.5 w-full">
                    {biMetrics.mostUsedLabs.map((lab, idx) => {
                        const pct = totalLabsCount > 0 ? (lab.count / totalLabsCount) * 100 : 0;
                        const cleanName = lab.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount)?\)/i, '').trim();
                        return (
                            <div key={idx} className="flex items-center justify-between text-[11px] leading-tight">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colors[idx % colors.length] }}></span>
                                    <span className="font-bold text-slate-600 truncate">{cleanName}</span>
                                </div>
                                <span className="font-black text-slate-850 shrink-0 font-mono ml-2">
                                    {lab.count} ({pct.toFixed(0)}%)
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Custom SVG Ticket Size Donut chart
    const renderTicketChart = () => {
        const totalTickets = ticketSizeBuckets.reduce((sum, t) => sum + t.count, 0);
        if (totalTickets === 0) {
            return (
                <div className="flex flex-col items-center justify-center h-48 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-slate-400">
                    <i className="fa-solid fa-ticket text-2xl mb-2 opacity-55"></i>
                    <p className="text-xs font-semibold uppercase tracking-wider italic">No sales breakdown available</p>
                </div>
            );
        }

        let accumulatedPercent = 0;
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899'];

        return (
            <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                <div className="relative w-32 h-32 flex-shrink-0">
                    <svg viewBox="0 0 36 36" className="w-full h-full transform -rotate-90">
                        {/* Background ring */}
                        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="3" />

                        {ticketSizeBuckets.map((bucket, idx) => {
                            const pct = (bucket.count / totalTickets) * 100;
                            if (pct === 0) return null;
                            const strokeDasharray = `${pct} ${100 - pct}`;
                            const strokeDashoffset = 100 - accumulatedPercent;
                            accumulatedPercent += pct;

                            return (
                                <circle
                                    key={idx}
                                    cx="18"
                                    cy="18"
                                    r="15.915"
                                    fill="none"
                                    stroke={colors[idx % colors.length]}
                                    strokeWidth="3.2"
                                    strokeDasharray={strokeDasharray}
                                    strokeDashoffset={strokeDashoffset}
                                    className="transition-all duration-500 ease-in-out"
                                />
                            );
                        })}
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-base font-black text-slate-800">{totalTickets}</span>
                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Sales</span>
                    </div>
                </div>

                <div className="flex-1 space-y-2 w-full">
                    {ticketSizeBuckets.map((bucket, idx) => {
                        const pct = totalTickets > 0 ? (bucket.count / totalTickets) * 100 : 0;
                        return (
                            <div key={idx} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 font-semibold text-slate-600">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[idx % colors.length] }}></div>
                                    <span>{bucket.name}</span>
                                </div>
                                <span className="font-bold text-slate-800">
                                    {bucket.count} ({pct.toFixed(0)}%)
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 print:p-0 print:max-w-full">

            {/* Header Banner - Hidden on print */}
            <div className="bg-slate-900 rounded-3xl p-4 sm:p-5 text-white relative overflow-hidden shadow-lg border border-slate-800 flex flex-row justify-between items-center gap-4 print:hidden">
                <div className="absolute -right-24 -bottom-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
                <div className="absolute -left-16 -top-16 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl"></div>

                <div className="relative z-10">
                    <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2.5">
                        <i className="fa-solid fa-chart-pie text-indigo-400"></i>
                        Business Intelligence
                    </h1>
                </div>

                <Link
                    to="/admin-dashboard"
                    className="relative z-10 px-4 py-2 bg-slate-800 hover:bg-slate-700/80 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 border border-slate-700 whitespace-nowrap"
                >
                    <i className="fa-solid fa-arrow-left"></i>
                    Back to Dashboard
                </Link>
            </div>



            {/* Tab Navigation */}
            <div className="flex gap-4 border-b border-gray-300 pb-px print:hidden">
                <button
                    onClick={() => setActiveTab('BI')}
                    className={`pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                        activeTab === 'BI'
                            ? 'border-black text-black font-black'
                            : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}
                >
                    <i className="fa-solid fa-chart-pie mr-2"></i>
                    Sales & Revenue BI
                </button>
                <button
                    onClick={() => setActiveTab('LEDGER')}
                    className={`pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
                        activeTab === 'LEDGER'
                            ? 'border-black text-black font-black'
                            : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}
                >
                    <i className="fa-solid fa-wallet mr-2"></i>
                    Franchise Ledger Statements
                </button>
            </div>

            {activeTab === 'BI' ? (
                <>
                    {/* Filter Control Box */}
                    <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4 relative z-30">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-4 bg-indigo-600 rounded-full"></div>
                            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Filter & Refine Matrix</h3>
                        </div>

                        {/* Search Bar */}
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Patient, Customer, or Receipt</label>
                                <div className="relative">
                                    <i className="fa-solid fa-magnifying-glass absolute left-3.5 top-3.5 text-slate-400 text-xs"></i>
                                    <input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Type patient name, customer ID (e.g. CUST-0000000001), or receipt ID (e.g. RCPT-000001)..."
                                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-50/50 outline-none text-xs font-bold text-slate-700 transition-all font-sans"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
                            {/* B2B Client Selector */}
                            <div className="space-y-1.5 lg:col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">B2B Client / Operator</label>
                                <SearchableDropdown
                                    options={[
                                        { value: '', label: 'All Registered Clients' },
                                        ...clients.map(c => ({ value: c.id.toString(), label: `${c.alias || c.username} (UID: ${c.id})` }))
                                    ]}
                                    value={selectedClientId}
                                    onChange={(val) => setSelectedClientId(val)}
                                    placeholder="Type client alias or name..."
                                />
                            </div>

                            {/* Receipt Type */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Receipt Type</label>
                                <CleanSelect
                                    options={[
                                        { value: 'ALL', label: 'All Billings' },
                                        { value: 'B2B', label: 'B2B Clients Only' },
                                        { value: 'WALK_IN', label: 'Direct Walk-ins Only' }
                                    ]}
                                    value={typeFilter}
                                    onChange={(val) => setTypeFilter(val as any)}
                                />
                            </div>

                            {/* Payment Method */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Payment Method</label>
                                <CleanSelect
                                    options={[
                                        { value: '', label: 'All' },
                                        { value: 'CASH', label: 'Cash Only' },
                                        { value: 'UPI', label: 'UPI Only' },
                                        { value: 'B2B_WALLET', label: 'B2B Wallet Only' }
                                    ]}
                                    value={paymentFilter}
                                    onChange={(val) => setPaymentFilter(val)}
                                />
                            </div>

                            {/* Value Size */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Value Size</label>
                                <CleanSelect
                                    options={[
                                        { value: '', label: 'All Sizes' },
                                        { value: 'SMALL', label: 'Small (<₹1k)' },
                                        { value: 'MEDIUM', label: 'Medium (₹1k-₹2.5k)' },
                                        { value: 'PREMIUM', label: 'Premium (₹2.5k-₹5k)' },
                                        { value: 'ENTERPRISE', label: 'Enterprise (>₹5k)' }
                                    ]}
                                    value={sizeFilter}
                                    onChange={(val) => setSizeFilter(val)}
                                />
                            </div>

                            {/* Start Date */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Period From</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full p-2 border border-gray-200 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-50/50 outline-none text-xs font-bold text-slate-700 transition-all h-[38px]"
                                />
                            </div>

                            {/* End Date */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Period To</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full p-2 border border-gray-200 rounded-xl bg-slate-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-50/50 outline-none text-xs font-bold text-slate-700 transition-all h-[38px]"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Metrics Dashboard */}
                    {loading ? (
                        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center shadow-lg flex flex-col items-center justify-center gap-4">
                            <div className="w-12 h-12 rounded-full border-4 border-indigo-600/20 border-t-indigo-600 animate-spin"></div>
                            <span className="text-xs font-bold uppercase tracking-widest text-slate-400 italic">Processing statements...</span>
                        </div>
                    ) : (
                        <>
                            {/* Highlight Metrics Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

                                {/* Card 1: Total Patients */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex justify-between items-center animate-fade-in">
                                    <div className="space-y-1.5 min-w-0">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total Patients</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold text-slate-800">{totalCount}</span>
                                            <span className="text-[9px] font-medium text-slate-400 uppercase">patients</span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-base shrink-0">
                                        <i className="fa-solid fa-users"></i>
                                    </div>
                                </div>

                                {/* Card 2: Total MRP */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex justify-between items-center animate-fade-in">
                                    <div className="space-y-1.5 min-w-0">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total MRP</span>
                                        <div className="flex items-baseline">
                                            <span className="text-2xl font-bold text-slate-800">₹{metrics.mrp.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-base shrink-0">
                                        <i className="fa-solid fa-file-invoice-dollar"></i>
                                    </div>
                                </div>

                                {/* Card 3: Total B2B */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex justify-between items-center animate-fade-in">
                                    <div className="space-y-1.5 min-w-0">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total B2B</span>
                                        <div className="flex items-baseline">
                                            <span className="text-2xl font-bold text-slate-800">₹{totalB2B.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center text-base shrink-0">
                                        <i className="fa-solid fa-cart-shopping"></i>
                                    </div>
                                </div>

                                {/* Card 4: Total Lab Payment (Mother list) */}
                                <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-sm flex justify-between items-center animate-fade-in">
                                    <div className="space-y-1.5 min-w-0">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block truncate">Total Lab Payment (Mother list)</span>
                                        <div className="flex items-baseline">
                                            <span className="text-2xl font-bold text-slate-800">₹{totalMotherB2B.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-base shrink-0">
                                        <i className="fa-solid fa-flask-vial"></i>
                                    </div>
                                </div>

                                {/* Card 5: Net Operational Profit */}
                                <div className="bg-emerald-50/40 p-5 rounded-3xl border border-emerald-100 shadow-sm flex justify-between items-center animate-fade-in">
                                    <div className="space-y-1.5 min-w-0">
                                        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block truncate">Net Operational Profit</span>
                                        <div className="flex items-baseline">
                                            <span className="text-2xl font-bold text-emerald-800">₹{totalProfit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                                        </div>
                                    </div>
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-base shrink-0">
                                        <i className="fa-solid fa-calculator"></i>
                                    </div>
                                </div>

                            </div>

                            {/* Custom SVG Charts Panel */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

                                {/* Line Chart Card */}
                                <div className="lg:col-span-8 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <i className="fa-solid fa-chart-line text-indigo-600 text-xs"></i>
                                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Revenue Stream Timeline</h4>
                                        </div>
                                        <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full uppercase">Dynamic Trend</span>
                                    </div>
                                    <div className="pt-2">
                                        {renderLineChart()}
                                    </div>
                                </div>

                                {/* Side breakdown Charts */}
                                <div className="lg:col-span-4 grid grid-cols-1 gap-6">

                                    {/* Bar Chart / Share Card */}
                                    <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2">
                                                <i className="fa-solid fa-ranking-star text-indigo-600 text-xs"></i>
                                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Top client allocations</h4>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setShowClientModal(true)}
                                                className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-widest bg-slate-50 hover:bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-150"
                                            >
                                                Details
                                            </button>
                                        </div>
                                        <div className="pt-1 cursor-pointer" onClick={() => setShowClientModal(true)}>
                                            {renderClientChart()}
                                        </div>
                                    </div>

                                    {/* Ticket Size Donut Card */}
                                    <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                                        <div className="flex items-center gap-2">
                                            <i className="fa-solid fa-sliders text-indigo-600 text-xs"></i>
                                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Sales volume segments</h4>
                                        </div>
                                        <div className="pt-1">
                                            {renderTicketChart()}
                                        </div>
                                    </div>

                                </div>

                            </div>

                            {/* Multi-Period BI Performance Matrix */}
                            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                                    <div className="flex items-center gap-2">
                                        <i className="fa-solid fa-clock-rotate-left text-indigo-600 text-sm"></i>
                                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Multi-Period Performance Matrix</h4>
                                    </div>
                                    <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-xl border border-slate-150">
                                        <button
                                            type="button"
                                            onClick={() => setMatrixMetric('B2B')}
                                            className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                                                matrixMetric === 'B2B'
                                                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-150'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            B2B Revenue
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMatrixMetric('MRP')}
                                            className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${
                                                matrixMetric === 'MRP'
                                                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-150'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            Gross MRP
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-visible rounded-2xl border border-slate-150">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-150 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                                                <th className="p-4 pl-5">Timeframe</th>
                                                <th className="p-4 text-right">Target Volume ({matrixMetric})</th>
                                                <th className="p-4 text-right">Net Operational Profit</th>
                                                <th className="p-4 text-right">Business Growth %</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-sm font-bold text-slate-700">
                                            {periodRanges.map((months, idx) => {
                                                const stats = getStatsForWindow(months, matrixMetric);
                                                return (
                                                    <tr key={idx} style={{ position: 'relative', zIndex: 40 - idx }} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="p-4 pl-5">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-slate-800 font-extrabold">
                                                                    {months === 'lifetime' ? 'Lifetime Cumulative' : 'Last'}
                                                                </span>
                                                                {months !== 'lifetime' && (
                                                                    <CleanSelect
                                                                        options={[
                                                                            { value: 1, label: '1 Month' },
                                                                            { value: 2, label: '2 Months' },
                                                                            { value: 3, label: '3 Months' },
                                                                            { value: 4, label: '4 Months' },
                                                                            { value: 5, label: '5 Months' },
                                                                            { value: 6, label: '6 Months' },
                                                                            { value: 9, label: '9 Months' },
                                                                            { value: 12, label: '12 Months' },
                                                                            { value: 18, label: '18 Months' },
                                                                            { value: 24, label: '24 Months' }
                                                                        ]}
                                                                        value={months}
                                                                        onChange={(val) => {
                                                                            const newRanges = [...periodRanges];
                                                                            newRanges[idx] = (typeof val === 'number' ? val : parseInt(val, 10)) as number | 'lifetime';
                                                                            setPeriodRanges(newRanges);
                                                                        }}
                                                                        className="w-32"
                                                                    />
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right font-mono text-indigo-650 font-black text-base">
                                                            ₹{stats.volume.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                        </td>
                                                        <td className="p-4 text-right font-mono text-emerald-600 font-black text-base">
                                                            ₹{stats.profit.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                        </td>
                                                        <td className="p-4 text-right font-mono">
                                                            {stats.hasData ? (
                                                                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full font-black text-xs ${
                                                                    stats.growth >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                                                }`}>
                                                                    <i className={`fa-solid text-[9px] ${stats.growth >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                                                    {stats.growth.toFixed(0)}%
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-3 py-1 rounded-full font-black text-xs bg-slate-100 text-slate-400 uppercase">
                                                                    Baseline
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Popular Tests & Labs Section - aligned to top to prevent stretch */}
                            {biMetrics && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                    {/* Popular Tests */}
                                    <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                                        <div className="flex items-center gap-2">
                                            <i className="fa-solid fa-flask-vial text-indigo-600 text-xs"></i>
                                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Top 10 Ordered Tests</h4>
                                        </div>
                                        <div className="pt-1 space-y-3">
                                            {biMetrics.mostUsedTests.length === 0 ? (
                                                <p className="text-xs text-slate-450 italic">No test data logged yet.</p>
                                            ) : (
                                                biMetrics.mostUsedTests.map((test, index) => {
                                                    const maxCount = Math.max(...biMetrics.mostUsedTests.map(t => t.count), 1);
                                                    const pct = (test.count / maxCount) * 100;
                                                    return (
                                                        <div key={index} className="space-y-1">
                                                            <div className="flex justify-between items-center text-xs font-bold">
                                                                <span className="text-slate-700 truncate max-w-[200px]">{test.name}</span>
                                                                <span className="text-indigo-600 font-black">{test.count} orders</span>
                                                            </div>
                                                            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                                                <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full" style={{ width: `${pct}%` }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* Utilized Laboratories - shifted to donut format */}
                                    <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                                        <div className="flex items-center gap-2">
                                            <i className="fa-solid fa-house-chimney-medical text-indigo-600 text-xs"></i>
                                            <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Laboratory Utilization Share</h4>
                                        </div>
                                        <div className="pt-1">
                                            {renderLabUtilizationChart()}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {/* Top Clients Detailed Modal */}
                    {showClientModal && (
                        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-3xl w-full p-6 space-y-4 animate-fade-in-up">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                                    <div className="flex items-center gap-2">
                                        <i className="fa-solid fa-ranking-star text-indigo-600 text-xs"></i>
                                        <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Client Allocation Matrix</h3>
                                    </div>
                                    <button
                                        onClick={() => setShowClientModal(false)}
                                        className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                    >
                                        <i className="fa-solid fa-times"></i>
                                    </button>
                                </div>

                                {/* Modal Filter / Timeframe fine tuning */}
                                <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-150">
                                    <span className="text-xs font-black text-slate-500 uppercase tracking-wider">Configure Analysis Window</span>
                                    <CleanSelect
                                        options={[
                                            { value: 'lifetime', label: 'Lifetime Cumulative' },
                                            { value: 1, label: 'Last 1 Month' },
                                            { value: 3, label: 'Last 3 Months' },
                                            { value: 6, label: 'Last 6 Months' },
                                            { value: 12, label: 'Last 12 Months' }
                                        ]}
                                        value={modalTimeframe}
                                        onChange={(val) => setModalTimeframe(val)}
                                        className="w-48 text-xs"
                                    />
                                </div>

                                <div className="overflow-x-auto max-h-[350px] rounded-xl border border-slate-150">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-slate-50 sticky top-0">
                                            <tr className="border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <th className="p-3 pl-4">Client Name</th>
                                                <th className="p-3 text-center">Patient Count</th>
                                                <th className="p-3 text-right">Total MRP</th>
                                                <th className="p-3 text-right">Total B2B</th>
                                                <th className="p-3 text-center w-24">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-600">
                                            {modalClientStats.length > 0 ? (
                                                modalClientStats.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/50">
                                                        <td className="p-3 pl-4 text-slate-800 font-bold">{item.client}</td>
                                                        <td className="p-3 text-center">
                                                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-black text-[9px]">
                                                                {item.patients} patients
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right font-mono">₹{item.mrp.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                        <td className="p-3 text-right text-indigo-650 font-bold font-mono">₹{item.b2b.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                                                        <td className="p-3 text-center">
                                                            <button
                                                                onClick={() => {
                                                                    const matched = clients.find(cl => cl.username.toLowerCase().trim() === item.client.toLowerCase().trim());
                                                                    if (matched) {
                                                                        setSelectedClientId(matched.id.toString());
                                                                    } else {
                                                                        setSelectedClientId('');
                                                                    }
                                                                    setActiveTab('LEDGER');
                                                                    setShowClientModal(false);
                                                                }}
                                                                className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase tracking-widest bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded border border-slate-150 transition-colors"
                                                            >
                                                                Ledger
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td colSpan={5} className="p-8 text-center text-slate-400 italic">
                                                        No client activity logged within the selected timeframe.
                                                    </td>
                                                </tr>
                                            )}
                                            {modalClientStats.length > 0 && (
                                                <tr className="bg-slate-50/80 border-t border-slate-200 text-xs font-black text-slate-800 sticky bottom-0">
                                                    <td className="p-3 pl-4">Total Aggregate</td>
                                                    <td className="p-3 text-center">
                                                        {modalClientStats.reduce((sum, c) => sum + c.patients, 0)} patients
                                                    </td>
                                                    <td className="p-3 text-right font-mono">
                                                        ₹{modalClientStats.reduce((sum, c) => sum + c.mrp, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-3 text-right text-indigo-655 font-mono">
                                                        ₹{modalClientStats.reduce((sum, c) => sum + c.b2b, 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                                                    </td>
                                                    <td className="p-3"></td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                /* Franchise Ledger Sub Page - Detailed Data Table / Audit Registry */
                <div className="space-y-6">
                    <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-md space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-1.5 h-4 bg-indigo-600 rounded-full"></div>
                                <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest">Audit Registry & Statement Ledger</h3>
                            </div>
                            <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full uppercase tracking-wider">
                                {totalCount} records indexed
                            </span>
                        </div>

                        <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-inner">
                            <table className="w-full min-w-[1200px] text-left border-collapse">
                                <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-md">
                                    <tr className="border-b border-slate-150">
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest pl-4 w-28">Receipt ID</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Date / Time</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Patient Name</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Customer ID</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Operator / Context</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Laboratory</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-24">B2C Gross</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-24">B2B Cost</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Mother Cost</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Profit Margin</th>
                                        <th className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right w-24">Final Payable</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-600">
                                    {filteredReceipts.length > 0 ? (
                                        filteredReceipts.map((r) => {
                                            const motherCost = r.mother_b2b_cost || 0;
                                            const profit = r.acting_as_client_id ? ((r.b2b_cost || 0) - motherCost) : ((r.amount_final || 0) - motherCost);
                                            return (
                                                <tr 
                                                    key={r.id} 
                                                    onClick={() => handleRowClick(r)}
                                                    className="hover:bg-indigo-50/40 cursor-pointer transition-colors group"
                                                    title="Click to view test itemized breakup"
                                                >
                                                    <td className="p-3 pl-4 font-mono font-bold text-indigo-600 group-hover:underline flex items-center gap-1.5">
                                                        <span>{r.display_doc_id}</span>
                                                        <i className="fa-solid fa-arrow-up-right-from-square text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"></i>
                                                    </td>
                                                    <td className="p-3">{r.display_date}</td>
                                                    <td className="p-3 font-bold text-slate-800">{r.customer_name}</td>
                                                    <td className="p-3 font-mono text-[10px]">{r.display_customer_id}</td>
                                                    <td className="p-3 text-[11px]">
                                                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold">
                                                            {r.created_by_user}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 font-bold text-indigo-700">{r.lab_name}</td>
                                                    <td className="p-3 text-right font-mono">₹{(r.total_mrp || 0).toFixed(0)}</td>
                                                    <td className="p-3 text-right text-indigo-600 font-bold font-mono">₹{(r.b2b_cost || 0).toFixed(0)}</td>
                                                    <td className="p-3 text-right text-slate-400 font-mono">₹{motherCost.toFixed(0)}</td>
                                                    <td className={`p-3 text-right font-black font-mono ${profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        ₹{profit.toFixed(0)}
                                                    </td>
                                                    <td className="p-3 text-right font-bold text-slate-800 font-mono">{r.display_amount}</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={11} className="p-8 text-center text-slate-400 italic">
                                                No receipts match the selected filters.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Test Breakup Modal */}
            {breakupReceipt && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-4xl w-full p-6 space-y-4 animate-fade-in-up flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">
                                    <i className="fa-solid fa-flask-vial"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-wide">
                                        Test Itemized Breakup - {breakupReceipt.display_doc_id}
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-bold">
                                        {breakupReceipt.customer_name} • {breakupReceipt.display_date}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setBreakupReceipt(null)}
                                className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                            >
                                <i className="fa-solid fa-xmark"></i>
                            </button>
                        </div>

                        {/* Summary Badges */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200/80 text-xs">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Laboratory</span>
                                <span className="font-extrabold text-indigo-700 truncate block">{breakupReceipt.lab_name}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Operator</span>
                                <span className="font-extrabold text-slate-700 truncate block">{breakupReceipt.created_by_user}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">B2C Gross / MRP</span>
                                <span className="font-mono font-bold text-slate-800 block">₹{(breakupReceipt.total_mrp || 0).toFixed(0)}</span>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Net Payable</span>
                                <span className="font-mono font-black text-indigo-600 block">{breakupReceipt.display_amount}</span>
                            </div>
                        </div>

                        {/* Items Table */}
                        <div className="overflow-y-auto flex-grow rounded-2xl border border-slate-150">
                            {isLoadingBreakup ? (
                                <div className="p-12 text-center text-slate-400">
                                    <i className="fa-solid fa-spinner fa-spin text-xl text-indigo-500 mb-2"></i>
                                    <p className="text-xs font-bold uppercase tracking-wider">Loading test breakdown...</p>
                                </div>
                            ) : (
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr className="border-b border-slate-150 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <th className="p-3 pl-4 w-28">Test Code</th>
                                            <th className="p-3">Test / Package Name</th>
                                            <th className="p-3 text-right w-24">MRP</th>
                                            <th className="p-3 text-right w-24">B2B Price</th>
                                            <th className="p-3 text-right w-24">Mother Cost</th>
                                            <th className="p-3 text-right w-24 pr-4">Margin</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-600">
                                        {breakupItems.map((item, idx) => {
                                            const itemMargin = (item.b2b_price || item.mrp || 0) - (item.mother_cost || 0);
                                            return (
                                                <tr key={idx} className="hover:bg-slate-50/50">
                                                    <td className="p-3 pl-4 font-mono font-bold text-slate-500">{item.code_name || '-'}</td>
                                                    <td className="p-3 font-bold text-slate-800">{item.package_name}</td>
                                                    <td className="p-3 text-right font-mono text-slate-600">₹{(item.mrp || 0).toFixed(0)}</td>
                                                    <td className="p-3 text-right font-mono font-bold text-indigo-600">₹{(item.b2b_price || 0).toFixed(0)}</td>
                                                    <td className="p-3 text-right font-mono text-slate-400">₹{(item.mother_cost || 0).toFixed(0)}</td>
                                                    <td className={`p-3 pr-4 text-right font-mono font-black ${itemMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                        ₹{itemMargin.toFixed(0)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs text-slate-800">
                                        <tr>
                                            <td colSpan={2} className="p-3 pl-4">Total ({breakupItems.length} Tests)</td>
                                            <td className="p-3 text-right font-mono">
                                                ₹{breakupItems.reduce((s, i) => s + (i.mrp || 0), 0).toFixed(0)}
                                            </td>
                                            <td className="p-3 text-right font-mono text-indigo-600 font-black">
                                                ₹{breakupItems.reduce((s, i) => s + (i.b2b_price || 0), 0).toFixed(0)}
                                            </td>
                                            <td className="p-3 text-right font-mono text-slate-500">
                                                ₹{breakupItems.reduce((s, i) => s + (i.mother_cost || 0), 0).toFixed(0)}
                                            </td>
                                            <td className="p-3 pr-4 text-right font-mono text-emerald-600 font-black">
                                                ₹{breakupItems.reduce((s, i) => s + ((i.b2b_price || i.mrp || 0) - (i.mother_cost || 0)), 0).toFixed(0)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button
                                onClick={() => setBreakupReceipt(null)}
                                className="px-5 py-2 bg-slate-800 hover:bg-black text-white font-bold rounded-xl text-xs transition-all shadow-sm"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ReceiptReport;
