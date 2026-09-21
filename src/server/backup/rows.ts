export const nameKey = (name: string) => name.trim().toLocaleLowerCase('en-US');

export function chunks<T>(rows: T[], size = 500): T[][] {
    const result: T[][] = [];

    for (let index = 0; index < rows.length; index += size)
        result.push(rows.slice(index, index + size));

    return result;
}
