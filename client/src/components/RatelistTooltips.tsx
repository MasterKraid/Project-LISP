import React, { useState, useRef } from 'react';
import { User } from '../types';

interface LinkedClientsTooltipProps {
    listId: number;
    users: User[];
    children: React.ReactNode;
    yOffset?: number;
}

export const RatelistLinkedClientsTooltip: React.FC<LinkedClientsTooltipProps> = ({ 
    listId, 
    users, 
    children, 
    yOffset = 8 
}) => {
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top - yOffset,
                left: rect.left + rect.width / 2
            });
        }
    };

    const handleMouseEnter = () => {
        updatePosition();
    };

    const handleMouseLeave = () => {
        setCoords(null);
    };

    const linkedClients = users.filter(u => u.role === 'CLIENT' && u.assigned_list_ids?.includes(listId));

    return (
        <div 
            ref={triggerRef}
            className="inline-block"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseMove={updatePosition}
        >
            {children}
            {coords && (
                <div 
                    className="fixed -translate-x-1/2 -translate-y-full z-[99999] pointer-events-none"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`
                    }}
                >
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-2xl border border-slate-800/80 w-52 text-left space-y-1.5 animate-in fade-in zoom-in duration-75">
                        <div className="text-[8px] uppercase tracking-wider text-slate-400 font-extrabold border-b border-slate-800 pb-1 flex justify-between">
                            <span>Linked Clients</span>
                            <span className="bg-indigo-500/25 text-indigo-300 text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase">{linkedClients.length}</span>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1 custom-scrollbar-minimal">
                            {linkedClients.length === 0 ? (
                                <div className="text-slate-400 italic text-[9px]">No linked clients</div>
                            ) : (
                                linkedClients.map(c => (
                                    <div key={c.id} className="flex justify-between items-center text-white text-[10px] font-bold">
                                        <span className="truncate max-w-[125px]">{c.alias || c.username}</span>
                                        <span className="font-mono text-slate-400 text-[9px]">UID: #{String(c.id).padStart(4, '0')}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface MarkupTagTooltipProps {
    pctStr: string;
    isMarkup: boolean;
    motherListName: string;
    yOffset?: number;
}

export const RatelistMarkupTagTooltip: React.FC<MarkupTagTooltipProps> = ({ 
    pctStr, 
    isMarkup, 
    motherListName, 
    yOffset = 8 
}) => {
    const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
    const triggerRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setCoords({
                top: rect.top - yOffset,
                left: rect.left + rect.width / 2
            });
        }
    };

    const handleMouseEnter = () => {
        updatePosition();
    };

    const handleMouseLeave = () => {
        setCoords(null);
    };

    return (
        <div 
            ref={triggerRef}
            className="inline-block shrink-0"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseMove={updatePosition}
        >
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8.5px] font-black uppercase tracking-wider border leading-none cursor-help ${
                isMarkup 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                    : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
                <i className={`fa-solid ${isMarkup ? 'fa-arrow-up text-emerald-600' : 'fa-arrow-down text-rose-600'} text-[7px] mr-0.5`}></i>
                {pctStr}
            </span>
            {coords && (
                <div 
                    className="fixed -translate-x-1/2 -translate-y-full z-[99999] pointer-events-none"
                    style={{
                        top: `${coords.top}px`,
                        left: `${coords.left}px`
                    }}
                >
                    <div className="bg-slate-900/95 backdrop-blur-md text-white p-3.5 rounded-2xl shadow-2xl border border-slate-800/80 w-52 text-center animate-in fade-in zoom-in duration-75">
                        <div className="text-[7.5px] uppercase tracking-wider text-slate-400 font-extrabold mb-1">Parent Source</div>
                        <div className="font-mono text-emerald-400 font-extrabold text-[11px] truncate mb-0.5">{motherListName}</div>
                        <div className="text-[7px] text-slate-400 italic">Synced Database</div>
                    </div>
                </div>
            )}
        </div>
    );
};


