# CoDoc 0.0.4 验证记录

验证日期：2026-09-16。范围仅限本仓库，验证对象为本地构建的 VSIX。

按最终确认，取消旧版 VS Code 兼容要求；支持基线为 VS Code 1.137 / Node.js 24。实际 VSIX 已完成当前稳定版隔离安装与宿主验证。

## 交付物

| 项目 | 结果 |
| --- | --- |
| 文件 | `codoc-0.0.4.vsix` |
| 实际 VSIX 大小 | 53,483 字节（52.23 KiB） |
| ZIP 内文件总量 | 104,818 字节（102.36 KiB） |
| 文件数 | 11：9 个扩展文件、2 个 VSIX 元文件 |
| 生产 bundle | 47,716 字节 |
| SHA-256 | `c2c3889ede1d6eeae34b8cddaed44f5e2b372fb7f3becb6bcfac5b2f8298354d` |

VSIX 只包含清单、README、CHANGELOG、MIT 许可证、单个 bundle、第三方许可证、两张实际使用的图标和 snippets。不包含源码、测试、配置文件、source map 或 node_modules。

esbuild 检查全部外部导入；VSIX 中的实际 bundle 通过禁止 npm 模块解析的独立 VM 加载检查，仅加载 `vscode`、`child_process`、`fs` 和 `path`。第三方说明覆盖 minimatch、brace-expansion、balanced-match。

## 构建与回归

最终依赖变更后执行：

```sh
npm ci
npm run verify
npm run package:vsix
```

全部通过：TypeScript 类型检查、ESLint 基础正确性检查、32 项回归测试、生产构建及实际压缩包白名单检查。

回归覆盖全部 11 类标注、5 类实际模板及 DocBlock 变体、主编号与多需求关联、无编号、中文和自由正文、嵌套列表与代码块、BOM／CRLF／首行／前导空行、大文件尾部、重复解析与空结果；真实临时 Git 仓库覆盖无效引用、特殊文件名及取消；服务测试覆盖缓存损坏／过期／越界／写入失败、取消提交、启动缓存竞态、事件释放、多目录、筛选及高亮作用域／幂等行为。

## 实际宿主

```sh
VSCODE_EXECUTABLE_PATH='/Applications/Visual Studio Code.app/Contents/MacOS/Code' npm run test:vsix
```

测试环境：macOS arm64，VS Code **1.137.0 stable**，扩展宿主 Node.js **24.18.1**。

脚本通过 VS Code CLI 将最终 VSIX 安装到临时扩展目录，核对已安装 bundle 与压缩包内容一致，再从该目录运行测试；用户配置与扩展目录均隔离，测试完成后清理。

- 多目录宿主通过：激活、命令注册、无需 Better Comments、启动不修改高亮配置、两个来源目录的扫描、C++ 支持、三种分组命令、通过真实树节点打开源码并精确跳至第 3 行。
- 导出通过：未命名 Markdown、中文及嵌套正文保留、磁盘修改后重新扫描、第二次导出包含最新内容且第一次文档仍保留。
- 空工作区宿主通过：正常激活和命令注册，扫描／导出提供提示并正常返回。

验证范围：Windows／Linux 宿主未实测；高亮应用／更新／移除和 Git 交互由服务回归测试验证，宿主测试验证了无高亮依赖时的主流程。旧版兼容不属于本次交付要求。

## 安装

在 VS Code 1.137 或更新版本中执行「Extensions: Install from VSIX…」，选择本目录的 `codoc-0.0.4.vsix`。扫描、导出和手动高亮的使用及升级说明见 README。
