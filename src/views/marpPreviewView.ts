import { ItemView, WorkspaceLeaf, MarkdownView, normalizePath, TFile, Notice } from 'obsidian';
import { Marp } from '@marp-team/marp-core'
import { browser, type MarpCoreBrowser } from '@marp-team/marp-core/browser'

import { MarpSlidesSettings } from '../utilities/settings'
import { MarpExport } from '../utilities/marpExport';
import { FilePath } from '../utilities/filePath'
import { BUILT_IN_THEMES } from '../utilities/builtInThemes'
import { resolveMarkdownImageResourcePaths } from '../utilities/htmlEmbed';
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
    private currentMarkdownText: string | null = null;
    private presentationOverlay: HTMLElement | null = null;
    private presentationBlobUrl: string | null = null;
    private presentationRequestId = 0;
    private presentationFullscreenListener: (() => void) | null = null;

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
        this.stopPresentationMode();
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
                this.presentSlides(marpCli);
            }
        });
      }

    private async presentSlides(marpCli: MarpExport) {
        if (!this.file) return;

        this.stopPresentationMode(false);
        const requestId = ++this.presentationRequestId;
        const overlay = this.createPresentationOverlay();
        const loading = overlay.querySelector('.marp-slides-presentation-loading') as HTMLElement | null;
        document.body.appendChild(overlay);
        this.presentationOverlay = overlay;

        const onFullscreenChange = () => {
            if (this.presentationOverlay === overlay && this.getFullscreenElement(document) !== overlay) {
                this.stopPresentationMode(false);
            }
        };
        this.presentationFullscreenListener = onFullscreenChange;
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);

        const requestFullscreen = overlay.requestFullscreen
            || (overlay as any).webkitRequestFullscreen
            || (overlay as any).mozRequestFullScreen
            || (overlay as any).msRequestFullscreen;

        if (!requestFullscreen) {
            new Notice('Fullscreen is not supported in this environment.');
            this.stopPresentationMode(false);
            return;
        }

        const fullscreenRequest = requestFullscreen.call(overlay);
        if (fullscreenRequest && typeof fullscreenRequest.catch === 'function') {
            fullscreenRequest.catch((error: unknown) => {
                if (this.presentationOverlay !== overlay) return;

                console.error('Failed to enter fullscreen preview:', error);
                new Notice('Failed to enter fullscreen preview.');
                this.stopPresentationMode(false);
            });
        }

        try {
            const html = await marpCli.generateEmbeddedHtml(this.file, this.currentMarkdownText ?? undefined);
            if (requestId !== this.presentationRequestId || this.presentationOverlay !== overlay) return;

            const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            this.presentationBlobUrl = blobUrl;

            const iframe = document.createElement('iframe');
            iframe.className = 'marp-slides-presentation-frame';
            iframe.setAttribute('allow', 'fullscreen; pointer-lock');
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-pointer-lock allow-popups allow-downloads');
            iframe.addEventListener('load', () => {
                if (requestId !== this.presentationRequestId || this.presentationOverlay !== overlay) return;

                loading?.remove();
                iframe.focus();
                window.setTimeout(() => iframe.contentWindow?.focus(), 0);
            }, { once: true });

            overlay.appendChild(iframe);
            iframe.src = blobUrl;
        } catch (error) {
            if (requestId !== this.presentationRequestId || this.presentationOverlay !== overlay) return;

            console.error('Failed to generate preview slides:', error);
            new Notice('Failed to generate preview slides. Check the console for details.');
            this.stopPresentationMode(true);
        }
    }

    private createPresentationOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'marp-slides-presentation-overlay';
        overlay.tabIndex = -1;

        const loading = document.createElement('div');
        loading.className = 'marp-slides-presentation-loading';
        loading.textContent = 'Preparing slides...';
        overlay.appendChild(loading);
        return overlay;
    }

    private stopPresentationMode(exitFullscreen = true) {
        this.presentationRequestId++;

        const overlay = this.presentationOverlay;
        if (this.presentationFullscreenListener) {
            document.removeEventListener('fullscreenchange', this.presentationFullscreenListener);
            document.removeEventListener('webkitfullscreenchange', this.presentationFullscreenListener as EventListener);
            this.presentationFullscreenListener = null;
        }

        if (this.presentationBlobUrl) {
            URL.revokeObjectURL(this.presentationBlobUrl);
            this.presentationBlobUrl = null;
        }

        if (overlay && exitFullscreen && this.getFullscreenElement(document) === overlay) {
            const exitFullscreenRequest = document.exitFullscreen
                || (document as any).webkitExitFullscreen
                || (document as any).mozCancelFullScreen
                || (document as any).msExitFullscreen;

            if (exitFullscreenRequest) {
                const exitRequest = exitFullscreenRequest.call(document);
                if (exitRequest && typeof exitRequest.catch === 'function') {
                    exitRequest.catch((error: unknown) => console.error('Failed to exit fullscreen preview:', error));
                }
            }
        }

        overlay?.remove();
        this.presentationOverlay = null;
    }

    private getFullscreenElement(ownerDocument: Document) {
        return ownerDocument.fullscreenElement
            || (ownerDocument as any).webkitFullscreenElement
            || (ownerDocument as any).mozFullScreenElement
            || (ownerDocument as any).msFullscreenElement;
    }

    async displaySlides(view : MarkdownView) {

        this.stopPresentationMode();

        if (view.file != null) {
            this.file = view.file;
            const filePath = new FilePath(this.settings);
            const basePath = filePath.getCompleteFileBasePath(view.file);
            const markdownText = view.data;
            this.currentMarkdownText = markdownText;

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
        }
        else
        {
            console.log("Errore: view.file is null")
        }
	}
}