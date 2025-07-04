using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public readonly struct Result<T, TError>
{
    private readonly T? _value;
    private readonly TError? _error;

    public Result(T value)
    {
        IsSuccess = true;
        _value = value;
        _error = default;
    }

    public Result(TError error)
    {
        IsSuccess = false;
        _error = error;
        _value = default;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    public static implicit operator Result<T, TError>(T value) => new(value);
    public static implicit operator Result<T, TError>(TError error) => new(error);

    public bool TryGetValueElseError([MaybeNullWhen(false)] out T value, [MaybeNullWhen(true)] out TError error)
    {
        value = _value;
        error = _error;
        return IsSuccess;
    }
}
