namespace Proton.Sdk.Api.Events;

[Flags]
internal enum EventsRefreshMask : byte
{
    None = 0,
    Mail = 1,
    Contacts = 2,
}
