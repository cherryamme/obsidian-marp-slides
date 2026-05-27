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
  expect(result).toContain('flex-shrink: 1');
});

test('selected built-in theme adds theme directive', () => {
  const filePath = new FilePath({...DEFAULT_SETTINGS, BuiltInTheme: 'sysu2'});
  const result = filePath.applyPresentationDirectives('# Title');

  expect(result).toBe('---\ntheme: sysu2\n---\n\n# Title');
});
