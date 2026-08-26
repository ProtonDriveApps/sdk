namespace Proton.Drive.Sdk.Nodes.Upload;

internal readonly record struct BlockUploadResult(int PlaintextSize, int EncryptedSize, byte[] Sha256Digest);
