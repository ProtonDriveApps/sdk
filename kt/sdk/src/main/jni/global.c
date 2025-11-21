#include <jni.h>
#include <stdlib.h>
#include <android/log.h>
#include "proton_sdk.h"

JavaVM *g_vm;

jint JNI_OnLoad(JavaVM *vm, void *reserved) {
    g_vm = vm;
    JNIEnv *env;
    if ((*vm)->GetEnv(vm, (void **) &env, JNI_VERSION_1_6) != JNI_OK) {
        return -1;
    }
    return JNI_VERSION_1_6;
}

JNIEnv *getJNIEnv() {
    JNIEnv *env;
    (*g_vm)->GetEnv(g_vm, (void **) &env, JNI_VERSION_1_6 /*version*/);
    if (env == NULL) {
        (*g_vm)->AttachCurrentThread(g_vm, &env, NULL);
    }
    return env;
}

void pushDataToVoidMethod(
        intptr_t bindings_handle,
        ByteArray value,
        const char *name
) {
    JNIEnv *env = getJNIEnv();
    jobject obj = (*env)->NewLocalRef(env, (jweak) bindings_handle);
    if ((*env)->IsSameObject(env, obj, NULL)) {
        __android_log_print(
                ANDROID_LOG_FATAL,
                "drive.sdk.internal",
                "Object was recycled for: %s %ld", name, bindings_handle
        );
        return;
    } else {
        jclass cls = (*env)->GetObjectClass(env, obj);
        jmethodID mid = (*env)->GetMethodID(env, cls, name, "(Ljava/nio/ByteBuffer;)V");
        if (mid == 0) {
            __android_log_print(
                    ANDROID_LOG_FATAL,
                    "drive.sdk.internal",
                    "Cannot found method: %s", name
            );
            return;
        }
        jobject buffer = (*env)->NewDirectByteBuffer(
                env,
                (void *) value.pointer,
                (jlong) value.length
        );
        (*env)->CallVoidMethod(env, obj, mid, buffer);
    }
}

void pushDataAndLongToVoidMethod(
        intptr_t bindings_handle,
        ByteArray value,
        intptr_t caller_state,
        const char *name
) {
    JNIEnv *env = getJNIEnv();
    jobject obj = (*env)->NewLocalRef(env, (jweak) bindings_handle);
    if ((*env)->IsSameObject(env, obj, NULL)) {
        __android_log_print(
                ANDROID_LOG_FATAL,
                "drive.sdk.internal",
                "Object was recycled for: %s %ld", name, bindings_handle
        );
        return;
    } else {
        jclass cls = (*env)->GetObjectClass(env, obj);
        jmethodID mid = (*env)->GetMethodID(env, cls, name, "(Ljava/nio/ByteBuffer;J)V");
        if (mid == 0) {
            __android_log_print(
                    ANDROID_LOG_FATAL,
                    "drive.sdk.internal",
                    "Cannot found method: %s", name
            );
            return;
        }
        jobject buffer = (*env)->NewDirectByteBuffer(
                env,
                (void *) value.pointer,
                (jlong) value.length
        );
        (*env)->CallVoidMethod(env, obj, mid, buffer, caller_state);
    }
}
