"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useAuth } from "@/features/auth";
import { apiGet, apiPost } from "@/lib/api";
import { getProfileHref } from "@/lib/profile";
import { formatRelativeTime } from "@/lib/time";

type MessageUser = {
  id: string;
  name: string;
  handle: string;
  avatarUrl?: string | null;
};

type DirectMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: MessageUser;
  recipient: MessageUser;
};

type ThreadResponse = {
  user: MessageUser;
  messages: DirectMessage[];
};

type MessagePageProps = {
  params?: {
    handle?: string;
  };
};

const inputClasses =
  "w-full rounded-2xl border border-card-border/70 bg-white/80 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent/60 focus:bg-white";

export default function MessagePage({ params }: MessagePageProps) {
  const router = useRouter();
  const routeParams = useParams();
  const { token, user, isAuthenticated, openAuthModal } = useAuth();
  const [threadUser, setThreadUser] = useState<MessageUser | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const handleSlug = useMemo(() => {
    const paramValue =
      (routeParams as { handle?: string | string[] } | null)?.handle ??
      params?.handle ??
      "";
    const raw = Array.isArray(paramValue) ? paramValue[0] ?? "" : paramValue;
    if (!raw) {
      return "";
    }
    const decoded = decodeURIComponent(raw);
    return decoded.replace(/^@/, "").trim();
  }, [params?.handle, routeParams]);

  useEffect(() => {
    if (!token) {
      return;
    }
    if (!handleSlug) {
      setError("Missing chat handle.");
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    apiGet<ThreadResponse>(`/messages/with/${encodeURIComponent(handleSlug)}`, token)
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setThreadUser(payload.user);
        setMessages(payload.messages);
      })
      .catch((loadError) => {
        if (!isActive) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this chat."
        );
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [handleSlug, token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      openAuthModal("login");
      return;
    }
    if (!handleSlug) {
      setError("Missing chat handle.");
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Write a message before sending.");
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const response = await apiPost<{ message: DirectMessage }>(
        `/messages/with/${encodeURIComponent(handleSlug)}`,
        { body: trimmed },
        token
      );
      setMessages((prev) => [...prev, response.message]);
      setDraft("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send message."
      );
    } finally {
      setIsSending(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-4xl px-4 pb-16 pt-2">
        <Card className="py-10 text-center text-sm text-muted">
          <p className="mb-4 text-base text-ink">Sign in to keep chatting.</p>
          <Button requiresAuth={false} onClick={() => openAuthModal("login")}>
            Log in
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-2">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Messages</h1>
            <p className="text-sm text-muted">
              Keep the momentum going with your crew.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              requiresAuth={false}
              onClick={() => router.push("/friends")}
            >
              Back to friends
            </Button>
          </div>
        </div>

        {error && (
          <Card className="border border-accent/30 bg-accent/10 py-4">
            <p className="text-sm font-semibold text-accent">{error}</p>
          </Card>
        )}

        {isLoading ? (
          <Card className="py-10 text-center text-sm text-muted">
            Loading messages...
          </Card>
        ) : (
          <Card className="flex h-[60vh] min-h-[420px] flex-col gap-6 md:h-[65vh]">
            {threadUser ? (
              <div className="flex items-center gap-3">
                <Link
                  href={getProfileHref(threadUser, user?.id)}
                  className="block shrink-0 rounded-full transition hover:opacity-90"
                >
                  <Avatar
                    name={threadUser.name}
                    avatarUrl={threadUser.avatarUrl}
                    size={44}
                  />
                </Link>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    {threadUser.name}
                  </p>
                  <p className="text-xs text-muted">{threadUser.handle}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No chat selected.</p>
            )}

            <div className="flex-1 overflow-y-auto pr-1">
              <div className="space-y-3">
                {messages.length === 0 ? (
                  <p className="text-sm text-muted">
                    No messages yet. Start the conversation.
                  </p>
                ) : (
                  messages.map((message) => {
                    const isMine = message.sender.id === user?.id;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                            isMine
                              ? "bg-accent text-white"
                              : "border border-card-border/70 bg-white/90 text-ink"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{message.body}</p>
                          <span
                            className={`mt-2 block text-xs ${
                              isMine ? "text-white/70" : "text-muted"
                            }`}
                          >
                            {formatRelativeTime(message.createdAt)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={endRef} />
              </div>
            </div>

            <form
              className="mt-auto space-y-3 border-t border-card-border/60 pt-4"
              onSubmit={handleSubmit}
            >
              <textarea
                className={`${inputClasses} min-h-[120px]`}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Drop a thought, a plan, or a hello."
              />
              <div className="flex justify-end">
                <Button type="submit" disabled={isSending}>
                  {isSending ? "Sending..." : "Send"}
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
