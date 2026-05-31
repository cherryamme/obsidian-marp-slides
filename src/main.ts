import { MarkdownView, TAbstractFile, Plugin, addIcon, App, PluginSettingTab, Setting, EditorSuggest, EditorPosition, Editor, TFile, EditorSuggestTriggerInfo, EditorSuggestContext  } from 'obsidian';

import { MARP_PREVIEW_VIEW, MarpPreviewView } from './views/marpPreviewView';
import { MarpExport } from './utilities/marpExport';
import { ICON_SLIDE_PREVIEW, ICON_EXPORT_PDF, ICON_EXPORT_PPTX, ICON_SLIDE_PRESENT } from './utilities/icons';
import { Libs } from './utilities/libs';
import { BUILT_IN_THEMES, BUILT_IN_THEME_NONE } from './utilities/builtInThemes';
import { MarpSlidesSettings, DEFAULT_SETTINGS } from 'utilities/settings';


export default class MarpSlides extends Plugin {
	
	public settings: MarpSlidesSettings;
	private slidesView : MarpPreviewView;
	private editorView : MarkdownView | null;
	private editorScrollTarget: HTMLElement | null = null;
	private editorScrollHandler: ((event: Event) => void) | null = null;
	private editorScrollFrame = 0;
	private previewedFilePath: string | null = null;

	async onload() {
		await this.loadSettings();

		const libsUtility = new Libs(this.settings);
		libsUtility.loadLibs(this.app);

		this.registerView(
			MARP_PREVIEW_VIEW,
			(leaf) => new MarpPreviewView(this.settings, leaf)
		);

		addIcon('slides-preview-marp', ICON_SLIDE_PREVIEW);
		addIcon('slides-marp-export-pdf', ICON_EXPORT_PDF);
		addIcon('slides-marp-export-pptx', ICON_EXPORT_PPTX);
		addIcon('slides-marp-slide-present', ICON_SLIDE_PRESENT);
		this.addRibbonIcon('slides-preview-marp', 'Show Slide Preview', async () => {
			await this.showPreviewSlide();
		});
		
		this.addCommand({
			id: 'preview',
			name: 'Slide Preview',
			callback: () => { this.showPreviewSlide();}
		});
		
		this.addCommand({
			id: 'export-pdf',
			name: 'Export PDF',
			callback: (() => this.exportFile('pdf'))
		});

		this.addCommand({
			id: 'export-pdf-notes',
			name: 'Export PDF with Notes',
			callback: (() => this.exportFile('pdf-with-notes'))
		});

		this.addCommand({
			id: 'export-html',
			name: 'Export HTML',
			callback: (() => this.exportFile('html'))
		});

		this.addCommand({
			id: 'export-html-embedded',
			name: 'Export HTML (single file)',
			callback: (() => this.exportFile('html-embedded'))
		});

		this.addCommand({
			id: 'export-pptx',
			name: 'Export PPTX',
			callback: (() => this.exportFile('pptx'))
		});

		this.addCommand({
			id: 'export-png',
			name: 'Export PNG',
			callback: (() => this.exportFile('png'))
		});		

		// this.addCommand({
		// 	id: 'export-deck',
		// 	name: 'Export Deck',
		// 	callback: (() => this.exportFile(''))
		// });

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new MarpSlidesSettingTab(this.app, this));

		if (this.settings.EnableSyncPreview)
			this.registerEditorSuggest(new LineSelectionListener(this.app, this));

		this.registerEvent(this.app.vault.on('modify', this.onChange.bind(this)));
		this.registerEvent(this.app.workspace.on('active-leaf-change', () => { this.syncPreviewToActiveMarkdown(); }));
		this.registerEvent(this.app.workspace.on('file-open', () => { this.syncPreviewToActiveMarkdown(); }));
	}

	onunload() {
		this.unbindEditorScrollSync();
		this.app.workspace.detachLeavesOfType(MARP_PREVIEW_VIEW);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onChange(file: TAbstractFile) {
		if (file == this.editorView?.file && this.slidesView) {
			await this.slidesView.onChange(this.editorView);
			this.previewedFilePath = this.editorView.file?.path || null;
			this.syncPreviewToEditorCursor();
		}
	}

	async exportFile(type: string){
		const file = this.app.workspace.getActiveFile();
		if(file !== null){
			const marpCli = new MarpExport(this.settings, this.app);
			await marpCli.export(file,type);
		}
	}

	async showPreviewSlide(){
		this.editorView = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (!this.editorView) {
			return;
		}

		this.slidesView = await this.activateView();
		await this.slidesView.displaySlides(this.editorView);
		this.previewedFilePath = this.editorView.file?.path || null;
		this.bindEditorScrollSync();
		this.syncPreviewToEditorCursor();
	}
	
	async syncPreviewToActiveMarkdown() {
		const activeEditorView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeEditorView?.file) return;

		const slidesView = this.getOpenPreviewView();
		if (!slidesView) return;
		if (this.previewedFilePath === activeEditorView.file.path && this.editorView === activeEditorView) return;

		this.editorView = activeEditorView;
		this.slidesView = slidesView;
		await this.slidesView.displaySlides(this.editorView);
		this.previewedFilePath = this.editorView.file?.path || null;
		this.bindEditorScrollSync();
		this.syncPreviewToEditorCursor();
	}

	async activateView() : Promise<MarpPreviewView> {
		this.app.workspace.detachLeavesOfType(MARP_PREVIEW_VIEW);
	
		await this.app.workspace.getLeaf('split').setViewState({
			type: MARP_PREVIEW_VIEW,
			active: true,
		});

		const leaf = this.app.workspace.getLeavesOfType(MARP_PREVIEW_VIEW)[0];

		this.app.workspace.revealLeaf(leaf);

		return leaf.view as MarpPreviewView;
	}

	syncPreviewToEditorCursor() {
		if (!this.editorView || !this.slidesView) return;

		const cursor = this.editorView.editor.getCursor();
		const slideIndex = getMarpSlideIndexForLine(this.editorView.editor.getValue(), cursor.line);
		this.slidesView.onLineChanged(slideIndex);
	}

	syncPreviewToEditorScroll() {
		if (!this.editorView || !this.slidesView) return;

		const line = getEditorTopVisibleLine(this.editorView.editor, this.editorScrollTarget);
		const slideIndex = getMarpSlideIndexForLine(this.editorView.editor.getValue(), line);
		this.slidesView.onLineChanged(slideIndex);
	}

	bindEditorScrollSync() {
		if (!this.editorView || !this.settings.EnableSyncPreview) return;

		const scrollTarget = getEditorScrollElement(this.editorView);
		if (!scrollTarget || scrollTarget === this.editorScrollTarget) return;

		this.unbindEditorScrollSync();
		this.editorScrollHandler = () => {
			if (this.editorScrollFrame) return;

			this.editorScrollFrame = window.requestAnimationFrame(() => {
				this.editorScrollFrame = 0;
				this.syncPreviewToEditorScroll();
			});
		};
		this.editorScrollTarget = scrollTarget;
		scrollTarget.addEventListener('scroll', this.editorScrollHandler, { passive: true });
	}

	unbindEditorScrollSync() {
		if (this.editorScrollTarget && this.editorScrollHandler) {
			this.editorScrollTarget.removeEventListener('scroll', this.editorScrollHandler);
		}

		if (this.editorScrollFrame) {
			window.cancelAnimationFrame(this.editorScrollFrame);
		}

		this.editorScrollTarget = null;
		this.editorScrollHandler = null;
		this.editorScrollFrame = 0;
	}

	getOpenPreviewView(): MarpPreviewView | null {
		const leaf = this.app.workspace.getLeavesOfType(MARP_PREVIEW_VIEW)[0];
		return leaf ? leaf.view as MarpPreviewView : null;
	}

	getViewInstance(): MarpPreviewView | null {
		const leaf = this.app.workspace.getLeavesOfType(MARP_PREVIEW_VIEW)[0];
		if (leaf){
			this.app.workspace.revealLeaf(leaf);
			return leaf.view as MarpPreviewView;
		} else {
			return null;
		}
	}
}



export class MarpSlidesSettingTab extends PluginSettingTab {
	private plugin: MarpSlides;

	constructor(app: App, plugin: MarpSlides) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		containerEl.createEl('h2', {text: 'MARP Slide Plugin - Settings'});

		new Setting(containerEl)
			.setName('Chrome Path')
			.setDesc('Sets the custom path for Chrome or Chromium-based browser to export PDF, PPTX, and image. If it\'s empty, Marp will find out the installed Google Chrome / Chromium / Microsoft Edge.')
			.addText(text => text
				.setPlaceholder('Enter CHROME_PATH')
				.setValue(this.plugin.settings.CHROME_PATH)
				.onChange(async (value) => {
					this.plugin.settings.CHROME_PATH = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Theme Path')
			.setDesc('Local paths to additional theme CSS for Marp core and Marpit framework. The rule for paths is following Markdown: Styles.')
			.addText(text => text
				.setPlaceholder('template\\marp\\themes')
				.setValue(this.plugin.settings.ThemePath)
				.onChange(async (value) => {
					this.plugin.settings.ThemePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Built-in Theme')
			.setDesc('Select a bundled theme to apply to slide previews and exports. Markdown/frontmatter keeps the theme directive in each note.')
			.addDropdown(dropdown => {
				dropdown.addOption(BUILT_IN_THEME_NONE, 'Markdown/frontmatter');
				BUILT_IN_THEMES.forEach((theme) => dropdown.addOption(theme.name, theme.label));
				dropdown
					.setValue(this.plugin.settings.BuiltInTheme)
					.onChange(async (value) => {
						this.plugin.settings.BuiltInTheme = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Export Path')
			.setDesc('Sets the custom path to export PDF, PPTX, images, and single-file HTML. If it\'s empty, Marp will export in the same folder of the note. Export path does not affect regular HTML export')
			.addText(text => text
				.setPlaceholder('C:\\Users\\user\\Downloads\\')
				.setValue(this.plugin.settings.EXPORT_PATH)
				.onChange(async (value) => {
					this.plugin.settings.EXPORT_PATH = value;
					await this.plugin.saveSettings();
				}));
		
		new Setting(containerEl)
			.setName('Enable HTML')
			.setDesc('Enable all HTML elements in Marp Markdown. Please Attention when you enable!!!')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.EnableHTML)
				.onChange(async (value) => {
					this.plugin.settings.EnableHTML = value;
					await this.plugin.saveSettings();
				}));
	
		new Setting(containerEl)
			.setName('Math Typesettings')
			.setDesc('Controls math syntax and the default library for rendering math in Marp Core. A using library can override by math global directive in Markdown.')
			.addDropdown(toggle => toggle
				.addOption("mathjax","mathjax")
				.addOption("katex","katex")
				.setValue(this.plugin.settings.MathTypesettings)
				.onChange(async (value) => {
					this.plugin.settings.MathTypesettings = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('HTML Export Mode')
			.setDesc('(Experimental) Controls HTML library for eporting HTML File in Marp Cli. bespoke.js is experimental')
			.addDropdown(toggle => toggle
				.addOption("bare","bare.js")
				.addOption("bespoke","bespoke.js")
				.setValue(this.plugin.settings.HTMLExportMode)
				.onChange(async (value) => {
					this.plugin.settings.HTMLExportMode = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Single-file HTML WebP conversion')
			.setDesc('Convert large PNG/JPEG images to WebP when exporting single-file HTML. If conversion is unavailable or larger, original images are embedded.')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.EmbeddedHTMLConvertImagesToWebP)
				.onChange(async (value) => {
					this.plugin.settings.EmbeddedHTMLConvertImagesToWebP = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Single-file HTML WebP threshold')
			.setDesc('Minimum PNG/JPEG size in KB before attempting WebP conversion.')
			.addText(text => text
				.setPlaceholder('512')
				.setValue(String(this.plugin.settings.EmbeddedHTMLWebPThresholdKB))
				.onChange(async (value) => {
					const threshold = Number(value);
					if (!Number.isNaN(threshold) && threshold >= 0) {
						this.plugin.settings.EmbeddedHTMLWebPThresholdKB = threshold;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Single-file HTML WebP quality')
			.setDesc('WebP conversion quality from 0.1 to 1.0.')
			.addText(text => text
				.setPlaceholder('0.82')
				.setValue(String(this.plugin.settings.EmbeddedHTMLWebPQuality))
				.onChange(async (value) => {
					const quality = Number(value);
					if (!Number.isNaN(quality) && quality >= 0.1 && quality <= 1) {
						this.plugin.settings.EmbeddedHTMLWebPQuality = quality;
						await this.plugin.saveSettings();
					}
				}));

		new Setting(containerEl)
			.setName('Sync Preview')
			.setDesc('(Experimental) Sync the slide preview with the editor cursor')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.EnableSyncPreview)
				.onChange(async (value) => {
					this.plugin.settings.EnableSyncPreview = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('MarkdownIt Plugins')
			.setDesc('(Experimental) Enable the Markdown It Plugins (Mark, Containers, Kroki)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.EnableMarkdownItPlugins)
				.onChange(async (value) => {
					this.plugin.settings.EnableMarkdownItPlugins = value;
					await this.plugin.saveSettings();
				}));
	}
}

function getEditorScrollElement(view: MarkdownView): HTMLElement | null {
	return view.containerEl.querySelector('.cm-scroller')
		|| view.containerEl.querySelector('.CodeMirror-scroll');
}

function getEditorTopVisibleLine(editor: Editor, scrollTarget: HTMLElement | null): number {
	const codeMirrorView = (editor as any).cm;
	const scrollTop = codeMirrorView?.scrollDOM?.scrollTop ?? scrollTarget?.scrollTop ?? editor.getScrollInfo().top;

	if (typeof codeMirrorView?.lineBlockAtHeight === 'function' && codeMirrorView.state?.doc) {
		const block = codeMirrorView.lineBlockAtHeight(scrollTop);
		return Math.max(0, codeMirrorView.state.doc.lineAt(block.from).number - 1);
	}

	if (typeof codeMirrorView?.coordsChar === 'function' && scrollTarget) {
		const rect = scrollTarget.getBoundingClientRect();
		const position = codeMirrorView.coordsChar({ left: rect.left + 1, top: rect.top + 1 }, 'window');
		if (position && typeof position.line === 'number') {
			return Math.max(0, position.line);
		}
	}

	const lineHeight = scrollTarget ? Number.parseFloat(getComputedStyle(scrollTarget).lineHeight) : 0;
	return Math.max(0, Math.floor(scrollTop / (lineHeight || 20)));
}

function getMarpSlideIndexForLine(markdown: string, cursorLine: number): number {
	const lines = markdown.split(/\r?\n/);
	const targetLine = Math.max(0, Math.min(cursorLine, lines.length));
	const frontMatterEndLine = getFrontMatterEndLine(lines);
	let slideIndex = 0;
	let fence: { marker: string; length: number } | null = null;

	for (let lineIndex = 0; lineIndex < targetLine; lineIndex++) {
		if (frontMatterEndLine > 0 && lineIndex === 0) {
			lineIndex = frontMatterEndLine;
			continue;
		}

		const line = lines[lineIndex];
		const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);

		if (fence) {
			if (fenceMatch && fenceMatch[1][0] === fence.marker && fenceMatch[1].length >= fence.length) {
				fence = null;
			}
			continue;
		}

		if (fenceMatch) {
			fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
			continue;
		}

		if (/^\s*---\s*$/.test(line)) {
			slideIndex++;
		}
	}

	return slideIndex;
}

function getFrontMatterEndLine(lines: string[]): number {
	if (!/^---\s*$/.test(lines[0] || '')) return -1;

	for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
		if (/^---\s*$/.test(lines[lineIndex])) {
			return lineIndex;
		}
	}

	return -1;
}

class LineSelectionListener extends EditorSuggest<string> {
	private plugin: MarpSlides;

	constructor(app: App, plugin: MarpSlides) {
		super(app);
		this.plugin = plugin;
	}

	onTrigger(cursor: EditorPosition, editor: Editor, file: TFile): EditorSuggestTriggerInfo | null {
		//console.log("line: " + cursor.line);
		//console.log("ch: " + cursor.ch);
		//console.log("value: " + editor.getValue());
        
        let triggerInfo: EditorSuggestTriggerInfo = {start:cursor, end:cursor, query:""};
        const instance = this.plugin.getViewInstance();

		if (instance) {
			instance.onLineChanged(getMarpSlideIndexForLine(editor.getValue(), cursor.line));
		}
		return null;
	}
	getSuggestions(context: EditorSuggestContext): string[] | Promise<string[]> {
		let suggestion :string[] = [];
		return suggestion;
		//throw new Error('Method not implemented.');
	}
	renderSuggestion(value: string, el: HTMLElement): void {
		throw new Error('Method not implemented.');
	}
	selectSuggestion(value: string, evt: MouseEvent | KeyboardEvent): void {
		throw new Error('Method not implemented.');
	}
}
