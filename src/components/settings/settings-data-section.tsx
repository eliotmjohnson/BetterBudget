'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
    Check,
    ChevronRight,
    Combine,
    Download,
    FileJson,
    RefreshCcw,
    Upload
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Sheet } from '@/components/ui/sheet';

type ImportMode = 'merge' | 'replace';

type ImportResponse =
    | {
          ok: true;
          summary: {
              addedTransactions: number;
              addedReceipts: number;
              addedCategories: number;
              addedItems: number;
          };
      }
    | { ok: false; message: string };

const MODES: {
    mode: ImportMode;
    title: string;
    detail: string;
    Icon: typeof Combine;
}[] = [
    {
        mode: 'merge',
        title: 'Merge',
        detail: 'Add anything missing and keep what is here',
        Icon: Combine
    },
    {
        mode: 'replace',
        title: 'Replace',
        detail: 'Erase this budget and restore the file',
        Icon: RefreshCcw
    }
];
const plural = (count: number, word: string) =>
    `${count} ${word}${count === 1 ? '' : 's'}`;

function importMessage(mode: ImportMode, response: ImportResponse) {
    if (!response.ok) return response.message;
    if (mode === 'replace') return 'Backup restored.';
    const { addedTransactions, addedReceipts, addedCategories, addedItems } =
        response.summary;
    const added = [
        addedTransactions && plural(addedTransactions, 'transaction'),
        addedReceipts && plural(addedReceipts, 'income entry'),
        addedCategories && plural(addedCategories, 'category'),
        addedItems && plural(addedItems, 'budget item')
    ].filter(Boolean);

    return added.length > 0
        ? `Merged ${added.join(', ')}.`
        : 'Everything in that backup was already here.';
}

async function fetchBackupFile() {
    const response = await fetch('/api/backup', { cache: 'no-store' });

    if (!response.ok) throw new Error('export_failed');
    const filename =
        /filename="([^"]+)"/.exec(
            response.headers.get('Content-Disposition') ?? ''
        )?.[1] ?? 'better-budget-backup.json';

    return new File([await response.blob()], filename, {
        type: 'application/json'
    });
}

function downloadFile(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');

    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

const canShareFile = (file: File) =>
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

export function SettingsDataSection({
    onMessage
}: {
    onMessage: (message: string) => void;
}) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importOpen, setImportOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<ImportMode>('merge');
    const [importing, setImporting] = useState(false);
    const [exporting, setExporting] = useState(false);
    const preparedExportRef = useRef<{ file: File; at: number } | null>(null);
    const runExport = async () => {
        const prepared = preparedExportRef.current;
        const fresh = prepared && Date.now() - prepared.at < 60_000;

        preparedExportRef.current = null;
        setExporting(true);
        try {
            const file = fresh ? prepared.file : await fetchBackupFile();

            if (!canShareFile(file)) {
                downloadFile(file);

                return;
            }
            try {
                await navigator.share({ files: [file] });
            } catch (error) {
                if (!(error instanceof DOMException)) throw error;
                if (error.name !== 'NotAllowedError') return;
                preparedExportRef.current = { file, at: Date.now() };
                onMessage('Backup ready. Tap Export backup again to save it.');
            }
        } catch {
            onMessage('The backup could not be exported. Try again.');
        } finally {
            setExporting(false);
        }
    };
    const runImport = async () => {
        if (!file) return;
        setImporting(true);
        try {
            const response = await fetch(`/api/backup?mode=${mode}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: await file.text()
            });
            const result = (await response
                .json()
                .catch(() => null)) as ImportResponse | null;

            onMessage(
                importMessage(
                    mode,
                    result ?? {
                        ok: false,
                        message: 'That backup could not be imported.'
                    }
                )
            );
            if (!result?.ok) return;
            setImportOpen(false);
            setFile(null);
            await queryClient.invalidateQueries({
                queryKey: ['budget-snapshot']
            });
            router.refresh();
        } catch {
            onMessage('Connect to the internet to import a backup.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <>
            <h2 className='settings-section-title'>Data</h2>
            <div className='settings-list'>
                <button
                    className='settings-row'
                    type='button'
                    disabled={exporting}
                    aria-busy={exporting}
                    onClick={runExport}
                >
                    <Download size={20} />
                    <span>
                        <strong>Export backup</strong>
                        <small>
                            {exporting
                                ? 'Preparing backup…'
                                : 'Save every month as a JSON file'}
                        </small>
                    </span>
                    <ChevronRight size={18} />
                </button>
                <button
                    className='settings-row'
                    type='button'
                    onClick={() => setImportOpen(true)}
                >
                    <Upload size={20} />
                    <span>
                        <strong>Import backup</strong>
                        <small>Merge or restore from a backup file</small>
                    </span>
                    <ChevronRight size={18} />
                </button>
            </div>
            <Sheet
                open={importOpen}
                onOpenChange={(open) => {
                    setImportOpen(open);
                    if (!open) setFile(null);
                }}
                title='Import backup'
            >
                <div className='form-grid'>
                    <input
                        ref={fileInputRef}
                        hidden
                        type='file'
                        accept='application/json,.json'
                        onChange={(event) => {
                            setFile(event.target.files?.[0] ?? null);
                            event.target.value = '';
                        }}
                    />
                    <div className='settings-list'>
                        <button
                            className='settings-row'
                            type='button'
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <FileJson size={20} />
                            <span>
                                <strong>
                                    {file ? file.name : 'Choose backup file'}
                                </strong>
                                <small>
                                    {file
                                        ? 'Tap to choose a different file'
                                        : 'A .json file exported from Better Budget'}
                                </small>
                            </span>
                            <ChevronRight size={18} />
                        </button>
                    </div>
                    <div
                        className='settings-list'
                        role='group'
                        aria-label='Import mode'
                    >
                        {MODES.map(({ mode: option, title, detail, Icon }) => (
                            <button
                                key={option}
                                className='settings-row'
                                type='button'
                                aria-pressed={mode === option}
                                onClick={() => setMode(option)}
                            >
                                <Icon size={20} />
                                <span>
                                    <strong>{title}</strong>
                                    <small>{detail}</small>
                                </span>
                                <span
                                    className='settings-selection-indicator'
                                    aria-hidden='true'
                                >
                                    {mode === option ? (
                                        <Check size={19} strokeWidth={2.4} />
                                    ) : null}
                                </span>
                            </button>
                        ))}
                    </div>
                    {mode === 'replace' ? (
                        <p className='confirmation-copy'>
                            Every month, transaction, and income entry here is
                            permanently replaced by the backup.
                        </p>
                    ) : null}
                    <button
                        className={`primary-button primary-button--wide ${mode === 'replace' ? 'danger-button' : ''}`}
                        type='button'
                        disabled={!file || importing}
                        onClick={runImport}
                    >
                        {importing
                            ? 'Importing…'
                            : mode === 'replace'
                              ? 'Replace all data'
                              : 'Merge backup'}
                    </button>
                </div>
            </Sheet>
        </>
    );
}
