namespace Proton.Drive.Sdk;

internal static class AlternateFileNameGenerator
{
    public static IEnumerable<string> GetNames(string originalName)
    {
        var nameWithoutExtension = Path.GetFileNameWithoutExtension(originalName);
        var extension = originalName[nameWithoutExtension.Length..];

        return Enumerable.Range(1, int.MaxValue).Select(i => $"{nameWithoutExtension} ({i}){extension}");
    }
}
