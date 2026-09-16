import { promises as fs } from 'fs';
import * as path from 'path';

/** The scanner and parser share the supported slash-comment source formats. */
export class FileUtils {
  private static readonly languages: Record<string, string> = {
    '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.vue': 'vue', '.java': 'java', '.kt': 'kotlin', '.go': 'go', '.php': 'php',
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cs': 'csharp',
    '.swift': 'swift', '.rs': 'rust',
  };
  public static getSupportedCodeExtensions(): Set<string> {
    return new Set(Object.keys(this.languages));
  }
  public static getSourceGlob(): string {
    return `**/*.{${Object.keys(this.languages).map(ext => ext.slice(1)).join(',')}}`;
  }
  public static detectLanguage(filePath: string): string {
    return this.languages[path.extname(filePath).toLowerCase()] || 'text';
  }
  public static async readFileContent(filePath: string): Promise<string> {
    // Finding one annotation does not imply EOF: always read the complete file.
    try { return await fs.readFile(filePath, 'utf8'); }
    catch (error) { throw new Error(`无法读取 ${filePath}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  public static getCodeSample(lines: string[], endLine: number): string {
    return lines.slice(endLine, endLine + 15).join('\n').trimEnd();
  }
}
