using System.Net;
using Proton.Sdk.CExports.Tasks;
using Proton.Sdk.Http;

namespace Proton.Sdk.CExports;

internal sealed class InteropHttpClientFactory : IHttpClientFactory
{
    private readonly string _baseUrl;

    public InteropHttpClientFactory(
        nint bindingsHandle,
        string baseUrl,
        string? bindingsLanguage,
        InteropFunction<nint, InteropArray<byte>, nint, nint> requestFunction,
        InteropFunction<nint, InteropArray<byte>, nint, nint> responseContentReadFunction,
        InteropAction<nint> cancellationAction)
    {
        _baseUrl = baseUrl;
        BindingsHandle = bindingsHandle;
        RequestFunction = requestFunction;
        ResponseContentReadFunction = responseContentReadFunction;
        CancellationAction = cancellationAction;
    }

    private nint BindingsHandle { get; }
    private InteropFunction<nint, InteropArray<byte>, nint, nint> RequestFunction { get; }
    private InteropFunction<nint, InteropArray<byte>, nint, nint> ResponseContentReadFunction { get; }
    private InteropAction<nint> CancellationAction { get; }

    public HttpClient CreateClient(string name)
    {
        var httpMessageHandler = new CryptographyTimeProvisionHandler
        {
            InnerHandler = new InteropHttpMessageHandler(this),
        };

        return new HttpClient(httpMessageHandler) { BaseAddress = new Uri(_baseUrl) };
    }

    private sealed class InteropHttpMessageHandler(InteropHttpClientFactory owner) : HttpMessageHandler
    {
        private readonly InteropHttpClientFactory _owner = owner;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var taskCompletionSource = new ValueTaskCompletionSource<HttpResponse>();
            var taskCompletionSourceHandle = Interop.AllocHandle(taskCompletionSource);

            var interopHttpRequest = await ConvertHttpRequestToInteropAsync(request, cancellationToken).ConfigureAwait(false);

            try
            {
                var foreignCancellationHandle = _owner.RequestFunction.InvokeWithMessage(
                    _owner.BindingsHandle,
                    interopHttpRequest,
                    (nint)taskCompletionSourceHandle);

                await using (cancellationToken.Register(x => ((InteropHttpClientFactory)x!).CancellationAction.Invoke(foreignCancellationHandle), _owner))
                {
                    var interopHttpResponse = await taskCompletionSource.Task.ConfigureAwait(false);

                    return ConvertHttpResponseFromInterop(interopHttpResponse);
                }
            }
            finally
            {
                if (interopHttpRequest.HasSdkContentHandle)
                {
                    Interop.FreeHandle<Stream>(interopHttpRequest.SdkContentHandle);
                }
            }
        }

        private static async ValueTask<HttpRequest> ConvertHttpRequestToInteropAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri?.AbsoluteUri ?? throw new InvalidOperationException($"Missing URL for HTTP request: {request.RequestUri}");

            var interopHttpRequest = new HttpRequest { Url = url, Method = request.Method.Method, Type = (HttpRequestType)request.GetRequestType() };

            var headers = request.Headers.AsEnumerable();

            if (request.Content is not null)
            {
                headers = headers.Concat(request.Content.Headers);

                var contentStream = await request.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);

                interopHttpRequest.SdkContentHandle = Interop.AllocHandle(contentStream);
            }

            interopHttpRequest.Headers.AddRange(
                headers.Select(h =>
                {
                    var header = new HttpHeader { Name = h.Key };
                    header.Values.AddRange(h.Value);
                    return header;
                }));

            return interopHttpRequest;
        }

        private HttpResponseMessage ConvertHttpResponseFromInterop(HttpResponse interopHttpResponse)
        {
            var response = new HttpResponseMessage((HttpStatusCode)interopHttpResponse.StatusCode);

            if (interopHttpResponse.HasBindingsContentHandle)
            {
                response.Content = new StreamContent(
                    new InteropStream(null, (nint)interopHttpResponse.BindingsContentHandle, _owner.ResponseContentReadFunction));
            }

            foreach (var interopHttpResponseHeader in interopHttpResponse.Headers)
            {
                if ((interopHttpResponseHeader.Name.StartsWith("content-", StringComparison.OrdinalIgnoreCase)
                    || interopHttpResponseHeader.Name.Equals("expires", StringComparison.OrdinalIgnoreCase)
                    || interopHttpResponseHeader.Name.Equals("allow", StringComparison.OrdinalIgnoreCase)
                    || interopHttpResponseHeader.Name.Equals("last-modified", StringComparison.OrdinalIgnoreCase))
                    && response.Content.Headers.TryAddWithoutValidation(interopHttpResponseHeader.Name, interopHttpResponseHeader.Values))
                {
                    continue;
                }

                response.Headers.TryAddWithoutValidation(interopHttpResponseHeader.Name, interopHttpResponseHeader.Values);
            }

            return response;
        }
    }
}
