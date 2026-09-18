export function announce(message: string, anchor: Element) {
    const root = anchor.closest('[role="dialog"]') ?? document.body;
    let region = root.querySelector<HTMLElement>(':scope > .live-announcer');

    if (!region) {
        region = document.createElement('div');
        region.className = 'live-announcer';
        region.setAttribute('role', 'status');
        region.setAttribute('aria-live', 'polite');
        root.append(region);
    }
    const target = region;

    target.textContent = '';
    window.requestAnimationFrame(() => {
        target.textContent = message;
    });
}
