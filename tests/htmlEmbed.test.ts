import { App, TFile } from 'obsidian';
import { mkdtempSync, mkdirpSync, removeSync, writeFileSync } from 'fs-extra';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendMobileTouchNavigation, embedHTMLImages, embedMarkdownImages } from '../src/utilities/htmlEmbed';
import { DEFAULT_SETTINGS } from '../src/utilities/settings';

function createFakeApp(basePath: string): App {
	return {
		vault: {
			adapter: {
				getBasePath: () => basePath,
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
		expect(result).toContain('touchstart');
		expect(result).toContain('ArrowDown');
		expect(result).toContain('</body>');
	});
});
