export function maskPhone(phone: string): string {
    if (!phone) return phone;
    let clean = phone.trim();
    
    if (clean.length < 5) return clean;
    
    const isInternational = clean.startsWith('+');
    let prefixLen = isInternational ? 5 : 2; 
    
    const firstSpace = clean.indexOf(' ');
    if (isInternational && firstSpace > 0 && firstSpace < 5) {
        prefixLen = firstSpace + 3; // +91 98
    }

    const P = clean.slice(0, prefixLen);
    const S = clean.slice(-3);
    const M = clean.slice(prefixLen, -3);
    
    const maskedM = M.replace(/\d/g, 'X');
    
    return `${P}${maskedM}${S}`;
}
