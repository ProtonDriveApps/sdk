namespace Proton.Drive.Sdk.Api.Shares;

[Flags]
public enum ShareMemberPermissions
{
    None = 0,
    Write = 2,
    Read = 4,
    Admin = 16,
}
