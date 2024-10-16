declare const _exports: GovernanceRulesManager;
export = _exports;
/**
 *
 * @type Class
 *
 * */
declare function GovernanceRulesManager(): void;
declare class GovernanceRulesManager {
    _lastUpdate: number;
    setLogger(logger: any): void;
    _logger: any;
    log(message: any, details: any): void;
    hasRules(): boolean;
    shouldFetch(): boolean;
    tryGetRules(): Promise<any>;
    _cacheRules(rules: any): void;
    regexRules: any;
    userRulesHashByRuleId: {};
    companyRulesHashByRuleId: {};
    unidentifiedUserRules: any;
    unidentifiedCompanyRules: any;
    _getApplicableRegexRules(requestFields: any, requestBody: any, requestHeaders: any): any;
    _getApplicableUnidentifiedUserRules(requestFields: any, requestBody: any, requestHeaders: any): any;
    _getApplicableUnidentifiedCompanyRules(requestFields: any, requestBody: any, requestHeaders: any): any;
    _getApplicableUserRules(configUserRulesValues: any, requestFields: any, requestBody: any, requestHeaders: any): any[];
    _getApplicableCompanyRules(configCompanyRulesValues: any, requestFields: any, requestBody: any, requestHeaders: any): any[];
    applyRuleList(applicableRules: any, responseHolder: any, configRuleValues: any): any;
    governInternal(config: any, userId: any, companyId: any, requestFields: any, requestBody: any, requestHeaders: any, originalUrl: any): {
        status: any;
        headers: {};
        body: any;
        blocked_by: any;
    };
    governRequestNextJs(config: any, userId: any, companyId: any, requestBody: any, requestHeaders: any, originalUrl: any, originalIp: any, originalMethod: any): {
        status: any;
        headers: {};
        body: any;
        blocked_by: any;
    };
    governRequest(config: any, userId: any, companyId: any, request: any): {
        status: any;
        headers: {};
        body: any;
        blocked_by: any;
    };
}
//# sourceMappingURL=governanceRulesManager.d.ts.map