using System.Text.Json.Serialization;

namespace Proton.Sdk.Api;

public class ApiResponse
{
    public required int Code { get; init; }

    [JsonPropertyName("Error")]
    public string? ErrorMessage { get; init; }

    public bool IsSuccess => Code is ApiResponseCodes.Success;
}
