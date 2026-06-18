using Proton.Sdk.Api;

namespace Proton.Drive.Sdk.Telemetry;

internal static class ValidationResponseCode
{
    /// <summary>
    /// API response codes that represent user-facing validation failures.
    /// Kept in sync with JS <c>apiErrorFactory</c> validation cases.
    /// </summary>
    public static bool IsValidationCode(ResponseCode code) => code switch
    {
        ResponseCode.InvalidRequirements => true,
        ResponseCode.InvalidValue => true,
        ResponseCode.NotEnoughPermissions => true,
        ResponseCode.NotEnoughPermissionsToGrantPermissions => true,
        ResponseCode.AlreadyExists => true,
        ResponseCode.DoesNotExist => true,
        ResponseCode.InsufficientQuota => true,
        ResponseCode.InsufficientSpace => true,
        ResponseCode.MaxFileSizeForFreeUser => true,
        ResponseCode.MaxPublicEditModeForFreeUser => true,
        ResponseCode.InsufficientVolumeQuota => true,
        ResponseCode.InsufficientDeviceQuota => true,
        ResponseCode.AlreadyMemberOfShareInVolumeWithAnotherAddress => true,
        ResponseCode.TooManyChildren => true,
        ResponseCode.NestingTooDeep => true,
        ResponseCode.InsufficientInvitationQuota => true,
        ResponseCode.InsufficientShareQuota => true,
        ResponseCode.InsufficientShareJoinedQuota => true,
        ResponseCode.InsufficientBookmarksQuota => true,
        _ => false,
    };
}
