namespace Proton.Sdk.Serialization;

internal interface IStrongId<T>
    where T : IStrongId<T>
{
    public static virtual implicit operator string(T id) => id.ToString();
    public static abstract explicit operator T(string? value);

    public string ToString();
}
