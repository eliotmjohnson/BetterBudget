'use client';

import { useEffect, useRef } from 'react';

interface EdgeTouchState {
    identifier: number;
    startX: number;
    startY: number;
    blocking: boolean;
}

export const leftEdgeGestureWidth = 24;

const directionThreshold = 4;
const diagonalVerticalTolerance = 4;
const interactiveSelector = 'button, input, textarea, select, a';

function findTouch(touches: TouchList, identifier: number) {
    for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index);

        if (touch?.identifier === identifier) return touch;
    }

    return null;
}

export function LeftEdgeGestureGuard() {
    const edgeTouchRef = useRef<EdgeTouchState | null>(null);

    useEffect(() => {
        const startEdgeTouch = (event: TouchEvent) => {
            const touch = event.touches.item(0);
            const target = event.target;

            if (
                event.touches.length !== 1 ||
                !touch ||
                touch.clientX > leftEdgeGestureWidth
            ) {
                edgeTouchRef.current = null;

                return;
            }

            edgeTouchRef.current = {
                identifier: touch.identifier,
                startX: touch.clientX,
                startY: touch.clientY,
                blocking: !(
                    target instanceof Element &&
                    target.closest(interactiveSelector)
                )
            };
            if (edgeTouchRef.current.blocking && event.cancelable)
                event.preventDefault();
        };
        const holdEdgeTouch = (event: TouchEvent) => {
            const edgeTouch = edgeTouchRef.current;

            if (!edgeTouch) return;
            if (event.touches.length !== 1) {
                edgeTouchRef.current = null;

                return;
            }

            const touch = findTouch(event.touches, edgeTouch.identifier);

            if (!touch) {
                edgeTouchRef.current = null;

                return;
            }

            if (!edgeTouch.blocking) {
                const deltaX = touch.clientX - edgeTouch.startX;
                const deltaY = touch.clientY - edgeTouch.startY;

                if (
                    Math.max(Math.abs(deltaX), Math.abs(deltaY)) <
                    directionThreshold
                )
                    return;
                if (
                    deltaX <= 0 ||
                    Math.abs(deltaY) >
                        Math.abs(deltaX) * diagonalVerticalTolerance
                ) {
                    edgeTouchRef.current = null;

                    return;
                }

                edgeTouch.blocking = true;
            }

            if (event.cancelable) event.preventDefault();
        };
        const releaseEdgeTouch = () => {
            edgeTouchRef.current = null;
        };
        const blockingCapture: AddEventListenerOptions = {
            capture: true,
            passive: false
        };
        const passiveCapture: AddEventListenerOptions = {
            capture: true,
            passive: true
        };

        window.addEventListener('touchstart', startEdgeTouch, blockingCapture);
        window.addEventListener('touchmove', holdEdgeTouch, blockingCapture);
        window.addEventListener('touchend', releaseEdgeTouch, passiveCapture);
        window.addEventListener(
            'touchcancel',
            releaseEdgeTouch,
            passiveCapture
        );

        return () => {
            edgeTouchRef.current = null;
            window.removeEventListener(
                'touchstart',
                startEdgeTouch,
                blockingCapture
            );
            window.removeEventListener(
                'touchmove',
                holdEdgeTouch,
                blockingCapture
            );
            window.removeEventListener(
                'touchend',
                releaseEdgeTouch,
                passiveCapture
            );
            window.removeEventListener(
                'touchcancel',
                releaseEdgeTouch,
                passiveCapture
            );
        };
    }, []);

    return null;
}
