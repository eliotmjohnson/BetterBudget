'use client';

import { Component, createRef, type ReactNode } from 'react';

const GLIDE = { duration: 440, easing: 'cubic-bezier(0.2, 1, 0.45, 1)' };

type Snapshot = { top: number | null; sheetHeight: number } | null;

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The chat's message list. When a message is added or the typing indicator
 * shows or hides (`trigger` changes), it puts the sheet's body on its end at
 * once and glides the messages from where they sat to where that leaves them,
 * so they slide up the same way whether the conversation fits, grows the
 * sheet, or scrolls. A sheet sized to its conversation also eases its height
 * to the new size, with its body held on its end, so its top rises with the
 * messages. It is a class for `getSnapshotBeforeUpdate`, the only way to read
 * where the messages sat before React committed the change.
 */
export class MessageGlide extends Component<{
    trigger: string;
    children: ReactNode;
}> {
    private readonly list = createRef<HTMLDivElement>();

    override getSnapshotBeforeUpdate(previous: { trigger: string }): Snapshot {
        const list = this.list.current;
        const sheet = list?.closest<HTMLElement>('.sheet-content');

        if (previous.trigger === this.props.trigger || !list || !sheet)
            return null;

        return {
            top: list.firstElementChild?.getBoundingClientRect().top ?? null,
            sheetHeight: sheet.offsetHeight
        };
    }

    override componentDidUpdate(_: unknown, __: unknown, snapshot: Snapshot) {
        const list = this.list.current;
        const sheet = list?.closest<HTMLElement>('.sheet-content');
        const body = list?.closest<HTMLElement>('.sheet-body');

        if (!snapshot || !list || !sheet || !body) return;
        const animate = !prefersReducedMotion();
        const height = sheet.offsetHeight;

        if (animate && height > snapshot.sheetHeight + 1 && !sheet.style.height)
            sheet.animate(
                [
                    { height: `${snapshot.sheetHeight}px` },
                    { height: `${height}px` }
                ],
                GLIDE
            );
        body.scrollTop = body.scrollHeight;
        const first = list.firstElementChild;

        if (!animate || snapshot.top === null || !first) return;
        const shift = snapshot.top - first.getBoundingClientRect().top;

        if (Math.abs(shift) > 1)
            list.animate(
                [
                    { transform: `translateY(${shift}px)` },
                    { transform: 'none' }
                ],
                GLIDE
            );
    }

    override render() {
        return (
            <div
                ref={this.list}
                className='assistant-messages'
                role='log'
                aria-live='polite'
            >
                {this.props.children}
            </div>
        );
    }
}
