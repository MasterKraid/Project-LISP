import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '../../components/PageHeader';
import { apiService } from '../../services/api';
import { Lab, PackageList, Package, User, MasterPackage, Doctor, DoctorDuplicateGroup } from '../../types';
import SearchableDropdown from '../../components/SearchableDropdown';
import { RatelistLinkedClientsTooltip, PriceAlertTooltip, RatelistMarkupTagTooltip } from '../../components/RatelistTooltips';
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

    // Doctor Directory States
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [duplicateGroups, setDuplicateGroups] = useState<DoctorDuplicateGroup[]>([]);
    const [activeMergeGroup, setActiveMergeGroup] = useState<DoctorDuplicateGroup | null>(null);
    const [selectedCanonicalName, setSelectedCanonicalName] = useState('');
    const [isDoctorsOpen, setIsDoctorsOpen] = useState(false);
    const [doctorSearch, setDoctorSearch] = useState('');
    const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false);
    const [newDoctorName, setNewDoctorName] = useState('');
    const [editingDoctorId, setEditingDoctorId] = useState<number | null>(null);
    const [editingDoctorName, setEditingDoctorName] = useState('');
    const [syncReceipts, setSyncReceipts] = useState(true);
    const [doctorActionLoading, setDoctorActionLoading] = useState(false);

    // Global Excel Upload Modals
    const [excelImportTargetList, setExcelImportTargetList] = useState<PackageList | null>(null);
    const [isMasterExcelModalOpen, setIsMasterExcelModalOpen] = useState(false);

    const isMotherRatelistName = (name: string): boolean => {
        if (!name) return false;
        if (/\(.*?\bfrom\b.*?\)/i.test(name)) return false;
        if (/\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(name)) return false;
        const clean = name.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        return clean.endsWith('Mother Ratelist') || 
               clean.endsWith('Mother Rate List') || 
               /^\[M\]/i.test(clean) || 
               /\[M\]$/i.test(clean);
    };

    const getMarkupInfo = (name: string) => {
        let match = name.match(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+([^)]+))?\)/i);
        if (match) {
            const rawVal = match[1];
            const numVal = parseFloat(rawVal);
            const pctStr = `${Math.abs(numVal)}%`;
            const type = match[2]?.toUpperCase();
            const sourceName = match[3]?.trim();
            let isMarkup = numVal >= 0;
            if (type === 'DISCOUNT') {
                isMarkup = false;
            }
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
    const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
    const [selectedCols, setSelectedCols] = useState<Set<'code_name' | 'name' | 'mrp' | 'b2b_price'>>(new Set());

    // Clone/Sync Wizard States
    const [isCloneOpen, setIsCloneOpen] = useState(false);
    const [cloneTargetList, setCloneTargetList] = useState<PackageList | null>(null);
    const [cloneTargetLab, setCloneTargetLab] = useState<Lab | null>(null);
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
            const [labsData, listsData, usersData, masterData, doctorsData, dupsData] = await Promise.all([
                apiService.getLabs(),
                apiService.getPackageLists(),
                apiService.getUsers(),
                apiService.getMasterPackages(),
                apiService.getDoctors(),
                apiService.getDoctorDuplicates()
            ]);
            setLabs(labsData);
            setAllLists(listsData.filter((l: any) => !l.name.startsWith('[DELETED]')));
            setUsers(usersData);
            setMasterPackages(masterData);
            setDoctors(doctorsData);
            setDuplicateGroups(dupsData.groups || []);
        } catch (error) {
            console.error("Failed to fetch lab data", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchDoctors = async () => {
        try {
            const [data, dupsData] = await Promise.all([
                apiService.getDoctors(),
                apiService.getDoctorDuplicates()
            ]);
            setDoctors(data);
            setDuplicateGroups(dupsData.groups || []);
        } catch (e) {
            console.error('Failed to fetch doctors', e);
        }
    };

    const normalizeDoctor = (name: string): string => {
        return name
            .toLowerCase()
            .replace(/^(?:dr|doctor)\.?\s*/i, '')
            .replace(/[^a-z0-9]/g, '');
    };

    const duplicateNormMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const d of doctors) {
            const norm = normalizeDoctor(d.name);
            if (norm) {
                map.set(norm, (map.get(norm) || 0) + 1);
            }
        }
        return map;
    }, [doctors]);

    const totalDuplicatesCount = useMemo(() => {
        return doctors.filter(d => (duplicateNormMap.get(normalizeDoctor(d.name)) || 0) > 1).length;
    }, [doctors, duplicateNormMap]);

    const getDoctorGroup = (doc: Doctor): DoctorDuplicateGroup | null => {
        const k = normalizeDoctor(doc.name);
        return duplicateGroups.find(g => g.key === k) || null;
    };

    const handleMergeAllDuplicates = async () => {
        if (!duplicateGroups.length) return;
        if (!window.confirm(`Merge all ${duplicateGroups.length} duplicate doctor groups?\n\nThis will remove redundant duplicate entries and automatically update all historical receipts to the unified "DR. <NAME>" format.`)) {
            return;
        }
        try {
            setDoctorActionLoading(true);
            const res = await apiService.mergeAllDoctorDuplicates();
            alert(res.message);
            await fetchDoctors();
        } catch (err: any) {
            alert(err.message || 'Failed to merge doctor duplicates');
        } finally {
            setDoctorActionLoading(false);
        }
    };

    const handleOpenMergeGroup = (group: DoctorDuplicateGroup) => {
        setActiveMergeGroup(group);
        setSelectedCanonicalName(group.canonical_name);
    };

    const handleConfirmMergeGroup = async () => {
        if (!activeMergeGroup || !selectedCanonicalName.trim()) return;
        try {
            setDoctorActionLoading(true);
            const ids = activeMergeGroup.doctors.map(d => d.id);
            const res = await apiService.mergeDoctorGroup(selectedCanonicalName.trim(), ids);
            setActiveMergeGroup(null);
            alert(res.message || 'Doctor group merged successfully');
            await fetchDoctors();
        } catch (err: any) {
            alert(err.message || 'Failed to merge doctor group');
        } finally {
            setDoctorActionLoading(false);
        }
    };

    const filteredDoctors = useMemo(() => {
        return doctors.filter(doc => {
            const norm = normalizeDoctor(doc.name);
            const isDuplicate = (duplicateNormMap.get(norm) || 0) > 1;

            if (showOnlyDuplicates && !isDuplicate) {
                return false;
            }

            if (!doctorSearch.trim()) return true;

            const term = doctorSearch.toLowerCase().trim();
            const termNorm = normalizeDoctor(doctorSearch);

            if (doc.name.toLowerCase().includes(term)) return true;
            if (termNorm && norm.includes(termNorm)) return true;

            return false;
        });
    }, [doctors, showOnlyDuplicates, doctorSearch, duplicateNormMap]);

    const handleAddDoctor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDoctorName.trim()) return;
        try {
            setDoctorActionLoading(true);
            await apiService.createDoctor(newDoctorName.trim());
            setNewDoctorName('');
            await fetchDoctors();
        } catch (err: any) {
            alert(err.message || 'Failed to add doctor');
        } finally {
            setDoctorActionLoading(false);
        }
    };

    const handleStartEditDoctor = (doc: Doctor) => {
        setEditingDoctorId(doc.id);
        setEditingDoctorName(doc.name);
        setSyncReceipts(true);
    };

    const handleSaveEditDoctor = async (id: number) => {
        if (!editingDoctorName.trim()) return;
        try {
            setDoctorActionLoading(true);
            await apiService.updateDoctor(id, editingDoctorName.trim(), syncReceipts);
            setEditingDoctorId(null);
            setEditingDoctorName('');
            await fetchDoctors();
        } catch (err: any) {
            alert(err.message || 'Failed to update doctor');
        } finally {
            setDoctorActionLoading(false);
        }
    };

    const handleDeleteDoctor = async (id: number, name: string) => {
        if (!window.confirm(`Are you sure you want to delete "${name}" from the doctor directory?`)) return;
        try {
            setDoctorActionLoading(true);
            await apiService.deleteDoctor(id);
            if (editingDoctorId === id) {
                setEditingDoctorId(null);
            }
            await fetchDoctors();
        } catch (err: any) {
            alert(err.message || 'Failed to delete doctor');
        } finally {
            setDoctorActionLoading(false);
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
        if (!list) return;
        const isClone = (/\(.*?\bfrom\b.*?\)/i.test(list.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(list.name));
        if (!isClone && isMotherRatelistName(list.name)) {
            // Mother ratelists cannot be unassigned from their own lab, nor assigned to other labs
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

        const listObj = allLists.find(l => l.id === listId);
        if (listObj && isMotherRatelistName(listObj.name)) {
            alert("Mother ratelists are unique to their own lab and cannot be linked to another lab.");
            return;
        }

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
    // Clone / Sync Wizard Modal
    // ----------------------------------------------------
    const openCloneModal = (list: PackageList, parentLab: Lab) => {
        setCloneTargetList(list);
        setCloneTargetLab(parentLab);

        // Auto select that lab's mother ratelist
        const motherList = allLists.find(l => 
            (l.name === `${parentLab.name} Mother Ratelist` || (l.name.endsWith(' Mother Ratelist') && l.name.startsWith(parentLab.name))) &&
            !/\(.*?\bfrom\b.*?\)/i.test(l.name)
        );
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

            await apiService.clonePackageList(cloneTargetList.id, sourceId, disc, mark);

            // Auto rename target list name to store markup/discount and source list name
            const sourceList = allLists.find(l => l.id === sourceId);
            const sourceName = sourceList ? sourceList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim() : 'Mother Database';
            const cleanTargetName = cloneTargetList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim();

            let finalTargetName = cleanTargetName;
            if (mark > 0) {
                finalTargetName = `${cleanTargetName} (+${mark}% Markup from ${sourceName})`;
            } else if (disc > 0) {
                finalTargetName = `${cleanTargetName} (-${disc}% Discount from ${sourceName})`;
            }

            if (finalTargetName !== cloneTargetList.name) {
                await apiService.updatePackageListName(cloneTargetList.id, finalTargetName);
            }

            setIsCloneOpen(false);
            fetchData();
        } catch (error) {
            alert(`Error cloning and scaling package list: ${error}`);
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
        setSelectedCols(new Set());
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
            const cleanPkg: Package = {
                ...pkg,
                mrp: Number(pkg.mrp) || 0,
                b2b_price: Number(pkg.b2b_price) || 0
            };
            await apiService.updatePackageInList(cleanPkg);
            setPackages(prev => prev.map(p => p.id === pkg.id ? cleanPkg : p));
            setOriginalPackages(prev => prev.map(o => o.id === pkg.id ? JSON.parse(JSON.stringify(cleanPkg)) : o));
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

    // RTL-2: Yellow Alerts sorted first among existing packages
    const sortedInventoryPackages = React.useMemo(() => {
        return [...filteredInventoryPackages].sort((a, b) => {
            const aMrp = Number(a.mrp) || 0;
            const aB2b = Number(a.b2b_price) || 0;
            const bMrp = Number(b.mrp) || 0;
            const bB2b = Number(b.b2b_price) || 0;
            const aYellow = aMrp <= 0 || aB2b <= 0 || aB2b > aMrp;
            const bYellow = bMrp <= 0 || bB2b <= 0 || bB2b > bMrp;
            if (aYellow && !bYellow) return -1;
            if (!aYellow && bYellow) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [filteredInventoryPackages]);

    // RTL-2: Filtered missing master package mappings (Red Alert)
    const filteredMissingMaster = React.useMemo(() => {
        if (!editingList?.missing_master_packages) return [];
        const q = inventorySearchQuery.toLowerCase().trim();
        if (!q) return editingList.missing_master_packages;
        return editingList.missing_master_packages.filter(name =>
            name.toLowerCase().includes(q)
        );
    }, [editingList?.missing_master_packages, inventorySearchQuery]);

    const hasEdits = React.useMemo(() => {
        if (packages.length !== originalPackages.length) return true;
        return packages.some(pkg => {
            const orig = originalPackages.find(o => o.id === pkg.id);
            if (!orig) return true;
            return pkg.name !== orig.name ||
                (Number(pkg.mrp) || 0) !== orig.mrp ||
                (Number(pkg.b2b_price) || 0) !== orig.b2b_price ||
                (pkg.code_name || '') !== (orig.code_name || '');
        });
    }, [packages, originalPackages]);

    const handleGlobalSave = async () => {
        try {
            const cleanPackages: Package[] = packages.map(pkg => ({
                ...pkg,
                mrp: Number(pkg.mrp) || 0,
                b2b_price: Number(pkg.b2b_price) || 0
            }));
            const modified = cleanPackages.filter(pkg => {
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
            setPackages(cleanPackages);
            setOriginalPackages(JSON.parse(JSON.stringify(cleanPackages)));
            alert("All package inventory edits saved!");
            fetchData();
        } catch (error) {
            alert(`Failed to save edits: ${error}`);
        } finally {
            setIsLoading(false);
        }
    };

    // ----------------------------------------------------
    // RTL-3: Excel-like Grid Editing & Copy Handlers
    // ----------------------------------------------------
    const copyRowData = (pkg: Package) => {
        const text = `${pkg.code_name || ''}\t${pkg.name}\t${pkg.mrp}\t${pkg.b2b_price}`;
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(`Copied row: ${pkg.name}`);
            setTimeout(() => setCopyFeedback(null), 2500);
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    };

    const copyColumnData = (columnKey: 'code_name' | 'name' | 'mrp' | 'b2b_price') => {
        const colLabels: Record<string, string> = {
            code_name: 'Test Code',
            name: 'Package Name',
            mrp: 'MRP',
            b2b_price: 'B2B Price'
        };
        const lines = sortedInventoryPackages.map(p => {
            const val = p[columnKey];
            return val !== undefined && val !== null ? String(val) : '';
        });
        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(`Copied ${colLabels[columnKey]} (${lines.length} items)`);
            setTimeout(() => setCopyFeedback(null), 2500);
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    };

    const toggleColumnSelect = (col: 'code_name' | 'name' | 'mrp' | 'b2b_price') => {
        setSelectedCols(prev => {
            const next = new Set(prev);
            if (next.has(col)) {
                next.delete(col);
            } else {
                next.add(col);
            }
            return next;
        });
    };

    const selectAllColumns = () => {
        setSelectedCols(new Set(['code_name', 'name', 'mrp', 'b2b_price']));
    };

    const clearColumnSelection = () => {
        setSelectedCols(new Set());
    };

    const copySelectedColumnsData = () => {
        if (selectedCols.size === 0) return;
        const colOrder: Array<'code_name' | 'name' | 'mrp' | 'b2b_price'> = ['code_name', 'name', 'mrp', 'b2b_price'];
        const activeCols = colOrder.filter(c => selectedCols.has(c));
        const colNames: Record<string, string> = {
            code_name: 'Code',
            name: 'Name',
            mrp: 'MRP',
            b2b_price: 'B2B'
        };
        const lines = sortedInventoryPackages.map(pkg => {
            return activeCols.map(c => {
                const val = pkg[c];
                return val !== undefined && val !== null ? String(val) : '';
            }).join('\t');
        });
        const text = lines.join('\n');
        navigator.clipboard.writeText(text).then(() => {
            setCopyFeedback(`Copied [${activeCols.map(c => colNames[c]).join(', ')}] (${lines.length} rows)`);
            setTimeout(() => setCopyFeedback(null), 2500);
        }).catch(err => {
            console.error("Clipboard copy failed:", err);
        });
    };

    const handleGridKeyDown = (
        e: React.KeyboardEvent<HTMLInputElement>,
        rowIdx: number,
        colIdx: number,
        pkg: Package
    ) => {
        const input = e.currentTarget;

        // Safe selection checks that never throw regardless of input type
        let isAtEnd = true;
        let isAtStart = true;
        try {
            if (input.selectionStart !== null && input.selectionEnd !== null) {
                const isAllSelected = (input.selectionStart === 0 && input.selectionEnd === input.value.length);
                isAtEnd = isAllSelected || input.selectionStart === input.value.length;
                isAtStart = isAllSelected || (input.selectionStart === 0 && input.selectionEnd === 0);
            }
        } catch {
            isAtEnd = true;
            isAtStart = true;
        }

        // F2: edit in-place at end of cell (Excel convention)
        if (e.key === 'F2') {
            e.preventDefault();
            try {
                input.setSelectionRange(input.value.length, input.value.length);
            } catch {
                // Ignore if not supported
            }
            return;
        }

        // Tab & Shift+Tab across columns
        if (e.key === 'Tab') {
            e.preventDefault();
            let targetRow = rowIdx;
            let targetCol = colIdx;
            if (e.shiftKey) {
                if (colIdx > 0) {
                    targetCol = colIdx - 1;
                } else if (rowIdx > 0) {
                    targetRow = rowIdx - 1;
                    targetCol = 3;
                }
            } else {
                if (colIdx < 3) {
                    targetCol = colIdx + 1;
                } else if (rowIdx < sortedInventoryPackages.length - 1) {
                    targetRow = rowIdx + 1;
                    targetCol = 0;
                }
            }
            const targetInput = document.querySelector<HTMLInputElement>(
                `input[data-grid-row="${targetRow}"][data-grid-col="${targetCol}"]`
            );
            if (targetInput) {
                targetInput.focus();
                try { targetInput.select(); } catch {}
            }
            return;
        }

        // Arrow Down
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const nextInput = document.querySelector<HTMLInputElement>(
                `input[data-grid-row="${rowIdx + 1}"][data-grid-col="${colIdx}"]`
            );
            if (nextInput) {
                nextInput.focus();
                try { nextInput.select(); } catch {}
            }
            return;
        }

        // Arrow Up
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prevInput = document.querySelector<HTMLInputElement>(
                `input[data-grid-row="${rowIdx - 1}"][data-grid-col="${colIdx}"]`
            );
            if (prevInput) {
                prevInput.focus();
                try { prevInput.select(); } catch {}
            }
            return;
        }

        // Arrow Right -> moves to next column (e.g. MRP into B2B price), or wraps to next row col 0
        if (e.key === 'ArrowRight') {
            if (isAtEnd) {
                if (colIdx < 3) {
                    e.preventDefault();
                    const rightInput = document.querySelector<HTMLInputElement>(
                        `input[data-grid-row="${rowIdx}"][data-grid-col="${colIdx + 1}"]`
                    );
                    if (rightInput) {
                        rightInput.focus();
                        try { rightInput.select(); } catch {}
                    }
                } else if (rowIdx < sortedInventoryPackages.length - 1) {
                    e.preventDefault();
                    const nextRowInput = document.querySelector<HTMLInputElement>(
                        `input[data-grid-row="${rowIdx + 1}"][data-grid-col="0"]`
                    );
                    if (nextRowInput) {
                        nextRowInput.focus();
                        try { nextRowInput.select(); } catch {}
                    }
                }
            }
            return;
        }

        // Arrow Left -> moves to previous column (e.g. out of B2B price into MRP), or wraps to prev row col 3
        if (e.key === 'ArrowLeft') {
            if (isAtStart) {
                if (colIdx > 0) {
                    e.preventDefault();
                    const leftInput = document.querySelector<HTMLInputElement>(
                        `input[data-grid-row="${rowIdx}"][data-grid-col="${colIdx - 1}"]`
                    );
                    if (leftInput) {
                        leftInput.focus();
                        try { leftInput.select(); } catch {}
                    }
                } else if (rowIdx > 0) {
                    e.preventDefault();
                    const prevRowInput = document.querySelector<HTMLInputElement>(
                        `input[data-grid-row="${rowIdx - 1}"][data-grid-col="3"]`
                    );
                    if (prevRowInput) {
                        prevRowInput.focus();
                        try { prevRowInput.select(); } catch {}
                    }
                }
            }
            return;
        }

        // Enter Key moves down (or up with Shift)
        if (e.key === 'Enter') {
            e.preventDefault();
            const targetRow = e.shiftKey ? rowIdx - 1 : rowIdx + 1;
            const targetInput = document.querySelector<HTMLInputElement>(
                `input[data-grid-row="${targetRow}"][data-grid-col="${colIdx}"]`
            );
            if (targetInput) {
                targetInput.focus();
                try { targetInput.select(); } catch {}
            }
            return;
        }

        // Ctrl+C / Cmd+C: copy selected columns if active; otherwise copy row if cell unselected
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (selectedCols.size > 0) {
                e.preventDefault();
                copySelectedColumnsData();
                return;
            }
            let isCollapsed = false;
            try {
                isCollapsed = input.selectionStart === input.selectionEnd;
            } catch {
                isCollapsed = true;
            }
            if (isCollapsed) {
                e.preventDefault();
                copyRowData(pkg);
            }
            return;
        }
    };

    const handleGridPaste = (
        e: React.ClipboardEvent<HTMLInputElement>,
        pkgId: number
    ) => {
        const text = e.clipboardData.getData('text/plain');
        if (text && text.includes('\t')) {
            e.preventDefault();
            const line = text.split('\n')[0];
            const parts = line.split('\t');
            if (parts.length >= 2) {
                setPackages(prev => prev.map(p => {
                    if (p.id !== pkgId) return p;
                    return {
                        ...p,
                        code_name: parts[0] || p.code_name,
                        name: parts[1] || p.name,
                        mrp: parts[2] !== undefined && parts[2] !== '' ? Number(parts[2]) : p.mrp,
                        b2b_price: parts[3] !== undefined && parts[3] !== '' ? Number(parts[3]) : p.b2b_price
                    };
                }));
                setCopyFeedback("Pasted row data from clipboard");
                setTimeout(() => setCopyFeedback(null), 2500);
            }
        }
    };

    // ----------------------------------------------------
    // RTL-3: Ratelist XLSX-Only Export Handler
    // ----------------------------------------------------
    const handleExportXLSX = async (listToExport?: PackageList, listPackages?: Package[]) => {
        const list = listToExport || editingList;
        const pkgs = listPackages || packages;
        if (!list || pkgs.length === 0) {
            alert("No packages available to export.");
            return;
        }
        try {
            const Excel = (window as any).ExcelJS || ExcelJS;
            if (!Excel) {
                alert("ExcelJS library is not loaded.");
                return;
            }
            const workbook = new Excel.Workbook();
            workbook.creator = 'T&C-LIS';
            workbook.created = new Date();
            const sheetName = list.name.slice(0, 31).replace(/[\\/?*[\]]/g, '_');
            const worksheet = workbook.addWorksheet(sheetName);

            worksheet.columns = [
                { header: 'Test Code', key: 'code_name', width: 18 },
                { header: 'Package Name', key: 'name', width: 40 },
                { header: 'MRP', key: 'mrp', width: 15 },
                { header: 'B2B Price', key: 'b2b_price', width: 15 },
            ];

            const headerRow = worksheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FF1E293B' }
            };
            headerRow.height = 24;

            pkgs.forEach(pkg => {
                worksheet.addRow({
                    code_name: pkg.code_name || '',
                    name: pkg.name || '',
                    mrp: Number(pkg.mrp) || 0,
                    b2b_price: Number(pkg.b2b_price) || 0
                });
            });

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const safeName = list.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            a.download = `${safeName}_ratelist.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert("Export to XLSX failed: " + (err.message || err));
        }
    };

    const handleExportListXLSX = async (list: PackageList) => {
        try {
            const pkgs = await apiService.getPackagesForList(list.id);
            await handleExportXLSX(list, pkgs);
        } catch (err: any) {
            alert("Failed to load packages for export: " + (err.message || err));
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

                {/* Doctor Directory Expandable Section */}
                <fieldset className="border-2 border-emerald-200 bg-emerald-50/20 p-4 md:p-6 rounded-xl mb-8 transition-all">
                    <legend className="px-3 flex items-center justify-between cursor-pointer" onClick={() => setIsDoctorsOpen(!isDoctorsOpen)}>
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-emerald-600 flex items-center justify-center text-white shadow-sm">
                                <i className="fa-solid fa-user-doctor text-xs"></i>
                            </div>
                            <span className="text-base md:text-lg font-bold text-emerald-950 uppercase tracking-tight md:tracking-normal">
                                Doctor Directory
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                                {doctors.length} Doctors
                            </span>
                            {totalDuplicatesCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                                    <i className="fa-solid fa-triangle-exclamation text-[10px]"></i>
                                    {totalDuplicatesCount} Duplicates
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            className="ml-4 w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 hover:bg-emerald-200 flex items-center justify-center text-xs transition-transform"
                        >
                            <i className={`fa-solid ${isDoctorsOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                        </button>
                    </legend>

                    {isDoctorsOpen && (
                        <div className="space-y-4 pt-2 animate-in fade-in duration-150">
                            <p className="text-xs text-emerald-800/80 leading-relaxed">
                                Central database of referring doctors with usage counters and duplicate detection. Doctors are sorted by usage count descending for fast selection during receipt creation.
                            </p>

                            {/* Add Doctor Form & Filter Actions */}
                            <div className="flex flex-col lg:flex-row items-stretch lg:items-end gap-3 bg-white p-3.5 rounded-lg border border-emerald-100 shadow-sm">
                                <form onSubmit={handleAddDoctor} className="flex-1 flex flex-col sm:flex-row items-end gap-3">
                                    <div className="flex-1 w-full space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">Doctor Name</label>
                                        <input
                                            type="text"
                                            value={newDoctorName}
                                            onChange={e => setNewDoctorName(e.target.value)}
                                            placeholder="e.g. DR. JOHN DOE"
                                            className="w-full p-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={!newDoctorName.trim() || doctorActionLoading}
                                        className="w-full sm:w-auto px-5 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-all text-xs h-[38px] flex items-center justify-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
                                    >
                                        <i className="fa-solid fa-plus-circle"></i> Add Doctor
                                    </button>
                                </form>

                                <div className="flex flex-col sm:flex-row items-center gap-2 border-t lg:border-t-0 lg:border-l border-gray-100 pt-3 lg:pt-0 lg:pl-3">
                                    <div className="relative w-full sm:w-64">
                                        <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                        <input
                                            type="text"
                                            value={doctorSearch}
                                            onChange={e => setDoctorSearch(e.target.value)}
                                            placeholder="Search doctors..."
                                            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setShowOnlyDuplicates(!showOnlyDuplicates)}
                                        className={`w-full sm:w-auto px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 shrink-0 h-[38px] ${
                                            showOnlyDuplicates
                                                ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        <i className="fa-solid fa-filter text-[10px]"></i>
                                        {showOnlyDuplicates ? 'Showing Duplicates Only' : `Filter Duplicates (${totalDuplicatesCount})`}
                                    </button>
                                    {duplicateGroups.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMergeAllDuplicates}
                                            disabled={doctorActionLoading}
                                            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-all text-xs h-[38px] flex items-center justify-center gap-1.5 shrink-0 shadow-sm disabled:opacity-50"
                                            title="Merge all duplicate doctor variations into canonical format"
                                        >
                                            <i className="fa-solid fa-code-merge text-xs"></i>
                                            Merge All Duplicates ({duplicateGroups.length} Groups)
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Doctors List */}
                            <div className="bg-white rounded-lg border border-emerald-100 shadow-sm overflow-hidden">
                                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                                    {filteredDoctors.map((doc, idx) => {
                                        const isDuplicate = (duplicateNormMap.get(normalizeDoctor(doc.name)) || 0) > 1;
                                        const isEditing = editingDoctorId === doc.id;

                                        return (
                                            <div
                                                key={doc.id}
                                                className={`p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs transition-colors ${
                                                    isDuplicate ? 'bg-amber-50/40 hover:bg-amber-50/70' : 'hover:bg-gray-50'
                                                }`}
                                            >
                                                {isEditing ? (
                                                    <div className="flex-1 w-full space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="text"
                                                                value={editingDoctorName}
                                                                onChange={e => setEditingDoctorName(e.target.value)}
                                                                className="flex-1 p-2 border border-emerald-400 rounded-lg text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                                                                autoFocus
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSaveEditDoctor(doc.id)}
                                                                disabled={doctorActionLoading}
                                                                className="px-3 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 transition-all flex items-center gap-1 shadow-sm"
                                                            >
                                                                <i className="fa-solid fa-check"></i> Save
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingDoctorId(null)}
                                                                className="px-3 py-2 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-all"
                                                            >
                                                                <i className="fa-solid fa-xmark"></i> Cancel
                                                            </button>
                                                        </div>
                                                        <label className="flex items-center gap-2 text-[11px] text-gray-600 cursor-pointer pl-1">
                                                            <input
                                                                type="checkbox"
                                                                checked={syncReceipts}
                                                                onChange={e => setSyncReceipts(e.target.checked)}
                                                                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                                                            />
                                                            <span>Update historical receipts using the old doctor name</span>
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <span className="w-6 text-center font-mono text-[11px] text-gray-400 shrink-0">
                                                                #{idx + 1}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-bold text-gray-800 text-sm tracking-tight truncate">
                                                                        {doc.name}
                                                                    </span>
                                                                    {isDuplicate && (
                                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                                                                            Duplicate Variation
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                                                            <span className="px-2.5 py-1 rounded text-[11px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
                                                                <i className="fa-solid fa-receipt text-[10px]"></i>
                                                                {doc.usage_count} receipt{doc.usage_count === 1 ? '' : 's'}
                                                            </span>
                                                            <div className="flex items-center gap-1">
                                                                {isDuplicate && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            const grp = getDoctorGroup(doc);
                                                                            if (grp) handleOpenMergeGroup(grp);
                                                                        }}
                                                                        disabled={doctorActionLoading}
                                                                        className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 hover:bg-indigo-600 hover:text-white flex items-center justify-center transition-colors"
                                                                        title="Merge this duplicate doctor group"
                                                                    >
                                                                        <i className="fa-solid fa-code-merge text-[11px]"></i>
                                                                    </button>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleStartEditDoctor(doc)}
                                                                    className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-center transition-colors"
                                                                    title="Edit Doctor Name"
                                                                >
                                                                    <i className="fa-solid fa-pencil text-[11px]"></i>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteDoctor(doc.id, doc.name)}
                                                                    className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 hover:bg-rose-50 hover:text-rose-700 flex items-center justify-center transition-colors"
                                                                    title="Delete Doctor"
                                                                >
                                                                    <i className="fa-solid fa-trash-can text-[11px]"></i>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        );
                                    })}
                                    {filteredDoctors.length === 0 && (
                                        <div className="p-8 text-center text-xs text-gray-400 italic">
                                            {showOnlyDuplicates
                                                ? 'No duplicate doctor variations found!'
                                                : `No doctors found matching "${doctorSearch}"`}
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
                                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                            <span className="text-[10px] text-gray-400 font-mono italic">REF: #{lab.id.toString().padStart(3, '0')}</span>
                                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-50 text-blue-700 border border-blue-100 uppercase">
                                                                {labLists.length} Rate Databases
                                                            </span>
                                                            {(() => {
                                                                const totalSpacingMismatches = labLists.reduce((acc, l) => acc + (l.spacing_mismatch_count || 0), 0);
                                                                if (totalSpacingMismatches > 0) {
                                                                    return (
                                                                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300 uppercase flex items-center gap-1" title="Tests differing in spacing or punctuation from Mother Ratelist">
                                                                            <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                                                                            {totalSpacingMismatches} Spacing Mismatch{totalSpacingMismatches === 1 ? '' : 'es'}
                                                                        </span>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
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
                                                                                                {(() => {
                                                                                                    const parsedInfo = getMarkupInfo(list.name);
                                                                                                    if (!parsedInfo) return null;
                                                                                                    const motherList = allLists.find(l => {
                                                                                                        const isMatch = l.name.endsWith(' Mother Ratelist') || l.name.toLowerCase().includes('mother');
                                                                                                        return isMatch && lab.assigned_list_ids?.includes(l.id);
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
                                                                                                {((list.missing_master_count || 0) > 0) && (
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
                                                                                                {((list.critical_pricing_count || 0) > 0) && (
                                                                                                    <div className="relative group/crit-pricing inline-block shrink-0">
                                                                                                        <span className="cursor-help px-1.5 py-0.5 rounded-full text-[8px] font-black bg-red-100 text-red-700 border border-red-300 uppercase flex items-center gap-1 shrink-0 animate-pulse">
                                                                                                            <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                                                                                                            {list.critical_pricing_count} Price Error{list.critical_pricing_count === 1 ? '' : 's'}
                                                                                                        </span>
                                                                                                        <div className="absolute left-0 top-full mt-1.5 w-56 bg-gray-900 text-white text-[11px] rounded-lg p-2 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/crit-pricing:opacity-100 transition-opacity">
                                                                                                            <span className="font-bold text-red-300 block mb-0.5">Critical Pricing Issue</span>
                                                                                                            <span className="text-gray-300 leading-tight block">
                                                                                                                {list.critical_pricing_count} test{list.critical_pricing_count === 1 ? ' has' : 's have'} pricing errors (MRP ≤ 0 or B2B &gt; MRP).
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                                {hasYellowOutline && (
                                                                                                    <div className="relative group/yellow inline-block shrink-0">
                                                                                                        <span className="cursor-help px-1.5 py-0.5 rounded-full text-[8px] font-black bg-yellow-100 text-yellow-900 border border-yellow-300 uppercase flex items-center gap-1 shrink-0">
                                                                                                            <i className="fa-solid fa-circle-exclamation text-[9px]"></i>
                                                                                                            {list.missing_b2b_count || list.unconfigured_pricing_count || 0} Needs Price
                                                                                                        </span>
                                                                                                        <div className="absolute left-0 top-full mt-1.5 w-56 bg-gray-900 text-white text-[11px] rounded-lg p-2 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/yellow:opacity-100 transition-opacity">
                                                                                                            <span className="font-bold text-amber-300 block mb-0.5">Pricing Alert</span>
                                                                                                            <span className="text-gray-300 leading-tight block">
                                                                                                                {list.missing_b2b_count || list.unconfigured_pricing_count || 0} tests have unconfigured pricing (B2B ≤ 0).
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                                {((list.spacing_mismatch_count || 0) > 0) && (
                                                                                                    <div className="relative group/spacing-mismatch inline-block shrink-0">
                                                                                                        <span className="cursor-help px-1.5 py-0.5 rounded-full text-[8px] font-black bg-amber-100 text-amber-800 border border-amber-300 uppercase flex items-center gap-1 shrink-0">
                                                                                                            <i className="fa-solid fa-triangle-exclamation text-[9px]"></i>
                                                                                                            {list.spacing_mismatch_count} Spacing Mismatch{list.spacing_mismatch_count === 1 ? '' : 'es'}
                                                                                                        </span>
                                                                                                        <div className="absolute left-0 top-full mt-1.5 w-72 max-h-52 overflow-y-auto bg-gray-900 text-white text-[11px] rounded-lg p-2.5 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/spacing-mismatch:opacity-100 transition-opacity">
                                                                                                            <div className="font-bold text-amber-300 pb-1 border-b border-gray-700 mb-1 flex items-center justify-between">
                                                                                                                <span>Spacing Mismatches:</span>
                                                                                                                <span className="text-[9px] bg-amber-950 px-1 py-0.5 rounded text-amber-200">{list.spacing_mismatch_count}</span>
                                                                                                            </div>
                                                                                                            <p className="text-[10px] text-gray-400 mb-1.5 italic">
                                                                                                                Tests differing in spacing or punctuation from {list.mother_list_name || 'Mother Ratelist'}:
                                                                                                            </p>
                                                                                                            <ul className="space-y-1 text-gray-300">
                                                                                                                {(list.spacing_mismatches || []).slice(0, 6).map((mm, i) => (
                                                                                                                    <li key={i} className="text-[10.5px] leading-tight border-b border-gray-800/60 pb-1">
                                                                                                                        <span className="font-semibold text-amber-200 block truncate">{mm.child_test}</span>
                                                                                                                        <span className="text-[9.5px] text-gray-400 block mt-0.5">{mm.reason}</span>
                                                                                                                    </li>
                                                                                                                ))}
                                                                                                                {((list.spacing_mismatches?.length || 0) > 6) && (
                                                                                                                    <li className="text-[10px] text-gray-400 italic pt-1">
                                                                                                                        +{(list.spacing_mismatches?.length || 0) - 6} more
                                                                                                                    </li>
                                                                                                                )}
                                                                                                            </ul>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                                {((list.extra_tests_count || 0) > 0) && (
                                                                                                    <div className="relative group/extra-tests inline-block shrink-0">
                                                                                                        <span className="cursor-help px-1.5 py-0.5 rounded-full text-[8px] font-black bg-slate-100 text-slate-700 border border-slate-300 uppercase flex items-center gap-1 shrink-0">
                                                                                                            <i className="fa-solid fa-plus text-[8px]"></i>
                                                                                                            +{list.extra_tests_count} Extra
                                                                                                        </span>
                                                                                                        <div className="absolute left-0 top-full mt-1.5 w-72 max-h-52 overflow-y-auto bg-gray-900 text-white text-[11px] rounded-lg p-2.5 shadow-2xl z-50 pointer-events-none opacity-0 group-hover/extra-tests:opacity-100 transition-opacity">
                                                                                                            <div className="font-bold text-slate-300 pb-1 border-b border-gray-700 mb-1 flex items-center justify-between">
                                                                                                                <span>Manually Added Tests:</span>
                                                                                                                <span className="text-[9px] bg-slate-800 px-1 py-0.5 rounded text-slate-200">{list.extra_tests_count}</span>
                                                                                                            </div>
                                                                                                            <p className="text-[10px] text-gray-400 mb-1.5 italic">
                                                                                                                Tests present in this ratelist beyond {list.mother_list_name || 'Mother Ratelist'}:
                                                                                                            </p>
                                                                                                            <ul className="space-y-1 text-gray-300">
                                                                                                                {(list.extra_tests || []).slice(0, 8).map((et, i) => (
                                                                                                                    <li key={i} className="text-[10.5px] leading-tight border-b border-gray-800/60 pb-1 truncate">
                                                                                                                        <span className="font-semibold text-slate-200">{et.child_test}</span>
                                                                                                                    </li>
                                                                                                                ))}
                                                                                                                {((list.extra_tests?.length || 0) > 8) && (
                                                                                                                    <li className="text-[10px] text-gray-400 italic pt-1">
                                                                                                                        +{(list.extra_tests?.length || 0) - 8} more tests
                                                                                                                    </li>
                                                                                                                )}
                                                                                                            </ul>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                )}
                                                                                                <button
                                                                                                    onClick={() => {
                                                                                                        setRenamingListId(list.id);
                                                                                                        setRenamingListName(getCleanName(list.name));
                                                                                                    }}
                                                                                                    className="text-gray-400 hover:text-indigo-600 transition-colors p-0.5 shrink-0 -translate-y-[3px] inline-flex items-center self-center"
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
                                                                                        type="button"
                                                                                        onClick={() => handleExportListXLSX(list)}
                                                                                        className="px-2 py-1 bg-gray-50 hover:bg-emerald-600 hover:text-white rounded border border-gray-200 hover:border-emerald-700 transition-all font-bold text-[10px] text-gray-600 flex items-center gap-1 shadow-sm cursor-pointer"
                                                                                        title="Export Ratelist as Excel (.xlsx)"
                                                                                    >
                                                                                        <i className="fa-solid fa-download text-[9px]"></i> Export
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
                                                                                .filter(l => !lab.assigned_list_ids?.includes(l.id) && !isMotherRatelistName(l.name))
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
                                {allLists
                                    .filter(list => {
                                        const isListClone = /\(.*?\bfrom\b.*?\)/i.test(list.name) || /\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(list.name);
                                        const isMotherForLab = !isListClone && (list.name === `${syncingLab.name} Mother Ratelist` || (list.name.endsWith(' Mother Ratelist') && list.name.startsWith(syncingLab.name)));
                                        if (isMotherRatelistName(list.name) && !isMotherForLab) {
                                            return false;
                                        }
                                        return true;
                                    })
                                    .map(list => {
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

                        {/* Mother-Child Spacing Mismatch Alert Banner */}
                        {(editingList.spacing_mismatch_count || 0) > 0 && (
                            <div className="mb-4 p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex flex-col gap-2.5 shadow-sm">
                                <div className="flex items-center gap-2.5">
                                    <i className="fa-solid fa-triangle-exclamation text-amber-600 text-base shrink-0"></i>
                                    <div>
                                        <span className="text-xs font-bold text-amber-900 block">
                                            {editingList.spacing_mismatch_count} Spacing Mismatch{editingList.spacing_mismatch_count === 1 ? '' : 'es'} with Mother Ratelist ({editingList.mother_list_name})
                                        </span>
                                        <span className="text-[11px] text-amber-700">
                                            Tests in this rate list differ in spacing or punctuation from the laboratory's Mother Ratelist. These discrepancies can prevent matching during receipt billing.
                                        </span>
                                    </div>
                                </div>
                                <div className="bg-white rounded border border-amber-200 p-2.5 max-h-36 overflow-y-auto">
                                    <ul className="divide-y divide-amber-100">
                                        {(editingList.spacing_mismatches || []).map((mm, i) => (
                                            <li key={i} className="py-1 text-xs text-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                <span className="font-semibold text-amber-900">{mm.child_test}</span>
                                                <span className="text-[10px] text-amber-700 font-medium">{mm.reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* Search packages inside modal & Download XLSX */}
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
                            <div className="flex items-center gap-2 flex-wrap">
                                <i className="fa-solid fa-cubes text-slate-400 text-xs"></i>
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    Packages ({sortedInventoryPackages.length} items
                                    {(editingList.extra_tests_count || 0) > 0 ? `, ${editingList.extra_tests_count} manually added` : ''})
                                </span>
                                {copyFeedback && (
                                    <span className="ml-2 text-[10px] bg-slate-800 text-white font-mono px-2 py-0.5 rounded shadow animate-in fade-in flex items-center gap-1">
                                        <i className="fa-solid fa-check text-emerald-400 text-[9px]"></i>
                                        {copyFeedback}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 w-full sm:w-auto">
                                <div className="relative flex-grow sm:w-72">
                                    <i className="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input
                                        type="text"
                                        value={inventorySearchQuery}
                                        onChange={e => setInventorySearchQuery(e.target.value)}
                                        placeholder="Search package name or code..."
                                        className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none text-xs font-medium transition-all"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleExportXLSX()}
                                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 shrink-0 transition-all cursor-pointer"
                                    title="Export Ratelist to Excel (.xlsx only)"
                                >
                                    <i className="fa-solid fa-file-excel text-xs"></i>
                                    Download XLSX
                                </button>
                            </div>
                        </div>

                        {/* Multi-column Selection Banner */}
                        {selectedCols.size > 0 && (
                            <div className="bg-blue-50/90 border border-blue-200 rounded-lg px-3.5 py-2 mb-2 flex items-center justify-between gap-3 text-xs shadow-sm">
                                <div className="flex items-center gap-2 text-blue-900 font-semibold">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                                    <span>
                                        {selectedCols.size} {selectedCols.size === 1 ? 'column' : 'columns'} selected
                                    </span>
                                    <span className="text-blue-500 font-normal">
                                        (Ctrl+C or click button to copy {Array.from(selectedCols).map(c => ({ code_name: 'Code', name: 'Name', mrp: 'MRP', b2b_price: 'B2B' }[c])).join(', ')})
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={copySelectedColumnsData}
                                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-[11px] shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                                        title="Copy selected columns (TSV format for Excel)"
                                    >
                                        <i className="fa-regular fa-copy text-[10px]"></i>
                                        Copy Selected
                                    </button>
                                    <button
                                        type="button"
                                        onClick={selectAllColumns}
                                        className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-800 border border-blue-200 font-bold rounded text-[11px] transition-all cursor-pointer"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={clearColumnSelection}
                                        className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-600 border border-gray-200 font-medium rounded text-[11px] transition-all cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Existing packages table */}
                        <div className="overflow-y-auto flex-grow rounded-lg border border-gray-200 bg-white shadow-inner custom-scrollbar-minimal">
                            <table className="w-full text-sm divide-y divide-gray-100">
                                <thead className="bg-gray-50 sticky top-0 z-10">
                                    <tr>
                                        <th
                                            onClick={() => toggleColumnSelect('code_name')}
                                            className={`p-2 text-left text-[10px] font-bold uppercase tracking-widest pl-4 border-b cursor-pointer transition-colors select-none w-36 ${
                                                selectedCols.has('code_name')
                                                    ? 'bg-blue-100 text-blue-900 border-blue-400'
                                                    : 'text-gray-500 hover:bg-gray-100 border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCols.has('code_name')}
                                                        onChange={() => toggleColumnSelect('code_name')}
                                                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-400 cursor-pointer"
                                                    />
                                                    <span>Test Code</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); copyColumnData('code_name'); }}
                                                    className="text-gray-400 hover:text-gray-700 text-[10px] p-0.5 rounded hover:bg-white/60"
                                                    title="Copy Test Code column to clipboard"
                                                >
                                                    <i className="fa-regular fa-copy"></i>
                                                </button>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => toggleColumnSelect('name')}
                                            className={`p-2 text-left text-[10px] font-bold uppercase tracking-widest border-b cursor-pointer transition-colors select-none ${
                                                selectedCols.has('name')
                                                    ? 'bg-blue-100 text-blue-900 border-blue-400'
                                                    : 'text-gray-500 hover:bg-gray-100 border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCols.has('name')}
                                                        onChange={() => toggleColumnSelect('name')}
                                                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-400 cursor-pointer"
                                                    />
                                                    <span>Package Name</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); copyColumnData('name'); }}
                                                    className="text-gray-400 hover:text-gray-700 text-[10px] p-0.5 rounded hover:bg-white/60"
                                                    title="Copy Package Name column to clipboard"
                                                >
                                                    <i className="fa-regular fa-copy"></i>
                                                </button>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => toggleColumnSelect('mrp')}
                                            className={`p-2 text-left text-[10px] font-bold uppercase tracking-widest w-28 border-b cursor-pointer transition-colors select-none ${
                                                selectedCols.has('mrp')
                                                    ? 'bg-blue-100 text-blue-900 border-blue-400'
                                                    : 'text-gray-500 hover:bg-gray-100 border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCols.has('mrp')}
                                                        onChange={() => toggleColumnSelect('mrp')}
                                                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-400 cursor-pointer"
                                                    />
                                                    <span>MRP</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); copyColumnData('mrp'); }}
                                                    className="text-gray-400 hover:text-gray-700 text-[10px] p-0.5 rounded hover:bg-white/60"
                                                    title="Copy MRP column to clipboard"
                                                >
                                                    <i className="fa-regular fa-copy"></i>
                                                </button>
                                            </div>
                                        </th>
                                        <th
                                            onClick={() => toggleColumnSelect('b2b_price')}
                                            className={`p-2 text-left text-[10px] font-bold uppercase tracking-widest w-28 border-b cursor-pointer transition-colors select-none ${
                                                selectedCols.has('b2b_price')
                                                    ? 'bg-blue-100 text-blue-900 border-blue-400'
                                                    : 'text-gray-500 hover:bg-gray-100 border-gray-200'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-1">
                                                <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedCols.has('b2b_price')}
                                                        onChange={() => toggleColumnSelect('b2b_price')}
                                                        className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-400 cursor-pointer"
                                                    />
                                                    <span>B2B Price</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={e => { e.stopPropagation(); copyColumnData('b2b_price'); }}
                                                    className="text-gray-400 hover:text-gray-700 text-[10px] p-0.5 rounded hover:bg-white/60"
                                                    title="Copy B2B Price column to clipboard"
                                                >
                                                    <i className="fa-regular fa-copy"></i>
                                                </button>
                                            </div>
                                        </th>
                                        <th className="p-2 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-200 w-28">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {/* RTL-2: Red Alert Mappings at the very TOP */}
                                    {filteredMissingMaster.length > 0 && (
                                        <>
                                            <tr className="bg-red-50/90 border-y border-red-200">
                                                <td colSpan={5} className="py-2 px-4 text-[10px] font-black text-red-700 uppercase tracking-widest bg-red-100/60">
                                                    <i className="fa-solid fa-triangle-exclamation mr-1.5 text-red-600"></i>
                                                    Red Alert Mappings: Missing Master Packages ({filteredMissingMaster.length})
                                                </td>
                                            </tr>
                                            {filteredMissingMaster.map((missingName, idx) => (
                                                <tr key={`missing-${idx}`} className="bg-red-50/40 border-l-4 border-red-500 border-b border-red-100 hover:bg-red-100/60 transition-colors">
                                                    <td className="p-1 pl-4 text-xs text-red-600 font-mono font-bold">
                                                        UNMAPPED
                                                    </td>
                                                    <td className="p-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-red-600 text-white uppercase shrink-0">Red Alert</span>
                                                            <span className="text-xs font-bold text-red-950">{missingName}</span>
                                                        </div>
                                                    </td>
                                                    <td className="p-1 text-xs text-red-400 font-mono italic pl-4">₹0.00</td>
                                                    <td className="p-1 text-xs text-red-400 font-mono italic pl-4">₹0.00</td>
                                                    <td className="p-1 text-center">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAcceptMissingMaster([missingName])}
                                                            className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 mx-auto"
                                                            title="Map & insert into ratelist"
                                                        >
                                                            <i className="fa-solid fa-plus-circle text-[9px]"></i> Map & Insert
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </>
                                    )}

                                    {/* RTL-2: Yellow Alert Items (first) followed by normal configured items */}
                                    {sortedInventoryPackages.map((pkg, rowIdx) => {
                                        const numMrp = Number(pkg.mrp) || 0;
                                        const numB2b = Number(pkg.b2b_price) || 0;
                                        const isUnconfigured = numMrp <= 0 || numB2b <= 0 || numB2b > numMrp;
                                        return (
                                            <tr key={pkg.id} className={`transition-colors group ${isUnconfigured ? 'bg-yellow-50/90 border-l-4 border-yellow-500 ring-1 ring-inset ring-yellow-400' : 'hover:bg-gray-50/50'}`}>
                                                <td className={`p-1 pl-4 w-36 transition-colors ${selectedCols.has('code_name') ? 'bg-blue-50/70 border-x border-blue-100' : ''}`}>
                                                    <input
                                                        data-grid-row={rowIdx}
                                                        data-grid-col={0}
                                                        value={pkg.code_name || ''}
                                                        onChange={e => handlePackageChange(pkg.id, 'code_name', e.target.value)}
                                                        onKeyDown={e => handleGridKeyDown(e, rowIdx, 0, pkg)}
                                                        onPaste={e => handleGridPaste(e, pkg.id)}
                                                        placeholder="N/A"
                                                        className="w-full p-1.5 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none font-medium text-gray-755 text-sm font-mono animate-none"
                                                    />
                                                </td>
                                                <td className={`p-1 transition-colors ${selectedCols.has('name') ? 'bg-blue-50/70 border-x border-blue-100' : ''}`}>
                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            data-grid-row={rowIdx}
                                                            data-grid-col={1}
                                                            value={pkg.name}
                                                            onChange={e => handlePackageChange(pkg.id, 'name', e.target.value)}
                                                            onKeyDown={e => handleGridKeyDown(e, rowIdx, 1, pkg)}
                                                            onPaste={e => handleGridPaste(e, pkg.id)}
                                                            className="w-full p-1.5 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none font-medium text-gray-755 text-sm"
                                                        />
                                                        {isUnconfigured && (
                                                            <PriceAlertTooltip mrp={numMrp} b2b_price={numB2b} />
                                                        )}
                                                    </div>
                                                </td>
                                                <td className={`p-1 transition-colors ${selectedCols.has('mrp') ? 'bg-blue-50/70 border-x border-blue-100' : ''}`}>
                                                    <div className="relative">
                                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-300 text-[10px]">₹</span>
                                                        <input
                                                            data-grid-row={rowIdx}
                                                            data-grid-col={2}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={pkg.mrp !== undefined && pkg.mrp !== null ? String(pkg.mrp) : ''}
                                                            onChange={e => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handlePackageChange(pkg.id, 'mrp', val);
                                                            }}
                                                            onBlur={e => {
                                                                const num = parseFloat(e.target.value);
                                                                handlePackageChange(pkg.id, 'mrp', isNaN(num) ? 0 : num);
                                                            }}
                                                            onKeyDown={e => handleGridKeyDown(e, rowIdx, 2, pkg)}
                                                            onPaste={e => handleGridPaste(e, pkg.id)}
                                                            className="w-full p-1.5 pl-4 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none text-gray-600 text-sm font-mono"
                                                        />
                                                    </div>
                                                </td>
                                                <td className={`p-1 transition-colors ${selectedCols.has('b2b_price') ? 'bg-blue-50/70 border-x border-blue-100' : ''}`}>
                                                    <div className="relative font-bold">
                                                        <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-blue-200 text-[10px]">₹</span>
                                                        <input
                                                            data-grid-row={rowIdx}
                                                            data-grid-col={3}
                                                            type="text"
                                                            inputMode="decimal"
                                                            value={pkg.b2b_price !== undefined && pkg.b2b_price !== null ? String(pkg.b2b_price) : ''}
                                                            onChange={e => {
                                                                const val = e.target.value.replace(/[^0-9.]/g, '');
                                                                handlePackageChange(pkg.id, 'b2b_price', val);
                                                            }}
                                                            onBlur={e => {
                                                                const num = parseFloat(e.target.value);
                                                                handlePackageChange(pkg.id, 'b2b_price', isNaN(num) ? 0 : num);
                                                            }}
                                                            onKeyDown={e => handleGridKeyDown(e, rowIdx, 3, pkg)}
                                                            onPaste={e => handleGridPaste(e, pkg.id)}
                                                            className="w-full p-1.5 pl-4 bg-transparent border-b border-transparent focus:border-yellow-400 outline-none text-blue-700 font-bold text-sm font-mono"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="p-1 text-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        <button onClick={() => handleSavePackage(pkg)} className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-blue-600 hover:text-white rounded border border-gray-100 transition-all shrink-0" title="Save Product">
                                                            <i className="fa-solid fa-floppy-disk text-[10px]"></i>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyRowData(pkg)}
                                                            className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-slate-700 hover:text-white rounded border border-gray-100 transition-all shrink-0"
                                                            title="Copy Row to clipboard (Excel TSV)"
                                                        >
                                                            <i className="fa-regular fa-copy text-[10px]"></i>
                                                        </button>
                                                        <button onClick={() => handleDeletePackage(pkg.id)} className="w-7 h-7 flex items-center justify-center bg-gray-50 text-gray-400 hover:bg-red-600 hover:text-white rounded border border-gray-100 transition-all shrink-0 animate-none" title="Delete Product">
                                                            <i className="fa-solid fa-trash-can text-[10px]"></i>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {sortedInventoryPackages.length === 0 && filteredMissingMaster.length === 0 && (
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
                                    <h2 className="text-base font-bold text-gray-800">Sync &amp; Scale Wizard</h2>
                                    <p className="text-[10px] text-gray-450 font-bold uppercase tracking-wider">Target: {cloneTargetList.name}</p>
                                </div>
                            </div>

                            <div className="space-y-3.5 text-xs text-slate-650">
                                <div className="bg-blue-50 border border-blue-150 p-3 rounded-lg text-[10px] text-blue-800">
                                    <strong>Sync Notice:</strong> This operation clears all existing items in the target database and clones all packages from the selected mother/source database, applying the requested scaling.
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
                                                    .filter(l => {
                                                        if (l.id === cloneTargetList.id) return false;
                                                        const isMother = isMotherRatelistName(l.name);
                                                        if (isMother) {
                                                            const isMotherForTargetLab = cloneTargetLab && (
                                                                l.name === `${cloneTargetLab.name} Mother Ratelist` ||
                                                                (l.name.endsWith(' Mother Ratelist') && l.name.startsWith(cloneTargetLab.name))
                                                            );
                                                            return !!isMotherForTargetLab;
                                                        }
                                                        return true;
                                                    })
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
                                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-xs transition-all shadow-sm">Clone &amp; Apply</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
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

            {/* Modal: Merge Doctor Group */}
            {activeMergeGroup && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg border border-gray-200 flex flex-col space-y-4">
                        <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-white shadow-sm">
                                    <i className="fa-solid fa-code-merge text-xs"></i>
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-gray-800">Merge Doctor Variations</h3>
                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Unify duplicate records and sync receipts</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveMergeGroup(null)}
                                className="text-gray-400 hover:text-red-500"
                            >
                                <i className="fa-solid fa-xmark text-lg"></i>
                            </button>
                        </div>

                        <div className="space-y-3 text-xs text-gray-700">
                            <p className="text-[11px] text-gray-500">
                                Select or specify the canonical doctor name to retain. All receipts matching any of these variations will be updated, and redundant entries will be removed.
                            </p>

                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Found Variations ({activeMergeGroup.doctors.length})</span>
                                <div className="space-y-1.5">
                                    {activeMergeGroup.doctors.map(d => (
                                        <label
                                            key={d.id}
                                            className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${
                                                selectedCanonicalName === d.name
                                                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold'
                                                    : 'bg-white border-gray-200 hover:bg-gray-100/70'
                                            }`}
                                            onClick={() => setSelectedCanonicalName(d.name)}
                                        >
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="radio"
                                                    name="canonicalDocName"
                                                    checked={selectedCanonicalName === d.name}
                                                    onChange={() => setSelectedCanonicalName(d.name)}
                                                    className="text-indigo-600 focus:ring-indigo-500"
                                                />
                                                <span className="font-mono text-xs">{d.name}</span>
                                            </div>
                                            <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 font-bold">
                                                {d.usage_count} receipt{d.usage_count === 1 ? '' : 's'}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase">Canonical Target Name</label>
                                <input
                                    type="text"
                                    value={selectedCanonicalName}
                                    onChange={e => setSelectedCanonicalName(e.target.value)}
                                    placeholder="e.g. DR. JOHN DOE"
                                    className="w-full p-2.5 border border-indigo-200 rounded-lg text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                />
                                <span className="text-[10px] text-gray-400 block pt-0.5">
                                    Recommended standard format: <code>{activeMergeGroup.canonical_name}</code>
                                </span>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setActiveMergeGroup(null)}
                                className="px-4 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmMergeGroup}
                                disabled={doctorActionLoading || !selectedCanonicalName.trim()}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <i className="fa-solid fa-code-merge"></i> Confirm &amp; Merge
                            </button>
                        </div>
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