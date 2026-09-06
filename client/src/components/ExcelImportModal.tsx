import React, { useState, useRef } from 'react';

declare const ExcelJS: any;

export interface ExcelImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    targetName?: string;
    formatType: 'RATELIST' | 'MASTER_RATELIST';
    onImport: (parsedData: any[], mode: 'OVERWRITE' | 'APPEND') => Promise<void>;
}

const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
    isOpen,
    onClose,
    title,
    targetName,
    formatType,
    onImport
}) => {
    const [mode, setMode] = useState<'OVERWRITE' | 'APPEND'>('OVERWRITE');
    const [file, setFile] = useState<File | null>(null);
    const [parsedRows, setParsedRows] = useState<any[]>([]);
    const [errorIssue, setErrorIssue] = useState<string | null>(null);
    const [successSummary, setSuccessSummary] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const resetState = () => {
        setFile(null);
        setParsedRows([]);
        setErrorIssue(null);
        setSuccessSummary(null);
        setIsProcessing(false);
        setIsSubmitting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const validateAndParse = async (selectedFile: File) => {
        setFile(selectedFile);
        setErrorIssue(null);
        setSuccessSummary(null);
        setIsProcessing(true);

        try {
            if (!selectedFile.name.match(/\.(xlsx|xls)$/i)) {
                throw new Error("Invalid file extension. Please select an Excel workbook (.xlsx or .xls).");
            }

            const buffer = await selectedFile.arrayBuffer();
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.load(buffer);

            const worksheet = workbook.worksheets[0];
            if (!worksheet) {
                throw new Error("No worksheets found in the Excel file.");
            }

            const headerRow = worksheet.getRow(1);
            const rawHeaders = (headerRow.values as any[]) || [];
            // ExcelJS 1-indexed values array usually has undefined at [0]
            const headers = rawHeaders.slice(1).map((h: any) => (h ? String(h).trim().toLowerCase() : ''));

            if (headers.length === 0 || headers.every(h => !h)) {
                throw new Error("Header row (Row 1) is empty. Please provide columns with headers.");
            }

            if (formatType === 'RATELIST') {
                const required = ['code_name', 'name', 'mrp', 'b2b_price'];
                const missing = required.filter(r => !headers.includes(r));
                if (missing.length > 0) {
                    throw new Error(`Invalid format for Ratelist. Missing required header(s): ${missing.join(', ')}. Found: [${headers.filter(Boolean).join(', ')}].`);
                }

                const rows: any[] = [];
                worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
                    if (rowNumber > 1) {
                        const rowData: any = {};
                        row.values.forEach((value: any, index: number) => {
                            if (index > 0 && headers[index - 1]) {
                                rowData[headers[index - 1]] = value;
                            }
                        });
                        if (rowData.name && String(rowData.name).trim()) {
                            rows.push({
                                code_name: rowData.code_name ? String(rowData.code_name).trim().toUpperCase() : '',
                                name: String(rowData.name).trim().toUpperCase(),
                                mrp: parseFloat(rowData.mrp) || 0,
                                b2b_price: parseFloat(rowData.b2b_price) || 0
                            });
                        }
                    }
                });

                if (rows.length === 0) {
                    throw new Error("No valid data rows found in spreadsheet. Ensure at least one test has a name and price.");
                }

                setParsedRows(rows);
                setSuccessSummary(`Valid file! Ready to import ${rows.length} test records.`);
            } else if (formatType === 'MASTER_RATELIST') {
                // Must have test_name or name
                const testNameIndex = headers.findIndex(h => h === 'test_name' || h === 'name');
                if (testNameIndex === -1) {
                    throw new Error(`Invalid format for Master Ratelist. Column 1 must be 'test_name'. Found: [${headers.filter(Boolean).join(', ')}].`);
                }

                const items: Array<{ test_name: string; aliases: string[] }> = [];
                worksheet.eachRow({ includeEmpty: false }, (row: any, rowNumber: number) => {
                    if (rowNumber > 1) {
                        const values = (row.values as any[]).slice(1);
                        const testName = values[testNameIndex] ? String(values[testNameIndex]).trim().toUpperCase() : '';
                        if (testName) {
                            const aliases: string[] = [];
                            values.forEach((val: any, idx: number) => {
                                if (idx !== testNameIndex && val) {
                                    const aliasStr = String(val).trim().toUpperCase();
                                    if (aliasStr && aliasStr !== testName && !aliases.includes(aliasStr)) {
                                        aliases.push(aliasStr);
                                    }
                                }
                            });
                            items.push({ test_name: testName, aliases });
                        }
                    }
                });

                if (items.length === 0) {
                    throw new Error("No valid master test rows found in spreadsheet. Check row values.");
                }

                setParsedRows(items);
                const totalAliases = items.reduce((sum, item) => sum + item.aliases.length, 0);
                setSuccessSummary(`Valid file! Found ${items.length} master tests with ${totalAliases} linked aliases.`);
            }
        } catch (err: any) {
            setErrorIssue(err.message || String(err));
            setParsedRows([]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndParse(e.dataTransfer.files[0]);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            validateAndParse(e.target.files[0]);
        }
    };

    const handleConfirm = async () => {
        if (!parsedRows || parsedRows.length === 0) return;

        if (mode === 'OVERWRITE') {
            const confirmed = window.confirm(
                `WARNING: You selected 'Overwrite Existing'. This will clear existing items in this list and replace them with the ${parsedRows.length} uploaded records. Proceed?`
            );
            if (!confirmed) return;
        }

        try {
            setIsSubmitting(true);
            await onImport(parsedRows, mode);
            handleClose();
        } catch (err: any) {
            setErrorIssue(`Import failed: ${err.message || err}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200 overflow-hidden flex flex-col max-h-[92vh]">
                {/* Header */}
                <div className="p-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-base flex items-center gap-2">
                            <i className="fa-solid fa-file-excel text-emerald-400"></i>
                            {title}
                        </h3>
                        {targetName && (
                            <p className="text-xs text-slate-300 mt-0.5">
                                Target: <span className="font-semibold text-white">{targetName}</span>
                            </p>
                        )}
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-slate-400 hover:text-white transition-colors p-1 text-lg"
                    >
                        <i className="fa-solid fa-xmark"></i>
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto space-y-4">
                    {/* Middle: Drag & Drop Zone */}
                    <div
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                        onDragLeave={() => setIsDragging(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                            isDragging
                                ? 'border-blue-500 bg-blue-50/50 scale-[0.99]'
                                : file
                                    ? errorIssue
                                        ? 'border-red-300 bg-red-50/30'
                                        : 'border-emerald-400 bg-emerald-50/30'
                                    : 'border-gray-300 hover:border-blue-400 bg-gray-50/50 hover:bg-white'
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx, .xls"
                            onChange={handleFileSelect}
                            className="hidden"
                        />
                        <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-emerald-600 text-2xl">
                            {isProcessing ? (
                                <i className="fa-solid fa-spinner fa-spin text-blue-500"></i>
                            ) : file ? (
                                <i className={`fa-solid ${errorIssue ? 'fa-triangle-exclamation text-red-500' : 'fa-circle-check text-emerald-500'}`}></i>
                            ) : (
                                <i className="fa-solid fa-cloud-arrow-up text-gray-400"></i>
                            )}
                        </div>

                        {file ? (
                            <div>
                                <div className="font-bold text-sm text-gray-800 truncate max-w-xs mx-auto">
                                    {file.name}
                                </div>
                                <div className="text-xs text-gray-400 mt-0.5">
                                    {(file.size / 1024).toFixed(1)} KB • Click or drop another file to replace
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="font-bold text-sm text-gray-700">
                                    Drag & drop Excel file here, or <span className="text-blue-600 underline">browse</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                    Supports Microsoft Excel (.xlsx, .xls)
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Validation Issue Box (Below drop zone) */}
                    {errorIssue && (
                        <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-lg text-xs text-red-800 space-y-1 animate-in fade-in duration-100">
                            <div className="font-bold flex items-center gap-1.5 text-red-900">
                                <i className="fa-solid fa-circle-xmark text-red-600"></i>
                                Format Error Detected
                            </div>
                            <p className="leading-relaxed">{errorIssue}</p>
                        </div>
                    )}

                    {/* Success Notice Box */}
                    {successSummary && !errorIssue && (
                        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded-r-lg text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in duration-100">
                            <i className="fa-solid fa-circle-check text-emerald-600 text-sm shrink-0"></i>
                            <span className="font-semibold">{successSummary}</span>
                        </div>
                    )}

                    {/* Required Description (Below issue) */}
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs text-slate-700 space-y-2">
                        <div className="font-bold uppercase tracking-wider text-[10px] text-slate-500 flex items-center gap-1">
                            <i className="fa-solid fa-circle-info text-blue-500"></i>
                            Required Spreadsheet Format
                        </div>

                        {formatType === 'RATELIST' ? (
                            <>
                                <p className="text-[11px] text-slate-600 leading-normal">
                                    Row 1 must be column headers: <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-blue-700">code_name</code>, <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-blue-700">name</code>, <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-blue-700">mrp</code>, <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-blue-700">b2b_price</code>.
                                </p>
                                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-[10px]">
                                    <div className="grid grid-cols-4 bg-slate-100 font-mono font-bold p-1.5 border-b border-slate-200 text-slate-600 text-center">
                                        <span>code_name</span>
                                        <span>name</span>
                                        <span>mrp</span>
                                        <span>b2b_price</span>
                                    </div>
                                    <div className="grid grid-cols-4 p-1.5 text-center text-slate-500 border-b border-slate-100">
                                        <span className="font-mono">CBC</span>
                                        <span>COMPLETE BLOOD COUNT</span>
                                        <span>350</span>
                                        <span className="text-blue-600 font-bold">120</span>
                                    </div>
                                    <div className="grid grid-cols-4 p-1.5 text-center text-slate-500">
                                        <span className="font-mono">LFT</span>
                                        <span>LIVER FUNCTION TEST</span>
                                        <span>800</span>
                                        <span className="text-blue-600 font-bold">250</span>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="text-[11px] text-slate-600 leading-normal">
                                    Row 1 must start with <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-indigo-700">test_name</code>. Subsequent columns can be named <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-indigo-700">alias1</code>, <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-indigo-700">alias2</code> ... <code className="bg-white px-1 py-0.5 rounded border font-mono font-bold text-indigo-700">aliasN</code> to link synonyms and abbreviations.
                                </p>
                                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white text-[10px]">
                                    <div className="grid grid-cols-4 bg-slate-100 font-mono font-bold p-1.5 border-b border-slate-200 text-slate-600 text-center">
                                        <span className="text-indigo-700 font-bold">test_name</span>
                                        <span>alias1</span>
                                        <span>alias2</span>
                                        <span>alias3</span>
                                    </div>
                                    <div className="grid grid-cols-4 p-1.5 text-center text-slate-500 border-b border-slate-100">
                                        <span className="font-semibold text-slate-800">CBC</span>
                                        <span>COMPLETE BLOOD COUNT</span>
                                        <span>HEMOGRAM</span>
                                        <span>CBC WITH ESR</span>
                                    </div>
                                    <div className="grid grid-cols-4 p-1.5 text-center text-slate-500">
                                        <span className="font-semibold text-slate-800">LIPID PROFILE</span>
                                        <span>LIPID</span>
                                        <span>LIPID SCREEN</span>
                                        <span className="italic text-gray-300">-</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Toggle Button: Overwrite vs Append (Below description) */}
                    <div className="pt-2 border-t border-gray-100">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-2">
                            Import Mode
                        </label>
                        <div className="grid grid-cols-2 gap-2 bg-gray-100 p-1 rounded-xl">
                            <button
                                type="button"
                                onClick={() => setMode('OVERWRITE')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                    mode === 'OVERWRITE'
                                        ? 'bg-red-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <i className="fa-solid fa-rotate text-[10px]"></i>
                                Overwrite (Default)
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('APPEND')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                                    mode === 'APPEND'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900'
                                }`}
                            >
                                <i className="fa-solid fa-plus text-[10px]"></i>
                                Add to End (Append)
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1.5 ml-1">
                            {mode === 'OVERWRITE' ? (
                                <span className="text-amber-700 font-medium">
                                    <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                                    Existing items in this list will be completely replaced by the file contents.
                                </span>
                            ) : (
                                <span>
                                    Uploaded rows will be appended to existing items without wiping existing data.
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl text-xs hover:bg-gray-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={!file || parsedRows.length === 0 || !!errorIssue || isSubmitting || isProcessing}
                        className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-200 transition-all flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <i className="fa-solid fa-spinner fa-spin"></i> Importing...
                            </>
                        ) : (
                            <>
                                <i className="fa-solid fa-file-import"></i>
                                {mode === 'OVERWRITE' ? 'Overwrite & Import' : 'Append to Ratelist'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExcelImportModal;
