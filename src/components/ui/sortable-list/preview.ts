'use client';

const handleSelector = '[data-sort-long-press]';

function keepHandlePadding(
    source: HTMLElement,
    preview: HTMLElement,
    handle: HTMLElement
) {
    const handles = [
        ...(source.matches(handleSelector) ? [source] : []),
        ...source.querySelectorAll(handleSelector)
    ];
    const copies = [
        ...(preview.matches(handleSelector) ? [preview] : []),
        ...preview.querySelectorAll(handleSelector)
    ];
    const copy = copies[handles.indexOf(handle)];

    if (!(copy instanceof HTMLElement)) return;
    const { paddingBottom, paddingTop } = getComputedStyle(handle);

    Object.assign(copy.style, { paddingBottom, paddingTop });
}

/** Builds the lifted drag copy of `source`, laid out exactly as the row it leaves. */
export function createPreviewOverlay(
    source: HTMLElement,
    handle: HTMLElement,
    overlayLayer: 'base' | 'nested'
) {
    const rect = source.getBoundingClientRect();
    const preview = source.cloneNode(true) as HTMLElement;

    keepHandlePadding(source, preview, handle);
    preview.removeAttribute('id');
    preview.removeAttribute('data-long-press-active');
    preview.removeAttribute('data-long-press-pending');
    preview.removeAttribute('data-settling');
    for (const element of preview.querySelectorAll('[id]'))
        element.removeAttribute('id');
    for (const element of preview.querySelectorAll('[data-settling]'))
        element.removeAttribute('data-settling');
    const overlay = document.createElement('div');

    overlay.className = 'sortable-drag-overlay';
    overlay.dataset.layer = overlayLayer;
    for (const className of source.closest('.category-section')?.classList ??
        [])
        if (className.startsWith('tone-')) overlay.classList.add(className);
    overlay.setAttribute('aria-hidden', 'true');
    overlay.inert = true;
    overlay.append(preview);
    Object.assign(overlay.style, {
        height: `${rect.height}px`,
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        transform: 'translate3d(0, 0, 0) scale(1.012)',
        width: `${rect.width}px`
    });

    return { overlay, rect };
}
