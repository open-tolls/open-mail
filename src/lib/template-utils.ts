export const extractTemplateVariables = (...values: Array<string | null | undefined>) => {
  const variables = new Set<string>();

  values.forEach((value) => {
    if (!value) {
      return;
    }

    value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, match: string) => {
      const normalizedMatch = match.trim();
      if (normalizedMatch) {
        variables.add(normalizedMatch);
      }
      return _;
    });
  });

  return [...variables];
};

export const applyTemplateVariables = (value: string, replacements: Record<string, string>) =>
  value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, match: string) => replacements[match.trim()] ?? '');
