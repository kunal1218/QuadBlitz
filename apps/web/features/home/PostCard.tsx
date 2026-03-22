"use client";

import type { MouseEvent } from "react";
import type { FeedPost } from "@lockedin/shared";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Card";
import { Tag } from "@/components/Tag";
import { useAuth } from "@/features/auth";
import { deriveCollegeFromDomain, deriveCollegeFromEmail } from "@/lib/college";
import { getProfileHref } from "@/lib/profile";
import { formatRelativeTime } from "@/lib/time";

type PostCardProps = {
  post: FeedPost;
  isOwnPost?: boolean;
  onOpen?: (post: FeedPost) => void;
  onEdit?: (post: FeedPost) => void;
  onDelete?: (post: FeedPost) => void;
  onLike?: (post: FeedPost) => void;
  isLiking?: boolean;
};

export const PostCard = ({
  post,
  isOwnPost,
  onOpen,
  onEdit,
  onDelete,
  onLike,
  isLiking,
}: PostCardProps) => {
  const { user, isAuthenticated, openAuthModal } = useAuth();
  const router = useRouter();
  const likeCount = post.likeCount ?? 0;
  const commentCount = post.commentCount ?? 0;
  const fallbackCollege =
    user?.id === post.author.id && user.email
      ? deriveCollegeFromEmail(user.email)
      : null;
  const collegeLabel =
    post.author.collegeName ??
    deriveCollegeFromDomain(post.author.collegeDomain ?? "") ??
    fallbackCollege;

  const handleActionClick =
    (action?: (post: FeedPost) => void) => (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      action?.(post);
    };

  const handleProfileClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!isAuthenticated) {
      openAuthModal("signup");
      return;
    }

    if (user?.id === post.author.id) {
      router.push("/profile");
      return;
    }

    router.push(getProfileHref(post.author, user?.id));
  };

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleProfileClick}
          className="rounded-full"
          aria-label={`View ${post.author.handle} profile`}
          data-profile-link
        >
          <Avatar
            name={post.author.name}
            avatarUrl={post.author.avatarUrl}
          />
        </button>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{post.author.handle}</p>
          </div>
          <p className="text-xs text-muted">
            {formatRelativeTime(post.createdAt)}
            {collegeLabel ? ` · ${collegeLabel}` : ""}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isOwnPost && onEdit && (
            <button
              type="button"
              className="rounded-full border border-card-border/70 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-ink"
              onClick={handleActionClick(onEdit)}
            >
              Edit
            </button>
          )}
          {(isOwnPost || user?.isAdmin) && onDelete && (
            <button
              type="button"
              className="rounded-full border border-card-border/70 px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent/40 hover:text-ink"
              onClick={handleActionClick(onDelete)}
            >
              Delete
            </button>
          )}
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
              post.likedByUser
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-card-border/70 bg-white/80 text-ink/80 hover:border-accent/40 hover:text-ink"
            }`}
            onClick={handleActionClick(onLike)}
            disabled={!onLike || isLiking}
            aria-pressed={post.likedByUser}
            aria-label={`Like post. ${likeCount} likes`}
          >
            <span className="text-sm leading-none">
              {post.likedByUser ? "❤" : "♡"}
            </span>
            <span>{likeCount}</span>
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-card-border/70 bg-white/80 px-3 py-1 text-xs font-semibold text-ink/80 transition hover:border-accent/40 hover:text-ink"
            onClick={handleActionClick(onOpen)}
            disabled={!onOpen}
            aria-label={`View replies. ${commentCount} replies`}
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 6h16v9a3 3 0 0 1-3 3H9l-5 4V6a2 2 0 0 1 2-2z" />
            </svg>
            <span>{commentCount}</span>
          </button>
        </div>
      </div>
      <p className="text-base text-ink">{post.content}</p>
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {post.tags.map((tag) => (
            <Tag key={tag} tone="default">
              {tag}
            </Tag>
          ))}
        </div>
      )}
    </Card>
  );
};
