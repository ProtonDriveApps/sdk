using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public readonly struct Result<TError>
{
    public static readonly Result<TError> Success = new();

    private readonly ResultStatus _status;
    private readonly TError? _error;

    public Result()
    {
        _status = ResultStatus.Success;
        _error = default;
    }

    public Result(TError error)
    {
        _status = ResultStatus.Failure;
        _error = error;
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

    public static implicit operator Result<TError>(TError error) => new(error);

    public static Result<TError> Failure(TError error)
    {
        return new Result<TError>(error);
    }

    public bool TryGetError([MaybeNullWhen(false)] out TError error)
    {
        error = _error;
        return IsFailure;
    }
}
