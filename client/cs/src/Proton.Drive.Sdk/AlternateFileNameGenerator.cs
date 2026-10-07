namespace Proton.Drive.Sdk;

internal static class AlternateFileNameGenerator
{
    public static IEnumerable<string> GetFileNames(string originalName)
    {
        var nameWithoutExtension = Path.GetFileNameWithoutExtension(originalName);
        var extension = originalName[nameWithoutExtension.Length..];

        return Enumerable.Range(1, int.MaxValue).Select(i => $"{nameWithoutExtension} ({i}){extension}");
    }

    public static IEnumerable<string> GetFolderNames(string originalName)
    {
        return Enumerable.Range(1, int.MaxValue).Select(i => $"{originalName} ({i})");
    }
}
