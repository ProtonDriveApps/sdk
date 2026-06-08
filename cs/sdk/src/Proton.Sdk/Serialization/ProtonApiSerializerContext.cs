using System.Text.Json.Serialization;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Addresses;
using Proton.Sdk.Api.Authentication;
using Proton.Sdk.Api.Events;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Api.Users;
using Proton.Sdk.Cryptography;

namespace Proton.Sdk.Serialization;

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
