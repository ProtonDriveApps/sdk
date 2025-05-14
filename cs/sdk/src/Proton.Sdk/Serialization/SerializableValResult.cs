using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal struct SerializableValResult<T, TError>
    where T : struct
    where TError : class?
{
    public bool IsSuccess { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public T? Value { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public TError? Error { get; set; }
}
