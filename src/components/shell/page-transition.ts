'use client';

import { useLayoutEffect, type RefObject } from 'react';
import type { MonthKey } from '@/domain/money';
import type { AppView } from './app-shell';
import {
    captureMonthSlide,
    discardMonthSlide,
    hasMonthSlideCapture,
    playMonthSlide
} from './month-slide';

const navigation = {
    // Route changes remount the shell, so the navigation that produced the
    // current view is tracked outside React state to survive that remount.
    fromArrow: false,
    view: null as AppView | null,
    monthKey: null as MonthKey | null
};

export function beginArrowMonthChange(monthKey: MonthKey) {
    navigation.fromArrow = true;
    captureMonthSlide(monthKey);
}

export function beginPickerMonthChange() {
    navigation.fromArrow = false;
    discardMonthSlide();
}

export function usePageTransition(
    contentRef: RefObject<HTMLDivElement | null>,
    view: AppView,
    monthKey: MonthKey
) {
    useLayoutEffect(() => {
        const content = contentRef.current;
        const {
            fromArrow,
            view: fromView,
            monthKey: fromMonthKey
        } = navigation;

        navigation.view = view;
        navigation.monthKey = monthKey;
        if (!content || fromView === null || fromMonthKey === null) return;
        if (fromView === view && fromMonthKey === monthKey) return;
        if (fromView !== view) {
            discardMonthSlide();

            return;
        }
        if (view === 'settings') {
            content.classList.remove('app-content--enter');
            discardMonthSlide();

            return;
        }
        if (!fromArrow || !hasMonthSlideCapture(fromMonthKey)) {
            discardMonthSlide();

            return;
        }

        const direction = monthKey > fromMonthKey ? 'forward' : 'back';

        content.classList.remove('app-content--enter');
        content.classList.add(`app-content--slide-${direction}`);
        playMonthSlide(direction, fromMonthKey);
    }, [contentRef, view, monthKey]);
}
