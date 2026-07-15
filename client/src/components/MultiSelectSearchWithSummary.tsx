import React, { useState, useEffect, useRef } from 'react';

interface Option {
    value: string;
    label: string;
    b2b?: number;
    mrp?: number;
    code_name?: string;
}

interface MultiSelectSearchProps {
    options: Option[];
    selectedValues: string[];
    onChange: (selectedValues: string[]) => void;
    placeholder?: string;
    disabled?: boolean;
    onEnterPress?: () => void;
}

const MultiSelectSearchWithSummary: React.FC<MultiSelectSearchProps> = ({
    options,
    selectedValues,
    onChange,
    placeholder = "Search...",
    disabled = false,
    onEnterPress
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Filter options based on search term
    const filteredOptions = options
        .filter(option => option.label && option.label.trim() !== '')
        .filter(option => 
            option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (option.code_name && option.code_name.toLowerCase().includes(searchTerm.toLowerCase()))
        );

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Reset highlight when search changes
    useEffect(() => {
        setHighlightedIndex(-1);
    }, [searchTerm, isOpen]);

    // Scroll to highlighted item
    useEffect(() => {
        if (highlightedIndex >= 0 && listRef.current) {
            const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement;
            if (highlightedEl) {
                highlightedEl.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex]);

    const toggleSelection = (value: string) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter(v => v !== value));
        } else {
            onChange([...selectedValues, value]);
        }
        inputRef.current?.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (onEnterPress) {
                onEnterPress();
            }
            return;
        }

        if (!isOpen) {
            if (e.key === 'ArrowDown') setIsOpen(true);
            return;
        }

        if (filteredOptions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
            } else if (e.key === 'Escape') {
                setIsOpen(false);
            }
        }
    };

    const clearSearch = () => {
        setSearchTerm('');
        setIsOpen(false);
        inputRef.current?.blur();
    };

    return (
        <div className="relative min-w-0" ref={wrapperRef}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <i className="fa-solid fa-search text-gray-400"></i>
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={e => {
                        setSearchTerm(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => {
                        setIsOpen(true);
                        setTimeout(() => {
                            if (wrapperRef.current) {
                                wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }, 150);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl outline-none focus:ring-4 focus:ring-blue-100 transition-all text-sm shadow-sm"
                />
                <button
                    onClick={clearSearch}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                    title="Clear search and close"
                >
                    <i className="fa-solid fa-circle-xmark"></i>
                </button>
            </div>
            {isOpen && filteredOptions.length > 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-96">
                    <ul ref={listRef} className="overflow-y-auto flex-1 max-h-80">
                        {filteredOptions.map((option, index) => {
                            const isSelected = selectedValues.includes(option.value);
                            return (
                                <li
                                    key={option.value}
                                    onClick={() => toggleSelection(option.value)}
                                    onMouseEnter={() => setHighlightedIndex(index)}
                                    className={`p-3 cursor-pointer flex justify-between items-center border-b border-gray-100 last:border-0 transition-colors ${
                                        index === highlightedIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                                    }`}
                                >
                                    <div className="flex flex-col flex-1 min-w-0 pr-4">
                                        <span className={`${isSelected ? 'font-bold text-blue-700' : 'text-gray-700'} break-words min-w-0`}>
                                            {option.label}
                                        </span>
                                        {(option.b2b !== undefined || option.mrp !== undefined) && (
                                            <div className="flex gap-3 text-[10px] mt-0.5 opacity-70">
                                                {option.b2b !== undefined && (
                                                    <span className="font-bold text-green-600">B2B: ₹{option.b2b}</span>
                                                )}
                                                {option.mrp !== undefined && (
                                                    <span className="font-bold text-slate-500">MRP: ₹{option.mrp}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {isSelected && (
                                        <i className="fa-solid fa-check text-blue-600 font-bold"></i>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="p-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center shrink-0">
                        <span className="text-xs text-slate-500 font-medium">Selected: <strong className="text-blue-600 font-bold">{selectedValues.length}</strong></span>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onEnterPress) onEnterPress();
                            }}
                            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow transition-colors"
                        >
                            Show Summary
                        </button>
                    </div>
                </div>
            )}
            {isOpen && filteredOptions.length === 0 && (
                <div className="absolute z-50 w-full bg-white border border-gray-200 mt-1 rounded-xl shadow-lg p-4 text-center text-gray-500 text-sm">
                    No matching tests found.
                </div>
            )}
        </div>
    );
};

export default MultiSelectSearchWithSummary;
