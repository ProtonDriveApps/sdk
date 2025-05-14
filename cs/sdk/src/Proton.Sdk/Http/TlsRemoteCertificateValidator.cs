using System.Buffers;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;

namespace Proton.Sdk.Http;

internal static class TlsRemoteCertificateValidator
{
    private static readonly IReadOnlyCollection<byte[]> KnownPublicKeySha256Digests =
    [
        Convert.FromBase64String("CT56BhOTmj5ZIPgb/xD5mH8rY3BLo/MlhP7oPyJUEDo="),
        Convert.FromBase64String("35Dx28/uzN3LeltkCBQ8RHK0tlNSa2kCpCRGNp34Gxc="),
        Convert.FromBase64String("qYIukVc63DEITct8sFT7ebIq5qsWmuscaIKeJx+5J5A="),
    ];

    public static bool Validate(X509Certificate? certificate, X509Chain? chain)
    {
        if (certificate == null || chain == null)
        {
            return false;
        }

        var certificateIsValid = IsValid(certificate);

        // TODO: TLS certificate pinning report

        // Ignore other potential SSL policy errors if the certificate is valid.
        return certificateIsValid;
    }

    private static bool IsValid(X509Certificate certificate)
    {
        using var certificate2 = new X509Certificate2(certificate);
        Span<byte> hashDigestBuffer = stackalloc byte[SHA256.HashSizeInBytes];
        if (!TryGetPublicKeySha256Digest(certificate2, hashDigestBuffer))
        {
            return false;
        }

        var validHashFound = false;
        foreach (var knownPublicKeyHashDigest in KnownPublicKeySha256Digests)
        {
            if (knownPublicKeyHashDigest.AsSpan().SequenceEqual(hashDigestBuffer))
            {
                validHashFound = true;
                break;
            }
        }

        return validHashFound;
    }

    private static bool TryGetPublicKeySha256Digest(X509Certificate2 certificate, Span<byte> outputBuffer)
    {
        var publicKey = certificate.GetRSAPublicKey() as AsymmetricAlgorithm
            ?? certificate.GetDSAPublicKey()
            ?? throw new NotSupportedException("No supported key algorithm");

        // Expected length of public key info is around 550 bytes
        var publicKeyInfoBuffer = ArrayPool<byte>.Shared.Rent(1024);

        try
        {
            var publishKeyInfo = publicKey.TryExportSubjectPublicKeyInfo(publicKeyInfoBuffer, out var publicKeyInfoLength)
                ? publicKeyInfoBuffer.AsSpan()[..publicKeyInfoLength]
                : publicKey.ExportSubjectPublicKeyInfo();

            return SHA256.TryHashData(publishKeyInfo, outputBuffer, out _);
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(publicKeyInfoBuffer);
        }
    }
}
