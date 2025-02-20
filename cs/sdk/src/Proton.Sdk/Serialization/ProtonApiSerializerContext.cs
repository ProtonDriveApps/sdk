using System.Text.Json.Serialization;
using Proton.Sdk.Addresses.Api;
using Proton.Sdk.Api;
using Proton.Sdk.Authentication.Api;
using Proton.Sdk.Events.Api;
using Proton.Sdk.Keys.Api;
using Proton.Sdk.Users.Api;

namespace Proton.Sdk.Serialization;

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
internal partial class ProtonApiSerializerContext : JsonSerializerContext
{
    static ProtonApiSerializerContext()
    {
        Default = new ProtonApiSerializerContext(ProtonApiDefaults.GetSerializerOptions());
    }
}
