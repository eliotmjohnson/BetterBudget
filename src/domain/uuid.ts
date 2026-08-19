let fallbackCounter = 0;

function fallbackRandomBytes() {
    const bytes = new Uint8Array(16);

    for (let index = 0; index < bytes.length; index += 1)
        bytes[index] = Math.floor(Math.random() * 256);

    fallbackCounter = (fallbackCounter + 1) >>> 0;
    const timestamp = BigInt(Date.now());
    const counter = BigInt(fallbackCounter);

    for (let index = 0; index < 6; index += 1)
        bytes[index] =
            bytes[index]! ^ Number((timestamp >> BigInt(index * 8)) & 0xffn);
    for (let index = 0; index < 4; index += 1)
        bytes[12 + index] =
            bytes[12 + index]! ^ Number((counter >> BigInt(index * 8)) & 0xffn);

    return bytes;
}

export function createUuid() {
    const cryptoApi = globalThis.crypto;

    if (cryptoApi && typeof cryptoApi.randomUUID === 'function')
        return cryptoApi.randomUUID();

    const bytes = new Uint8Array(16);

    if (cryptoApi && typeof cryptoApi.getRandomValues === 'function')
        cryptoApi.getRandomValues(bytes);
    else bytes.set(fallbackRandomBytes());

    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const value = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, '0')
    ).join('');

    return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
