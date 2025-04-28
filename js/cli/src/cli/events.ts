export async function runForever() {
    return new Promise(() => {});
} 

export function eventsCallback(json: boolean, event: any) {
    if (json) {
        console.log(JSON.stringify(event));
    } else {
        const icon = event.type === 'update' ? '♻️' : event.type === 'remove' ? '❌' : '';
        console.log(icon, event);
    }
}
