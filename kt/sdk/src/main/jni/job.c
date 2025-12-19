#include <jni.h>
#include <android/log.h>
#include "global.h"

void onCancel(
        intptr_t bindings_operation_handle
) {
    if (bindings_operation_handle == 0) {
        return;
    }
    JNIEnv *env = getJNIEnv();
    jobject obj = (*env)->NewLocalRef(env, (jweak) bindings_operation_handle);
    if ((*env)->IsSameObject(env, obj, NULL)) {
        __android_log_print(
                ANDROID_LOG_FATAL,
                "drive.sdk.internal",
                "Object was recycled for: %s %ld", "cancel", (long) bindings_operation_handle
        );
        return;
    }

    /* --- Build CancellationException(String) --- */

    jclass ceClass = (*env)->FindClass(env, "java/util/concurrent/CancellationException");
    if (ceClass == NULL) {
        return; // exception pending
    }

    jmethodID ceCtor = (*env)->GetMethodID(env, ceClass, "<init>", "(Ljava/lang/String;)V");
    if (ceCtor == NULL) {
        return;
    }

    jstring message = (*env)->NewStringUTF(env, "Operation cancelled by sdk");
    jobject cancellationException = (*env)->NewObject(env, ceClass, ceCtor, message);

    /* --- Call cancel(CancellationException) --- */

    jclass jobClass = (*env)->GetObjectClass(env, obj);

    char *signature = "(Ljava/util/concurrent/CancellationException;)V";
    jmethodID mid = (*env)->GetMethodID(env, jobClass, "cancel", signature);

    if (mid == 0) {
        __android_log_print(
                ANDROID_LOG_FATAL,
                "drive.sdk.internal",
                "Cannot find method: cancel(CancellationException)"
        );
        return;
    }

    (*env)->CallVoidMethod(env, obj, mid, cancellationException);

    /* --- Cleanup local references --- */

    (*env)->DeleteLocalRef(env, message);
    (*env)->DeleteLocalRef(env, cancellationException);
    (*env)->DeleteLocalRef(env, ceClass);
    (*env)->DeleteLocalRef(env, jobClass);
    (*env)->DeleteLocalRef(env, obj);
}

jlong Java_me_proton_drive_sdk_internal_JniJob_getCancelPointer(
        JNIEnv *env,
        jclass clazz
) {
    return (jlong) (intptr_t) &onCancel;
}

jlong Java_me_proton_drive_sdk_internal_JniJob_createWeakRef(
        JNIEnv *env,
        jclass clazz,
        jobject obj
) {
    jweak weakRef = (*env)->NewWeakGlobalRef(env, obj);
    return (jlong) (intptr_t) weakRef;
}
