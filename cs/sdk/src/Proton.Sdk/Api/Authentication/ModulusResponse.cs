using System.Text.Json.Serialization;
using Proton.Sdk.Api;

namespace Proton.Sdk.Api.Authentication;

internal sealed class ModulusResponse : ApiResponse
{
    public required string Modulus { get; set; }

    [JsonPropertyName("ModulusID")]
    public required string ModulusId { get; set; }
}
