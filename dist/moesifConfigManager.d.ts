declare const _exports: MoesifConfigManager;
export = _exports;
declare function MoesifConfigManager(): void;
declare class MoesifConfigManager {
    _lastConfigUpdate: number;
    hasConfig(): boolean;
    shouldFetchConfig(): boolean;
    tryGetConfig(): void;
    _loadingConfig: boolean;
    _getSampleRate(userId: any, companyId: any): any;
    shouldSend(userId: any, companyId: any): boolean;
    tryUpdateHash(response: any): void;
    _lastSeenHash: any;
}
//# sourceMappingURL=moesifConfigManager.d.ts.map