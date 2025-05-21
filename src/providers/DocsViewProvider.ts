import * as vscode from 'vscode';

import { BlockUtils } from '../utils/BlockUtils';
import { DocItem, DocResult } from '../models/DocModels';
import { DocumentService } from '../services/DocumentService';
import { CacheService } from '../services/CacheService';
import { NotificationUtils } from '../utils/common/NotificationUtils';
import { DocTreeItem } from './DocTreeItem';

/**
 * 文档树视图提供者
 */
export class DocsViewProvider implements vscode.TreeDataProvider<DocTreeItem>, vscode.Disposable {
  private _onDidChangeTreeData: vscode.EventEmitter<DocTreeItem | undefined | null | void> = new vscode.EventEmitter<DocTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DocTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

  private docResult: DocResult = {};
  private docResultLastSync: Date | undefined;
  private isLoading: boolean = false;
  private loadingMessage: string = '正在扫描工作区...';
  private loadingTimer: NodeJS.Timeout | undefined;
  private viewMode: ViewMode = 'byType';
  private filterText: string = '';
  private isFiltering: boolean = false;
  private hasLoadedFromCache: boolean = false;

  private disposables: vscode.Disposable[] = [];

  constructor(
    private workspaceRoot: string,
    private cacheService?: CacheService
  ) {
    // 注册筛选命令
    this.disposables.push(
      vscode.commands.registerCommand('codoc.filter', () => this.showFilterInput()),
      vscode.commands.registerCommand('codoc.filterClear', () => this.clearFilter())
    );

    // 初始化上下文
    vscode.commands.executeCommand('setContext', 'codoc.isFiltering', false);

    // 初始化按钮状态
    this.updateButtonStates();
  }

  /**
   * 处理视图被激活的事件
   * 仅在首次激活时加载缓存数据
   */
  public onViewActivated(): void {
    if (!this.hasLoadedFromCache) {
      this.loadFromCache();
      this.hasLoadedFromCache = true;
    }
  }

  /**
   * 更新文档数据，并保存到缓存
   */
  public updateDocs(docResult: DocResult): void {
    this.docResult = docResult;
    this.docResultLastSync = new Date();

    // 保存到缓存
    if (this.cacheService) {
      this.cacheService.saveScanResult(docResult, this.docResultLastSync);
    }

    this.updateButtonStates();
    this.refresh();
  }

  /**
   * 设置视图模式
   */
  public setViewMode(mode: ViewMode): void {
    this.viewMode = mode;
    this.refresh();
  }

  public async exportDocs(docServ: DocumentService): Promise<void> {
    // 应用筛选条件
    let docResultToExport = this.docResult;

    // 如果正在筛选状态且有筛选文本，则导出筛选后的结果
    if (this.isFiltering && this.filterText) {
      // 创建过滤后的 DocResult
      const filteredResult: DocResult = {};

      // 遍历所有需求项
      for (const reqId of Object.keys(this.docResult)) {
        const sections = this.docResult[reqId];
        const filteredSections: Record<string, DocItem[]> = {};
        let hasMatchingItems = false;

        // 遍历各个区块类型
        for (const blockType of Object.keys(sections)) {
          const items = sections[blockType];
          // 筛选匹配的项目
          const matchingItems = items.filter(item => this.itemMatchesFilter(item));

          if (matchingItems.length > 0) {
            filteredSections[blockType] = matchingItems;
            hasMatchingItems = true;
          }
        }

        // 如果该需求有匹配项，则添加到结果中
        if (hasMatchingItems) {
          filteredResult[reqId] = filteredSections;
        }
      }

      // 使用筛选后的结果
      docResultToExport = filteredResult;
    }

    const res = await docServ.processResultFilter(docResultToExport);
    if (!res) {
      return
    }

    const filepath = await docServ.generateMarkdown(res);
    docServ.showMarkdownResult(filepath)
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }

  /**
   * 更新所有按钮的启用状态
   */
  private updateButtonStates(): void {
    // 默认状态下启用所有按钮
    let scanEnabled = !this.isLoading;
    let exportEnabled = !this.isLoading && Object.keys(this.docResult).length > 0;
    let filterEnabled = !this.isLoading && Object.keys(this.docResult).length > 0;
    let filterClearEnabled = !this.isLoading && this.isFiltering;
    let viewModeEnabled = !this.isLoading && Object.keys(this.docResult).length > 0;

    // 设置上下文变量
    vscode.commands.executeCommand('setContext', 'codoc.scanEnabled', scanEnabled);
    vscode.commands.executeCommand('setContext', 'codoc.exportEnabled', exportEnabled);
    vscode.commands.executeCommand('setContext', 'codoc.filterEnabled', filterEnabled);
    vscode.commands.executeCommand('setContext', 'codoc.filterClearEnabled', filterClearEnabled);
    vscode.commands.executeCommand('setContext', 'codoc.viewModeEnabled', viewModeEnabled);
  }

  /**
   * 从缓存加载文档数据
   */
  private loadFromCache(): void {
    if (!this.cacheService) {
      return;
    }

    const cachedData = this.cacheService.loadScanResult();
    if (cachedData && cachedData.result) {
      this.docResult = cachedData.result;
      this.updateButtonStates();
      this.refresh();

      this.docResultLastSync = new Date(cachedData.timestamp);

      // 显示加载成功消息，包含时间戳
      const loadTime = this.docResultLastSync.toLocaleString();
      NotificationUtils.showAutoHideMessage(`已从缓存加载扫描结果 (${loadTime})`, 3000);
    }
  }

  /**
   * 显示筛选输入框
   */
  private async showFilterInput(): Promise<void> {
    const input = await vscode.window.showInputBox({
      placeHolder: '输入筛选文本...',
      prompt: '输入要筛选的文本，将会匹配文档标题和内容'
    });

    if (input !== undefined) {  // 用户点击确定（包括输入空字符串）
      this.filterText = input;
      this.isFiltering = Boolean(input); // 仅当有实际输入时才设置筛选状态
      vscode.commands.executeCommand('setContext', 'codoc.isFiltering', this.isFiltering);
      this.updateButtonStates();
      this.refresh();
    }
  }

  /**
   * 清除筛选
   */
  private clearFilter(): void {
    this.filterText = '';
    this.isFiltering = false;
    vscode.commands.executeCommand('setContext', 'codoc.isFiltering', false);
    this.updateButtonStates();
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: DocTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: DocTreeItem): Promise<DocTreeItem[]> {
    if (!this.workspaceRoot) {
      return Promise.resolve([]);
    }

    // 根节点处理
    if (!element) {
      return this.getDocTreeItems();
    }

    // 子节点处理
    return this.getChildItems(element);
  }

  private isEmpty(): boolean {
    return Object.keys(this.docResult).length === 0;
  }

  private getDocTreeItems(): DocTreeItem[] {
    return [...this.getRootItems(), ...this.getModeItems()];
  }

  /**
   * 获取根节点项目 (树视图下的状态栏)
   */
  private getRootItems(): DocTreeItem[] {
    const rootItems: DocTreeItem[] = [];

    if (this.isLoading) {
      // 创建加载中显示项
      const loadingItem = new DocTreeItem(
        '',
        vscode.TreeItemCollapsibleState.None,
        this.workspaceRoot,
        undefined,
        `${this.loadingMessage}`,
      );
      loadingItem.iconPath = new vscode.ThemeIcon('sync~spin');

      rootItems.push(loadingItem);
    } else if (this.isFiltering) {
      // 添加筛选状态项，包含按钮图标
      const filterStatus = new DocTreeItem(
        '',
        vscode.TreeItemCollapsibleState.None,
        this.workspaceRoot,
        undefined,
        this.isFiltering ? `filter active: "${this.filterText}"` : '',
      );
      filterStatus.iconPath = new vscode.ThemeIcon('filter');

      rootItems.push(filterStatus);
    } else if (this.isEmpty()) {
      const emptyStatus = new DocTreeItem(
        '',
        vscode.TreeItemCollapsibleState.None,
        this.workspaceRoot,
        undefined,
        '文档注释待扫描'
      );
      emptyStatus.iconPath = new vscode.ThemeIcon('info');

      rootItems.push(emptyStatus);
    } else {

      let message = '已加载全部文档注释';
      if (this.docResultLastSync) {
        const lastSyncTime = this.docResultLastSync.toLocaleString();
        message = `最后同步时间: ${lastSyncTime}`;
      }

      const defaultStatus = new DocTreeItem(
        '',
        vscode.TreeItemCollapsibleState.None,
        this.workspaceRoot,
        undefined,
        message
      );
      defaultStatus.iconPath = new vscode.ThemeIcon('pass');

      rootItems.push(defaultStatus);
    }

    return rootItems;
  }

  private getModeItems(): DocTreeItem[] {
    if (this.isEmpty()) {
      return [];
    }

    switch (this.viewMode) {
      case 'byDomain':
        return this.getDomainRootItems();
      case 'byReq':
        return this.getReqRootItems();
      case 'byType':
      default:
        return this.getTypeRootItems();
    }
  }

  /**
   * 获取子节点项目
   */
  private getChildItems(element: DocTreeItem): DocTreeItem[] {
    if (!element.contextValue) return [];

    if (element.contextValue.startsWith('type:')) {
      const [, blockType, reqId] = element.contextValue.split(':');
      return this.getTypeItemsForReq(blockType, reqId);
    }

    switch (element.contextValue) {
      case 'domain':
        return this.getDomainChildren(element.label);
      case 'req':
        return this.getReqChildren(element.label);
      case 'type':
        return this.getTypeChildren(element.label);
      default:
        return [];
    }
  }

  /**
   * 筛选DocItem是否匹配筛选条件
   */
  private itemMatchesFilter(item: DocItem): boolean {
    if (!this.isFiltering || !this.filterText) {
      return true;
    }
    const searchText = this.filterText.toLowerCase();
    return (
      item.title.toLowerCase().includes(searchText) ||
      (item.content?.toLowerCase().includes(searchText) ?? false)
    );
  }

  /**
   * 获取按类型分组的根节点
   */
  private getTypeRootItems(): DocTreeItem[] {
    const allBlockTypes = new Set<string>();
    for (const reqId of Object.keys(this.docResult)) {
      const sections = this.docResult[reqId];
      for (const blockType of Object.keys(sections)) {
        // 只添加有匹配筛选条件的项目的类型
        if (sections[blockType].some(item => this.itemMatchesFilter(item))) {
          allBlockTypes.add(blockType);
        }
      }
    }

    return Array.from(allBlockTypes)
      .sort()
      .map(blockType => {
        const count = this.countBlockType(blockType);
        return new DocTreeItem(
          BlockUtils.getBlockTitle(blockType),
          vscode.TreeItemCollapsibleState.Collapsed,
          this.workspaceRoot,
          undefined,
          `(${count})`,
          undefined,
          'type'
        );
      });
  }

  /**
   * 获取按领域分组的根节点
   */
  private getDomainRootItems(): DocTreeItem[] {
    const domains = new Set<string>();
    for (const sections of Object.values(this.docResult)) {
      for (const items of Object.values(sections)) {
        for (const item of items) {
          if (this.itemMatchesFilter(item) && item.domain) {
            const itemDomains = Array.isArray(item.domain) ? item.domain : [item.domain];
            itemDomains.forEach(d => domains.add(d));
          }
        }
      }
    }

    return Array.from(domains)
      .sort()
      .map(domain => new DocTreeItem(
        domain,
        vscode.TreeItemCollapsibleState.Collapsed,
        this.workspaceRoot,
        undefined,
        undefined,
        undefined,
        'domain'
      ));
  }

  /**
   * 获取按需求分组的根节点
   */
  private getReqRootItems(): DocTreeItem[] {
    const reqWithMatchingItems = Object.entries(this.docResult)
      .filter(([, sections]) =>
        Object.values(sections).some(items =>
          items.some(item => this.itemMatchesFilter(item))
        )
      )
      .map(([reqId]) => reqId)
      .sort();

    return reqWithMatchingItems.map(reqId => new DocTreeItem(
      reqId,
      vscode.TreeItemCollapsibleState.Collapsed,
      this.workspaceRoot,
      undefined,
      undefined,
      undefined,
      'req'
    ));
  }

  /**
   * 获取领域节点的子项目
   */
  private getDomainChildren(domain: string): DocTreeItem[] {
    const items: DocTreeItem[] = [];
    for (const sections of Object.values(this.docResult)) {
      for (const blockItems of Object.values(sections)) {
        for (const item of blockItems) {
          const itemDomains = Array.isArray(item.domain) ? item.domain : [item.domain];
          if (itemDomains.includes(domain) && this.itemMatchesFilter(item)) {
            items.push(new DocTreeItem(
              item.title,
              vscode.TreeItemCollapsibleState.None,
              this.workspaceRoot,
              undefined,
              undefined,
              item
            ));
          }
        }
      }
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * 获取需求节点的子项目
   */
  private getReqChildren(reqId: string): DocTreeItem[] {
    const sections = this.docResult[reqId];
    if (!sections) {
      return [];
    }

    return Object.entries(sections)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([blockType, blockItems]) => {
        const filteredItems = blockItems.filter(item => this.itemMatchesFilter(item));
        if (filteredItems.length === 0) {
          return null;
        }

        return new DocTreeItem(
          BlockUtils.getBlockTitle(blockType),
          vscode.TreeItemCollapsibleState.Collapsed,
          this.workspaceRoot,
          undefined,
          `(${filteredItems.length})`,
          undefined,
          `type:${blockType}:${reqId}`
        );
      })
      .filter((item): item is DocTreeItem => item !== null);
  }

  /**
   * 获取类型节点的子项目
   */
  private getTypeChildren(typeTitle: string): DocTreeItem[] {
    const blockType = this.getBlockTypeByTitle(typeTitle);
    if (!blockType) return [];

    const items: DocTreeItem[] = [];
    for (const [reqId, sections] of Object.entries(this.docResult)) {
      if (sections[blockType]) {
        for (const item of sections[blockType]) {
          if (this.itemMatchesFilter(item)) {
            items.push(new DocTreeItem(
              item.title,
              vscode.TreeItemCollapsibleState.None,
              this.workspaceRoot,
              undefined,
              reqId,
              item
            ));
          }
        }
      }
    }
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * 获取指定需求下某类型的所有文档项
   */
  private getTypeItemsForReq(blockType: string, reqId: string): DocTreeItem[] {
    const items = this.docResult[reqId][blockType] || [];
    return items
      .filter(item => this.itemMatchesFilter(item))
      .map(item => new DocTreeItem(
        item.title,
        vscode.TreeItemCollapsibleState.None,
        this.workspaceRoot,
        undefined,
        `${item.file}:${item.line}`,
        item
      ));
  }

  /**
   * 统计指定类型的文档数量
   */
  private countBlockType(blockType: string): number {
    let count = 0;
    for (const sections of Object.values(this.docResult)) {
      if (sections[blockType]) {
        count += sections[blockType].filter(item => this.itemMatchesFilter(item)).length;
      }
    }
    return count;
  }

  /**
   * 根据显示标题获取对应的块类型
   */
  private getBlockTypeByTitle(title: string): string | undefined {
    const blockTypes = ['summary', 'decision', 'testFocus', 'fix', 'feature', 'notice', 'performance', 'security', 'deployment'];
    for (const type of blockTypes) {
      if (BlockUtils.getBlockTitle(type) === title) {
        return type;
      }
    }
    return undefined;
  }

  /**
   * 设置加载状态
   * @param loading 是否正在加载
   * @param message 可选的加载消息
   */
  setLoading(loading: boolean, message?: string): void {
    this.isLoading = loading;

    if (!loading) {
      // 停止加载时清除定时器
      if (this.loadingTimer) {
        clearInterval(this.loadingTimer);
        this.loadingTimer = undefined;
      }
    } else {
      // 设置加载消息
      if (message) {
        this.loadingMessage = message;
      }

      // 启动自动刷新定时器以更新动画
      if (!this.loadingTimer) {
        this.loadingTimer = setInterval(() => {
          this.refresh();
        }, 300);
      }
    }

    this.updateButtonStates();
    this.refresh();
  }
}
