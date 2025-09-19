using System.Net.Mime;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;

namespace Proton.Sdk.Http;

internal sealed partial class HttpBodyLoggingHandler(ILogger logger) : DelegatingHandler
{
#if WINDOWS
    private const string NewLine = "\r\n";
#else
    private const string NewLine = "\n";
#endif

    private readonly ILogger _logger = logger;

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        return _logger.IsEnabled(LogLevel.Trace)
            ? SendWithBodyLoggingAsync(request, cancellationToken)
            : base.SendAsync(request, cancellationToken);
    }

    [GeneratedRegex(
        """
        ("(AccessToken|RefreshToken)"\s*:\s*")([A-Za-z0-9]+)("\s*)
        """, RegexOptions.IgnoreCase)]
    private static partial Regex AuthenticationTokensRegex();

    private static string Indent(string json)
    {
        var jsonNode = JsonNode.Parse(json);

        return jsonNode?.ToJsonString(new JsonSerializerOptions { WriteIndented = true }) ?? json;
    }

    private static async ValueTask<string?> TryGetContentAsString(HttpContent? content, CancellationToken cancellationToken)
    {
        if (content is not { Headers.ContentType.MediaType: { } mediaType }
            || (mediaType is not MediaTypeNames.Application.Json
                && !mediaType.StartsWith("text/", StringComparison.OrdinalIgnoreCase)))
        {
            return null;
        }

        var contentString = await content.ReadAsStringAsync(cancellationToken);

        return mediaType is MediaTypeNames.Application.Json ? Indent(contentString) : contentString;
    }

    private async Task<HttpResponseMessage> SendWithBodyLoggingAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var requestContentString = await TryGetContentAsString(request.Content, cancellationToken);
        if (requestContentString is not null)
        {
            _logger.LogInformation($"Request body:{NewLine}{{Body}}", requestContentString);
        }

        var response = await base.SendAsync(request, cancellationToken);

        var responseContentString = await TryGetContentAsString(response.Content, cancellationToken);
        if (responseContentString is not null)
        {
            if (request.RequestUri?.PathAndQuery.Contains("auth/", StringComparison.OrdinalIgnoreCase) == true)
            {
                responseContentString = AuthenticationTokensRegex().Replace(responseContentString, "$1*$4");
            }

            _logger.LogInformation($"Response body:{NewLine}{{Body}}", responseContentString);
        }

        return response;
    }
}
