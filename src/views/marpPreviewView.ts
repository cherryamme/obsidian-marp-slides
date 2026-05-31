import { ItemView, WorkspaceLeaf, MarkdownView, normalizePath, TFile } from 'obsidian';
import { Marp } from '@marp-team/marp-core'
import { browser, type MarpCoreBrowser } from '@marp-team/marp-core/browser'

import { MarpSlidesSettings } from '../utilities/settings'
import { MarpExport } from '../utilities/marpExport';
import { FilePath } from '../utilities/filePath'
import { BUILT_IN_THEMES } from '../utilities/builtInThemes'
import { mountPresentationAnnotations, resolveMarkdownImageResourcePaths } from '../utilities/htmlEmbed';
import { MathOptions } from '@marp-team/marp-core/types/src/math/math';

const markdownItContainer = require('markdown-it-container');
const markdownItMark = require('markdown-it-mark');
const markdownItKroki = require('@kazumatu981/markdown-it-kroki');

export const MARP_PREVIEW_VIEW = 'marp-preview-view';

export class MarpPreviewView extends ItemView  {
    private marp: Marp; 
    
    private marpBrowser: MarpCoreBrowser | undefined;
    private settings : MarpSlidesSettings;

    private file : TFile;

    constructor(settings: MarpSlidesSettings, leaf: WorkspaceLeaf) {
        super(leaf);

        this.settings = settings;

        this.marp = new Marp({
            container: { tag: 'div', id: '__marp-vscode' },
            slideContainer: { tag: 'div', 'data-marp-vscode-slide-wrapper': '' },
            html: this.settings.EnableHTML,
            inlineSVG: {
                enabled: true,
                backdropSelector: false
            },
            math: this.settings.MathTypesettings as MathOptions,
            minifyCSS: true,
            script: false
          });

        if (this.settings.EnableMarkdownItPlugins){
          this.marp
            .use(markdownItContainer, "container")
            .use(markdownItMark)
            .use(markdownItKroki,{entrypoint: "https://kroki.io"});
        }
    }

    getViewType() {
        return MARP_PREVIEW_VIEW;
    }

    getDisplayText() {
        return "Deck Preview";
    }

    async onOpen() {
        // console.log("marp slide onopen");

        const container = this.containerEl.children[1];
        container.empty();
        this.marpBrowser = browser(container);

        BUILT_IN_THEMES.forEach((theme) => {
            this.marp.themeSet.add(theme.css);
        });

        if (this.settings.ThemePath != '') {
            const fileContents: string[] = await Promise.all(
                this.app.vault.getFiles()
                    .filter(x => x.parent?.path == normalizePath(this.settings.ThemePath))
                    .map((file) => this.app.vault.cachedRead(file))
            );

            fileContents.forEach((content) => {
                this.marp.themeSet.add(content);
            });
        }

        this.addActions();
    }

    async onClose() {
        // Nothing to clean up.
        // console.log("marp slide onclose");
    }

    async onChange(view : MarkdownView) {
        this.displaySlides(view);
    }

    async onLineChanged(line: number) {
        const previewContainer = this.containerEl.children[1] as HTMLElement | undefined;
        const slideRoot = previewContainer?.querySelector('#__marp-vscode') as HTMLElement | null;
        const slides = Array.from(slideRoot?.children || [])
            .filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute('data-marp-vscode-slide-wrapper'));
        const slideIndex = Math.max(0, Math.min(line, slides.length - 1));
        const slide = slides[slideIndex];

        if (!slide) {
            console.log("Preview slide not found!");
            return;
        }

        slide.scrollIntoView({ block: 'start', inline: 'nearest' });
	}

    async addActions() {
        const marpCli = new MarpExport(this.settings, this.app);
        
        this.addAction('image', 'Export as PNG', () => {
            if (this.file) {
                marpCli.export(this.file, 'png');
            }
        });

        this.addAction('code-glyph', 'Export as HTML', () => {
            if (this.file) {
                marpCli.export(this.file, 'html');
            }
        });

        this.addAction('file-code', 'Export as single HTML', () => {
            if (this.file) {
                marpCli.export(this.file, 'html-embedded');
            }
        });

        this.addAction('slides-marp-export-pdf', 'Export as PDF', () => {
            if (this.file) {
                marpCli.export(this.file, 'pdf');
            }
        });

        this.addAction('slides-marp-export-pptx', 'Export as PPTX', () => {
            if (this.file) {
                marpCli.export(this.file, 'pptx');
            }
        });

        this.addAction('slides-marp-slide-present', 'Preview Slides', () => {
            if (this.file) {
                this.presentSlides();
            }
        });
      }

    private presentSlides() {
        const container = this.containerEl.children[1] as HTMLElement | undefined;
        const target = (container?.querySelector('#__marp-vscode') as HTMLElement | null) || container;

        if (!target) return;

        const requestFullscreen = target.requestFullscreen
            || (target as any).webkitRequestFullscreen
            || (target as any).mozRequestFullScreen
            || (target as any).msRequestFullscreen;

        if (requestFullscreen) {
            requestFullscreen.call(target);
        }
    }

    async displaySlides(view : MarkdownView) {

        if (view.file != null) {
            this.file = view.file;
            const filePath = new FilePath(this.settings);
            const basePath = filePath.getCompleteFileBasePath(view.file);
            const markdownText = view.data;

            const processedMarkdown = await resolveMarkdownImageResourcePaths(filePath.preprocessMarkdown(markdownText, view.file, this.app), view.file, this.app);

            const container = this.containerEl.children[1];
            container.empty();


            let { html, css } = this.marp.render(processedMarkdown);
            
            // Replace Backgorund Url for images
            html = html.replace(/background-image:url\(&quot;(?![a-z][a-z0-9+.-]*:|\/)/gi, `background-image:url(&quot;${basePath}`);

            const htmlFile = `
                <!DOCTYPE html>
                <html>
                <head>
                <base href="${basePath}"></base>
                <style id="__marp-vscode-style">${css}</style>
                </head>
                <body>${html}</body>
                </html>
                `;

            container.innerHTML = htmlFile;
            this.marpBrowser?.update();
            mountPresentationAnnotations(container as HTMLElement);
        }
        else
        {
            console.log("Errore: view.file is null")
        }
	}
}