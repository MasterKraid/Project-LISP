import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import CleanSelect from '../components/CleanSelect';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Lab, PackageList, Package } from '../types';
import MultiSelectSearchWithSummary from '../components/MultiSelectSearchWithSummary';

const ClientRatelist: React.FC = () => {
    const { user, actingAsClient } = useAuth();
    const navigate = useNavigate();

    // Data states
    const [labs, setLabs] = useState<Lab[]>([]);
    const [packageLists, setPackageLists] = useState<PackageList[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);

    // Flow states
    const [step, setStep] = useState(1);
    
    // Step 1 states
    const [selectedLabId, setSelectedLabId] = useState('');
    const [selectedListId, setSelectedListId] = useState('');

    // Step 2 states
    const [showMRP, setShowMRP] = useState(true);
    const [showB2B, setShowB2B] = useState(true);

    // Step 3 states
    const [selectedTests, setSelectedTests] = useState<string[]>([]);

    useEffect(() => {
        apiService.getLabs().then(data => {
            setLabs(data);
            if (data.length > 0) {
                setSelectedLabId(data[0].id.toString());
            } else {
                setSelectedLabId('');
            }
        });
    }, [actingAsClient]);

    useEffect(() => {
        setPackageLists([]);
        setPackages([]);
        setSelectedListId('');
        setSelectedTests([]);
        if (selectedLabId && user) {
            apiService.getPackageListsForLab(parseInt(selectedLabId)).then(data => {
                setPackageLists(data);
                if (data.length > 0) {
                    setSelectedListId(data[0].id.toString());
                }
            });
        }
    }, [selectedLabId, user, actingAsClient]);

    useEffect(() => {
        setPackages([]);
        setSelectedTests([]);
        if (selectedListId) {
            apiService.getPackagesForList(parseInt(selectedListId)).then(data => {
                setPackages(data.filter(p => p.name && p.name.trim() !== ''));
            });
        }
    }, [selectedListId]);

    /* Auto-advance removed as requested to prevent skipping Step 1 when labs auto-select */
    /* 
    useEffect(() => {
        if (step === 1 && selectedLabId && selectedListId) {
            const timer = setTimeout(() => {
                setStep(2);
            }, 300);
            return () => clearTimeout(timer);
        }
    }, [selectedLabId, selectedListId, step]);
    */

    const goNext = () => setStep(prev => Math.min(4, prev + 1));
    const goBack = () => setStep(prev => Math.max(1, prev - 1));

    const calculations = useMemo(() => {
        let totalMrp = 0;
        let totalB2B = 0;
        
        const selectedPackages = packages.filter(p => selectedTests.includes(p.name));
        
        selectedPackages.forEach(pkg => {
            totalMrp += pkg.mrp || 0;
            totalB2B += pkg.b2b_price || 0;
        });

        return { 
            totalMrp, 
            totalB2B, 
            count: selectedPackages.length,
            selectedPackages
        };
    }, [selectedTests, packages]);

    const renderStep1 = () => {
        const showLabSelector = labs.length > 1;
        const showListSelector = packageLists.length > 1;

        return (
            <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl space-y-4 w-full min-w-0">
                <legend className="px-3 flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                        <i className="fa-solid fa-flask-vial text-xs"></i>
                    </div>
                    <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Select Ratelist Source</span>
                </legend>
                <div className="space-y-4">
                    {showLabSelector ? (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Laboratory</label>
                            <CleanSelect 
                                options={labs.map(lab => ({ value: lab.id.toString(), label: lab.name }))} 
                                value={selectedLabId} 
                                onChange={val => setSelectedLabId(val)} 
                                placeholder="Select Lab" 
                            />
                        </div>
                    ) : (
                        labs.length === 1 && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-205 text-xs font-bold text-slate-700">
                                <span className="text-slate-400 uppercase tracking-widest text-[9px] block mb-0.5">Assigned Laboratory</span>
                                <i className="fa-solid fa-building mr-2 text-slate-800"></i> {labs[0].name}
                            </div>
                        )
                    )}
                    {showListSelector ? (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Rate Category</label>
                            <CleanSelect 
                                options={packageLists.map(list => ({ value: list.id.toString(), label: list.name }))} 
                                value={selectedListId} 
                                onChange={val => setSelectedListId(val)} 
                                disabled={!selectedLabId} 
                                placeholder="Select Rate System" 
                            />
                        </div>
                    ) : null}
                    {!showLabSelector && !showListSelector && labs.length === 1 && packageLists.length === 1 && (
                        <p className="text-xs text-slate-450 italic pl-1">
                            Your laboratory and rate system have been automatically assigned.
                        </p>
                    )}
                </div>
                <div className="pt-4 flex justify-end">
                    <button 
                        onClick={() => {
                            if (!selectedLabId || !selectedListId) {
                                alert("Please select both a Lab and a Ratelist category.");
                                return;
                            }
                            goNext();
                        }} 
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-colors"
                    >
                        Next
                    </button>
                </div>
            </fieldset>
        );
    };

    const renderStep2 = () => (
        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl space-y-4 w-full min-w-0">
            <legend className="px-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                    <i className="fa-solid fa-sliders text-xs"></i>
                </div>
                <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Display Options</span>
            </legend>
            <div className="space-y-4">
                <p className="text-sm text-slate-600 mb-4 cursor-default">Select the pricing you want to view in your ratelist.</p>
                
                <label className="flex items-center p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={showB2B} 
                        onChange={(e) => setShowB2B(e.target.checked)} 
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="ml-4">
                        <div className="font-bold text-slate-800">Show B2B Price</div>
                        <div className="text-xs text-slate-500">Your specific business-to-business cost</div>
                    </div>
                </label>
                
                <label className="flex items-center p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <input 
                        type="checkbox" 
                        checked={showMRP} 
                        onChange={(e) => setShowMRP(e.target.checked)} 
                        className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <div className="ml-4">
                        <div className="font-bold text-slate-800">Show MRP</div>
                        <div className="text-xs text-slate-500">Maximum Retail Price for the customer</div>
                    </div>
                </label>
            </div>
            <div className="pt-4 flex justify-between">
                <button onClick={goBack} className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors">Back</button>
                <button 
                    onClick={() => {
                        if (!showB2B && !showMRP) {
                            alert("Please select at least one price to display.");
                            return;
                        }
                        goNext();
                    }} 
                    className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-md shadow-blue-200 transition-colors"
                >
                    Next
                </button>
            </div>
        </fieldset>
    );

    const renderStep3 = () => {
        const dropdownOptions = packages.map(p => ({ 
            value: p.name, 
            label: p.name,
            b2b: p.b2b_price,
            mrp: p.mrp,
            code_name: p.code_name
        }));
        
        return (
            <form 
                onSubmit={(e) => {
                    e.preventDefault();
                    if (selectedTests.length === 0) {
                        alert("Please select at least one test.");
                        return;
                    }
                    goNext();
                }}
                className="w-full min-w-0"
            >
                <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl space-y-4 text-left w-full min-w-0">
                    <legend className="px-3 flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                            <i className="fa-solid fa-magnifying-glass text-xs"></i>
                        </div>
                        <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Search & Select Tests</span>
                    </legend>
                    
                    <div className="mb-4 sticky top-0 bg-white z-20 py-3 border-b border-slate-100">
                        <MultiSelectSearchWithSummary 
                            options={dropdownOptions}
                            selectedValues={selectedTests}
                            onChange={setSelectedTests}
                            placeholder="Type here to search tests..."
                            onEnterPress={() => {
                                if (selectedTests.length > 0) {
                                    goNext();
                                } else {
                                    alert("Please select at least one test.");
                                }
                            }}
                        />
                    </div>
                    
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex justify-between items-center">
                        <span className="font-bold text-blue-800">Selected Tests</span>
                        <span className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-sm">
                            {selectedTests.length}
                        </span>
                    </div>

                    {/* Hide selected tests list as requested */}
                    {/* 
                    {selectedTests.length > 0 && (
                        <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                            {selectedTests.map(testName => (
                                <div key={testName} className="flex justify-between items-center p-3 bg-white border border-slate-200 rounded-lg shadow-sm hover:border-red-200 group transition-all">
                                    <span className="font-medium text-slate-700 text-sm truncate pr-4">{testName}</span>
                                    <button 
                                        onClick={() => setSelectedTests(prev => prev.filter(t => t !== testName))}
                                        className="text-red-400 group-hover:text-red-600 transition-colors p-1"
                                    >
                                        <i className="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                    */}
                    
                    <div className="pt-4 flex justify-start">
                        <button type="button" onClick={goBack} className="px-6 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors">Back</button>
                    </div>
                </fieldset>
            </form>
        );
    };

    const renderStep4 = () => (
        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl space-y-6 w-full min-w-0">
            <legend className="px-3 flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                    <i className="fa-solid fa-calculator text-xs"></i>
                </div>
                <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Ratelist Summary</span>
            </legend>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-center">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Tests</div>
                    <div className="text-2xl font-black text-slate-800">{calculations.count}</div>
                </div>
                
                {showB2B && (
                    <div className="bg-green-50 border border-green-200 p-4 rounded-xl text-center shadow-sm shadow-green-100">
                        <div className="text-xs font-bold text-green-600 uppercase tracking-widest mb-1">Total B2B</div>
                        <div className="text-2xl font-black text-green-700">₹{calculations.totalB2B.toFixed(0)}</div>
                    </div>
                )}
                
                {showMRP && (
                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl text-center shadow-sm shadow-blue-100">
                        <div className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-1">Total MRP</div>
                        <div className="text-2xl font-black text-blue-700">₹{calculations.totalMrp.toFixed(0)}</div>
                    </div>
                )}
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-xl max-w-full">
                <table className="min-w-full text-sm table-fixed">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="px-2 py-3 md:p-4 text-left font-bold text-slate-600 uppercase tracking-wider text-[10px] md:text-xs">Test Name</th>
                            {showB2B && <th className="px-2 py-3 md:p-4 text-right font-bold text-slate-600 uppercase tracking-wider text-[10px] md:text-xs w-16 md:w-20">B2B</th>}
                            {showMRP && <th className="px-2 py-3 md:p-4 text-right font-bold text-slate-600 uppercase tracking-wider text-[10px] md:text-xs w-16 md:w-20">MRP</th>}
                            <th className="px-2 py-3 md:p-4 text-center font-bold text-slate-600 uppercase tracking-wider text-xs w-8 md:w-12"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {calculations.selectedPackages.map((pkg, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-2 py-3 md:p-4 font-medium text-slate-800 break-words line-clamp-2 leading-tight text-[11px] md:text-sm">{pkg.name}</td>
                                {showB2B && <td className="px-2 py-3 md:p-4 text-right font-bold text-green-700 bg-green-50/30 text-[11px] md:text-sm whitespace-nowrap">₹{pkg.b2b_price.toFixed(0)}</td>}
                                {showMRP && <td className="px-2 py-3 md:p-4 text-right font-bold text-slate-700 text-[11px] md:text-sm whitespace-nowrap">₹{pkg.mrp.toFixed(0)}</td>}
                                <td className="px-2 py-3 md:p-4 text-center">
                                    <button 
                                        onClick={() => setSelectedTests(prev => prev.filter(t => t !== pkg.name))}
                                        className="text-red-400 hover:text-red-600 transition-colors p-1"
                                        title="Remove Test"
                                    >
                                        <i className="fa-solid fa-trash-can text-sm"></i>
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="pt-6 flex justify-between items-center border-t border-slate-200 gap-3">
                <button 
                    onClick={goBack} 
                    className="px-4 md:px-6 py-2 md:py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 transition-colors text-xs md:text-sm whitespace-nowrap"
                >
                    Edit Tests
                </button>
                <button 
                    onClick={() => navigate(user?.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard')} 
                    className="px-5 md:px-8 py-2.5 md:py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 shadow-xl shadow-slate-200 transition-all active:scale-95 text-xs md:text-sm whitespace-nowrap"
                >
                    Exit to Dashboard
                </button>
            </div>
        </fieldset>
    );

    return (
        <div className="min-h-screen bg-slate-50 pb-12">
            <div className="max-w-4xl mx-auto px-4 pt-10">
                <div className="bg-white rounded-3xl shadow-2xl border border-slate-50 flex flex-col min-h-[80vh] overflow-hidden">
                    <header className="p-4 border-b border-slate-100 flex justify-between items-center bg-white z-20">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                                <i className="fa-solid fa-tags"></i>
                            </div>
                            <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Step {step} of 4</h2>
                        </div>
                        <button type="button" onClick={() => navigate(user?.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard')} className="text-slate-400 hover:text-red-500 transition-colors">
                            <i className="fa-solid fa-circle-xmark text-xl"></i>
                        </button>
                    </header>
                    
                    <div className="p-5 flex-grow overflow-y-auto pb-[20vh]">
                        <div className="mb-4">
                            <PageHeader title="My Ratelist" showBackLink={false} />
                        </div>
                        {step === 1 && renderStep1()}
                        {step === 2 && renderStep2()}
                        {step === 3 && renderStep3()}
                        {step === 4 && renderStep4()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientRatelist;
