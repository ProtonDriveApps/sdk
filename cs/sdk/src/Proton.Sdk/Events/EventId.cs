using Proton.Sdk.Serialization;

namespace Proton.Sdk.Events;

public readonly record struct EventId(string Value) : IStrongId<EventId>
{
    public static implicit operator EventId(string value)
    {
        return new EventId(value);
    }
}
