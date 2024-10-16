export = makeMoesifMiddleware;
/**
 * @typedef {Object} MoesifOptions
 * @property {string} applicationId
 * @property {(req: object, res: object) => string | undefined | null} [identifyUser]
 * @property {(req: object, res: object) => string | undefined | null} [identifyCompany]
 * @property {(req: object, res: object) => string | undefined | null} [getSessionToken]
 * @property {(req: object, res: object) => string | undefined | null} [getApiVersion]
 * @property {(req: object, res: object) => object | undefined | null} [getMetadata]
 * @property {(req: object, res: object) => boolean | undefined | null | any} [skip]
 * @property {(eventModel: object) => object} [maskContent]
 * @property {boolean} [logBody] - default true
 * @property {boolean} [debug]
 * @property {boolean} [noAutoHideSensitive]
 * @property {(error: object) => any} [callback]
 * @property {boolean} [disableBatching]
 * @property {number} [batchSize] - default 200
 * @property {number} [batchMaxTime] - default 2000
 * @property {string} [baseUri] - switch to another collector endpoint when using proxy
 * @property {number} [retry] - must be between 0 to 3 if provided.
 * @property {number} [requestMaxBodySize] - default 100000
 * @property {number} [responseMaxBodySize] - default 100000
 * @property {number} [maxOutgoingTimeout] - default 30000
 */
/**
 *  @param {MoesifOptions} options
 */
declare function makeMoesifMiddleware(options: MoesifOptions): {
    (arg1: object, arg2?: any, arg3?: any): any;
    /**
     * @param {object} userModel - https://www.moesif.com/docs/api?javascript--nodejs#update-a-user
     * @param {function} [cb]
     */
    updateUser(userModel: object, cb?: Function): Promise<any>;
    /**
     * @param {object[]} usersBatchModel
     * @param {function} [cb]
     */
    updateUsersBatch(usersBatchModel: object[], cb?: Function): Promise<any>;
    /**
     * @param {object} companyModel - https://www.moesif.com/docs/api?javascript--nodejs#companies
     * @param {function} [cb]
     */
    updateCompany(companyModel: object, cb?: Function): Promise<any>;
    /**
     * @param {object[]} companiesBatchModel
     * @param {function} [cb]
     */
    updateCompaniesBatch(companiesBatchModel: object[], cb?: Function): Promise<any>;
    updateSubscription(subscriptionModel: any, cb: any): Promise<any>;
    updateSubscriptionsBatch(subscriptionBatchModel: any, cb: any): Promise<any>;
    startCaptureOutgoing(): void;
};
declare namespace makeMoesifMiddleware {
    export { MoesifOptions };
}
type MoesifOptions = {
    applicationId: string;
    identifyUser?: (req: object, res: object) => string | undefined | null;
    identifyCompany?: (req: object, res: object) => string | undefined | null;
    getSessionToken?: (req: object, res: object) => string | undefined | null;
    getApiVersion?: (req: object, res: object) => string | undefined | null;
    getMetadata?: (req: object, res: object) => object | undefined | null;
    skip?: (req: object, res: object) => boolean | undefined | null | any;
    maskContent?: (eventModel: object) => object;
    /**
     * - default true
     */
    logBody?: boolean;
    debug?: boolean;
    noAutoHideSensitive?: boolean;
    callback?: (error: object) => any;
    disableBatching?: boolean;
    /**
     * - default 200
     */
    batchSize?: number;
    /**
     * - default 2000
     */
    batchMaxTime?: number;
    /**
     * - switch to another collector endpoint when using proxy
     */
    baseUri?: string;
    /**
     * - must be between 0 to 3 if provided.
     */
    retry?: number;
    /**
     * - default 100000
     */
    requestMaxBodySize?: number;
    /**
     * - default 100000
     */
    responseMaxBodySize?: number;
    /**
     * - default 30000
     */
    maxOutgoingTimeout?: number;
};
//# sourceMappingURL=index.d.ts.map