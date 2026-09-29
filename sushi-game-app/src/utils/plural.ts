// Numero con il nome concordato: "1 pezzo", "3 pezzi"
export const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
