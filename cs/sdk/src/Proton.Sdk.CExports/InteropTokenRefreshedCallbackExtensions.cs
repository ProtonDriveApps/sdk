using Google.Protobuf;

namespace Proton.Sdk.CExports;

internal static class InteropTokenRefreshedCallbackExtensions
{
    internal static unsafe void Invoke(this InteropValueCallback<InteropArray<byte>> callback, nint callerState, string accessToken, string refreshToken)
    {
        var sessionTokens = new SessionTokens
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
        };

        var sessionTokensBytes = InteropArray<byte>.FromMemory(sessionTokens.ToByteArray());

        try
        {
            callback.Invoke(callerState, sessionTokensBytes);
        }
        finally
        {
            sessionTokensBytes.Free();
        }
    }
}
