import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { DocParser } from '../utils/DocParser';
import { DocResult } from '../models/DocModels';
import { LogService } from './LogService';
import { ResourceManager } from '../managers/ResourceManager';
import { BlockUtils } from '../utils/BlockUtils';

/**
 * 文档服务 - 处理文档的解析、生成和显示
 */
export class DocumentService {
  private logger: LogService;
  private resourceManager: ResourceManager;
  private docParser: DocParser;
  private lastParseResult: DocResult | null = null;
  private workspacePath: string;

  constructor(logger: LogService, resourceManager: ResourceManager) {
    this.logger = logger;
    this.resourceManager = resourceManager;
    this.workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || process.cwd();
    this.docParser = new DocParser(this.workspacePath);
  }

  /**
   * 解析文档文件
   * @param files 文件路径列表
   * @returns 解析结果
   */
  public async parseDocuments(files: string[]): Promise<DocResult> {
    // 解析文件
    const result = this.docParser.parseFiles(files);
    this.lastParseResult = result;
    return result;
  }

  /**
   * 获取最后一次解析结果
   * @returns 最后一次解析结果
   */
  public getLastParseResult(): DocResult | null {
    return this.lastParseResult;
  }

  /**
   * 生成Markdown文档
   * @returns Markdown文件路径
   */
  public async generateMarkdown(parseResult: DocResult): Promise<string> {
    // 创建临时文件
    const tempFile = path.join(os.tmpdir(), `codoc-${Date.now()}.md`);
    this.resourceManager.addTempFile(tempFile);
    this.resourceManager.setLastMarkdownFile(tempFile);

    // 生成Markdown内容
    const markdownContent = this.docParser.generateMarkdown(parseResult);

    // 写入临时文件
    fs.writeFileSync(tempFile, markdownContent);

    return tempFile;
  }

  /**
   * 处理文档
   * @param files 文件路径列表
   */
  public async processDocs(files: string[]): Promise<void> {
    // 显示进度指示
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '正在生成文档...',
      cancellable: true,
    }, async (progress, token) => {
      // 设置取消处理
      token.onCancellationRequested(() => {
        vscode.window.showInformationMessage('文档生成已取消');
        throw new Error('用户取消操作');
      });

      try {
        // 解析文件
        progress.report({ message: '正在解析文件...' });
        const parseResult = await this.parseDocuments(files);

        // 显示需求选择界面
        const selectedResult = await this.processResultFilter(parseResult);

        if (!selectedResult) {
          vscode.window.showInformationMessage('未选择任何需求，文档生成已取消');
          return;
        }

        // 生成Markdown文档
        progress.report({ message: '生成Markdown文档...' });
        const tempFile = await this.generateMarkdown(selectedResult);

        // 显示结果
        await this.showMarkdownResult(tempFile);

        // 强制运行一次垃圾回收，释放内存
        if (typeof global.gc === 'function') {
          try {
            global.gc();
          } catch (e) {
            // 忽略错误
          }
        }

        vscode.window.showInformationMessage('文档生成完成');
      } catch (error: any) {
        // 确保在出错时清理临时文件
        const lastFile = this.resourceManager.getLastMarkdownFile();
        if (lastFile) {
          this.resourceManager.cleanupTempFile(lastFile);
        }
        throw error;
      }
    });
  }

  /**
   * 筛选展示结果
   * @param parseResult 解析结果
   * @returns 选择的需求ID列表
   */
  public async processResultFilter(parseResult: DocResult): Promise<DocResult | null> {
    // 筛选需求
    const filteredReqResult = await this.filterRequirements(parseResult);
    if (!filteredReqResult) {
      return null;
    }

    // 筛选标签类型
    return await this.filterBlockTypes(filteredReqResult);
  }

  /**
   * 筛选需求
   * @param parseResult 原始解析结果
   */
  private async filterRequirements(parseResult: DocResult): Promise<DocResult | null> {
    const reqIds = Object.keys(parseResult);
    if (reqIds.length <= 1) {
      return parseResult;
    }

    // 准备选择列表
    const items = reqIds.map(reqId => {
      const reqData = parseResult[reqId];
      let title = '';

      if (reqData.summary?.[0]) {
        title = `@summary - ${reqData.summary[0].title}`;
      } else {
        for (const blockType of Object.keys(reqData)) {
          const blocks = reqData[blockType];
          if (blocks && blocks.length > 0 && blocks[0].title) {
            title = `@${blockType} - ${blocks[0].title}`;
            break;
          }
        }
      }

      return {
        label: reqId,
        description: title,
        picked: true
      };
    });

    const selected = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: '选择要导出的需求/缺陷',
      title: '筛选需求ID'
    });

    if (!selected) {
      vscode.window.showInformationMessage('未选择任何需求，操作已取消。');
      return null;
    }

    const filteredReqResult: DocResult = {};
    for (const reqId of Object.keys(parseResult)) {
      if (selected.some(item => item.label === reqId)) {
        filteredReqResult[reqId] = parseResult[reqId];
      }
    }

    return filteredReqResult;
  }

  /**
   * 筛选标签类型
   * @param filteredReqResult 已筛选的需求结果
   */
  private async filterBlockTypes(filteredReqResult: DocResult): Promise<DocResult | null> {
    // 收集所有标签类型
    let blockTypeSet = new Set<string>();
    for (const test of Object.values(filteredReqResult)) {
      Object.keys(test).forEach(key => {
        blockTypeSet.add(key);
      });
    }

    const blockTypes = Array.from(blockTypeSet).map(type => ({
      label: `@${type}`,
      description: BlockUtils.getBlockTitle(type),
      picked: true
    }));

    const selectedBlockTypes = await vscode.window.showQuickPick(blockTypes, {
      canPickMany: true,
      placeHolder: '选择要导出的标签',
      title: '筛选注解类型'
    });

    if (!selectedBlockTypes) {
      vscode.window.showInformationMessage('未选择任何标签，操作已取消。');
      return null;
    }

    // 筛选选中的标签类型
    const result: DocResult = {};
    for (const reqId of Object.keys(filteredReqResult)) {
      result[reqId] = {};
      for (const blockType of Object.keys(filteredReqResult[reqId])) {
        if (selectedBlockTypes.some(item => item.label === `@${blockType}`)) {
          result[reqId][blockType] = filteredReqResult[reqId][blockType];
        }
      }
      if (Object.keys(result[reqId]).length === 0) {
        delete result[reqId];
      }
    }

    if (Object.keys(result).length === 0) {
      vscode.window.showInformationMessage('没有可导出的需求。');
      return null;
    }

    return result;
  }

  /**
   * 显示Markdown结果
   * @param tempFile 临时文件路径
   */
  public async showMarkdownResult(tempFile: string): Promise<void> {
    try {
      // 如果当前已经有打开的文档，先尝试关闭
      const currentDocumentPath = this.resourceManager.getCurrentDocument();
      if (currentDocumentPath) {
        await this.closeMarkdownPreview();
        this.resourceManager.setCurrentDocument(null);
      }

      // 使用VS Code打开生成的markdown文件
      const doc = await vscode.workspace.openTextDocument(tempFile);

      // 记录当前文档
      this.resourceManager.setCurrentDocument(tempFile);

      // 显示文档
      await vscode.window.showTextDocument(doc);

      // 设置为markdown预览模式
      await vscode.commands.executeCommand('markdown.showPreviewToSide', doc.uri);

      // 强制运行一次垃圾回收，释放内存
      if (typeof global.gc === 'function') {
        try {
          global.gc();
        } catch (e) {
          // 忽略错误
        }
      }
    } catch (error: any) {
      // 确保在出错时将当前文档引用置空
      this.resourceManager.setCurrentDocument(null);

      vscode.window.showErrorMessage(`处理文档输出时出错: ${error.message}`);
      throw error;
    }
  }

  /**
   * 关闭当前打开的Markdown预览窗口
   */
  public async closeMarkdownPreview(): Promise<void> {
    try {
      const currentDocumentPath = this.resourceManager.getCurrentDocument();
      if (currentDocumentPath) {
        // 只关闭当前Markdown预览
        await vscode.commands.executeCommand('markdown.preview.toggleLock');
        const currentUri = vscode.Uri.file(currentDocumentPath);
        await vscode.commands.executeCommand('markdown.showPreviewToSide', currentUri);
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor');

        // 再次确认预览窗口已关闭
        const visibleEditors = vscode.window.visibleTextEditors;
        for (const editor of visibleEditors) {
          if (editor.document.uri.fsPath === currentDocumentPath) {
            await vscode.window.showTextDocument(editor.document, editor.viewColumn);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          }
        }
      }
    } catch (error) {
      this.logger.error('关闭Markdown预览失败', error);
    }
  }
}
