import java.io.FileInputStream
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release upload keystore — see key.properties (gitignored, machine-local).
// Not present on CI/other machines until that file is provisioned there too;
// falls back to the debug keystore so `flutter run --release` still works.
val keystorePropertiesFile = rootProject.file("app/key.properties")
val keystoreProperties = Properties()
val hasReleaseKeystore = keystorePropertiesFile.exists()
if (hasReleaseKeystore) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "com.hudumika.ondi_auth"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.hudumika.ondi_auth"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasReleaseKeystore) {
            create("release") {
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            // Signs with the real upload keystore when key.properties is present
            // (see android/app/key.properties, gitignored); falls back to the
            // debug key otherwise so `flutter run --release` keeps working on
            // machines that don't have it provisioned.
            signingConfig = if (hasReleaseKeystore) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

// Regenerates lib/core/dev_host.dart before every build so the app can
// always reach the local dev ondi-api — see scripts/dev_host.sh (same
// pattern as apps/mobile/ondi's build.gradle.kts).
tasks.register("generateDevHostIp") {
    doLast {
        val scriptFile = file("../../scripts/dev_host.sh")
        val sdkDir = project.extensions.getByType(com.android.build.gradle.BaseExtension::class.java).sdkDirectory
        val platformTools = File(sdkDir, "platform-tools").absolutePath

        try {
            val process = ProcessBuilder("bash", scriptFile.absolutePath)
                .directory(scriptFile.parentFile)
                .redirectErrorStream(true)
                .apply {
                    environment()["PATH"] = "$platformTools:${environment()["PATH"]}"
                }
                .start()
            println(process.inputStream.bufferedReader().readText().trim())
            val exitCode = process.waitFor()
            if (exitCode != 0) {
                println("Ondi Auth: dev_host.sh exited with code $exitCode — devHostIp may be stale.")
            }
        } catch (e: Exception) {
            println("Ondi Auth: Failed to run dev_host.sh: ${e.message}")
        }
    }
}

tasks.matching { it.name.startsWith("compile") || it.name.startsWith("preBuild") }.configureEach {
    dependsOn("generateDevHostIp")
}
