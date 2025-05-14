using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public readonly struct RefResult<T, TError>
    where T : class?
    where TError : class?
{
    private readonly T? _value;
    private readonly TError? _error;

    public RefResult(T value)
    {
        IsSuccess = true;
        _value = value;
        _error = null;
    }

    public RefResult(TError error)
    {
        IsSuccess = false;
        _error = error;
        _value = null;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    public static implicit operator RefResult<T, TError>(T value) => new(value);
    public static implicit operator RefResult<T, TError>(TError error) => new(error);

    public bool TryGetValueElseError([MaybeNullWhen(false)] out T value, [MaybeNullWhen(true)] out TError error)
    {
        value = _value;
        error = _error;
        return IsSuccess;
    }
}
