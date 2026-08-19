import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(projectDirectory, 'public', 'ios-startup');
const iconPath = path.join(
    projectDirectory,
    'public',
    'better-budget-icon-512-v3.png'
);
const viewportPath = path.join(
    projectDirectory,
    'src',
    'app',
    'ios-startup-viewports.json'
);

function escapeXml(value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function launchImageSvg(width, height, pixelRatio, iconDataUrl) {
    const logicalWidth = width / pixelRatio;
    const logicalHeight = height / pixelRatio;
    const isLandscape = logicalWidth > logicalHeight;
    const iconSize = Math.min(
        logicalWidth * (isLandscape ? 0.2 : 0.42),
        isLandscape ? 124 : 168
    );
    const fontSize = Math.min(
        Math.max(logicalWidth * (isLandscape ? 0.044 : 0.105), 34),
        isLandscape ? 38 : 44
    );
    const gap = isLandscape ? 10 : 16;
    const titleHeight = fontSize * 1.15;
    const groupHeight = iconSize + gap + titleHeight;
    const groupCenter = logicalHeight * (isLandscape ? 0.49 : 0.44);
    const groupTop = groupCenter - groupHeight / 2;
    const iconX = (logicalWidth - iconSize) / 2;
    const titleBaseline = groupTop + iconSize + gap + fontSize * 0.88;
    const title = escapeXml('Better Budget');

    return `
        <svg xmlns="http://www.w3.org/2000/svg"
            width="${width}" height="${height}"
            viewBox="0 0 ${logicalWidth} ${logicalHeight}">
            <rect width="100%" height="100%" fill="#ffffff"/>
            <image href="${iconDataUrl}" x="${iconX}" y="${groupTop}"
                width="${iconSize}" height="${iconSize}"/>
            <text x="50%" y="${titleBaseline}" text-anchor="middle"
                fill="#15191f" font-family="SF Pro Display, Helvetica Neue, Arial, sans-serif"
                font-size="${fontSize}" font-weight="800"
                letter-spacing="-1.7">${title}</text>
        </svg>
    `;
}

async function generateLaunchImage(width, height, pixelRatio, iconDataUrl) {
    const filename = `launch-${width}x${height}.png`;
    const outputPath = path.join(outputDirectory, filename);
    const svg = launchImageSvg(width, height, pixelRatio, iconDataUrl);

    await sharp(Buffer.from(svg))
        .png({ compressionLevel: 9, palette: true, quality: 100 })
        .toFile(outputPath);
}

async function main() {
    const [icon, viewportJson] = await Promise.all([
        readFile(iconPath),
        readFile(viewportPath, 'utf8')
    ]);
    const iconDataUrl = `data:image/png;base64,${icon.toString('base64')}`;
    const viewports = JSON.parse(viewportJson);
    const images = new Map();

    for (const { width, height, pixelRatio } of viewports) {
        const portraitWidth = width * pixelRatio;
        const portraitHeight = height * pixelRatio;

        images.set(`${portraitWidth}x${portraitHeight}`, {
            width: portraitWidth,
            height: portraitHeight,
            pixelRatio
        });
        images.set(`${portraitHeight}x${portraitWidth}`, {
            width: portraitHeight,
            height: portraitWidth,
            pixelRatio
        });
    }

    await mkdir(outputDirectory, { recursive: true });
    await Promise.all(
        [...images.values()].map(({ width, height, pixelRatio }) =>
            generateLaunchImage(width, height, pixelRatio, iconDataUrl)
        )
    );
}

await main();
