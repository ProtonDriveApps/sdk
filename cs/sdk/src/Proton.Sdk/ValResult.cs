using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public readonly struct ValResult<T, TError>
    where T : struct
    where TError : class?
{
    private readonly T? _value;
    private readonly TError? _error;

    public ValResult(T value)
    {
        IsSuccess = true;
        _value = value;
        _error = null;
    }

    public ValResult(TError error)
    {
        IsSuccess = false;
        _error = error;
        _value = null;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    public static implicit operator ValResult<T, TError>(T value) => new(value);
    public static implicit operator ValResult<T, TError>(TError error) => new(error);

    public bool TryGetValueElseError([NotNullWhen(true)] out T? value, [MaybeNullWhen(true)] out TError error)
    {
        value = _value;
        error = _error;
        return IsSuccess;
    }
}
