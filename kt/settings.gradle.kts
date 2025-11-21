/*
 * Copyright (c) 2023 Proton AG.
 * This file is part of Proton Drive.
 *
 * Proton Drive is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Proton Drive is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Proton Drive.  If not, see <https://www.gnu.org/licenses/>.
 */

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
        providers.environmentVariable("INTERNAL_REPOSITORY").orNull?.let { path ->
            maven { url = uri(path) }
        }
        gradlePluginPortal()
        google()
        mavenCentral()
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

buildCache {
    local {
        isEnabled = !providers.environmentVariable("CI_SERVER").isPresent
    }
    providers.environmentVariable("BUILD_CACHE_URL").orNull?.let { buildCacheUrl ->
        remote<HttpBuildCache> {
            isPush = providers.environmentVariable("CI_SERVER").isPresent
            url = uri(buildCacheUrl)
        }
    }
}

include(":sdk")
include(":testapp")

