namespace Proton.Drive.Sdk.Account.Caching;

internal interface IAccountClientCache
{
    IAccountEntityCache Entities { get; }
    IAccountSecretCache Secrets { get; }
    ISessionSecretCache SessionSecrets { get; }
    IPublicKeyCache PublicKeys { get; }
}
