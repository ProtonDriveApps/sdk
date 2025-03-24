using System.Text.Json.Serialization;
using Proton.Sdk.Addresses;
using Proton.Sdk.Api;
using Proton.Sdk.Api.Addresses;
using Proton.Sdk.Api.Authentication;
using Proton.Sdk.Api.Events;
using Proton.Sdk.Api.Keys;
using Proton.Sdk.Api.Users;
using Proton.Sdk.Authentication;
using Proton.Sdk.Events;
using Proton.Sdk.Users;

namespace Proton.Sdk.Serialization;

#pragma warning disable SA1114, SA1118 // Disable style analysis warnings due to attribute spanning multiple lines
[JsonSourceGenerationOptions(
#if DEBUG
    WriteIndented = true,
#endif
    Converters =
    [
        typeof(PgpArmoredMessageJsonConverter),
        typeof(PgpArmoredSignatureJsonConverter),
        typeof(PgpArmoredPrivateKeyJsonConverter),
        typeof(PgpArmoredPublicKeyJsonConverter),
        typeof(StrongIdJsonConverter<SessionId>),
        typeof(StrongIdJsonConverter<UserId>),
        typeof(StrongIdJsonConverter<UserKeyId>),
        typeof(StrongIdJsonConverter<AddressId>),
        typeof(StrongIdJsonConverter<AddressKeyId>),
        typeof(StrongIdJsonConverter<EventId>),
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
