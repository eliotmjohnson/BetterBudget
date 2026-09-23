'use client';

import { ArrowUp, RotateCcw } from 'lucide-react';
import {
    Fragment,
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactNode,
    type RefObject
} from 'react';
import { Sheet } from '@/components/ui/sheet';
import { BetterBuddyFigure } from './better-buddy-figure';
import { useKeyboardLayout } from './keyboard-layout';
import type { TranscriptEntry } from './use-assistant';

const suggestions = [
    'How much is left to budget?',
    'Where am I overspending?',
    'Add a $12 coffee to Dining out today'
];

/**
 * Mounts with the sheet each time it opens and remembers which messages were
 * already there, so only messages that arrive while it is open animate in.
 */
function TranscriptMessages({
    transcript,
    retryAction
}: {
    transcript: TranscriptEntry[];
    retryAction: ReactNode;
}) {
    const [shownAtOpen] = useState(
        () => new Set(transcript.map((entry) => entry.id))
    );

    return transcript.map((entry, index) => (
        <Fragment key={entry.id}>
            <p
                className='assistant-message'
                data-role={entry.role}
                data-failed={entry.failed ? 'true' : undefined}
                data-entering={shownAtOpen.has(entry.id) ? undefined : 'true'}
            >
                {entry.text}
            </p>
            {entry.retryText && index === transcript.length - 1
                ? retryAction
                : null}
        </Fragment>
    ));
}

export function AssistantSheet({
    open,
    onOpenChange,
    onDragDismissStart,
    restoreFocusRef,
    transcript,
    pending,
    onSend,
    onRetry,
    onReset
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onDragDismissStart: () => void;
    restoreFocusRef: RefObject<HTMLElement | null>;
    transcript: TranscriptEntry[];
    pending: boolean;
    onSend: (text: string) => void;
    onRetry: () => void;
    onReset: () => void;
}) {
    const [draft, setDraft] = useState('');

    useKeyboardLayout(open);
    const endRef = useRef<HTMLDivElement>(null);
    const jumpToEnd = useCallback((node: HTMLDivElement | null) => {
        endRef.current = node;
        const body = node?.closest<HTMLElement>('.sheet-body');

        if (body) body.scrollTop = body.scrollHeight;
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }, [transcript.length, pending]);

    const submit = (text = draft) => {
        if (!text.trim() || pending) return;
        onSend(text);
        setDraft('');
    };
    const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key !== 'Enter' || event.shiftKey) return;
        if (event.nativeEvent.isComposing) return;
        event.preventDefault();
        submit();
    };

    return (
        <Sheet
            open={open}
            onOpenChange={onOpenChange}
            onDragDismissStart={onDragDismissStart}
            title='Better Buddy'
            titleAdornment={
                <span className='assistant-seat' data-buddy-seat>
                    <BetterBuddyFigure size={44} />
                </span>
            }
            variant='raised-mobile'
            restoreFocusRef={restoreFocusRef}
            showClose={false}
            headerAction={
                transcript.length ? (
                    <button
                        type='button'
                        className='text-button assistant-new-chat'
                        onClick={onReset}
                    >
                        New chat
                    </button>
                ) : null
            }
            footer={
                <form
                    className='assistant-composer'
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <textarea
                        aria-label='Message Better Buddy'
                        rows={1}
                        maxLength={2_000}
                        placeholder='Ask about your budget…'
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleKeyDown}
                    />
                    <button
                        className='assistant-send'
                        type='submit'
                        disabled={pending || !draft.trim()}
                        aria-label='Send'
                    >
                        <ArrowUp size={20} strokeWidth={2.2} />
                    </button>
                </form>
            }
        >
            <div className='assistant-thread'>
                {transcript.length === 0 ? (
                    <div className='assistant-empty'>
                        <p>
                            <strong>Hi, I’m Better Buddy.</strong> Ask about
                            your budget, or tell me what to change. I can add
                            transactions and income, set planned amounts, and
                            add or rename categories and items.
                        </p>
                        <div className='assistant-suggestions'>
                            {suggestions.map((suggestion) => (
                                <button
                                    key={suggestion}
                                    type='button'
                                    className='assistant-suggestion'
                                    disabled={pending}
                                    onClick={() => submit(suggestion)}
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}
                <div
                    className='assistant-messages'
                    role='log'
                    aria-live='polite'
                >
                    <TranscriptMessages
                        transcript={transcript}
                        retryAction={
                            pending ? null : (
                                <button
                                    type='button'
                                    className='text-button assistant-retry'
                                    onClick={onRetry}
                                >
                                    <RotateCcw size={16} strokeWidth={2.4} />
                                    Try again
                                </button>
                            )
                        }
                    />
                    {pending ? (
                        <p
                            className='assistant-message assistant-typing'
                            data-role='assistant'
                            data-entering='true'
                            aria-label='Better Buddy is thinking'
                        >
                            <span />
                            <span />
                            <span />
                        </p>
                    ) : null}
                </div>
                <div ref={jumpToEnd} />
            </div>
        </Sheet>
    );
}
