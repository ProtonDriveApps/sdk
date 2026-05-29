using System.Net;

namespace Proton.Sdk.Api;

public enum ResponseCode
{
    Unknown = 0,

    Unauthorized = HttpStatusCode.Unauthorized,
    Forbidden = HttpStatusCode.Forbidden,
    RequestTimeout = HttpStatusCode.RequestTimeout,

    Success = 1000,
    MultipleResponses = 1001,
    InvalidRequirements = 2000,
    InvalidValue = 2001,
    NotEnoughPermissions = 2011,
    NotEnoughPermissionsToGrantPermissions = 2026,
    InvalidEncryptedIdFormat = 2061,
    AlreadyExists = 2500,
    DoesNotExist = 2501,
    Timeout = 2503,
    IncompatibleState = 2511,
    InvalidApp = 5002,
    OutdatedApp = 5003,
    Offline = 7001,
    IncorrectLoginCredentials = 8002,

    /// <summary>
    /// Account is disabled
    /// </summary>
    AccountDeleted = 10_002,

    /// <summary>
    /// Account is disabled due to abuse or fraud
    /// </summary>
    AccountDisabled = 10_003,

    InvalidRefreshToken = 10013,

    /// <summary>
    /// Free account
    /// </summary>
    NoActiveSubscription = 22_110,

    UnknownAddress = 33_102,

    ProtonDriveUnknown = 200_000,
    InsufficientQuota = 200_001,
    InsufficientSpace = 200_002,
    MaxFileSizeForFreeUser = 200_003,
    MaxPublicEditModeForFreeUser = 200_004,
    InsufficientVolumeQuota = 200_100,
    InsufficientDeviceQuota = 200_101,
    AlreadyMemberOfShareInVolumeWithAnotherAddress = 200_201,
    TooManyChildren = 200_300,
    NestingTooDeep = 200_301,
    InsufficientInvitationQuota = 200_600,
    InsufficientShareQuota = 200_601,
    InsufficientShareJoinedQuota = 200_602,
    InsufficientBookmarksQuota = 200_800,

    CustomCode = 10000000,
    SocketError = CustomCode + 1,
    SessionRefreshFailed = CustomCode + 3,
    SrpError = CustomCode + 4,
}
