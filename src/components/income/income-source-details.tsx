'use client';

import { Palette, Plus, Trash2 } from 'lucide-react';
import { useState, type RefObject } from 'react';
import { NavigationDetail } from '@/components/ui/navigation-detail';
import { Sheet } from '@/components/ui/sheet';
import type {
    CategoryTone,
    IncomePlanView,
    IncomeReceiptView,
    MonthSnapshot
} from '@/domain/types';
import { createUuid } from '@/domain/uuid';
import { CategoryIcon } from '@/components/shared/category-icon';
import { money, type Mutate } from '@/components/shared/budget-view-helpers';
import {
    EditableIncomeTitle,
    IncomeAppearancePicker,
    IncomePlanInput,
    incomeIconValue,
    type IncomeIconValue
} from './income-fields';

const dayLabel = (date: string) =>
    new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(`${date}T00:00:00Z`));

type IncomeDeleteTarget =
    { type: 'receipt'; receipt: IncomeReceiptView } | { type: 'source' };

export function IncomeSourceDetails({
    plan,
    snapshot,
    mutate,
    onRecordIncome,
    onOpenChange,
    restoreFocusRef,
    restoreFocusVisible
}: {
    plan: IncomePlanView | null;
    snapshot: MonthSnapshot;
    mutate: Mutate;
    onRecordIncome: () => void;
    onOpenChange: (open: boolean) => void;
    restoreFocusRef: RefObject<HTMLElement | null>;
    restoreFocusVisible: boolean;
}) {
    const [deleteTarget, setDeleteTarget] = useState<IncomeDeleteTarget | null>(
        null
    );
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [appearanceIcon, setAppearanceIcon] =
        useState<IncomeIconValue>('wallet');
    const [appearanceTone, setAppearanceTone] = useState<CategoryTone>('mint');
    const [previousPlan, setPreviousPlan] = useState<IncomePlanView | null>(
        plan
    );
    const [renderedPlan, setRenderedPlan] = useState<IncomePlanView | null>(
        plan
    );

    if (plan !== previousPlan) {
        setPreviousPlan(plan);
        setDeleteOpen(false);
        setAppearanceOpen(false);
        if (plan) setRenderedPlan(plan);
    }

    if (!renderedPlan) return null;
    const close = () => {
        setDeleteOpen(false);
        setAppearanceOpen(false);
        onOpenChange(false);
    };
    const openAppearance = () => {
        setAppearanceIcon(incomeIconValue(renderedPlan.icon));
        setAppearanceTone(renderedPlan.tone);
        setAppearanceOpen(true);
    };
    const saveAppearance = () => {
        if (
            appearanceIcon !== renderedPlan.icon ||
            appearanceTone !== renderedPlan.tone
        )
            mutate({
                type: 'updateIncomePlan',
                clientMutationId: createUuid(),
                monthKey: snapshot.monthKey,
                incomePlanId: renderedPlan.id,
                expectedVersion: renderedPlan.version,
                name: renderedPlan.name,
                icon: appearanceIcon,
                tone: appearanceTone,
                expectedCents: renderedPlan.expectedCents
            });
        setAppearanceOpen(false);
    };
    const deleteReceipt = (receipt: IncomeReceiptView) => {
        mutate({
            type: 'deleteIncomeReceipt',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomeReceiptId: receipt.id,
            expectedVersion: receipt.version
        });
        setDeleteOpen(false);
    };
    const deleteSource = () => {
        mutate({
            type: 'deleteIncomePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: renderedPlan.id,
            expectedVersion: renderedPlan.version
        });
        close();
    };
    const receiptTarget =
        deleteTarget?.type === 'receipt' ? deleteTarget.receipt : null;

    return (
        <>
            <NavigationDetail
                backLabel='Income'
                floatingAction={
                    <button
                        className='navigation-detail-add-transaction'
                        type='button'
                        aria-label={`Record income for ${renderedPlan.name}`}
                        aria-haspopup='dialog'
                        onClick={onRecordIncome}
                    >
                        <Plus size={27} strokeWidth={2.25} />
                    </button>
                }
                headerAction={
                    <button
                        className='icon-button income-source-appearance-action'
                        type='button'
                        aria-label='Edit income source appearance'
                        aria-haspopup='dialog'
                        aria-expanded={appearanceOpen}
                        onClick={openAppearance}
                    >
                        <Palette size={20} strokeWidth={1.8} />
                    </button>
                }
                open={plan !== null}
                onOpenChange={(open) => {
                    if (!open) close();
                }}
                restoreFocusRef={restoreFocusRef}
                restoreFocusVisible={restoreFocusVisible}
                title={renderedPlan.name}
                titleContent={
                    <EditableIncomeTitle
                        key={renderedPlan.id}
                        plan={renderedPlan}
                        snapshot={snapshot}
                        mutate={mutate}
                    />
                }
            >
                <div className='income-source-details'>
                    <div className='income-source-stats'>
                        <div>
                            <label htmlFor='income-source-expected'>
                                Expected
                            </label>
                            <IncomePlanInput
                                key={`${renderedPlan.id}:${renderedPlan.expectedCents}`}
                                plan={renderedPlan}
                                snapshot={snapshot}
                                mutate={mutate}
                            />
                        </div>
                        <div>
                            <span>Received</span>
                            <strong>{money(renderedPlan.receivedCents)}</strong>
                        </div>
                    </div>
                    <h3 className='section-title'>Received transactions</h3>
                    {renderedPlan.receipts.length > 0 ? (
                        <div className='income-receipt-list'>
                            {renderedPlan.receipts.map((receipt) => (
                                <div
                                    className='income-receipt-row'
                                    key={receipt.id}
                                >
                                    <div className='income-receipt-copy'>
                                        <strong>
                                            +{money(receipt.amountCents)}
                                        </strong>
                                        <span>
                                            {dayLabel(receipt.receivedOn)}
                                        </span>
                                        {receipt.note ? (
                                            <span>{receipt.note}</span>
                                        ) : null}
                                    </div>
                                    <button
                                        className='icon-button income-receipt-delete'
                                        type='button'
                                        aria-label={`Delete ${money(receipt.amountCents)} received on ${dayLabel(receipt.receivedOn)}`}
                                        onClick={() => {
                                            setDeleteTarget({
                                                type: 'receipt',
                                                receipt
                                            });
                                            setDeleteOpen(true);
                                        }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className='income-receipt-empty'>
                            <strong>No income recorded yet</strong>
                            <span>
                                Received transactions for this source will
                                appear here.
                            </span>
                        </div>
                    )}
                    <div className='income-source-delete'>
                        <button
                            className='text-button danger-text'
                            type='button'
                            disabled={renderedPlan.receipts.length > 0}
                            aria-describedby={
                                renderedPlan.receipts.length > 0
                                    ? 'income-source-delete-help'
                                    : undefined
                            }
                            onClick={() => {
                                setDeleteTarget({ type: 'source' });
                                setDeleteOpen(true);
                            }}
                        >
                            <Trash2 size={17} />
                            Delete income source
                        </button>
                        {renderedPlan.receipts.length > 0 ? (
                            <p id='income-source-delete-help'>
                                Delete the received transactions above before
                                deleting this source.
                            </p>
                        ) : null}
                    </div>
                </div>
            </NavigationDetail>
            <Sheet
                open={plan !== null && appearanceOpen}
                onOpenChange={setAppearanceOpen}
                title='Edit appearance'
            >
                <div className='form-grid'>
                    <div className='category-editor-preview'>
                        <CategoryIcon
                            icon={appearanceIcon}
                            tone={appearanceTone}
                            size={22}
                        />
                        <div>
                            <strong>{renderedPlan.name}</strong>
                            <span>Income source preview</span>
                        </div>
                    </div>
                    <IncomeAppearancePicker
                        icon={appearanceIcon}
                        tone={appearanceTone}
                        onIconChange={setAppearanceIcon}
                        onToneChange={setAppearanceTone}
                    />
                    <button
                        className='primary-button primary-button--wide'
                        type='button'
                        disabled={
                            appearanceIcon === renderedPlan.icon &&
                            appearanceTone === renderedPlan.tone
                        }
                        onClick={saveAppearance}
                    >
                        Save appearance
                    </button>
                </div>
            </Sheet>
            {deleteTarget ? (
                <Sheet
                    open={plan !== null && deleteOpen}
                    onOpenChange={setDeleteOpen}
                    onExitComplete={() => {
                        if (!deleteOpen) setDeleteTarget(null);
                    }}
                    title={
                        receiptTarget
                            ? 'Delete received income?'
                            : 'Delete income source?'
                    }
                >
                    {receiptTarget ? (
                        <div className='form-grid'>
                            <p className='confirmation-copy'>
                                {`Delete ${money(receiptTarget.amountCents)} received on ${dayLabel(receiptTarget.receivedOn)}? This will update the month's received-income total.`}
                            </p>
                            <button
                                className='primary-button primary-button--wide danger-button'
                                type='button'
                                onClick={() => deleteReceipt(receiptTarget)}
                            >
                                Delete received income
                            </button>
                            <button
                                className='text-button'
                                type='button'
                                onClick={() => setDeleteOpen(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className='form-grid'>
                            <p className='confirmation-copy'>
                                {`Delete ${renderedPlan.name} from ${snapshot.label}? Its ${money(renderedPlan.expectedCents)} expected amount will be removed from this month's budget.`}
                            </p>
                            <button
                                className='primary-button primary-button--wide danger-button'
                                type='button'
                                onClick={deleteSource}
                            >
                                Delete income source
                            </button>
                            <button
                                className='text-button'
                                type='button'
                                onClick={() => setDeleteOpen(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    )}
                </Sheet>
            ) : null}
        </>
    );
}
