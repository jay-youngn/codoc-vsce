export type ViewMode = 'byType' | 'byDomain' | 'byReq';
export interface DocGroup { kind: 'type' | 'domain' | 'req'; key: string; reqId?: string; }
