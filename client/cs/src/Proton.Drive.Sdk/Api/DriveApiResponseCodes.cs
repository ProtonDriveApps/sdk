namespace Proton.Drive.Sdk.Api;

internal static class DriveApiResponseCodes
{
    public const int Success = 1000;
    public const int InvalidRequirements = 2000;
    public const int InvalidValue = 2001;
    public const int NotEnoughPermissions = 2011;
    public const int NotEnoughPermissionsToGrantPermissions = 2026;
    public const int AlreadyExists = 2500;
    public const int DoesNotExist = 2501;
    public const int IncompatibleState = 2511;

    public const int InsufficientQuota = 200_001;
    public const int InsufficientSpace = 200_002;
    public const int MaxFileSizeForFreeUser = 200_003;
    public const int MaxPublicEditModeForFreeUser = 200_004;
    public const int InsufficientVolumeQuota = 200_100;
    public const int InsufficientDeviceQuota = 200_101;
    public const int AlreadyMemberOfShareInVolumeWithAnotherAddress = 200_201;
    public const int TooManyChildren = 200_300;
    public const int NestingTooDeep = 200_301;
    public const int InsufficientInvitationQuota = 200_600;
    public const int InsufficientShareQuota = 200_601;
    public const int InsufficientShareJoinedQuota = 200_602;
    public const int InsufficientBookmarksQuota = 200_800;
}
