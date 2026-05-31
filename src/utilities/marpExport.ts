import marpCli, { CLIError, CLIErrorCode } from '@marp-team/marp-cli'
import { TFile, App } from 'obsidian';
import { MarpSlidesSettings } from './settings';
import { FilePath } from './filePath';
import { appendMobileTouchNavigation, appendPresentationAnnotations, embedHTMLImages } from './htmlEmbed';
import { writeFileSync, readFileSync } from 'fs-extra';
import { dirname, join } from 'path';

export class MarpCLIError extends Error {}

export class MarpExport {

    private settings : MarpSlidesSettings;
    private app : App | null;

    constructor(settings: MarpSlidesSettings, app: App | null = null) {
        this.settings = settings;
        this.app = app;
    }

    async export(file: TFile, type: string){
        const filesTool = new FilePath(this.settings);
        await filesTool.removeFileFromRoot(file);
        await filesTool.copyFileToRoot(file);
        const completeFilePath = filesTool.getCompleteFilePath(file);
        const themePath = filesTool.getThemePath(file);
        const builtInThemePaths = filesTool.getBuiltInThemePaths(file.vault);
        const resourcesPath = filesTool.getLibDirectory(file.vault);
        const marpEngineConfig = filesTool.getMarpEngine(file.vault);
        let originalContent: string | null = null;
        let htmlEmbeddedOutputPath = '';
        let htmlOutputPath = '';

        // Apply Obsidian image and presentation preprocessing before export
        if (this.app && completeFilePath != '' && type !== 'preview') {
            try {
                originalContent = readFileSync(completeFilePath, 'utf-8');
                const processedContent = filesTool.preprocessMarkdown(originalContent, file, this.app);

                writeFileSync(completeFilePath, processedContent, 'utf-8');
            } catch (e) {
                console.error('Failed to preprocess markdown for export:', e);
            }
        }

        if (completeFilePath != ''){
            //console.log(completeFilePath);

            const argv: string[] = [completeFilePath,'--allow-local-files'];
            //const argv: string[] = ['--engine', '@marp-team/marp-core', completeFilePath,'--allow-local-files'];

            if (this.settings.EnableMarkdownItPlugins){
                argv.push('--engine');
                argv.push(marpEngineConfig);
            }

            builtInThemePaths.forEach((builtInThemePath) => {
                argv.push('--theme-set');
                argv.push(builtInThemePath);
            });

            if (themePath != ''){
                argv.push('--theme-set');
                argv.push(themePath);
            }

            switch (type) {
                case 'pdf':
                    argv.push('--pdf');
                    if (this.settings.EXPORT_PATH != ''){
                        argv.push('-o');
                        argv.push(`${this.settings.EXPORT_PATH}${file.basename}.pdf`);
                    }
                    break;
                case 'pdf-with-notes':
                    argv.push('--pdf');
                    argv.push('--pdf-notes');
                    argv.push('--pdf-outlines');
                    if (this.settings.EXPORT_PATH != ''){
                        argv.push('-o');
                        argv.push(`${this.settings.EXPORT_PATH}${file.basename}.pdf`);
                    }
                    break;
                case 'pptx':
                    argv.push('--pptx');
                    if (this.settings.EXPORT_PATH != ''){
                        argv.push('-o');
                        argv.push(`${this.settings.EXPORT_PATH}${file.basename}.pptx`);
                    }
                    break;
                case 'png':
                    argv.push('--images');
                    argv.push('--png');
                    if (this.settings.EXPORT_PATH != ''){
                        argv.push('-o');
                        argv.push(`${this.settings.EXPORT_PATH}${file.basename}.png`);
                    }
                    break;
                case 'html':
                    htmlOutputPath = join(dirname(completeFilePath), `${file.basename}.html`);
                    argv.push('--html');
                    argv.push('--template');
                    argv.push(this.settings.HTMLExportMode);
                    break;
                case 'html-embedded':
                    htmlEmbeddedOutputPath = filesTool.getExportFilePath(file, 'html', '.single');
                    argv.push('--html');
                    argv.push('--template');
                    argv.push(this.settings.HTMLExportMode);
                    argv.push('-o');
                    argv.push(htmlEmbeddedOutputPath);
                    break;
                case 'preview':
                    argv.push('--html');
                    argv.push('--preview');
                    break;
                default:
                    //argv.push('--template');
                    //argv.push('bare');
                    //argv.push('bespoke');
                    //argv.push('--engine');
                    //argv.push('@marp-team/marpit');
                    //argv.remove(completeFilePath);
                    //process.env.PORT = "5001";
                    //argv.push('PORT=5001');
                    //argv.push('--server');
                    
                    //argv.push('--watch');
            }
            try {
                await this.run(argv, resourcesPath);

                if (type === 'html' && htmlOutputPath != '') {
                    const html = readFileSync(htmlOutputPath, 'utf-8');
                    writeFileSync(htmlOutputPath, appendPresentationAnnotations(html), 'utf-8');
                }

                if (type === 'html-embedded' && htmlEmbeddedOutputPath != '') {
                    let processedHTML = readFileSync(htmlEmbeddedOutputPath, 'utf-8');

                    if (this.app) {
                        processedHTML = await embedHTMLImages(processedHTML, file, this.app, this.settings);
                    }

                    processedHTML = appendMobileTouchNavigation(processedHTML);
                    processedHTML = appendPresentationAnnotations(processedHTML);
                    writeFileSync(htmlEmbeddedOutputPath, processedHTML, 'utf-8');
                }
            } finally {
                if (originalContent != null) {
                    writeFileSync(completeFilePath, originalContent, 'utf-8');
                }
            }
        }

    }

    //async exportPdf(argv: string[], opts?: MarpCLIAPIOptions | undefined){
    private async run(argv: string[], resourcesPath: string){
        const { CHROME_PATH } = process.env;

        try {
            process.env.CHROME_PATH = this.settings.CHROME_PATH || CHROME_PATH;

            await this.runMarpCli(argv, resourcesPath);
            
        } catch (e) {
            console.error(e)

            if (
                e instanceof CLIError &&
                e.errorCode === CLIErrorCode.NOT_FOUND_CHROMIUM
            ) {
                const browsers = ['[Google Chrome](https://www.google.com/chrome/)']

                if (process.platform === 'linux')
                    browsers.push('[Chromium](https://www.chromium.org/)')

                browsers.push('[Microsoft Edge](https://www.microsoft.com/edge)')

                throw new MarpCLIError(
                    `It requires to install ${browsers
                    .join(', ')
                    .replace(/, ([^,]*)$/, ' or $1')} for exporting.`
                )
            }

            throw e
        } finally {
            process.env.CHROME_PATH = CHROME_PATH
        }
    }

    private async runMarpCli(argv: string[], resourcesPath: string) {
        //console.info(`Execute Marp CLI [${argv.join(' ')}] (${JSON.stringify(opts)})`)
        console.info(`Execute Marp CLI [${argv.join(' ')}]`);
        let temp__dirname = __dirname;

        try {    
            __dirname = resourcesPath;
            const exitCode = await marpCli(argv, {});

            if (exitCode > 0) {
                console.error(`Failure (Exit status: ${exitCode})`)
            }
        } catch(e) {
            if (e instanceof CLIError){
                console.error(`CLIError code: ${e.errorCode}, message: ${e.message}`);
            } else {
                console.error("Generic Error!");
            }
        }

        __dirname = temp__dirname;
    }
}