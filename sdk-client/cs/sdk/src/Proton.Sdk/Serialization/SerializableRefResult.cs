using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal struct SerializableRefResult<T, TError>
    where T : class?
    where TError : class?
{
    public bool IsSuccess { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public T? Value { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TError? Error { get; set; }
}
