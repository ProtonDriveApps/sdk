using System.Reflection;
using Microsoft.Extensions.DependencyInjection;
using Polly;
using Proton.Drive.Sdk.Account.Authentication;
using Proton.Drive.Sdk.Account.Http;
using Proton.Sdk.Api.Http;
using Proton.Sdk.Cryptography;
using Proton.Sdk.Telemetry;

namespace Proton.Drive.Sdk.Account;

internal static class ProtonClientConfigurationExtensions
{
    extension(ProtonClientConfiguration config)
    {
        public HttpClient CreateHttpClient(
            ProtonApiSession? session = null,
            Uri? baseAddress = null,
            TimeSpan? attemptTimeout = null,
            TimeSpan? totalTimeout = null)
        {
            return CreateHttpClientFactory(config, session, baseAddress, attemptTimeout, totalTimeout).CreateClient();
        }

        public IHttpClientFactory CreateHttpClientFactory(
            ProtonApiSession? session = null,
            Uri? baseAddress = null,
            TimeSpan? attemptTimeout = null,
            TimeSpan? totalTimeout = null)
        {
            var services = new ServiceCollection();

            services.AddSingleton(config.Telemetry.ToLoggerFactory());

            services.ConfigureHttpClientDefaults(
                builder =>
                {
                    builder.RedactLoggedHeaders(header => header.StartsWith("Auth"));

                    builder.UseSocketsHttpHandler(
                        (handler, _) =>
                        {
                            handler.PooledConnectionLifetime = TimeSpan.FromMinutes(2);

                            handler.AddAutomaticDecompression();
                            handler.ConfigureCookies(ProtonClientConfiguration.CookieContainer);

                            switch (config.TlsPolicy)
                            {
                                case ProtonClientTlsPolicy.Strict:
                                    handler.AddTlsPinning();
                                    break;

                                case ProtonClientTlsPolicy.NoCertificateValidation:
#pragma warning disable S4830 // Certificates are intentionally not verified
                                    handler.SslOptions.RemoteCertificateValidationCallback += (_, _, _, _) => true;
#pragma warning restore S4830
                                    break;
                            }
                        });

                    builder.SetHandlerLifetime(Timeout.InfiniteTimeSpan);

                    if (config.CustomHttpMessageHandlerFactory is not null)
                    {
                        builder.AddHttpMessageHandler(() => config.CustomHttpMessageHandlerFactory.Invoke());
                    }

#if DEBUG
                    builder.AddHttpMessageHandler(() => new HttpBodyLoggingHandler(config.Telemetry.GetLogger<HttpBodyLoggingHandler>()));
#endif

                    builder.AddHttpMessageHandler(() => new CryptographyTimeProvisionHandler());

                    builder.AddStandardResilienceHandler(
                        options =>
                        {
                            if (attemptTimeout is not null)
                            {
                                options.AttemptTimeout.Timeout = attemptTimeout.Value;
                                options.CircuitBreaker.SamplingDuration = options.AttemptTimeout.Timeout * 2;
                            }

                            if (totalTimeout is not null)
                            {
                                options.TotalRequestTimeout.Timeout = totalTimeout.Value;
                            }

                            var defaultShouldHandleRetryPredicate = options.Retry.ShouldHandle;

                            options.Retry.ShouldHandle = async args =>
                            {
                                var defaultShouldHandleRetry = await defaultShouldHandleRetryPredicate(args).ConfigureAwait(false);
                                return defaultShouldHandleRetry && args.Context.GetRequestMessage()?.GetRequestType() is HttpRequestType.RegularApi;
                            };

                            options.Retry.ShouldRetryAfterHeader = true;
                            options.Retry.Delay = TimeSpan.FromSeconds(1.75);
                            options.Retry.BackoffType = DelayBackoffType.Exponential;
                            options.Retry.UseJitter = false;
                            options.Retry.MaxRetryAttempts = 4;

                            options.CircuitBreaker.FailureRatio = 0.5;
                        });

                    if (session is not null)
                    {
                        builder.AddHttpMessageHandler(() => new AuthorizationHandler(session));
                    }

                    builder.ConfigureHttpClient(
                        httpClient =>
                        {
                            var executingAssembly = Assembly.GetExecutingAssembly();
                            var versionAttribute = executingAssembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>();
                            var sdkVersion = versionAttribute?.InformationalVersion
                                ?? executingAssembly.GetName().Version?.ToString(fieldCount: 3)
                                ?? "0.0.0";

                            var bindingsSuffix = config.BindingsLanguage is not null
                                ? "-" + config.BindingsLanguage.ToLowerInvariant()
                                : string.Empty;

                            var sdkTechnicalStack = "dotnet" + bindingsSuffix;

                            httpClient.BaseAddress = baseAddress;
                            httpClient.DefaultRequestHeaders.Add("x-pm-appversion", config.AppVersion);
                            httpClient.DefaultRequestHeaders.Add("x-pm-drive-sdk-version", $"{sdkTechnicalStack}@{sdkVersion}");

                            if (!string.IsNullOrEmpty(config.UserAgent))
                            {
                                httpClient.DefaultRequestHeaders.Add("User-Agent", config.UserAgent);
                            }
                        });
                });

            var serviceProvider = services.BuildServiceProvider();

            return serviceProvider.GetRequiredService<IHttpClientFactory>();
        }
    }
}
