export const DOCKER_LOGS_MAX_BYTES = 512 * 1024;
export const DOCKER_LOGS_DEFAULT_TAIL = 200;
export const DOCKER_LOGS_MAX_TAIL = 500;

const ANSI_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/gu;

export function sanitizeDockerLogText(value: string): string {
  const withoutAnsi = value.replace(ANSI_PATTERN, "");
  let output = "";
  for (const char of withoutAnsi) {
    const code = char.charCodeAt(0);
    if (char === "\n" || char === "\t") output += char;
    else if (char === "\r") continue;
    else if (code >= 32) output += char;
  }
  return output;
}

function decodeUtf8(buffer: Buffer): string {
  return buffer.toString("utf8").replace(/\uFFFD/gu, "");
}

function looksLikeMultiplexHeader(body: Buffer, offset: number): boolean {
  if (offset + 8 > body.length) return false;
  const streamType = body[offset];
  const reserved = body[offset + 1] === 0 && body[offset + 2] === 0 && body[offset + 3] === 0;
  return (streamType === 1 || streamType === 2) && reserved;
}

export function decodeDockerLogs(
  body: Buffer,
  tty: boolean,
): { text: string; truncated: boolean; tty: boolean } {
  const limited =
    body.length > DOCKER_LOGS_MAX_BYTES ? body.subarray(0, DOCKER_LOGS_MAX_BYTES) : body;
  const overflow = body.length > DOCKER_LOGS_MAX_BYTES;
  if (tty || limited.length === 0 || !looksLikeMultiplexHeader(limited, 0)) {
    return {
      text: sanitizeDockerLogText(decodeUtf8(limited)),
      truncated: overflow,
      tty: tty || !looksLikeMultiplexHeader(limited, 0),
    };
  }
  const chunks: string[] = [];
  let offset = 0;
  let truncated = overflow;
  while (offset < limited.length) {
    if (offset + 8 > limited.length) {
      truncated = true;
      break;
    }
    if (!looksLikeMultiplexHeader(limited, offset)) {
      truncated = true;
      break;
    }
    const size = limited.readUInt32BE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > limited.length) {
      truncated = true;
      break;
    }
    chunks.push(sanitizeDockerLogText(decodeUtf8(limited.subarray(start, end))));
    offset = end;
  }
  return { text: chunks.join(""), truncated, tty: false };
}
