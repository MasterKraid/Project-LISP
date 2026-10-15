import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Transaction } from '../types';

const TransactionHistoryPage: React.FC = () => {
    const { user } = useAuth();
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [onlyDue, setOnlyDue] = useState(false);
    const [onlyPositive, setOnlyPositive] = useState(false);

    useEffect(() => {
        if (user) {
            // Fixed: Removed user.id argument
            apiService.getTransactionsForUser()
                .then(setTransactions)
                .catch(err => console.error("Failed to fetch transactions", err))
                .finally(() => setIsLoading(false));
        }
    }, [user]);

    const groupedTransactions = useMemo(() => {
        const groups: { [key: string]: Transaction[] } = {};
        const filtered = transactions.filter(tx => {
            if (onlyDue && tx.amount_deducted <= 0) return false;
            if (onlyPositive && tx.amount_deducted >= 0) return false;
            return true;
        });

        filtered.forEach(tx => {
            const date = tx.date.split(' | ')[0]; // Group by DD/MM/YYYY
            if (!groups[date]) {
                groups[date] = [];
            }
            groups[date].push(tx);
        });
        return groups;
    }, [transactions, onlyDue, onlyPositive]);

    const getTransactionTitle = (tx: Transaction) => {
        switch (tx.type) {
            case 'RECEIPT_DEDUCTION':
                return `Paid for Receipt #${tx.receipt_id} for ${tx.customer_name || 'customer'}`;
            case 'ADMIN_CREDIT': return 'Amount Added by Admin';
            case 'ADMIN_DEBIT': return 'Amount Deducted by Admin';
            case 'SETTLEMENT': return 'Wallet Settled by Admin';
            default: return 'Transaction';
        }
    }

    const parseAndFormatDate = (dateStr: string) => {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            // parts are [DD, MM, YYYY]
            const date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
            return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
        }
        return dateStr;
    };


    return (
        <div className="p-4 sm:p-8 max-w-4xl mx-auto">
            <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg">
                <PageHeader title="Transaction History" showActingAs={false} />

                {user && (
                    <div className="bg-blue-50 p-4 rounded-lg mb-6 text-center border border-blue-200">
                        <p className="text-sm font-medium text-blue-700">Current Wallet Balance</p>
                        <p className={`text-3xl font-bold ${user.wallet_balance < 0 ? 'text-red-600' : 'text-blue-900'}`}>
                            ₹{user?.wallet_balance.toFixed(2)}
                        </p>
                    </div>
                )}

                <div className="bg-slate-50 border border-slate-200 p-3.5 sm:p-4 rounded-xl mb-6 flex flex-wrap items-center gap-6">
                    <label htmlFor="txOnlyDueCheckbox" className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            id="txOnlyDueCheckbox"
                            checked={onlyDue}
                            onChange={e => {
                                setOnlyDue(e.target.checked);
                                if (e.target.checked) setOnlyPositive(false);
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">Show Only Due</span>
                    </label>

                    <label htmlFor="txOnlyPositiveCheckbox" className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            id="txOnlyPositiveCheckbox"
                            checked={onlyPositive}
                            onChange={e => {
                                setOnlyPositive(e.target.checked);
                                if (e.target.checked) setOnlyDue(false);
                            }}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">Show Positive</span>
                    </label>
                </div>

                {isLoading ? (
                    <p>Loading history...</p>
                ) : Object.keys(groupedTransactions).length === 0 ? (
                    <p className="text-center text-gray-500 py-8">No transactions found.</p>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(groupedTransactions).map(([date, txs]) => (
                            <div key={date}>
                                <h3 className="font-semibold text-gray-500 bg-gray-100 px-3 py-1 rounded-full inline-block text-sm mb-3">
                                    {parseAndFormatDate(date)}
                                </h3>
                                <ul className="space-y-3">
                                    {txs.map(tx => (
                                        <li key={tx.id} className="border rounded-lg p-3 space-y-2">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="font-semibold text-gray-800">{getTransactionTitle(tx)}</p>
                                                    <p className="text-xs text-gray-500">{tx.date.split(' | ')[1]}</p>
                                                    {tx.notes && <p className="text-xs italic text-gray-500 mt-1">Note: {tx.notes}</p>}
                                                </div>
                                                <div className="text-right">
                                                    <p className={`font-bold text-lg ${tx.amount_deducted >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                        {tx.amount_deducted >= 0 ? `- ₹${tx.amount_deducted.toFixed(2)}` : `+ ₹${(-tx.amount_deducted).toFixed(2)}`}
                                                    </p>
                                                    {tx.type === 'RECEIPT_DEDUCTION' && typeof tx.total_profit !== 'undefined' && (
                                                        <p className="text-xs font-semibold text-green-600">MRP: ₹{(tx.amount_deducted + tx.total_profit).toFixed(2)}</p>
                                                    )}
                                                    {tx.balance_snapshot !== undefined && tx.balance_snapshot !== null && (
                                                        <p className="text-xs font-semibold text-gray-500 mt-1">Balance: ₹{Number(tx.balance_snapshot).toFixed(2)}</p>
                                                    )}
                                                </div>
                                            </div>
                                            {tx.items && tx.items.length > 0 && (
                                                <details className="text-sm mt-2">
                                                    <summary className="cursor-pointer text-blue-600 font-medium">View Breakdown</summary>
                                                    <div className="mt-2 overflow-x-auto">
                                                        <table className="min-w-full text-xs">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="p-2 text-left font-medium text-gray-600">Test / Package</th>
                                                                    <th className="p-2 text-right font-medium text-gray-600">MRP</th>
                                                                    <th className="p-2 text-right font-medium text-gray-600">B2B</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-200">
                                                                {tx.items && Array.isArray(tx.items) && tx.items.map((item, index) => {
                                                                    return (
                                                                        <tr key={index}>
                                                                            <td className="p-2">{item.name}</td>
                                                                            <td className="p-2 text-right font-mono">₹{item.mrp.toFixed(2)}</td>
                                                                            <td className="p-2 text-right font-mono">₹{item.b2b_price.toFixed(2)}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </details>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default TransactionHistoryPage;