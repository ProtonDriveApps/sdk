namespace Proton.Drive.Sdk.Account.Api.Events;

[Flags]
internal enum EventsRefreshMask : byte
{
    None = 0,
    Mail = 1,
    Contacts = 2,
}
