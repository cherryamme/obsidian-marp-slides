import { App, TFile } from 'obsidian';
import { mkdtempSync, mkdirpSync, removeSync, writeFileSync } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendMobileTouchNavigation, appendPresentationAnnotations, embedHTMLImages, embedMarkdownImages, resolveMarkdownImageResourcePaths } from '../src/utilities/htmlEmbed';
import { DEFAULT_SETTINGS } from '../src/utilities/settings';

function createFakeApp(basePath: string): App {
	return {
		vault: {
			adapter: {
				getBasePath: () => basePath,
				getResourcePath: (path: string) => `app://local/${path}`,
			},
		},
		metadataCache: {
			getFirstLinkpathDest: () => null,
		},
	} as unknown as App;
}

function createFakeSourceFile(path: string, parentPath: string): TFile {
	return {
		path,
		parent: {
			path: parentPath,
		},
	} as unknown as TFile;
}

describe('embedMarkdownImages', () => {
	let tempDir: string;
	let app: App;
	let sourceFile: TFile;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'marp-html-embed-'));
		mkdirpSync(join(tempDir, 'slides', 'images'));
		app = createFakeApp(tempDir);
		sourceFile = createFakeSourceFile('slides/deck.md', 'slides');
	});

	afterEach(() => {
		removeSync(tempDir);
	});

	test('embeds a local image as a data URI', async () => {
		writeFileSync(join(tempDir, 'slides', 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

		const result = await embedMarkdownImages('![logo](images/logo.svg)', sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toContain('![logo](data:image/svg+xml;base64,');
		expect(result).not.toContain('images/logo.svg');
	});

	test('embeds a local image path that contains spaces', async () => {
		writeFileSync(join(tempDir, 'slides', 'images', 'my logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

		const result = await embedMarkdownImages('![logo](images/my logo.svg)', sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toContain('![logo](data:image/svg+xml;base64,');
	});

	test('skips remote and existing data URLs', async () => {
		const markdown = '![remote](https://example.com/logo.png)\n![inline](data:image/png;base64,abc)';

		const result = await embedMarkdownImages(markdown, sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toBe(markdown);
	});

	test('skips image syntax inside fenced code blocks', async () => {
		writeFileSync(join(tempDir, 'slides', 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
		const markdown = '```\n![logo](images/logo.svg)\n```\n![logo](images/logo.svg)';

		const result = await embedMarkdownImages(markdown, sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toContain('```\n![logo](images/logo.svg)\n```');
		expect(result).toContain('![logo](data:image/svg+xml;base64,');
	});

	test('leaves missing local images unchanged', async () => {
		const markdown = '![missing](images/missing.svg)';

		const result = await embedMarkdownImages(markdown, sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toBe(markdown);
	});

	test('falls back to the original image when WebP conversion is unavailable', async () => {
		writeFileSync(join(tempDir, 'slides', 'images', 'photo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

		const result = await embedMarkdownImages('![photo](images/photo.png)', sourceFile, app, {
			...DEFAULT_SETTINGS,
			EmbeddedHTMLConvertImagesToWebP: true,
			EmbeddedHTMLWebPThresholdKB: 0,
		});

		expect(result).toContain('![photo](data:image/png;base64,');
	});
});

describe('resolveMarkdownImageResourcePaths', () => {
	let tempDir: string;
	let app: App;
	let sourceFile: TFile;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'marp-preview-image-path-'));
		mkdirpSync(join(tempDir, 'slides', 'sub', 'images'));
		app = createFakeApp(tempDir);
		sourceFile = createFakeSourceFile('slides/sub/deck.md', 'slides/sub');
	});

	afterEach(() => {
		removeSync(tempDir);
	});

	test('resolves relative image paths from the markdown file folder for preview', async () => {
		writeFileSync(join(tempDir, 'slides', 'sub', 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

		const result = await resolveMarkdownImageResourcePaths('![logo](images/logo.svg)', sourceFile, app);

		expect(result).toBe('![logo](app://local/slides/sub/images/logo.svg)');
	});

	test('falls back to vault-root image paths for preview', async () => {
		mkdirpSync(join(tempDir, 'attachments'));
		writeFileSync(join(tempDir, 'attachments', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

		const result = await resolveMarkdownImageResourcePaths('![logo](attachments/logo.svg)', sourceFile, app);

		expect(result).toBe('![logo](app://local/attachments/logo.svg)');
	});
});

describe('embedHTMLImages', () => {
	let tempDir: string;
	let app: App;
	let sourceFile: TFile;

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), 'marp-html-embed-'));
		mkdirpSync(join(tempDir, 'slides', 'images'));
		app = createFakeApp(tempDir);
		sourceFile = createFakeSourceFile('slides/deck.md', 'slides');
	});

	afterEach(() => {
		removeSync(tempDir);
	});

	test('embeds img src values after Marp has rendered HTML', async () => {
		writeFileSync(join(tempDir, 'slides', 'images', 'logo.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

		const result = await embedHTMLImages('<p><img src="images/logo.svg" /></p>', sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toContain('<img src="data:image/svg+xml;base64,');
		expect(result).not.toContain('images/logo.svg');
	});

	test('embeds CSS url image references after Marp has rendered HTML', async () => {
		writeFileSync(join(tempDir, 'slides', 'images', 'bg.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');

		const result = await embedHTMLImages('<style>section{background-image:url("images/bg.svg")}</style>', sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toContain('url("data:image/svg+xml;base64,');
	});

	test('keeps data URIs in HTML untouched', async () => {
		const html = '<img src="data:image/svg+xml;base64,PHN2Zz4=" />';

		const result = await embedHTMLImages(html, sourceFile, app, DEFAULT_SETTINGS);

		expect(result).toBe(html);
	});
});

describe('appendMobileTouchNavigation', () => {
	test('adds touch navigation assets before body close', () => {
		const result = appendMobileTouchNavigation('<html><body></body></html>');

		expect(result).toContain('marp-slides-mobile-touch-navigation');
		expect(result).toContain('.bespoke-marp-parent > .bespoke-marp-osc');
		expect(result).toContain('touch-action: pan-x pan-y pinch-zoom !important');
		expect(result).toContain('mobileViewRuntime');
		expect(result).toContain('stopMarpTouchHandling');
		expect(result).toContain('showControls');
		expect(result).toContain('horizontalSwipeRatio');
		expect(result).toContain('swipeDistance');
		expect(result).toContain('(hover: none) and (pointer: coarse)');
		expect(result).toContain('pinch-zoom');
		expect(result).toContain('.marp-slides-annotation-controls');
		expect(result).toContain('display: none !important');
		expect(result).toContain('visualViewport');
		expect(result).toContain('data-bespoke-marp-osc');
		expect(result).toContain('</body>');
		expect(result).not.toContain('new KeyboardEvent');
		expect(result).not.toContain('new WheelEvent');
		expect(result).not.toContain('ArrowDown');
	});

	test('does not inject touch navigation assets twice', () => {
		const once = appendMobileTouchNavigation('<html><body></body></html>');
		const twice = appendMobileTouchNavigation(once);

		expect(twice).toBe(once);
	});
});

describe('appendPresentationAnnotations', () => {
	test('adds annotation assets before body close', () => {
		const result = appendPresentationAnnotations('<html><body></body></html>');

		expect(result).toContain('marp-slides-presentation-annotations');
		expect(result).toContain('marp-slides-annotation-canvas');
		expect(result).toContain('Marker');
		expect(result).toContain('Highlighter');
		expect(result).toContain('Rectangle');
		expect(result).toContain('Circle');
		expect(result).toMatch(/rectangle:\s*{\s*label: 'Rectangle',\s*color: '#ff2b2b'/);
		expect(result).toMatch(/circle:\s*{\s*label: 'Circle',\s*color: '#ff2b2b'/);
		expect(result).toContain('Laser pointer');
		expect(result).toContain('Clear annotations');
		expect(result).toContain('innerHTML = tools[toolName].icon');
		expect(result).toContain('button.innerHTML = clearIcon');
		expect(result).toContain('button.title = getShortcutLabel');
		expect(result).toContain("button.setAttribute('aria-label', getShortcutLabel");
		expect(result).toContain('bindKeyboardShortcuts');
		expect(result).toContain('event.key.toLowerCase()');
		expect(result).toContain("pen: 'm'");
		expect(result).toContain("highlighter: 'h'");
		expect(result).toContain("rectangle: 'r'");
		expect(result).toContain("circle: 'o'");
		expect(result).toContain("laser: 'l'");
		expect(result).toContain('Clear annotations');
		expect(result).toContain('isMobileViewOnlyDevice');
		expect(result).toContain('(hover: none) and (pointer: coarse)');
		expect(result).toContain('bindViewportWheelPanAndGestureGuard');
		expect(result).toContain('bindMouseDragViewportPan');
		expect(result).toContain('bindGestureNavigationGuard');
		expect(result).toContain("runtimeWindow.addEventListener('wheel'");
		expect(result).toContain('queueWheelPanFallback');
		expect(result).toContain('getNestedWheelScroller(event.target)');
		expect(result).toContain('canScrollWithWheel');
		expect(result).toContain('canScrollAxis');
		expect(result).toContain('runtimeWindow.scrollBy');
		expect(result).toContain('event.stopPropagation()');
		expect(result).toContain('event.stopImmediatePropagation()');
		expect(result).toContain('event.preventDefault()');
		expect(result).toContain('passive: true');
		expect(result).toContain('marp-slides-laser-canvas');
		expect(result).toContain('getCoalescedEvents');
		expect(result).toContain('ctx.quadraticCurveTo');
		expect(result).toContain('ctx.strokeRect');
		expect(result).toContain('ctx.ellipse');
		expect(result).toContain('undoStackBySlide');
		expect(result).toContain('undoCurrentSlideChange');
		expect(result).toContain("key === 'z'");
		expect(result).toContain('event.ctrlKey');
		expect(result).toContain('event.metaKey');
		expect(result).toContain("action: 'clear'");
		expect(result).not.toContain('Eraser');
		expect(result.indexOf('marp-slides-presentation-annotations')).toBeLessThan(result.indexOf('</body>'));
	});

	test('does not inject annotation assets twice', () => {
		const once = appendPresentationAnnotations('<html><body></body></html>');
		const twice = appendPresentationAnnotations(once);

		expect(twice).toBe(once);
	});

	test('includes bespoke toolbar integration logic', () => {
		const result = appendPresentationAnnotations('<html><body><div class="bespoke-marp-osc"></div></body></html>');

		expect(result).toContain("querySelectorAll('.bespoke-marp-osc')");
		expect(result).toContain('marp-slides-annotation-controls');
		expect(result).toContain('appendChild(createControlGroup())');
	});

	test('appends annotation assets when body close is missing', () => {
		const html = '<html><body>';
		const result = appendPresentationAnnotations(html);

		expect(result.startsWith(html)).toBe(true);
		expect(result).toContain('marp-slides-presentation-annotations');
	});
});
