import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Tag } from "@/components/Tag";
import { getProfileHref } from "@/lib/profile";
import { formatRelativeTime } from "@/lib/time";
import { chatMessages } from "./mock";

export const UniChat = () => {
  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Tag tone="mint">Uni Chat</Tag>
          <p className="mt-2 text-sm text-muted">
            Global chat. Keep it light, invite people in.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-accent-2/20 px-3 py-1 text-xs font-semibold leading-none text-accent-2">
          {chatMessages.length} online
        </span>
      </div>
      <div className="space-y-4">
        {chatMessages.map((message) => (
          <div key={message.id} className="flex items-start gap-3">
            <Link
              href={getProfileHref(message.author)}
              aria-label={`View ${message.author.handle} profile`}
              className="rounded-full transition hover:-translate-y-0.5 hover:shadow-sm"
            >
              <Avatar
                name={message.author.name}
                avatarUrl={message.author.avatarUrl}
                size={32}
              />
            </Link>
            <div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-ink">
                  {message.author.handle}
                </span>
                <span>{formatRelativeTime(message.createdAt)}</span>
              </div>
              <p className="text-sm text-ink/90">{message.message}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-card-border/70 bg-white/70 p-3">
        <p className="text-xs font-semibold text-muted">Say something</p>
        <input
          className="mt-2 w-full bg-transparent text-sm outline-none"
          placeholder="Drop a plan, a question, or a vibe..."
        />
        <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted">
          TODO: wire real-time chat
        </p>
      </div>
    </Card>
  );
};
