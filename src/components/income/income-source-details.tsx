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
    IncomeOneTimeSwitch,
    incomeIconValue,
    type IncomeIconValue
} from './income-fields';
import { EditIncomeReceipt } from './income-forms';
import { IncomeReceiptList, receiptDayLabel } from './income-receipt-list';

function sourceDeleteCopy(plan: IncomePlanView, monthLabel: string) {
    const count = plan.receipts.length;
    const receipts =
        count === 0
            ? ''
            : count === 1
              ? ` Its ${money(plan.receivedCents)} received transaction will be deleted too.`
              : ` All ${count} of its received transactions, totaling ${money(plan.receivedCents)}, will be deleted too.`;

    return `Delete ${plan.name} from ${monthLabel}? Its ${money(plan.expectedCents)} expected amount will be removed from this month's budget.${receipts}`;
}

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
    const [editingReceipt, setEditingReceipt] =
        useState<IncomeReceiptView | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [appearanceOpen, setAppearanceOpen] = useState(false);
    const [appearanceIcon, setAppearanceIcon] =
        useState<IncomeIconValue>('wallet');
    const [appearanceTone, setAppearanceTone] = useState<CategoryTone>('mint');
    const [appearanceVersion, setAppearanceVersion] = useState(0);
    const [previousPlan, setPreviousPlan] = useState<IncomePlanView | null>(
        plan
    );
    const [renderedPlan, setRenderedPlan] = useState<IncomePlanView | null>(
        plan
    );

    if (plan !== previousPlan) {
        setPreviousPlan(plan);
        if (plan?.id !== previousPlan?.id) {
            setDeleteOpen(false);
            setEditOpen(false);
            setAppearanceOpen(false);
        }
        if (plan) setRenderedPlan(plan);
    }

    if (!renderedPlan) return null;
    const close = () => {
        setDeleteOpen(false);
        setEditOpen(false);
        setAppearanceOpen(false);
        onOpenChange(false);
    };
    const openAppearance = () => {
        setAppearanceIcon(incomeIconValue(renderedPlan.icon));
        setAppearanceTone(renderedPlan.tone);
        setAppearanceVersion(renderedPlan.version);
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
                expectedVersion: appearanceVersion,
                name: renderedPlan.name,
                icon: appearanceIcon,
                tone: appearanceTone,
                expectedCents: renderedPlan.expectedCents,
                oneTime: renderedPlan.oneTime
            });
        setAppearanceOpen(false);
    };
    const changeOneTime = (oneTime: boolean) =>
        mutate({
            type: 'updateIncomePlan',
            clientMutationId: createUuid(),
            monthKey: snapshot.monthKey,
            incomePlanId: renderedPlan.id,
            expectedVersion: renderedPlan.version,
            name: renderedPlan.name,
            icon: incomeIconValue(renderedPlan.icon),
            tone: renderedPlan.tone,
            expectedCents: renderedPlan.expectedCents,
            oneTime
        });
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
            expectedVersion: renderedPlan.version,
            receiptIds: renderedPlan.receipts.map((receipt) => receipt.id)
        });
        close();
    };
    const pendingSource = [
        renderedPlan.id,
        ...renderedPlan.receipts.map((receipt) => receipt.id)
    ].some((id) => id.startsWith('optimistic-'));
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
                                key={renderedPlan.id}
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
                    <IncomeOneTimeSwitch
                        checked={renderedPlan.oneTime}
                        monthKey={snapshot.monthKey}
                        onCheckedChange={changeOneTime}
                    />
                    <h3 className='section-title'>Received transactions</h3>
                    {renderedPlan.receipts.length > 0 ? (
                        <IncomeReceiptList
                            plan={renderedPlan}
                            snapshot={snapshot}
                            mutate={mutate}
                            onDelete={(receipt) => {
                                setDeleteTarget({ type: 'receipt', receipt });
                                setDeleteOpen(true);
                            }}
                            onEdit={(receipt) => {
                                setEditingReceipt(receipt);
                                setEditOpen(true);
                            }}
                        />
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
                            disabled={pendingSource}
                            onClick={() => {
                                setDeleteTarget({ type: 'source' });
                                setDeleteOpen(true);
                            }}
                        >
                            <Trash2 size={17} />
                            Delete income source
                        </button>
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
            <EditIncomeReceipt
                open={plan !== null && editOpen}
                plan={renderedPlan}
                receipt={editingReceipt}
                snapshot={snapshot}
                mutate={mutate}
                onOpenChange={setEditOpen}
                onExitComplete={() => {
                    if (!editOpen) setEditingReceipt(null);
                }}
            />
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
                                {`Delete ${money(receiptTarget.amountCents)} received on ${receiptDayLabel(receiptTarget.receivedOn)}? This will update the month's received-income total.`}
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
                                {sourceDeleteCopy(renderedPlan, snapshot.label)}
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
