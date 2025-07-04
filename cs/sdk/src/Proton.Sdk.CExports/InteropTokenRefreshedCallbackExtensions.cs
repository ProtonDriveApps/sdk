using Google.Protobuf;

namespace Proton.Sdk.CExports;

internal static class InteropTokenRefreshedCallbackExtensions
{
    internal static unsafe void Invoke(this InteropTokensRefreshedCallback callback, string accessToken, string refreshToken)
    {
        var sessionTokens = new SessionTokens
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
        };

        var tokenBytes = InteropArray.FromMemory(sessionTokens.ToByteArray());

        try
        {
            callback.OnTokenRefreshed(callback.State, tokenBytes);
        }
        finally
        {
            tokenBytes.Free();
        }
    }
}
