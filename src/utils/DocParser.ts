import * as path from 'path';
import { Cancellation, checkCancellation, DocResult, associatedIds, uniqueDocs } from '../models/DocModels';
import { FileUtils } from './FileUtils';
import { BlockUtils } from './BlockUtils';
import { ReportGenerator } from './ReportGenerator';

export class DocParser {
  constructor(private readonly projectPath: string) {}
  public parseContent(content: string, filePath = 'test.ts'): DocResult {
    return BlockUtils.parse(content, path.resolve(this.projectPath, filePath), this.projectPath);
  }
  public async parseFile(filePath: string): Promise<DocResult> {
    const absolute = path.resolve(this.projectPath, filePath);
    return this.parseContent(await FileUtils.readFileContent(absolute), absolute);
  }
  public async parseFiles(files: string[], token?: Cancellation): Promise<DocResult> {
    const result: DocResult = [];
    const extensions = FileUtils.getSupportedCodeExtensions();
    const supported = [...new Set(files.map(file => path.resolve(this.projectPath, file)))]
      .filter(file => extensions.has(path.extname(file).toLowerCase())).sort();
    for (let index = 0; index < supported.length; index++) {
      checkCancellation(token);
      result.push(...await this.parseFile(supported[index]));
      if (index % 20 === 19) await new Promise<void>(resolve => setImmediate(resolve));
    }
    checkCancellation(token);
    return uniqueDocs(result);
  }
  public applyFilters(result: DocResult, ids: string[]): DocResult {
    return ids.length ? result.filter(item => associatedIds(item).some(id => ids.includes(id))) : result;
  }
  public generateMarkdown(result: DocResult): string { return ReportGenerator.generateMarkdown(result); }
  public generateJson(result: DocResult): string { return JSON.stringify(result, null, 2); }
}
