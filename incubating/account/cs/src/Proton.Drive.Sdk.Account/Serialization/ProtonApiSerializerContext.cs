using System.Text.Json.Serialization;
using Proton.Drive.Sdk.Account.Api.Addresses;
using Proton.Drive.Sdk.Account.Api.Authentication;
using Proton.Drive.Sdk.Account.Api.Events;
using Proton.Drive.Sdk.Account.Api.Keys;
using Proton.Drive.Sdk.Account.Api.Users;
using Proton.Sdk.Api;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Serialization;

namespace Proton.Drive.Sdk.Account.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
#if DEBUG
    WriteIndented = true,
    RespectRequiredConstructorParameters = true,
#endif
    Converters =
    [
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredMessage>),
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredSignature>),
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredSecretKey>),
        typeof(PgpArmoredBlockJsonConverter<PgpArmoredPublicKey>),
    ])]
#pragma warning restore SA1114, SA1118
[JsonSerializable(typeof(ApiResponse))]
[JsonSerializable(typeof(SessionInitiationRequest))]
[JsonSerializable(typeof(SessionInitiationResponse))]
[JsonSerializable(typeof(AuthenticationRequest))]
[JsonSerializable(typeof(AuthenticationResponse))]
[JsonSerializable(typeof(SecondFactorValidationRequest))]
[JsonSerializable(typeof(ScopesResponse))]
[JsonSerializable(typeof(SessionRefreshRequest))]
[JsonSerializable(typeof(SessionRefreshResponse))]
[JsonSerializable(typeof(UserResponse))]
[JsonSerializable(typeof(AddressListResponse))]
[JsonSerializable(typeof(AddressResponse))]
[JsonSerializable(typeof(AddressPublicKeyListResponse))]
[JsonSerializable(typeof(ModulusResponse))]
[JsonSerializable(typeof(KeySaltListResponse))]
[JsonSerializable(typeof(LatestEventResponse))]
[JsonSerializable(typeof(EventListResponse))]
internal sealed partial class ProtonApiSerializerContext : JsonSerializerContext;
