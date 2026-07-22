import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import CleanSelect from '../components/CleanSelect';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Customer, Lab, PackageList, Package } from '../types';
import SearchableDropdown, { SearchableDropdownHandle } from '../components/SearchableDropdown';
import { useRef } from 'react';

interface ItemRow {
    id: number;
    name: string;
    mrp: number;
    b2b_price: number;
    discount: number;
    isFromDb: boolean;
}

const prefixOptions = ['Mr.', 'Mrs.', 'Miss.', 'Baby.', 'Master.', 'Dr.', 'B/O', 'Ms.', 'C/O', 'S/O'];

const ReceiptForm: React.FC = () => {
    const { id } = useParams() as { id?: string };
    const isEditMode = id !== undefined;
    const { user, branch, updateUser, actingAsClient, setActingAsClient } = useAuth();
    const navigate = useNavigate();


    // Determine effective user role
    const isClientMode = user?.role === 'CLIENT' || actingAsClient !== null;

    // Data states
    const [labs, setLabs] = useState<Lab[]>([]);
    const [packageLists, setPackageLists] = useState<PackageList[]>([]);
    const [packages, setPackages] = useState<Package[]>([]);

    // Form states
    const [selectedLabId, setSelectedLabId] = useState('');
    const [selectedListId, setSelectedListId] = useState('');

    const [customerMode, setCustomerMode] = useState<'new' | 'search'>('new');
    const [customerSearch, setCustomerSearch] = useState('');
    const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

    const [newCustomer, setNewCustomer] = useState({ prefix: 'Mr.', name: '', mobile: '', email: '', dob: '', age: '', age_years: '', age_months: '', age_days: '', gender: 'Male' as 'Male' | 'Female' });
    const [isGenderDisabled, setIsGenderDisabled] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLocked, setIsLocked] = useState(false);
    const [showB2BDetails, setShowB2BDetails] = useState(true);

    const [items, setItems] = useState<ItemRow[]>([{ id: Date.now(), name: '', mrp: 0, b2b_price: 0, discount: 0, isFromDb: false }]);

    const [applyDiscount, setApplyDiscount] = useState('');

    const [details, setDetails] = useState({
        amount_received: '',
        due_amount_manual: '',
        num_tests: '',
        referred_by: '',
        payment_method: 'Cash',
        notes: '',
    });
    const [showPreview, setShowPreview] = useState(false);

    useEffect(() => {
        if (showPreview) {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }
    }, [showPreview]);

    // Mobile specific states
    const [step, setStep] = useState(1);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

    // Refs for enter-key navigation
    const nameRef = useRef<HTMLInputElement>(null);
    const mobileRef = useRef<HTMLInputElement>(null);
    const ageRef = useRef<HTMLInputElement>(null);
    const referredByRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<{ [key: number]: SearchableDropdownHandle | null }>({});

    useEffect(() => {
        if (isClientMode) {
            setCustomerMode('new');
        }
    }, [isClientMode]);

    useEffect(() => {
        const handleResize = () => setIsMobileView(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Fetch initial data (re-run when actingAsClient proxy changes)
    useEffect(() => {
        apiService.getLabs().then(data => {
            setLabs(data);
            if (data.length > 0) {
                const currentLabStillExists = data.some(l => l.id.toString() === selectedLabId);
                if (!currentLabStillExists) {
                    setSelectedLabId(data[0].id.toString());
                }
            } else {
                setSelectedLabId('');
            }
        }).catch(err => {
            console.error("Failed to load labs", err);
        });
    }, [actingAsClient]);

    useEffect(() => {
        if (id) {
            const receiptId = parseInt(id, 10);
            if (!isNaN(receiptId)) {
                setIsSubmitting(true);
                apiService.getReceiptById(receiptId).then(data => {
                    const { receipt, customer, items: receiptItems } = data;

                    if (receipt.data_entry_done === 1) {
                        setIsLocked(true);
                    }

                    // Load customer
                    setSelectedCustomer(customer);
                    setNewCustomer({
                        prefix: customer.prefix || 'Mr.',
                        name: customer.name,
                        mobile: customer.mobile || '',
                        email: customer.email || '',
                        dob: customer.dob || '',
                        age: customer.age?.toString() || '',
                        age_years: customer.age_years?.toString() || '',
                        age_months: customer.age_months?.toString() || '',
                        age_days: customer.age_days?.toString() || '',
                        gender: customer.gender || 'Male'
                    });

                    // Load receipt details
                    setSelectedLabId(receipt.branch_id.toString());
                    setDetails({
                        amount_received: receipt.amount_received.toString(),
                        due_amount_manual: receipt.amount_due.toString(),
                        num_tests: receipt.num_tests?.toString() || '',
                        referred_by: receipt.referred_by || '',
                        payment_method: receipt.payment_method,
                        notes: receipt.notes || ''
                    });

                    // Load items
                    const formatted = receiptItems.map((item, idx) => ({
                        id: Date.now() + idx,
                        name: item.package_name,
                        mrp: item.mrp,
                        b2b_price: item.b2b_price || 0,
                        discount: item.discount_percentage,
                        isFromDb: true
                    }));
                    setItems(formatted);
                }).catch(err => {
                    console.error("Failed to load receipt for editing", err);
                    alert("Failed to load receipt");
                }).finally(() => {
                    setIsSubmitting(false);
                });
            }
        }
    }, [id]);

    // Handle cascading dropdowns
    useEffect(() => {
        setPackageLists([]);
        setPackages([]);
        setSelectedListId('');
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
        if (selectedListId) {
            apiService.getPackagesForList(parseInt(selectedListId)).then(data => {
                setPackages(data.filter(p => p.name && p.name.trim() !== ''));
            });
        }
    }, [selectedListId]);

    // Validate and update item prices when package list changes (e.g. lab/category switch)
    useEffect(() => {
        if (items.length > 0) {
            setItems(prevItems => {
                let changed = false;
                const updated = prevItems.map(item => {
                    if (item.name && item.isFromDb) {
                        const matchedPkg = packages.find(p => p.name === item.name);
                        if (!matchedPkg) {
                            changed = true;
                            // Reset pricing for items not present in the new category
                            return { ...item, mrp: 0, b2b_price: 0, isFromDb: false };
                        } else if (item.mrp !== matchedPkg.mrp || item.b2b_price !== matchedPkg.b2b_price) {
                            changed = true;
                            // Update prices to match the new category
                            return { ...item, mrp: matchedPkg.mrp, b2b_price: matchedPkg.b2b_price };
                        }
                    }
                    return item;
                });
                return changed ? updated : prevItems;
            });
        }
    }, [packages]);

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
                // Keep age_years perfectly completely synced with 'age' field for backward compatibility
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

    const handleItemChange = (id: number, field: keyof ItemRow, value: string | number) => {
        setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
    };

    const handlePackageSelect = (id: number, name: string) => {
        const pkg = packages.find(p => p.name === name);

        setItems(prevItems => {
            const updated = prevItems.map(item =>
                item.id === id ? {
                    ...item,
                    name: pkg ? pkg.name : name,
                    mrp: pkg ? pkg.mrp : item.mrp,
                    b2b_price: pkg ? pkg.b2b_price : item.b2b_price,
                    isFromDb: !!pkg
                } : item
            );

            // Auto-add row if this is the last row and name is selected
            const selectedItemIndex = updated.findIndex(i => i.id === id);
            if (selectedItemIndex === updated.length - 1 && name.trim() !== '') {
                return [...updated, { id: Date.now() + 1, name: '', mrp: 0, b2b_price: 0, discount: 0, isFromDb: false }];
            }
            return updated;
        });
    };

    const addItem = () => setItems(prev => [...prev, { id: Date.now(), name: '', mrp: 0, b2b_price: 0, discount: 0, isFromDb: false }]);
    const removeItem = (id: number) => items.length > 1 && setItems(items.filter(item => item.id !== id));

    const handleApplyDiscountToAll = () => {
        const disc = parseFloat(applyDiscount);
        if (!isNaN(disc) && disc >= 0 && disc <= 100) {
            setItems(items.map(item => ({ ...item, discount: disc })));
            setApplyDiscount('');
        }
    };

    const validateAge = (age_years: string) => {
        if (!age_years) return true; // Optional if DOB is given
        const num = parseInt(age_years);
        return !isNaN(num) && num >= 0 && num <= 120;
    }

    const calculations = useMemo(() => {
        let totalMrp = 0;
        let totalDiscountAmount = 0;
        let totalB2B = 0;

        items.forEach(item => {
            const mrp = Number(item.mrp) || 0;
            const b2b = Number(item.b2b_price) || 0;
            const discountPercent = Number(item.discount) || 0;

            totalMrp += mrp;
            totalDiscountAmount += mrp * (discountPercent / 100);
            totalB2B += b2b;
        });

        const subtotal = totalMrp - totalDiscountAmount;
        let netPayable = Math.round(subtotal);
        const receivedInput = details.amount_received.trim();
        const received = receivedInput === '' ? netPayable : (parseFloat(receivedInput) || 0);

        const dueOverride = parseFloat(details.due_amount_manual);
        const amountDue = !isNaN(dueOverride) ? dueOverride : Math.max(0, netPayable - received);

        const validTests = items.filter(i => i.name && i.name.trim() !== '');

        return { totalMrp, totalDiscountAmount, totalB2B, subtotal, netPayable, amountDue, received, totalTests: validTests.length };
    }, [items, details.amount_received, details.due_amount_manual]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (showPreview || isSubmitting) {
            return;
        }

        // Robust guard for mobile flow submission
        if (isMobileView && step < (isClientMode ? 3 : 4)) {
            nextStep();
            return;
        }

        if (!user || !branch) {
            alert("User or branch information is missing. Please log in again.");
            return;
        }

        const y = parseInt(newCustomer.age_years) || 0;
        const m = parseInt(newCustomer.age_months) || 0;
        const d = parseInt(newCustomer.age_days) || 0;

        if (!newCustomer.dob.trim() && !newCustomer.age_years.trim() && !newCustomer.age_months.trim() && !newCustomer.age_days.trim()) {
            alert("Please provide Age or Date of Birth.");
            return;
        }
        if (y === 0 && m === 0 && d === 0) {
            alert("Age cannot be 0Y 0M 0D. Please enter a valid age.");
            return;
        }

        if (newCustomer.age_years && !validateAge(newCustomer.age_years)) {
            alert("Age must be between 0 and 120.");
            return;
        }

        const receivedStr = details.amount_received.trim();
        const receivedValue = receivedStr === '' ? calculations.netPayable : parseFloat(receivedStr);

        if (receivedValue > calculations.netPayable) {
            alert("INVALID! RECEIVED AMOUNT CANNOT EXCEED NET PAYABLE. LEAVE BLANK FOR FULL PAYMENT.");
            return;
        }

        if (calculations.amountDue < 0) {
            alert("Received amount cannot be more than the final amount.");
            return;
        }

        const validItems = items.filter(i => i.name && i.name.trim() !== '');
        if (validItems.length === 0) {
            alert("Please add at least one test/package.");
            return;
        }

        setShowPreview(true);
    };

    const handleConfirmSave = async () => {
        if (!user || !branch || isSubmitting) return;
        setIsSubmitting(true);

        const validItems = items.filter(i => i.name && i.name.trim() !== '');
        const payload = {
            customer_data: { id: selectedCustomer?.id, ...newCustomer },
            lab_id: parseInt(selectedLabId),
            package_list_id: parseInt(selectedListId),
            items: validItems.map(({ id, isFromDb, ...rest }) => ({
                ...rest,
                package_list_id: parseInt(selectedListId),
                discount: isNaN(rest.discount) ? 0 : rest.discount
            })),
            ...details,
            payment_method: isClientMode ? 'B2B Wallet Deduction' : details.payment_method,
            amount_received: isClientMode ? calculations.totalB2B.toString() : (details.amount_received.trim() === '' ? calculations.netPayable.toString() : details.amount_received),
            referred_by: details.referred_by || 'Self',
            amount_final: isClientMode ? calculations.totalB2B : calculations.netPayable,
            amount_due: isClientMode ? 0 : calculations.amountDue,
            total_mrp: calculations.totalMrp,
        };

        try {
            if (isEditMode) {
                await apiService.updateReceipt(parseInt(id!, 10), payload);
                if (user?.role === 'CLIENT') {
                    alert("Receipt saved successfully!");
                    navigate('/');
                } else {
                    navigate(`/receipt/${id}`);
                }
            } else {
                const { newReceipt, updatedUser } = await apiService.createReceipt(
                    payload,
                    user, branch, actingAsClient ? actingAsClient.id : undefined
                );
                if (updatedUser) {
                    if (actingAsClient) {
                        setActingAsClient(updatedUser);
                    } else {
                        updateUser(updatedUser);
                    }
                }
                if (user?.role === 'CLIENT') {
                    alert("Receipt saved successfully!");
                    navigate('/');
                } else {
                    navigate(`/receipt/${newReceipt.id}`);
                }
            }
        } catch (error) {
            alert(`Failed to save receipt: ${error}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDiscard = () => {
        if (window.confirm("Are you sure you want to discard this receipt? All entered data will be lost.")) {
            // Reset everything
            setItems([{ id: Date.now(), name: '', mrp: 0, b2b_price: 0, discount: 0, isFromDb: false }]);
            setNewCustomer({ prefix: 'Mr.', name: '', mobile: '', email: '', dob: '', age: '', age_years: '', age_months: '', age_days: '', gender: 'Male' });
            setSelectedCustomer(null);
            setCustomerSearch('');
            setCustomerMode('new');
            setSelectedLabId('');
            setSelectedListId('');
            setDetails({
                amount_received: '',
                due_amount_manual: '',
                num_tests: '',
                referred_by: '',
                payment_method: 'Cash',
                notes: '',
            });
            setShowPreview(false);
            setStep(1);
        }
    };

    const nextStep = () => {
        if (step === 1) {
            if (!newCustomer.name.trim()) {
                alert("Please enter the customer's name.");
                return;
            }
            const y = parseInt(newCustomer.age_years) || 0;
            const m = parseInt(newCustomer.age_months) || 0;
            const d = parseInt(newCustomer.age_days) || 0;
            if (!newCustomer.dob.trim() && !newCustomer.age_years.trim() && !newCustomer.age_months.trim() && !newCustomer.age_days.trim()) {
                alert("Please provide Age or Date of Birth.");
                return;
            }
            if (y === 0 && m === 0 && d === 0) {
                alert("Age cannot be 0Y 0M 0D. Please enter a valid age.");
                return;
            }
        } else if (step === 2) {
            if (!selectedLabId) {
                alert("Please select a laboratory.");
                return;
            }
            if (!selectedListId) {
                alert("Please select a rate category.");
                return;
            }
        } else if (step === 3) {
            const hasValidItem = items.some(i => i.name && i.name.trim() !== '');
            if (!hasValidItem) {
                alert("Please add at least one test/package.");
                return;
            }
        }
        setStep(prev => Math.min(4, prev + 1));
    };
    const prevStep = () => setStep(prev => Math.max(1, prev - 1));

    // Focus helpers
    const handleCustomerKeyDown = (e: React.KeyboardEvent, nextRef?: React.RefObject<HTMLInputElement> | 'tests') => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (nextRef === 'tests') {
                const firstItem = items[0];
                if (firstItem) itemRefs.current[firstItem.id]?.focus();
            } else if (nextRef && nextRef.current) {
                nextRef.current.focus();
            }
        }
    };

    const handleTestKeyDown = (e: React.KeyboardEvent, itemId: number) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const item = items.find(i => i.id === itemId);
            if (item && item.name) {
                // If it's the last item, wait for state update then focus next
                const index = items.findIndex(i => i.id === itemId);
                if (index === items.length - 1) {
                    setTimeout(() => {
                        const newLastItem = items[items.length - 1];
                        if (newLastItem && newLastItem.id !== itemId) {
                            itemRefs.current[newLastItem.id]?.focus();
                        }
                    }, 50);
                } else {
                    itemRefs.current[items[index + 1].id]?.focus();
                }
            }
        }
    };

    useEffect(() => {
        // When items length changes, focus the last one if it was just added
        const lastItem = items[items.length - 1];
        if (lastItem && !lastItem.name && items.length > 1) {
            itemRefs.current[lastItem.id]?.focus();
        }
    }, [items.length]);

    // --- RESTRUCTURED RENDER FUNCTIONS ---

    const renderCustomerStep = () => (
        <fieldset className="border-2 border-slate-200 p-4 rounded-xl space-y-4">
            <legend className="px-2 font-bold text-lg text-slate-700">Customer Information</legend>
            <div className="flex justify-between items-center bg-slate-50 p-2 rounded-lg mb-2">
                <span className="text-sm font-medium text-slate-600">
                    {customerMode === 'search' ? 'Search Existing' : 'Register New'}
                </span>
                {!isClientMode && (
                    <button type="button" onClick={() => customerMode === 'search' ? clearCustomer() : setCustomerMode('search')} className="text-blue-600 text-sm font-bold flex items-center gap-1">
                        {customerMode === 'search' ? <><i className="fa-solid fa-user-plus"></i> New</> : <><i className="fa-solid fa-magnifying-glass"></i> Search</>}
                    </button>
                )}
            </div>
            {customerMode === 'search' && (
                <div className="relative mb-2">
                    <input type="text" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} placeholder="Search name/mobile..." className="w-full p-3 bg-white border border-slate-300 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm" />
                    {customerSuggestions.length > 0 && (
                        <ul className="absolute z-50 w-full bg-white border border-slate-200 mt-1 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                            {customerSuggestions.map(cust => (
                                <li key={cust.id} onClick={() => handleSelectCustomer(cust)} className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-0 border-slate-100 transition-colors flex justify-between items-center text-sm">
                                    <span>{cust.name}</span>
                                    <span className="text-slate-400 text-xs font-mono">{cust.mobile}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            {selectedCustomer && (
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex justify-between items-center shadow-inner">
                    <span className="text-sm font-bold text-blue-800">CUST-{String(selectedCustomer.id).padStart(10, '0')}</span>
                    <button type="button" onClick={clearCustomer} className="text-red-500 font-bold text-xs">DISC</button>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex gap-2 md:col-span-2">
                    <CleanSelect options={prefixOptions.map(p => ({ value: p, label: p }))} value={newCustomer.prefix || ''} onChange={handlePrefixChange} disabled={selectedCustomer !== null} className="w-20" />
                    <input ref={nameRef} onKeyDown={e => handleCustomerKeyDown(e, mobileRef)} type="text" name="name" placeholder="Full Name" value={newCustomer.name} onChange={handleCustomerChange} disabled={selectedCustomer !== null} required className="flex-grow p-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-50 transition-all text-sm font-medium" />
                </div>

                {/* Gender Section */}
                <div className="md:col-span-2 pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Gender</label>
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

                <div className="md:col-span-2 pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 px-1">Age | DOB</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex gap-2">
                            <input ref={ageRef} onKeyDown={e => handleCustomerKeyDown(e, referredByRef)} type="number" name="age_years" placeholder="Years" max="120" value={newCustomer.age_years} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-1/3 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-blue-50 text-center" />
                            <input type="number" name="age_months" placeholder="Months" max="11" value={newCustomer.age_months} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-1/3 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-blue-50 text-center" />
                            <input type="number" name="age_days" placeholder="Days" max="31" value={newCustomer.age_days} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="w-1/3 p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-blue-50 text-center" />
                        </div>
                        <div className="relative">
                            <input type="date" name="dob" value={newCustomer.dob} onChange={handleCustomerChange} disabled={selectedCustomer !== null} className="p-3 border border-slate-200 rounded-xl text-sm w-full outline-none focus:ring-4 focus:ring-blue-50" />
                            {isMobileView && !newCustomer.dob && (
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs pointer-events-none">mm/dd/yyyy</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1 px-1">Referred By / Doctor</label>
                    <input ref={referredByRef} onKeyDown={e => handleCustomerKeyDown(e, 'tests')} type="text" value={details.referred_by || ''} onChange={e => setDetails({ ...details, referred_by: e.target.value })} className="w-full p-3 border border-slate-200 rounded-xl text-sm outline-none focus:ring-4 focus:ring-blue-50" placeholder="Self" />
                </div>

                {/* Contact Section: Mobile & Email */}
                <div className="md:col-span-2 pt-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">Contact</label>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Mobile Input */}
                        <input
                            ref={mobileRef}
                            onKeyDown={e => handleCustomerKeyDown(e, ageRef)}
                            type="tel"
                            name="mobile"
                            placeholder="Mobile No. (Optional)"
                            value={newCustomer.mobile}
                            onChange={handleCustomerChange}
                            disabled={selectedCustomer !== null}
                            pattern="\d{10}"
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-50 text-sm bg-white"
                        />
                        {/* Email Input */}
                        <input
                            type="email"
                            name="email"
                            placeholder="Email Address (Optional)"
                            value={newCustomer.email || ''}
                            onChange={handleCustomerChange}
                            disabled={selectedCustomer !== null}
                            className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-blue-50 text-sm bg-white"
                        />
                    </div>
                </div>
            </div>
        </fieldset>
    );

    const renderReceiptDetailsStep = () => {
        const showLabSelector = labs.length > 1;
        const showListSelector = packageLists.length > 1;

        if (labs.length === 0) return null;

        return (
            <fieldset className="border-2 border-slate-200 p-4 rounded-xl space-y-4">
                <legend className="px-2 font-bold text-lg text-slate-700">Lab & Rates Assignment</legend>
                <div className="space-y-4">
                    {showLabSelector ? (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Laboratory</label>
                            <CleanSelect options={labs.map(lab => ({ value: lab.id.toString(), label: lab.name }))} value={selectedLabId} onChange={val => {
                                setSelectedLabId(val);
                                setItems([{ id: Date.now(), name: '', mrp: 0, b2b_price: 0, discount: 0, isFromDb: false }]);
                            }} placeholder="Select Lab" />
                        </div>
                    ) : (
                        labs.length === 1 && (
                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-650 font-bold">
                                <span className="text-slate-400 uppercase tracking-widest text-[9px] block mb-0.5">Assigned Laboratory</span>
                                <i className="fa-solid fa-building mr-2 text-slate-800"></i> {labs[0].name}
                            </div>
                        )
                    )}
                    {showListSelector ? (
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-1 px-1">Rate Category</label>
                            <CleanSelect options={packageLists.map(list => ({ value: list.id.toString(), label: list.name }))} value={selectedListId} onChange={val => {
                                setSelectedListId(val);
                                setItems([{ id: Date.now(), name: '', mrp: 0, b2b_price: 0, discount: 0, isFromDb: false }]);
                            }} disabled={!selectedLabId} placeholder="Select Rate System" />
                        </div>
                    ) : null}
                </div>
            </fieldset>
        );
    };

    const renderPackagesStep = () => (
        <div className="flex flex-col">
            <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                <h3 className="font-bold text-lg text-slate-700">Select Tests</h3>
                <div className="flex items-center gap-3 flex-wrap">
                    {isClientMode && (
                        <button
                            type="button"
                            onClick={() => setShowB2BDetails(!showB2BDetails)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                showB2BDetails 
                                    ? 'bg-green-50 text-green-700 border-green-200' 
                                    : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}
                        >
                            <i className={`fa-solid ${showB2BDetails ? 'fa-eye' : 'fa-eye-slash'} mr-1.5`}></i>
                            B2B Prices: {showB2BDetails ? 'SHOWING' : 'HIDDEN'}
                        </button>
                    )}
                    <span className="text-[10px] md:text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-semibold uppercase tracking-widest border border-blue-200 shadow-sm">
                        {isMobileView ? `Tests: ${calculations.totalTests}` : `Total number of tests: ${calculations.totalTests}`}
                    </span>
                </div>
            </div>

            <fieldset className="border-2 border-slate-200 p-4 rounded-xl space-y-4">

                <div className="hidden md:grid md:grid-cols-12 gap-2 text-xs font-black text-slate-400 uppercase tracking-tighter mb-2 px-1">
                    <div className={`${(isClientMode && showB2BDetails) ? 'col-span-5' : 'col-span-7'}`}>Test Name/Package</div>
                    {isClientMode && showB2BDetails && <div className="col-span-2 text-right">B2B Cost</div>}
                    <div className="col-span-2 text-right">MRP (₹)</div>
                    <div className="col-span-1 text-right">Disc %</div>
                    <div className="col-span-1 text-right px-1">Disc ₹</div>
                    <div className="col-span-1"></div>
                </div>

                <div className="space-y-3">
                    {items.map((item) => {
                        const otherSelectedNames = new Set(items.filter(i => i.id !== item.id && i.name).map(i => i.name));
                        const dropdownOptions = packages
                            .filter(p => p.name && p.name.trim() !== '' && !otherSelectedNames.has(p.name))
                            .map(p => ({ value: p.name, label: p.name, code_name: p.code_name }));
                        return (
                            <div key={item.id} className="grid grid-cols-12 gap-2 items-end border-b pb-4 last:border-0 hover:bg-slate-50 transition-colors">
                                <div className={`${(isClientMode && showB2BDetails) ? 'col-span-12 md:col-span-5' : 'col-span-12 md:col-span-7'}`}>
                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 block">Test Name</label>
                                    <SearchableDropdown ref={el => itemRefs.current[item.id] = el} options={dropdownOptions} value={item.name} onChange={name => handlePackageSelect(item.id, name)} onKeyDown={e => handleTestKeyDown(e, item.id)} placeholder="Choose Tests..." disabled={!selectedListId} />
                                </div>
                                {isClientMode && showB2BDetails && (
                                    <div className="col-span-3 md:col-span-2 text-right">
                                        <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 block">B2B</label>
                                        <div className="p-2.5 bg-green-50 text-green-700 rounded-xl font-bold text-xs border border-green-100">₹{item.b2b_price.toFixed(0)}</div>
                                    </div>
                                )}
                                <div className="col-span-4 md:col-span-2">
                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 block">MRP</label>
                                    <input type="number" step="0.01" value={item.mrp} onChange={e => handleItemChange(item.id, 'mrp', parseFloat(e.target.value))} required className="w-full p-2.5 border border-slate-200 rounded-xl text-right text-xs font-bold" readOnly={item.isFromDb || isClientMode} />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 block">Disc %</label>
                                    <input type="number" step="0.1" value={item.discount} onChange={e => handleItemChange(item.id, 'discount', parseFloat(e.target.value))} className="w-full p-2.5 border border-slate-200 rounded-xl text-right text-xs font-bold" />
                                </div>
                                <div className="col-span-2 md:col-span-1">
                                    <label className="md:hidden text-[10px] font-bold text-slate-400 uppercase mb-1 block">Disc ₹</label>
                                    <div className="p-2.5 bg-slate-50 text-slate-700 rounded-xl text-right font-bold text-xs border border-slate-100 h-[38px] flex items-center justify-end">
                                        ₹{(item.mrp * (item.discount / 100)).toFixed(0)}
                                    </div>
                                </div>
                                <div className="col-span-1 md:col-span-1 text-right flex justify-end items-center h-10">
                                    <button type="button" onClick={() => removeItem(item.id)} className="w-9 h-9 flex items-center justify-center bg-red-50 text-red-500 rounded-full border border-red-200 hover:bg-red-500 hover:text-white transition-all shadow-sm"><i className="fa-solid fa-trash-can text-sm"></i></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <button type="button" onClick={addItem} disabled={!selectedListId} className="w-full md:w-auto mt-2 px-6 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-bold shadow-lg shadow-slate-200 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:bg-slate-300">
                    <i className="fa-solid fa-plus"></i> Add Another Test
                </button>
            </fieldset>
        </div>
    );
    const renderPaymentStep = () => (
        <fieldset className="border-2 border-slate-200 p-4 rounded-xl space-y-4">
            <legend className="px-2 font-bold text-lg text-slate-700">Payment & Finalize</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl space-y-2">
                    <label className="text-xs font-bold text-slate-400 uppercase block tracking-wider">Bulk Discount (%)</label>
                    <div className="flex gap-2">
                        <input type="number" value={applyDiscount} onChange={e => setApplyDiscount(e.target.value)} className="flex-grow p-3 border border-slate-200 rounded-xl text-sm" placeholder="0%" />
                        <button type="button" onClick={handleApplyDiscountToAll} className="px-4 bg-slate-800 text-white rounded-xl"><i className="fa-solid fa-check"></i></button>
                    </div>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Received Amount</label>
                        <input type="number" value={details.amount_received} onChange={e => setDetails({ ...details, amount_received: e.target.value })} placeholder="Full Payment (Leave Blank)" className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-blue-700" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Payment via</label>
                        <CleanSelect options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }, { value: 'UPI', label: 'UPI' }, { value: 'Mixed', label: 'Mixed' }, { value: 'Other', label: 'Other' }]} value={details.payment_method} onChange={val => setDetails({ ...details, payment_method: val })} />
                    </div>
                </div>
                <div className="md:col-span-2">
                    <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Administrative Notes</label>
                    <textarea value={details.notes} onChange={e => setDetails({ ...details, notes: e.target.value })} rows={2} className="w-full p-3 border border-slate-200 rounded-xl text-sm" placeholder="Special instructions..." />
                </div>
                <div className="md:col-span-2 bg-slate-50 border border-slate-200 p-6 rounded-3xl space-y-4">
                    <div className="grid grid-cols-2 gap-y-3 text-sm">
                        <span className="text-slate-500">Gross Total (MRP)</span>
                        <span className="text-right font-medium">₹{calculations.totalMrp.toFixed(0)}</span>

                        <span className="text-slate-500">Total number of tests</span>
                        <span className="text-right font-bold text-blue-700">{calculations.totalTests}</span>
                        {isClientMode && (
                            <>
                                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">B2B Total (Cost)</span>
                                <span className="text-right font-black text-green-700 mt-1">₹{calculations.totalB2B.toFixed(0)}</span>
                            </>
                        )}

                        <span className="text-slate-500">Total Discount</span>
                        <span className="text-right font-medium text-green-600">- ₹{calculations.totalDiscountAmount.toFixed(0)}</span>

                        <div className="col-span-2 border-t border-slate-200 my-1"></div>

                        <span className="text-lg font-black text-slate-900">Net Payable</span>
                        <span className="text-right text-xl font-black text-blue-600">₹{calculations.netPayable.toFixed(0)}</span>

                        <span className="text-sm text-slate-500 mt-2">Amount Received</span>
                        <span className="text-right font-bold text-slate-700 mt-2">₹{calculations.received.toFixed(0)}</span>
                    </div>

                    <div className="bg-orange-50 border border-orange-100 p-4 rounded-2xl flex justify-between items-center">
                        <span className="text-xs font-black text-orange-600 uppercase tracking-widest">Pending Balance</span>
                        <span className="text-xl font-black text-orange-700">₹{calculations.amountDue.toFixed(0)}</span>
                    </div>
                </div>
            </div>
        </fieldset>
    );

    if (showPreview) {
        return (
            <div className="p-4 sm:p-8 max-w-4xl mx-auto">
                <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6 border border-slate-100">
                    <header className="border-b border-slate-100 pb-5">
                        <h1 className="text-3xl font-black text-slate-800 tracking-tight">Review Order</h1>
                        <p className="text-sm font-medium text-slate-400 tracking-wide uppercase">Final Validation</p>
                    </header>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <section className="space-y-3">
                            <h3 className="font-black text-xs text-blue-600 uppercase tracking-widest">Customer</h3>
                            <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                                <p className="font-bold text-slate-800">{newCustomer.prefix} {newCustomer.name}</p>
                                <p className="text-sm text-slate-500">{newCustomer.mobile || 'No Mobile'}</p>
                                <p className="text-sm text-slate-500">
                                    {newCustomer.age_years || '0'}Y {newCustomer.age_months || '0'}M {newCustomer.age_days || '0'}D • {newCustomer.gender}
                                </p>
                            </div>
                        </section>

                        <section className="space-y-3">
                            <h3 className="font-black text-xs text-blue-600 uppercase tracking-widest">Receipt Info</h3>
                            <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                                <p className="font-bold text-slate-800">{labs.find(l => l.id === parseInt(selectedLabId))?.name}</p>
                                {!isClientMode && (
                                    <p className="text-sm text-slate-500">{packageLists.find(p => p.id === parseInt(selectedListId))?.name}</p>
                                )}
                                <p className="text-sm font-bold text-slate-600">Payment: {details.payment_method}</p>
                                <p className="text-sm text-slate-500 font-semibold">Doctor / Reference: {details.referred_by || 'Self'}</p>
                            </div>
                        </section>
                    </div>

                    <section className="space-y-3">
                        <h3 className="font-black text-xs text-blue-600 uppercase tracking-widest flex justify-between">
                            <span>Tests & Pricing</span>
                            <span className="bg-blue-50 px-2 py-0.5 rounded text-blue-800 font-black">Count: {calculations.totalTests}</span>
                        </h3>
                        <div className="overflow-hidden border border-slate-100 rounded-xl">
                            <table className="min-w-full text-sm">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="p-3 text-left font-bold text-slate-600">Package</th>
                                        {isClientMode && <th className="p-3 text-right font-bold text-slate-600">B2B</th>}
                                        <th className="p-3 text-right font-bold text-slate-600">MRP</th>
                                        <th className="p-3 text-right font-bold text-slate-600">Net</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {items.filter(i => i.name).map((item, idx) => (
                                        <tr key={idx}>
                                            <td className="p-3 font-medium">{item.name}</td>
                                            {isClientMode && <td className="p-3 text-right text-green-600 font-bold">₹{item.b2b_price.toFixed(0)}</td>}
                                            <td className="p-3 text-right text-slate-400">₹{item.mrp.toFixed(0)}</td>
                                            <td className="p-3 text-right font-bold">₹{(item.mrp * (1 - item.discount / 100)).toFixed(0)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section className="bg-slate-900 text-white p-6 rounded-2xl space-y-3 shadow-2xl">
                        {!isClientMode && (
                            <div className="flex justify-between text-sm opacity-60"><span>Gross Value</span> <span>₹{calculations.totalMrp.toFixed(2)}</span></div>
                        )}
                        {isClientMode && (
                            <div className="flex justify-between text-sm font-bold text-green-400"><span>B2B Total Cost</span> <span>₹{calculations.totalB2B.toFixed(2)}</span></div>
                        )}
                        {!isClientMode && (
                            <div className="flex justify-between text-sm text-red-400 font-bold"><span>Total Discount</span> <span>- ₹{calculations.totalDiscountAmount.toFixed(2)}</span></div>
                        )}
                        <div className="flex justify-between text-2xl font-black border-t border-slate-800 pt-3 text-green-400"><span>NET PAYABLE</span> <span>₹{calculations.netPayable.toFixed(0)}</span></div>
                        <div className="flex justify-between text-sm font-bold text-blue-400 pt-1"><span>Received</span> <span>₹{calculations.received.toFixed(0)}</span></div>
                        <div className="flex justify-between text-lg font-black text-orange-400"><span>DUE BALANCE</span> <span>₹{calculations.amountDue.toFixed(0)}</span></div>
                    </section>

                    <div className="flex flex-col sm:flex-row gap-4 pt-4">
                        <button type="button" onClick={handleDiscard} className="flex-1 py-4 px-4 bg-slate-50 text-slate-400 font-black rounded-xl hover:bg-red-50 hover:text-red-500 transition-all uppercase text-xs tracking-widest">
                            Discard
                        </button>
                        <button type="button" onClick={() => setShowPreview(false)} className="flex-1 py-4 px-4 bg-slate-100 text-slate-600 font-black rounded-xl hover:bg-slate-800 hover:text-white transition-all uppercase text-xs tracking-widest">
                            Edit
                        </button>
                        <button type="button" onClick={handleConfirmSave} disabled={isSubmitting || isLocked} className="flex-[2] py-4 px-4 bg-green-500 text-white font-black rounded-xl hover:bg-green-600 shadow-xl shadow-green-100 transform active:scale-95 transition-all flex items-center justify-center gap-2 uppercase text-sm tracking-widest disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed">
                            {isSubmitting ? 'Saving...' : 'Save & Generate Receipt'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-8 max-w-5xl mx-auto min-h-screen">
            {isLocked && (
                <div className="bg-red-50 border border-red-250 text-red-850 p-4 rounded-2xl mb-6 text-sm font-bold flex items-start gap-3 shadow-sm animate-pulse border-dashed">
                    <i className="fa-solid fa-lock text-red-650 text-xl shrink-0 mt-0.5 animate-bounce"></i>
                    <span>This receipt is locked because it has already been finalized by data entry. To edit it, you must first mark it as incomplete from the Data Entry Workspace.</span>
                </div>
            )}
            <form onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA' && (e.target as HTMLElement).getAttribute('type') !== 'submit') { e.preventDefault(); } }} className="space-y-6">
                {!isMobileView ? (
                    <div className="bg-white p-8 rounded-2xl shadow-2xl space-y-8 border border-slate-100">
                        <PageHeader
                            title="New Receipt"
                            subtitle={
                                <div className="flex items-center gap-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    <span>{branch?.name}</span>
                                    <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                    <span>{user?.username}</span>
                                </div>
                            }
                        />

                        {renderCustomerStep()}
                        {renderReceiptDetailsStep()}
                        {renderPackagesStep()}
                        {!isClientMode && renderPaymentStep()}

                        <div className="pt-6 border-t border-slate-100">
                            <button type="submit" disabled={isSubmitting || isLocked} className="w-full py-5 bg-blue-600 text-white font-black text-lg rounded-2xl hover:bg-blue-700 shadow-2xl shadow-blue-100 transform active:scale-[0.98] transition-all uppercase tracking-widest disabled:bg-slate-300 disabled:shadow-none disabled:cursor-not-allowed">
                                {isSubmitting ? 'Processing...' : 'Preview & Save'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white rounded-3xl shadow-2xl border border-slate-50 flex flex-col min-h-[85vh]">
                        <header className="p-4 border-b border-slate-100 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                                    <i className="fa-solid fa-list-check"></i>
                                </div>
                                <h2 className="font-bold text-slate-800 text-sm uppercase tracking-wide">Step {step} of {isClientMode ? 3 : 4}</h2>
                            </div>
                            <button type="button" onClick={handleDiscard} className="text-slate-400 hover:text-red-500 transition-colors">
                                <i className="fa-solid fa-circle-xmark text-xl"></i>
                            </button>
                        </header>

                        <div className="p-5 flex-grow overflow-y-auto">
                            {step === 1 && renderCustomerStep()}
                            {step === 2 && renderReceiptDetailsStep()}
                            {step === 3 && renderPackagesStep()}
                            {step === 4 && !isClientMode && renderPaymentStep()}
                        </div>

                        <footer className="p-6 bg-slate-50 rounded-b-3xl border-t border-slate-100 grid grid-cols-2 gap-4">
                            {step > 1 ? (
                                <button type="button" onClick={prevStep} className="py-4 bg-white border border-slate-200 text-slate-600 font-bold rounded-2xl active:scale-95 transition-all text-xs uppercase tracking-widest">
                                    Back
                                </button>
                            ) : (
                                <Link to={user?.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard'} className="py-4 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition-all font-bold rounded-2xl text-center text-xs uppercase tracking-widest flex items-center justify-center">
                                    Exit
                                </Link>
                            )}

                            {step < (isClientMode ? 3 : 4) ? (
                                <button
                                    key="next-btn"
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        nextStep();
                                    }}
                                    className="py-4 bg-blue-600 shadow-blue-100 text-white font-bold rounded-2xl active:scale-95 transition-all shadow-lg text-xs uppercase tracking-widest disabled:bg-slate-300 disabled:shadow-none"
                                >
                                    Next
                                </button>
                            ) : (
                                <button
                                    key="review-btn"
                                    type="submit"
                                    disabled={isSubmitting || isLocked}
                                    className="py-4 bg-green-500 shadow-green-100 text-white font-bold rounded-2xl active:scale-95 transition-all shadow-lg text-xs uppercase tracking-widest disabled:bg-slate-300 disabled:shadow-none"
                                >
                                    {isSubmitting ? 'Processing...' : 'Review Order'}
                                </button>
                            )}
                        </footer>
                    </div>
                )}
            </form>
        </div>
    );
};

export default ReceiptForm;