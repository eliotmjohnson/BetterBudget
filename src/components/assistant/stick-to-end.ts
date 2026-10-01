const END_SLACK_PX = 2;
const GLIDE_MS = 360;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function restsOnEnd(body: HTMLElement) {
    return (
        body.scrollTop > 0 &&
        body.scrollTop >= body.scrollHeight - body.clientHeight - END_SLACK_PX
    );
}

/**
 * Keeps the chat's `body` on its latest message while it gets shorter, as it
 * does when the on-screen keyboard opens and the sheet's body comes to end at
 * the keyboard's top edge, as long as it was resting on that message. Rather
 * than holding the end at once, which moved the messages up as fast as the
 * keyboard, it glides to the end over `GLIDE_MS`, a little quicker than the
 * sheet's own 440 ms rise, re-reading the end each frame because the body is still
 * shrinking, so the newest message slides in behind the composer riding on
 * the keyboard. A touch on the body stops the glide. A body left scrolled up
 * the conversation, or one whose content fits, is left where it is, and
 * nothing happens as it lengthens again, which the sheet's own keyboard fit
 * settles. Returns a function that stops it.
 */
export function stickToEnd(body: HTMLElement) {
    let height = body.clientHeight;
    let onEnd = restsOnEnd(body);
    let frame = 0;
    let gliding = false;
    const note = () => {
        if (!gliding) onEnd = restsOnEnd(body);
    };
    const stopGlide = () => {
        cancelAnimationFrame(frame);
        gliding = false;
        onEnd = restsOnEnd(body);
    };
    const glide = () => {
        const from = body.scrollTop;
        const startedAt = performance.now();
        const step = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / GLIDE_MS);
            const end = body.scrollHeight - body.clientHeight;

            body.scrollTop = from + (end - from) * easeOutCubic(progress);
            if (progress < 1) frame = requestAnimationFrame(step);
            else stopGlide();
        };

        gliding = true;
        frame = requestAnimationFrame(step);
    };
    const observer = new ResizeObserver(() => {
        const shrank = body.clientHeight < height;

        height = body.clientHeight;
        if (shrank && onEnd && !gliding) glide();
    });

    body.addEventListener('scroll', note, { passive: true });
    body.addEventListener('touchstart', stopGlide, { passive: true });
    observer.observe(body);

    return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        body.removeEventListener('scroll', note);
        body.removeEventListener('touchstart', stopGlide);
    };
}
