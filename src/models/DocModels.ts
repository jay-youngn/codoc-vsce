/**
 * 代码文档注释项
 */
export interface DocItem {
  sn?: number; // 序号
  file: string;
  line: number;
  title: string;
  content: string;
  req?: string | string[];  // 支持单个值或数组
  domain?: string | string[];  // 支持单个值或数组
  check_code?: string;
  check_code_language?: string;
}

/**
 * 文档分组结果 (按需求分组)
 */
export interface DocResult {
  [reqId: string]: {
    [blockType: string]: DocItem[];
  };
}

/**
 * 支持的编程语言映射
 */
export interface LanguageMap {
  [extension: string]: string;
}

/**
 * 代码块匹配结果
 */
export interface BlockMatch {
  blockType: string;
  reqId: string;
  title: string;
  fieldsContent: string;
  startIndex: number;
  endIndex: number;
}
