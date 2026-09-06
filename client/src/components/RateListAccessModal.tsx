import React, { useMemo, useState } from 'react';
import { Lab, PackageList, User } from '../types';
import { apiService } from '../services/api';
import { RatelistLinkedClientsTooltip, RatelistMarkupTagTooltip } from './RatelistTooltips';

interface RateListAccessModalProps {
    isOpen: boolean;
    onClose: () => void;
    labs: Lab[];
    packageLists: PackageList[];
    selectedListIds: Set<number>;
    onToggle: (listId: number) => void;
    isUserCreation?: boolean;
    userRole?: string;
    clientUsername?: string;
}

const RateListAccessModal: React.FC<RateListAccessModalProps> = ({ 
    isOpen, 
    onClose, 
    labs, 
    packageLists, 
    selectedListIds, 
    onToggle,
    isUserCreation = false,
    userRole = '',
    clientUsername = ''
}) => {
    // Sync Wizard State for CLIENT creation
    const [isSyncWizardOpen, setIsSyncWizardOpen] = useState(false);
    const [newListName, setNewListName] = useState('');
    const [discountPercent, setDiscountPercent] = useState('0');
    const [markupPercent, setMarkupPercent] = useState('0');
    const [createdListId, setCreatedListId] = useState<number | null>(null);
    const [isSavingSync, setIsSavingSync] = useState(false);

    const scrollContainerRef = React.useRef<HTMLDivElement>(null);
    const [users, setUsers] = useState<User[]>([]);

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

    const isMotherList = (name?: string) => {
        if (!name) return false;
        if (/\(.*?\bfrom\b.*?\)/i.test(name)) return false;
        if (/\([+-]?\d+(?:\.\d+)?%\s*(?:Markup|Discount|PROFIT)/i.test(name)) return false;
        const clean = name.replace(/\s*\([^)]*\)\s*$/g, '').trim();
        return clean.endsWith('Mother Ratelist') || 
               clean.endsWith('Mother Rate List') || 
               /^\[M\]/i.test(clean) || 
               /\[M\]$/i.test(clean);
    };

    React.useEffect(() => {
        if (isOpen) {
            apiService.getUsers().then(data => {
                setUsers(data);
            }).catch(err => {
                console.error("Failed to load users for tooltip", err);
            });
        }
    }, [isOpen]);

    React.useEffect(() => {
        if (!isOpen) return;

        let toggle = true;
        const interval = setInterval(() => {
            if (scrollContainerRef.current) {
                scrollContainerRef.current.scrollBy({ left: toggle ? 1 : -1 });
                toggle = !toggle;
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isOpen]);

    const scrollLeft = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: -260, behavior: 'smooth' });
        }
    };

    const scrollRight = () => {
        if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollBy({ left: 260, behavior: 'smooth' });
        }
    };

    const columns = useMemo(() => {
        const assignedToListIds = new Set<number>();
        const labGroups: { labName: string; lists: PackageList[] }[] = [];

        // Filter out deleted lists
        const activeLists = packageLists.filter(pl => !pl.name.startsWith('[DELETED]'));

        // Group by labs
        labs.forEach(lab => {
            const lists = activeLists.filter(pl => lab.assigned_list_ids?.includes(pl.id));
            lists.sort((a, b) => {
                const aIsMother = isMotherList(a.name);
                const bIsMother = isMotherList(b.name);
                if (aIsMother && !bIsMother) return -1;
                if (!aIsMother && bIsMother) return 1;
                return a.name.localeCompare(b.name);
            });
            lists.forEach(l => assignedToListIds.add(l.id));
            if (lists.length > 0) {
                labGroups.push({ labName: lab.name, lists });
            }
        });

        // Orphans (Unassigned)
        const orphans = activeLists.filter(pl => !assignedToListIds.has(pl.id));
        if (orphans.length > 0) {
            labGroups.push({ labName: 'Unassigned Lists', lists: orphans });
        }

        return labGroups;
    }, [labs, packageLists]);

    const isClientCreation = isUserCreation && userRole === 'CLIENT';
    const selectedListId = Array.from(selectedListIds)[0];
    const selectedListObj = packageLists.find(pl => pl.id === selectedListId);
    const isSelectedMother = isMotherList(selectedListObj?.name);
    const showNextButton = isClientCreation && isSelectedMother;

    const handleItemClick = (list: PackageList) => {
        const isMother = isMotherList(list.name);

        if (isClientCreation) {
            // Physically restrict selection to a single list
            const currentListIds = Array.from(selectedListIds);
            if (currentListIds.length > 0 && !selectedListIds.has(list.id)) {
                // Smoothly switch single selection by clearing the previous choice
                currentListIds.forEach(id => onToggle(id));
            }
            onToggle(list.id);
        } else {
            // Editing mode / Non-CLIENT role
            if (!isUserCreation && userRole === 'CLIENT') {
                if (!selectedListIds.has(list.id) && isMother) {
                    const confirmChoice = window.confirm("Are you sure?");
                    if (!confirmChoice) return;
                }
            }
            onToggle(list.id);
        }
    };

    const handleHeaderClick = (colLists: PackageList[]) => {
        const motherList = colLists.find(l => isMotherList(l.name));
        if (motherList) {
            if (!selectedListIds.has(motherList.id)) {
                if (isClientCreation) {
                    const currentListIds = Array.from(selectedListIds);
                    currentListIds.forEach(id => onToggle(id));
                }
                handleItemClick(motherList);
            }
        }
    };

    const handleNextClick = async () => {
        if (!selectedListId) return;

        // Find the lab of the selected mother list
        const labOfSelectedList = labs.find(lab => lab.assigned_list_ids?.includes(selectedListId));
        if (!labOfSelectedList) {
            alert("Selected Mother Ratelist is not assigned to any laboratory!");
            return;
        }

        try {
            setIsSavingSync(true);
            const usernameParam = clientUsername.trim() || 'New Client';
            const res = await apiService.autoCreateClientList(usernameParam, labOfSelectedList.id);

            setCreatedListId(res.id);
            setNewListName(res.name);
            setIsSyncWizardOpen(true);
        } catch (err: any) {
            alert(`Failed to auto-create package list: ${err.message || err}`);
        } finally {
            setIsSavingSync(false);
        }
    };

    const handleSyncSave = async () => {
        if (!createdListId || !selectedListId) return;

        const disc = parseFloat(discountPercent) || 0;
        const mark = parseFloat(markupPercent) || 0;

        if (disc > 0 || mark === 0) {
            const confirmSave = window.confirm("Are you sure you want to discount/ not markup the parent ratelist?");
            if (!confirmSave) return;
        }

        try {
            setIsSavingSync(true);

            // 1. Rename custom list with scale suffix automatically including mother source list info
            let finalListName = (newListName.trim() !== '' ? newListName.trim() : clientUsername);
            const sourceList = selectedListObj;
            const sourceName = sourceList ? sourceList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim() : 'Mother Database';
            if (mark > 0) {
                finalListName = `${finalListName} (+${mark}% Markup from ${sourceName})`;
            } else if (disc > 0) {
                finalListName = `${finalListName} (-${disc}% Discount from ${sourceName})`;
            }
            await apiService.updatePackageListName(createdListId, finalListName);

            // 2. Sync clone packages from mother to new list
            await apiService.clonePackageList(createdListId, selectedListId, disc, mark);

            // 3. Update parent list states
            onToggle(selectedListId); // Deselect Mother list
            onToggle(createdListId);  // Select the newly created custom client list

            // Close modals
            setIsSyncWizardOpen(false);
            onClose();
            alert("Custom B2B client ratelist created and synced successfully!");
        } catch (err: any) {
            alert(`Failed to save and sync packages: ${err.message || err}`);
        } finally {
            setIsSavingSync(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[85vh] flex flex-col overflow-hidden border border-gray-200 animate-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="p-4 border-b border-gray-300 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">Rate Database Access</h2>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold mt-0.5">
                            {isClientCreation 
                                ? "Choose a Mother Ratelist to sync-clone, or assign an existing Client Ratelist" 
                                : "Configure Rate list visibility per account"
                            }
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600">
                        <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>

                {/* Content - Horizontal Scrollable Columns Wrapper */}
                <div className="flex-1 relative flex flex-col overflow-hidden bg-white min-h-[400px] h-[52vh]">
                    {/* Left Scroll Navigation Button */}
                    <button 
                        type="button"
                        onClick={scrollLeft}
                        className="absolute left-3 top-[40%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 border border-slate-700 backdrop-blur-sm opacity-80 hover:opacity-100"
                        title="Scroll Left"
                    >
                        <i className="fa-solid fa-chevron-left text-sm"></i>
                    </button>

                    <div 
                        ref={scrollContainerRef}
                        onWheel={(e) => {
                            if (e.deltaY !== 0) {
                                e.currentTarget.scrollLeft += e.deltaY;
                            }
                        }}
                        className="w-full h-full overflow-x-scroll overflow-y-hidden p-4 scrollbar-thin"
                    >
                        <div className="flex gap-4 h-full min-w-max pb-4">
                            {columns.map((col, idx) => (
                                <div key={idx} className="w-64 flex flex-col border border-gray-200 rounded-lg bg-gray-50 shadow-sm overflow-hidden shrink-0">
                                    <div 
                                        onClick={() => handleHeaderClick(col.lists)}
                                        className="p-2 border-b border-gray-200 bg-white sticky top-0 z-10 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors select-none"
                                        title="Click to automatically select Mother Ratelist"
                                    >
                                        <h3 className="font-bold text-gray-700 text-xs truncate flex items-center gap-1.5">
                                            <i className={`fa-solid ${col.labName === 'Unassigned Lists' ? 'fa-folder-open text-orange-400' : 'fa-flask-vial text-blue-500'} text-[10px]`}></i>
                                            {col.labName}
                                        </h3>
                                        <span className="text-[9px] font-black text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                            {col.lists.length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-scroll p-1.5 space-y-1 custom-scrollbar-minimal">
                                        {col.lists.map(list => {
                                            const isSelected = selectedListIds.has(list.id);
                                            const isMother = isMotherList(list.name);
                                            return (
                                                <div
                                                    key={list.id}
                                                    onClick={() => handleItemClick(list)}
                                                    className={`group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-all border text-xs ${isSelected
                                                        ? 'bg-blue-600 border-blue-700 text-white shadow-sm'
                                                        : 'bg-white border-gray-100 hover:border-gray-300 text-gray-600'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-2 truncate">
                                                        <div className={`w-4 h-4 rounded-sm border flex items-center justify-center transition-all ${isSelected ? 'bg-white border-white text-blue-600' : 'bg-white border-gray-300'
                                                            }`}>
                                                            {isSelected && <i className="fa-solid fa-check text-[8px]"></i>}
                                                        </div>
                                                          <RatelistLinkedClientsTooltip listId={list.id} users={users} yOffset={30}>
                                                             <span className="font-semibold truncate cursor-help border-b border-dashed border-gray-300">
                                                                 {getCleanName(list.name)}
                                                             </span>
                                                         </RatelistLinkedClientsTooltip>
                                                         {(() => {
                                                             const parsedInfo = parseMarkupDiscount(list.name);
                                                             if (parsedInfo) {
                                                                 const motherList = col.lists.find(pl => pl.name.endsWith(' Mother Ratelist') && pl.name.startsWith(col.labName));
                                                                 const fallbackMotherName = motherList 
                                                                     ? motherList.name.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+[^)]+)?\)/i, '').trim() 
                                                                     : `${col.labName} Mother Ratelist`;
                                                                 const sourceName = parsedInfo.sourceName || fallbackMotherName;
                                                                 return (
                                                                     <RatelistMarkupTagTooltip 
                                                                         pctStr={parsedInfo.pctStr} 
                                                                         isMarkup={parsedInfo.isMarkup} 
                                                                         motherListName={sourceName} 
                                                                         yOffset={30}
                                                                     />
                                                                 );
                                                             }
                                                             return null;
                                                         })()}
                                                    </div>
                                                    {isMother && (
                                                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold border leading-none ${isSelected ? 'bg-blue-500 text-white border-blue-400' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                                                            Mother
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Right Scroll Navigation Button */}
                    <button 
                        type="button"
                        onClick={scrollRight}
                        className="absolute right-3 top-[40%] -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-slate-800 hover:bg-slate-700 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 active:scale-95 border border-slate-700 backdrop-blur-sm opacity-80 hover:opacity-100"
                        title="Scroll Right"
                    >
                        <i className="fa-solid fa-chevron-right text-sm"></i>
                    </button>
                </div>

                {/* Footer */}
                <div className="p-3 border-t border-gray-300 bg-gray-50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-wider px-2">
                        <i className="fa-solid fa-circle-info text-blue-400"></i>
                        {selectedListIds.size} Lists Assigned
                    </div>
                    {showNextButton ? (
                        <button
                            onClick={handleNextClick}
                            disabled={isSavingSync}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm transition-all text-xs flex items-center gap-1.5"
                        >
                            {isSavingSync && <i className="fa-solid fa-spinner fa-spin text-[10px]"></i>}
                            Next
                        </button>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-sm transition-all text-xs"
                        >
                            Apply Changes
                        </button>
                    )}
                </div>
            </div>

            {/* Inline Clone & Sync Modal */}
            {isSyncWizardOpen && selectedListObj && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex justify-center items-center z-[60] p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 border border-gray-150 space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="flex items-center gap-3 border-b border-gray-200 pb-3">
                            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md">
                                <i className="fa-solid fa-sync text-xs animate-spin-slow"></i>
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-gray-800">Sync & Scale Wizard for Client</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Source Mother: {selectedListObj.name}</p>
                            </div>
                        </div>

                        <div className="space-y-4 text-xs">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase block pl-0.5">Custom Ratelist Name</label>
                                <input
                                    type="text"
                                    value={newListName}
                                    onChange={e => setNewListName(e.target.value)}
                                    placeholder="e.g. Client Name"
                                    required
                                    className="w-full p-2.5 border border-gray-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-50 outline-none transition-all font-semibold text-gray-700"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block pl-0.5">Discount Percent (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        value={discountPercent}
                                        onChange={e => setDiscountPercent(e.target.value)}
                                        className="w-full p-2 border border-gray-200 rounded-lg bg-slate-50 focus:bg-white outline-none font-mono"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase block pl-0.5">Markup Percent (%)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={markupPercent}
                                        onChange={e => setMarkupPercent(e.target.value)}
                                        className="w-full p-2 border border-gray-200 rounded-lg bg-slate-50 focus:bg-white outline-none font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
                            <button
                                type="button"
                                onClick={() => setIsSyncWizardOpen(false)}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-650 rounded-lg font-bold text-xs transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSyncSave}
                                disabled={isSavingSync}
                                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-all shadow-md shadow-indigo-100 flex items-center gap-1.5"
                            >
                                {isSavingSync ? (
                                    <>
                                        <i className="fa-solid fa-spinner fa-spin text-[10px]"></i>
                                        Syncing...
                                    </>
                                ) : (
                                    <>
                                        <i className="fa-solid fa-check"></i>
                                        Save & Sync
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RateListAccessModal;
