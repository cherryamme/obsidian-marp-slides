import { Vault, normalizePath, FileSystemAdapter, TFile, App } from 'obsidian';
import { outputFileSync } from 'fs-extra';
import { BUILT_IN_THEMES, getBuiltInTheme } from './builtInThemes';
import { MarpSlidesSettings } from './settings';

export class FilePath  {

    private settings : MarpSlidesSettings;

    constructor(settings: MarpSlidesSettings) {
        this.settings = settings;
    }

    private getLinkFormat(file: TFile): string {
        //console.log(`newLinkFormat: ${(file.vault as any).getConfig("newLinkFormat")}`);
        return (file.vault as any).getConfig("newLinkFormat");
    }

    private isAbsoluteLinkFormat(file: TFile): boolean {
        if(this.getLinkFormat(file) == "absolute"){
            return true;
        }
        else{
            return false;
        }
    }

    private getRootPath(file: TFile): string {
        
		let basePath = (file.vault.adapter as FileSystemAdapter).getBasePath();
        if (basePath.startsWith('/')){
            basePath = `/${normalizePath(basePath)}/`;
        }
        else
        {
            basePath = `${normalizePath(basePath)}/`;
        }

        //console.log(`Root Path: ${basePath}`);
        return basePath;
	}

	public getCompleteFileBasePath(file: TFile): string{
        const baseFolder = file.parent?.path ? normalizePath(file.parent.path) : normalizePath("/");
        const resourcePath = (file.vault.adapter as FileSystemAdapter).getResourcePath(baseFolder).split("?");
        //console.log(`Complete File Base Path: ${resourcePath}`);
        return `${resourcePath[0]}/`;
	}

    public getCompleteFilePath(file: TFile) : string{

        let basePath = `${this.getRootPath(file)}${normalizePath(file.path)}`;
        if(this.isAbsoluteLinkFormat(file)){
            basePath = `${this.getRootPath(file)}${normalizePath(file.name)}`;
        }
        //console.log(`Complete File Path: ${basePath}`);
        return basePath;
	}

    public async copyFileToRoot(file: TFile) {
        if(this.isAbsoluteLinkFormat(file)){
            await (file.vault.adapter as FileSystemAdapter).copy(file.path, file.name);
            //console.log(`copied!`);
        }
    }

    public async removeFileFromRoot(file: TFile) {
        const isFileExists = await (file.vault.adapter as FileSystemAdapter).exists(file.name);
        if(this.isAbsoluteLinkFormat(file) && isFileExists){
            await (file.vault.adapter as FileSystemAdapter).remove(file.name);
        }
    }

    public getThemePath(file: TFile): string{
        const themePath = `${this.getRootPath(file)}${normalizePath(this.settings.ThemePath)}`;
        //console.log(`Theme Path: ${themePath}`);
        if (this.settings.ThemePath != ''){
            return themePath;
        } 
        else
        {
            return '';
        }
    }

    private getPluginDirectory(vault: Vault): string {
        const fileSystem = vault.adapter as FileSystemAdapter;
        const path = `${fileSystem.getBasePath()}/${normalizePath(vault.configDir)}/plugins/marp-slides/`;
        //console.log(path);
        return path;
	}

    public getLibDirectory(vault: Vault): string {
        const pluginDirectory = this.getPluginDirectory(vault);
        const path = `${pluginDirectory}lib3/`;
        //console.log(path);
        return path;
	}

    public getMarpEngine(vault: Vault): string {
        const libDirectory = this.getLibDirectory(vault);
        const path = `${libDirectory}marp.config.js`;
        //console.log(path);
        return path;
	}

    public getExportFilePath(file: TFile, extension: string, suffix = ''): string {
        const exportFileName = `${file.basename}${suffix}.${extension}`;

        if (this.settings.EXPORT_PATH != '') {
            return `${this.settings.EXPORT_PATH}${exportFileName}`;
        }

        if (file.parent?.path) {
            return `${this.getRootPath(file)}${normalizePath(file.parent.path)}/${exportFileName}`;
        }

        return `${this.getRootPath(file)}${exportFileName}`;
    }

    public getBuiltInThemePaths(vault: Vault): string[] {
        const themeDirectory = `${this.getPluginDirectory(vault)}themes/`;
        return BUILT_IN_THEMES.map((theme) => {
            const path = `${themeDirectory}${theme.name}.css`;
            outputFileSync(path, theme.css);
            return path;
        });
    }

    public preprocessMarkdown(markdown: string, sourceFile: TFile, app: App): string {
        let processedMarkdown = this.convertImageWikiLinks(markdown, sourceFile, app);
        processedMarkdown = this.applyTextImageSplitLayout(processedMarkdown);
        processedMarkdown = this.applySameLineImageLayout(processedMarkdown);
        processedMarkdown = this.convertImageSizeSyntax(processedMarkdown);
        processedMarkdown = this.applyPresentationDirectives(processedMarkdown);
        return processedMarkdown;
    }

    /**
     * Convert Obsidian wiki-link image syntax to standard Markdown.
     * Transforms ![[image.png]] to ![image.png](path/to/image.png)
     */
    public convertImageWikiLinks(markdown: string, sourceFile: TFile, app: App): string {
        // Image extensions to convert
        const imageExtensions = /\.(png|jpg|jpeg|gif|svg|webp|bmp)$/i;

        // Regex: ![[filename]] or ![[filename|alt text]]
        const wikiLinkRegex = /!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/g;

        return markdown.replace(wikiLinkRegex, (match, filename, altText) => {
            // Only process image files
            if (!imageExtensions.test(filename)) {
                return match;
            }

            // Use Obsidian's link resolver to find the file
            const linkedFile = app.metadataCache.getFirstLinkpathDest(filename, sourceFile.path);

            if (linkedFile) {
                // Build path based on link format setting
                let imagePath: string;
                if (this.isAbsoluteLinkFormat(sourceFile)) {
                    // Absolute: path from vault root
                    imagePath = linkedFile.path;
                } else {
                    // Relative: path from source file's folder
                    imagePath = this.getRelativePathFromFile(sourceFile, linkedFile);
                }

                const alt = altText || filename;
                return `![${alt}](${imagePath})`;
            }

            // File not found - return original
            return match;
        });
    }

    public applyTextImageSplitLayout(markdown: string): string {
        return this.transformMarkdownLines(markdown, (line) => {
            const images = [...line.matchAll(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g)];

            if (images.length === 0) {
                return line;
            }

            const firstImage = images[0];
            const lastImage = images[images.length - 1];
            const beforeText = line.slice(0, firstImage.index ?? 0).trim();
            const afterText = line.slice((lastImage.index ?? 0) + lastImage[0].length).trim();
            const middleText = line.slice((firstImage.index ?? 0) + firstImage[0].length, lastImage.index ?? 0).trim();

            if ((beforeText === '' && afterText === '') || (beforeText !== '' && afterText !== '') || middleText !== '') {
                return line;
            }

            const hasExplicitWidth = images.some((image) => this.getImageExplicitWidth(image[1]) != null);

            if (!hasExplicitWidth) {
                const columnCount = images.length + 1;

                return line.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, altText, imagePath) => {
                    const splitAlt = this.buildEqualTextImageAlt(altText, columnCount);
                    return `![${splitAlt}](${imagePath})`;
                });
            }

            const splitPosition = beforeText === '' ? 'split-left' : 'split-right';

            return line.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, altText, imagePath) => {
                const splitAlt = this.buildTextImageSplitAlt(altText, this.getTextImageSplitWidth(altText), splitPosition);
                return `![${splitAlt}](${imagePath})`;
            });
        });
    }

    public applySameLineImageLayout(markdown: string): string {
        return this.transformMarkdownLines(markdown, (line) => {
            const images = [...line.matchAll(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g)];

            if (images.length < 2 || line.replace(/!\[[^\]\n]*\]\([^)\n]+\)/g, '').trim() !== '') {
                return line;
            }

            const weights = images.map((image) => this.getImageLayoutWeight(image[1]));
            const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
            let imageIndex = 0;

            return line.replace(/!\[([^\]\n]*)\]\(([^)\n]+)\)/g, (_match, altText, imagePath) => {
                const width = Math.max(1, Math.round((weights[imageIndex++] / totalWeight) * 10000));
                return `![${this.setImageWidthDirective(altText, width)}](${imagePath})`;
            });
        });
    }

    private getTextImageSplitWidth(altText: string): number {
        const explicitWidth = this.getImageExplicitWidth(altText);

        if (explicitWidth != null) {
            return explicitWidth;
        }

        return 5500;
    }

    private buildEqualTextImageAlt(altText: string, columnCount: number): string {
        const cleanedAlt = this.cleanTextImageSplitAlt(altText);
        const splitToken = `split-equal-${columnCount}`;

        if (cleanedAlt === '' || /^\d+(?:\.\d+)?$/.test(cleanedAlt)) {
            return splitToken;
        }

        return `${splitToken} ${cleanedAlt}`;
    }

    private getImageExplicitWidth(altText: string): number | null {
        const numericAlt = altText.trim().match(/^\d+(?:\.\d+)?$/);

        if (numericAlt) {
            return Number(numericAlt[0]);
        }

        const widthDirective = altText.match(/(?:^|\s)(?:w|width):(\d+(?:\.\d+)?)(?:px)?(?:\s|$)/);

        if (widthDirective) {
            return Number(widthDirective[1]);
        }

        return null;
    }

    private buildTextImageSplitAlt(altText: string, width: number, splitPosition: 'split-left' | 'split-right'): string {
        const cleanedAlt = this.cleanTextImageSplitAlt(altText);

        if (cleanedAlt === '' || /^\d+(?:\.\d+)?$/.test(cleanedAlt)) {
            return `${splitPosition} w:${width}`;
        }

        return `${splitPosition} w:${width} ${cleanedAlt}`;
    }

    private cleanTextImageSplitAlt(altText: string): string {
        return altText
            .replace(/(^|\s)split-(?:equal-)?(?:left|right)(?=\s|$)/g, '$1')
            .replace(/(^|\s)(?:w|width):\d+(?:\.\d+)?(?:px)?(?=\s|$)/g, '$1')
            .trim();
    }

    private getImageLayoutWeight(altText: string): number {
        const explicitWidth = this.getImageExplicitWidth(altText);

        if (explicitWidth != null) {
            return explicitWidth;
        }

        return 1;
    }

    private setImageWidthDirective(altText: string, width: number): string {
        const trimmedAlt = altText.trim();

        if (trimmedAlt === '' || /^\d+(?:\.\d+)?$/.test(trimmedAlt)) {
            return `w:${width}`;
        }

        if (/(?:^|\s)(?:w|width):\d+(?:\.\d+)?(?:px)?(?:\s|$)/.test(trimmedAlt)) {
            return trimmedAlt.replace(/(^|\s)(?:w|width):\d+(?:\.\d+)?(?:px)?(?=\s|$)/, `$1w:${width}`);
        }

        return `w:${width} ${trimmedAlt}`;
    }

    public convertImageSizeSyntax(markdown: string): string {
        return this.transformMarkdownLines(markdown, (line) => {
            return line.replace(/!\[(\d+(?:\.\d+)?)\]\(([^)\n]+)\)/g, (_match, size, imagePath) => {
                return `![w:${size}](${imagePath})`;
            });
        });
    }

    public applyPresentationDirectives(markdown: string): string {
        let processedMarkdown = markdown;
        const builtInTheme = getBuiltInTheme(this.settings.BuiltInTheme);

        if (builtInTheme) {
            processedMarkdown = this.setFrontMatterDirective(processedMarkdown, 'theme', builtInTheme.name);
        }

        if (this.hasSameLineImageRow(processedMarkdown)) {
            processedMarkdown = this.appendFrontMatterStyle(processedMarkdown, `section > p:has(> img:nth-of-type(2)) {
  display: flex;
  flex-wrap: nowrap;
  align-items: flex-start;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
}
section > p:has(> img:nth-of-type(2)) > img {
  flex-grow: 0;
  flex-shrink: 1;
  height: auto;
  margin: 0;
  max-width: none;
  min-width: 0;
  object-fit: contain;
}`);
        }

        if (this.hasEqualTextImageSplit(processedMarkdown)) {
            processedMarkdown = this.appendFrontMatterStyle(processedMarkdown, `section > p:has(> img[alt^="split-equal-"]) {
  align-items: flex-start;
  column-gap: 1rem;
  display: grid;
  width: 100%;
}
section > p:has(> img[alt^="split-equal-2"]) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
section > p:has(> img[alt^="split-equal-3"]) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
section > p:has(> img[alt^="split-equal-4"]) {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
section > p:has(> img[alt^="split-equal-"]) > img[alt^="split-equal-"] {
  display: block;
  height: auto;
  margin: 0 auto;
  max-width: 100%;
  min-width: 0;
  object-fit: contain;
  width: 100%;
}`);
        }

        if (this.hasTextImageSplit(processedMarkdown)) {
            processedMarkdown = this.appendFrontMatterStyle(processedMarkdown, `section > p:has(> img[alt^="split-"]) {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  width: 100%;
}
section > p:has(> img[alt^="split-"]) > img[alt^="split-left"],
section > p:has(> img[alt^="split-"]) > img[alt^="split-right"] {
  flex-grow: 0;
  flex-shrink: 1;
  height: auto;
  margin: 0;
  max-width: none;
  min-width: 0;
  object-fit: contain;
}`);
        }

        return processedMarkdown;
    }

    private transformMarkdownLines(markdown: string, transformLine: (line: string) => string): string {
        let inFence = false;
        const lines = markdown.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) || [];

        if (lines[lines.length - 1] === '') {
            lines.pop();
        }

        return lines.map((lineWithEnding) => {
            const endingMatch = lineWithEnding.match(/(\r\n|\n|\r)$/);
            const ending = endingMatch ? endingMatch[0] : '';
            const line = ending ? lineWithEnding.slice(0, -ending.length) : lineWithEnding;
            const isFence = /^(```|~~~)/.test(line.trim());

            if (isFence) {
                inFence = !inFence;
                return lineWithEnding;
            }

            if (inFence) {
                return lineWithEnding;
            }

            return `${transformLine(line)}${ending}`;
        }).join('');
    }

    private hasSameLineImageRow(markdown: string): boolean {
        let hasImageRow = false;

        this.transformMarkdownLines(markdown, (line) => {
            const images = line.match(/!\[[^\]\n]*\]\([^)\n]+\)/g) || [];
            if (images.length > 1 && line.replace(/!\[[^\]\n]*\]\([^)\n]+\)/g, '').trim() === '') {
                hasImageRow = true;
            }
            return line;
        });

        return hasImageRow;
    }

    private hasEqualTextImageSplit(markdown: string): boolean {
        return /!\[(?:[^\]\n]*\s)?split-equal-\d+(?:\s|])/.test(markdown);
    }

    private hasTextImageSplit(markdown: string): boolean {
        return /!\[(?:[^\]\n]*\s)?split-(?:left|right)(?:\s|])/.test(markdown);
    }

    private setFrontMatterDirective(markdown: string, name: string, value: string): string {
        const directive = `${name}: ${value}`;
        const frontMatter = this.getFrontMatter(markdown);

        if (!frontMatter) {
            return `---\n${directive}\n---\n\n${markdown}`;
        }

        const directiveRegex = new RegExp(`^${name}\\s*:.*$`, 'm');
        const body = directiveRegex.test(frontMatter.body)
            ? frontMatter.body.replace(directiveRegex, directive)
            : `${frontMatter.body.trimEnd()}\n${directive}`;

        return `---\n${body}\n---${markdown.slice(frontMatter.endIndex)}`;
    }

    private appendFrontMatterStyle(markdown: string, style: string): string {
        const styleLines = style.trim().split('\n').map((line) => `  ${line}`);
        const styleBlock = `style: |\n${styleLines.join('\n')}`;
        const frontMatter = this.getFrontMatter(markdown);

        if (!frontMatter) {
            return `---\n${styleBlock}\n---\n\n${markdown}`;
        }

        const lines = frontMatter.body.split(/\r?\n/);
        const styleIndex = lines.findIndex((line) => /^style:\s*[|>]\s*$/.test(line));

        if (styleIndex >= 0) {
            let insertIndex = styleIndex + 1;
            while (insertIndex < lines.length && !/^[A-Za-z][\w-]*\s*:/.test(lines[insertIndex])) {
                insertIndex++;
            }
            lines.splice(insertIndex, 0, ...styleLines);
        } else {
            if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
                lines.push(styleBlock);
            } else {
                lines.splice(lines.length - 1, 0, styleBlock);
            }
        }

        return `---\n${lines.join('\n')}\n---${markdown.slice(frontMatter.endIndex)}`;
    }

    private getFrontMatter(markdown: string): { body: string; endIndex: number } | null {
        const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/);

        if (!match || !/^[A-Za-z][\w-]*\s*:/m.test(match[1])) {
            return null;
        }

        return {
            body: match[1],
            endIndex: match[0].length,
        };
    }

    /**
     * Calculate relative path from source file to target file.
     */
    private getRelativePathFromFile(sourceFile: TFile, targetFile: TFile): string {
        const sourceParts = sourceFile.parent?.path.split('/').filter(p => p) || [];
        const targetParts = targetFile.path.split('/').filter(p => p);

        // Find common prefix length
        let commonLength = 0;
        while (commonLength < sourceParts.length &&
               commonLength < targetParts.length - 1 &&
               sourceParts[commonLength] === targetParts[commonLength]) {
            commonLength++;
        }

        // Build relative path
        const upCount = sourceParts.length - commonLength;
        const relativeParts = [...Array(upCount).fill('..'), ...targetParts.slice(commonLength)];

        return relativeParts.join('/');
    }
}