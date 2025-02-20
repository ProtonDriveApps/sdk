namespace Proton.Sdk.Serialization;

internal interface IStrongId<T>
    where T : IStrongId<T>
{
    public string Value { get; }

    public static virtual implicit operator string(T id) => id.Value;
    public static abstract implicit operator T(string value);
}
