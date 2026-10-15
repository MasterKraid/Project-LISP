import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { apiService } from '../../services/api';
import { Document } from '../../types';
import ChoiceModal from '../../components/ChoiceModal';

interface ViewDocumentsProps {
    docType: 'receipt' | 'estimate';
}

const ViewDocuments: React.FC<ViewDocumentsProps> = ({ docType }) => {
    const title = docType === 'receipt' ? 'Receipt Ledger' : 'Estimate Ledger';
    const legendText = docType === 'receipt' ? 'All Generated Receipts' : 'All Generated Estimates';
    const [documents, setDocuments] = useState<Document[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Choice Modal State
    const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
    const [pendingDocId, setPendingDocId] = useState<number | null>(null);

    useEffect(() => {
        setIsLoading(true);
        const fetcher = docType === 'receipt' ? apiService.getReceipts : apiService.getEstimates;
        fetcher()
            .then(data => {
                setDocuments(data);
                setIsLoading(false);
            })
            .catch(err => {
                console.error(`Failed to fetch ${docType}s`, err);
                setIsLoading(false);
            });
    }, [docType]);

    const filteredDocuments = useMemo(() => {
        const query = searchTerm.toLowerCase().trim();
        if (!query) return documents;
        return documents.filter(doc =>
            doc.display_doc_id.toLowerCase().includes(query) ||
            doc.customer_name.toLowerCase().includes(query) ||
            doc.display_customer_id.toLowerCase().includes(query) ||
            doc.created_by_user.toLowerCase().includes(query)
        );
    }, [documents, searchTerm]);

    const handleAction = async (revert: boolean) => {
        if (!pendingDocId) return;
        try {
            if (docType === 'receipt') {
                if (revert) await apiService.revertReceipt(pendingDocId);
                else await apiService.deleteReceipt(pendingDocId);
            }

            // Refresh correct docType
            const fetcher = docType === 'receipt' ? apiService.getReceipts : apiService.getEstimates;
            const data = await fetcher();
            setDocuments(data);
        } catch (err) {
            alert(`Action failed: ${err}`);
        }
    };

    return (
        <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-gray-200">
                <PageHeader title={title} showActingAs={false} />

                <div className="relative flex flex-col">
                    <div className="md:absolute static top-0 right-6 md:-translate-y-[5px] mb-4 md:mb-0 flex justify-end order-1 md:order-none">
                        <div className="search-container w-full md:w-80 bg-white shadow-sm md:shadow-none">
                            <i className="fa-solid fa-magnifying-glass text-gray-700 text-xs mr-2"></i>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder={`Search ${docType}s...`}
                                className="search-input"
                            />
                        </div>
                    </div>

                    <fieldset className="border-2 border-gray-300 p-4 md:p-6 rounded-xl order-2 min-w-0">
                        <legend className="px-3 flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-gray-800 flex items-center justify-center text-white shadow-sm">
                                <i className={`fa-solid ${docType === 'receipt' ? 'fa-file-invoice-dollar' : 'fa-file-invoice'} text-xs`} ></i>
                            </div>
                            <span className="text-base md:text-lg font-bold text-gray-800 uppercase tracking-tight md:tracking-normal">{legendText}</span>
                        </legend>

                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full min-w-[800px] bg-white divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Document Details</th>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Customer Info</th>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Financials</th>
                                        <th className="py-3 px-4 text-left text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Origin</th>
                                        <th className="py-3 px-4 text-right text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-300">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 text-sm">
                                    {isLoading ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-gray-400 italic text-sm">Synchronizing ledger records...</td></tr>
                                    ) : filteredDocuments.length === 0 ? (
                                        <tr><td colSpan={5} className="text-center py-12 text-gray-400 italic text-sm">No {docType}s matching your search found.</td></tr>
                                    ) : (
                                        filteredDocuments.map(doc => (
                                            <tr key={doc.id} className="hover:bg-gray-50/50 transition-colors group">
                                                <td className="py-3 px-4">
                                                    <div 
                                                        className="text-sm font-bold text-gray-800 cursor-help"
                                                        title={docType === 'receipt' ? (doc.client_name ? `${doc.display_doc_id} - ${doc.client_name}` : (doc.created_by_user ? `${doc.display_doc_id} - ${doc.created_by_user.split('[')[0].trim()}` : doc.display_doc_id)) : doc.display_doc_id}
                                                    >
                                                        {doc.display_doc_id}
                                                        {docType === 'receipt' && (
                                                            <span className="ml-2 text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                                                {doc.lab_name || 'N/A'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-[10px] text-gray-400 font-mono italic">{doc.display_date}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="text-sm font-semibold text-gray-700">{doc.customer_name}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono italic">{doc.display_customer_id}</div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-green-50 text-green-700 border border-green-100">
                                                        {doc.display_amount}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex flex-col text-xs text-gray-500">
                                                        <div className="flex items-center gap-1.5">
                                                            <i className="fa-solid fa-user-pen text-[10px] text-gray-300"></i>
                                                            <span className="font-semibold">{doc.created_by_user.includes('[') ? doc.created_by_user.split('[')[0].trim() : doc.created_by_user}</span>
                                                        </div>
                                                        {doc.created_by_user.includes('[') && (
                                                            <span className="text-[10px] text-gray-400 font-medium italic mt-0.5 ml-3.5">
                                                                [{doc.created_by_user.split('[')[1]}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 text-right flex justify-end gap-2">
                                                    <Link to={`/${docType}/${doc.id}`} className="w-8 h-8 inline-flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-blue-600 hover:text-white rounded border border-gray-100 transition-all shadow-sm" title="View Document">
                                                        <i className="fa-solid fa-eye text-xs"></i>
                                                    </Link>
                                                    {docType === 'receipt' && (
                                                        <>
                                                            <Link to={`/admin/receipts/edit/${doc.id}`} className="w-8 h-8 inline-flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-yellow-500 hover:text-white rounded border border-gray-100 transition-all shadow-sm" title="Edit Receipt">
                                                                <i className="fa-solid fa-pen text-xs"></i>
                                                            </Link>
                                                            <button
                                                                onClick={() => {
                                                                    setPendingDocId(doc.id);
                                                                    setIsChoiceModalOpen(true);
                                                                }}
                                                                className="w-8 h-8 inline-flex items-center justify-center bg-red-50 text-red-500 hover:bg-red-600 hover:text-white rounded border border-red-100 transition-all shadow-sm"
                                                                title="Delete / Revert Receipt"
                                                            >
                                                                <i className="fa-solid fa-trash-can text-xs"></i>
                                                            </button>
                                                        </>
                                                    )}
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

            <ChoiceModal
                isOpen={isChoiceModalOpen}
                onClose={() => setIsChoiceModalOpen(false)}
                title="Manage Receipt"
                message="Select an action for this receipt. Revert will nuclear the associated wallet transaction, while Delete will only remove this record from the ledger."
                onRevert={() => handleAction(true)}
                onDelete={() => handleAction(false)}
            />
        </div>
    );
};

export default ViewDocuments;
