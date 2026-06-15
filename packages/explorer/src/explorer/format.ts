// packages/explorer/src/explorer/format.ts

export function truncateMiddle(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatTimestamp(value: string | null): string {
  if (value == null) return "Pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatBytes(value: number): string {
  return `${formatNumber(value)} bytes`;
}

export function statusClass(status: string): string {
  if (status === "confirmed" || status === "active") {
    return "border-ecash-700 bg-ecash-950/50 text-ecash-300";
  }

  if (status === "mempool" || status === "preview") {
    return "border-yellow-700 bg-yellow-950/40 text-yellow-300";
  }

  return "border-gray-700 bg-gray-900 text-gray-300";
}
