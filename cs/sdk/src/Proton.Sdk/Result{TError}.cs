using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

public readonly struct Result<TError>
{
    public static readonly Result<TError> Success = new();

    private readonly TError? _error;

    public Result(TError error)
    {
        IsSuccess = false;
        _error = error;
    }

    public Result()
    {
        IsSuccess = true;
        _error = default;
    }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;

    public static implicit operator Result<TError>(TError error) => new(error);

    public bool TryGetError([MaybeNullWhen(true)] out TError error)
    {
        error = _error;
        return IsFailure;
    }
}
