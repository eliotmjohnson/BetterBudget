import { useId } from 'react';
import { cn } from '@/lib/utils';

export function BrandMark({
    compact = false,
    className
}: {
    compact?: boolean;
    className?: string;
}) {
    const gradientId = useId().replaceAll(':', '');

    return (
        <span
            className={cn(
                'brand-lockup',
                compact && 'brand-lockup--compact',
                className
            )}
            aria-label='Better Budget'
        >
            <svg
                className='brand-symbol'
                viewBox='100 100 824 824'
                aria-hidden='true'
            >
                <defs>
                    <linearGradient
                        id={`${gradientId}-green`}
                        x1='231'
                        y1='405'
                        x2='231'
                        y2='821'
                        gradientUnits='userSpaceOnUse'
                    >
                        <stop stopColor='#4ECC91' />
                        <stop offset='1' stopColor='#63DCA8' />
                    </linearGradient>
                    <linearGradient
                        id={`${gradientId}-sky`}
                        x1='435'
                        y1='284'
                        x2='435'
                        y2='827'
                        gradientUnits='userSpaceOnUse'
                    >
                        <stop stopColor='#65A2F3' />
                        <stop offset='1' stopColor='#9FC0FF' />
                    </linearGradient>
                    <linearGradient
                        id={`${gradientId}-blue`}
                        x1='724'
                        y1='158'
                        x2='724'
                        y2='853'
                        gradientUnits='userSpaceOnUse'
                    >
                        <stop stopColor='#0F5BEA' />
                        <stop offset='1' stopColor='#2875F7' />
                    </linearGradient>
                </defs>
                <rect
                    x='160'
                    y='405'
                    width='142'
                    height='416'
                    rx='71'
                    fill={`url(#${gradientId}-green)`}
                />
                <rect
                    x='360'
                    y='284'
                    width='150'
                    height='543'
                    rx='75'
                    fill={`url(#${gradientId}-sky)`}
                />
                <rect
                    x='582'
                    y='158'
                    width='162'
                    height='580'
                    rx='81'
                    fill={`url(#${gradientId}-blue)`}
                />
                <circle
                    cx='742'
                    cy='708'
                    r='145'
                    fill={`url(#${gradientId}-blue)`}
                    stroke='#FFFFFF'
                    strokeWidth='30'
                />
                <path
                    d='M779 658c-15-14-50-17-71-3-23 16-16 39 9 47l43 12c29 8 34 31 13 48-22 17-59 13-78-2'
                    fill='none'
                    stroke='#FFFFFF'
                    strokeWidth='27'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                />
                <path
                    d='M742 638v140'
                    fill='none'
                    stroke='#FFFFFF'
                    strokeWidth='23'
                    strokeLinecap='round'
                />
            </svg>
            {compact ? null : (
                <span className='brand-wordmark'>Better Budget</span>
            )}
        </span>
    );
}
