import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface Option {
    value: string;
    label: string;
    code_name?: string;
}

interface SearchableDropdownProps {
    options: Option[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export interface SearchableDropdownHandle {
    focus: () => void;
}

const SearchableDropdown = forwardRef<SearchableDropdownHandle, SearchableDropdownProps>(
    ({ options, value, onChange, placeholder, disabled, onKeyDown }, ref) => {
        const getLabelFromValue = (val: string) => {
            const matched = options.find(opt => opt.value === val);
            return matched ? matched.label : val;
        };

        const [isOpen, setIsOpen] = useState(false);
        const [searchTerm, setSearchTerm] = useState(() => getLabelFromValue(value));
        const [highlightedIndex, setHighlightedIndex] = useState(-1);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const inputRef = useRef<HTMLInputElement>(null);
        const listRef = useRef<HTMLUListElement>(null);

        useImperativeHandle(ref, () => ({
            focus: () => {
                inputRef.current?.focus();
                // Universal scroll-to-center on focus
                setTimeout(() => {
                    inputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                }, 100);
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
                return option.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       option.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
                       (option.code_name && option.code_name.toLowerCase().includes(searchTerm.toLowerCase()));
            });

        useEffect(() => {
            setHighlightedIndex(-1);
        }, [searchTerm, isOpen]);

        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                    setSearchTerm(getLabelFromValue(value)); // Reset search term to current label if no selection was made
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, [value, options]);

        const handleSelect = (option: Option) => {
            onChange(option.value);
            setSearchTerm(option.label);
            setIsOpen(false);
        };

        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (isOpen && filteredOptions.length > 0) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlightedIndex(prev => (prev + 1) % filteredOptions.length);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex(prev => (prev - 1 + filteredOptions.length) % filteredOptions.length);
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    const selectedOption = highlightedIndex >= 0 ? filteredOptions[highlightedIndex] : filteredOptions[0];
                    if (selectedOption) {
                        handleSelect(selectedOption);
                    }
                } else if (e.key === 'Escape') {
                    setIsOpen(false);
                }
            } else if (e.key === 'Enter' && onKeyDown) {
                // If closed or no options, let the parent handle Enter (e.g. jump to next field)
                onKeyDown(e);
            } else if (onKeyDown) {
                onKeyDown(e);
            }
        };

        useEffect(() => {
            if (highlightedIndex >= 0 && listRef.current) {
                const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement;
                if (highlightedEl) {
                    highlightedEl.scrollIntoView({ block: 'nearest' });
                }
            }
        }, [highlightedIndex]);

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
                    className="w-full p-2 border rounded bg-white cursor-pointer"
                />
                {isOpen && filteredOptions.length > 0 && (
                    <ul ref={listRef} className="absolute z-10 w-full min-w-[320px] md:min-w-[450px] right-0 md:right-auto bg-white border mt-1 rounded shadow-lg max-h-60 overflow-y-auto">
                        {filteredOptions.map((option, index) => (
                            <li
                                key={option.value}
                                onClick={() => handleSelect(option)}
                                className={`p-2 cursor-pointer flex items-center justify-between gap-2 ${index === highlightedIndex ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                            >
                                <span>{option.label}</span>
                                {option.code_name && (
                                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${index === highlightedIndex ? 'bg-blue-500 text-blue-100' : 'bg-slate-100 text-slate-500'}`}>
                                        {option.code_name}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        );
    }
);

export default SearchableDropdown;