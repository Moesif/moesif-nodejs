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
    _getApplicableRegexRules(requestFields: any, requestBody: any): any;
    _getApplicableUnidentifiedUserRules(requestFields: any, requestBody: any): any;
    _getApplicableUnidentifiedCompanyRules(requestFields: any, requestBody: any): any;
    _getApplicableUserRules(configUserRulesValues: any, requestFields: any, requestBody: any): any[];
    _getApplicableCompanyRules(configCompanyRulesValues: any, requestFields: any, requestBody: any): any[];
    applyRuleList(applicableRules: any, responseHolder: any, configRuleValues: any): any;
    governRequest(config: any, userId: any, companyId: any, request: any): {
        status: any;
        headers: {};
        body: any;
        blocked_by: any;
    };
    tryUpdateHash(response: any): void;
    _lastSeenHash: any;
}
//# sourceMappingURL=governanceRulesManager.d.ts.map