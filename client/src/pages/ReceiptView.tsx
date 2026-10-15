import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/api';
import { Receipt, Customer, DocumentItem, Branch as BranchType } from '../types';
import ChoiceModal from '../components/ChoiceModal';

declare const html2canvas: any;
declare const jspdf: any;

interface ReceiptPageData {
    receipt: Receipt;
    customer: Customer;
    items: DocumentItem[];
    branch: BranchType;
}

const ReceiptView: React.FC = () => {
    const { id } = useParams() as { id: string };
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [data, setData] = useState<ReceiptPageData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Choice Modal State
    const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);

    useEffect(() => {
        if (!id) return;
        const fetchReceiptData = async () => {
            try {
                const receiptId = parseInt(id, 10);
                if (isNaN(receiptId)) {
                    setError("Invalid Receipt ID.");
                    return;
                }
                const result = await apiService.getReceiptById(receiptId);
                if (!result) {
                    setError("Receipt not found.");
                } else {
                    setData(result);
                }
            } catch (err) {
                setError("Failed to fetch receipt data.");
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchReceiptData();
    }, [id]);

    const formattedData = useMemo(() => {
        if (!data) return null;

        const { receipt, items } = data;

        let calculatedTotalMrp = 0;
        let calculatedSubtotalAfterItemDiscounts = 0;

        const formattedItems = items.map(item => {
            const itemMrp = Number(item.mrp) || 0;
            const itemDiscPerc = Number(item.discount_percentage) || 0;
            const priceAfterItemDiscount = itemMrp * (1 - itemDiscPerc / 100);

            calculatedTotalMrp += itemMrp;
            calculatedSubtotalAfterItemDiscounts += priceAfterItemDiscount;

            return {
                ...item,
                mrpFormatted: itemMrp.toFixed(2),
                discountPercentageFormatted: itemDiscPerc.toFixed(1),
            };
        });

        const dateParts = receipt.created_at.split(' | ');
        const totalMrp = receipt.total_mrp || calculatedTotalMrp;
        const finalAmount = Number(receipt.amount_final) || 0;
        const totalDiscount = totalMrp - finalAmount;

        return {
            ...data,
            items: formattedItems,
            displayReceiptDate: `${dateParts[0]} ${dateParts[1]}`,
            totalMrpFormatted: totalMrp.toFixed(2),
            totalDiscountFormatted: totalDiscount.toFixed(2),
            finalAmountFormatted: finalAmount.toFixed(2),
            amountReceivedFormatted: (Number(receipt.amount_received) || 0).toFixed(2),
            amountDueFormatted: (Number(receipt.amount_due) || 0).toFixed(2),
        };
    }, [data]);

    const getDashboardLink = () => user?.role === 'ADMIN' ? '/admin-dashboard' : '/dashboard';

    const generatePdf = async (): Promise<any> => {
        if (typeof html2canvas === 'undefined' || typeof jspdf === 'undefined' || typeof jspdf.jsPDF === 'undefined') {
            alert('The PDF generator is still loading. Please wait a moment and try again.');
            return null;
        }

        const element = document.getElementById('print-container');
        if (!element) {
            console.error("Element to capture not found!");
            return null;
        }

        const originalWidth = element.style.width;
        const originalMaxWidth = element.style.maxWidth;

        // Force desktop width for beautiful scaling
        element.style.width = '800px';
        element.style.maxWidth = '800px';

        try {
            const canvas = await html2canvas(element, { 
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false
            });

            element.style.width = originalWidth;
            element.style.maxWidth = originalMaxWidth;

            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = jspdf;
            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const usableWidth = pdfWidth - margin * 2;
            const usableHeight = pdfHeight - margin * 2;

            const scaledHeight = usableWidth * (canvas.height / canvas.width);

            let finalScale = 1;
            if (scaledHeight > usableHeight && scaledHeight < usableHeight * 1.15) {
                finalScale = usableHeight / scaledHeight;
            }

            const finalWidth = usableWidth * finalScale;
            const finalHeight = scaledHeight * finalScale;

            if (finalHeight <= usableHeight) {
                pdf.addImage(imgData, 'PNG', margin, margin, finalWidth, finalHeight);
            } else {
                let heightLeft = finalHeight;
                let position = 0;
                let page = 1;
                
                while (heightLeft > 0) {
                    if (page > 1) pdf.addPage();
                    pdf.addImage(imgData, 'PNG', margin, margin - position, finalWidth, finalHeight);
                    heightLeft -= usableHeight;
                    position += usableHeight;
                    page++;
                }
            }

            return pdf;
        } catch (err) {
            console.error("PDF generation failed:", err);
            element.style.width = originalWidth;
            element.style.maxWidth = originalMaxWidth;
            return null;
        }
    };

    const handleSharePdf = async () => {
        if (!data || !formattedData) return;
        const pdf = await generatePdf();
        if (!pdf) return;

        const fileName = `Receipt-RCPT-${String(data.receipt.id).padStart(6, '0')}.pdf`;

        try {
            const pdfBlob = pdf.output('blob');
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Receipt RCPT-${String(data.receipt.id).padStart(6, '0')}`,
                    text: `Money Receipt for ${data.customer.prefix || ''} ${data.customer.name} (Amount: ₹${formattedData.finalAmountFormatted})`,
                });
            } else {
                alert("PDF file sharing is not supported by your browser.");
            }
        } catch (err: any) {
            if (err && err.name === 'AbortError') {
                console.log("Sharing was dismissed by the user.");
            } else {
                console.warn("Share failed", err);
                alert("An error occurred while sharing the document.");
            }
        }
    };

    const handleDownloadPdf = async () => {
        if (!data) return;
        const pdf = await generatePdf();
        if (!pdf) return;
        const fileName = `Receipt-RCPT-${String(data.receipt.id).padStart(6, '0')}.pdf`;
        pdf.save(fileName);
    };

    if (isLoading) return <div className="text-center p-10">Loading Receipt...</div>;
    if (error) return <div className="text-center p-10 text-red-500">{error}</div>;
    if (!formattedData) return <div className="text-center p-10">Receipt data could not be loaded.</div>;

    const { receipt, customer, items, branch } = formattedData;

    return (
        <>
            <style>{`
            @media print {
                body { background: white !important; }
                .no-print { display: none !important; }
                .print-container { 
                    box-shadow: none !important; 
                    margin: 0 !important; 
                    padding: 10mm !important; 
                    width: 100% !important;
                    max-width: 100% !important;
                }
            }
            .print-container {
                width: 100%;
                max-width: 800px;
                margin: 20px auto;
                padding: 20px;
                background: white;
                box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
                border-radius: 16px;
                border: 1px border-gray-150;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                font-size: 10pt;
            }
            @media (min-width: 768px) {
                .print-container {
                    padding: 15mm;
                }
            }
        `}</style>
            <div id="print-container" className="print-container">
                {/* Header */}
                <header className="text-center mb-4 pb-2 border-b">
                    <img src="/company-logo.png" alt="Company Logo" className="mx-auto h-16 mb-2" />
                    <p className="text-xs text-gray-600 font-medium">Dedicated To Care, Committed To Service</p>
                    {/* <div className="text-2xl font-bold text-gray-800">TREAT & CURE</div> */}
                    <div className="text-xl font-bold uppercase tracking-wider mt-2 text-slate-800">Money Receipt</div>
                </header>

                {/* Meta Info */}
                <div className="flex flex-row justify-between items-start gap-2 mb-4 pb-3 border-b text-sm text-slate-600">
                    <div>
                        <h3 className="font-bold text-base text-slate-800">{branch.name}</h3>
                        <p className="text-xs">Ph: {branch.phone}</p>
                        <p className="text-xs whitespace-pre-line">{branch.address}</p>
                    </div>
                    <div className="text-right text-xs">
                        <p><strong>DATE & TIME:</strong> {formattedData.displayReceiptDate}</p>
                        <p className="mt-1">
                            <strong>Receipt ID:</strong>{' '}
                            <span 
                                className="cursor-help transition-colors hover:text-indigo-600 font-semibold" 
                                title={receipt.client_name ? `RCPT-${String(receipt.id).padStart(6, '0')} - ${receipt.client_name}` : (receipt.acting_as_client?.alias || receipt.acting_as_client?.username ? `RCPT-${String(receipt.id).padStart(6, '0')} - ${receipt.acting_as_client?.alias || receipt.acting_as_client?.username}` : `RCPT-${String(receipt.id).padStart(6, '0')}`)}
                            >
                                RCPT-{String(receipt.id).padStart(6, '0')}
                            </span>
                        </p>
                    </div>
                </div>

                {/* Customer Details */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 pb-3 border-b text-sm text-slate-600">
                    <div><span className="font-bold text-slate-400 text-xs block uppercase">Customer ID</span> CUST-{String(customer.id).padStart(10, '0')}</div>
                    <div><span className="font-bold text-slate-400 text-xs block uppercase">Mobile No</span> {customer.mobile || 'N/A'}</div>
                    <div><span className="font-bold text-slate-400 text-xs block uppercase">Patient Name</span> <span className="font-bold text-slate-800">{customer.prefix || ''} {customer.name}</span></div>
                    <div><span className="font-bold text-slate-400 text-xs block uppercase">Age / DOB</span> {customer.dob ? new Date(customer.dob).toLocaleDateString('en-GB') : (customer.age ? `${customer.age} yrs` : 'N/A')}</div>
                    <div><span className="font-bold text-slate-400 text-xs block uppercase">Gender</span> {customer.gender || 'N/A'}</div>
                    <div><span className="font-bold text-slate-400 text-xs block uppercase">Referred By Dr.</span> {receipt.referred_by || 'Self'}</div>
                </div>

                {/* Items Table */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200 mb-0 text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="border border-gray-200 p-2 text-left w-3/5 text-slate-600 font-bold uppercase text-[10px] tracking-wider">TEST / PACKAGE NAME</th>
                                <th className="border border-gray-200 p-2 text-right text-slate-600 font-bold uppercase text-[10px] tracking-wider">ITEM DISC %</th>
                                <th className="border border-gray-200 p-2 text-right text-slate-600 font-bold uppercase text-[10px] tracking-wider">MRP (₹)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, i) => (
                                <tr key={i} className="hover:bg-slate-50/50">
                                    <td className="border border-gray-200 p-2 text-slate-700 font-medium">{item.package_name}</td>
                                    <td className="border border-gray-200 p-2 text-right text-slate-500">{item.discountPercentageFormatted}%</td>
                                    <td className="border border-gray-200 p-2 text-right text-slate-800 font-medium">{item.mrpFormatted}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Totals Table */}
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-200 -mt-px text-sm">
                        <tbody>
                            <tr className="table-row">
                                <td className="border border-gray-200 p-3 w-2/5 align-top text-slate-600 space-y-1">
                                    <div><strong>NO OF TESTS:</strong> {receipt.num_tests || items.length}</div>
                                    <div><strong>PAYMENT:</strong> <span className="font-bold text-blue-600">{receipt.payment_method || 'N/A'}</span></div>
                                </td>
                                <td className="border border-gray-200 p-3 w-1/5 text-center align-middle">
                                    {receipt.logo_path && <img src={receipt.logo_path} alt="Lab Logo" className="max-h-12 max-w-24 inline-block" />}
                                </td>
                                <td className="border border-gray-200 p-3 bg-slate-50/50 align-top text-right text-slate-500 space-y-1">
                                    <div>TOTAL MRP</div>
                                    <div>TOTAL DISCOUNT</div>
                                    <div><strong className="text-slate-800">NET PAYABLE</strong></div>
                                    <div>RECEIVED</div>
                                    <div><strong className="text-slate-800">DUE</strong></div>
                                </td>
                                <td className="border border-gray-200 p-3 bg-slate-50/50 align-top text-right font-mono text-slate-700 space-y-1">
                                    <div>₹{formattedData.totalMrpFormatted}</div>
                                    <div>₹{formattedData.totalDiscountFormatted}</div>
                                    <div><strong className="text-slate-900">₹{formattedData.finalAmountFormatted}</strong></div>
                                    <div>₹{formattedData.amountReceivedFormatted}</div>
                                    <div><strong className="text-blue-700">₹{formattedData.amountDueFormatted}</strong></div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <footer className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-6 pt-3 border-t text-xs gap-4 text-slate-500">
                    <div className="w-full sm:w-3/5">
                        <strong>Notes:</strong> {receipt.notes || 'This is the Finalized Receipt. Keep it for your records.'}
                    </div>
                    <div className="pt-4 border-t border-dotted border-gray-400 min-w-[150px] text-center uppercase tracking-wider font-bold text-slate-400">SIGNATURE / STAMP</div>
                </footer>
            </div>

            {/* Action Buttons */}
            <div className="action-buttons text-center my-6 no-print flex flex-wrap justify-center gap-3 px-4">
                <button onClick={() => window.print()} className="px-5 py-3 cursor-pointer text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all flex items-center gap-2 shadow-sm font-bold text-xs uppercase tracking-wider">
                    <i className="fa-solid fa-print"></i> Print
                </button>
                
                <button 
                    onClick={handleSharePdf}
                    className="px-5 py-3 cursor-pointer text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-all flex items-center gap-2 shadow-sm font-bold text-xs uppercase tracking-wider"
                >
                    <i className="fa-solid fa-share-nodes"></i> Share Receipt
                </button>

                <button 
                    onClick={handleDownloadPdf}
                    className="px-5 py-3 cursor-pointer text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-sm font-bold text-xs uppercase tracking-wider"
                >
                    <i className="fa-solid fa-download"></i> Download PDF
                </button>

                {user?.role === 'ADMIN' && (
                    <button
                        onClick={() => setIsChoiceModalOpen(true)}
                        className="px-5 py-3 cursor-pointer text-white bg-rose-600 rounded-xl hover:bg-rose-700 transition-all flex items-center gap-2 shadow-sm font-bold text-xs uppercase tracking-wider"
                    >
                        <i className="fa-solid fa-trash-can"></i> Delete / Revert
                    </button>
                )}

                <Link to="/receipt-form" className="px-5 py-3 cursor-pointer text-white bg-slate-800 rounded-xl hover:bg-slate-900 transition-all flex items-center gap-2 shadow-sm font-bold text-xs uppercase tracking-wider">
                    <i className="fa-solid fa-plus"></i> New Form
                </Link>
                <Link to={getDashboardLink()} className="px-5 py-3 cursor-pointer text-white bg-slate-900 rounded-xl hover:bg-black transition-all flex items-center gap-2 font-bold text-xs uppercase tracking-wider shadow-md">
                    <i className="fa-solid fa-house"></i> Dashboard
                </Link>
            </div>

            <ChoiceModal
                isOpen={isChoiceModalOpen}
                onClose={() => setIsChoiceModalOpen(false)}
                title="Manage Receipt"
                message="Select an action for this receipt. Revert will nuclear the associated wallet transaction, while Delete will only remove this record from the ledger."
                onRevert={async () => {
                    try {
                        await apiService.revertReceipt(receipt.id);
                        await refreshUser();
                        navigate('/admin/documents?type=receipt');
                    } catch (err) { alert(`Action failed: ${err}`); }
                }}
                onDelete={async () => {
                    try {
                        await apiService.deleteReceipt(receipt.id);
                        await refreshUser();
                        navigate('/admin/documents?type=receipt');
                    } catch (err) { alert(`Action failed: ${err}`); }
                }}
            />
        </>
    );
};

export default ReceiptView;