using SearchHttpClient = Proton.Drive.Sdk.Search.HttpClient;

namespace Proton.Drive.Sdk.Search;

internal sealed class ProtonDriveSearchHttpClient(System.Net.Http.HttpClient httpClient) : SearchHttpClient
{
    private readonly System.Net.Http.HttpClient _httpClient = httpClient;

    public async Task<byte[]> Get(string path)
    {
        using var response = await _httpClient.GetAsync(path).ConfigureAwait(false);
        return await ReadResponseAsync(response).ConfigureAwait(false);
    }

    public async Task<byte[]> Put(string path, byte[] body)
    {
        using var content = new ByteArrayContent(body);
        using var response = await _httpClient.PutAsync(path, content).ConfigureAwait(false);
        return await ReadResponseAsync(response).ConfigureAwait(false);
    }

    public async Task<byte[]> Post(string path, byte[] body)
    {
        using var content = new ByteArrayContent(body);
        using var response = await _httpClient.PostAsync(path, content).ConfigureAwait(false);
        return await ReadResponseAsync(response).ConfigureAwait(false);
    }

    private static async Task<byte[]> ReadResponseAsync(System.Net.Http.HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
        {
            throw new HttpErrorException(new HttpError.Status((ushort)response.StatusCode));
        }

        return await response.Content.ReadAsByteArrayAsync().ConfigureAwait(false);
    }
}
