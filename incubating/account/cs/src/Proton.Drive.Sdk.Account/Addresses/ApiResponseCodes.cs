namespace Proton.Drive.Sdk.Account.Addresses;

internal static class ApiResponseCodes
{
    /// <summary>
    /// Account is disabled
    /// </summary>
    public const int AccountDeleted = 10_002;

    /// <summary>
    /// Account is disabled due to abuse or fraud
    /// </summary>
    public const int AccountDisabled = 10_003;

    public const int AddressMissing = 33_102;
    public const int DomainExternal = 33_103;
}
