import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import CleanSelect from '../components/CleanSelect';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Customer } from '../types';

interface ComparisonData {
    tests: { id: number, name: string }[];
    labs: { id: number, name: string }[];
    prices: { test_id: number, lab_id: number, price: number }[];
}

const prefixOptions = ['Mr.', 'Mrs.', 'Miss.', 'Baby.', 'Master.', 'Dr.', 'B/O', 'Ms.', 'C/O', 'S/O'];

const EstimateForm: React.FC = () => {
    const { user, branch } = useAuth();



    // Data states
    const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);

    // Form states
    const [customerMode, setCustomerMode] = useState<'new' | 'search'>('new');
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    const [newCustomer, setNewCustomer] = useState({ prefix: 'Mr.', name: '', mobile: '', email: '', dob: '', age: '', age_years: '', age_months: '', age_days: '', gender: 'Male' as 'Male' | 'Female' });
    const [isGenderDisabled, setIsGenderDisabled] = useState(true);

    const [selectedTestIds, setSelectedTestIds] = useState<Set<number>>(new Set());
    const [testCategories, setTestCategories] = useState<{ [testId: number]: 'Lab Tests' | 'Radiological Tests' | 'Others' }>({});
    const [searchTestQuery, setSearchTestQuery] = useState('');

    const [details, setDetails] = useState({
        referred_by: '',
        notes: '',
    });
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (showPreview) {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
    }, [showPreview]);

    // Fetch initial data
    useEffect(() => {
        apiService.getComparisonData().then(setComparisonData).catch(err => {
            console.error(err);
            alert("Failed to load comparison data. Please ensure it has been uploaded by an administrator.");
        });
    }, []);

    // Customer search logic
    useEffect(() => {
        if (customerSearch.length > 0) {
            const timer = setTimeout(() => {
                apiService.searchCustomers(customerSearch).then(setCustomerSuggestions);
            }, 300);
            return () => clearTimeout(timer);
        } else {
            setCustomerSuggestions([]);
        }
    }, [customerSearch]);

    const handleSelectCustomer = (customer: Customer) => {
        setSelectedCustomer(customer);
        const prefix = customer.prefix || 'Mr.';
        const gender = customer.gender || 'Male';
        setNewCustomer({
            prefix,
            name: customer.name,
            mobile: customer.mobile || '',
            email: customer.email || '',
            dob: customer.dob || '',
            age: customer.age?.toString() || '',
            age_years: customer.age_years?.toString() || '',
            age_months: customer.age_months?.toString() || '',
            age_days: customer.age_days?.toString() || '',
            gender
        });

        const isLocked = ['Mr.', 'Master.', 'B/O', 'S/O', 'Mrs.', 'Miss.', 'Ms.', 'Baby.'].includes(prefix);
        setIsGenderDisabled(isLocked);

        setCustomerSearch('');
        setCustomerSuggestions([]);
    };

    const clearCustomer = () => {
        setSelectedCustomer(null);
        setNewCustomer({ prefix: 'Mr.', name: '', mobile: '', email: '', dob: '', age: '', age_years: '', age_months: '', age_days: '', gender: 'Male' });
        setIsGenderDisabled(true);
        setCustomerMode('new');
    }

    const handlePrefixChange = (newPrefix: string) => {
        let customerData = { ...newCustomer, prefix: newPrefix };
        let isGenderLocked = false;

        switch (newPrefix) {
            case 'Mr.':
            case 'Master.':
            case 'B/O':
            case 'S/O':
                customerData.gender = 'Male';
                isGenderLocked = true;
                break;
            case 'Mrs.':
            case 'Miss.':
            case 'Ms.':
            case 'Baby.':
                customerData.gender = 'Female';
                isGenderLocked = true;
                break;
            default:
                isGenderLocked = false;
                break;
        }
        setNewCustomer(customerData);
        setIsGenderDisabled(isGenderLocked);
    };

    const handleCustomerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        let customerData = { ...newCustomer };

        if (name === 'mobile') {
            const mobileValue = value.replace(/[^0-9]/g, '');
            if (mobileValue.length <= 10) {
                customerData.mobile = mobileValue;
            }
        } else if (name === 'age' || name === 'age_years') {
            const ageVal = value.replace(/[^0-9]/g, '');
            if (ageVal === '' || (parseInt(ageVal) >= 0 && parseInt(ageVal) <= 120)) {
                customerData.age = ageVal;
                customerData.age_years = ageVal;
            }
        } else if (name === 'age_months') {
            const val = value.replace(/[^0-9]/g, '');
            if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 11)) {
                customerData.age_months = val;
            }
        } else if (name === 'age_days') {
            const val = value.replace(/[^0-9]/g, '');
            if (val === '' || (parseInt(val) >= 0 && parseInt(val) <= 31)) {
                customerData.age_days = val;
            }
        } else if (name === 'dob') {
            customerData.dob = value;
            if (value) {
                // Auto calculate age
                const birthDate = new Date(value);
                const today = new Date();
                let years = today.getFullYear() - birthDate.getFullYear();
                let months = today.getMonth() - birthDate.getMonth();
                let days = today.getDate() - birthDate.getDate();

                if (days < 0) {
                    months--;
                    const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                    days += prevMonth.getDate();
                }
                if (months < 0) {
                    years--;
                    months += 12;
                }

                if (years >= 0 && months >= 0 && days >= 0) {
                    customerData.age = years.toString();
                    customerData.age_years = years.toString();
                    customerData.age_months = months.toString();
                    customerData.age_days = days.toString();
                }
            }
        } else if (name === 'prefix') {
            handlePrefixChange(value);
            return;
        } else if (name === 'name') {
            customerData.name = value.toUpperCase();
        } else {
            customerData = { ...customerData, [name]: value };
        }
        setNewCustomer(customerData);
    };

    const toggleTestSelect = (testId: number) => {
        const newSet = new Set(selectedTestIds);
        if (newSet.has(testId)) {
            newSet.delete(testId);
        } else {
            newSet.add(testId);
        }
        setSelectedTestIds(newSet);
    };

    const filteredTests = useMemo(() => {
        if (!comparisonData) return [];
        return comparisonData.tests.filter(t =>
            t.name.toLowerCase().includes(searchTestQuery.toLowerCase())
        );
    }, [comparisonData, searchTestQuery]);

    const getPrice = (testId: number, labId: number) => {
        if (!comparisonData) return null;
        const p = comparisonData.prices.find(p => p.test_id === testId && p.lab_id === labId);
        return p && p.price > 0 ? p.price : null;
    };

    const labSummary = useMemo(() => {
        if (!comparisonData) return { totals: {} as { [labId: number]: number }, incomplete: {} as { [labId: number]: boolean } };
        const totals: { [labId: number]: number } = {};
        const incomplete: { [labId: number]: boolean } = {};
        comparisonData.labs.forEach(l => {
            totals[l.id] = 0;
            incomplete[l.id] = false;
        });

        selectedTestIds.forEach(testId => {
            comparisonData.labs.forEach(lab => {
                const price = getPrice(testId, lab.id);
                if (price !== null && price > 0) {
                    totals[lab.id] += price;
                } else {
                    incomplete[lab.id] = true;
                }
            });
        });

        return { totals, incomplete };
    }, [comparisonData, selectedTestIds]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!user || !branch) {
            alert("User or branch information is missing. Please log in again.");
            return;
        }

        if (selectedTestIds.size === 0) {
            alert("Please select at least one test to compare.");
            return;
        }

        setShowPreview(true);
    };

    const handleConfirmSave = async () => {
        if (!user || !branch) return;

        // Ensure the old Estimates API is properly handled. 
        // For now, the user mentioned they want a brand NEW one. 
        // A "Comparison Estimate" may just be a printed view, so we will trigger window.print() instead of saving to DB for now, since the DB schema for estimates expects specific lab/package list context.
        window.print();
    };

    const handleDiscard = () => {
        if (window.confirm("Are you sure you want to discard this comparison?")) {
            setNewCustomer({ prefix: 'Mr.', name: '', mobile: '', email: '', dob: '', age: '', age_years: '', age_months: '', age_days: '', gender: 'Male' });
            setSelectedCustomer(null);
            setCustomerSearch('');
            setCustomerMode('new');
            setSelectedTestIds(new Set());
            setSearchTestQuery('');
            setDetails({ referred_by: '', notes: '' });
            setShowPreview(false);
        }
    };

    if (showPreview) {
        return (
            <div className="p-4 sm:p-8 max-w-6xl mx-auto printable-area">
                <style>{`
                    @media print {
                        body * { visibility: hidden; }
                        .printable-area, .printable-area * { visibility: visible; }
                        .printable-area { position: absolute; left: 0; top: 0; width: 100%; border: none; box-shadow: none; padding: 20px; }
                        .no-print { display: none !important; }
                    }
                `}</style>
                <div className="max-w-7xl mx-auto my-10 p-4 sm:p-6 bg-white rounded-2xl shadow-xl print:shadow-none print:m-0 print:p-0">
                    <PageHeader title="Comparison Report" showActingAs={false} />
                    <header className="border-b pb-4 text-center">
                        <h1 className="text-3xl font-bold text-gray-800">Estimate Price Comparison</h1>
                        {branch && <p className="text-gray-500">{branch.name}</p>}
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="space-y-2">
                            <h3 className="font-bold text-lg text-indigo-800 border-b pb-1">Patient Information</h3>
                            <p><strong>Name:</strong> {newCustomer.prefix} {newCustomer.name}</p>
                            <p><strong>Mobile:</strong> {newCustomer.mobile || 'N/A'}</p>
                            <p><strong>Age/Gender:</strong> {newCustomer.age_years || '0'}Y {newCustomer.age_months || '0'}M {newCustomer.age_days || '0'}D / {newCustomer.gender}</p>
                        </section>
                        <section className="space-y-2">
                            <h3 className="font-bold text-lg text-indigo-800 border-b pb-1">Details</h3>
                            <p><strong>Referred By:</strong> {details.referred_by || 'Self'}</p>
                            <p><strong>Date:</strong> {new Date().toLocaleDateString('en-GB')}</p>
                        </section>
                    </div>

                    <section className="space-y-2 mt-6">
                        <h3 className="font-bold text-lg text-indigo-800 border-b pb-1">Comparison Matrix</h3>
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="min-w-full text-sm text-left">
                                <thead className="bg-slate-100">
                                    <tr>
                                        <th className="p-3 font-bold text-slate-700 border-r border-slate-200">Test / Profile Name</th>
                                        {comparisonData?.labs.map(lab => (
                                        <th key={lab.id} className="p-3 font-bold text-center text-slate-700 border-r border-slate-200 min-w-[120px]">{lab.name}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {['Lab Tests', 'Radiological Tests', 'Others'].map(category => {
                                        const categoryTestIds = Array.from(selectedTestIds).filter(
                                            id => (testCategories[id] || 'Lab Tests') === category
                                        );
                                        if (categoryTestIds.length === 0) return null;
                                        return (
                                            <React.Fragment key={category}>
                                                <tr className="bg-indigo-50/40">
                                                    <td colSpan={1 + (comparisonData?.labs.length || 0)} className="p-2 font-black text-indigo-950 uppercase text-xs tracking-wider border-b border-indigo-100">
                                                        {category}
                                                    </td>
                                                </tr>
                                                {categoryTestIds.map(testId => {
                                                    const test = comparisonData?.tests.find(t => t.id === testId);
                                                    if (!test) return null;
                                                    return (
                                                        <tr key={testId} className="border-b border-slate-100 hover:bg-slate-50">
                                                            <td className="p-3 font-medium text-slate-800 border-r border-slate-200 pl-6">{test.name}</td>
                                                            {comparisonData?.labs.map(lab => {
                                                                const price = getPrice(testId, lab.id);
                                                                return (
                                                                    <td key={lab.id} className="p-3 text-center border-r border-slate-200 font-mono">
                                                                        {price !== null ? `₹${price.toFixed(2)}` : <span className="text-rose-600 font-bold text-xs italic">Inadequate Data</span>}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-indigo-50 border-t-2 border-indigo-200">
                                        <td className="p-3 font-bold text-indigo-900 border-r border-indigo-200 text-right uppercase">Total Estimated Payable</td>
                                        {comparisonData?.labs.map(lab => {
                                            const isInc = labSummary.incomplete[lab.id];
                                            const totalVal = labSummary.totals[lab.id] || 0;
                                            return (
                                                <td key={'total-' + lab.id} className="p-3 text-center font-bold text-indigo-900 border-r border-indigo-200 text-base font-mono">
                                                    ₹{totalVal.toFixed(2)}
                                                    {isInc && (
                                                        <span className="text-[10px] text-rose-600 font-bold block mt-0.5" title="Some tests are unavailable in this laboratory's Mother Ratelist">
                                                            (Incomplete)
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </section>

                    {details.notes && (
                        <div className="text-sm p-3 bg-yellow-50 rounded border border-yellow-200 mt-4">
                            <strong>Remarks:</strong> {details.notes}
                        </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-4 pt-6 mt-6 border-t no-print">
                        <button type="button" onClick={handleDiscard} className="flex-1 py-3 px-4 bg-red-50 text-red-600 font-bold rounded-xl hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-2">
                            <i className="fa-solid fa-trash-can"></i> Discard
                        </button>
                        <button type="button" onClick={() => setShowPreview(false)} className="flex-1 py-3 px-4 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-600 hover:text-white transition-all flex items-center justify-center gap-2">
                            <i className="fa-solid fa-pen-to-square"></i> Edit
                        </button>
                        <button type="button" onClick={handleConfirmSave} className="flex-[2] py-3 px-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transform active:scale-95 transition-all flex items-center justify-center gap-2">
                            <i className="fa-solid fa-print"></i> Print Comparison
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 max-w-6xl mx-auto">
            <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && (e.target as HTMLElement).getAttribute('type') !== 'submit') { e.preventDefault(); } }} className="bg-white p-6 sm:p-8 rounded-xl shadow-lg space-y-6">
                <header>
                    <h1 className="text-3xl font-bold text-slate-800">Estimate Price Comparison</h1>
                    {branch && user && (
                        <p className="text-sm text-slate-500 mt-2 flex items-center gap-2">
                            <span><i className="fa-solid fa-building text-indigo-400"></i> {branch.name}</span>
                            <span>|</span>
                            <span><i className="fa-solid fa-user text-indigo-400"></i> {user.username}</span>
                            <span>|</span>
                            <Link to={user.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard'} className="text-indigo-600 font-medium hover:underline">Dashboard</Link>
                        </p>
                    )}
                </header>

                <fieldset className="border border-slate-200 bg-slate-50 p-5 rounded-xl">
                    <legend className="px-3 font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg text-sm py-1">Customer / Patient Details</legend>
                    <div className="flex justify-end mb-3">
                        <button type="button" onClick={() => {
                            if (customerMode === 'search') {
                                clearCustomer();
                            } else {
                                setCustomerMode('search');
                            }
                        }} className="text-indigo-600 text-sm font-medium hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors">
                            {customerMode === 'search' ? <><i className="fa-solid fa-user-plus mr-1"></i> Enter New Customer</> : <><i className="fa-solid fa-magnifying-glass mr-1"></i> Search Existing Data</>}
                        </button>
                    </div>
                    {customerMode === 'search' && (
                        <div className="relative mb-4">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <i className="fa-solid fa-search text-slate-400"></i>
                            </div>
                            <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search by name, mobile, or ID..." className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all" />
                            {customerSuggestions.length > 0 && (
                                <ul className="absolute z-10 w-full bg-white border border-slate-200 mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto">
                                    {customerSuggestions.map(cust => (
                                        <li key={cust.id} onClick={() => handleSelectCustomer(cust)} className="p-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center group">
                                            <div>
                                                <span className="font-medium text-slate-800">{cust.name}</span>
                                                <span className="text-sm text-slate-500 block">{cust.mobile || 'No mobile'}</span>
                                            </div>
                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded group-hover:bg-indigo-100 group-hover:text-indigo-700">CUST-{String(cust.id).padStart(6, '0')}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                    {selectedCustomer && (
                        <div className="bg-indigo-50 border border-indigo-200 p-3 rounded-lg mb-4 text-sm flex justify-between items-center shadow-sm">
                            <span className="text-indigo-900">
                                <i className="fa-solid fa-check-circle text-indigo-500 mr-2"></i>
                                <strong>Selected:</strong> {selectedCustomer.name} <span className="text-indigo-500 ml-1">(ID: CUST-{String(selectedCustomer.id).padStart(10, '0')})</span>
                            </span>
                            <button type="button" onClick={clearCustomer} className="text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded hover:bg-red-50 transition-colors">Clear Selection</button>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center gap-2 lg:col-span-2">
                            <CleanSelect
                                options={prefixOptions.map(p => ({ value: p, label: p }))}
                                value={newCustomer.prefix || ''}
                                onChange={handlePrefixChange}
                                disabled={selectedCustomer !== null}
                                className="w-20"
                            />
                            <input type="text" name="name" placeholder="Customer Name" value={newCustomer.name} onChange={handleCustomerChange} disabled={selectedCustomer !== null} required className="p-2.5 border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 flex-grow outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm w-full" />
                        </div>
                        {/* Gender Section */}
                        <div className="lg:col-span-4 mt-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Gender</label>
                            <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm w-fit">
                                {(['Male', 'Female'] as const).map(option => (
                                    <button
                                        key={option}
                                        type="button"
                                        disabled={isGenderDisabled || selectedCustomer !== null}
                                        onClick={() => setNewCustomer({ ...newCustomer, gender: option })}
                                        className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${newCustomer.gender === option
                                                ? 'bg-blue-600 text-white shadow-md shadow-blue-200'
                                                : 'text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed'
                                            }`}
                                    >
                                        {option}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="lg:col-span-4 mt-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Age | DOB</label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex gap-2">
                                    <input type="number" name="age_years" placeholder="Years" max="120" value={newCustomer.age_years} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-1/3 p-2.5 border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm text-center" />
                                    <input type="number" name="age_months" placeholder="Months" max="11" value={newCustomer.age_months} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-1/3 p-2.5 border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm text-center" />
                                    <input type="number" name="age_days" placeholder="Days" max="31" value={newCustomer.age_days} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-1/3 p-2.5 border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm text-center" />
                                </div>
                                <div className="flex gap-2">
                                    <div className="flex-1 relative">
                                        <input type="date" name="dob" value={newCustomer.dob} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-full p-2.5 border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="lg:col-span-4">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Referred By / Doctor</label>
                            <input type="text" value={details.referred_by} onChange={e => setDetails({ ...details, referred_by: e.target.value })} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm" placeholder="Doctor Name or leave blank for 'Self'" />
                        </div>

                        {/* Contact Section: Mobile & Email */}
                        <div className="lg:col-span-4 mt-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Contact</label>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                {/* Mobile Input */}
                                <input
                                    type="tel"
                                    name="mobile"
                                    placeholder="Mobile No. (Optional)"
                                    value={newCustomer.mobile}
                                    onChange={handleCustomerChange}
                                    disabled={selectedCustomer !== null}
                                    pattern="\d{10}"
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm bg-white"
                                />
                                {/* Email Input */}
                                <input
                                    type="email"
                                    name="email"
                                    placeholder="Email Address (Optional)"
                                    value={newCustomer.email || ''}
                                    onChange={handleCustomerChange}
                                    disabled={selectedCustomer !== null}
                                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm bg-white"
                                />
                            </div>
                        </div>
                    </div>
                </fieldset>

                {!comparisonData ? (
                    <div className="p-10 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl">
                        <i className="fa-solid fa-spinner fa-spin text-3xl text-indigo-400 mb-2"></i>
                        <p className="text-slate-500 font-medium">Loading comparison laboratory data...</p>
                    </div>
                ) : (
                    <fieldset className="border border-indigo-200 bg-white p-0 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div>
                                <h2 className="text-lg font-bold text-indigo-900 inline-flex items-center gap-2">
                                    <i className="fa-solid fa-vials text-indigo-500"></i> Test Selection
                                </h2>
                                <p className="text-xs text-indigo-600 mt-1">Select the tests to compare rates across different laboratories.</p>
                            </div>
                            <div className="relative w-full md:w-72">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <i className="fa-solid fa-search text-indigo-400"></i>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search tests/packages..."
                                    value={searchTestQuery}
                                    onChange={e => setSearchTestQuery(e.target.value)}
                                    className="w-full pl-9 p-2 border border-indigo-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                />
                            </div>
                        </div>

                        <div className="p-4 bg-white flex flex-col md:flex-row gap-6">
                            {/* Selected Tests Panel */}
                            {selectedTestIds.size > 0 && (
                                <div className="w-full md:w-1/3 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-96 overflow-y-auto">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex justify-between">
                                        Selected Tests <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{selectedTestIds.size}</span>
                                    </h3>
                                    <ul className="space-y-3">
                                        {Array.from(selectedTestIds).map(testId => {
                                            const test = comparisonData.tests.find(t => t.id === testId);
                                            if (!test) return null;
                                            return (
                                                <li key={testId} className="bg-white border border-slate-200 rounded-xl p-3 text-sm flex flex-col gap-2 shadow-sm">
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-bold text-slate-700 truncate mr-2" title={test.name}>{test.name}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleTestSelect(testId)}
                                                            className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                                                        >
                                                            <i className="fa-solid fa-times text-xs"></i>
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center justify-between border-t border-slate-100 pt-1.5">
                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Type:</span>
                                                        <select
                                                            value={testCategories[testId] || 'Lab Tests'}
                                                            onChange={e => {
                                                                const category = e.target.value as 'Lab Tests' | 'Radiological Tests' | 'Others';
                                                                setTestCategories(prev => ({ ...prev, [testId]: category }));
                                                            }}
                                                            className="text-[10px] py-1 px-1.5 border border-slate-200 rounded bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                                                        >
                                                            <option value="Lab Tests">Lab Tests</option>
                                                            <option value="Radiological Tests">Radiological Tests</option>
                                                            <option value="Others">Others</option>
                                                        </select>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}

                            {/* Test Search Results */}
                            <div className="flex-1 max-h-96 overflow-y-auto pr-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                                    {filteredTests.map(test => {
                                        const isSelected = selectedTestIds.has(test.id);
                                        return (
                                            <div
                                                key={test.id}
                                                onClick={() => toggleTestSelect(test.id)}
                                                className={`p-3 rounded-lg border cursor-pointer transition-all flex items-start gap-3 ${isSelected ? 'bg-indigo-50 border-indigo-300 shadow-sm ring-1 ring-indigo-500' : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50'}`}
                                            >
                                                <div className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 bg-white'}`}>
                                                    {isSelected && <i className="fa-solid fa-check text-white text-[10px]"></i>}
                                                </div>
                                                <span className={`font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>{test.name}</span>
                                            </div>
                                        );
                                    })}
                                    {filteredTests.length === 0 && (
                                        <div className="col-span-full py-8 text-center text-slate-500 italic">
                                            No tests found matching "{searchTestQuery}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Live Matrix Preview */}
                        {selectedTestIds.size > 0 && (
                            <div className="border-t border-slate-200">
                                <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
                                    <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">Live Comparison Preview</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs text-left">
                                        <thead className="bg-white">
                                            <tr>
                                                <th className="p-2 border-b border-r border-slate-200 text-slate-500 font-medium">Test</th>
                                                {comparisonData.labs.map(lab => (
                                                    <th key={lab.id} className="p-2 border-b border-r border-slate-200 text-center text-slate-600 font-bold">{lab.name}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Array.from(selectedTestIds).slice(0, 3).map(testId => {
                                                const test = comparisonData.tests.find(t => t.id === testId);
                                                if (!test) return null;
                                                return (
                                                    <tr key={testId} className="border-b border-slate-100">
                                                        <td className="p-2 border-r border-slate-200 text-slate-700 truncate max-w-[150px]">{test.name}</td>
                                                        {comparisonData.labs.map(lab => {
                                                            const price = getPrice(testId, lab.id);
                                                            return (
                                                                <td key={lab.id} className="p-2 text-center border-r border-slate-200 font-mono text-slate-600">
                                                                    {price !== null ? `₹${price.toFixed(2)}` : <span className="text-rose-500 font-bold text-[10px] italic">Inadequate Data</span>}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                            {selectedTestIds.size > 3 && (
                                                <tr>
                                                    <td colSpan={comparisonData.labs.length + 1} className="p-2 text-center text-slate-400 italic bg-slate-50">
                                                        ... and {selectedTestIds.size - 3} more. See preview for full details.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </fieldset>
                )}

                <div className="mt-6">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 block">Additional Remarks / Notes</label>
                    <textarea value={details.notes} onChange={e => setDetails({ ...details, notes: e.target.value })} rows={2} className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm" placeholder="Any special instructions or notes to print on the estimate..." />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3 mt-6">
                    <i className="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
                    <p className="text-xs text-blue-800 leading-relaxed">
                        This rewritten module functions as a <strong>Price Comparison Generator</strong>.
                        It will generate a tabular comparison of tests across all available labs. The printout is suitable for sharing with clients. It does not track standard estimate documents in the database at this time.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={selectedTestIds.size === 0 || !comparisonData}
                    className="w-full py-3.5 bg-indigo-600 disabled:bg-slate-300 text-white font-bold text-lg rounded-xl hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
                >
                    <i className="fa-solid fa-table-list"></i>
                    Generate Detailed Comparison Matrix
                </button>
            </form>
        </div>
    );
};

export default EstimateForm;