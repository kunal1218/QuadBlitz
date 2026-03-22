"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { FeedComment, FeedPost, PollOption } from "@lockedin/shared";
import { useParams, usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useAuth } from "@/features/auth";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/api";
import { getProfileHref } from "@/lib/profile";
import { formatRelativeTime } from "@/lib/time";
import { PollCard } from "./PollCard";
import { PostCard } from "./PostCard";
import { PostComposerModal } from "./PostComposerModal";
import type { PostComposerPayload } from "./PostComposerModal";

const inputClasses =
  "w-full rounded-2xl border border-card-border/80 bg-white/80 px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20";

type PostDetailProps = {
  postId?: string;
};

export const PostDetail = ({ postId }: PostDetailProps) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const { user, token, openAuthModal } = useAuth();
  const [post, setPost] = useState<FeedPost | null>(null);
  const [comments, setComments] = useState<FeedComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComposerOpen, setComposerOpen] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
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
  }, [resolvedPostId]);

  useEffect(() => {
    if (!openCommentMenuId) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }

      if (target.closest(`[data-comment-menu="${openCommentMenuId}"]`)) {
        return;
      }

      setOpenCommentMenuId(null);
    };

    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [openCommentMenuId]);

  useEffect(() => {
    let isActive = true;

    const loadPost = async () => {
      setIsLoading(true);
      setError(null);
      setPost(null);
      setComments([]);
      setOpenCommentMenuId(null);
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
        const [postResponse, commentResponse] = await Promise.all([
          apiGet<{ post: FeedPost }>(
            `/feed/${resolvedPostId}`,
            token ?? undefined
          ),
          apiGet<{ comments: FeedComment[] }>(
            `/feed/${resolvedPostId}/comments`,
            token ?? undefined
          ),
        ]);

        if (!isActive) {
          return;
        }

        setPost(postResponse.post);
        setComments(commentResponse.comments);
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

    loadPost();

    return () => {
      isActive = false;
    };
  }, [resolvedPostId, token]);

  const handleDeletePost = async (_post?: FeedPost) => {
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

  const handleToggleLike = async (_post?: FeedPost) => {
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
      setCommentBody("");
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

  const isOwnPost = Boolean(post && user?.id === post.author.id);
  const handleOpenEdit = (_post?: FeedPost) => {
    setComposerOpen(true);
  };

  const handleOpenComment = () => {
    commentsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        commentInputRef.current?.focus();
      }, 150);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-2">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">Post detail</h1>
            <p className="text-sm text-muted">
              Dive into the full conversation and leave your reply.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              requiresAuth={false}
              onClick={handleOpenComment}
              disabled={!post}
            >
              Add comment
            </Button>
            <Button
              variant="outline"
              requiresAuth={false}
              onClick={() => router.push("/")}
            >
              Back to feed
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
            Loading post...
          </Card>
        ) : post ? (
          post.type === "poll" ? (
            <PollCard
              post={post}
              isOwnPost={isOwnPost}
              onEdit={handleOpenEdit}
              onDelete={handleDeletePost}
              onLike={handleToggleLike}
              isLiking={isLiking}
              onVote={(_post, optionId) => handleVote(optionId)}
              isVoting={isVoting}
              selectedOptionId={selectedOptionId}
            />
          ) : (
            <PostCard
              post={post}
              isOwnPost={isOwnPost}
              onEdit={handleOpenEdit}
              onDelete={handleDeletePost}
              onLike={handleToggleLike}
              isLiking={isLiking}
            />
          )
        ) : (
          <Card className="py-10 text-center text-sm text-muted">
            Post not found.
          </Card>
        )}

        {post && (
          <div ref={commentsRef}>
            <Card className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                    Comments
                  </p>
                  <h2 className="mt-2 font-display text-xl font-semibold">
                    {comments.length} replies
                  </h2>
                </div>
              </div>

              <form className="space-y-3" onSubmit={handleSubmitComment}>
                <textarea
                  ref={commentInputRef}
                  className={`${inputClasses} min-h-[120px]`}
                  value={commentBody}
                  onChange={(event) => setCommentBody(event.target.value)}
                  placeholder="Add your take, share a tip, or respond with a plan."
                />
                {commentError && (
                  <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                    {commentError}
                  </p>
                )}
                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Posting..." : "Post comment"}
                  </Button>
                </div>
              </form>

              <div className="space-y-4">
                {comments.length === 0 ? (
                  <p className="text-sm text-muted">
                    No comments yet. Start the conversation.
                  </p>
                ) : (
                  comments.map((comment) => {
                    const isOwnComment = user?.id === comment.author.id;
                    const isEditing = editingCommentId === comment.id;
                    const isDeleting = deletingCommentId === comment.id;
                    const likeCount = comment.likeCount ?? 0;
                    const isLiked = Boolean(comment.likedByUser);

                    return (
                      <div key={comment.id} className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(getProfileHref(comment.author, user?.id))
                          }
                          className="rounded-full"
                          aria-label={`View ${comment.author.handle} profile`}
                        >
                          <Avatar
                            name={comment.author.name}
                            avatarUrl={comment.author.avatarUrl}
                            size={32}
                          />
                        </button>
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="flex items-center gap-2 text-xs text-muted">
                              <span className="font-semibold text-ink">
                                {comment.author.handle}
                              </span>
                              <span>{formatRelativeTime(comment.createdAt)}</span>
                            </div>
                            <div className="ml-auto flex items-center gap-2">
                              {(likeCount > 0 || isLiked) && (
                                <span
                                  className={`text-[11px] font-semibold ${
                                    isLiked ? "text-accent" : "text-muted"
                                  }`}
                                >
                                  ♥ {likeCount}
                                </span>
                              )}
                              {isOwnComment && !isEditing && (
                                <div
                                  className="relative"
                                  data-comment-menu={comment.id}
                                >
                                  <button
                                    type="button"
                                    className="inline-flex h-6 w-6 items-center justify-center text-sm font-semibold text-muted transition hover:text-ink"
                                    onClick={() =>
                                      handleToggleCommentMenu(comment.id)
                                    }
                                    aria-label="Comment actions"
                                  >
                                    ⋮
                                  </button>
                                  {openCommentMenuId === comment.id && (
                                    <div className="absolute right-0 top-full z-10 mt-2 w-32 overflow-hidden rounded-2xl border border-card-border/70 bg-white/95 py-1 text-xs font-semibold text-ink/80 shadow-[0_16px_32px_rgba(27,26,23,0.14)]">
                                      <button
                                        type="button"
                                        className="w-full px-3 py-2 text-left transition hover:bg-card-border/40 hover:text-ink"
                                        onClick={() =>
                                          handleStartEditComment(comment)
                                        }
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        className="w-full px-3 py-2 text-left text-ink/70 transition hover:bg-card-border/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() =>
                                          handleDeleteComment(comment)
                                        }
                                        disabled={isDeleting}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          {isEditing ? (
                            <div className="space-y-2">
                              <textarea
                                className={`${inputClasses} min-h-[96px]`}
                                value={editingBody}
                                onChange={(event) =>
                                  setEditingBody(event.target.value)
                                }
                              />
                              {editCommentError && (
                                <p className="rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
                                  {editCommentError}
                                </p>
                              )}
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="rounded-full border border-card-border/70 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-ink"
                                  onClick={handleCancelEditComment}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(255,134,88,0.25)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-70"
                                  onClick={() =>
                                    handleSaveEditComment(comment)
                                  }
                                  disabled={isUpdatingComment}
                                >
                                  {isUpdatingComment ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p
                              className="text-sm text-ink/90"
                              onDoubleClick={() => handleToggleCommentLike(comment)}
                              title="Double-click to like"
                            >
                              {comment.content}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

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
