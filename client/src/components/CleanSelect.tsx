import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string | number;
    label: string | React.ReactNode;
}

interface CleanSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: any) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
}

function parseMarkupTag(label: string | React.ReactNode) {
    if (typeof label !== 'string') {
        return { cleanText: label, tag: null, fullText: '' };
    }

    const match = label.match(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+([^)]+))?\)/i);
    if (match) {
        const cleanText = label.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+([^)]+))?\)/i, '').trim();
        const pctStr = match[1].replace('+', '').replace('-', '');
        const isMarkup = !match[1].startsWith('-');
        const sourceName = match[3]?.trim();
        return {
            cleanText: cleanText || label,
            tag: { pctStr, isMarkup, sourceName },
            fullText: label
        };
    }

    const matchSimple = label.match(/([+-]?\d+(?:\.\d+)?)\s*%\s*(Markup|Discount|PROFIT)?/i);
    if (matchSimple && (label.includes('Markup') || label.includes('Discount') || label.includes('%'))) {
        const value = parseFloat(matchSimple[1]);
        const pctStr = `${Math.abs(value)}%`;
        const type = matchSimple[2]?.toUpperCase();
        let isMarkup = value >= 0;
        if (type === 'DISCOUNT') isMarkup = false;
        const cleanText = label.replace(/([+-]?\d+(?:\.\d+)?)\s*%\s*(Markup|Discount|PROFIT)?/i, '').trim();
        return {
            cleanText: cleanText || label,
            tag: { pctStr, isMarkup, sourceName: undefined },
            fullText: label
        };
    }

    return { cleanText: label, tag: null, fullText: label };
}

const CleanSelect: React.FC<CleanSelectProps> = ({ options, value, onChange, placeholder, disabled, className = "" }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const renderOptionContent = (label: string | React.ReactNode) => {
        const { cleanText, tag, fullText } = parseMarkupTag(label);
        if (!tag) {
            return (
                <span className="truncate block" title={typeof label === 'string' ? label : undefined}>
                    {label}
                </span>
            );
        }

        return (
            <div className="flex items-center justify-between gap-2 min-w-0 flex-1 w-full" title={fullText}>
                <span className="truncate text-inherit">{cleanText}</span>
                <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border leading-none shrink-0 ${
                        tag.isMarkup
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                    }`}
                    title={tag.sourceName ? `Synced from ${tag.sourceName}` : `${tag.pctStr} ${tag.isMarkup ? 'Markup' : 'Discount'}`}
                >
                    <i className={`fa-solid ${tag.isMarkup ? 'fa-arrow-up text-emerald-600' : 'fa-arrow-down text-rose-600'} text-[7px] mr-0.5`}></i>
                    {tag.pctStr}
                </span>
            </div>
        );
    };

    return (
        <div className={`relative ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} ref={containerRef}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 flex items-center justify-between cursor-pointer transition-all ${isOpen ? 'ring-2 ring-blue-100 border-blue-300 shadow-sm' : 'hover:border-gray-400'}`}
            >
                <div className="truncate mr-2 flex-1 min-w-0 flex items-center">
                    {selectedOption ? renderOptionContent(selectedOption.label) : (
                        <span className="text-gray-400">{placeholder || 'Select option'}</span>
                    )}
                </div>
                <i className={`fa-solid fa-chevron-down text-[10px] text-gray-400 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`}></i>
            </div>

            {isOpen && !disabled && (
                <ul className="absolute z-50 left-0 sm:left-auto sm:right-0 min-w-full w-full sm:w-auto max-w-[calc(100vw-2rem)] bg-white border border-gray-200 mt-1 rounded-lg shadow-xl max-h-60 overflow-y-auto py-1 animate-in fade-in slide-in-from-top-2 duration-100">
                    {options.length === 0 ? (
                        <li className="px-3 py-2 text-xs text-gray-400 italic">No options</li>
                    ) : (
                        options.map(option => (
                            <li
                                key={option.value}
                                onClick={() => {
                                    onChange(option.value);
                                    setIsOpen(false);
                                }}
                                className={`px-3 py-2 text-sm cursor-pointer transition-colors flex items-center ${option.value === value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                            >
                                {renderOptionContent(option.label)}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
};

export default CleanSelect;
