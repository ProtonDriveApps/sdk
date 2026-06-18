using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public readonly struct Result<T, TError>
{
    private readonly ResultStatus _status;
    private readonly T? _value;
    private readonly TError? _error;

    public Result(T value)
    {
        _status = ResultStatus.Success;
        _value = value;
        _error = default;
    }

    public Result(TError error)
    {
        _status = ResultStatus.Failure;
        _error = error;
        _value = default;
    }

    private enum ResultStatus : byte
    {
        Invalid = 0,
        Success = 1,
        Failure = 2,
    }

    public bool IsSuccess => ValidStatus is ResultStatus.Success;
    public bool IsFailure => ValidStatus is ResultStatus.Failure;

    private ResultStatus ValidStatus =>
        _status is not ResultStatus.Invalid
            ? _status
            : throw new InvalidOperationException("Result is in an invalid state.");

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
