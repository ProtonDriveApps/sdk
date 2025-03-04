using System.Data;
using Microsoft.Data.Sqlite;

namespace Proton.Sdk.Caching;

internal sealed class SqliteCacheRepository : ICacheRepository, IDisposable
{
    private readonly SqliteConnection _connection;

    private SqliteCacheRepository(SqliteConnection connection)
    {
        _connection = connection;
    }

    public static SqliteCacheRepository OpenInMemory()
    {
        var connectionStringBuilder = new SqliteConnectionStringBuilder
        {
            DataSource = Guid.NewGuid().ToString(),
            Mode = SqliteOpenMode.Memory,
            Cache = SqliteCacheMode.Shared,
        };

        return Open(connectionStringBuilder);
    }

    public static SqliteCacheRepository OpenFile(string path)
    {
        var connectionStringBuilder = new SqliteConnectionStringBuilder
        {
            DataSource = path,
        };

        return Open(connectionStringBuilder);
    }

    ValueTask ICacheRepository.SetAsync(string key, string value, IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        try
        {
            Set(key, value, tags);

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    ValueTask ICacheRepository.RemoveAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            Remove(key);

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    ValueTask ICacheRepository.RemoveByTagAsync(string tag, CancellationToken cancellationToken)
    {
        try
        {
            RemoveByTag(tag);

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    public ValueTask ClearAsync()
    {
        try
        {
            Clear();

            return ValueTask.CompletedTask;
        }
        catch (Exception e)
        {
            return ValueTask.FromException(e);
        }
    }

    ValueTask<string?> ICacheRepository.TryGetAsync(string key, CancellationToken cancellationToken)
    {
        try
        {
            return ValueTask.FromResult(TryGet(key));
        }
        catch (Exception e)
        {
            return ValueTask.FromException<string?>(e);
        }
    }

    IAsyncEnumerable<string> ICacheRepository.GetByTagsAsync(IEnumerable<string> tags, CancellationToken cancellationToken)
    {
        return GetByTags(tags).ToAsyncEnumerable();
    }

    ValueTask IAsyncDisposable.DisposeAsync()
    {
        Dispose();

        return ValueTask.CompletedTask;
    }

    public void Set(string key, string value, IEnumerable<string> tags)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var transaction = connection.BeginTransaction(deferred: true);

        using var command = connection.CreateCommand();

        command.Transaction = transaction;
        command.CommandText =
            """
            INSERT INTO Entries (Key, Value)
            VALUES (@key, @value)
            ON CONFLICT (Key) DO UPDATE SET Value = @value
            """;

        command.Parameters.AddWithValue("@key", key);
        command.Parameters.AddWithValue("@value", value);

        command.ExecuteNonQuery();

        command.CommandText = "DELETE FROM Tags WHERE Key = @key";

        command.ExecuteNonQuery();

        command.CommandText = "INSERT INTO Tags (Tag, Key) VALUES (@tag, @key)";

        var tagParameter = command.CreateParameter();
        tagParameter.ParameterName = "@tag";
        command.Parameters.Add(tagParameter);

        foreach (var tag in tags)
        {
            tagParameter.Value = tag;

            command.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    public void Remove(string key)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);

        command.ExecuteNonQuery();
    }

    public void RemoveByTag(string tag)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries AS e WHERE EXISTS (SELECT 1 FROM Tags WHERE Tag = @tag AND Key = e.Key)";
        command.Parameters.AddWithValue("@tag", tag);

        command.ExecuteNonQuery();
    }

    public void Clear()
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "DELETE FROM Entries";

        command.ExecuteNonQuery();
    }

    public string? TryGet(string key)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);
        connection.Open();

        using var command = connection.CreateCommand();

        command.CommandText = "SELECT Value FROM Entries WHERE Key = @key";
        command.Parameters.AddWithValue("@key", key);

        var reader = command.ExecuteReader();

        return reader.Read() ? reader.GetFieldValue<string>("Value") : null;
    }

    public IEnumerable<string> GetByTags(IEnumerable<string> tags)
    {
        using var connection = new SqliteConnection(_connection.ConnectionString);

        connection.Open();

        using var command = connection.CreateCommand();

        command.Connection = connection;

        var i = 0;
        foreach (var tag in tags)
        {
            command.Parameters.AddWithValue($"@tag{i++}", tag);
        }

        var inClause = string.Join(", ", command.Parameters.Cast<SqliteParameter>().Select(x => x.ParameterName));

        command.CommandText =
            $"""
             SELECT Value
             FROM Entries
             WHERE Key IN (
               SELECT t.Key
               FROM Tags t
               WHERE t.Tag IN ({inClause})
               GROUP BY t.Key
               HAVING COUNT(DISTINCT t.Tag) = @tagCount
             );
             """;

        command.Parameters.AddWithValue("@tagCount", command.Parameters.Count);

        using var reader = command.ExecuteReader();

        while (reader.Read())
        {
            yield return reader.GetString(0);
        }
    }

    public void Dispose()
    {
        _connection.Dispose();
    }

    private static SqliteCacheRepository Open(SqliteConnectionStringBuilder connectionStringBuilder)
    {
        var connectionString = connectionStringBuilder.ConnectionString;

        var connection = new SqliteConnection(connectionString);

        try
        {
            connection.Open();

            InitializeDatabase(connection);

            return new SqliteCacheRepository(connection);
        }
        catch
        {
            connection.Dispose();
            throw;
        }
    }

    private static void InitializeDatabase(SqliteConnection connection)
    {
        using var command = connection.CreateCommand();

        command.CommandText = "PRAGMA journal_mode = 'wal'";

        command.ExecuteNonQuery();

        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS Entries (
                Key TEXT NOT NULL,
                Value TEXT NOT NULL,
                PRIMARY KEY (Key)
            )
            """;

        command.ExecuteNonQuery();

        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS Tags (
                Tag TEXT NOT NULL,
                Key TEXT NOT NULL,
                PRIMARY KEY (Tag, Key),
                FOREIGN KEY (Key) REFERENCES Entries(Key) ON DELETE CASCADE
            )
            """;

        command.ExecuteNonQuery();

        command.CommandText =
            """
            CREATE TABLE IF NOT EXISTS QueryableTags (
                Tag TEXT NOT NULL,
                PRIMARY KEY (Tag)
            )
            """;

        command.ExecuteNonQuery();
    }
}
