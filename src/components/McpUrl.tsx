import { CopyButton } from "./CopyButton";

export function McpUrl({ url, compact = false }: { url: string; compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border-[1.5px] border-line bg-cal-2/60 ${compact ? "p-1.5 pl-3" : "p-2 pl-3.5"}`}>
      <code className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink" title={url}>
        {url}
      </code>
      <CopyButton value={url} />
    </div>
  );
}
