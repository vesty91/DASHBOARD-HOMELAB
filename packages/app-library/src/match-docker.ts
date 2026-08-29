function stripDigest(value: string): string {
  const at = value.lastIndexOf("@");
  return at === -1 ? value : value.slice(0, at);
}

function stripTag(value: string): string {
  const slash = value.lastIndexOf("/");
  const colon = value.lastIndexOf(":");
  return colon > slash ? value.slice(0, colon) : value;
}

export function normalizeDockerImageRef(imageRef: string): string | null {
  const trimmed = imageRef.trim().toLocaleLowerCase("und");
  if (!trimmed || trimmed.includes("..") || trimmed.includes("\\") || trimmed.includes(" "))
    return null;
  const name = stripTag(stripDigest(trimmed));
  return name || null;
}

export function matchDockerImage(
  imageRef: string,
  patterns: readonly string[] | undefined,
): boolean {
  const name = normalizeDockerImageRef(imageRef);
  if (!name || !patterns?.length) return false;
  for (const raw of patterns) {
    const pattern = raw.trim().toLocaleLowerCase("und");
    if (!pattern || pattern.includes("*") || pattern.includes("..") || !pattern.includes("/"))
      continue;
    if (name === pattern || name.endsWith(`/${pattern}`)) return true;
  }
  return false;
}

export function findDefinitionsForDockerImage<
  T extends { readonly discovery?: { readonly dockerImages?: readonly string[] } },
>(imageRef: string, definitions: readonly T[]): readonly T[] {
  return Object.freeze(
    definitions.filter((definition) =>
      matchDockerImage(imageRef, definition.discovery?.dockerImages),
    ),
  );
}
