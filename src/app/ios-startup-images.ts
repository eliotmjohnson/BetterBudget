import viewports from './ios-startup-viewports.json';

function startupImageMedia(
    width: number,
    height: number,
    pixelRatio: number,
    orientation: 'landscape' | 'portrait'
) {
    return [
        'screen',
        `(device-width: ${width}px)`,
        `(device-height: ${height}px)`,
        `(-webkit-device-pixel-ratio: ${pixelRatio})`,
        `(orientation: ${orientation})`
    ].join(' and ');
}

export const iosStartupImages = viewports.flatMap(
    ({ width, height, pixelRatio }) => {
        const portraitWidth = width * pixelRatio;
        const portraitHeight = height * pixelRatio;

        return [
            {
                url: `/ios-startup/launch-${portraitWidth}x${portraitHeight}.png`,
                media: startupImageMedia(width, height, pixelRatio, 'portrait')
            },
            {
                url: `/ios-startup/launch-${portraitHeight}x${portraitWidth}.png`,
                media: startupImageMedia(width, height, pixelRatio, 'landscape')
            }
        ];
    }
);
