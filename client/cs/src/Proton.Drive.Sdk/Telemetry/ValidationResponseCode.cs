using Proton.Drive.Sdk.Api;

namespace Proton.Drive.Sdk.Telemetry;

internal static class ValidationResponseCode
{
    /// <summary>
    /// API response codes that represent user-facing validation failures.
    /// Kept in sync with JS <c>apiErrorFactory</c> validation cases.
    /// </summary>
    public static bool IsValidationCode(int code) => code is
        DriveApiResponseCodes.InvalidRequirements
        or DriveApiResponseCodes.InvalidValue
        or DriveApiResponseCodes.NotEnoughPermissions
        or DriveApiResponseCodes.NotEnoughPermissionsToGrantPermissions
        or DriveApiResponseCodes.AlreadyExists
        or DriveApiResponseCodes.DoesNotExist
        or DriveApiResponseCodes.InsufficientQuota
        or DriveApiResponseCodes.InsufficientSpace
        or DriveApiResponseCodes.MaxFileSizeForFreeUser
        or DriveApiResponseCodes.MaxPublicEditModeForFreeUser
        or DriveApiResponseCodes.InsufficientVolumeQuota
        or DriveApiResponseCodes.InsufficientDeviceQuota
        or DriveApiResponseCodes.AlreadyMemberOfShareInVolumeWithAnotherAddress
        or DriveApiResponseCodes.TooManyChildren
        or DriveApiResponseCodes.NestingTooDeep
        or DriveApiResponseCodes.InsufficientInvitationQuota
        or DriveApiResponseCodes.InsufficientShareQuota
        or DriveApiResponseCodes.InsufficientShareJoinedQuota
        or DriveApiResponseCodes.InsufficientBookmarksQuota;
}
