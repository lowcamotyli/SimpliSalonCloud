const text = `
Katarzyna Barabasz przesunął swoją wizytę Sombre komplet włosy
średnie z dnia czwartek, 23 października 2025 10:45 na inny termin.
`;

const cleanBody = text
    .replace(/Ă˘â‚¬"/g, '-')
    .replace(/â€"/g, '-')  // em-dash
    .replace(/â€"/g, '-')  // en-dash
    .replace(/Ă…â€š/g, 'ł')
    .replace(/Ă…â€ş/g, 'ś')
    .replace(/Ă„â€¦/g, 'ą')
    .replace(/Ă„â€ˇ/g, 'ć')
    .replace(/Ă„â„˘/g, 'ę')
    .replace(/Ă…â€ž/g, 'ń')
    .replace(/ĂÂł/g, 'ó')
    .replace(/Ă…Âş/g, 'ź')
    .replace(/Ă…ÂĽ/g, 'ż')

const oldMatch = cleanBody.match(/z dnia\s+(?:[a-ząćęłńóśźż]+\s*,\s*)?(\d{1,2})\s+(.+?)\s+(\d{4})\s+(\d{2}):(\d{2})/i)

console.log("oldMatch:", oldMatch);
