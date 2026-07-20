import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import PageHeader from '../components/PageHeader';

interface ClientStats {
  total_orders: number;
  total_spend: number;
  total_savings: number;
  total_profit: number;
  wallet_balance: number;
  current_month_mrp: number;
  current_month_b2b: number;
  current_month_patients: number;
  last_month_b2b: number;
}

interface TrendMonth {
  month: string;
  count: number;
  spend: number;
}

interface TopTest {
  package_name: string;
  count: number;
}

const ClientAnalysis: React.FC = () => {
  const [stats, setStats] = useState<ClientStats | null>(null);
  const [trend, setTrend] = useState<TrendMonth[]>([]);
  const [topTests, setTopTests] = useState<TopTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'BI' | 'ADVANCED'>('BI');
  const [timeframe, setTimeframe] = useState<number | 'lifetime'>(3);

  useEffect(() => {
    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        const data = await apiService.getClientAnalysis();
        setStats(data.stats);
        setTrend(data.trend);
        setTopTests(data.topTests);
      } catch (err) {
        console.error('Failed to load B2B client analysis', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAnalysis();
  }, []);

  const formatMonthName = (monthStr: string) => {
    if (!monthStr) return '';
    const [year, month] = monthStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(month, 10) - 1]} ${year}`;
  };

  // SVG Chart Dimensions & Computations (limit trend to last 6 months for chart display)
  const chartTrend = trend.slice(-6);
  const chartHeight = 160;
  const chartWidth = 500;
  const maxSpend = chartTrend.length > 0 ? Math.max(...chartTrend.map((t) => t.spend), 1000) : 1000;

  const currentB2B = stats?.current_month_b2b || 0;
  const lastB2B = stats?.last_month_b2b || 0;
  let pctChange = 0;
  let isGrowth = true;
  let hasHistory = lastB2B > 0;
  if (hasHistory) {
    pctChange = ((currentB2B - lastB2B) / lastB2B) * 100;
    isGrowth = pctChange >= 0;
  }

  // Advanced analysis computations
  const last6Months = trend.slice(-6);
  const avgB2BSalesLast6Months = last6Months.length > 0
    ? last6Months.reduce((sum, t) => sum + t.spend, 0) / last6Months.length
    : 0;

  const lifetimeB2B = trend.reduce((sum, t) => sum + t.spend, 0);

  const getGrowthForTimeframe = (monthsCount: number | 'lifetime') => {
    if (trend.length === 0) return { pct: 0, hasData: false, currentVal: 0, priorVal: 0, priorMonthName: '' };
    const currentIdx = trend.length - 1;
    const currentVal = trend[currentIdx]?.spend || 0;
    
    let priorIdx = 0;
    if (monthsCount !== 'lifetime') {
      priorIdx = currentIdx - monthsCount;
    }
    
    if (priorIdx < 0 || priorIdx >= trend.length) {
      return { pct: 0, hasData: false, currentVal, priorVal: 0, priorMonthName: '' };
    }
    
    const priorVal = trend[priorIdx]?.spend || 0;
    const priorMonthName = formatMonthName(trend[priorIdx]?.month);
    
    if (priorVal === 0) {
      return { pct: currentVal > 0 ? 100 : 0, hasData: true, currentVal, priorVal, priorMonthName };
    }
    
    const pct = ((currentVal - priorVal) / priorVal) * 100;
    return { pct, hasData: true, currentVal, priorVal, priorMonthName };
  };

  const growthData = getGrowthForTimeframe(timeframe);

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200">
        <PageHeader title="Performance Analysis" showActingAs={false} />

        {/* Tab Navigation */}
        <div className="flex gap-4 border-b border-slate-200 pb-px mb-6 print:hidden">
          <button
            onClick={() => setActiveTab('BI')}
            className={`pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'BI'
                ? 'border-indigo-600 text-indigo-700 font-black'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <i className="fa-solid fa-chart-line mr-2"></i>
            Performance Overview
          </button>
          <button
            onClick={() => setActiveTab('ADVANCED')}
            className={`pb-3 px-1 text-xs font-bold uppercase tracking-wider transition-all border-b-2 ${
              activeTab === 'ADVANCED'
                ? 'border-indigo-600 text-indigo-700 font-black'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <i className="fa-solid fa-calculator mr-2"></i>
            Advanced Business Analysis
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
            <i className="fa-solid fa-chart-line fa-beat text-3xl text-indigo-650"></i>
            <span className="text-xs font-bold uppercase tracking-widest italic animate-pulse">
              Aggregating business volume metrics...
            </span>
          </div>
        ) : activeTab === 'BI' ? (
          <div className="space-y-6">
            {/* KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Card 1: Wallet Balance */}
              <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 border border-indigo-950 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-md hover:scale-[1.01] transition-transform duration-200 text-white">
                <div className="absolute right-3 top-3 opacity-15 text-white group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-wallet text-3xl"></i>
                </div>
                <span className="text-[10px] font-black text-indigo-250 uppercase tracking-widest leading-none mb-2 block">
                  Wallet Balance
                </span>
                <span className="text-2xl font-black leading-tight">
                  ₹{(stats?.wallet_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <div className="text-[9px] font-bold text-indigo-200 leading-none mt-3">
                  Outstanding account funds available
                </div>
              </div>

              {/* Card 2: Total MRP (Current Month) */}
              <div className="bg-sky-50 border border-sky-150 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm hover:scale-[1.01] transition-transform duration-200">
                <div className="absolute right-3 top-3 opacity-15 text-sky-600 group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-file-invoice-dollar text-3xl"></i>
                </div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-widest leading-none mb-2 block">
                  Total MRP (Current Month)
                </span>
                <span className="text-2xl font-black text-sky-900 leading-tight">
                  ₹{(stats?.current_month_mrp || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <div className="text-[9px] font-semibold text-sky-500 leading-none mt-3">
                  Walk-in retail valuation this month
                </div>
              </div>

              {/* Card 3: Total B2B (Current Month) */}
              <div className="bg-emerald-50 border border-emerald-150 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm hover:scale-[1.01] transition-transform duration-200">
                <div className="absolute right-3 top-3 opacity-15 text-emerald-600 group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-cart-shopping text-3xl"></i>
                </div>
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest leading-none mb-2 block">
                  Total B2B (Current Month)
                </span>
                <span className="text-2xl font-black text-emerald-900 leading-tight">
                  ₹{(stats?.current_month_b2b || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <div className="text-[9px] font-semibold text-emerald-500 leading-none mt-3">
                  Including wallet deduction charges
                </div>
              </div>

              {/* Card 4: Total Patients */}
              <div className="bg-blue-50 border border-blue-150 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm hover:scale-[1.01] transition-transform duration-200">
                <div className="absolute right-3 top-3 opacity-15 text-blue-600 group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-users text-3xl"></i>
                </div>
                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest leading-none mb-2 block">
                  Total Patients
                </span>
                <span className="text-2xl font-black text-blue-900 leading-tight">
                  {stats?.total_orders || 0}
                </span>
                <div className="text-[9px] font-bold text-blue-500 leading-none mt-3 flex items-center justify-between">
                  <span>Referred patients overall</span>
                  <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-black text-[8px] uppercase">
                    {stats?.current_month_patients || 0} this month
                  </span>
                </div>
              </div>

              {/* Card 5: MoM Performance */}
              <div className="bg-amber-50 border border-amber-150 p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-sm hover:scale-[1.01] transition-transform duration-200">
                <div className="absolute right-3 top-3 opacity-15 text-amber-600 group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-chart-line text-3xl"></i>
                </div>
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest leading-none mb-2 block">
                  Last Month B2B Spend
                </span>
                <span className="text-2xl font-black text-amber-900 leading-tight">
                  ₹{(stats?.last_month_b2b || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <div className="text-[9px] font-bold text-amber-500 leading-none mt-3 flex items-center justify-between">
                  <span>Last month volume comparison</span>
                  {hasHistory ? (
                    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full font-black text-[8px] ${isGrowth ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                      <i className={isGrowth ? 'fa-solid fa-arrow-trend-up' : 'fa-solid fa-arrow-trend-down'}></i>
                      {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(0)}%
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full font-black text-[8px] bg-slate-100 text-slate-500 uppercase">
                      New
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Visual Charts & Top Tests Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-4">
              {/* Left Column: Volume Trend Chart */}
              <fieldset className="lg:col-span-7 border-2 border-gray-300 p-4 md:p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between min-w-0">
                <legend className="px-3 flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                    <i className="fa-solid fa-chart-column text-xs"></i>
                  </div>
                  <span className="text-base font-bold text-gray-800 uppercase tracking-tight">Spends & Volume Trend</span>
                </legend>

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                  Monthly spend and invoice count trend for B2B portal
                </p>

                {chartTrend.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-400 italic text-xs font-bold uppercase tracking-wider">
                    No volume trend details available.
                  </div>
                ) : (
                  <div className="w-full mt-6 overflow-x-auto">
                    <svg
                      viewBox={`0 0 ${chartWidth} ${chartHeight + 40}`}
                      className="w-full min-w-[400px] h-auto overflow-visible select-none"
                    >
                      {/* Grid Lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const y = 10 + chartHeight * (1 - ratio);
                        return (
                          <g key={idx}>
                            <line
                              x1="40"
                              y1={y}
                              x2={chartWidth - 10}
                              y2={y}
                              stroke="#e2e8f0"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                            />
                            <text x="32" y={y + 3} className="text-[9px] font-bold text-slate-400 text-right font-mono" textAnchor="end">
                              ₹{Math.round(maxSpend * ratio)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Render Bars */}
                      {chartTrend.map((t, idx) => {
                        const colWidth = (chartWidth - 50) / chartTrend.length;
                        const x = 50 + idx * colWidth;
                        const barWidth = colWidth * 0.45;
                        const barHeight = (t.spend / maxSpend) * chartHeight;
                        const barY = 10 + chartHeight - barHeight;

                        return (
                          <g key={idx} className="group cursor-pointer">
                            <rect
                              x={x}
                              y={barY}
                              width={barWidth}
                              height={barHeight}
                              fill="url(#indigoGrad)"
                              rx="4"
                              className="transition-all duration-200 hover:brightness-95 hover:shadow"
                            />
                            <text
                              x={x + barWidth / 2}
                              y={barY - 5}
                              className="text-[9px] font-black text-indigo-700 opacity-0 group-hover:opacity-100 transition-opacity text-center font-mono"
                              textAnchor="middle"
                            >
                              ₹{t.spend}
                            </text>
                            {/* X-axis labels */}
                            <text
                              x={x + barWidth / 2}
                              y={15 + chartHeight + 10}
                              className="text-[10px] font-bold text-slate-500 text-center uppercase tracking-wide"
                              textAnchor="middle"
                            >
                              {formatMonthName(t.month)}
                            </text>
                            <text
                              x={x + barWidth / 2}
                              y={15 + chartHeight + 24}
                              className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-1 rounded-full text-center font-mono"
                              textAnchor="middle"
                            >
                              {t.count} Invoices
                            </text>
                          </g>
                        );
                      })}

                      {/* Gradients */}
                      <defs>
                        <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#4f46e5" />
                          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.4" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                )}
              </fieldset>

              {/* Right Column: Top Ordered Tests Leaderboard */}
              <fieldset className="lg:col-span-5 border-2 border-gray-300 p-4 md:p-6 rounded-xl bg-white shadow-sm flex flex-col justify-between min-w-0">
                <legend className="px-3 flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                    <i className="fa-solid fa-ranking-star text-xs"></i>
                  </div>
                  <span className="text-base font-bold text-gray-800 uppercase tracking-tight">Referral Leaderboard</span>
                </legend>

                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2 px-1">
                  Your top 5 most frequently ordered packages
                </p>

                {topTests.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400 italic text-xs font-bold uppercase tracking-wider flex-grow">
                    No package referrals recorded yet.
                  </div>
                ) : (
                  <div className="space-y-3 mt-6 flex-grow flex flex-col justify-center">
                    {topTests.map((t, idx) => {
                      const colors = [
                        'bg-indigo-50 border-indigo-100 text-indigo-700',
                        'bg-blue-50 border-blue-100 text-blue-700',
                        'bg-emerald-50 border-emerald-100 text-emerald-700',
                        'bg-amber-50 border-amber-100 text-amber-700',
                        'bg-slate-50 border-slate-100 text-slate-700',
                      ];
                      const progressColors = [
                        'bg-indigo-600',
                        'bg-blue-600',
                        'bg-emerald-600',
                        'bg-amber-500',
                        'bg-slate-500',
                      ];

                      const maxCount = topTests[0]?.count || 1;
                      const progressWidth = `${(t.count / maxCount) * 100}%`;

                      return (
                        <div
                          key={idx}
                          className="flex items-center gap-3 p-3 bg-white border border-slate-100 rounded-xl shadow-sm relative group overflow-hidden"
                        >
                          <div
                            className={`w-7 h-7 rounded-lg border font-black text-xs flex items-center justify-center shrink-0 ${colors[idx] || colors[4]
                              }`}
                          >
                            #{idx + 1}
                          </div>

                          <div className="flex-grow min-w-0 z-10">
                            <span className="font-bold text-slate-700 truncate block text-xs group-hover:text-indigo-900 transition-colors">
                              {t.package_name}
                            </span>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                              <div
                                style={{ width: progressWidth }}
                                className={`h-full rounded-full transition-all duration-300 ${progressColors[idx] || progressColors[4]
                                  }`}
                              ></div>
                            </div>
                          </div>

                          <div className="text-right shrink-0 z-10 pl-2">
                            <span className="text-xs font-black text-slate-800 leading-none block">
                              {t.count}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block mt-0.5">
                              Orders
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </div>
          </div>
        ) : (
          /* ADVANCED BUSINESS ANALYSIS TAB */
          <div className="space-y-8 animate-fade-in">
            {/* Upper KPI summary rows */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Last 6 Months Average B2B Sales */}
              <div className="bg-gradient-to-br from-indigo-500 to-blue-600 border border-indigo-200 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-md hover:scale-[1.01] transition-transform duration-200 text-white">
                <div className="absolute right-4 top-4 opacity-10 text-white group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-calculator text-5xl"></i>
                </div>
                <div>
                  <span className="text-[10px] font-black text-indigo-100 uppercase tracking-widest leading-none mb-2 block">
                    Last 6 Months Average B2B Sales
                  </span>
                  <span className="text-3xl font-black leading-tight block mt-1">
                    ₹{(avgB2BSalesLast6Months).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-indigo-150 leading-normal mt-4">
                  Calculated based on total ledger deductions from the past 6 billing cycles.
                </div>
              </div>

              {/* Card 2: Lifetime B2B Sales */}
              <div className="bg-gradient-to-br from-slate-800 to-slate-950 border border-slate-900 p-6 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-md hover:scale-[1.01] transition-transform duration-200 text-white">
                <div className="absolute right-4 top-4 opacity-10 text-white group-hover:scale-110 transition-transform duration-200">
                  <i className="fa-solid fa-gem text-5xl"></i>
                </div>
                <div>
                  <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest leading-none mb-2 block">
                    Lifetime Cumulative B2B Sales
                  </span>
                  <span className="text-3xl font-black leading-tight block mt-1 text-amber-100">
                    ₹{lifetimeB2B.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="text-[10px] font-bold text-slate-400 leading-normal mt-4">
                  Total gross business volume processed through your B2B account to date.
                </div>
              </div>
            </div>

            {/* Timeframe selector and growth analysis widget */}
            <fieldset className="border-2 border-indigo-100 p-5 rounded-2xl bg-indigo-50/20 shadow-sm relative min-w-0">
              <legend className="px-3 flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                  <i className="fa-solid fa-chart-line text-[10px]"></i>
                </div>
                <span className="text-sm font-bold text-indigo-900 uppercase tracking-wide">Growth Comparator Widget</span>
              </legend>

              <div className="flex flex-col lg:flex-row gap-6 items-center">
                {/* Timeframe buttons */}
                <div className="flex-1 w-full space-y-3">
                  <h4 className="m-0 text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Select Analysis Window</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { label: '3 Months', value: 3 },
                      { label: '6 Months', value: 6 },
                      { label: '9 Months', value: 9 },
                      { label: 'Lifetime', value: 'lifetime' }
                    ].map((btn) => (
                      <button
                        key={btn.label}
                        onClick={() => setTimeframe(btn.value as any)}
                        className={`py-3 px-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm ${
                          timeframe === btn.value
                            ? 'bg-indigo-600 text-white scale-[1.02]'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-55'
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium ml-1">
                    Compares current month B2B sales against the sales recorded at the baseline period of the selected window.
                  </p>
                </div>

                {/* Growth result card */}
                <div className="w-full lg:w-96 bg-white border border-indigo-100 p-5 rounded-2xl shadow-sm flex flex-col justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Growth Rate ({timeframe === 'lifetime' ? 'Lifetime' : `${timeframe} Months`})
                    </span>
                    {growthData.hasData ? (
                      <div className="flex items-center gap-3 mt-2">
                        <span className={`text-4xl font-black tracking-tight ${growthData.pct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {growthData.pct >= 0 ? '+' : ''}{growthData.pct.toFixed(0)}%
                        </span>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${growthData.pct >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          <i className={`fa-solid text-sm ${growthData.pct >= 0 ? 'fa-arrow-up-long' : 'fa-arrow-down-long'}`}></i>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm font-bold text-slate-400 mt-2 italic">
                        Insufficient history in window
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-100 pt-3 space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-500">Current Month B2B:</span>
                      <span className="font-bold text-slate-800 font-mono">₹{currentB2B.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-500">
                        {timeframe === 'lifetime' ? 'Baseline Month:' : `Baseline (${growthData.priorMonthName || 'N/A'}):`}
                      </span>
                      <span className="font-bold text-slate-800 font-mono">₹{growthData.priorVal.toLocaleString('en-IN', { minimumFractionDigits: 0 })}</span>
                    </div>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Time frame (Which Month) and B2B sales historical list */}
            <fieldset className="border-2 border-slate-300 p-4 md:p-6 rounded-2xl bg-white shadow-sm min-w-0">
              <legend className="px-3 flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-slate-700 flex items-center justify-center text-white shadow-sm">
                  <i className="fa-solid fa-list-ol text-[10px]"></i>
                </div>
                <span className="text-sm font-bold text-slate-800 uppercase tracking-wide">Historical Monthly Sales Matrix</span>
              </legend>

              <div className="w-full overflow-x-auto">
                <table className="w-full min-w-[600px] text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Billing Month</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Patient Count</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">B2B Volume</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">MoM Growth</th>
                      <th className="py-3 px-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Share Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {trend.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 italic text-xs font-bold uppercase tracking-wider">
                          No historical logs recorded.
                        </td>
                      </tr>
                    ) : (
                      [...trend].reverse().map((t, idx, arr) => {
                        // Chronological order was ascending, so in reversed array:
                        // t corresponds to arr[idx].
                        // The preceding month chronologically is the one after it in the reversed array (index idx + 1).
                        const nextMonthInList = arr[idx + 1];
                        const prevMonthSpend = nextMonthInList ? nextMonthInList.spend : 0;
                        
                        let momPct = 0;
                        let hasPrev = prevMonthSpend > 0;
                        if (hasPrev) {
                          momPct = ((t.spend - prevMonthSpend) / prevMonthSpend) * 100;
                        }

                        // Share of maximum monthly spend for progress weight bar
                        const maxSpendOverall = Math.max(...trend.map(item => item.spend), 1);
                        const weightPct = `${(t.spend / maxSpendOverall) * 100}%`;

                        return (
                          <tr key={t.month} className="hover:bg-slate-50/50 transition-colors">
                            <td className="py-3.5 px-4 font-bold text-slate-700 text-xs">
                              {formatMonthName(t.month)}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-full font-black text-[10px] font-mono">
                                {t.count} Invoices
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right font-bold text-slate-800 font-mono text-xs">
                              ₹{t.spend.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              {hasPrev ? (
                                <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full font-black text-[9px] font-mono ${
                                  momPct >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  <i className={`fa-solid text-[8px] ${momPct >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}`}></i>
                                  {momPct.toFixed(0)}%
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full font-black text-[9px] bg-slate-100 text-slate-500 uppercase">
                                  Initial
                                </span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 min-w-[120px]">
                              <div className="flex items-center gap-3">
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    style={{ width: weightPct }}
                                    className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                                  ></div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 font-mono text-right w-8">
                                  {((t.spend / maxSpendOverall) * 100).toFixed(0)}%
                                </span>
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
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientAnalysis;
