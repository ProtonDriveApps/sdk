namespace Proton.Sdk.Http;

internal sealed class CryptographyTimeProvider : TimeProvider
{
    private long _ticks;

    public override DateTimeOffset GetUtcNow()
    {
        return new DateTimeOffset(_ticks, TimeSpan.Zero);
    }

    public override long GetTimestamp()
    {
        throw new NotSupportedException();
    }

    internal void UpdateTime(DateTimeOffset value)
    {
        var ticks = value.UtcTicks;
        var originalValue = _ticks;

        do
        {
            if (ticks <= originalValue)
            {
                return;
            }
        }
        while (originalValue != (originalValue = Interlocked.CompareExchange(ref _ticks, ticks, originalValue)));
    }
}
