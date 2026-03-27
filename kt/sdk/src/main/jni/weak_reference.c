#include <jni.h>

jlong Java_me_proton_drive_sdk_internal_JniWeakReference_create(
        JNIEnv *env,
        jclass clazz,
        jobject obj
) {
    return (jlong) (intptr_t) (*env)->NewWeakGlobalRef(env, obj);
}

void Java_me_proton_drive_sdk_internal_JniWeakReference_delete(
        JNIEnv *env,
        jclass clazz,
        jlong ref
) {
    (*env)->DeleteWeakGlobalRef(env, (jweak) (intptr_t) ref);
}
