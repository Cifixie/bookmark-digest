plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bookmarkdigest.share"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.bookmarkdigest.share"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0"

        // Stack output `ApiUrl` from apps/infra/outputs.json. Not a secret — the
        // endpoint is Cognito-authorized, so knowing the URL buys nothing.
        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"https://1w0i6cu7tk.execute-api.eu-north-1.amazonaws.com/dev\"",
        )
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // Required by Amplify Android, which uses java.time and other APIs its
        // own minSdk does not guarantee.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.17.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    // lifecycleScope, used by LoginActivity.
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.4")
    implementation("androidx.work:work-runtime-ktx:2.11.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")

    implementation("com.amplifyframework:aws-auth-cognito:2.39.0")
    implementation("com.amplifyframework:core-kotlin:2.39.0")

    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
}
