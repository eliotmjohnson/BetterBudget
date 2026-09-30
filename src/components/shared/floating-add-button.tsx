'use client';

import { Plus } from 'lucide-react';
import { useState } from 'react';
import { createPortal } from 'react-dom';

export function FloatingAddButton({
    visible,
    onAdd
}: {
    visible: boolean;
    onAdd: () => void;
}) {
    const [arrived, setArrived] = useState(false);

    if (visible && !arrived) setArrived(true);
    if (!arrived) return null;

    return createPortal(
        <button
            className='floating-add-button'
            type='button'
            aria-label='Add transaction'
            aria-haspopup='dialog'
            data-visible={visible ? 'true' : 'false'}
            inert={!visible}
            onClick={onAdd}
        >
            <Plus
                className='floating-add-button-icon'
                size={27}
                strokeWidth={2.25}
            />
        </button>,
        document.querySelector('.app-frame') ?? document.body
    );
}
