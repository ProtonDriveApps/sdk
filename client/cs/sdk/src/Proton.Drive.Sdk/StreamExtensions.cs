using System.Buffers;

namespace Proton.Drive.Sdk;

internal static class StreamExtensions
{
    private const int CopyBufferSize = 81_920;

    public static async Task<int> PartiallyCopyToAsync(
        this Stream source,
        Stream destination,
        int lengthToCopy,
        Memory<byte> sampleOutput,
        CancellationToken cancellationToken)
    {
        var copyBuffer = ArrayPool<byte>.Shared.Rent(Math.Min(lengthToCopy, CopyBufferSize));
        try
        {
            var remainingLengthToCopy = lengthToCopy;
            int numberOfBytesRead;
            do
            {
                var copyBufferMemory = copyBuffer.AsMemory(0, Math.Min(remainingLengthToCopy, copyBuffer.Length));

                numberOfBytesRead = await source.ReadAsync(copyBufferMemory, cancellationToken).ConfigureAwait(false);

                var readBytes = copyBuffer.AsMemory()[..numberOfBytesRead];

                if (sampleOutput.Length > 0)
                {
                    var lengthForSample = Math.Min(readBytes.Length, sampleOutput.Length);
                    readBytes.Span[..lengthForSample].CopyTo(sampleOutput.Span);
                    sampleOutput = sampleOutput[lengthForSample..];
                }

                await destination.WriteAsync(readBytes, cancellationToken).ConfigureAwait(false);

                remainingLengthToCopy -= numberOfBytesRead;
            } while (numberOfBytesRead > 0 && remainingLengthToCopy > 0);

            return lengthToCopy - remainingLengthToCopy;
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(copyBuffer);
        }
    }
}
