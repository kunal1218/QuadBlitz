"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import type { FeedComment, FeedPost, PollOption } from "@lockedin/shared";
import {
  Bookmark,
  ChevronDown,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/features/auth";
import { MarketplaceHeader } from "@/features/marketplace/MarketplaceHeader";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { getProfileHref } from "@/lib/profile";
import { formatRelativeTime } from "@/lib/time";
import { feedPosts as fallbackFeedPosts } from "./mock";
import { PostComposerModal } from "./PostComposerModal";
import type { PostComposerPayload } from "./PostComposerModal";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const inputClasses =
  "w-full rounded-[26px] border border-[#e7edf6] bg-white px-5 py-4 text-[15px] text-[#20242d] outline-none transition placeholder:text-[#9aa3b2] focus:border-[#c9d7ff] focus:ring-4 focus:ring-[#1456f4]/10";

const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

type FeedPostWithOptionalImage = FeedPost & {
  imageUrl?: string | null;
  imageData?: string | null;
  image?: string | null;
  mediaUrl?: string | null;
};

type CommentSort = "newest" | "oldest";

type PostDetailProps = {
  postId?: string;
};

const normalizeText = (value: string) => value.replace(/\s+/g, " ").trim();

const trimText = (value: string, limit: number) => {
  const cleaned = normalizeText(value);
  if (cleaned.length <= limit) {
    return cleaned;
  }
  return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
};

const splitIntoSentences = (value: string) =>
  normalizeText(value)
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

const splitIntoParagraphs = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((segment) => normalizeText(segment))
    .filter(Boolean);

const getPostImageSource = (post: FeedPost | null) => {
  if (!post) {
    return null;
  }

  const candidate = post as FeedPostWithOptionalImage;
  return (
    candidate.imageUrl?.trim() ||
    candidate.imageData?.trim() ||
    candidate.image?.trim() ||
    candidate.mediaUrl?.trim() ||
    null
  );
};

const getPostTypeLabel = (type: FeedPost["type"]) => {
  switch (type) {
    case "poll":
      return "Community Poll";
    case "prompt":
      return "Prompt Response";
    case "update":
      return "Campus Update";
    default:
      return "Campus Story";
  }
};

const formatTagLabel = (value: string) =>
  value
    .replace(/^#/, "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");

const estimateReadMinutes = (value: string) => {
  const wordCount = normalizeText(value)
    .split(" ")
    .filter(Boolean).length;

  if (wordCount === 0) {
    return 1;
  }

  return Math.max(1, Math.round(wordCount / 180));
};

const formatCompactCount = (value: number) => compactNumberFormatter.format(value);

const derivePostTitle = (post: FeedPost) => {
  const paragraphs = splitIntoParagraphs(post.content);
  const leadBlock = paragraphs[0] ?? normalizeText(post.content);
  const sentences = splitIntoSentences(leadBlock);
  const leadSentence = sentences[0] ?? leadBlock;
  const withoutTrailingPunctuation = leadSentence.replace(/[.!?]+$/, "");
  return trimText(withoutTrailingPunctuation || normalizeText(post.content), 72);
};

const derivePostParagraphs = (post: FeedPost, title: string) => {
  const paragraphs = splitIntoParagraphs(post.content);

  if (paragraphs.length > 1) {
    const titleKey = title.toLowerCase();
    return paragraphs
      .map((paragraph, index) => {
        if (index > 0) {
          return paragraph;
        }

        const normalizedParagraph = paragraph.replace(/[.!?]+$/, "").toLowerCase();
        if (normalizedParagraph === titleKey) {
          return "";
        }

        return paragraph;
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  const sentences = splitIntoSentences(post.content);
  const titleKey = title.replace(/[.!?]+$/, "").toLowerCase();
  const remainingSentences =
    sentences[0]?.replace(/[.!?]+$/, "").toLowerCase() === titleKey
      ? sentences.slice(1)
      : sentences;

  if (remainingSentences.length === 0) {
    return [normalizeText(post.content)];
  }

  const grouped: string[] = [];
  for (let index = 0; index < remainingSentences.length; index += 2) {
    grouped.push(remainingSentences.slice(index, index + 2).join(" "));
  }

  return grouped.slice(0, 4);
};

const getRelatedPosts = (posts: FeedPost[], post: FeedPost | null) => {
  if (!post) {
    return posts.slice(0, 3);
  }

  const currentTags = new Set((post.tags ?? []).map((tag) => tag.toLowerCase()));

  return [...posts]
    .filter((candidate) => candidate.id !== post.id)
    .sort((left, right) => {
      const leftOverlap = (left.tags ?? []).reduce(
        (score, tag) => score + (currentTags.has(tag.toLowerCase()) ? 1 : 0),
        0
      );
      const rightOverlap = (right.tags ?? []).reduce(
        (score, tag) => score + (currentTags.has(tag.toLowerCase()) ? 1 : 0),
        0
      );

      if (rightOverlap !== leftOverlap) {
        return rightOverlap - leftOverlap;
      }

      const rightEngagement = (right.likeCount ?? 0) + (right.commentCount ?? 0);
      const leftEngagement = (left.likeCount ?? 0) + (left.commentCount ?? 0);
      return rightEngagement - leftEngagement;
    })
    .slice(0, 3);
};

const getTrendingTopics = (post: FeedPost | null, posts: FeedPost[]) => {
  const counts = new Map<string, number>();

  [...(post ? [post] : []), ...posts].forEach((entry) => {
    (entry.tags ?? []).forEach((tag) => {
      const normalized = tag.replace(/^#/, "").toLowerCase();
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });
  });

  const sorted = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([tag]) => `#${tag}`)
    .slice(0, 6);

  return sorted.length > 0
    ? sorted
    : ["#campus", "#ideas", "#studentlife", "#build", "#community"];
};

const getPollTotalVotes = (options?: PollOption[]) =>
  (options ?? []).reduce((sum, option) => sum + option.votes, 0);

const renderVisualBackground = (imageSrc: string | null) => {
  if (imageSrc) {
    return {
      backgroundImage: `linear-gradient(180deg, rgba(11,14,20,0.06) 0%, rgba(11,14,20,0.22) 100%), url(${imageSrc})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    } as const;
  }

  return undefined;
};

const HeroVisual = ({ imageSrc }: { imageSrc: string | null }) => (
  <div
    className="absolute inset-0 overflow-hidden"
    style={renderVisualBackground(imageSrc)}
  >
    {!imageSrc && (
      <>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(255,255,255,0.92),rgba(247,244,238,0.84)_28%,rgba(221,217,210,0.96)_74%,rgba(205,201,194,1)_100%)]" />
        <div className="absolute left-[40%] top-[22%] h-[56%] w-[38%] rounded-[26px] bg-[linear-gradient(145deg,#ffffff_4%,#f1eee8_50%,#d4d1ca_100%)] shadow-[0_40px_70px_rgba(83,76,63,0.18)]" />
        <div className="absolute left-[56%] top-[28%] h-[36%] w-[30%] [clip-path:polygon(0_0,100%_42%,100%_75%,0_100%)] bg-[linear-gradient(145deg,#ffffff_5%,#f3f0ea_48%,#ccc7c0_100%)] shadow-[-16px_18px_42px_rgba(84,76,61,0.16)]" />
        <div className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#0d1118]/80 via-[#0d1118]/28 to-transparent" />
      </>
    )}
    {imageSrc && (
      <div className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#0d1118]/78 via-[#0d1118]/18 to-transparent" />
    )}
  </div>
);

const AccentTile = ({
  imageSrc,
  variant,
  label,
}: {
  imageSrc: string | null;
  variant: "warm" | "cool";
  label: string;
}) => {
  const palette =
    variant === "warm"
      ? "bg-[linear-gradient(145deg,#ece6d0_0%,#f7f5ee_34%,#d4cfb7_100%)]"
      : "bg-[linear-gradient(145deg,#203f48_0%,#2d5b63_28%,#8cc7d9_100%)]";

  return (
    <div
      className={`group relative h-[220px] overflow-hidden rounded-[28px] border border-[#edf1f7] ${palette}`}
      style={renderVisualBackground(imageSrc)}
    >
      {!imageSrc && variant === "warm" && (
        <>
          <div className="absolute left-[12%] top-[54%] h-[58px] w-[58px] rounded-full bg-[#f8f1de] shadow-[0_18px_36px_rgba(116,96,55,0.18)]" />
          <div className="absolute left-[28%] top-[40%] h-[88px] w-[92px] rounded-[18px] bg-[#efe7d5] shadow-[0_22px_40px_rgba(121,104,63,0.16)]" />
          <div className="absolute right-[10%] bottom-[18%] h-[10px] w-[56%] rounded-full bg-[#8d7f66]/30 blur-[1px]" />
        </>
      )}
      {!imageSrc && variant === "cool" && (
        <>
          <div className="absolute inset-x-[13%] bottom-[18%] h-[62%] rounded-[24px] border-[10px] border-[#173d47] bg-[linear-gradient(180deg,#8fd0e0_0%,#d4f1f9_50%,#77afc0_100%)]" />
          <div className="absolute left-[18%] bottom-[30%] h-[22px] w-[64%] rounded-full bg-[#0f2d36]/35 blur-[2px]" />
          <div className="absolute inset-x-[22%] bottom-[36%] h-[36%] bg-[radial-gradient(circle_at_65%_28%,rgba(255,255,255,0.95),rgba(255,255,255,0)_38%),radial-gradient(circle_at_28%_62%,rgba(105,168,88,0.88),rgba(105,168,88,0)_28%)]" />
        </>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/28 to-transparent px-5 pb-4 pt-10 text-white/92">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</p>
      </div>
    </div>
  );
};

export const PostDetail = ({ postId }: PostDetailProps) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { user, token, openAuthModal } = useAuth();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [relatedFeedPosts, setRelatedFeedPosts] = useState<FeedPost[]>(
    fallbackFeedPosts
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isPostMenuOpen, setIsPostMenuOpen] = useState(false);
  const [openCommentMenuId, setOpenCommentMenuId] = useState<string | null>(
    null
  );
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [editCommentError, setEditCommentError] = useState<string | null>(null);
  const [isUpdatingComment, setIsUpdatingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null
  );
  const [pendingCommentLikes, setPendingCommentLikes] = useState<Set<string>>(
    new Set()
  );
  const [isVoting, setIsVoting] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [commentSort, setCommentSort] = useState<CommentSort>("newest");
  const [visibleCommentCount, setVisibleCommentCount] = useState(6);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const commentsRef = useRef<HTMLDivElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  const pathSegments = pathname?.split("/").filter(Boolean) ?? [];
  const pathPostId =
    pathSegments[pathSegments.length - 2] === "posts"
      ? pathSegments[pathSegments.length - 1]
      : "";

  const resolvedPostId =
    postId ??
    (Array.isArray(params?.postId) ? params.postId[0] : params?.postId) ??
    pathPostId ??
    "";

  useEffect(() => {
    setSelectedOptionId(null);
    setVisibleCommentCount(6);
  }, [resolvedPostId]);

  useEffect(() => {
    if (!openCommentMenuId && !isPostMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (
        openCommentMenuId &&
        target.closest(`[data-comment-menu="${openCommentMenuId}"]`)
      ) {
        return;
      }

      if (isPostMenuOpen && target.closest('[data-post-menu="post-actions"]')) {
        return;
      }

      setOpenCommentMenuId(null);
      setIsPostMenuOpen(false);
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [openCommentMenuId, isPostMenuOpen]);

  useEffect(() => {
    let isActive = true;

    const loadPost = async () => {
      setIsLoading(true);
      setError(null);
      setActionNotice(null);
      setPost(null);
      setComments([]);
      setRelatedFeedPosts(fallbackFeedPosts);
      setOpenCommentMenuId(null);
      setIsPostMenuOpen(false);
      setEditingCommentId(null);
      setEditingBody("");
      setEditCommentError(null);
      setDeletingCommentId(null);
      setPendingCommentLikes(new Set());

      if (!resolvedPostId) {
        setError("This post link is missing an ID.");
        setIsLoading(false);
        return;
      }

      try {
        const [postResponse, commentResponse, feedResponse] = await Promise.all([
          apiGet<{ post: FeedPost }>(`/feed/${resolvedPostId}`, token ?? undefined),
          apiGet<{ comments: FeedComment[] }>(
            `/feed/${resolvedPostId}/comments`,
            token ?? undefined
          ),
          apiGet<{ posts: FeedPost[] }>("/feed?sort=top", token ?? undefined).catch(
            () => ({ posts: fallbackFeedPosts })
          ),
        ]);

        if (!isActive) {
          return;
        }

        setPost(postResponse.post);
        setComments(commentResponse.comments);
        setRelatedFeedPosts(feedResponse.posts?.length ? feedResponse.posts : fallbackFeedPosts);
      } catch (loadError) {
        if (!isActive) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load this post."
        );
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadPost();

    return () => {
      isActive = false;
    };
  }, [resolvedPostId, token]);

  const handleDeletePost = async () => {
    if (!post) {
      return;
    }

    if (!token) {
      openAuthModal();
      return;
    }

    const confirmed = window.confirm("Delete this post? This can't be undone.");
    if (!confirmed) {
      return;
    }

    try {
      await apiDelete(`/feed/${post.id}`, token);
      router.push("/");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete the post."
      );
    }
  };

  const handleToggleLike = async () => {
    if (!post) {
      return;
    }

    if (!token) {
      openAuthModal();
      return;
    }

    if (isLiking) {
      return;
    }

    setIsLiking(true);
    try {
      const response = await apiPost<{ likeCount: number; liked: boolean }>(
        `/feed/${post.id}/like`,
        {},
        token
      );
      setPost((prev) =>
        prev
          ? {
              ...prev,
              likeCount: response.likeCount,
              likedByUser: response.liked,
            }
          : prev
      );
    } catch (likeError) {
      setError(
        likeError instanceof Error
          ? likeError.message
          : "Unable to update the like."
      );
    } finally {
      setIsLiking(false);
    }
  };

  const handleVote = async (optionId: string) => {
    if (!post) {
      return;
    }

    if (!token) {
      openAuthModal();
      return;
    }

    if (isVoting) {
      return;
    }

    setIsVoting(true);
    try {
      const response = await apiPost<{ options: PollOption[] }>(
        `/feed/${post.id}/poll/${optionId}/vote`,
        {},
        token
      );
      setPost((prev) =>
        prev ? { ...prev, pollOptions: response.options } : prev
      );
      setSelectedOptionId(optionId);
    } catch (voteError) {
      setError(
        voteError instanceof Error
          ? voteError.message
          : "Unable to submit your vote."
      );
    } finally {
      setIsVoting(false);
    }
  };

  const handleSubmitEdit = async (payload: PostComposerPayload) => {
    if (!post) {
      throw new Error("Post not available.");
    }

    if (!token) {
      openAuthModal();
      throw new Error("Please sign in to edit.");
    }

    const response = await apiPatch<{ post: FeedPost }>(
      `/feed/${post.id}`,
      payload,
      token
    );
    setPost(response.post);
  };

  const handleSubmitComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCommentError(null);

    if (!resolvedPostId) {
      setCommentError("This post link is missing an ID.");
      return;
    }

    if (!token) {
      openAuthModal();
      return;
    }

    const trimmed = commentBody.trim();
    if (!trimmed) {
      setCommentError("Write a comment before posting.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiPost<{ comment: FeedComment }>(
        `/feed/${resolvedPostId}/comments`,
        { content: trimmed },
        token
      );
      setComments((prev) => [response.comment, ...prev]);
      setPost((prev) =>
        prev
          ? {
              ...prev,
              commentCount: (prev.commentCount ?? 0) + 1,
            }
          : prev
      );
      setCommentBody("");
      setActionNotice("Comment posted.");
    } catch (submitError) {
      setCommentError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to post your comment."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleCommentMenu = (commentId: string) => {
    setOpenCommentMenuId((prev) => (prev === commentId ? null : commentId));
  };

  const handleStartEditComment = (comment: FeedComment) => {
    setEditingCommentId(comment.id);
    setEditingBody(comment.content);
    setEditCommentError(null);
    setOpenCommentMenuId(null);
  };

  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingBody("");
    setEditCommentError(null);
  };

  const handleSaveEditComment = async (comment: FeedComment) => {
    if (!token) {
      openAuthModal();
      return;
    }

    const trimmed = editingBody.trim();
    if (!trimmed) {
      setEditCommentError("Comment cannot be empty.");
      return;
    }

    if (isUpdatingComment) {
      return;
    }

    setIsUpdatingComment(true);
    setEditCommentError(null);

    try {
      const response = await apiPatch<{ comment: FeedComment }>(
        `/feed/comments/${comment.id}`,
        { content: trimmed },
        token
      );
      setComments((prev) =>
        prev.map((item) => (item.id === comment.id ? response.comment : item))
      );
      setEditingCommentId(null);
      setEditingBody("");
      setActionNotice("Comment updated.");
    } catch (updateError) {
      setEditCommentError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update comment."
      );
    } finally {
      setIsUpdatingComment(false);
    }
  };

  const handleDeleteComment = async (comment: FeedComment) => {
    if (!token) {
      openAuthModal();
      return;
    }

    const confirmed = window.confirm("Delete this comment? This can't be undone.");
    if (!confirmed) {
      return;
    }

    setDeletingCommentId(comment.id);
    setOpenCommentMenuId(null);

    try {
      await apiDelete(`/feed/comments/${comment.id}`, token);
      setComments((prev) => prev.filter((item) => item.id !== comment.id));
      setPost((prev) =>
        prev
          ? {
              ...prev,
              commentCount: Math.max(0, (prev.commentCount ?? 0) - 1),
            }
          : prev
      );
      setActionNotice("Comment deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete comment."
      );
    } finally {
      setDeletingCommentId(null);
    }
  };

  const handleToggleCommentLike = async (comment: FeedComment) => {
    if (!token) {
      openAuthModal();
      return;
    }

    if (pendingCommentLikes.has(comment.id)) {
      return;
    }

    setPendingCommentLikes((prev) => new Set(prev).add(comment.id));

    try {
      const response = await apiPost<{ likeCount: number; liked: boolean }>(
        `/feed/comments/${comment.id}/like`,
        {},
        token
      );
      setComments((prev) =>
        prev.map((item) =>
          item.id === comment.id
            ? {
                ...item,
                likeCount: response.likeCount,
                likedByUser: response.liked,
              }
            : item
        )
      );
    } catch (likeError) {
      setError(
        likeError instanceof Error
          ? likeError.message
          : "Unable to update comment like."
      );
    } finally {
      setPendingCommentLikes((prev) => {
        const next = new Set(prev);
        next.delete(comment.id);
        return next;
      });
    }
  };

  const handleOpenComment = () => {
    commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        commentInputRef.current?.focus();
      }, 150);
    }
  };

  const handleReplyToComment = (comment: FeedComment) => {
    setCommentBody((prev) => {
      const trimmedExisting = prev.trimStart();
      return trimmedExisting.startsWith(comment.author.handle)
        ? prev
        : `${comment.author.handle} ${prev}`.trim();
    });
    handleOpenComment();
  };

  const handleSharePost = async () => {
    const url =
      typeof window !== "undefined"
        ? window.location.href
        : `https://quadblitz.com/posts/${resolvedPostId}`;

    try {
      if (typeof navigator !== "undefined" && "share" in navigator && post) {
        await navigator.share({
          title: derivePostTitle(post),
          text: trimText(post.content, 100),
          url,
        });
      } else if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(url);
      }
      setActionNotice("Link ready to share.");
    } catch {
      setActionNotice("Share was cancelled.");
    }
  };

  const isOwnPost = Boolean(post && user?.id === post.author.id);
  const imageSrc = useMemo(() => getPostImageSource(post), [post]);
  const title = useMemo(() => (post ? derivePostTitle(post) : ""), [post]);
  const bodyParagraphs = useMemo(
    () => (post ? derivePostParagraphs(post, title) : []),
    [post, title]
  );
  const leadParagraphs = bodyParagraphs.slice(0, 2);
  const trailingParagraph = bodyParagraphs.slice(2).join(" ");
  const readMinutes = useMemo(() => estimateReadMinutes(post?.content ?? ""), [post]);
  const similarPosts = useMemo(
    () => getRelatedPosts(relatedFeedPosts, post),
    [relatedFeedPosts, post]
  );
  const trendingTopics = useMemo(
    () => getTrendingTopics(post, similarPosts),
    [post, similarPosts]
  );
  const sortedComments = useMemo(() => {
    const items = [...comments];
    items.sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return commentSort === "newest" ? rightTime - leftTime : leftTime - rightTime;
    });
    return items;
  }, [commentSort, comments]);
  const visibleComments = sortedComments.slice(0, visibleCommentCount);
  const discussionCount = post?.commentCount ?? comments.length;
  const pollTotalVotes = getPollTotalVotes(post?.pollOptions);

  return (
    <div className={`${outfit.className} min-h-screen bg-[#f5f7fb]`}>
      <MarketplaceHeader activeHref="/" />

      <main className="mx-auto max-w-[1240px] px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        {error && (
          <div className="mb-6 rounded-[24px] border border-[#dbe5ff] bg-[#eef3ff] px-5 py-4 text-sm font-medium text-[#1456f4]">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="overflow-hidden rounded-[34px] border border-[#e7edf6] bg-white shadow-[0_22px_60px_rgba(34,48,73,0.08)]">
              <div className="h-[380px] animate-pulse bg-[#edf1f7]" />
              <div className="space-y-4 p-8">
                <div className="h-12 w-3/4 animate-pulse rounded-full bg-[#edf1f7]" />
                <div className="h-5 w-1/3 animate-pulse rounded-full bg-[#edf1f7]" />
                <div className="h-24 animate-pulse rounded-[28px] bg-[#f4f7fb]" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="h-[220px] animate-pulse rounded-[28px] bg-[#edf1f7]" />
                  <div className="h-[220px] animate-pulse rounded-[28px] bg-[#edf1f7]" />
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div className="h-[270px] animate-pulse rounded-[30px] bg-white shadow-[0_18px_48px_rgba(34,48,73,0.08)]" />
              <div className="h-[170px] animate-pulse rounded-[30px] bg-white shadow-[0_18px_48px_rgba(34,48,73,0.08)]" />
              <div className="h-[180px] animate-pulse rounded-[30px] bg-[#1456f4]/90 shadow-[0_18px_48px_rgba(20,86,244,0.22)]" />
            </div>
          </div>
        ) : !post ? (
          <div className="rounded-[34px] border border-[#e7edf6] bg-white px-8 py-16 text-center shadow-[0_22px_60px_rgba(34,48,73,0.08)]">
            <h1 className="text-[34px] font-[800] tracking-[-0.06em] text-[#20242d]">
              Post not found.
            </h1>
            <p className="mt-3 text-[15px] text-[#6a7384]">
              This conversation may have been deleted or the link is incomplete.
            </p>
            <button
              type="button"
              className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[13px] font-semibold text-white shadow-[0_16px_30px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2]"
              onClick={() => router.push("/")}
            >
              Back to feed
            </button>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-9">
              <article className="overflow-hidden rounded-[34px] border border-[#e7edf6] bg-white shadow-[0_22px_60px_rgba(34,48,73,0.08)]">
                <div className="relative min-h-[360px] overflow-hidden border-b border-[#eef2f8] sm:min-h-[430px]">
                  <HeroVisual imageSrc={imageSrc} />
                  <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex h-7 items-center rounded-full bg-[#1456f4] px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                        {getPostTypeLabel(post.type)}
                      </span>
                      {post.tags?.[0] && (
                        <span className="inline-flex h-7 items-center rounded-full bg-white/88 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#60687a] backdrop-blur">
                          {formatTagLabel(post.tags[0])}
                        </span>
                      )}
                    </div>
                    <h1 className="mt-4 max-w-[720px] text-[34px] font-[800] leading-[0.92] tracking-[-0.07em] text-white sm:text-[56px]">
                      {title}
                    </h1>
                  </div>
                </div>

                <div className="p-6 sm:p-8">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <Link
                        href={getProfileHref(post.author, user?.id)}
                        className="shrink-0"
                        aria-label={`View ${post.author.name} profile`}
                      >
                        <Avatar
                          name={post.author.name}
                          avatarUrl={post.author.avatarUrl}
                          size={48}
                          className="border border-[#e1e7f0] text-[#20242d] shadow-[0_14px_28px_rgba(30,41,69,0.08)]"
                        />
                      </Link>
                      <div className="min-w-0">
                        <Link
                          href={getProfileHref(post.author, user?.id)}
                          className="block truncate text-[18px] font-[700] tracking-[-0.04em] text-[#20242d]"
                        >
                          {post.author.name}
                        </Link>
                        <p className="mt-1 text-[13px] text-[#7b8493]">
                          Posted {formatRelativeTime(post.createdAt)} • {readMinutes} min read
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-full border transition ${
                          post.likedByUser
                            ? "border-[#d7e1ff] bg-[#eef3ff] text-[#1456f4]"
                            : "border-[#e4e9f2] bg-white text-[#5a6372] hover:border-[#d6dce8] hover:text-[#20242d]"
                        }`}
                        aria-label={post.likedByUser ? "Saved" : "Save post"}
                        onClick={handleToggleLike}
                        disabled={isLiking}
                      >
                        <Bookmark
                          className="h-[18px] w-[18px]"
                          fill={post.likedByUser ? "currentColor" : "none"}
                        />
                      </button>
                      <div className="relative" data-post-menu="post-actions">
                        <button
                          type="button"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#e4e9f2] bg-white text-[#5a6372] transition hover:border-[#d6dce8] hover:text-[#20242d]"
                          aria-label="Post actions"
                          onClick={() => setIsPostMenuOpen((prev) => !prev)}
                        >
                          <MoreHorizontal className="h-[18px] w-[18px]" />
                        </button>
                        {isPostMenuOpen && (
                          <div className="absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-[20px] border border-[#e4eaf3] bg-white py-1 text-[13px] font-medium text-[#485162] shadow-[0_20px_42px_rgba(28,38,64,0.14)]">
                            <button
                              type="button"
                              className="w-full px-4 py-2 text-left transition hover:bg-[#f4f7fb] hover:text-[#20242d]"
                              onClick={() => {
                                setIsPostMenuOpen(false);
                                void handleSharePost();
                              }}
                            >
                              Copy link
                            </button>
                            {isOwnPost && (
                              <>
                                <button
                                  type="button"
                                  className="w-full px-4 py-2 text-left transition hover:bg-[#f4f7fb] hover:text-[#20242d]"
                                  onClick={() => {
                                    setIsPostMenuOpen(false);
                                    setComposerOpen(true);
                                  }}
                                >
                                  Edit post
                                </button>
                                <button
                                  type="button"
                                  className="w-full px-4 py-2 text-left text-[#d14a4a] transition hover:bg-[#fff3f3]"
                                  onClick={() => {
                                    setIsPostMenuOpen(false);
                                    void handleDeletePost();
                                  }}
                                >
                                  Delete post
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {actionNotice && (
                    <p className="mt-4 text-[13px] font-medium text-[#1456f4]">
                      {actionNotice}
                    </p>
                  )}

                  <div className="mt-8 space-y-6 text-[17px] leading-[1.9] text-[#414857]">
                    {leadParagraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                  </div>

                  {post.type === "poll" && post.pollOptions?.length ? (
                    <section className="mt-8 rounded-[30px] border border-[#e7edf6] bg-[#f8faff] p-5 sm:p-6">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1456f4]">
                            Community Vote
                          </p>
                          <p className="mt-2 text-[14px] text-[#6a7384]">
                            {pollTotalVotes} total votes so far.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#677183] shadow-[0_8px_18px_rgba(29,42,72,0.06)]">
                          {selectedOptionId ? "Vote submitted" : "Tap to vote"}
                        </span>
                      </div>
                      <div className="mt-5 space-y-3">
                        {post.pollOptions.map((option) => {
                          const width =
                            pollTotalVotes > 0 ? (option.votes / pollTotalVotes) * 100 : 0;
                          const isSelected = selectedOptionId === option.id;

                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`relative w-full overflow-hidden rounded-[22px] border px-5 py-4 text-left transition ${
                                isSelected
                                  ? "border-[#cddafe] bg-white"
                                  : "border-[#e5ebf4] bg-white hover:border-[#d6dceb]"
                              }`}
                              onClick={() => handleVote(option.id)}
                              disabled={isVoting}
                            >
                              <span
                                className="absolute inset-y-0 left-0 rounded-[22px] bg-[#edf3ff]"
                                style={{ width: `${Math.max(width, isSelected ? 9 : 0)}%` }}
                              />
                              <span className="relative flex items-center justify-between gap-4">
                                <span className="text-[15px] font-semibold text-[#20242d]">
                                  {option.label}
                                </span>
                                <span className="text-[13px] font-medium text-[#677183]">
                                  {option.votes} votes
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ) : (
                    <div className="mt-8 grid gap-4 sm:grid-cols-2">
                      <AccentTile imageSrc={imageSrc} variant="warm" label="Material Study" />
                      <AccentTile imageSrc={imageSrc} variant="cool" label="Campus Context" />
                    </div>
                  )}

                  {trailingParagraph && (
                    <p className="mt-7 text-[17px] leading-[1.9] text-[#414857]">
                      {trailingParagraph}
                    </p>
                  )}

                  {post.tags?.length ? (
                    <div className="mt-7 flex flex-wrap gap-2">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-[#eef2f7] px-3 py-1 text-[11px] font-medium text-[#586172]"
                        >
                          #{tag.replace(/^#/, "")}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#edf1f7] pt-6">
                    <button
                      type="button"
                      className={`inline-flex h-12 items-center gap-2 rounded-full px-4 text-[13px] font-semibold transition ${
                        post.likedByUser
                          ? "bg-[#1456f4] text-white shadow-[0_16px_30px_rgba(20,86,244,0.24)]"
                          : "border border-[#e5ebf4] bg-white text-[#4f5767] hover:border-[#d5dbe7] hover:text-[#20242d]"
                      }`}
                      onClick={handleToggleLike}
                      disabled={isLiking}
                    >
                      <Heart
                        className="h-[17px] w-[17px]"
                        fill={post.likedByUser ? "currentColor" : "none"}
                      />
                      <span>{formatCompactCount(post.likeCount)}</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-12 items-center gap-2 rounded-full border border-[#e5ebf4] bg-white px-4 text-[13px] font-semibold text-[#4f5767] transition hover:border-[#d5dbe7] hover:text-[#20242d]"
                      onClick={handleOpenComment}
                    >
                      <MessageCircle className="h-[17px] w-[17px]" />
                      <span>{formatCompactCount(discussionCount)}</span>
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-12 items-center gap-2 rounded-full border border-[#e5ebf4] bg-white px-4 text-[13px] font-semibold text-[#4f5767] transition hover:border-[#d5dbe7] hover:text-[#20242d]"
                      onClick={() => {
                        void handleSharePost();
                      }}
                    >
                      <Share2 className="h-[17px] w-[17px]" />
                      <span>Share</span>
                    </button>
                  </div>
                </div>
              </article>

              <section ref={commentsRef} className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="text-[34px] font-[800] tracking-[-0.06em] text-[#20242d]">
                    Discussion <span className="text-[#b2bac7]">{discussionCount}</span>
                  </h2>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-[13px] font-semibold text-[#1456f4] transition hover:bg-[#eef3ff]"
                    onClick={() =>
                      setCommentSort((prev) => (prev === "newest" ? "oldest" : "newest"))
                    }
                  >
                    Sort by: {commentSort === "newest" ? "Newest" : "Oldest"}
                    <ChevronDown className="h-[15px] w-[15px]" />
                  </button>
                </div>

                <form
                  className="rounded-[32px] border border-[#e7edf6] bg-white p-5 shadow-[0_18px_50px_rgba(34,48,73,0.08)] sm:p-6"
                  onSubmit={handleSubmitComment}
                >
                  <div className="flex items-start gap-4">
                    <Avatar
                      name={user?.name ?? "Guest"}
                      avatarUrl={user?.avatarUrl}
                      size={42}
                      className="mt-1 shrink-0 border border-[#e1e7f0] text-[#20242d]"
                    />
                    <textarea
                      ref={commentInputRef}
                      className={`${inputClasses} min-h-[118px] resize-none border-none px-0 py-0 text-[15px] shadow-none focus:border-none focus:ring-0`}
                      value={commentBody}
                      onChange={(event) => setCommentBody(event.target.value)}
                      placeholder="Add your perspective..."
                    />
                  </div>
                  {commentError && (
                    <p className="mt-4 rounded-[18px] border border-[#dbe5ff] bg-[#eef3ff] px-4 py-3 text-sm text-[#1456f4]">
                      {commentError}
                    </p>
                  )}
                  <div className="mt-5 flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex h-12 items-center justify-center rounded-full bg-[#1456f4] px-6 text-[13px] font-semibold text-white shadow-[0_16px_30px_rgba(20,86,244,0.22)] transition hover:bg-[#0f49e2] disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? "Posting..." : "Post Comment"}
                    </button>
                  </div>
                </form>

                <div className="space-y-5">
                  {visibleComments.length === 0 ? (
                    <div className="rounded-[30px] border border-[#e7edf6] bg-white px-6 py-10 text-center text-[15px] text-[#6b7484] shadow-[0_18px_50px_rgba(34,48,73,0.08)]">
                      No comments yet. Start the conversation.
                    </div>
                  ) : (
                    visibleComments.map((comment) => {
                      const isOwnComment = user?.id === comment.author.id;
                      const isEditing = editingCommentId === comment.id;
                      const isDeleting = deletingCommentId === comment.id;
                      const likeCount = comment.likeCount ?? 0;
                      const isLiked = Boolean(comment.likedByUser);
                      const isAuthorReply = post.author.id === comment.author.id;

                      return (
                        <article key={comment.id} className="flex items-start gap-4">
                          <Link
                            href={getProfileHref(comment.author, user?.id)}
                            aria-label={`View ${comment.author.name} profile`}
                            className="shrink-0 pt-1"
                          >
                            <Avatar
                              name={comment.author.name}
                              avatarUrl={comment.author.avatarUrl}
                              size={40}
                              className="border border-[#e1e7f0] text-[#20242d]"
                            />
                          </Link>
                          <div className="min-w-0 flex-1">
                            <div className="rounded-[28px] bg-[#eef2f7] px-5 py-5 sm:px-6">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Link
                                      href={getProfileHref(comment.author, user?.id)}
                                      className="truncate text-[16px] font-[700] tracking-[-0.03em] text-[#20242d]"
                                    >
                                      {comment.author.name}
                                    </Link>
                                    {isAuthorReply && (
                                      <span className="rounded-full bg-[#dce8ff] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#1456f4]">
                                        Author
                                      </span>
                                    )}
                                    <span className="text-[12px] text-[#98a1af]">
                                      {formatRelativeTime(comment.createdAt)}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[12px] font-medium text-[#7b8493]">
                                    {comment.author.handle}
                                  </p>
                                </div>

                                {isOwnComment && !isEditing && (
                                  <div
                                    className="relative shrink-0"
                                    data-comment-menu={comment.id}
                                  >
                                    <button
                                      type="button"
                                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dde4ef] bg-white text-[#596274] transition hover:border-[#d6dce8] hover:text-[#20242d]"
                                      onClick={() => handleToggleCommentMenu(comment.id)}
                                      aria-label="Comment actions"
                                    >
                                      <MoreHorizontal className="h-[16px] w-[16px]" />
                                    </button>
                                    {openCommentMenuId === comment.id && (
                                      <div className="absolute right-0 top-full z-20 mt-2 w-32 overflow-hidden rounded-[20px] border border-[#e4eaf3] bg-white py-1 text-[13px] font-medium text-[#485162] shadow-[0_20px_42px_rgba(28,38,64,0.14)]">
                                        <button
                                          type="button"
                                          className="w-full px-4 py-2 text-left transition hover:bg-[#f4f7fb] hover:text-[#20242d]"
                                          onClick={() => handleStartEditComment(comment)}
                                        >
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="w-full px-4 py-2 text-left text-[#d14a4a] transition hover:bg-[#fff3f3] disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={() => void handleDeleteComment(comment)}
                                          disabled={isDeleting}
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {isEditing ? (
                                <div className="mt-4 space-y-3">
                                  <textarea
                                    className={`${inputClasses} min-h-[110px] resize-none`}
                                    value={editingBody}
                                    onChange={(event) => setEditingBody(event.target.value)}
                                  />
                                  {editCommentError && (
                                    <p className="rounded-[18px] border border-[#dbe5ff] bg-[#eef3ff] px-4 py-3 text-sm text-[#1456f4]">
                                      {editCommentError}
                                    </p>
                                  )}
                                  <div className="flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="inline-flex h-10 items-center justify-center rounded-full border border-[#dde4ef] bg-white px-4 text-[12px] font-semibold text-[#5e6778] transition hover:border-[#d6dce8] hover:text-[#20242d]"
                                      onClick={handleCancelEditComment}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex h-10 items-center justify-center rounded-full bg-[#1456f4] px-4 text-[12px] font-semibold text-white shadow-[0_14px_28px_rgba(20,86,244,0.2)] transition hover:bg-[#0f49e2] disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => void handleSaveEditComment(comment)}
                                      disabled={isUpdatingComment}
                                    >
                                      {isUpdatingComment ? "Saving..." : "Save"}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p
                                  className="mt-4 text-[15px] leading-[1.8] text-[#424a58]"
                                  onDoubleClick={() => void handleToggleCommentLike(comment)}
                                  title="Double-click to like"
                                >
                                  {comment.content}
                                </p>
                              )}
                            </div>

                            {!isEditing && (
                              <div className="mt-3 flex items-center gap-5 pl-2 text-[12px] font-medium text-[#6a7384]">
                                <button
                                  type="button"
                                  className={`transition hover:text-[#20242d] ${
                                    isLiked ? "text-[#1456f4]" : ""
                                  }`}
                                  onClick={() => void handleToggleCommentLike(comment)}
                                  disabled={pendingCommentLikes.has(comment.id)}
                                >
                                  Like{likeCount > 0 ? ` (${likeCount})` : ""}
                                </button>
                                <button
                                  type="button"
                                  className="transition hover:text-[#20242d]"
                                  onClick={() => handleReplyToComment(comment)}
                                >
                                  Reply
                                </button>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })
                  )}
                </div>

                {visibleCommentCount < sortedComments.length && (
                  <div className="pt-1">
                    <button
                      type="button"
                      className="inline-flex h-12 w-full items-center justify-center rounded-full border border-[#dde4ef] bg-white text-[13px] font-semibold text-[#596274] transition hover:border-[#d6dce8] hover:text-[#20242d]"
                      onClick={() =>
                        setVisibleCommentCount((prev) => Math.min(prev + 6, sortedComments.length))
                      }
                    >
                      Load More Comments
                    </button>
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-7 xl:sticky xl:top-[96px] xl:self-start">
              <section className="rounded-[30px] border border-[#e7edf6] bg-white p-5 shadow-[0_18px_48px_rgba(34,48,73,0.08)]">
                <h3 className="text-[24px] font-[800] tracking-[-0.05em] text-[#20242d]">
                  Similar Projects
                </h3>
                <div className="mt-5 space-y-4">
                  {similarPosts.map((item, index) => {
                    const itemImage = getPostImageSource(item);
                    const thumbClass =
                      index % 2 === 0
                        ? "bg-[linear-gradient(145deg,#d4ecff_0%,#7bb3df_34%,#4d718d_100%)]"
                        : "bg-[linear-gradient(145deg,#d8b68d_0%,#a26831_38%,#5d3a18_100%)]";

                    return (
                      <Link
                        key={item.id}
                        href={`/posts/${item.id}`}
                        className="flex items-start gap-3 rounded-[20px] transition hover:bg-[#f6f8fc]"
                      >
                        <div
                          className={`h-[56px] w-[56px] shrink-0 rounded-full ${thumbClass}`}
                          style={renderVisualBackground(itemImage)}
                        />
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold leading-[1.35] tracking-[-0.02em] text-[#20242d]">
                            {derivePostTitle(item)}
                          </p>
                          <p className="mt-1 text-[11px] text-[#828b99]">
                            By {item.author.name} • {formatCompactCount(item.likeCount)} likes
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[30px] border border-[#e7edf6] bg-white p-5 shadow-[0_18px_48px_rgba(34,48,73,0.08)]">
                <h3 className="text-[24px] font-[800] tracking-[-0.05em] text-[#20242d]">
                  Trending Topics
                </h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {trendingTopics.map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full bg-[#eef2f7] px-3 py-2 text-[11px] font-medium text-[#4f5767]"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </section>

              <section className="rounded-[30px] bg-[#1456f4] p-6 text-white shadow-[0_24px_50px_rgba(20,86,244,0.24)]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/72">
                  On Campus Today
                </p>
                <h3 className="mt-4 text-[28px] font-[800] leading-[1.02] tracking-[-0.06em]">
                  Keep the conversation moving.
                </h3>
                <p className="mt-3 text-[14px] leading-[1.7] text-white/84">
                  Jump back into chat, meet collaborators, and keep this thread alive off the page.
                </p>
                <Link
                  href="/friends"
                  className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-5 text-[13px] font-semibold text-[#1456f4] transition hover:bg-[#eef3ff]"
                >
                  Open Chat
                </Link>
              </section>
            </aside>
          </div>
        )}
      </main>

      <PostComposerModal
        isOpen={isComposerOpen}
        mode="edit"
        initialPost={post}
        onClose={() => setComposerOpen(false)}
        onSubmit={handleSubmitEdit}
      />
    </div>
  );
};
