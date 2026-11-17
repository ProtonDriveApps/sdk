rootProject.name = "ProtonDriveSdk"

dependencyResolutionManagement {
    versionCatalogs {
        create("libs") {
            from(files("./libs.versions.toml"))
        }
    }
}

pluginManagement {
    repositories {
        // CI sets MAVEN_REPOSITORY (internal/ci/just/gradle-env.just) to Proton's Artifact Keeper, which
        // caches these repositories, and it is then the only one. Unset, they are used directly.
        val mavenRepository = providers.environmentVariable("MAVEN_REPOSITORY").orNull
        if (mavenRepository != null) {
            maven { url = uri(mavenRepository) }
        } else {
            gradlePluginPortal()
            google()
            mavenCentral()
        }
    }
}

plugins {
    id("me.proton.core.gradle-plugins.include-core-build") version "1.3.0"
    id("com.gradle.enterprise") version "3.12.6"
}

gradleEnterprise {
    buildScan {
        publishAlwaysIf(!System.getenv("BUILD_SCAN_PUBLISH").isNullOrEmpty())
        termsOfServiceUrl = "https://gradle.com/terms-of-service"
        termsOfServiceAgree = "yes"
    }
}

// No remote build cache: CI used one (BUILD_CACHE_URL) that every pipeline wrote and master and
// release pipelines read (against internal/ci/SPEC.md SEC-1.1 and INT-3.1), and without it the
// client-kt jobs were no slower (pipeline 3896931 against 3896480).
buildCache {
    local {
        isEnabled = !providers.environmentVariable("CI_SERVER").isPresent
    }
}

include(":sdk")
include(":testapp")

