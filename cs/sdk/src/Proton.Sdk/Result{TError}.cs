using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public class Result<TError>
{
    public static readonly Result<TError> Success = new();

    public Result(TError error)
    {
        IsSuccess = false;
        Error = error;
    }

    protected Result()
    {
        IsSuccess = true;
        Error = default;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    protected TError? Error { get; }

    public static implicit operator Result<TError>(TError error) => new(error);

    public bool TryGetError([MaybeNullWhen(true)] out TError error)
    {
        error = Error;
        return IsFailure;
    }
}
