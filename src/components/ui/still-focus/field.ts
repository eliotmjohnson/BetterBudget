export type StillField = HTMLInputElement | HTMLTextAreaElement;

export function isStillField(
    element: Element | null | undefined
): element is StillField {
    return (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
    );
}
