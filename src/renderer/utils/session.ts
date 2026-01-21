let messageIdCounter = 0;
export const generateId = () => `msg-${++messageIdCounter}-${Date.now()}`;

let tabCounter = 0;
export const generateTabName = () => `Session ${++tabCounter}`;
export const setTabCounter = (value: number) => {
  tabCounter = value;
};

// Format tool output into a summary string like CLI does
export const formatToolOutput = (
  toolName: string,
  input: Record<string, unknown>,
  output: unknown,
): string => {
  const out = output as Record<string, unknown> | string | undefined;
  const path = input.path as string | undefined;
  const shortPath = path ? path.split("/").slice(-2).join("/") : "";

  if (toolName === "grep") {
    if (typeof out === "object" && out?.output) {
      const lines = String(out.output)
        .split("\n")
        .filter((l) => l.trim()).length;
      return lines > 0 ? `${lines} lines found` : "No matches found";
    }
    return "No matches found";
  }

  if (toolName === "glob") {
    if (typeof out === "object" && out?.output) {
      const files = String(out.output)
        .split("\n")
        .filter((l) => l.trim()).length;
      return `${files} files found`;
    }
    return "No files found";
  }

  if (toolName === "view") {
    const range = input.view_range as number[] | undefined;
    if (range && range.length >= 2) {
      const lineCount =
        range[1] === -1 ? "rest of file" : `${range[1] - range[0] + 1} lines`;
      return shortPath ? `${shortPath} (${lineCount})` : `${lineCount} read`;
    }
    return shortPath ? `${shortPath} read` : "File read";
  }

  if (toolName === "edit") {
    return shortPath ? `${shortPath} edited` : "File edited";
  }

  if (toolName === "create") {
    return shortPath ? `${shortPath} created` : "File created";
  }

  if (toolName === "bash") {
    if (typeof out === "object" && out?.output) {
      const lines = String(out.output)
        .split("\n")
        .filter((l) => l.trim()).length;
      return `${lines} lines...`;
    }
    return "Completed";
  }

  if (toolName === "web_fetch") {
    return "Page fetched";
  }

  if (toolName === "read_bash") {
    return "Output read";
  }

  if (toolName === "write_bash") {
    return "Input sent";
  }

  return "Done";
};
