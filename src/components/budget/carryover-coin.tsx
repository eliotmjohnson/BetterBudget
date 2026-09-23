import { useId } from 'react';
import {
    brandCoinDollarCurve,
    brandCoinDollarStem
} from '@/components/brand-mark';

export function CarryoverCoin() {
    const gradientId = `${useId().replaceAll(':', '')}-carryover-coin`;

    return (
        <svg
            className='carryover-coin'
            viewBox='582 548 320 320'
            aria-hidden='true'
        >
            <defs>
                <linearGradient id={gradientId} x1='0' y1='0' x2='0' y2='1'>
                    <stop stopColor='#0F5BEA' />
                    <stop offset='1' stopColor='#2875F7' />
                </linearGradient>
            </defs>
            <circle
                cx='742'
                cy='708'
                r='145'
                fill={`url(#${gradientId})`}
                stroke='#FFFFFF'
                strokeWidth='30'
            />
            <path
                d={brandCoinDollarCurve}
                fill='none'
                stroke='#FFFFFF'
                strokeWidth='32'
                strokeLinecap='round'
                strokeLinejoin='round'
            />
            <path
                d={brandCoinDollarStem}
                fill='none'
                stroke='#FFFFFF'
                strokeWidth='28'
                strokeLinecap='round'
            />
        </svg>
    );
}
