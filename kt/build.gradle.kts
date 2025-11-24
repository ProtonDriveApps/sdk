import com.android.build.gradle.LibraryExtension
import com.vanniktech.maven.publish.MavenPublishBaseExtension
import com.vanniktech.maven.publish.SonatypeHost
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
    alias(libs.plugins.protobuf) apply false
}
allprojects {
    repositories {
        providers.environmentVariable("INTERNAL_REPOSITORY").orNull?.let { path ->
            maven { url = uri(path) }
        }
        google()
        mavenCentral()
        maven("https://plugins.gradle.org/m2/")
        maven {
            url = uri("https://jitpack.io")
            content {
                includeGroupByRegex("com.github.bastienpaulfr.*")
            }
        }
    }
    group = "me.proton.drive"
    version = "0.3.1"

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
                minSdk = 26
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

            if (!version.toString().endsWith("SNAPSHOT")) {
                // Only sign non snapshot release
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
