export async function waitSeconds(seconds: number){
    return wait(seconds * 1000);
}

export async function wait(miliseconds: number){
    return new Promise<void>((resolve) => setTimeout(resolve, miliseconds));
}
