using System.Diagnostics.CodeAnalysis;

namespace Proton.Sdk;

internal readonly struct Either<T1, T2>
{
    private readonly T1? _first;
    private readonly T2? _second;

    public Either(T1 first)
    {
        IsFirst = true;
        _first = first;
        _second = default;
    }

    public Either(T2 second)
    {
        _first = default;
        _second = second;
    }

    public bool IsFirst { get; }
    public bool IsSecond => !IsFirst;

    public static implicit operator Either<T1, T2>(T1 first) => new(first);
    public static implicit operator Either<T1, T2>(T2 second) => new(second);

    public bool TryGetFirstElseSecond([NotNullWhen(true)] out T1? first, [NotNullWhen(false)] out T2? second)
    {
        first = _first;
        second = _second;
        return IsFirst;
    }
}
