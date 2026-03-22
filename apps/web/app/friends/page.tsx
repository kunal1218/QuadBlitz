"use client";

import type {
  FormEvent,
  JSX,
  KeyboardEvent as ReactKeyboardEvent,
  SVGProps,
} from "react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Outfit } from "next/font/google";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { deriveCollegeFromDomain } from "@/lib/college";
import { formatRelativeTime } from "@/lib/time";

type FriendUser = {
  id: string;
  name: string;
  handle: string;
  collegeName?: string | null;
  collegeDomain?: string | null;
};

type FriendRequest = {
  id: string;
  createdAt: string;
  requester: FriendUser;
  recipient: FriendUser;
};

type FriendSummary = {
  friends: FriendUser[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  blocked: FriendUser[];
};

type MessageUser = {
  id: string;
  name: string;
  handle: string;
};

type DirectMessage = {
  id: string;
  body: string;
  createdAt: string;
  sender: MessageUser;
  recipient: MessageUser;
  edited?: boolean;
};

type ThreadResponse = {
  user: MessageUser;
  messages: DirectMessage[];
};

type NotificationCountResponse = {
  count: number;
};

type HeaderIconComponent = (props: SVGProps<SVGSVGElement>) => JSX.Element;

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const LAST_HANDLE_KEY = "friends:lastHandle";

const normalizeHandle = (handle: string) => handle.replace(/^@/, "").trim();

const getCollegeLabel = (user: FriendUser) =>
  user.collegeName ?? deriveCollegeFromDomain(user.collegeDomain ?? "") ?? "";

const formatCompactPoints = (value: number) => {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}KBLITZPTS`;
  }
  return `${value}BLITZPTS`;
};

const HomeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.9 7.12 8 2.86l5.1 4.26v5.14a.8.8 0 0 1-.8.8H9.44V9.4H6.56v3.66H3.7a.8.8 0 0 1-.8-.8V7.12Z"
      fill="currentColor"
    />
  </svg>
);

const ChallengeNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M8.77 1.92 4.52 8.22h2.9l-1.02 5.87 5.05-6.83H8.58l.19-5.34Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

const ChatNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.23 3.22h9.54a.8.8 0 0 1 .8.8v6.03a.8.8 0 0 1-.8.8H7.41L4.68 12.9v-2.05H3.23a.8.8 0 0 1-.8-.8V4.02a.8.8 0 0 1 .8-.8Z"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
  </svg>
);

const MapsNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M2.5 4.35 6.42 2.8l3.17 1.06 3.91-1.55v9.34l-3.91 1.55-3.17-1.06-3.92 1.55V4.35Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path d="M6.42 2.8v9.34M9.58 3.86v9.34" stroke="currentColor" strokeWidth="1.65" />
  </svg>
);

const MarketNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
    <path
      d="M3.3 6.1h9.4v5.4a.8.8 0 0 1-.8.8H4.1a.8.8 0 0 1-.8-.8V6.1Z"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinejoin="round"
    />
    <path
      d="M5.04 6.1V4.87a2.96 2.96 0 0 1 5.92 0V6.1M3.25 6.1l1.33-2.36M12.75 6.1l-1.33-2.36"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const BellNavIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" {...props}>
    <path
      d="M9 2.8a3.1 3.1 0 0 0-3.1 3.1v1.35c0 .72-.22 1.42-.64 2l-1.13 1.58h9.76l-1.13-1.58a3.48 3.48 0 0 1-.64-2V5.9A3.1 3.1 0 0 0 9 2.8Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M7.2 12.4a1.8 1.8 0 0 0 3.6 0"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const SearchIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="8.6" cy="8.6" r="5.4" stroke="currentColor" strokeWidth="1.9" />
    <path d="m12.8 12.8 4 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
  </svg>
);

const MoreIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="10" cy="4.25" r="1.4" fill="currentColor" />
    <circle cx="10" cy="10" r="1.4" fill="currentColor" />
    <circle cx="10" cy="15.75" r="1.4" fill="currentColor" />
  </svg>
);

const PlusIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="10" cy="10" r="8.4" stroke="currentColor" strokeWidth="1.7" />
    <path d="M10 6.3v7.4M6.3 10h7.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const EmojiIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.7" />
    <path d="M7.15 12.15c.66.92 1.63 1.4 2.85 1.4 1.22 0 2.19-.48 2.85-1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="7.35" cy="8.25" r="1" fill="currentColor" />
    <circle cx="12.65" cy="8.25" r="1" fill="currentColor" />
  </svg>
);

const SendIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
    <path
      d="m3 10 13.2-5.7c.53-.23 1.07.3.84.83L11.3 18.35c-.25.56-1.06.5-1.23-.08L8.7 12.2 3 10Z"
      fill="currentColor"
    />
    <path d="M8.7 12.2 16.65 4.25" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const SiteIcon = () => (
  <svg
    viewBox="0 0 40 40"
    aria-hidden="true"
    className="h-[34px] w-[34px] shrink-0"
    xmlns="http://www.w3.org/2000/svg"
  >
    <circle cx="20" cy="20" r="19" fill="#1456f4" />
    <circle cx="20" cy="20" r="5.2" fill="white" />
    <circle cx="20" cy="9.4" r="3.15" fill="white" />
    <circle cx="29.2" cy="14.7" r="3.15" fill="white" />
    <circle cx="29.2" cy="25.3" r="3.15" fill="white" />
    <circle cx="20" cy="30.6" r="3.15" fill="white" />
    <circle cx="10.8" cy="25.3" r="3.15" fill="white" />
    <circle cx="10.8" cy="14.7" r="3.15" fill="white" />
    <path
      d="M20 14.6v-2.2M24.6 17.3l2.05-1.18M24.6 22.7l2.05 1.18M20 25.4v2.2M15.4 22.7l-2.05 1.18M15.4 17.3l-2.05-1.18"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      opacity="0.96"
    />
  </svg>
);

const HeaderWordmark = () => (
  <span className="inline-flex items-center gap-[10px]">
    <SiteIcon />
    <span className="text-[21px] font-extrabold tracking-[-0.045em] text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]">
      QuadBlitz
    </span>
  </span>
);

const headerNavItems: Array<{
  href: string;
  label: string;
  icon: HeaderIconComponent;
  active?: boolean;
}> = [
  { href: "/", label: "HOME", icon: HomeNavIcon },
  { href: "/challenges", label: "CHALLENGES", icon: ChallengeNavIcon },
  { href: "/friends", label: "CHAT", icon: ChatNavIcon, active: true },
  { href: "/map", label: "MAPS", icon: MapsNavIcon },
  { href: "/marketplace", label: "MARKET", icon: MarketNavIcon },
];

function FriendsPageContent() {
  const { token, user, isAuthenticated, openAuthModal } = useAuth();
  const searchParams = useSearchParams();
  const [summary, setSummary] = useState<FriendSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const [threadUser, setThreadUser] = useState<MessageUser | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState("");
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const initializedSelectionRef = useRef(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: "remove" | "block";
    handle: string;
    displayHandle: string;
  } | null>(null);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  const refreshSummary = useCallback(async () => {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiGet<FriendSummary>("/friends/summary", token);
      setSummary(response);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load friends."
      );
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    refreshSummary();
  }, [refreshSummary, token]);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }

    let isActive = true;

    const loadCount = async () => {
      try {
        const payload = await apiGet<NotificationCountResponse>(
          "/notifications/unread-count",
          token
        );
        if (isActive) {
          setUnreadCount(payload.count ?? 0);
        }
      } catch {
        if (isActive) {
          setUnreadCount(0);
        }
      }
    };

    loadCount();
    const interval = window.setInterval(loadCount, 15000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!summary || initializedSelectionRef.current) {
      return;
    }

    const handles = summary.friends.map((friend) => normalizeHandle(friend.handle));
    const queryHandleRaw = searchParams.get("handle") ?? "";
    const queryHandle = normalizeHandle(queryHandleRaw);
    const stored =
      typeof window !== "undefined"
        ? normalizeHandle(localStorage.getItem(LAST_HANDLE_KEY) ?? "")
        : "";
    const firstHandle = handles[0] ?? null;

    let next: string | null = null;
    if (queryHandle && handles.includes(queryHandle)) {
      next = queryHandle;
    } else if (stored && handles.includes(stored)) {
      next = stored;
    } else if (firstHandle) {
      next = firstHandle;
    }

    if (next) {
      setSelectedHandle(next);
      initializedSelectionRef.current = true;
      if (typeof window !== "undefined") {
        localStorage.setItem(LAST_HANDLE_KEY, next);
      }
    }
  }, [summary, searchParams]);

  useEffect(() => {
    if (!summary) {
      return;
    }
    const queryHandle = normalizeHandle(searchParams.get("handle") ?? "");
    if (
      queryHandle &&
      queryHandle !== selectedHandle &&
      summary.friends.some((friend) => normalizeHandle(friend.handle) === queryHandle)
    ) {
      setSelectedHandle(queryHandle);
      if (typeof window !== "undefined") {
        localStorage.setItem(LAST_HANDLE_KEY, queryHandle);
      }
    }
  }, [searchParams, summary, selectedHandle]);

  useEffect(() => {
    if (!summary) {
      return;
    }
    if (
      selectedHandle &&
      !summary.friends.some(
        (friend) => normalizeHandle(friend.handle) === selectedHandle
      )
    ) {
      const fallback = summary.friends[0]?.handle
        ? normalizeHandle(summary.friends[0].handle)
        : null;
      setSelectedHandle(fallback ?? null);
    }
  }, [selectedHandle, summary]);

  useEffect(() => {
    if (!token || !selectedHandle) {
      setThreadUser(null);
      setMessages([]);
      return;
    }

    let isActive = true;
    setIsChatLoading(true);
    setChatError(null);
    setThreadUser(null);
    setMessages([]);
    setDraft("");
    setEditingMessageId(null);
    setEditingDraft("");
    setSelectedMessageId(null);

    apiGet<ThreadResponse>(`/messages/with/${encodeURIComponent(selectedHandle)}`, token)
      .then((payload) => {
        if (!isActive) {
          return;
        }
        setThreadUser(payload.user);
        setMessages(payload.messages);
        if (typeof window !== "undefined") {
          localStorage.setItem(LAST_HANDLE_KEY, selectedHandle);
        }
      })
      .catch((loadError) => {
        if (!isActive) {
          return;
        }
        setChatError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this conversation."
        );
        setThreadUser(null);
        setMessages([]);
      })
      .finally(() => {
        if (isActive) {
          setIsChatLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedHandle, token]);

  useEffect(() => {
    if (messages.length <= 1) {
      listRef.current?.scrollTo({ top: 0 });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedHandle) {
      return;
    }
    window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [selectedHandle]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedMessageId) {
        const targetMessage = messages.find((message) => message.id === selectedMessageId);
        if (targetMessage && targetMessage.sender.id === user?.id) {
          setMessageToDelete(selectedMessageId);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messages, selectedMessageId, user?.id]);

  useEffect(() => {
    if (!editingMessageId) {
      return;
    }
    window.setTimeout(() => {
      editInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, [editingMessageId]);

  const handleEnterToSend = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing =
      (event.nativeEvent as unknown as { isComposing?: boolean })?.isComposing ?? false;
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !isComposing &&
      !isSending &&
      !isChatLoading &&
      selectedHandle
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  };

  const handleCancelRequest = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    await apiDelete(`/friends/requests/with/${encodeURIComponent(handle)}`, token);
    refreshSummary();
  };

  const performRemove = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    await apiDelete(`/friends/${encodeURIComponent(handle)}`, token);
    refreshSummary();
  };

  const performBlock = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    await apiPost(`/friends/block/${encodeURIComponent(handle)}`, {}, token);
    refreshSummary();
  };

  const handleUnblock = async (handle: string) => {
    if (!token) {
      openAuthModal();
      return;
    }
    await apiDelete(`/friends/block/${encodeURIComponent(handle)}`, token);
    refreshSummary();
  };

  const handleSelectFriend = (handle: string) => {
    const normalized = normalizeHandle(handle);
    setSelectedHandle(normalized);
    setChatError(null);
    setEditingMessageId(null);
    setEditingDraft("");
    setSelectedMessageId(null);
    if (typeof window !== "undefined") {
      localStorage.setItem(LAST_HANDLE_KEY, normalized);
    }
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  };

  const confirmRemove = (handle: string) => {
    setConfirmAction({
      type: "remove",
      handle,
      displayHandle: normalizeHandle(handle),
    });
  };

  const confirmBlock = (handle: string) => {
    setConfirmAction({
      type: "block",
      handle,
      displayHandle: normalizeHandle(handle),
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction) {
      return;
    }
    const targetHandle = confirmAction.handle;
    setIsConfirmingAction(true);
    try {
      if (confirmAction.type === "remove") {
        await performRemove(targetHandle);
        if (confirmAction.displayHandle === selectedHandle) {
          setSelectedHandle(null);
          setThreadUser(null);
          setMessages([]);
        }
      } else {
        await performBlock(targetHandle);
      }
      setConfirmAction(null);
    } finally {
      setIsConfirmingAction(false);
    }
  };

  const beginEditMessage = (message: DirectMessage) => {
    if (message.sender.id !== user?.id) {
      return;
    }
    setEditingMessageId(message.id);
    setEditingDraft(message.body);
    setSelectedMessageId(message.id);
  };

  const cancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingDraft("");
  };

  const saveEditedMessage = async () => {
    if (!editingMessageId || !token) {
      return;
    }
    const trimmed = editingDraft.trim();
    if (!trimmed) {
      setChatError("Write something to save.");
      return;
    }
    const current = messages.find((message) => message.id === editingMessageId);
    if (current && current.body === trimmed) {
      setEditingMessageId(null);
      setEditingDraft("");
      return;
    }
    try {
      const response = await apiPatch<{ message: DirectMessage }>(
        `/messages/${encodeURIComponent(editingMessageId)}`,
        { body: trimmed },
        token
      );
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.id === editingMessageId
            ? { ...response.message, edited: true }
            : message
        )
      );
      setEditingMessageId(null);
      setEditingDraft("");
      setChatError(null);
    } catch (updateError) {
      setChatError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update message."
      );
    }
  };

  const handleDeleteMessage = async () => {
    if (!messageToDelete || !token) {
      return;
    }
    try {
      await apiDelete(`/messages/${encodeURIComponent(messageToDelete)}`, token);
      setMessages((currentMessages) =>
        currentMessages.filter((message) => message.id !== messageToDelete)
      );
      setSelectedMessageId(null);
      if (editingMessageId === messageToDelete) {
        setEditingMessageId(null);
        setEditingDraft("");
      }
    } catch (deleteError) {
      setChatError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete message."
      );
    } finally {
      setMessageToDelete(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      openAuthModal("login");
      return;
    }
    const slug = selectedHandle;
    if (!slug) {
      setChatError("Pick someone to chat with.");
      return;
    }

    const trimmed = draft.trim();
    if (!trimmed) {
      setChatError("Write a message before sending.");
      return;
    }

    setIsSending(true);
    setChatError(null);

    try {
      const response = await apiPost<{ message: DirectMessage }>(
        `/messages/with/${encodeURIComponent(slug)}`,
        { body: trimmed },
        token
      );
      setMessages((currentMessages) => [...currentMessages, response.message]);
      setDraft("");
    } catch (submitError) {
      setChatError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send message."
      );
    } finally {
      setIsSending(false);
    }
  };

  const selectedFriend =
    summary?.friends.find(
      (friend) => normalizeHandle(friend.handle) === selectedHandle
    ) ?? null;
  const activeUser = threadUser ?? selectedFriend;
  const activeCollegeLabel = selectedFriend ? getCollegeLabel(selectedFriend) : "";
  const filteredFriends =
    summary?.friends.filter((friend) => {
      const search = friendSearch.trim().toLowerCase();
      if (!search) {
        return true;
      }
      const collegeLabel = getCollegeLabel(friend).toLowerCase();
      return (
        friend.name.toLowerCase().includes(search) ||
        friend.handle.toLowerCase().includes(search) ||
        collegeLabel.includes(search)
      );
    }) ?? [];
  const profileName = user?.name ?? "Profile";
  const profilePoints = formatCompactPoints(user?.coins ?? 0);

  return (
    <div className={`${outfit.className} h-screen overflow-hidden bg-white text-[#181d25]`}>
      <header className="sticky top-0 z-30 border-b border-[#eef1f6] bg-[linear-gradient(90deg,rgba(255,255,255,0.98)_0%,rgba(255,255,255,0.98)_24%,rgba(241,246,255,0.98)_56%,rgba(255,255,255,0.98)_88%)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1880px] items-center justify-between gap-6 px-[28px] py-[15px] xl:px-[30px]">
          <div className="flex items-center gap-[54px]">
            <Link href="/" className="inline-flex items-center leading-none">
              <HeaderWordmark />
            </Link>
            <nav className="hidden items-center gap-[44px] lg:flex">
              {headerNavItems.map(({ href, icon: Icon, label, active }) => (
                <Link
                  key={label}
                  href={href}
                  className={`inline-flex items-center gap-[9px] text-[14px] font-semibold tracking-[-0.01em] transition ${
                    active
                      ? "text-[#1456f4] [text-shadow:0_0_0.01px_rgba(20,86,244,0.35)]"
                      : "text-[#4b5059] hover:text-[#1456f4]"
                  }`}
                >
                  <Icon
                    className={`h-[16px] w-[16px] ${
                      active ? "text-[#1456f4]" : "text-[#4f5560]"
                    }`}
                  />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-5">
            <Link
              href="/notifications"
              aria-label="Notifications"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-[#252a34] transition hover:bg-[#f4f7fb]"
            >
              <BellNavIcon className="h-[20px] w-[20px]" />
              {token && unreadCount > 0 && (
                <span className="absolute right-[9px] top-[6px] h-[4px] w-[4px] rounded-full bg-[#ff4c4c]" />
              )}
            </Link>

            {isAuthenticated ? (
              <Link
                href="/profile"
                className="flex items-center gap-3 border-l border-[#eceff5] pl-6"
              >
                <div className="text-right leading-none">
                  <p className="text-[14px] font-bold tracking-[-0.04em] text-[#20242d]">
                    {profileName}
                  </p>
                  <p className="mt-[3px] text-[10.5px] font-medium uppercase tracking-[-0.01em] text-[#666d7b]">
                    {profilePoints}
                  </p>
                </div>
                <Avatar
                  name={profileName}
                  size={42}
                  className="border border-[#dde4ef] bg-white text-[#202531] shadow-[0_10px_20px_rgba(26,39,73,0.08)]"
                />
              </Link>
            ) : (
              <button
                type="button"
                className="rounded-full bg-[#1756f5] px-6 py-[15px] text-[13px] font-semibold tracking-[0.18em] text-white shadow-[0_14px_30px_rgba(23,86,245,0.22)] transition hover:bg-[#0f49e2]"
                onClick={() => openAuthModal("signup")}
              >
                SIGN UP
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto grid h-[calc(100vh-81px)] max-w-[1920px] overflow-hidden lg:grid-cols-[324px_minmax(0,1fr)]">
        <aside className="flex h-full min-h-0 flex-col overflow-hidden border-r border-[#edf0f6] bg-[#fbfcff] px-8 py-8">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
              Direct Chat
            </p>
            <h1 className="mt-4 text-[24px] font-[700] tracking-[-0.06em] text-[#20242d]">
              Your Friends
            </h1>
            <p className="mt-2 text-[14px] leading-[1.45] text-[#5f697b]">
              {isAuthenticated
                ? `${summary?.friends.length ?? 0} people ready for conversation.`
                : "Log in to see your people and keep conversations moving."}
            </p>
          </div>

          <div className="mt-6 rounded-full border border-[#e8edf6] bg-white px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
            <label className="flex items-center gap-3 text-[#6d778b]">
              <SearchIcon className="h-[18px] w-[18px]" />
              <input
                ref={searchInputRef}
                type="text"
                value={friendSearch}
                onChange={(event) => setFriendSearch(event.target.value)}
                placeholder="Search friends"
                className="w-full bg-transparent text-[14px] text-[#20242d] outline-none placeholder:text-[#a0a8b8]"
                disabled={!isAuthenticated || isLoading}
              />
            </label>
          </div>

          <div className="mt-8 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="space-y-6">
              {!isAuthenticated ? (
                <div className="rounded-[28px] border border-[#e8edf6] bg-white px-5 py-6 shadow-[0_12px_28px_rgba(18,36,81,0.05)]">
                  <p className="text-[16px] font-semibold tracking-[-0.04em] text-[#20242d]">
                    Sign in to view your chats
                  </p>
                  <p className="mt-2 text-sm leading-[1.5] text-[#5f697b]">
                    Your direct messages and friends list stay here once you are in.
                  </p>
                  <button
                    type="button"
                    className="mt-5 inline-flex rounded-full bg-[#1756f5] px-5 py-3 text-[12px] font-semibold tracking-[0.16em] text-white"
                    onClick={() => openAuthModal("login")}
                  >
                    LOG IN
                  </button>
                </div>
              ) : isLoading ? (
                <p className="text-sm text-[#697387]">Loading friends...</p>
              ) : error ? (
                <div className="rounded-[24px] border border-[#f1d4d4] bg-[#fff8f8] px-4 py-4 text-sm font-medium text-[#ab3b3b]">
                  {error}
                </div>
              ) : filteredFriends.length > 0 ? (
                <div className="space-y-3">
                  {filteredFriends.map((friend) => {
                    const slug = normalizeHandle(friend.handle);
                    const isActive = slug === selectedHandle;
                    const collegeLabel = getCollegeLabel(friend);
                    return (
                      <button
                        key={friend.id}
                        type="button"
                        className={`w-full rounded-[28px] border px-4 py-4 text-left transition ${
                          isActive
                            ? "border-transparent bg-[linear-gradient(90deg,#1456f4,#4b7df8)] text-white shadow-[0_20px_40px_rgba(20,86,244,0.2)]"
                            : "border-[#e7ecf5] bg-white text-[#20242d] shadow-[0_8px_20px_rgba(18,36,81,0.04)] hover:border-[#dbe2ee] hover:-translate-y-[1px]"
                        }`}
                        onClick={() => handleSelectFriend(slug)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <Avatar
                              name={friend.name}
                              size={46}
                              className={isActive ? "border border-white/20 text-[#202531]" : "border border-[#e5ebf5] text-[#202531]"}
                            />
                            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#27c27a]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`truncate text-[16px] font-[700] tracking-[-0.04em] ${
                                isActive ? "text-white" : "text-[#20242d]"
                              }`}
                            >
                              {friend.name}
                            </p>
                            <p
                              className={`mt-1 truncate text-[12px] ${
                                isActive ? "text-white/72" : "text-[#6d778b]"
                              }`}
                            >
                              {friend.handle} {collegeLabel ? `· ${collegeLabel}` : ""}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : summary && summary.friends.length > 0 ? (
                <div className="rounded-[24px] border border-[#e7ecf5] bg-white px-4 py-5 text-sm text-[#697387] shadow-[0_8px_20px_rgba(18,36,81,0.04)]">
                  No friends matched that search.
                </div>
              ) : (
                <div className="rounded-[24px] border border-[#e7ecf5] bg-white px-4 py-5 text-sm text-[#697387] shadow-[0_8px_20px_rgba(18,36,81,0.04)]">
                  Your friends list is empty right now. Accept requests in notifications
                  and your conversations will appear here.
                </div>
              )}

              {isAuthenticated && summary && summary.blocked.length > 0 && (
                <div className="rounded-[28px] border border-[#e7ecf5] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(18,36,81,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
                      Blocked
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#7d8697]">
                      {summary.blocked.length}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {summary.blocked.map((blocked) => (
                      <div
                        key={blocked.id}
                        className="rounded-[22px] border border-[#e7ecf5] bg-[#fbfcff] px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={blocked.name}
                            size={34}
                            className="border border-[#e5ebf5]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-[700] tracking-[-0.03em] text-[#20242d]">
                              {blocked.handle}
                            </p>
                            <p className="truncate text-[12px] text-[#6d778b]">
                              {getCollegeLabel(blocked) || "Campus member"}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="mt-3 rounded-full border border-[#dce3ef] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d]"
                          onClick={() => handleUnblock(blocked.handle)}
                        >
                          Unblock
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isAuthenticated && summary && summary.outgoing.length > 0 && (
                <div className="rounded-[28px] border border-[#e7ecf5] bg-white px-5 py-5 shadow-[0_8px_20px_rgba(18,36,81,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
                      Pending
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#7d8697]">
                      {summary.outgoing.length}
                    </p>
                  </div>
                  <div className="mt-4 space-y-3">
                    {summary.outgoing.map((request) => (
                      <div
                        key={request.id}
                        className="rounded-[22px] border border-[#e7ecf5] bg-[#fbfcff] px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={request.recipient.name}
                            size={34}
                            className="border border-[#e5ebf5]"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-[700] tracking-[-0.03em] text-[#20242d]">
                              {request.recipient.handle}
                            </p>
                            <p className="truncate text-[12px] text-[#6d778b]">
                              Sent {formatRelativeTime(request.createdAt)}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="mt-3 rounded-full border border-[#dce3ef] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d]"
                          onClick={() => handleCancelRequest(request.recipient.handle)}
                        >
                          Cancel
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
          <div className="flex items-center justify-between gap-6 border-b border-[#edf0f6] px-8 py-5">
            <div className="min-w-0">
              {activeUser ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-[18px] font-bold text-[#1456f4]">#</span>
                    <h2 className="truncate text-[18px] font-[700] tracking-[-0.05em] text-[#20242d]">
                      {normalizeHandle(activeUser.handle)}
                    </h2>
                    <span className="h-[6px] w-[6px] rounded-full bg-[#27c27a]" />
                    <p className="truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-[#5f697b]">
                      {activeCollegeLabel || "Campus Member"}
                    </p>
                  </div>
                  <p className="mt-1 text-[14px] text-[#6f7788]">
                    {activeUser.name}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#1456f4]">
                    Direct Messages
                  </p>
                  <h2 className="mt-2 text-[22px] font-[700] tracking-[-0.05em] text-[#20242d]">
                    Pick a friend to start
                  </h2>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {selectedFriend && (
                <>
                  <button
                    type="button"
                    className="hidden rounded-full border border-[#e5ebf5] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d] md:inline-flex"
                    onClick={() => confirmRemove(selectedFriend.handle)}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    className="hidden rounded-full border border-[#e5ebf5] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d] md:inline-flex"
                    onClick={() => confirmBlock(selectedFriend.handle)}
                  >
                    Block
                  </button>
                </>
              )}
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#495365] transition hover:bg-[#f4f7fb] hover:text-[#20242d]"
                onClick={() => searchInputRef.current?.focus()}
                aria-label="Search friends"
              >
                <SearchIcon className="h-[20px] w-[20px]" />
              </button>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#495365] transition hover:bg-[#f4f7fb] hover:text-[#20242d]"
                onClick={() => inputRef.current?.focus()}
                aria-label="More actions"
              >
                <MoreIcon className="h-[20px] w-[20px]" />
              </button>
            </div>
          </div>

          {chatError && (
            <div className="mx-8 mt-4 rounded-[22px] border border-[#f1d4d4] bg-[#fff8f8] px-4 py-3 text-sm font-medium text-[#a33b3b]">
              {chatError}
            </div>
          )}

          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-y-auto px-8 py-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {!isAuthenticated ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="max-w-[420px] text-center">
                  <p className="text-[28px] font-[700] tracking-[-0.06em] text-[#20242d]">
                    Sign in to keep chatting
                  </p>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#5f697b]">
                    Your direct messages are ready to come back as soon as you log in.
                  </p>
                  <button
                    type="button"
                    className="mt-6 rounded-full bg-[#1756f5] px-6 py-3 text-[12px] font-semibold tracking-[0.16em] text-white shadow-[0_16px_30px_rgba(23,86,245,0.24)]"
                    onClick={() => openAuthModal("login")}
                  >
                    LOG IN
                  </button>
                </div>
              </div>
            ) : isChatLoading ? (
              <p className="text-sm text-[#697387]">Loading conversation...</p>
            ) : !selectedHandle ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="max-w-[420px] text-center">
                  <p className="text-[28px] font-[700] tracking-[-0.06em] text-[#20242d]">
                    Select a friend on the left
                  </p>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#5f697b]">
                    Once you pick someone, your existing conversation will open here.
                  </p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full min-h-[420px] items-center justify-center">
                <div className="max-w-[420px] text-center">
                  <p className="text-[28px] font-[700] tracking-[-0.06em] text-[#20242d]">
                    No messages yet
                  </p>
                  <p className="mt-3 text-[15px] leading-[1.6] text-[#5f697b]">
                    Drop the first line below and start the conversation.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-7">
                {messages.map((message) => {
                  const isMine = message.sender.id === user?.id;
                  const isEditing = editingMessageId === message.id;
                  const isSelected = selectedMessageId === message.id;
                  const bubbleTone = isMine
                    ? "bg-[#1456f4] text-white shadow-[0_18px_34px_rgba(20,86,244,0.16)]"
                    : "border border-[#edf1f6] bg-[#f7f9fc] text-[#20242d]";

                  return (
                    <div
                      key={message.id}
                      className="flex gap-4 justify-start"
                    >
                      <Avatar
                        name={isMine ? user?.name ?? "You" : message.sender.name}
                        size={38}
                        className="mt-1 shrink-0 border border-[#e5ebf5] bg-white text-[#202531]"
                      />

                      <div className="max-w-[min(760px,84%)]">
                        <div className="mb-2 flex items-center gap-2">
                          <p className="text-[14px] font-[700] tracking-[-0.04em] text-[#20242d]">
                            {isMine ? "You" : message.sender.name}
                          </p>
                          <p className="text-[12px] font-medium text-[#8c95a6]">
                            {formatRelativeTime(message.createdAt)}
                          </p>
                        </div>

                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedMessageId(message.id)}
                          onDoubleClick={() => beginEditMessage(message)}
                          onKeyDown={(event) => {
                            if ((event.key === "Enter" || event.key === " ") && !isEditing) {
                              event.preventDefault();
                              setSelectedMessageId(message.id);
                            }
                          }}
                          className={`rounded-[32px] px-4 py-2.5 text-[15px] leading-[1.45] transition ${
                            bubbleTone
                          } ${isSelected ? "ring-2 ring-[#1456f4]/20" : ""}`}
                        >
                          {isEditing ? (
                            <textarea
                              ref={editInputRef}
                              value={editingDraft}
                              onChange={(event) => setEditingDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" && !event.shiftKey) {
                                  event.preventDefault();
                                  saveEditedMessage();
                                } else if (event.key === "Escape") {
                                  event.preventDefault();
                                  cancelEditMessage();
                                }
                              }}
                              rows={1}
                              className={`block h-[22px] w-full resize-none overflow-hidden bg-transparent outline-none ${
                                isMine ? "placeholder-white/70" : "placeholder-[#a0a8b8]"
                              }`}
                            />
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap">{message.body}</p>
                              {message.edited ? (
                                <div
                                  className={`mt-3 text-[12px] ${
                                    isMine ? "text-white/74" : "text-[#7d8697]"
                                  }`}
                                >
                                  edited
                                </div>
                              ) : null}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            )}
          </div>

          <form
            className="shrink-0 border-t border-[#edf0f6] px-6 py-5"
            onSubmit={handleSubmit}
          >
            <div className="flex items-center gap-3 rounded-[30px] border border-[#e7ecf5] bg-[#fbfcff] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#596274] transition hover:bg-white hover:text-[#20242d]"
                onClick={() => inputRef.current?.focus()}
                aria-label="Focus message input"
              >
                <PlusIcon className="h-[20px] w-[20px]" />
              </button>
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleEnterToSend}
                rows={1}
                placeholder={
                  selectedHandle
                    ? `Message @${selectedHandle}...`
                    : "Pick a friend to start typing..."
                }
                disabled={!selectedHandle || isSending || !isAuthenticated}
                className="h-9 max-h-32 flex-1 resize-none bg-transparent py-[7px] text-[15px] leading-[1.4] text-[#20242d] outline-none placeholder:text-[#a0a8b8]"
              />
              <button
                type="button"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#596274] transition hover:bg-white hover:text-[#20242d]"
                onClick={() => {
                  if (!selectedHandle || isSending || !isAuthenticated) {
                    return;
                  }
                  setDraft((current) => `${current}${current ? " " : ""}🙂`);
                  inputRef.current?.focus();
                }}
                aria-label="Add emoji"
              >
                <EmojiIcon className="h-[20px] w-[20px]" />
              </button>
              <button
                type="submit"
                disabled={!selectedHandle || isSending || isChatLoading || !isAuthenticated}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#1456f4] text-white shadow-[0_16px_30px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2] disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Send message"
              >
                <SendIcon className="h-[20px] w-[20px]" />
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-[#7d8697]">
              <p>Messages send as {user?.handle || "you"}.</p>
              <p>
                {isSending
                  ? "Sending..."
                  : editingMessageId
                    ? "Editing mode active."
                    : "Double click your own message to edit it."}
              </p>
            </div>
          </form>
        </section>
      </div>

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-[28px] border border-[#e7ecf5] bg-white p-6 shadow-[0_28px_80px_rgba(18,36,81,0.18)]">
            <p className="text-[22px] font-[700] tracking-[-0.05em] text-[#20242d]">
              Are you sure?
            </p>
            <p className="mt-3 text-sm leading-[1.55] text-[#5f697b]">
              {confirmAction.type === "remove"
                ? `Remove @${confirmAction.displayHandle} from your friends list?`
                : `Block @${confirmAction.displayHandle}? You will not receive messages from them.`}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[#dce3ef] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d]"
                onClick={() => {
                  if (isConfirmingAction) {
                    return;
                  }
                  setConfirmAction(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[#1456f4] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_12px_24px_rgba(20,86,244,0.2)] transition hover:bg-[#0f49e2]"
                onClick={handleConfirmAction}
                disabled={isConfirmingAction}
              >
                {isConfirmingAction
                  ? "Working..."
                  : confirmAction.type === "remove"
                    ? "Yes, remove"
                    : "Yes, block"}
              </button>
            </div>
          </div>
        </div>
      )}

      {messageToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-sm rounded-[28px] border border-[#e7ecf5] bg-white p-6 shadow-[0_28px_80px_rgba(18,36,81,0.18)]">
            <p className="text-[22px] font-[700] tracking-[-0.05em] text-[#20242d]">
              Delete message?
            </p>
            <p className="mt-3 text-sm leading-[1.55] text-[#5f697b]">
              This message will be removed for both participants.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-full border border-[#dce3ef] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#586173] transition hover:border-[#ced8e8] hover:text-[#20242d]"
                onClick={() => setMessageToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-full bg-[#1456f4] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-white shadow-[0_12px_24px_rgba(20,86,244,0.2)] transition hover:bg-[#0f49e2]"
                onClick={handleDeleteMessage}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FriendsPage() {
  return (
    <Suspense fallback={null}>
      <FriendsPageContent />
    </Suspense>
  );
}
