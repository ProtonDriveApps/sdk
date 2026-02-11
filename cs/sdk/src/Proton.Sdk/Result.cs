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

    public static implicit operator Result<TError>(Result<T, TError> result) =>
        result.TryGetValueElseError(out _, out var error)
            ? Result<TError>.Success
            : new Result<TError>(error);

    public static Result<T, TError> Success(T value)
    {
        return new Result<T, TError>(value);
    }

    public static Result<T, TError> Failure(TError error)
    {
        return new Result<T, TError>(error);
    }

    public bool TryGetValueElseError([NotNullWhen(true)] out T? value, [NotNullWhen(false)] out TError? error)
    {
        value = _value;
        error = _error;
        return IsSuccess;
    }
}
