using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public sealed class Result<T, TError> : Result<TError>
{
    private readonly T? _value;

    public Result(T value)
    {
        _value = value;
    }

    public Result(TError error)
        : base(error)
    {
        _value = default;
    }

    public static implicit operator Result<T, TError>(T value) => new(value);
    public static implicit operator Result<T, TError>(TError error) => new(error);

    public bool TryGetValue([MaybeNullWhen(false)] out T value, [MaybeNullWhen(true)] out TError error)
    {
        value = _value;
        error = Error;
        return IsSuccess;
    }
}
