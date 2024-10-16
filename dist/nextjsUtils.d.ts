export function safeGetNextJsBody(clonedObj: any, options: any): Promise<{
    body: any;
    transferEncoding?: undefined;
} | {
    body?: undefined;
    transferEncoding?: undefined;
} | {
    body: any;
    transferEncoding: string;
}>;
export function getNextJsIp(request: any): any;
export function getNextJsFullUrl(request: any): string;
export function extractNextJsEventDataAndSave({ request, requestTime, response, responseTime, options, saveEvent, blockedBy, }: {
    request: any;
    requestTime: any;
    response: any;
    responseTime: any;
    options: any;
    saveEvent: any;
    blockedBy: any;
}): Promise<any>;
//# sourceMappingURL=nextjsUtils.d.ts.map