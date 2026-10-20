'use client';

import { Search } from 'lucide-react';
import type { RefObject } from 'react';
import { StripButton } from '@/components/shared/strip-button';
import { scrollToTop } from '@/components/ui/scroll-to-top';
import { focusStill } from '@/components/ui/still-focus';

/**
 * The folded iPhone Duo's strip shortcut to Transactions search: it focuses
 * the search field from anywhere in the list and scrolls back up to it.
 */
export function SearchStripButton({
    visible,
    searchBoxRef
}: {
    visible: boolean;
    searchBoxRef: RefObject<HTMLDivElement | null>;
}) {
    return (
        <StripButton
            visible={visible}
            label='Search transactions'
            onPress={() => {
                const box = searchBoxRef.current;
                const field = box?.querySelector('input');

                if (field) focusStill(field, true);
                scrollToTop(box?.closest<HTMLElement>('.app-content') ?? null);
            }}
        >
            <Search size={24} strokeWidth={2.1} />
        </StripButton>
    );
}
