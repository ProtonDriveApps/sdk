using System.Net;
using System.Reflection;
using Google.Protobuf;
using Proton.Sdk.CExports.Tasks;

namespace Proton.Sdk.CExports;

internal sealed class InteropHttpClientFactory : IHttpClientFactory
{
    private readonly string _baseUrl;
    private readonly string _sdkVersion;
    private readonly string _sdkTechnicalStack;

    public InteropHttpClientFactory(
        nint bindingsHandle,
        string baseUrl,
        string? bindingsLanguage,
        InteropAction<nint, InteropArray<byte>, nint> sendHttpRequestAction)
    {
        _baseUrl = baseUrl;
        BindingsHandle = bindingsHandle;
        SendHttpRequestAction = sendHttpRequestAction;

        var executingAssembly = Assembly.GetExecutingAssembly();
        var versionAttribute = executingAssembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();
        _sdkVersion = versionAttribute?.InformationalVersion
            ?? executingAssembly.GetName().Version?.ToString(fieldCount: 3)
            ?? "0.0.0";

        var bindingsSuffix = bindingsLanguage is not null
            ? "-" + bindingsLanguage.ToLowerInvariant()
            : string.Empty;

        _sdkTechnicalStack = "dotnet" + bindingsSuffix;
    }

    private nint BindingsHandle { get; }
    private InteropAction<nint, InteropArray<byte>, nint> SendHttpRequestAction { get; }

    public HttpClient CreateClient(string name)
    {
        return new HttpClient(new InteropHttpMessageHandler(this))
        {
            BaseAddress = new Uri(_baseUrl),
            DefaultRequestHeaders =
            {
                { "x-pm-drive-sdk-version", $"{_sdkTechnicalStack}@{_sdkVersion}" },
            },
        };
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

            foreach (var interopHttpResponseHeader in interopHttpResponse.Headers.Where(x => x.Name.StartsWith("content-", StringComparison.OrdinalIgnoreCase)))
            {
                response.Content.Headers.Add(interopHttpResponseHeader.Name, interopHttpResponseHeader.Values);
            }

            return response;
        }
    }
}
