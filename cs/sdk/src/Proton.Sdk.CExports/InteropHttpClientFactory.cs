using System.Net;
using Google.Protobuf;
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
        InteropAction<nint, InteropArray<byte>, nint> sendHttpRequestAction)
    {
        _baseUrl = baseUrl;
        BindingsHandle = bindingsHandle;
        SendHttpRequestAction = sendHttpRequestAction;
    }

    private nint BindingsHandle { get; }
    private InteropAction<nint, InteropArray<byte>, nint> SendHttpRequestAction { get; }

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

            _owner.SendHttpRequestAction.InvokeWithMessage(_owner.BindingsHandle, interopHttpRequest, (nint)taskCompletionSourceHandle);

            var interopHttpResponse = await taskCompletionSource.Task.ConfigureAwait(false);

            return ConvertHttpResponseFromInterop(interopHttpResponse);
        }

        private static async ValueTask<HttpRequest> ConvertHttpRequestToInteropAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var url = request.RequestUri?.AbsoluteUri ?? throw new InvalidOperationException($"Missing URL for HTTP request: {request.RequestUri}");

            var interopHttpRequest = new HttpRequest { Url = url, Method = request.Method.Method };

            var headers = request.Headers.AsEnumerable();

            if (request.Content is not null)
            {
                headers = headers.Concat(request.Content.Headers);

                interopHttpRequest.Content = await ByteString.FromStreamAsync(
                    await request.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false),
                    cancellationToken).ConfigureAwait(false);
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

        private static HttpResponseMessage ConvertHttpResponseFromInterop(HttpResponse interopHttpResponse)
        {
            var response = new HttpResponseMessage((HttpStatusCode)interopHttpResponse.StatusCode)
            {
                Content = new ReadOnlyMemoryContent(interopHttpResponse.Content.Memory),
            };

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
