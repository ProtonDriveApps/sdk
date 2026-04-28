using System.Text.Json;
using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Api.Files;

internal sealed class RevisionErrorResponse : ApiResponse
{
    public JsonElement? Details { get; init; }
}
