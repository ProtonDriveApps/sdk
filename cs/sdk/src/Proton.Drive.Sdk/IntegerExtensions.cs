namespace Proton.Drive.Sdk;

internal static class IntegerExtensions
{
    internal static long DivideAndRoundUp(this long dividend, long divisor)
    {
        return (dividend + divisor - 1) / divisor;
    }
}
