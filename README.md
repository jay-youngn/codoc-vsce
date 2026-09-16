# CoDoc

CoDoc 在 VS Code 中浏览和导出源码里的结构化工程注释。支持按类型、需求／缺陷编号、领域分组，以及内容筛选和源码跳转。支持 VS Code 1.137 及以上版本，不再维护旧版兼容。

## 使用

1. 打开工作区，在侧边栏打开 **CoDoc**，执行「扫描文档注释」。
2. 使用视图菜单选择按类型、需求或领域分组；点击注释跳转到开始行。
3. 「筛选文档」匹配标题、正文、编号和领域；「清除筛选」恢复全部内容。
4. 「导出文档注释」重新扫描已保存文件，再按当前筛选及所选编号／类型生成 Markdown。只有一种编号或类型时自动跳过对应选择。

导出以**未命名 Markdown 文档**和预览展示，可另存；连续导出保留先前打开的文档。正文中的中文字段、普通说明、缩进、列表、代码块和链接会保留。编号按文本显示，不自动生成平台链接。

扫描和导出读取磁盘上**已保存的内容**；有未保存编辑时会提示。读取失败或标注缺少结束标签会报告文件位置，取消或失败不会发布部分扫描结果。大文件完整读取，不因提前找到标注而截断。

## 注释格式

保留五类模板：`doc-summary`、`doc-decision`、`doc-testFocus`、`doc-fix`、`doc-feature`。模板可在 Go、PHP、JavaScript、TypeScript、React、Java、C++ 中使用；PHP／JS／TS／React 也提供 DocBlock 内的 `@summary` 等模板。

```typescript
// @fix(BUG-456) 修复订单金额计算
//  - req: ORDER-123, ORDER-456
//  - domain: order,payment
//  - 原因: 折扣计算顺序错误
//  - 修复方式:
//    - 先应用固定金额折扣
//    - 再应用百分比折扣
//  这里可以继续写说明和 Markdown。
// @endFix
```

`@summary(ID)` 和 `@fix(ID)` 的括号编号是主编号，不会被正文的关联需求覆盖。顶层 `- req:` 可填写多个编号，以英文或中文逗号分隔，任一个均可查询。无编号的注释归入「未关联需求」。`- domain:` 使用同样的列表格式。其他字段和正文自由保留，不要求英文键名。代码块和嵌套列表中的 `req` 不作为顶层元数据。

全部支持的开始标签：`summary`、`fix`、`decision`、`testFocus`、`feature`、`notice`、`comment`、`deployment`、`performance`、`security`、`deprecated`。开始行格式为 `@类型 标题`，结束行使用 `@end类型`（结束标签大小写兼容）。标注可采用 `//` 行注释或 `/** … */` 中逐行 `*` 前缀的注释。

扫描扩展名：`.js`、`.jsx`、`.ts`、`.tsx`、`.vue`、`.java`、`.kt`、`.go`、`.php`、`.c`、`.h`、`.cpp`、`.hpp`、`.cs`、`.swift`、`.rs`。仅识别上述斜杠注释格式，不支持 Python `#`、HTML 注释或语言语法分析；字符串中的同形标记也可能被识别。

## Git 变更导出

命令面板执行 **CoDoc: 从 Git 变更文件导出文档注释**。多目录工作区先选择目录，再输入分支或提交。默认基准为 `HEAD`；取消输入立即结束。

导出的是相对基准提交发生变化的文件中**当前已保存的全部标注**，包括已暂存和未暂存修改；不局限于 diff 行。不包含未跟踪文件和已删除文件。Git 必须可从扩展宿主的 PATH 中调用，输入引用会先校验为提交，文件名按 NUL 分隔处理。

## 缓存与工作区

- 多目录工作区分别扫描并保留来源；嵌套目录中的文件属于更具体的工作区目录。
- 缓存保存于 VS Code 分配的扩展工作区存储。加载时明确显示「历史扫描结果」，文件保存、增删、改名及工作区目录变化后显示「待刷新」。
- 导出总是重新扫描，不以历史缓存作为当前结果。缓存版本不符、根目录变化或数据损坏时重新扫描即可。
- 不再读取或写入旧版本在仓库中的 `.vscode/codoc` 缓存；升级不会删除旧文件。
- 遵循各目录 `files.exclude`、`search.exclude` 中值为 `true` 的排除规则，并排除 `node_modules`、`vendor`、`dist`、`out`、`.git`。不解释带 `when` 的条件排除规则。
- 空工作区仍可执行命令并获得打开目录的提示。

## 可选高亮

扫描、浏览和导出**无需安装其他扩展**。如需高亮，可安装 [Better Comments Next](https://marketplace.visualstudio.com/items?itemName=edwinhuish.better-comments-next)，再执行 **CoDoc: 配置注释高亮**。

命令明确选择「应用／更新」或「移除」，再选择「工作区设置」或「用户设置」。只管理 `source` 以 `codoc:` 开头的标签，保留其他标签。重复应用／移除不会累加标签。选择「移除 → 用户设置」可显式清理旧版全局标签；启动和升级不会自动修改配置。

| 设置 | 行为 |
| --- | --- |
| `codoc.highlightEnabled` | 是否允许手动应用，默认 `true`。关闭后已有标签仍需用命令移除。 |
| `codoc.better-comments.tags` | 五类主要模板的颜色和样式配置；自定义 CoDoc 标签必须包含 `source: "codoc:..."`。 |

更改上述设置后需重新运行高亮配置命令。工作区配置优先于用户配置；移除某个作用域的标签不会删除其他作用域的配置。

## 开发与验证

构建工具需要 **Node.js 24+**；发布 bundle 以 **Node.js 24** 为目标，VS Code API 类型固定为 1.137。esbuild 打包运行依赖，只保留 `vscode` 和 Node 内置模块为外部依赖。

```sh
npm ci
npm run verify          # 类型检查、基础正确性 lint、回归测试、生产构建
npm run package:vsix    # 构建 VSIX，再校验实际压缩包
VSCODE_VERSION=stable npm run test:vsix
```

`test:vsix` 会下载指定版本（或通过 `VSCODE_EXECUTABLE_PATH` 使用现成可执行文件），在临时用户配置和扩展目录中安装实际 VSIX，验证激活、多目录扫描、树视图跳转、连续导出和空工作区。需要可运行图形界面的环境，下载时需要网络。测试不会向日常 VS Code 配置安装扩展。

`npm run compile` 生成含 source map 的开发包；`npm run watch` 供 F5 调试，`npm run typecheck:watch` 独立检查类型。生产包不含 map、源码、测试、构建工具或 `node_modules`。第三方许可证随 bundle 自动生成，白名单校验同时检查必要资源和独立模块加载。

仓库：[jay-youngn/codoc-vsce](https://github.com/jay-youngn/codoc-vsce)。许可证：MIT。
