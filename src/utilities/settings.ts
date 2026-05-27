export interface MarpSlidesSettings {
	CHROME_PATH: string;
	ThemePath: string;
	BuiltInTheme: string;
	EnableHTML: boolean;
	MathTypesettings: string ;
	HTMLExportMode: string;
	EmbeddedHTMLConvertImagesToWebP: boolean;
	EmbeddedHTMLWebPThresholdKB: number;
	EmbeddedHTMLWebPQuality: number;
	EXPORT_PATH: string;
	EnableSyncPreview: boolean;
	EnableMarkdownItPlugins: boolean;
}

export const DEFAULT_SETTINGS: MarpSlidesSettings = {
	CHROME_PATH: '',
	ThemePath: '',
	BuiltInTheme: '',
	EnableHTML: false,
	MathTypesettings: 'mathjax',
	HTMLExportMode: 'bare',
	EmbeddedHTMLConvertImagesToWebP: true,
	EmbeddedHTMLWebPThresholdKB: 512,
	EmbeddedHTMLWebPQuality: 0.82,
	EXPORT_PATH: '',
	EnableSyncPreview: true,
	EnableMarkdownItPlugins: false
}