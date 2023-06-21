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
 * @property {boolean} [logBody]
 * @property {boolean} [debug]
 * @property {boolean} [noAutoHideSensitive]
 * @property {(error: object) => any} [callback]
 * @property {boolean} [disableBatching]
 * @property {number} [batchSize]
 * @property {number} [batchMaxTime]
 * @property {string} [baseUri] - switch to another collector for those using proxy
 * @property {number} [retry] - must be between 0 to 3 if provided.
 * @property {number} [requestMaxBodySize] - default 100000
 * @property {number} [responseMaxBodySize] - default 100000
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
    logBody?: boolean;
    debug?: boolean;
    noAutoHideSensitive?: boolean;
    callback?: (error: object) => any;
    disableBatching?: boolean;
    batchSize?: number;
    batchMaxTime?: number;
    /**
     * - switch to another collector for those using proxy
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
};
//# sourceMappingURL=index.d.ts.map