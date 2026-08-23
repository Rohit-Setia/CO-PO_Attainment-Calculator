export const COS = Array.from({ length: 12 }, (_, index) => `CO${index + 1}`);

export const getCoLabel = (value) => {
  if (value == null || value === '') return '';
  const normalized = String(value).trim().toUpperCase();
  return normalized.startsWith('CO') ? normalized : `CO${normalized.replace(/\D/g, '')}`;
};

export const sumValues = (values = []) => values.reduce((total, value) => total + Number(value || 0), 0);
