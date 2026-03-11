// Utilidades de formato para respuestas

export const fmt = {
  money: (n: any): string => {
    const num = Number(n);
    return isFinite(num) ? `$${num.toFixed(2)}` : '$0.00';
  },

  season: (s: any): string => {
    if (!s || s === 'undefined') return 'N/D';
    const str = String(s);
    // Insertar guión si es formato 2024SS -> 2024-SS
    return str.replace(/^(\d{4})([A-Z]{2})$/i, '$1-$2');
  },

  na: (v: any): string => {
    return (v == null || v === 'undefined' || v === '') ? 'N/D' : String(v);
  },

  pct: (v: any): string => {
    return (v == null || v === 'undefined' || v === '')
      ? 'No definido'
      : `${Number(v).toFixed(2)}%`;
  },
};

// Recortar texto a un número máximo de líneas
export function trimToLines(text: string, limit: number): { text: string; trimmed: boolean } {
  if (!text) return { text: '', trimmed: false };
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length <= limit) {
    return { text: lines.join('\n').trim(), trimmed: false };
  }
  return { text: lines.slice(0, limit).join('\n').trim(), trimmed: true };
}

// Recortar texto a un número máximo de caracteres
export function trimToChars(text: string, max = 800): string {
  if (text.length <= max) return text;
  return text.slice(0, max).replace(/\s+\S*$/, '') + '…';
}

// Valor por defecto si es null/undefined/vacío
export function val(field: any): any {
  return (field == null || field === '') ? 'N/D' : field;
}
