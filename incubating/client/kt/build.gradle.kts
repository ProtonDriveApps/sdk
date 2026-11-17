import com.android.build.gradle.LibraryExtension
import com.vanniktech.maven.publish.MavenPublishBaseExtension
import java.util.Properties

// Top-level build file where you can add configuration options common to all sub-projects/modules.

val privateProperties = Properties().apply {
    try {
        load(rootDir.resolve("private.properties").inputStream())
    } catch (exception: java.io.FileNotFoundException) {
        // Provide empty properties to allow the app to be built without secrets
        logger.warn("private.properties file not found", exception)
        Properties()
    }
}

plugins {
    alias(libs.plugins.proton.detekt)
    alias(libs.plugins.maven.publish) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.hilt.android) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.protobuf) apply false
}
allprojects {
    repositories {
        // As in settings.gradle.kts: in CI, MAVEN_REPOSITORY (Artifact Keeper's cache of these
        // repositories) is the only repository.
        val mavenRepository = providers.environmentVariable("MAVEN_REPOSITORY").orNull
        if (mavenRepository != null) {
            maven { url = uri(mavenRepository) }
        } else {
            google()
            mavenCentral()
            maven("https://plugins.gradle.org/m2/")
        }
    }
    group = "me.proton.drive"
    version = providers.environmentVariable("VERSION").getOrElse("0.0.0-SNAPSHOT")

    // Every resolved configuration is pinned by <project>/gradle.lockfile (both crypto flavors); a
    // build fails when it resolves something else. The release SBOM is read from the release runtime
    // classpath in it (internal/ci/just/sbom.just). After changing a dependency, regenerate with
    // `just client-kt lock`.
    dependencyLocking {
        lockAllConfigurations()
    }

    afterEvaluate {
        configurations.all {
            resolutionStrategy.dependencySubstitution {
                substitute(module("com.google.protobuf:protobuf-lite"))
                    .using(module("com.google.protobuf:protobuf-javalite:${libs.versions.protobufJavaLite.get()}"))
            }
        }
    }
}

subprojects {
    plugins.withId("com.android.library") {
        extensions.configure<LibraryExtension> {
            compileSdk = 35
            defaultConfig {
                minSdk = 29
                compileOptions {
                    sourceCompatibility = JavaVersion.VERSION_17
                    targetCompatibility = JavaVersion.VERSION_17
                }
                val proxyToken = privateProperties.getProperty("PROXY_TOKEN", "")
                val testEnvironment = System.getenv("TEST_ENV_DOMAIN")
                val dynamicEnvironment = privateProperties.getProperty("HOST", "proton.black")
                val environment = testEnvironment ?: dynamicEnvironment
                testInstrumentationRunner = "me.proton.drive.sdk.HiltTestRunner"
                testInstrumentationRunnerArguments["clearPackageData"] = "true"
                testInstrumentationRunnerArguments["proxyToken"] = proxyToken
                testInstrumentationRunnerArguments["host"] = environment
            }
        }
    }
    plugins.withId("org.jetbrains.kotlin.android") {
        extensions.configure<org.jetbrains.kotlin.gradle.dsl.KotlinAndroidProjectExtension> {
            compilerOptions {
                jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
            }
        }
    }
    plugins.withId("com.vanniktech.maven.publish") {
        extensions.configure<MavenPublishBaseExtension> {
            val artifactId = name

            // The :sdk library has go/rust crypto product flavors, so there is no single
            // "release" variant to publish. Select one via -PcryptoVariant=go|rust
            // (defaults to go). Both flavors publish under the same artifactId; the rust
            // release is distinguished by the -rust VERSION suffix set in CI.
            val cryptoVariant = providers.gradleProperty("cryptoVariant").getOrElse("go")
            if (pluginManager.hasPlugin("com.android.library")) {
                configure(
                    com.vanniktech.maven.publish.AndroidSingleVariantLibrary(
                        variant = "${cryptoVariant}Release",
                        sourcesJar = true,
                        publishJavadocJar = true,
                    )
                )
            }

            // Only sign non snapshot releases, and only with a key: CI builds the release
            // publication unsigned and signs exactly those files when it publishes them
            // (internal/ci/tools/publish_maven.py).
            if (!version.toString().endsWith("SNAPSHOT") &&
                providers.gradleProperty("signingInMemoryKey").isPresent
            ) {
                signAllPublications()
            }
            pom {
                name.set(artifactId)
                description.set("Proton Drive sdk for Android")
                url.set("https://github.com/ProtonDriveApps/sdk")
                licenses {
                    license {
                        name.set("GNU GENERAL PUBLIC LICENSE, Version 3.0")
                        url.set("https://www.gnu.org/licenses/gpl-3.0.en.html")
                    }
                }
                developers {
                    developer {
                        name.set("Open Source Proton")
                        email.set("opensource@proton.me")
                        id.set(email)
                    }
                }
                scm {
                    url.set("https://gitlab.protontech.ch/drive/sdk")
                    connection.set("git@gitlab.protontech.ch:drive/sdk.git")
                    developerConnection.set("https://gitlab.protontech.ch/drive/sdk.git")
                }
            }
        }
    }
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}
