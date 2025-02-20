using System.Text.Json;
using Proton.Cryptography.Pgp;
using Proton.Sdk.Addresses;
using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Authentication;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Events;
using Proton.Sdk.Serialization;
using Proton.Sdk.Users;

namespace Proton.Sdk;

internal static class ProtonApiDefaults
{
    public static Uri BaseUrl { get; } = new("https://drive-api.proton.me/");

    public static Uri RefreshRedirectUri { get; } = new("https://proton.me");

    public static JsonSerializerOptions GetSerializerOptions()
    {
        return new JsonSerializerOptions
        {
            Converters =
            {
                new PgpArmoredBlockJsonConverter<PgpArmoredMessage>(PgpBlockType.Message, bytes => new PgpArmoredMessage(bytes)),
                new PgpArmoredBlockJsonConverter<PgpArmoredSignature>(PgpBlockType.Signature, bytes => new PgpArmoredSignature(bytes)),
                new PgpArmoredBlockJsonConverter<PgpArmoredPublicKey>(PgpBlockType.PublicKey, bytes => new PgpArmoredPublicKey(bytes)),
                new PgpArmoredBlockJsonConverter<PgpArmoredPrivateKey>(PgpBlockType.PrivateKey, bytes => new PgpArmoredPrivateKey(bytes)),
                new StrongIdConverter<SessionId>(),
                new StrongIdConverter<UserId>(),
                new StrongIdConverter<UserKeyId>(),
                new StrongIdConverter<AddressId>(),
                new StrongIdConverter<AddressKeyId>(),
                new StrongIdConverter<EventId>(),
            },
#if DEBUG
            WriteIndented = true,
#endif
        };
    }
}
