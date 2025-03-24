namespace Proton.Sdk.Serialization;

internal struct SerializableResult<T, TError>
{
    public bool Successful { get; set; }

    public T? Value { get; set; }

    public TError? Error { get; set; }
}
