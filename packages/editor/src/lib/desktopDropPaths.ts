export type FileWithDesktopPath = File & {
  path?: string;
};

export function extractDesktopDroppedPaths(files: Iterable<File>): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const file of files) {
    const candidate = (file as FileWithDesktopPath).path?.trim();
    if (!candidate || seen.has(candidate)) {
      continue;
    }

    seen.add(candidate);
    paths.push(candidate);
  }

  return paths;
}
