import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface Option {
    value: string;
    label: string;
    code_name?: string;
    badge?: string | number;
}

interface SearchableDropdownProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    align?: 'left' | 'right' | 'auto';
    allowCustom?: boolean;
    className?: string;
}

export interface SearchableDropdownHandle {
    focus: () => void;
}

function parseMarkupTag(label: string) {
    if (!label) return { cleanText: '', tag: null };
    const match = label.match(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+([^)]+))?\)/i);
    if (match) {
        const cleanText = label.replace(/\(([+-]?\d+(?:\.\d+)?%)\s*(Markup|Discount|PROFIT)?(?:\s+from\s+([^)]+))?\)/i, '').trim();
        const pctStr = match[1].replace('+', '').replace('-', '');
        const isMarkup = !match[1].startsWith('-');
        const sourceName = match[3]?.trim();
        return {
            cleanText: cleanText || label,
            tag: { pctStr, isMarkup, sourceName }
        };
    }
    return { cleanText: label, tag: null };
}

function normalizeSearchStr(str: string): string {
    return str
        .toLowerCase()
        .replace(/^dr[\.\s]+/i, '')
        .replace(/[^a-z0-9]/g, '');
}

const SearchableDropdown = forwardRef<SearchableDropdownHandle, SearchableDropdownProps>(
    ({ options, value, onChange, placeholder, disabled, onKeyDown, align = 'auto', allowCustom = false, className }, ref) => {
        const getLabelFromValue = (val: string) => {
            const matched = options.find(opt => opt.value === val);
            if (!matched) return val;
            return parseMarkupTag(matched.label).cleanText;
        };

        const [isOpen, setIsOpen] = useState(false);
        const [searchTerm, setSearchTerm] = useState(() => getLabelFromValue(value));
        const [highlightedIndex, setHighlightedIndex] = useState(-1);
        const [isRightAligned, setIsRightAligned] = useState(align === 'right');
        const wrapperRef = useRef<HTMLDivElement>(null);
        const inputRef = useRef<HTMLInputElement>(null);
        const listRef = useRef<HTMLUListElement>(null);

        useEffect(() => {
            if (isOpen && wrapperRef.current) {
                if (align === 'right') {
                    setIsRightAligned(true);
                } else if (align === 'left') {
                    setIsRightAligned(false);
                } else {
                    const rect = wrapperRef.current.getBoundingClientRect();
                    const overflowsRight = (rect.left + 350 > window.innerWidth);
                    const isRightHalf = (rect.left + rect.width / 2 > window.innerWidth / 2);
                    setIsRightAligned(overflowsRight || isRightHalf);
                }
            }
        }, [isOpen, align]);

        useImperativeHandle(ref, () => ({
            focus: () => {
                inputRef.current?.focus();
            }
        }));

        useEffect(() => {
            setSearchTerm(getLabelFromValue(value));
        }, [value, options]);

        const filteredOptions = options
            .filter(option => option.label && option.label.trim() !== '')
            .filter(option => {
                const currentLabel = getLabelFromValue(value);
                if (searchTerm === currentLabel || searchTerm === '') {
                    return true;
                }
                const termLower = searchTerm.toLowerCase().trim();
                const termNorm = normalizeSearchStr(searchTerm);

                // Direct substring on raw label
                if (option.label.toLowerCase().includes(termLower)) return true;

                // Substring on clean markup text
                const clean = parseMarkupTag(option.label).cleanText;
                if (clean.toLowerCase().includes(termLower)) return true;

                // Code name match
                if (option.code_name && option.code_name.toLowerCase().includes(termLower)) return true;

                // Normalized substring match (e.g., typing "bisakha" matches "DR. BISAKHA PAL")
                if (termNorm.length > 0) {
                    const cleanNorm = normalizeSearchStr(clean);
                    if (cleanNorm.includes(termNorm)) return true;
                }

                return false;
            });

        useEffect(() => {
            if (isOpen && filteredOptions.length > 0) {
                setHighlightedIndex(0);
            } else {
                setHighlightedIndex(-1);
            }
        }, [searchTerm, isOpen, filteredOptions.length]);

        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                    if (allowCustom) {
                        onChange(searchTerm);
                    } else {
                        setSearchTerm(getLabelFromValue(value));
                    }
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, [value, options, allowCustom, searchTerm, onChange]);

        const handleSelect = (option: Option) => {
            onChange(option.value);
            setSearchTerm(parseMarkupTag(option.label).cleanText);
            setIsOpen(false);
            setHighlightedIndex(-1);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (disabled) return;

            if (isOpen) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : prev));
                    return;
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
                    return;
                } else if (e.key === 'Enter') {
                    const targetIndex = highlightedIndex >= 0 ? highlightedIndex : (filteredOptions.length > 0 ? 0 : -1);
                    if (targetIndex >= 0 && targetIndex < filteredOptions.length) {
                        e.preventDefault();
                        e.stopPropagation();
                        handleSelect(filteredOptions[targetIndex]);
                        return;
                    } else if (allowCustom && searchTerm.trim() !== '') {
                        e.preventDefault();
                        e.stopPropagation();
                        onChange(searchTerm.trim());
                        setIsOpen(false);
                        return;
                    }
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setIsOpen(false);
                    return;
                }
            } else {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setIsOpen(true);
                    return;
                }
            }

            // When dropdown is closed or key wasn't consumed for selection, allow parent handler
            if (onKeyDown) {
                onKeyDown(e);
            }
        };

        useEffect(() => {
            if (isOpen && highlightedIndex >= 0 && listRef.current) {
                const item = listRef.current.children[highlightedIndex] as HTMLElement;
                if (item) {
                    item.scrollIntoView({ block: 'nearest' });
                }
            }
        }, [highlightedIndex, isOpen]);

        return (
            <div className="relative" ref={wrapperRef}>
                <input
                    ref={inputRef}
                    type="text"
                    value={searchTerm}
                    onChange={e => {
                        const newVal = e.target.value;
                        setSearchTerm(newVal);
                        setIsOpen(true);
                    }}
                    onFocus={e => {
                        e.target.select();
                        setIsOpen(true);
                    }}
                    onClick={() => {
                        setIsOpen(true);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    className={className || "w-full p-2 border rounded bg-white cursor-pointer"}
                />
                {isOpen && filteredOptions.length > 0 && (
                    <ul ref={listRef} className={`absolute z-50 w-full min-w-[280px] sm:min-w-[320px] md:min-w-[380px] max-w-[calc(100vw-2rem)] ${isRightAligned ? 'right-0 left-auto' : 'left-0 right-auto'} bg-white border mt-1 rounded shadow-lg max-h-60 overflow-y-auto`}>
                        {filteredOptions.map((option, index) => {
                            const { cleanText, tag } = parseMarkupTag(option.label);
                            return (
                                <li
                                    key={option.value}
                                    onClick={() => handleSelect(option)}
                                    className={`p-2 cursor-pointer flex items-center justify-between gap-2 ${index === highlightedIndex ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                                >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <span className="truncate">{cleanText}</span>
                                        {tag && (
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border leading-none shrink-0 ${tag.isMarkup ? (index === highlightedIndex ? 'bg-emerald-600 text-white border-emerald-400' : 'bg-emerald-50 text-emerald-700 border-emerald-200') : (index === highlightedIndex ? 'bg-rose-600 text-white border-rose-400' : 'bg-rose-50 text-rose-700 border-rose-200')}`}>
                                                <i className={`fa-solid ${tag.isMarkup ? 'fa-arrow-up' : 'fa-arrow-down'} text-[7px] mr-0.5`}></i>
                                                {tag.pctStr}
                                            </span>
                                        )}
                                    </div>
                                    {option.code_name && (
                                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${index === highlightedIndex ? 'bg-blue-500 text-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                                            {option.code_name}
                                        </span>
                                    )}
                                    {option.badge !== undefined && (
                                        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 ${index === highlightedIndex ? 'bg-blue-500 text-white' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                                            {option.badge}
                                        </span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        );
    }
);

export default SearchableDropdown;