'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { monthKeySchema, type MonthKey } from '@/domain/money';

const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
];

function parts(monthKey: MonthKey) {
    const [year, month] = monthKey.split('-');

    return { year: Number(year), month: Number(month) - 1 };
}

export function MonthPicker({
    monthKey,
    monthLabel,
    onSelect
}: {
    monthKey: MonthKey;
    monthLabel: string;
    onSelect: (month: MonthKey) => void;
}) {
    const selected = parts(monthKey);
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const [draftYear, setDraftYear] = useState(selected.year);
    const [draftMonth, setDraftMonth] = useState(selected.month);
    const rootRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const openPicker = () => {
        setDraftYear(selected.year);
        setDraftMonth(selected.month);
        setMounted(true);
        setOpen(true);
    };
    const closePicker = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) triggerRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;

        const dismiss = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node))
                setOpen(false);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                triggerRef.current?.focus();
            }
        };

        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('keydown', escape);

        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('keydown', escape);
        };
    }, [open]);

    const save = () => {
        const parsed = monthKeySchema.safeParse(
            `${draftYear}-${String(draftMonth + 1).padStart(2, '0')}`
        );

        if (parsed.success && parsed.data !== monthKey) onSelect(parsed.data);
        closePicker();
    };

    return (
        <div className='month-picker-shell' ref={rootRef}>
            <button
                ref={triggerRef}
                className='month-picker-control'
                type='button'
                aria-haspopup='dialog'
                aria-expanded={open}
                onClick={() => (open ? closePicker() : openPicker())}
            >
                <span>{monthLabel}</span>
            </button>
            {mounted ? (
                <div
                    className='month-picker-popover'
                    data-state={open ? 'open' : 'closed'}
                    role='dialog'
                    aria-label='Choose budget month'
                    onAnimationEnd={(event) => {
                        if (event.target === event.currentTarget && !open)
                            setMounted(false);
                    }}
                >
                    <div className='month-picker-year'>
                        <button
                            className='icon-button small-icon'
                            type='button'
                            aria-label='Previous year'
                            onClick={() => setDraftYear((year) => year - 1)}
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <strong>{draftYear}</strong>
                        <button
                            className='icon-button small-icon'
                            type='button'
                            aria-label='Next year'
                            onClick={() => setDraftYear((year) => year + 1)}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    <div
                        className='month-picker-grid'
                        role='grid'
                        aria-label={`Months in ${draftYear}`}
                    >
                        {months.map((month, index) => {
                            const active =
                                draftYear === selected.year &&
                                index === selected.month;
                            const chosen = index === draftMonth;

                            return (
                                <button
                                    key={month}
                                    type='button'
                                    role='gridcell'
                                    aria-selected={chosen}
                                    className={chosen ? 'selected' : ''}
                                    data-current={active || undefined}
                                    onClick={() => setDraftMonth(index)}
                                >
                                    {month}
                                </button>
                            );
                        })}
                    </div>
                    <button
                        className='primary-button primary-button--wide month-picker-save'
                        type='button'
                        onClick={save}
                    >
                        Save
                    </button>
                </div>
            ) : null}
        </div>
    );
}
