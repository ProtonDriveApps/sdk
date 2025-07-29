import { apiErrorFactory } from './errors';
import * as errors from './errors';
import { ErrorCode } from './errorCodes';

function mockAPIResponseAndResult(options: {
    httpStatusCode?: number;
    httpStatusText?: string;
    code: number;
    message?: string;
}) {
    const { httpStatusCode = 422, httpStatusText = 'Unprocessable Entity', code, message = 'API error' } = options;

    const result = { Code: code, Error: message };
    const response = new Response(JSON.stringify(result), { status: httpStatusCode, statusText: httpStatusText });

    return { response, result };
}

describe('apiErrorFactory should return', () => {
    it('generic APIHTTPError when there is no specifc body', () => {
        const response = new Response('', { status: 404, statusText: 'Not found' });
        const error = apiErrorFactory({ response });
        expect(error).toBeInstanceOf(errors.APIHTTPError);
        expect(error.message).toBe('Not found');
        expect((error as errors.APIHTTPError).statusCode).toBe(404);
    });

    it('generic APIHTTPError with generic message when there is no specifc statusText', () => {
        const response = new Response('', { status: 404, statusText: '' });
        const error = apiErrorFactory({ response });
        expect(error).toBeInstanceOf(errors.APIHTTPError);
        expect(error.message).toBe('Unknown error');
        expect((error as errors.APIHTTPError).statusCode).toBe(404);
    });

    it('generic APIHTTPError when there 404 both in status code and body code', () => {
        const error = apiErrorFactory(
            mockAPIResponseAndResult({
                httpStatusCode: 404,
                httpStatusText: 'Path not found',
                code: 404,
                message: 'Not found',
            }),
        );
        expect(error).toBeInstanceOf(errors.APIHTTPError);
        expect(error.message).toBe('Path not found');
        expect((error as errors.APIHTTPError).statusCode).toBe(404);
    });

    it('generic APICodeError when there is body even if wrong', () => {
        const result = {};
        const response = new Response('', { status: 422 });
        const error = apiErrorFactory({ response, result });
        expectAPICodeError(error, 0, 'Unknown error');
    });

    it('generic APICodeError when there is body but not specific handle', () => {
        const error = apiErrorFactory(mockAPIResponseAndResult({ code: 42, message: 'General error' }));
        expectAPICodeError(error, 42, 'General error');
    });

    it('NotFoundAPIError when code is ErrorCode.NOT_EXISTS', () => {
        const error = apiErrorFactory(mockAPIResponseAndResult({ code: ErrorCode.NOT_EXISTS, message: 'Not found' }));
        expect(error).toBeInstanceOf(errors.NotFoundAPIError);
        expectAPICodeError(error, ErrorCode.NOT_EXISTS, 'Not found');
    });
});

function expectAPICodeError(error: Error, code: number, message: string) {
    expect(error).toBeInstanceOf(errors.APICodeError);
    expect(error.message).toBe(message);
    expect((error as errors.APICodeError).code).toBe(code);
}
