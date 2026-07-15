import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import CleanSelect from '../../components/CleanSelect';
import { apiService } from '../../services/api';
import { User, Branch, PackageList, Lab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import RateListAccessModal from '../../components/RateListAccessModal';

const ManageUsers: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [packageLists, setPackageLists] = useState<PackageList[]>([]);
    const [labs, setLabs] = useState<Lab[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal State
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);

    // New User Form State
    const [username, setUsername] = useState('');
    const [alias, setAlias] = useState('');
    const [password, setPassword] = useState('');
    const [branchId, setBranchId] = useState('');
    const [role, setRole] = useState('GENERAL_EMPLOYEE');
    const [assignedLists, setAssignedLists] = useState<Set<number>>(new Set());
    const [masterDataEntry, setMasterDataEntry] = useState(false);

    // Search state
    const [searchTerm, setSearchTerm] = useState('');


    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [usersData, branchesData, listsData, labsData] = await Promise.all([
                apiService.getUsers(),
                apiService.getBranches(),
                apiService.getPackageLists(),
                apiService.getLabs()
            ]);
            setUsers(usersData);
            setBranches(branchesData);
            setPackageLists(listsData);
            setLabs(labsData);
        } catch (error) {
            console.error("Failed to fetch data for user management", error);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredUsers = React.useMemo(() => {
        const activeUsers = users.filter(u => u.username !== 'deleted_user');
        const query = searchTerm.toLowerCase().trim();
        if (!query) return activeUsers;
        return activeUsers.filter(u =>
            u.username.toLowerCase().includes(query) ||
            (u.alias || '').toLowerCase().includes(query) ||
            u.id.toString().includes(query)
        );
    }, [users, searchTerm]);


    const handleListToggle = (listId: number) => {
        setAssignedLists(prev => {
            const newSet = new Set(prev);
            if (newSet.has(listId)) newSet.delete(listId);
            else newSet.add(listId);
            return newSet;
        });
    };

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!branchId) {
            alert("Please select a branch.");
            return;
        }
        try {
            await apiService.createUser({ username, alias, password: password, branchId: parseInt(branchId), role: role as any, assigned_list_ids: Array.from(assignedLists), master_data_entry: masterDataEntry ? 1 : 0 });
            // Reset form
            setUsername(''); setAlias(''); setPassword(''); setBranchId(''); setRole('GENERAL_EMPLOYEE'); setAssignedLists(new Set()); setMasterDataEntry(false);
            fetchData();
        } catch (error) {
            alert(`Error creating user: ${error}`);
        }
    };

    const handleDeleteUser = async (userId: number) => {
        if (window.confirm('Are you sure you want to permanently delete this user? This cannot be undone.')) {
            try {
                await apiService.deleteUser(userId);
                fetchData();
            } catch (error) {
                alert(`Error deleting user: ${error}`);
            }
        }
    };

    const getBranchName = (id: number) => branches.find(b => b.id === id)?.name || 'N/A';

    const getRoleBadge = (role: string) => {
        const styles: Record<string, string> = {
            'ADMIN': 'bg-blue-50 text-blue-600 border-blue-100',
            'CLIENT': 'bg-green-50 text-green-600 border-green-100',
            'DATA_ENTRY': 'bg-indigo-50 text-indigo-600 border-indigo-100',
            'GENERAL_EMPLOYEE': 'bg-gray-50 text-gray-600 border-gray-100'
        };
        return <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${styles[role] || styles['GENERAL_EMPLOYEE']}`}>{role.replace('_', ' ')}</span>;
    };

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                <PageHeader title="User Management" showActingAs={false} />

                {/* Add User Form */}
                <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl mb-10">
                    <legend className="px-3 flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center text-white shadow-sm">
                            <i className="fa-solid fa-user-plus text-xs"></i>
                        </div>
                        <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">Create New Account</span>
                    </legend>
                    <form onSubmit={handleAddUser} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Account Username</label>
                                <div className="relative">
                                    <i className="fa-solid fa-envelope absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Email or Username" required className="w-full pl-9 p-2 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all outline-none text-sm" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Full Alias / Name</label>
                                <div className="relative">
                                    <i className="fa-solid fa-id-card absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input type="text" value={alias} onChange={e => setAlias(e.target.value)} placeholder="Friendly Name" className="w-full pl-9 p-2 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all outline-none text-sm" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Security Password</label>
                                <div className="relative">
                                    <i className="fa-solid fa-lock absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="w-full pl-9 p-2 border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:ring-2 focus:ring-blue-50 transition-all outline-none text-sm" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Assigned Branch</label>
                                <CleanSelect
                                    options={branches.map(b => ({ value: b.id.toString(), label: b.name }))}
                                    value={branchId}
                                    onChange={val => setBranchId(val as string)}
                                    placeholder="Select Branch"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">System Role</label>
                                <CleanSelect
                                    options={[
                                        { value: 'GENERAL_EMPLOYEE', label: 'General Employee' },
                                        { value: 'DATA_ENTRY', label: 'Data Entry' },
                                        { value: 'CLIENT', label: 'B2B Client' },
                                        { value: 'ADMIN', label: 'Administrator' }
                                    ]}
                                    value={role}
                                    onChange={val => setRole(val as string)}
                                />
                                {role === 'GENERAL_EMPLOYEE' && (
                                    <div className="flex items-center gap-2 mt-2 ml-1">
                                        <input
                                            type="checkbox"
                                            id="masterDataEntry"
                                            checked={masterDataEntry}
                                            onChange={(e) => setMasterDataEntry(e.target.checked)}
                                            className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                        />
                                        <label htmlFor="masterDataEntry" className="text-[10px] font-bold text-gray-500 cursor-pointer uppercase tracking-tight">Allow Master Entry (Act as Admin)</label>
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col justify-end gap-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">RateList Access Control</label>
                                <button
                                    type="button"
                                    disabled={role === 'DATA_ENTRY'}
                                    onClick={() => setIsAccessModalOpen(true)}
                                    className={`w-full h-[38px] px-4 rounded-lg border border-dashed transition-all flex items-center justify-center gap-2 font-bold text-xs ${role === 'DATA_ENTRY'
                                        ? 'border-gray-150 bg-gray-100/55 text-gray-400 cursor-not-allowed opacity-50'
                                        : assignedLists.size > 0
                                            ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 shadow-sm'
                                            : 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
                                        }`}
                                    title={role === 'DATA_ENTRY' ? "Data Entry accounts do not use Rate Lists" : "Configure list access"}
                                >
                                    <i className="fa-solid fa-key text-[10px]"></i>
                                    Configure Lists Access {role !== 'DATA_ENTRY' && assignedLists.size > 0 && <span className="bg-blue-600 text-white px-2 py-0.5 rounded-full text-[9px] ml-1">{assignedLists.size}</span>}
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <button type="submit" className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all shadow-sm flex items-center gap-2 text-sm">
                                <i className="fa-solid fa-plus-circle"></i> Create User Account
                            </button>
                        </div>
                    </form>
                </fieldset>


                {/* User Directory */}
                <div className="relative flex flex-col">
                    <div className="md:absolute static top-0 right-6 md:-translate-y-[5px] mb-4 md:mb-0 flex justify-end order-1 md:order-none">
                        <div className="search-container w-full md:w-64 bg-white shadow-sm md:shadow-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-700 text-xs mr-2"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search directory..."
                                className="search-input"
                            />
                        </div>
                    </div>

                    <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl order-2 min-w-0">
                        <legend className="px-3 flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                <i className="fa-solid fa-users text-xs"></i>
                            </div>
                            <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">User Directory</span>
                        </legend>

                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full min-w-[800px] bg-white divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Identify</th>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Profile</th>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Branch</th>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Privileges</th>
                                        <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {isLoading ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-sm text-gray-400 italic">Authenticating and retrieving directory...</td></tr>
                                    ) : filteredUsers.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-sm text-gray-400 italic">No users matching "{searchTerm}" found.</td></tr>
                                    ) : (
                                        filteredUsers.map(user => (
                                            <tr key={user.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="py-3 px-4">
                                                    <div className="text-sm font-bold text-gray-800">{user.username}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono">UID: #{user.id.toString().padStart(4, '0')}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="text-sm text-gray-600">{user.alias || '---'}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2 text-xs text-gray-500 italic">
                                                        <i className="fa-solid fa-location-dot text-[9px] text-gray-300"></i>
                                                        {getBranchName(user.branchId)}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    {getRoleBadge(user.role)}
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <div className="flex justify-end gap-1.5">
                                                        <Link to={`/admin/users/edit/${user.id}`} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-blue-600 hover:text-white rounded border border-gray-100 transition-all shadow-sm" title="Edit Profile">
                                                            <i className="fa-solid fa-pen-to-square text-xs"></i>
                                                        </Link>
                                                        {currentUser?.id !== user.id && (
                                                            <button onClick={() => handleDeleteUser(user.id)} className="w-8 h-8 flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-red-600 hover:text-white rounded border border-gray-100 transition-all shadow-sm" title="Revoke Access">
                                                                <i className="fa-solid fa-user-xmark text-xs"></i>
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </fieldset>
                </div>
            </div>

            <RateListAccessModal
                isOpen={isAccessModalOpen}
                onClose={() => setIsAccessModalOpen(false)}
                labs={labs}
                packageLists={packageLists}
                selectedListIds={assignedLists}
                onToggle={handleListToggle}
                isUserCreation={true}
                userRole={role}
                clientUsername={username}
            />
        </div>
    );
};

export default ManageUsers;