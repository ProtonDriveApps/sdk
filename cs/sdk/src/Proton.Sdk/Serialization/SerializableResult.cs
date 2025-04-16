using System.Text.Json.Serialization;

namespace Proton.Sdk.Serialization;

internal struct SerializableResult<T, TError>
{
    public bool IsSuccess { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public T? Value { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
    public TError? Error { get; set; }
}
