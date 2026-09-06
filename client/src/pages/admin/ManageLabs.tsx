import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/PageHeader';
import { apiService } from '../../services/api';
import { Lab, PackageList, Package, User, MasterPackage } from '../../types';
import SearchableDropdown from '../../components/SearchableDropdown';
import { RatelistLinkedClientsTooltip, RatelistMarkupTagTooltip, PriceAlertTooltip } from '../../components/RatelistTooltips';
import ExcelImportModal from '../../components/ExcelImportModal';

declare var ExcelJS: any;

const ManageLabs: React.FC = () => {
    const [labs, setLabs] = useState<Lab[]>([]);
    const [allLists, setAllLists] = useState<PackageList[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [users, setUsers] = useState<User[]>([]);

    // Master Ratelist & Canonical Directory States
    const [masterPackages, setMasterPackages] = useState<MasterPackage[]>([]);
    const [isMasterOpen, setIsMasterOpen] = useState(false);
    const [masterSearch, setMasterSearch] = useState('');
    const [newMasterName, setNewMasterName] = useState('');
    const [aliasModalPkg, setAliasModalPkg] = useState<MasterPackage | null>(null);
    const [newAliasName, setNewAliasName] = useState('');

    // Global Excel Upload Modals
    const [excelImportTargetList, setExcelImportTargetList] = useState<PackageList | null>(null);
    const [isMasterExcelModalOpen, setIsMasterExcelModalOpen] = useState(false);

    const parseMarkupDiscount = (name: string) => {
        let match = name.match(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+([^)]+))?\)/i);
        if (match) {
            const pctStr = match[1].replace('+', '').replace('-', '');
            const isMarkup = !match[1].startsWith('-');
            const sourceName = match[3]?.trim();
            return { pctStr, isMarkup, sourceName };
        }
        match = name.match(/([+-]?\d+(?:\.\d+)?)\s*%\s*(Markup|Discount|PROFIT)?/i);
        if (match) {
            const value = parseFloat(match[1]);
            const pctStr = `${Math.abs(value)}%`;
            const type = match[2]?.toUpperCase();
            let isMarkup = value >= 0;
            if (type === 'DISCOUNT') {
                isMarkup = false;
            }
            return { pctStr, isMarkup, sourceName: undefined };
        }
        return null;
    };

    const getCleanName = (name: string) => {
        const cleaned = name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim();
        if (cleaned.length === 0) return name;
        return cleaned;
    };
    const [renamingListId, setRenamingListId] = useState<number | null>(null);
    const [renamingListName, setRenamingListName] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Form/Modal States
    const [newLabName, setNewLabName] = useState('');
    const [expandedLabId, setExpandedLabId] = useState<number | null>(null);

    // Sync Assignment Modal (Checkbox picker)
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [syncingLab, setSyncingLab] = useState<Lab | null>(null);
    const [assignedLists, setAssignedLists] = useState<Set<number>>(new Set());

    // Inventory Editor Modal States
    const [isInventoryOpen, setIsInventoryOpen] = useState(false);
    const [editingList, setEditingList] = useState<PackageList | null>(null);
    const [packages, setPackages] = useState<Package[]>([]);
    const [originalPackages, setOriginalPackages] = useState<Package[]>([]);
    const [inventorySearchQuery, setInventorySearchQuery] = useState('');
    const [newPackage, setNewPackage] = useState({ name: '', mrp: '', b2b_price: '', code_name: '' });

    // Clone/Sync Wizard States
    const [isCloneOpen, setIsCloneOpen] = useState(false);
    const [cloneTargetList, setCloneTargetList] = useState<PackageList | null>(null);
    const [cloneSourceListId, setCloneSourceListId] = useState<string>('');
    const [cloneDiscount, setCloneDiscount] = useState<string>('0');
    const [cloneMarkup, setCloneMarkup] = useState<string>('0');

    // Quick Add List States per Lab
    const [quickAddListName, setQuickAddListName] = useState<Record<number, string>>({});
    const [quickAssignListId, setQuickAssignListId] = useState<Record<number, string>>({});

    const handleExpandLab = (labId: number | null) => {
        setExpandedLabId(labId);
        if (labId !== null) {
            setTimeout(() => {
                const element = document.getElementById(`lab-accordion-${labId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [labsData, listsData, usersData, masterData] = await Promise.all([
                apiService.getLabs(),
                apiService.getPackageLists(),
                apiService.getUsers(),
                apiService.getMasterPackages()
            ]);
            setLabs(labsData);
            setAllLists(listsData.filter((l: any) => !l.name.startsWith('[DELETED]')));
            setUsers(usersData);
            setMasterPackages(masterData);
        } catch (error) {
            console.error("Failed to fetch lab data", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRenameList = async (listId: number) => {
        if (!renamingListName.trim()) return;
        try {
            const list = allLists.find(l => l.id === listId);
            let finalName = renamingListName.trim();
            if (list) {
                const match = list.name.match(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i);
                if (match) {
                    finalName = `${finalName} ${match[0]}`;
                }
            }
            await apiService.updatePackageListName(listId, finalName);
            setRenamingListId(null);
            fetchData();
        } catch (error) {
            alert(`Error renaming list: ${error}`);
        }
    };

    const filteredLabs = React.useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        if (!query) return labs;
        return labs.filter(l => l.name.toLowerCase().includes(query));
    }, [labs, searchTerm]);

    const handleAddLab = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await apiService.createLab(newLabName);
            setNewLabName('');
            fetchData();
        } catch (error) {
            alert(`Error adding lab: ${error}`);
        }
    };

    const handleDeleteLab = async (labId: number) => {
        if (window.confirm("Are you sure you want to decommission this laboratory? This will soft-delete the lab and all of its associated rate databases, keeping historical ledger data intact. This action cannot be undone.")) {
            try {
                await apiService.deleteLab(labId);
                if (expandedLabId === labId) setExpandedLabId(null);
                fetchData();
            } catch (error) {
                alert(`Error deleting lab: ${error}`);
            }
        }
    };

    // ----------------------------------------------------
    // Sync Assignments Modal (Checkbox picker)
    // ----------------------------------------------------
    const openSyncModal = (lab: Lab) => {
        setSyncingLab(lab);
        setAssignedLists(new Set(lab.assigned_list_ids || []));
        setIsSyncModalOpen(true);
    };

    const handleListToggle = (listId: number) => {
        const list = allLists.find(l => l.id === listId);
        const isClone = list ? (/\(.*?\bfrom\b.*?\)/i.test(list.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(list.name)) : false;
        if (list && !isClone && list.name.endsWith(' Mother Ratelist') && syncingLab && list.name === `${syncingLab.name} Mother Ratelist`) {
            return;
        }
        setAssignedLists(prev => {
            const newSet = new Set(prev);
            if (newSet.has(listId)) newSet.delete(listId);
            else newSet.add(listId);
            return newSet;
        });
    };

    const handleUpdateAssignments = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!syncingLab) return;
        try {
            await apiService.updateLabLists(syncingLab.id, Array.from(assignedLists));
            setIsSyncModalOpen(false);
            setSyncingLab(null);
            fetchData();
        } catch (error) {
            alert(`Error updating assignments: ${error}`);
        }
    };

    // ----------------------------------------------------
    // Quick Creation and Assignment
    // ----------------------------------------------------
    const handleQuickCreateList = async (labId: number) => {
        const name = quickAddListName[labId]?.trim();
        if (!name) return;

        try {
            const newList = await apiService.createPackageList(name);
            const currentLab = labs.find(l => l.id === labId);
            if (currentLab) {
                const updatedListIds = [...(currentLab.assigned_list_ids || []), newList.id];
                await apiService.updateLabLists(labId, updatedListIds);
            }
            setQuickAddListName(prev => ({ ...prev, [labId]: '' }));
            fetchData();
        } catch (error) {
            alert(`Failed to create and assign rate list: ${error}`);
        }
    };

    const handleQuickAssignList = async (labId: number) => {
        const listIdStr = quickAssignListId[labId];
        if (!listIdStr) return;
        const listId = parseInt(listIdStr, 10);

        try {
            const currentLab = labs.find(l => l.id === labId);
            if (currentLab) {
                if (currentLab.assigned_list_ids?.includes(listId)) {
                    alert("This database is already assigned to this lab.");
                    return;
                }
                const updatedListIds = [...(currentLab.assigned_list_ids || []), listId];
                await apiService.updateLabLists(labId, updatedListIds);
            }
            setQuickAssignListId(prev => ({ ...prev, [labId]: '' }));
            fetchData();
        } catch (error) {
            alert(`Failed to assign rate list: ${error}`);
        }
    };

    const handleUnassignList = async (labId: number, listId: number) => {
        if (window.confirm("Are you sure you want to unassign this rate database from this laboratory? The database itself will not be deleted.")) {
            try {
                const currentLab = labs.find(l => l.id === labId);
                if (currentLab) {
                    const updatedListIds = (currentLab.assigned_list_ids || []).filter(id => id !== listId);
                    await apiService.updateLabLists(labId, updatedListIds);
                }
                fetchData();
            } catch (error) {
                alert(`Error unassigning database: ${error}`);
            }
        }
    };

    const handleDeleteList = async (listId: number) => {
        if (window.confirm("CAUTION: Are you sure you want to completely delete this rate database and ALL its packages? This action is permanent.")) {
            try {
                await apiService.deletePackageList(listId);
                fetchData();
            } catch (error) {
                alert(`Error deleting database: ${error}`);
            }
        }
    };

    // ----------------------------------------------------
    // Master Packages & Aliases Handlers
    // ----------------------------------------------------
    const filteredMasterPackages = React.useMemo(() => {
        const q = masterSearch.toLowerCase().trim();
        if (!q) return masterPackages;
        return masterPackages.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.aliases && p.aliases.toLowerCase().includes(q))
        );
    }, [masterPackages, masterSearch]);

    const handleAddMasterPackage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMasterName.trim()) return;
        try {
            await apiService.createMasterPackage(newMasterName.trim());
            setNewMasterName('');
            fetchData();
        } catch (err: any) {
            alert("Failed to add master package: " + (err.message || err));
        }
    };

    const handleDeleteMasterPackage = async (id: number) => {
        if (window.confirm("Are you sure you want to remove this package from the Master Ratelist?")) {
            try {
                await apiService.deleteMasterPackage(id);
                fetchData();
            } catch (err: any) {
                alert("Failed to delete master package: " + (err.message || err));
            }
        }
    };

    const handleAddAlias = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!aliasModalPkg || !newAliasName.trim()) return;
        try {
            await apiService.addMasterPackageAlias(aliasModalPkg.id, newAliasName.trim());
            setNewAliasName('');
            setAliasModalPkg(null);
            fetchData();
        } catch (err: any) {
            alert("Failed to add alias: " + (err.message || err));
        }
    };

    const handleAcceptMissingMaster = async (missingNames: string[]) => {
        if (!editingList || missingNames.length === 0) return;
        try {
            await apiService.acceptMasterPackages(editingList.id, missingNames);
            const pkgs = await apiService.getPackagesForList(editingList.id);
            setPackages(pkgs);
            setOriginalPackages(JSON.parse(JSON.stringify(pkgs)));
            const updatedLists = await apiService.getPackageLists();
            setAllLists(updatedLists.filter((l: any) => !l.name.startsWith('[DELETED]')));
            const updatedEditingList = updatedLists.find((l: any) => l.id === editingList.id);
            if (updatedEditingList) setEditingList(updatedEditingList);
        } catch (err: any) {
            alert("Failed to accept master packages: " + (err.message || err));
        }
    };

    // ----------------------------------------------------
    // Excel Import Handlers (via Global ExcelImportModal)
    // ----------------------------------------------------
    const handleMasterExcelImport = async (parsedData: any[], mode: 'OVERWRITE' | 'APPEND') => {
        try {
            setIsLoading(true);
            const res = await apiService.bulkUploadMasterPackages(parsedData, mode);
            alert(res.message);
            fetchData();
        } catch (err: any) {
            alert("Master Ratelist Import failed: " + (err.message || err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const handleRatelistExcelImport = async (parsedData: any[], mode: 'OVERWRITE' | 'APPEND') => {
        if (!excelImportTargetList) return;
        try {
            setIsLoading(true);
            const { inserted, updated } = await apiService.uploadPackages(
                excelImportTargetList.id,
                parsedData,
                mode
            );
            alert(`Import complete (${mode === 'OVERWRITE' ? 'Overwrite' : 'Append'})! ${inserted} packages added, ${updated} packages updated.`);
            fetchData();
            if (isInventoryOpen && editingList?.id === excelImportTargetList.id) {
                const pkgs = await apiService.getPackagesForList(excelImportTargetList.id);
                setPackages(pkgs);
                setOriginalPackages(JSON.parse(JSON.stringify(pkgs)));
            }
        } catch (err: any) {
            alert("Ratelist Import failed: " + (err.message || err));
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    // ----------------------------------------------------
    // Package Inventory Editor Modal
    // ----------------------------------------------------
    const openInventoryModal = async (list: PackageList) => {
        setEditingList(list);
        setIsInventoryOpen(true);
        setInventorySearchQuery('');
        try {
            const pkgs = await apiService.getPackagesForList(list.id);
            setPackages(pkgs);
            setOriginalPackages(JSON.parse(JSON.stringify(pkgs)));
        } catch (error) {
            console.error("Failed to fetch packages", error);
        }
    };

    const handlePackageChange = (id: number, field: 'name' | 'mrp' | 'b2b_price' | 'code_name', value: string | number) => {
        setPackages(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleSavePackage = async (pkg: Package) => {
        try {
            await apiService.updatePackageInList(pkg);
            setOriginalPackages(prev => prev.map(o => o.id === pkg.id ? JSON.parse(JSON.stringify(pkg)) : o));
            alert("Package item saved!");
        } catch (error) {
            alert(`Error saving package: ${error}`);
        }
    };

    const handleDeletePackage = async (packageId: number) => {
        if (window.confirm("Are you sure you want to permanently delete this package? This cannot be undone.")) {
            try {
                await apiService.deletePackageFromList(packageId);
                setPackages(prev => prev.filter(p => p.id !== packageId));
                setOriginalPackages(prev => prev.filter(o => o.id !== packageId));
                fetchData();
            } catch (error) {
                alert(`Error deleting package: ${error}`);
            }
        }
    };

    const handleAddNewPackage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingList) return;
        try {
            const newPkg = await apiService.addPackageToList({
                name: newPackage.name,
                mrp: parseFloat(newPackage.mrp),
                b2b_price: parseFloat(newPackage.b2b_price),
                code_name: newPackage.code_name || undefined,
                package_list_id: editingList.id
            });
            setPackages(prev => [...prev, newPkg]);
            setOriginalPackages(prev => [...prev, JSON.parse(JSON.stringify(newPkg))]);
            setNewPackage({ name: '', mrp: '', b2b_price: '', code_name: '' });
            fetchData();
        } catch (error) {
            alert(`Error adding package: ${error}`);
        }
    };

    const filteredInventoryPackages = React.useMemo(() => {
        const q = inventorySearchQuery.toLowerCase().trim();
        if (!q) return packages;
        return packages.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.code_name && p.code_name.toLowerCase().includes(q))
        );
    }, [packages, inventorySearchQuery]);

    const hasEdits = React.useMemo(() => {
        if (packages.length !== originalPackages.length) return true;
        return packages.some(pkg => {
            const orig = originalPackages.find(o => o.id === pkg.id);
            if (!orig) return true;
            return pkg.name !== orig.name ||
                pkg.mrp !== orig.mrp ||
                pkg.b2b_price !== orig.b2b_price ||
                (pkg.code_name || '') !== (orig.code_name || '');
        });
    }, [packages, originalPackages]);

    const handleGlobalSave = async () => {
        try {
            const modified = packages.filter(pkg => {
                const orig = originalPackages.find(o => o.id === pkg.id);
                if (!orig) return false;
                return pkg.name !== orig.name ||
                    pkg.mrp !== orig.mrp ||
                    pkg.b2b_price !== orig.b2b_price ||
                    (pkg.code_name || '') !== (orig.code_name || '');
            });

            if (modified.length === 0) return;

            setIsLoading(true);
            await Promise.all(modified.map(pkg => apiService.updatePackageInList(pkg)));
            setOriginalPackages(JSON.parse(JSON.stringify(packages)));
            alert("All package inventory edits saved!");
            fetchData();
        } catch (error) {
            alert(`Failed to save edits: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ----------------------------------------------------
    // Clone / Sync Wizard Modal
    // ----------------------------------------------------
    const openCloneModal = (list: PackageList, parentLab: Lab) => {
        setCloneTargetList(list);

        // Auto select that lab's mother ratelist
        const motherList = allLists.find(l => l.name === `${parentLab.name} Mother Ratelist`);
        if (motherList) {
            setCloneSourceListId(motherList.id.toString());
        } else {
            setCloneSourceListId('');
        }

        setCloneDiscount('0');
        setCloneMarkup('0');
        setIsCloneOpen(true);
    };

    const handleCloneSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cloneTargetList || !cloneSourceListId) return;

        try {
            const sourceId = parseInt(cloneSourceListId, 10);
            const disc = parseFloat(cloneDiscount) || 0;
            const mark = parseFloat(cloneMarkup) || 0;

            const res = await apiService.clonePackageList(cloneTargetList.id, sourceId, disc, mark);

            // Auto rename target list name to store markup/discount and source list name
            const sourceList = allLists.find(l => l.id === sourceId);
            const sourceName = sourceList ? sourceList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim() : 'Mother Database';
            const cleanTargetName = cloneTargetList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim();

            let finalTargetName = cleanTargetName;
            if (mark > 0) {
                finalTargetName = `${cleanTargetName} (+${mark}% Markup from ${sourceName})`;
            } else if (disc > 0) {
                finalTargetName = `${cleanTargetName} (-${disc}% Discount from ${sourceName})`;
            } else {
                finalTargetName = `${cleanTargetName} (0% Markup from ${sourceName})`;
            }

            try {
                await apiService.updatePackageListName(cloneTargetList.id, finalTargetName);
            } catch (renameErr) {
                console.error("Failed to rename rate list suffix:", renameErr);
            }

            alert(res.message || "Packages synced successfully!");
            setIsCloneOpen(false);
            setCloneTargetList(null);
            fetchData();
        } catch (err: any) {
            alert(`Cloning failed: ${err.message || err}`);
        }
    };

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                <PageHeader title="Manage Labs" showActingAs={false} />

                {/* Master Ratelist & Canonical Directory Expandable Section */}
                <fieldset className="border-2 border-indigo-200 bg-indigo-50/20 p-4 md:p-6 rounded-xl mb-8 transition-all">
                    <legend className="px-3 flex items-center justify-between cursor-pointer" onClick={() => setIsMasterOpen(!isMasterOpen)}>
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                                <i className="fa-solid fa-book-medical text-xs"></i>
                            </div>
                            <span className="text-base md:text-lg font-bold text-indigo-950 uppercase tracking-tight md:tracking-normal">
                                Master Ratelist
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-indigo-100 text-indigo-800 border border-indigo-200">
                                {masterPackages.length} Master Tests
                            </span>
                        </div>
                        <button
                            type="button"
                            className="ml-4 w-7 h-7 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 flex items-center justify-center text-xs transition-transform"
                        >
                            <i className={`fa-solid ${isMasterOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                        </button>
                    </legend>

                    {isMasterOpen && (
                        <div className="space-y-4 pt-2 animate-in fade-in duration-150">
                            <p className="text-xs text-indigo-800/80 leading-relaxed">
                                The Master Ratelist defines the universal set of diagnostic tests. All Mother Ratelists shadow-pull from here. Mother Ratelists missing tests will display a Red Outline with capped tooltip.
                            </p>

                            {/* Add Master Test Form & Upload Action */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 bg-white p-3.5 rounded-lg border border-indigo-100 shadow-sm">
                                <form onSubmit={handleAddMasterPackage} className="flex-1 flex flex-col sm:flex-row items-end gap-3">
                                    <div className="flex-1 w-full space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Canonical Test Name</label>
                                        <input
                                            type="text"
                                            value={newMasterName}
                                            onChange={e => setNewMasterName(e.target.value)}
                                            placeholder="e.g. COMPLETE BLOOD COUNT (CBC)"
                                            required
                                            className="w-full p-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full sm:w-auto px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 h-[36px] whitespace-nowrap"
                                    >
                                        <i className="fa-solid fa-plus-circle"></i> Add Master Test
                                    </button>
                                </form>

                                <button
                                    type="button"
                                    onClick={() => setIsMasterExcelModalOpen(true)}
                                    className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm flex items-center justify-center gap-1.5 h-[36px] whitespace-nowrap"
                                    title="Upload Excel spreadsheet with test_name, alias1, alias2..."
                                >
                                    <i className="fa-solid fa-file-excel"></i> Upload Master Excel (.xlsx)
                                </button>
                            </div>

                            {/* Master Tests Search & Grid */}
                            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm space-y-3">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Directory ({filteredMasterPackages.length} of {masterPackages.length})
                                    </span>
                                    <div className="relative w-full sm:w-72">
                                        <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                        <input
                                            type="text"
                                            value={masterSearch}
                                            onChange={e => setMasterSearch(e.target.value)}
                                            placeholder="Search master tests or aliases..."
                                            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50/50 text-xs focus:bg-white outline-none focus:ring-2 focus:ring-indigo-100"
                                        />
                                    </div>
                                </div>

                                <div className="max-h-72 overflow-y-auto divide-y divide-gray-100 custom-scrollbar-minimal pr-1 border border-gray-100 rounded-lg">
                                    {filteredMasterPackages.map(mp => (
                                        <div key={mp.id} className="p-2.5 flex items-center justify-between gap-3 hover:bg-indigo-50/30 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-gray-800 truncate">{mp.name}</span>
                                                </div>
                                                {mp.aliases && (
                                                    <div className="text-[10px] text-gray-400 mt-0.5 truncate flex items-center gap-1">
                                                        <span className="font-semibold text-indigo-600">Aliases:</span> {mp.aliases}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setAliasModalPkg(mp)}
                                                    className="px-2 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 rounded text-[10px] font-bold transition-all shadow-sm flex items-center gap-1"
                                                >
                                                    <i className="fa-solid fa-tags text-[9px]"></i> + Alias
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleDeleteMasterPackage(mp.id)}
                                                    className="w-6 h-6 flex items-center justify-center text-gray-300 hover:text-red-600 transition-colors"
                                                    title="Delete Master Test"
                                                >
                                                    <i className="fa-solid fa-trash-can text-xs"></i>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredMasterPackages.length === 0 && (
                                        <div className="p-6 text-center text-xs text-gray-400 italic">
                                            No master packages found matching "{masterSearch}"
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </fieldset>

                {/* Add New Laboratory Form */}
                <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl mb-10">
                    <legend className="px-3 flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                            <i className="fa-solid fa-flask-vial text-xs"></i>
                        </div>
                        <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Add New Laboratory</span>
                    </legend>

                    <form onSubmit={handleAddLab} className="flex flex-col sm:flex-row items-end gap-4 bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                        <div className="flex-grow w-full space-y-1">
                            <label htmlFor="newLabName" className="text-[10px] font-bold text-gray-400 uppercase ml-1">Official Lab Name</label>
                            <div className="relative">
                                <i className="fa-solid fa-signature absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input id="newLabName" type="text" value={newLabName} onChange={e => setNewLabName(e.target.value)} placeholder="e.g. Apollo Diagnostics" required className="w-full pl-9 p-2 border border-gray-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-50 outline-none transition-all text-sm" />
                            </div>
                        </div>
                        <button type="submit" className="w-full sm:w-auto px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center gap-2 whitespace-nowrap text-sm h-[38px]">
                            <i className="fa-solid fa-plus-circle"></i> Create Lab
                        </button>
                    </form>
                </fieldset>

                {/* Laboratory Directory Accordion View */}
                <div className="relative flex flex-col">
                    <div className="md:absolute static top-0 right-6 md:-translate-y-[5px] mb-4 md:mb-0 flex justify-end order-1 md:order-none">
                        <div className="search-container w-full md:w-64 bg-white shadow-sm md:shadow-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-700 text-xs mr-2"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search labs..."
                                className="search-input"
                            />
                        </div>
                    </div>

                    <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl order-2 min-w-0">
                        <legend className="px-3 flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                <i className="fa-solid fa-flask text-xs"></i>
                            </div>
                            <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Laboratory Network</span>
                        </legend>

                        {isLoading ? (
                            <div className="text-center py-12 text-gray-400 italic text-sm">Synchronizing database...</div>
                        ) : filteredLabs.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 italic text-sm">No laboratories matching your search.</div>
                        ) : (
                            <div className="space-y-4">
                                {filteredLabs.map(lab => {
                                    const isExpanded = expandedLabId === lab.id;
                                    const labLists = allLists.filter(l => lab.assigned_list_ids?.includes(l.id));

                                    return (
                                        <div
                                            key={lab.id}
                                            id={`lab-accordion-${lab.id}`}
                                            className={`border border-gray-200 rounded-xl shadow-sm hover:border-gray-350 transition-all bg-white ${isExpanded ? 'overflow-visible' : 'overflow-hidden'}`}
                                        >
                                            {/* Lab Card Header */}
                                            <div className="p-4 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-gray-100 cursor-pointer" onClick={() => handleExpandLab(isExpanded ? null : lab.id)}>
                                                <div className="flex items-center gap-4 w-full sm:w-auto">
                                                    {/* Logo Uploader */}
                                                    <div className="relative group/logo w-24 h-12 bg-white rounded border border-gray-200 overflow-hidden flex items-center justify-center p-1 shadow-sm shrink-0">
                                                        {lab.logo_path ? (
                                                            <img src={lab.logo_path} alt={lab.name} className="h-full w-full object-contain" />
                                                        ) : (
                                                            <span className="text-[8px] font-black text-gray-400">NO LOGO</span>
                                                        )}
                                                        <label className="absolute inset-0 bg-black/45 opacity-0 group-hover/logo:opacity-100 transition-opacity flex items-center justify-center cursor-pointer" onClick={e => e.stopPropagation()}>
                                                            <i className="fa-solid fa-camera text-white text-xs"></i>
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept="image/*"
                                                                onChange={async (e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) {
                                                                        if (file.size > 100 * 1024) {
                                                                            alert("Upload Failed: File exceeds 100KB limit.");
                                                                            return;
                                                                        }
                                                                        const reader = new FileReader();
                                                                        reader.onloadend = async () => {
                                                                            try {
                                                                                await apiService.updateLabLogo(lab.id, reader.result as string);
                                                                                fetchData();
                                                                            } catch (err) {
                                                                                alert("Upload failed: " + err);
                                                                            }
                                                                        };
                                                                        reader.readAsDataURL(file);
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                    </div>

                                                    <div className="min-w-0">
                                                        <div className="text-base font-black text-gray-800 truncate">{lab.name}</div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-[10px] text-gray-400 font-mono italic">REF: #{lab.id.toString().padStart(3, '0')}</span>
                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                                                                {labLists.length} Rate Databases
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end" onClick={e => e.stopPropagation()}>
                                                    <button onClick={() => openSyncModal(lab)} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded border border-blue-100 text-xs font-bold hover:bg-blue-600 hover:text-white transition-all shadow-sm">
                                                        <i className="fa-solid fa-link mr-1"></i> Sync/Assign
                                                    </button>
                                                    <button onClick={() => handleExpandLab(isExpanded ? null : lab.id)} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-gray-150 rounded border border-gray-100 transition-all shadow-sm">
                                                        <i className={`fa-solid ${isExpanded ? 'fa-angle-up' : 'fa-angle-down'} text-sm`}></i>
                                                    </button>
                                                    <button onClick={() => handleDeleteLab(lab.id)} className="w-8 h-8 flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded border border-red-100 transition-all shadow-sm" title="Decommission Laboratory">
                                                        <i className="fa-solid fa-trash-can text-xs"></i>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Expanded Accordion Panel */}
                                            {isExpanded && (
                                                <div className="p-5 border-t border-gray-200 bg-gray-100/70 space-y-6">
                                                    <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl bg-white shadow-sm space-y-4">
                                                        <legend className="px-3 flex items-center gap-2">
                                                            <div className="w-7 h-7 rounded bg-slate-600 flex items-center justify-center text-white shadow-sm shrink-0">
                                                                <i className="fa-solid fa-layer-group text-xs"></i>
                                                            </div>
                                                            <span className="text-sm font-bold text-gray-800 uppercase tracking-tight">Assigned Rate Databases</span>
                                                        </legend>

                                                        {labLists.length === 0 ? (
                                                            <div className="p-6 bg-white border border-gray-150 rounded-xl text-center text-gray-400 italic text-xs">
                                                                No rate databases are currently assigned to this laboratory. Assign or create one below.
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {(() => {
                                                                    const sortedLists = [...labLists].sort((a, b) => {
                                                                        const aIsClone = /\(.*?\bfrom\b.*?\)/i.test(a.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(a.name);
                                                                        const bIsClone = /\(.*?\bfrom\b.*?\)/i.test(b.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(b.name);
                                                                        const aIsMother = !aIsClone && (a.name === `${lab.name} Mother Ratelist` || a.name.endsWith(' Mother Ratelist') || !!a.is_mother_ratelist);
                                                                        const bIsMother = !bIsClone && (b.name === `${lab.name} Mother Ratelist` || b.name.endsWith(' Mother Ratelist') || !!b.is_mother_ratelist);
                                                                        if (aIsMother && !bIsMother) return -1;
                                                                        if (!aIsMother && bIsMother) return 1;
                                                                        return 0;
                                                                    });
                                                                    return sortedLists.map(list => {
                                                                        const isClone = /\(.*?\bfrom\b.*?\)/i.test(list.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(list.name);
                                                                        const isMotherRatelist = !isClone && (list.name === `${lab.name} Mother Ratelist` || list.name.endsWith(' Mother Ratelist') || !!list.is_mother_ratelist);
                                                                        const parsedInfo = parseMarkupDiscount(list.name);
                                                                        const cleanName = getCleanName(list.name);
                                                                        const hasRedOutline = !!list.has_red_outline;
                                                                        const hasYellowOutline = !!list.has_yellow_outline;

                                                                        let borderClass = 'bg-white border-gray-200 shadow-sm';
                                                                        if (hasRedOutline && hasYellowOutline) {
                                                                            borderClass = 'bg-red-50/15 border-2 border-red-500 ring-2 ring-yellow-400 shadow-[0_0_15px_rgba(239,68,68,0.25)]';
                                                                        } else if (hasRedOutline) {
                                                                            borderClass = 'bg-red-50/20 border-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.25)]';
                                                                        } else if (hasYellowOutline) {
                                                                            borderClass = 'bg-yellow-50/30 border-2 border-yellow-400 ring-2 ring-yellow-400/50 shadow-[0_0_15px_rgba(234,179,8,0.25)]';
                                                                        } else if (isMotherRatelist) {
                                                                            borderClass = 'bg-blue-50/50 border-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.22)]';
                                                                        }

                                                                        return (
                                                                            <div
                                                                                key={list.id}
                                                                                className={`p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 relative ${borderClass}`}
                                                                            >
                                                                                <div>
                                                                                    <div className="flex justify-between items-start">
                                                                                        {renamingListId === list.id ? (
                                                                                            <div className="flex items-center gap-1.5">
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={renamingListName}
                                                                                                    onChange={e => setRenamingListName(e.target.value)}
                                                                                                    className="p-1 border border-indigo-300 rounded text-xs font-bold w-40 outline-none focus:ring-2 focus:ring-indigo-150"
                                                                                                    autoFocus
                                                                                                    onKeyDown={e => {
                                                                                                        if (e.key === 'Enter') handleRenameList(list.id);
                                                                                                        if (e.key === 'Escape') setRenamingListId(null);
                                                                                                    }}
                                                                                                />
                                                                                                <button onClick={() => handleRenameList(list.id)} className="text-green-600 hover:text-green-800 p-0.5" title="Save"><i className="fa-solid fa-check text-xs"></i></button>
                                                                                                <button onClick={() => setRenamingListId(null)} className="text-red-600 hover:text-red-800 p-0.5" title="Cancel"><i className="fa-solid fa-xmark text-xs"></i></button>
                                                                                            </div>
                                                                                        ) : (
                                                                                            <div className="flex-1 min-w-0 pr-2 flex items-center gap-1.5 flex-wrap">
                                                                                                <RatelistLinkedClientsTooltip listId={list.id} users={users}>
                                                                                                    <span
                                                                                                        className="font-black text-sm text-gray-800 truncate cursor-help border-b border-dashed border-gray-400 max-w-[150px] sm:max-w-[190px] inline-block"
                                                                                                        title={cleanName}
                                                                                                    >
                                                                                                        {cleanName}
                                                                                                    </span>
                                                                                                </RatelistLinkedClientsTooltip>
                                                                                                {parsedInfo && (() => {
                                                                                                    const motherList = labLists.find(pl => {
                                                                                                        const isPlClone = /\(.*?\bfrom\b.*?\)/i.test(pl.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(pl.name);
                                                                                                        return !isPlClone && (pl.name === `${lab.name} Mother Ratelist` || pl.name.endsWith(' Mother Ratelist') || !!pl.is_mother_ratelist);
                                                                                                    });
                                                                                                    const fallbackMotherName = motherList
                                                                                                        ? motherList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim()
                                                                                                        : `${lab.name} Mother Ratelist`;
                                                                                                    const sourceName = parsedInfo.sourceName || fallbackMotherName;
                                                                                                    return (
                                                                                                        <RatelistMarkupTagTooltip
                                                                                                            pctStr={parsedInfo.pctStr}
                                                                                                            isMarkup={parsedInfo.isMarkup}
                                                                                                            motherListName={sourceName}
                                                                                                        />
                                                                                                    );
                                                                                                })()}
                                                                                                {isMotherRatelist && (
                                                                                                    <span className="px-1.5 py-0.5 rounded-full text-[7.5px] font-black bg-blue-100 text-blue-800 border border-blue-200 uppercase shrink-0">
                                                                                                        Mother
                                                                                                    </span>
                                                                                                )}
                                                                                                {hasRedOutline && (
                                                                                                    <div className="relative group/red inline-block shrink-0">
                                                                                                        <span className="cursor-help px-1.5 py-0.5 rounded-full text-[8px] font-black bg-red-100 text-red-700 border border-red-300 uppercase flex items-center gap-1 shrink-0 animate-pulse">
                                                                                                            <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                                                                                                            {list.missing_master_count} Missing
                                                                                                        </span>
                                                                                                        <div className="absolute left-0 top-full mt-1.5 w-60 max-h-44 overflow-y-auto bg-gray-900 text-white text-[11px] rounded-lg p-2.5 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/red:opacity-100 transition-opacity">
                                                                                                            <div className="font-bold text-red-300 pb-1 border-b border-gray-700 mb-1 flex items-center justify-between">
                                                                                                                <span>Missing Master Tests:</span>
                                                                                                                <span className="text-[9px] bg-red-950 px-1 py-0.5 rounded text-red-200">{list.missing_master_count}</span>
                                                                                                            </div>
                                                                                                            <ul className="space-y-0.5 text-gray-300">
                                                                                                                {(list.missing_master_packages || []).slice(0, 5).map((mp, i) => (
                                                                                                                    <li key={i} className="truncate">• {mp}</li>
                                                                                                                ))}
                                                                                                                {(list.missing_master_packages?.length || 0) > 5 && (
                                                                                                                    <li className="text-[10px] text-gray-400 italic pt-1 border-t border-gray-800">
                                                                                                                        +{(list.missing_master_packages?.length || 0) - 5} more missing
                                                                                                                    </li>
                                                                                                                )}
                                                                                                            </ul>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                                {hasYellowOutline && (
                                                                                                    <div className="relative group/yellow inline-block shrink-0">
                                                                                                        <span className="cursor-help px-1.5 py-0.5 rounded-full text-[8px] font-black bg-yellow-100 text-yellow-900 border border-yellow-300 uppercase flex items-center gap-1 shrink-0">
                                                                                                            <i className="fa-solid fa-circle-exclamation text-[9px]"></i>
                                                                                                            {list.unconfigured_pricing_count || 0} Needs Price
                                                                                                        </span>
                                                                                                        <div className="absolute left-0 top-full mt-1.5 w-56 bg-gray-900 text-white text-[11px] rounded-lg p-2 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/yellow:opacity-100 transition-opacity">
                                                                                                            <span className="font-bold text-amber-300 block mb-0.5">Pricing Alert</span>
                                                                                                            <span className="text-gray-300 leading-tight block">
                                                                                                                {list.unconfigured_pricing_count || 0} tests have unconfigured pricing (MRP ≤ 0, B2B ≤ 0, or B2B &gt; MRP).
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setRenamingListId(list.id);
                                                                                                        setRenamingListName(getCleanName(list.name));
                                                                                                    }}
                                                                                                    className="text-gray-400 hover:text-indigo-600 transition-colors p-0.5 shrink-0"
                                                                                                    title="Rename Database"
                                                                                                >
                                                                                                    <i className="fa-solid fa-pen text-[9px]"></i>
                                                                                                </button>
                                                                                            </div>
                                                                                        )}
                                                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 uppercase shrink-0">
                                                                                            {list.package_count || 0} items
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">DB REF ID: #{list.id}</div>
                                                                                </div>

                                                                                <div className="flex flex-wrap gap-1.5 pt-2.5 mt-2 border-t border-gray-100">
                                                                                    <button onClick={() => openInventoryModal(list)} className="px-2 py-1 bg-gray-50 hover:bg-yellow-500 hover:text-white rounded border border-gray-200 hover:border-yellow-600 transition-all font-bold text-[10px] text-gray-600 flex items-center gap-1 shadow-sm">
                                                                                        <i className="fa-solid fa-cubes text-[9px]"></i> Items
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setExcelImportTargetList(list)}
                                                                                        className="px-2 py-1 bg-gray-50 hover:bg-emerald-600 hover:text-white rounded border border-gray-200 hover:border-emerald-700 transition-all font-bold text-[10px] text-gray-600 flex items-center gap-1 shadow-sm cursor-pointer"
                                                                                        title="Import Excel (.xlsx) into this ratelist"
                                                                                    >
                                                                                        <i className="fa-solid fa-file-import text-[9px]"></i> XLSX
                                                                                    </button>
                                                                                    <button
                                                                                        disabled={isMotherRatelist}
                                                                                        onClick={() => openCloneModal(list, lab)}
                                                                                        className={`px-2 py-1 rounded border transition-all font-bold text-[10px] flex items-center gap-1 shadow-sm ${isMotherRatelist
                                                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                                                                            : 'bg-gray-50 hover:bg-blue-600 hover:text-white border-gray-200 hover:border-blue-700 text-gray-600'
                                                                                            }`}
                                                                                        title={isMotherRatelist ? "Mother ratelist cannot clone onto itself" : "Clone & scale sync"}
                                                                                    >
                                                                                        <i className="fa-solid fa-sync text-[9px]"></i> Clone Sync
                                                                                    </button>
                                                                                    <button
                                                                                        disabled={isMotherRatelist}
                                                                                        onClick={() => handleUnassignList(lab.id, list.id)}
                                                                                        className={`px-2 py-1 rounded border transition-all font-bold text-[10px] flex items-center gap-1 shadow-sm ${isMotherRatelist
                                                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                                                                            : 'bg-gray-50 hover:bg-amber-600 hover:text-white border-gray-200 hover:border-amber-700 text-gray-600'
                                                                                            }`}
                                                                                        title={isMotherRatelist ? "Mother ratelist cannot be unassigned unless lab is deleted" : "Unassign database"}
                                                                                    >
                                                                                        <i className="fa-solid fa-link-slash text-[9px]"></i> Unlink
                                                                                    </button>
                                                                                    <button
                                                                                        disabled={isMotherRatelist}
                                                                                        onClick={() => handleDeleteList(list.id)}
                                                                                        className={`px-2 py-1 rounded border transition-all font-bold text-[10px] flex items-center gap-1 shadow-sm ml-auto ${isMotherRatelist
                                                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed opacity-60'
                                                                                            : 'bg-gray-50 hover:bg-red-600 hover:text-white border-gray-200 hover:border-red-700 text-gray-600'
                                                                                            }`}
                                                                                        title={isMotherRatelist ? "Mother ratelist cannot be deleted unless lab is deleted" : "Delete Database permanent"}
                                                                                    >
                                                                                        <i className="fa-solid fa-trash text-[9px]"></i>
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    });
                                                                })()}
                                                            </div>
                                                        )}
                                                    </fieldset>

                                                    {/* Assign / Spin Up Controls */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                                                        {/* Block 1: Assign existing database */}
                                                        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl bg-white shadow-sm space-y-4">
                                                            <legend className="px-3 flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
                                                                    <i className="fa-solid fa-link text-xs"></i>
                                                                </div>
                                                                <span className="text-sm font-bold text-gray-800 uppercase tracking-tight">Link Existing Database</span>
                                                            </legend>
                                                            <div className="flex gap-2 items-center mt-1">
                                                                <div className="flex-grow">
                                                                    <SearchableDropdown
                                                                        options={[
                                                                            { value: '', label: '-- Choose Database --' },
                                                                            ...allLists
                                                                                .filter(l => !lab.assigned_list_ids?.includes(l.id))
                                                                                .map(l => ({ value: l.id.toString(), label: `${l.name} (#${l.id})` }))
                                                                        ]}
                                                                        value={quickAssignListId[lab.id] || ''}
                                                                        onChange={val => setQuickAssignListId(prev => ({ ...prev, [lab.id]: val }))}
                                                                        placeholder="Search database..."
                                                                    />
                                                                </div>
                                                                <button onClick={() => handleQuickAssignList(lab.id)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-sm transition-all h-[38px] shrink-0">
                                                                    Assign
                                                                </button>
                                                            </div>
                                                        </fieldset>

                                                        {/* Block 2: Spin up new database */}
                                                        <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl bg-white shadow-sm space-y-4">
                                                            <legend className="px-3 flex items-center gap-2">
                                                                <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm shrink-0">
                                                                    <i className="fa-solid fa-plus-circle text-xs"></i>
                                                                </div>
                                                                <span className="text-sm font-bold text-gray-800 uppercase tracking-tight">Spin Up New Database</span>
                                                            </legend>
                                                            <div className="flex gap-2 items-center mt-1">
                                                                <input
                                                                    type="text"
                                                                    placeholder="e.g. Apollo B2B 2026"
                                                                    className="flex-grow p-2 border border-gray-205 rounded-lg text-xs bg-slate-50 focus:bg-white outline-none h-[34px]"
                                                                    value={quickAddListName[lab.id] || ''}
                                                                    onChange={e => setQuickAddListName(prev => ({ ...prev, [lab.id]: e.target.value }))}
                                                                />
                                                                <button onClick={() => handleQuickCreateList(lab.id)} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs shadow-sm transition-all h-[34px] whitespace-nowrap">
                                                                    Create & Link
                                                                </button>
                                                            </div>
                                                        </fieldset>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </fieldset>
                </div>
            </div>

            {/* Modal: Checkbox sync assignment picker */}
            {isSyncModalOpen && syncingLab && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 flex flex-col max-h-[85vh]">
                        <form onSubmit={handleUpdateAssignments} className="flex flex-col h-full">
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-300 pb-4">
                                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-database text-xs"></i>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">Assign Rate Databases</h2>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{syncingLab.name}</p>
                                </div>
                            </div>

                            <div className="space-y-1 flex-grow overflow-y-auto max-h-[300px] custom-scrollbar-minimal pr-2 border border-gray-150 p-2 rounded-lg my-2">
                                {allLists.map(list => {
                                    const isListClone = /\(.*?\bfrom\b.*?\)/i.test(list.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(list.name);
                                    const isMotherForLab = !isListClone && (list.name === `${syncingLab.name} Mother Ratelist` || (list.name.endsWith(' Mother Ratelist') && list.name.startsWith(syncingLab.name)));
                                    return (
                                        <label
                                            key={list.id}
                                            className={`flex items-center space-x-3 px-3 py-2 rounded-lg border transition-all ${isMotherForLab
                                                ? 'bg-blue-50 border-blue-200 text-blue-800 cursor-not-allowed opacity-80'
                                                : assignedLists.has(list.id)
                                                    ? 'bg-blue-600 border-blue-700 text-white shadow-sm cursor-pointer'
                                                    : 'bg-gray-50 border-gray-100 hover:border-gray-250 text-gray-600 cursor-pointer'
                                                }`}
                                        >
                                            <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${isMotherForLab
                                                ? 'bg-blue-600 border-blue-700 text-white'
                                                : assignedLists.has(list.id)
                                                    ? 'bg-white border-white text-blue-600'
                                                    : 'bg-white border-gray-300'
                                                }`}>
                                                {isMotherForLab ? <i className="fa-solid fa-lock text-[8px]"></i> : assignedLists.has(list.id) && <i className="fa-solid fa-check text-[8px]"></i>}
                                            </div>
                                            <input
                                                type="checkbox"
                                                className="hidden"
                                                disabled={isMotherForLab}
                                                checked={assignedLists.has(list.id) || isMotherForLab}
                                                onChange={() => handleListToggle(list.id)}
                                            />
                                            <span className="font-semibold text-xs truncate flex items-center gap-1.5">
                                                {list.name}
                                                {isMotherForLab && <span className="text-[8px] font-black uppercase bg-blue-100 text-blue-700 border border-blue-200 px-1 rounded-full shrink-0">Mother</span>}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-300">
                                <button type="button" onClick={() => setIsSyncModalOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-250 transition-all font-bold text-xs">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-sm transition-all font-bold text-xs">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Package Inventory Editor */}
            {isInventoryOpen && editingList && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-gray-200 relative">
                        <div className="flex items-center justify-between mb-6 border-b border-gray-300 pb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-yellow-500 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-cubes text-xs"></i>
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800">Inventory Management</h2>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{editingList.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsInventoryOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors">
                                <i className="fa-solid fa-circle-xmark text-xl"></i>
                            </button>
                        </div>

                        {/* Add new package form */}
                        <form onSubmit={handleAddNewPackage} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end mb-6 p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                            <div className="sm:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Test Code</label>
                                <input value={newPackage.code_name} onChange={e => setNewPackage({ ...newPackage, code_name: e.target.value })} placeholder="e.g. PANEL-01" className="w-full p-2 border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-yellow-50 text-sm font-mono" />
                            </div>
                            <div className="sm:col-span-4 space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Package Name</label>
                                <input value={newPackage.name} onChange={e => setNewPackage({ ...newPackage, name: e.target.value })} placeholder="e.g. Master Panel" className="w-full p-2 border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-yellow-50 text-sm" required />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">MRP (₹)</label>
                                <input type="number" value={newPackage.mrp} onChange={e => setNewPackage({ ...newPackage, mrp: e.target.value })} placeholder="0.00" className="w-full p-2 border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-yellow-50 text-sm" required />
                            </div>
                            <div className="sm:col-span-2 space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">B2B (₹)</label>
                                <input type="number" value={newPackage.b2b_price} onChange={e => setNewPackage({ ...newPackage, b2b_price: e.target.value })} placeholder="0.00" className="w-full p-2 border border-gray-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-yellow-50 text-sm" required />
                            </div>
                            <button type="submit" className="sm:col-span-2 px-4 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-sm flex items-center justify-center gap-2 text-sm h-[38px]">
                                <i className="fa-solid fa-plus-circle"></i> Add Item
                            </button>
                        </form>

                        {/* Missing Master Packages Alert Banner */}
                        {editingList.missing_master_packages && editingList.missing_master_packages.length > 0 && (
                            <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
                                <div className="flex items-center gap-2.5">
                                    <i className="fa-solid fa-triangle-exclamation text-red-600 text-base shrink-0"></i>
                                    <div>
                                        <span className="text-xs font-bold text-red-900 block">
                                            {editingList.missing_master_packages.length} Master Packages Missing
                                        </span>
                                        <span className="text-[11px] text-red-700">
                                            This Mother Ratelist is missing tests from the universal Master Ratelist directory.
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleAcceptMissingMaster(editingList.missing_master_packages || [])}
                                    className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 shrink-0 transition-all"
                                >
                                    <i className="fa-solid fa-cloud-arrow-down"></i> Insert All ({editingList.missing_master_packages.length})
                                </button>
                            </div>
                        )}

                        {/* Search packages inside modal */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                            <div className="flex items-center gap-2">
                                <i className="fa-solid fa-cubes text-slate-400 text-xs"></i>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Packages ({filteredInventoryPackages.length} items)</span>
                            </div>
                            <div className="relative w-full sm:w-72">
                                <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                <input
                                    type="text"
                                    value={inventorySearchQuery}
                                    onChange={e => setInventorySearchQuery(e.target.value)}
                                    placeholder="Search package name or code..."
                                    className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none text-xs font-medium transition-all"
                                />
                            </div>
                        </div>

                        {/* Existing packages table */}
                        <div className="overflow-y-auto flex-grow rounded-lg border border-gray-200 bg-white shadow-inner custom-scrollbar-minimal">
                            <table className="w-full text-sm divide-y divide-gray-100">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-4 border-b border-gray-200 w-36">Test Code</th>
                                        <th className="p-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">Package Name</th>
                                        <th className="p-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest w-24 border-b border-gray-200">MRP</th>
                                        <th className="p-2 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest w-24 border-b border-gray-200">B2B Price</th>
                                        <th className="p-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {filteredInventoryPackages.map(pkg => {
                                        const isUnconfigured = pkg.mrp <= 0 || pkg.b2b_price <= 0 || pkg.b2b_price > pkg.mrp;
                                        return (
                                            <tr key={pkg.id} className={`transition-colors group ${isUnconfigured ? 'bg-yellow-50/90 border-l-4 border-yellow-500 ring-1 ring-inset ring-yellow-400' : 'hover:bg-gray-50/50'}`}>
                                                <td className="p-1 pl-4 w-36">
                                                    <input
                                                        value={pkg.code_name || ''}
                                                        onChange={e => handlePackageChange(pkg.id, 'code_name', e.target.value)}
                                                        placeholder="N/A"
                                                        className="w-full p-1.5 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none font-medium text-gray-755 text-sm font-mono animate-none"
                                                    />
                                                </td>
                                                <td className="p-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <input value={pkg.name} onChange={e => handlePackageChange(pkg.id, 'name', e.target.value)} className="w-full p-1.5 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none font-medium text-gray-755 text-sm" />
                                                        {isUnconfigured && (
                                                            <PriceAlertTooltip mrp={pkg.mrp} b2b_price={pkg.b2b_price} />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-1">
                                                    <div className="relative">
                                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300 text-[10px]">₹</span>
                                                        <input type="number" value={pkg.mrp} onChange={e => handlePackageChange(pkg.id, 'mrp', Number(e.target.value))} className="w-full p-1.5 pl-4 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none text-gray-600 text-sm" />
                                                    </div>
                                                </td>
                                                <td className="p-1">
                                                    <div className="relative font-bold">
                                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-blue-200 text-[10px]">₹</span>
                                                        <input type="number" value={pkg.b2b_price} onChange={e => handlePackageChange(pkg.id, 'b2b_price', Number(e.target.value))} className="w-full p-1.5 pl-4 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none text-blue-700 font-bold text-sm" />
                                                    </div>
                                                </td>
                                                <td className="p-1 text-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button onClick={() => handleSavePackage(pkg)} className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-blue-600 hover:text-white rounded border border-gray-100 transition-all shrink-0" title="Save Product">
                                                            <i className="fa-solid fa-floppy-disk text-[10px]"></i>
                                                        </button>
                                                        <button onClick={() => handleDeletePackage(pkg.id)} className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-red-600 hover:text-white rounded border border-gray-100 transition-all shrink-0 animate-none" title="Delete Product">
                                                            <i className="fa-solid fa-trash-can text-[10px]"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Greyed-out rows for missing Master Ratelist packages */}
                                    {editingList.missing_master_packages && editingList.missing_master_packages.length > 0 && (
                                        <>
                                            <tr className="bg-slate-100">
                                                <td colSpan={5} className="py-2 px-4 text-[10px] font-black text-slate-500 uppercase tracking-widest bg-slate-100 border-y border-slate-200">
                                                    <i className="fa-solid fa-layer-group mr-1.5 text-slate-400"></i>
                                                    Missing Canonical Master Packages ({editingList.missing_master_packages.length})
                                                </td>
                                            </tr>
                                            {editingList.missing_master_packages.map((missingName, idx) => (
                                                <tr key={`missing-${idx}`} className="bg-slate-50/70 border-b border-dashed border-slate-200 opacity-80 hover:opacity-100 transition-opacity">
                                                    <td className="p-1 pl-4 text-xs text-slate-400 font-mono italic">
                                                        PENDING
                                                    </td>
                                                    <td className="p-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-slate-200 text-slate-700 uppercase shrink-0">Master</span>
                                                            <span className="text-xs font-bold text-slate-700">{missingName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-1 text-xs text-slate-400 font-mono italic pl-4">₹0.00</td>
                                                    <td className="p-1 text-xs text-slate-400 font-mono italic pl-4">₹0.00</td>
                                                    <td className="p-1 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAcceptMissingMaster([missingName])}
                                                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 mx-auto"
                                                        >
                                                            <i className="fa-solid fa-check text-[9px]"></i> Accept
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </>
                                    )}

                                    {filteredInventoryPackages.length === 0 && (!editingList.missing_master_packages || editingList.missing_master_packages.length === 0) && (
                                        <tr>
                                            <td colSpan={5} className="text-center py-12 text-gray-400 italic text-xs uppercase tracking-wider font-bold">
                                                No packages match your search filter
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end mt-4 pt-4 border-t border-gray-300 gap-3">
                            {hasEdits && (
                                <button
                                    type="button"
                                    onClick={handleGlobalSave}
                                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-all text-xs flex items-center gap-1.5 shadow-sm"
                                >
                                    <i className="fa-solid fa-floppy-disk"></i>
                                    Save All Changes
                                </button>
                            )}
                            <button type="button" onClick={() => setIsInventoryOpen(false)} className="px-6 py-2 bg-gray-100 text-gray-600 font-bold rounded-lg hover:bg-gray-250 transition-all border border-gray-200 text-xs">Finish Editing</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Clone/Sync Wizard */}
            {isCloneOpen && cloneTargetList && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md border border-gray-200 flex flex-col">
                        <form onSubmit={handleCloneSubmit} className="space-y-4">
                            <div className="flex items-center gap-3 border-b border-gray-300 pb-3">
                                <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-sync text-xs animate-spin-slow"></i>
                                </div>
                                <div>
                                    <h2 className="text-base font-bold text-gray-800">Sync & Scale Wizard</h2>
                                    <p className="text-[10px] text-gray-450 font-bold uppercase tracking-wider">Target: {cloneTargetList.name}</p>
                                </div>
                            </div>

                            <div className="space-y-3.5 text-xs text-slate-650">
                                <div className="bg-blue-50 border border-blue-150 p-3 rounded-lg text-[10px] text-blue-800">
                                    <strong>💡 Sync Notice:</strong> This operation clears all existing items in the target database and clones all packages from the selected mother/source database, applying the requested scaling.
                                </div>

                                <fieldset className="border border-slate-200 p-4 rounded-xl bg-slate-50/50 space-y-3">
                                    <legend className="px-2 font-bold text-slate-700 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                                        <i className="fa-solid fa-database text-blue-500"></i>
                                        Mother Database Source
                                    </legend>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase pl-0.5">Select Source / Mother Ratelist</label>
                                        <SearchableDropdown
                                            options={[
                                                { value: '', label: '-- Select Source Database --' },
                                                ...allLists
                                                    .filter(l => l.id !== cloneTargetList.id)
                                                    .map(l => ({ value: l.id.toString(), label: `${l.name} (${l.package_count || 0} items)` }))
                                            ]}
                                            value={cloneSourceListId}
                                            onChange={val => setCloneSourceListId(val)}
                                            placeholder="Search source database..."
                                        />
                                    </div>
                                </fieldset>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Discount Percent (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="0.01"
                                            className="w-full p-2 border border-gray-200 rounded-lg bg-white font-mono"
                                            value={cloneDiscount}
                                            onChange={e => setCloneDiscount(e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-bold text-slate-400 uppercase">Markup Percent (%)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="w-full p-2 border border-gray-200 rounded-lg bg-white font-mono"
                                            value={cloneMarkup}
                                            onChange={e => setCloneMarkup(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4 border-t border-gray-300">
                                <button type="button" onClick={() => setIsCloneOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-650 rounded-lg hover:bg-gray-250 font-bold text-xs transition-all">Cancel</button>
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs transition-all shadow-sm">Clone & Apply</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal: Add Alias to Master Package */}
            {aliasModalPkg && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md border border-gray-200">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-tags text-xs"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800">Add Test Alias / Synonym</h3>
                                    <p className="text-[10px] text-indigo-700 font-bold uppercase truncate max-w-[240px]">{aliasModalPkg.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setAliasModalPkg(null)} className="text-gray-400 hover:text-red-500">
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <form onSubmit={handleAddAlias} className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Synonym / Variant Abbreviation</label>
                                <input
                                    type="text"
                                    value={newAliasName}
                                    onChange={e => setNewAliasName(e.target.value)}
                                    placeholder="e.g. HAEMOGRAM, COMPLETE HEMOGRAM"
                                    required
                                    autoFocus
                                    className="w-full p-2.5 border border-gray-200 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-indigo-100"
                                />
                                <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
                                    Labs using this name or abbreviation will now automatically link to "{aliasModalPkg.name}" without raising missing test alerts.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setAliasModalPkg(null)}
                                    className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm flex items-center gap-1.5"
                                >
                                    <i className="fa-solid fa-check"></i> Register Alias
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Global Reusable Excel Import Modal for Rate Lists */}
            <ExcelImportModal
                isOpen={!!excelImportTargetList}
                onClose={() => setExcelImportTargetList(null)}
                title="Import Ratelist via Excel (.xlsx)"
                targetName={excelImportTargetList?.name}
                formatType="RATELIST"
                onImport={handleRatelistExcelImport}
            />

            {/* Global Reusable Excel Import Modal for Master Ratelist */}
            <ExcelImportModal
                isOpen={isMasterExcelModalOpen}
                onClose={() => setIsMasterExcelModalOpen(false)}
                title="Upload Master Ratelist (.xlsx)"
                targetName="Global Master Test Directory"
                formatType="MASTER_RATELIST"
                onImport={handleMasterExcelImport}
            />
        </div>
    );
};

export default ManageLabs;