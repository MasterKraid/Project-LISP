import React, { useState, useRef, useEffect } from 'react';

interface Option {
    value: string | number;
    label: string;
}

interface CleanSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: any) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
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

    return (
        <div className={`relative ${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`} ref={containerRef}>
            <div
                onClick={() => !disabled && setIsOpen(!isOpen)}
                className={`bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 flex items-center justify-between cursor-pointer transition-all ${isOpen ? 'ring-2 ring-blue-100 border-blue-300 shadow-sm' : 'hover:border-gray-400'}`}
            >
                <span className={`truncate mr-2 ${!selectedOption ? 'text-gray-400' : ''}`}>
                    {selectedOption ? selectedOption.label : placeholder || 'Select option'}
                </span>
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
                                className={`px-3 py-2 text-sm cursor-pointer transition-colors whitespace-normal sm:whitespace-nowrap ${option.value === value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
                            >
                                {option.label}
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
};

export default CleanSelect;
