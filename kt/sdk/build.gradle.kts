import com.google.protobuf.gradle.proto

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.protobuf)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
    kotlin("kapt")
    alias(libs.plugins.hilt.android)
    alias(libs.plugins.maven.publish)
    id("signing")
}

android {
    namespace = "me.proton.drive.sdk"
    ndkVersion = "28.1.13356709"
    externalNativeBuild {
        ndkBuild {
            path("src/main/jni/Android.mk")
        }
    }
    defaultConfig {
        ndk {
            abiFilters += listOf(
                // x86 will never be supported
                "x86_64",
                "armeabi-v7a",
                "arm64-v8a",
            )
        }
        externalNativeBuild {
            ndkBuild {
                arguments("BUILD_DIR=${layout.buildDirectory.asFile.get().path}")
            }
        }
        defaultConfig {
            consumerProguardFiles("proguard-rules.pro")
        }
    }
    sourceSets {
        getByName("main") {
            jniLibs.srcDirs(layout.buildDirectory.dir("cs/jni"))
            jniLibs.srcDirs("src/main/jniLibs")
            proto {
                srcDir(layout.buildDirectory.dir("cs/proto"))
            }
        }
    }
    packaging {
        resources.excludes.add("META-INF/licenses/**")
        resources.excludes.add("META-INF/LICENSE*")
        resources.excludes.add("META-INF/AL2.0")
        resources.excludes.add("META-INF/LGPL2.1")
        resources.excludes.add("licenses/*.txt")
        resources.excludes.add("licenses/*.xml")
    }
}

dependencies {

    implementation(libs.kotlinx.coroutines.core)
    implementation(libs.core.utilKotlin)
    implementation(libs.protobuf.javalite)
    implementation(libs.protobuf.kotlin.lite)
    implementation(libs.retrofit)
    implementation(libs.core.user.domain)
    implementation(libs.core.network.data)
    androidTestImplementation(libs.coroutines.test)
    androidTestImplementation(libs.androidx.test.core.ktx)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.rules)
    androidTestImplementation(files("$rootDir/gopenpgp-v2-v3/gopenpgp.aar"))
    androidTestImplementation(libs.core.auth.domain)
    androidTestImplementation(libs.core.network.data)
    androidTestImplementation(libs.core.crypto.android)
    androidTestImplementation(libs.core.domain)
    androidTestImplementation(libs.core.account.dagger)
    androidTestImplementation(libs.core.accountManager.dagger) {
        exclude("me.proton.core", "notification-dagger")
        exclude("me.proton.core", "notification-presentation")
        exclude("me.proton.core", "account-recovery-presentation-compose")
        exclude("me.proton.core", "auth-presentation")
    }
    androidTestImplementation(libs.core.accountRecovery.dagger)
    androidTestImplementation(libs.core.crypto.dagger)
    androidTestImplementation(libs.core.featureFlag.dagger)
    androidTestImplementation(libs.core.key.dagger)
    androidTestImplementation(libs.core.plan.dagger)
    androidTestImplementation(libs.core.user.dagger)
    androidTestImplementation(libs.core.userSettings.dagger) {
        exclude("me.proton.core", "account-manager-presentation")
        exclude("me.proton.core", "user-settings-presentation")
    }
    androidTestImplementation(libs.core.utilAndroidDatetime) {
        exclude("me.proton.core", "presentation")
    }
    androidTestImplementation(libs.core.observability.dagger)
    androidTestImplementation(libs.dagger.hilt.android.testing)
    androidTestImplementation(libs.dagger.hilt.android)
    kaptAndroidTest(libs.dagger.hilt.android.compiler)
    kaptAndroidTest(libs.androidx.room.compiler)
    androidTestImplementation(libs.core.dataRoom)
    androidTestImplementation(libs.core.test.kotlin)
    androidTestImplementation(libs.core.test.quark)
    androidTestImplementation(libs.core.test.rule) {
        exclude("me.proton.core", "auth-presentation")
    }
    androidTestImplementation(libs.kotlin.reflect)
    androidTestImplementation(libs.okhttpLoggingInterceptor)
    androidTestImplementation(libs.androidx.room.ktx)
}

protobuf {
    protoc {
        artifact = "com.google.protobuf:protoc:4.29.2"
    }
    generateProtoTasks {
        all().forEach { task ->
            task.builtins {
                create("java") {
                    option("lite")
                }
                create("kotlin") {
                    option("lite")
                }
            }
        }
    }
}

tasks.register<Copy>("copyHeader") {
    from(layout.projectDirectory.dir("../../cs/headers")) {
        include { file -> file.name.endsWith(".h") }
    }
    into(layout.buildDirectory.dir("cs/includes"))
}

tasks.register<Copy>("copySharedLibrary") {
    from(layout.projectDirectory.dir("../../cs/sdk/bin")) {
        include("**/libproton_drive_sdk.so")
    }
    into(layout.buildDirectory.dir("cs/jni"))
}

tasks.named { name ->
    name.startsWith("configureNdkBuild")
}.configureEach {
    dependsOn("copyHeader")
    dependsOn("copySharedLibrary")
}

tasks.named { name ->
    name.matches("merge.*JniLibFolders".toRegex())
}.configureEach {
    dependsOn("copySharedLibrary")
}

tasks.register<Copy>("copyProto") {
    from(layout.projectDirectory.dir("../../cs/sdk/src/protos")) {
        include { file -> file.name.endsWith(".proto") }
    }
    into(layout.buildDirectory.dir("cs/proto"))
}

tasks.named { name ->
    name.matches("generate.*Proto".toRegex())
}.configureEach { dependsOn("copyProto") }
