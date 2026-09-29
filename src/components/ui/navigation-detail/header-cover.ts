'use client';

/**
 * Marks the detail while its body is scrolled away from the top, which is
 * when content can pass beneath the header, so the stylesheet lets the drawn
 * header bar take pointers only then. At the top the expanded title stays
 * transparent to touches, and a drag that starts on it still scrolls the body.
 * Returns the teardown.
 */
export function setupHeaderCover(
    body: HTMLElement | null,
    content: HTMLElement | null
) {
    if (!body || !content) return;

    const update = () =>
        content.toggleAttribute(
            'data-navigation-detail-scrolled',
            body.scrollTop > 0
        );

    body.addEventListener('scroll', update, { passive: true });
    update();

    return () => {
        body.removeEventListener('scroll', update);
        content.removeAttribute('data-navigation-detail-scrolled');
    };
}
