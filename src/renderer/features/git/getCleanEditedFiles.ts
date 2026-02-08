/** Deduplicate and filter edited files */
export const getCleanEditedFiles = (files: string[]): string[] => {
  return Array.from(new Set(files.filter((f) => f?.trim())));
};
