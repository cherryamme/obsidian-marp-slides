import { TFile } from 'obsidian';
import { expect, test} from '@jest/globals';
import { FilePath } from "../src/utilities/filePath";
import { DEFAULT_SETTINGS } from "../src/utilities/settings";

class pathsUtility {
  base: string;
  relative: string;
  expected:string;
}

test('file base path', () => {

  const filePath = new FilePath(DEFAULT_SETTINGS);
  const tests : pathsUtility[] = [
    { base: "aaa", relative: "bbb", expected: "app://local/aaa/bbb/"},
    { base: "C:\\user\\foo\\vault", relative: "folder\\file", expected: "app://local/C:/user/foo/vault/folder/file/"},
  ];

  tests.forEach(element => {
    const file = new TFile;

    if (file.parent != null){
      file.parent.path = element.relative;
      file.vault.adapter.write(`${element.base}\\${element.relative}`, '');
    }

    const result = filePath.getCompleteFileBasePath(file);

    expect(result).toBe(element.expected);
  });

});

test('file path', () => {

  const filePath = new FilePath(DEFAULT_SETTINGS);
  const tests : pathsUtility[] = [
    { base: "aaa", relative: "bbb.md", expected: "aaa/bbb.md"},
    { base: "C:\\user\\foo\\vault", relative: "folder\\file.md", expected: "C:/user/foo/vault/folder/file.md"},
  ];

  tests.forEach(element => {
    const file = new TFile;

    file.path = element.relative;
    file.vault.adapter.write(element.base, '');

    const result = filePath.getCompleteFilePath(file);

    expect(result).toBe(element.expected);
  });

});

test('numeric image alt text is converted to Marp width directive', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.convertImageSizeSyntax('![221](附件/five_region_mapq_violin.svg)');

  expect(result).toBe('![w:221](附件/five_region_mapq_violin.svg)');
});

test('numeric image alt text is ignored inside fenced code blocks', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.convertImageSizeSyntax('```\n![221](image.svg)\n```');

  expect(result).toBe('```\n![221](image.svg)\n```');
});

test('single unsized image with trailing text becomes a two-column equal layout marker', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyTextImageSplitLayout('![figure](a.svg) 说明文字');

  expect(result).toBe('![split-equal-2 figure](a.svg) 说明文字');
});

test('single unsized image with leading text becomes a two-column equal layout marker', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyTextImageSplitLayout('说明文字 ![](a.svg)');

  expect(result).toBe('说明文字 ![split-equal-2](a.svg)');
});

test('two unsized images with leading text become three-column equal layout markers', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyTextImageSplitLayout('说明文字 ![a](a.svg) ![b](b.svg)');

  expect(result).toBe('说明文字 ![split-equal-3 a](a.svg) ![split-equal-3 b](b.svg)');
});

test('single image with leading text keeps explicit numeric width on the right', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyTextImageSplitLayout('说明文字 ![162](a.svg)');

  expect(result).toBe('说明文字 ![split-right w:162](a.svg)');
});

test('single image with leading text keeps explicit width directive on the right', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyTextImageSplitLayout('说明文字 ![w:300 figure](a.svg)');

  expect(result).toBe('说明文字 ![split-right w:300 figure](a.svg)');
});

test('equal split layout markers keep content in the original paragraph flow', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyTextImageSplitLayout('说明文字 ![](a.svg)');

  expect(result).toBe('说明文字 ![split-equal-2](a.svg)');
});

test('equal split layout adds full-width grid CSS', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyPresentationDirectives('说明文字 ![split-equal-2](a.svg)');

  expect(result).toContain('display: grid');
  expect(result).toContain('align-items: flex-start');
  expect(result).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  expect(result).toContain('img[alt^="split-equal-"]');
});

test('same-line numeric image rows allocate widths by ratio', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applySameLineImageLayout('![100](a.svg) ![300](b.svg)');

  expect(result).toBe('![w:2500](a.svg) ![w:7500](b.svg)');
});

test('same-line non-numeric image rows allocate equal widths', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applySameLineImageLayout('![a](a.svg) ![b](b.svg)');

  expect(result).toBe('![w:5000 a](a.svg) ![w:5000 b](b.svg)');
});

test('same-line image rows add presentation CSS', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyPresentationDirectives('![w:100](a.svg) ![w:120](b.svg)');

  expect(result).toContain('style: |');
  expect(result).toContain('align-items: flex-start');
  expect(result).toContain('flex-shrink: 1');
});

test('single image with text adds split layout presentation CSS', () => {
  const filePath = new FilePath(DEFAULT_SETTINGS);
  const result = filePath.applyPresentationDirectives('说明文字 ![split-equal-2](a.svg)');

  expect(result).toContain('img[alt^="split-equal-"]');
  expect(result).toContain('display: grid');
});

test('selected built-in theme adds theme directive', () => {
  const filePath = new FilePath({...DEFAULT_SETTINGS, BuiltInTheme: 'sysu2'});
  const result = filePath.applyPresentationDirectives('# Title');

  expect(result).toBe('---\ntheme: sysu2\n---\n\n# Title');
});
