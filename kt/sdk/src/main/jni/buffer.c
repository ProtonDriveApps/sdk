#include <jni.h>

jlong Java_me_proton_drive_sdk_internal_JniBuffer_getBufferPointer(
        JNIEnv *env,
        jclass clazz,
        jobject buffer
) {
    void *ptr = (*env)->GetDirectBufferAddress(env, buffer);
    if (ptr == NULL) {
        return 0;
    }
    return (jlong) (intptr_t) ptr;
}

jlong Java_me_proton_drive_sdk_internal_JniBuffer_getBufferSize(
        JNIEnv *env,
        jclass clazz,
        jobject buffer
) {
    return (*env)->GetDirectBufferCapacity(env, buffer);
}