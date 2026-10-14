'use client';

import { Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * The floating plus, or with `restoreCount` set, the Recently deleted view's
 * floating Restore for that many checked transactions.
 */
export function FloatingAddButton({
    visible,
    restoreCount,
    onAdd
}: {
    visible: boolean;
    restoreCount?: number;
    onAdd: () => void;
}) {
    const restoring = restoreCount !== undefined;
    const Icon = restoring ? RotateCcw : Plus;
    const [arrived, setArrived] = useState(false);

    if (visible && !arrived) setArrived(true);
    if (!arrived) return null;

    return createPortal(
        <button
            className='floating-add-button'
            type='button'
            aria-label={
                restoring
                    ? `Restore ${restoreCount} selected`
                    : 'Add transaction'
            }
            aria-haspopup={restoring ? undefined : 'dialog'}
            data-visible={visible ? 'true' : 'false'}
            inert={!visible}
            onClick={onAdd}
        >
            <Icon
                className='floating-add-button-icon'
                size={restoring ? 24 : 27}
                strokeWidth={2.25}
            />
        </button>,
        document.querySelector('.app-frame') ?? document.body
    );
}
