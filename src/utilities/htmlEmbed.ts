import { App, FileSystemAdapter, TFile, normalizePath } from 'obsidian';
import { pathExists, readFile } from 'fs-extra';
import { dirname, extname, isAbsolute, join } from 'path';
import { fileURLToPath } from 'url';
import { MarpSlidesSettings } from './settings';

const IMAGE_MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.webp': 'image/webp',
	'.bmp': 'image/bmp',
};

interface MarkdownDestination {
	target: string;
	build: (replacement: string) => string;
}

interface EmbeddedImage {
	buffer: Buffer;
	mimeType: string;
}

export async function embedHTMLImages(html: string, sourceFile: TFile, app: App, settings: MarpSlidesSettings): Promise<string> {
	let processedHTML = await replaceAsync(html, /(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)(\2)/gi, async (match, prefix, quote, target, suffix) => {
		const replacement = await getEmbeddedImageDataURI(target, sourceFile, app, settings);
		return replacement ? `${prefix}${quote}${replacement}${suffix}` : match;
	});

	processedHTML = await replaceAsync(processedHTML, /url\(\s*(["']?)([^"')]+)\1\s*\)/gi, async (match, quote, target) => {
		const replacement = await getEmbeddedImageDataURI(target, sourceFile, app, settings);
		return replacement ? `url(${quote}${replacement}${quote})` : match;
	});

	return processedHTML;
}

export function appendMobileTouchNavigation(html: string): string {
	const marker = 'marp-slides-mobile-touch-navigation';

	if (html.includes(marker)) {
		return html;
	}

	const mobileNavigation = `<style id="${marker}">
html, body {
  touch-action: pan-y pinch-zoom;
  -webkit-overflow-scrolling: touch;
}
</style>
<script id="${marker}-script">
(() => {
  let touchStartY = null;
  document.addEventListener('touchstart', (event) => {
    if (event.touches.length === 1) touchStartY = event.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', (event) => {
    if (touchStartY === null || event.changedTouches.length !== 1) return;
    const deltaY = touchStartY - event.changedTouches[0].clientY;
    touchStartY = null;
    if (Math.abs(deltaY) < 40) return;
    const key = deltaY > 0 ? 'ArrowDown' : 'ArrowUp';
    const code = deltaY > 0 ? 'ArrowDown' : 'ArrowUp';
    document.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: deltaY > 0 ? 100 : -100, bubbles: true, cancelable: true }));
  }, { passive: true });
})();
</script>`;

	if (html.includes('</body>')) {
		return html.replace('</body>', `${mobileNavigation}</body>`);
	}

	return `${html}${mobileNavigation}`;
}

async function getEmbeddedImageDataURI(target: string, sourceFile: TFile, app: App, settings: MarpSlidesSettings): Promise<string | null> {
	if (shouldSkipImageTarget(target)) {
		return null;
	}

	const imagePath = await resolveLocalImagePath(target, sourceFile, app);

	if (!imagePath) {
		return null;
	}

	const embeddedImage = await readEmbeddedImage(imagePath, settings);

	if (!embeddedImage) {
		return null;
	}

	return `data:${embeddedImage.mimeType};base64,${embeddedImage.buffer.toString('base64')}`;
}

async function replaceAsync(source: string, regex: RegExp, replacer: (...args: string[]) => Promise<string>): Promise<string> {
	const replacements = await Promise.all([...source.matchAll(regex)].map((match) => replacer(...match)));
	let replacementIndex = 0;
	return source.replace(regex, () => replacements[replacementIndex++]);
}

export async function embedMarkdownImages(markdown: string, sourceFile: TFile, app: App, settings: MarpSlidesSettings): Promise<string> {
	return transformMarkdownImageDestinations(markdown, async (rawDestination) => {
		const destination = parseMarkdownDestination(rawDestination);

		if (!destination || shouldSkipImageTarget(destination.target)) {
			return null;
		}

		const imagePath = await resolveLocalImagePath(destination.target, sourceFile, app);

		if (!imagePath) {
			return null;
		}

		const embeddedImage = await readEmbeddedImage(imagePath, settings);

		if (!embeddedImage) {
			return null;
		}

		return destination.build(`data:${embeddedImage.mimeType};base64,${embeddedImage.buffer.toString('base64')}`);
	});
}

export async function transformMarkdownImageDestinations(
	markdown: string,
	transformDestination: (rawDestination: string) => Promise<string | null>
): Promise<string> {
	let inFence = false;
	const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || [];

	if (lines[lines.length - 1] === '') {
		lines.pop();
	}

	const transformedLines: string[] = [];

	for (const lineWithEnding of lines) {
		const endingMatch = lineWithEnding.match(/(\r\n|\n|\r)$/);
		const ending = endingMatch ? endingMatch[0] : '';
		const line = ending ? lineWithEnding.slice(0, -ending.length) : lineWithEnding;
		const isFence = /^(```|~~~)/.test(line.trim());

		if (isFence) {
			inFence = !inFence;
			transformedLines.push(lineWithEnding);
			continue;
		}

		if (inFence) {
			transformedLines.push(lineWithEnding);
			continue;
		}

		transformedLines.push(`${await transformMarkdownImageDestinationsInLine(line, transformDestination)}${ending}`);
	}

	return transformedLines.join('');
}

async function transformMarkdownImageDestinationsInLine(
	line: string,
	transformDestination: (rawDestination: string) => Promise<string | null>
): Promise<string> {
	const imageRegex = /!\[[^\]\n]*\]\(([^)\n]+)\)/g;
	let result = '';
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = imageRegex.exec(line)) !== null) {
		const fullMatch = match[0];
		const rawDestination = match[1];
		const transformedDestination = await transformDestination(rawDestination);
		let replacement = fullMatch;

		if (transformedDestination) {
			const destinationIndex = fullMatch.lastIndexOf(rawDestination);
			replacement = `${fullMatch.slice(0, destinationIndex)}${transformedDestination}${fullMatch.slice(destinationIndex + rawDestination.length)}`;
		}

		result += `${line.slice(lastIndex, match.index)}${replacement}`;
		lastIndex = match.index + fullMatch.length;
	}

	return `${result}${line.slice(lastIndex)}`;
}

function parseMarkdownDestination(rawDestination: string): MarkdownDestination | null {
	const leadingWhitespaceLength = rawDestination.length - rawDestination.trimStart().length;
	const trailingWhitespaceLength = rawDestination.length - rawDestination.trimEnd().length;
	const leadingWhitespace = rawDestination.slice(0, leadingWhitespaceLength);
	const trailingWhitespace = trailingWhitespaceLength > 0 ? rawDestination.slice(-trailingWhitespaceLength) : '';
	const trimmed = rawDestination.trim();

	if (trimmed.startsWith('<')) {
		const closingIndex = trimmed.indexOf('>');

		if (closingIndex <= 1) {
			return null;
		}

		const target = trimmed.slice(1, closingIndex);
		const suffix = trimmed.slice(closingIndex + 1);
		return {
			target,
			build: (replacement) => `${leadingWhitespace}<${replacement}>${suffix}${trailingWhitespace}`,
		};
	}

	const titledDestination = trimmed.match(/^(\S+)(\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))$/);

	if (titledDestination) {
		return {
			target: titledDestination[1],
			build: (replacement) => `${leadingWhitespace}${replacement}${titledDestination[2]}${trailingWhitespace}`,
		};
	}

	if (trimmed === '') {
		return null;
	}

	return {
		target: trimmed,
		build: (replacement) => `${leadingWhitespace}${replacement}${trailingWhitespace}`,
	};
}

function shouldSkipImageTarget(target: string): boolean {
	const normalizedTarget = target.trim().toLowerCase();

	if (normalizedTarget === '' || normalizedTarget.startsWith('#')) {
		return true;
	}

	if (/^file:/i.test(normalizedTarget)) {
		return false;
	}

	if (/^[a-z][a-z0-9+.-]*:/i.test(normalizedTarget) && !/^[a-z]:[\\/]/i.test(normalizedTarget)) {
		return true;
	}

	return false;
}

async function resolveLocalImagePath(target: string, sourceFile: TFile, app: App): Promise<string | null> {
	const decodedTarget = decodeImageTarget(target);
	let fileSystemTarget = decodedTarget.split(/[?#]/)[0];

	if (/^file:/i.test(fileSystemTarget)) {
		try {
			fileSystemTarget = fileURLToPath(fileSystemTarget);
		} catch {
			return null;
		}
	}

	const extension = extname(fileSystemTarget).toLowerCase();

	if (!IMAGE_MIME_TYPES[extension]) {
		return null;
	}

	const adapter = app.vault.adapter as FileSystemAdapter;
	const basePath = adapter.getBasePath();
	const sourceFolder = sourceFile.parent?.path || dirname(sourceFile.path);
	const candidates: string[] = [];
	const isFileSystemAbsolutePath = isAbsolute(fileSystemTarget) || /^[a-z]:[\\/]/i.test(fileSystemTarget);

	if (isFileSystemAbsolutePath) {
		candidates.push(fileSystemTarget);
	} else if (!fileSystemTarget.startsWith('/')) {
		candidates.push(join(basePath, sourceFolder, fileSystemTarget));
	}

	const vaultRelativeTarget = normalizePath(fileSystemTarget).replace(/^\/+/, '');
	candidates.push(join(basePath, vaultRelativeTarget));

	const linkedFile = app.metadataCache.getFirstLinkpathDest(fileSystemTarget, sourceFile.path);
	if (linkedFile) {
		candidates.push(join(basePath, linkedFile.path));
	}

	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return null;
}

function decodeImageTarget(target: string): string {
	try {
		return decodeURIComponent(target);
	} catch {
		return target;
	}
}

async function readEmbeddedImage(imagePath: string, settings: MarpSlidesSettings): Promise<EmbeddedImage | null> {
	const extension = extname(imagePath).toLowerCase();
	const mimeType = IMAGE_MIME_TYPES[extension];

	if (!mimeType) {
		return null;
	}

	const buffer = await readFile(imagePath);
	const convertedImage = await maybeConvertToWebP(buffer, mimeType, settings);
	return convertedImage || { buffer, mimeType };
}

async function maybeConvertToWebP(buffer: Buffer, mimeType: string, settings: MarpSlidesSettings): Promise<EmbeddedImage | null> {
	if (!settings.EmbeddedHTMLConvertImagesToWebP || !['image/png', 'image/jpeg'].includes(mimeType)) {
		return null;
	}

	const thresholdBytes = settings.EmbeddedHTMLWebPThresholdKB * 1024;

	if (buffer.length < thresholdBytes) {
		return null;
	}

	const webpBuffer = await convertImageBufferToWebP(buffer, mimeType, settings.EmbeddedHTMLWebPQuality);

	if (!webpBuffer || webpBuffer.length >= buffer.length) {
		return null;
	}

	return {
		buffer: webpBuffer,
		mimeType: 'image/webp',
	};
}

async function convertImageBufferToWebP(buffer: Buffer, mimeType: string, quality: number): Promise<Buffer | null> {
	if (typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof Image === 'undefined' || typeof document === 'undefined') {
		return null;
	}

	const blob = new Blob([buffer as unknown as BlobPart], { type: mimeType });
	const objectUrl = URL.createObjectURL(blob);

	try {
		const image = await loadImage(objectUrl);

		if (!image.naturalWidth || !image.naturalHeight) {
			return null;
		}

		const canvas = document.createElement('canvas');
		canvas.width = image.naturalWidth;
		canvas.height = image.naturalHeight;
		const context = canvas.getContext('2d');

		if (!context) {
			return null;
		}

		context.drawImage(image, 0, 0);
		const webpBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));

		if (!webpBlob) {
			return null;
		}

		const arrayBuffer = await webpBlob.arrayBuffer();
		return Buffer.from(arrayBuffer);
	} catch {
		return null;
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}

function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error('Failed to load image'));
		image.src = url;
	});
}
