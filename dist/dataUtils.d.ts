declare function _getUrlFromRequestOptions(options: any, request: any): string;
declare function _getEventModelFromRequestAndResponse(requestOptions: any, request: any, requestTime: any, requestBody: any, response: any, responseTime: any, responseBody: any): {
    request: {
        verb: any;
        uri: string;
        headers: any;
        time: any;
        transferEncoding: string;
        body: any;
    };
    response: {
        time: any;
        status: any;
        headers: any;
        transferEncoding: string;
        body: any;
    };
};
declare function _safeJsonParse(body: any): {
    body: any;
    transferEncoding: string;
};
declare function _startWithJson(body: any): boolean;
declare function _bodyToBase64(body: any): any;
declare function _hashSensitive(jsonBody: any, debug: any): any;
export function logMessage(debug: any, functionName: any, message: any, details: any): void;
export function timeTookInSeconds(startTime: any, endTime: any): string;
export function isJsonHeader(msg: any): boolean;
export function appendChunk(buf: any, chunk: any): any;
export function computeBodySize(body: any): number;
export function totalChunkLength(chunk1: any, chunk2: any): any;
export function ensureToString(id: any): any;
export { _getUrlFromRequestOptions as getUrlFromRequestOptions, _getEventModelFromRequestAndResponse as getEventModelFromRequestAndResponse, _safeJsonParse as safeJsonParse, _startWithJson as startWithJson, _bodyToBase64 as bodyToBase64, _hashSensitive as hashSensitive };
//# sourceMappingURL=dataUtils.d.ts.map