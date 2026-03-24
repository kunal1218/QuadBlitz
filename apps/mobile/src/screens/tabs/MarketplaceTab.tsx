import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  API_BASE_URL,
} from "../../api/client";
import {
  type Listing,
  createListing,
  deleteListing,
  fetchListings,
  fetchMyListings,
  startMarketplaceConversation,
  updateListingStatus,
} from "../../api/actions";
import { formatError, isAuthError } from "../../lib/errors";
import type { SessionProps } from "../../types/session";

const marketplaceCategories: Array<{
  id: "All" | Listing["category"];
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { id: "All", label: "All", icon: "apps-outline" },
  { id: "Textbooks", label: "Textbooks", icon: "book-outline" },
  { id: "Electronics", label: "Electronics", icon: "desktop-outline" },
  { id: "Furniture", label: "Dorm Life", icon: "bed-outline" },
  { id: "Clothing", label: "Fashion", icon: "shirt-outline" },
  { id: "Other", label: "Special", icon: "sparkles-outline" },
];

const marketplaceConditions: Listing["condition"][] = ["New", "Like New", "Good", "Fair"];

const resolveImageUrl = (url: string | null | undefined) => {
  if (!url) {
    return null;
  }
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const normalized = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${normalized}`;
};

const formatTimeAgo = (dateString: string) => {
  const now = Date.now();
  const then = Date.parse(dateString);
  if (!Number.isFinite(then)) {
    return "just now";
  }
  const diffSeconds = Math.max(1, Math.floor((now - then) / 1000));
  if (diffSeconds < 60) return "just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 7)}w ago`;
};

const formatAuctionCountdown = (dateString: string) => {
  const startedAt = Date.parse(dateString);
  if (!Number.isFinite(startedAt)) {
    return "LIVE";
  }
  const endsAt = startedAt + 48 * 60 * 60 * 1000;
  const remaining = Math.max(0, endsAt - Date.now());
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours <= 0 && minutes <= 0) {
    return "ENDING SOON";
  }
  return `${hours}H ${String(minutes).padStart(2, "0")}M LEFT`;
};

const getSellerInitial = (listing: Listing) =>
  (listing.seller.username?.[0] ?? listing.seller.name?.[0] ?? "U").toUpperCase();

const getConditionBadgeLabel = (condition: Listing["condition"]) => condition.toUpperCase();

type ListingLayoutMode = "grid" | "list";

export const MarketplaceTab = ({ token, user, onAuthExpired }: SessionProps) => {
  const insets = useSafeAreaInsets();
  const [listings, setListings] = useState<Listing[]>([]);
  const [myListingIds, setMyListingIds] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<(typeof marketplaceCategories)[number]["id"]>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [layoutMode, setLayoutMode] = useState<ListingLayoutMode>("list");
  const [loading, setLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [visibleRecentCount, setVisibleRecentCount] = useState(6);

  const [composerOpen, setComposerOpen] = useState(false);
  const [posting, setPosting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [location, setLocation] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState<Listing["category"]>("Other");
  const [condition, setCondition] = useState<Listing["condition"]>("Good");

  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [selectedListingBusy, setSelectedListingBusy] = useState(false);

  const loadMarketplace = useCallback(async () => {
    setLoading(true);
    setScreenError(null);
    try {
      const [allListings, mine] = await Promise.all([
        fetchListings({
          category: selectedCategory,
          search: searchQuery,
        }),
        fetchMyListings(token),
      ]);
      setListings(allListings);
      setMyListingIds(new Set(mine.map((listing) => listing.id)));
    } catch (loadError) {
      if (isAuthError(loadError)) {
        onAuthExpired();
        return;
      }
      setScreenError(formatError(loadError));
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [onAuthExpired, searchQuery, selectedCategory, token]);

  useEffect(() => {
    void loadMarketplace();
  }, [loadMarketplace]);

  useEffect(() => {
    setVisibleRecentCount(6);
  }, [searchQuery, selectedCategory, layoutMode]);

  const resetComposer = useCallback(() => {
    setTitle("");
    setDescription("");
    setPrice("");
    setLocation("");
    setImageUrl("");
    setCategory("Other");
    setCondition("Good");
    setComposerError(null);
    setPosting(false);
  }, []);

  const closeComposer = useCallback(() => {
    setComposerOpen(false);
    resetComposer();
  }, [resetComposer]);

  const featuredListings = useMemo(
    () =>
      [...listings]
        .filter((listing) => listing.status === "active")
        .sort((a, b) => b.price - a.price)
        .slice(0, 5),
    [listings]
  );

  const recentListings = useMemo(
    () =>
      [...listings]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, visibleRecentCount),
    [listings, visibleRecentCount]
  );

  const hasMoreRecentListings = listings.length > recentListings.length;

  const applyListingUpdate = useCallback((nextListing: Listing) => {
    setListings((prev) => {
      const existingIndex = prev.findIndex((entry) => entry.id === nextListing.id);
      if (existingIndex === -1) {
        return [nextListing, ...prev];
      }
      return prev.map((entry) => (entry.id === nextListing.id ? nextListing : entry));
    });
    setSelectedListing((prev) => (prev?.id === nextListing.id ? nextListing : prev));
  }, []);

  const submitListing = useCallback(async () => {
    const normalizedTitle = title.trim();
    const normalizedDescription = description.trim();
    const normalizedLocation = location.trim();
    const normalizedImageUrl = imageUrl.trim();
    const parsedPrice = Number(price);

    if (!normalizedTitle || !normalizedDescription || !Number.isFinite(parsedPrice)) {
      setComposerError("Title, description, and numeric price are required.");
      return;
    }

    setPosting(true);
    setComposerError(null);

    try {
      const listing = await createListing(
        {
          title: normalizedTitle,
          description: normalizedDescription,
          price: parsedPrice,
          category,
          condition,
          location: normalizedLocation || undefined,
          images: normalizedImageUrl ? [normalizedImageUrl] : undefined,
        },
        token
      );
      setListings((prev) => [listing, ...prev]);
      setMyListingIds((prev) => new Set(prev).add(listing.id));
      closeComposer();
    } catch (submitError) {
      if (isAuthError(submitError)) {
        onAuthExpired();
        return;
      }
      setComposerError(formatError(submitError));
    } finally {
      setPosting(false);
    }
  }, [
    category,
    closeComposer,
    condition,
    description,
    imageUrl,
    location,
    onAuthExpired,
    price,
    title,
    token,
  ]);

  const handleToggleSold = useCallback(
    async (listing: Listing) => {
      setSelectedListingBusy(true);
      setScreenError(null);
      try {
        const nextStatus: Listing["status"] = listing.status === "active" ? "sold" : "active";
        const updated = await updateListingStatus(listing.id, nextStatus, token);
        applyListingUpdate(updated);
      } catch (statusError) {
        if (isAuthError(statusError)) {
          onAuthExpired();
          return;
        }
        setScreenError(formatError(statusError));
      } finally {
        setSelectedListingBusy(false);
      }
    },
    [applyListingUpdate, onAuthExpired, token]
  );

  const handleDelete = useCallback(
    async (listingId: string) => {
      setSelectedListingBusy(true);
      setScreenError(null);
      try {
        await deleteListing(listingId, token);
        setListings((prev) => prev.filter((listing) => listing.id !== listingId));
        setMyListingIds((prev) => {
          const next = new Set(prev);
          next.delete(listingId);
          return next;
        });
        setSelectedListing(null);
      } catch (deleteError) {
        if (isAuthError(deleteError)) {
          onAuthExpired();
          return;
        }
        setScreenError(formatError(deleteError));
      } finally {
        setSelectedListingBusy(false);
      }
    },
    [onAuthExpired, token]
  );

  const handleMessageSeller = useCallback(
    async (listing: Listing, content?: string) => {
      setSelectedListingBusy(true);
      setScreenError(null);
      try {
        await startMarketplaceConversation(
          listing.id,
          content ?? `Hey, is ${listing.title} still available?`,
          token
        );
        Alert.alert("Message sent", "Conversation started with the seller.");
      } catch (messageError) {
        if (isAuthError(messageError)) {
          onAuthExpired();
          return;
        }
        setScreenError(formatError(messageError));
      } finally {
        setSelectedListingBusy(false);
      }
    },
    [onAuthExpired, token]
  );

  const renderListingVisual = (listing: Listing, large = false) => {
    const primaryImage = resolveImageUrl(listing.images?.[0]);
    if (primaryImage) {
      return (
        <Image
          source={{ uri: primaryImage }}
          style={large ? marketStyles.featuredImage : marketStyles.listingThumb}
          resizeMode="cover"
        />
      );
    }

    const iconName =
      listing.category === "Textbooks"
        ? "book-outline"
        : listing.category === "Electronics"
          ? "desktop-outline"
          : listing.category === "Furniture"
            ? "bed-outline"
            : listing.category === "Clothing"
              ? "shirt-outline"
              : "cube-outline";

    return (
      <View style={large ? marketStyles.featuredFallback : marketStyles.listingThumbFallback}>
        <Ionicons name={iconName} size={large ? 40 : 28} color="#ffffff" />
      </View>
    );
  };

  const renderRecentListing = (listing: Listing) => {
    const isMine = myListingIds.has(listing.id) || listing.seller.id === user.id;

    if (layoutMode === "grid") {
      return (
        <Pressable
          key={listing.id}
          style={marketStyles.recentGridCard}
          onPress={() => setSelectedListing(listing)}
        >
          <View style={marketStyles.gridVisualWrap}>{renderListingVisual(listing)}</View>
          <View style={marketStyles.gridTopBadges}>
            <View style={marketStyles.conditionBadge}>
              <Text style={marketStyles.conditionBadgeText}>
                {getConditionBadgeLabel(listing.condition)}
              </Text>
            </View>
            <View style={marketStyles.favoriteGhost}>
              <Ionicons name={isMine ? "create-outline" : "heart-outline"} size={16} color="#6b7280" />
            </View>
          </View>
          <Text style={marketStyles.gridTitle} numberOfLines={2}>
            {listing.title}
          </Text>
          <View style={marketStyles.gridMetaRow}>
            <View style={marketStyles.sellerMeta}>
              <View style={marketStyles.sellerAvatarSmall}>
                <Text style={marketStyles.sellerAvatarText}>{getSellerInitial(listing)}</Text>
              </View>
              <Text style={marketStyles.gridSellerName} numberOfLines={1}>
                {listing.seller.name}
              </Text>
            </View>
            <Text style={marketStyles.gridTime}>{formatTimeAgo(listing.createdAt)}</Text>
          </View>
          <Text style={marketStyles.gridPrice}>${listing.price}</Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        key={listing.id}
        style={marketStyles.recentListCard}
        onPress={() => setSelectedListing(listing)}
      >
        <View style={marketStyles.listingThumbWrap}>{renderListingVisual(listing)}</View>
        <View style={marketStyles.recentListContent}>
          <View style={marketStyles.recentListTopRow}>
            <Text style={marketStyles.recentListTitle} numberOfLines={2}>
              {listing.title}
            </Text>
            <Text style={marketStyles.recentListPrice}>${listing.price}</Text>
          </View>
          <View style={marketStyles.recentListBadgeRow}>
            <View style={marketStyles.conditionBadgeMuted}>
              <Text style={marketStyles.conditionBadgeMutedText}>
                {getConditionBadgeLabel(listing.condition)}
              </Text>
            </View>
            <Text style={marketStyles.recentListTime}>• {formatTimeAgo(listing.createdAt)}</Text>
          </View>
          <View style={marketStyles.recentSellerRow}>
            <View style={marketStyles.sellerAvatarSmall}>
              <Text style={marketStyles.sellerAvatarText}>{getSellerInitial(listing)}</Text>
            </View>
            <Text style={marketStyles.recentSellerName}>{listing.seller.name}</Text>
          </View>
        </View>
      </Pressable>
    );
  };

  const selectedListingIsMine = selectedListing
    ? myListingIds.has(selectedListing.id) || selectedListing.seller.id === user.id
    : false;

  return (
    <View style={marketStyles.screen}>
      <ScrollView
        contentContainerStyle={[marketStyles.container, { paddingTop: 12, paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={marketStyles.topBar}>
          <View style={marketStyles.identityRow}>
            <View style={marketStyles.profileBubble}>
              <Text style={marketStyles.profileBubbleText}>{user.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={marketStyles.brandTitle}>CampusMarket</Text>
          </View>
          <Pressable style={marketStyles.searchIconButton} onPress={() => setComposerOpen(true)}>
            <Ionicons name="add-outline" size={22} color="#1263ff" />
          </Pressable>
        </View>

        <View style={marketStyles.heroBlock}>
          <Text style={marketStyles.heroTitle}>Find what you need on campus</Text>
        </View>

        <View style={marketStyles.sectionRow}>
          <Text style={marketStyles.sectionTitle}>Categories</Text>
          <Text style={marketStyles.sectionLink}>View All</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={marketStyles.categoriesRow}>
          {marketplaceCategories.map((item) => {
            const isActive = selectedCategory === item.id;
            return (
              <Pressable
                key={item.id}
                style={marketStyles.categoryItem}
                onPress={() => setSelectedCategory(item.id)}
              >
                <View style={[marketStyles.categoryCircle, isActive ? marketStyles.categoryCircleActive : null]}>
                  <Ionicons name={item.icon} size={22} color={isActive ? "#ffffff" : "#1f2937"} />
                </View>
                <Text style={marketStyles.categoryLabel}>{item.label.toUpperCase()}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={marketStyles.searchBar}>
          <Ionicons name="search-outline" size={18} color="#8b94a7" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search textbooks, electronics..."
            placeholderTextColor="#a0a8b7"
            style={marketStyles.searchInput}
          />
        </View>

        {screenError ? (
          <View style={marketStyles.errorBanner}>
            <Text style={marketStyles.errorBannerText}>{screenError}</Text>
          </View>
        ) : null}

        <View style={marketStyles.sectionRow}>
          <View style={marketStyles.sectionRowLeft}>
            <Ionicons name="flash-outline" size={17} color="#ec6a92" />
            <Text style={marketStyles.sectionTitle}>Active Auctions</Text>
          </View>
          <Pressable onPress={() => void loadMarketplace()}>
            <Text style={marketStyles.sectionLink}>{loading ? "Refreshing..." : "View all"}</Text>
          </Pressable>
        </View>

        {loading ? (
          <ActivityIndicator color="#2563eb" />
        ) : featuredListings.length === 0 ? (
          <View style={marketStyles.emptyCard}>
            <Text style={marketStyles.emptyCardText}>No active listings right now.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={marketStyles.featuredRow}>
            {featuredListings.map((listing) => (
              <Pressable
                key={listing.id}
                style={marketStyles.featuredCard}
                onPress={() => setSelectedListing(listing)}
              >
                <View style={marketStyles.featuredTimerPill}>
                  <View style={marketStyles.timerDot} />
                  <Text style={marketStyles.featuredTimerText}>{formatAuctionCountdown(listing.createdAt)}</Text>
                </View>
                <View style={marketStyles.featuredVisualWrap}>{renderListingVisual(listing, true)}</View>
                <Text style={marketStyles.featuredTitle} numberOfLines={2}>
                  {listing.title}
                </Text>
                <Text style={marketStyles.featuredSubtitle}>Current Bid</Text>
                <View style={marketStyles.featuredFooter}>
                  <Text style={marketStyles.featuredPrice}>${listing.price.toFixed(2)}</Text>
                  <Pressable
                    style={marketStyles.quickBidButton}
                    onPress={() => {
                      void handleMessageSeller(listing, `Hi! I'd like to make an offer on ${listing.title}.`);
                    }}
                  >
                    <Text style={marketStyles.quickBidText}>Quick Bid</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <View style={marketStyles.sectionRow}>
          <Text style={marketStyles.sectionTitle}>Recent Listings</Text>
          <View style={marketStyles.layoutToggleWrap}>
            <Pressable
              style={[marketStyles.layoutButton, layoutMode === "grid" ? marketStyles.layoutButtonActive : null]}
              onPress={() => setLayoutMode("grid")}
            >
              <Ionicons name="grid-outline" size={16} color={layoutMode === "grid" ? "#1263ff" : "#6b7280"} />
            </Pressable>
            <Pressable
              style={[marketStyles.layoutButton, layoutMode === "list" ? marketStyles.layoutButtonActive : null]}
              onPress={() => setLayoutMode("list")}
            >
              <Ionicons name="list-outline" size={16} color={layoutMode === "list" ? "#1263ff" : "#6b7280"} />
            </Pressable>
          </View>
        </View>

        {!loading && recentListings.length === 0 ? (
          <View style={marketStyles.emptyCard}>
            <Text style={marketStyles.emptyCardText}>No listings match that search yet.</Text>
          </View>
        ) : layoutMode === "grid" ? (
          <View style={marketStyles.recentGrid}>{recentListings.map((listing) => renderRecentListing(listing))}</View>
        ) : (
          <View style={marketStyles.recentList}>{recentListings.map((listing) => renderRecentListing(listing))}</View>
        )}

        {hasMoreRecentListings ? (
          <Pressable style={marketStyles.loadMoreButton} onPress={() => setVisibleRecentCount((prev) => prev + 6)}>
            <Text style={marketStyles.loadMoreText}>Load More</Text>
            <Ionicons name="chevron-down" size={16} color="#4b5563" />
          </Pressable>
        ) : null}
      </ScrollView>

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={closeComposer}>
        <View style={marketStyles.modalOverlay}>
          <Pressable style={marketStyles.modalBackdrop} onPress={closeComposer} />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={marketStyles.sheetShell}
          >
            <View style={[marketStyles.sheetCard, { paddingBottom: insets.bottom + 18 }]}>
              <View style={marketStyles.sheetHeader}>
                <View>
                  <Text style={marketStyles.sheetTitle}>Create Listing</Text>
                  <Text style={marketStyles.sheetSubtitle}>Post something from campus to the marketplace.</Text>
                </View>
                <Pressable style={marketStyles.closeButton} onPress={closeComposer}>
                  <Text style={marketStyles.closeButtonLabel}>×</Text>
                </Pressable>
              </View>

              {composerError ? (
                <View style={marketStyles.inlineError}>
                  <Text style={marketStyles.inlineErrorText}>{composerError}</Text>
                </View>
              ) : null}

              <ScrollView
                style={marketStyles.sheetScroll}
                contentContainerStyle={marketStyles.sheetScrollContent}
                keyboardShouldPersistTaps="handled"
              >
                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Title</Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="MacBook Air M1"
                    placeholderTextColor="#9ca3af"
                    style={marketStyles.fieldInput}
                  />
                </View>

                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Description</Text>
                  <TextInput
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Condition, pickup details, what's included..."
                    placeholderTextColor="#9ca3af"
                    style={[marketStyles.fieldInput, marketStyles.fieldTextarea]}
                    multiline
                  />
                </View>

                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Price</Text>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    placeholder="650"
                    placeholderTextColor="#9ca3af"
                    style={marketStyles.fieldInput}
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Location</Text>
                  <TextInput
                    value={location}
                    onChangeText={setLocation}
                    placeholder="Memorial Library pickup"
                    placeholderTextColor="#9ca3af"
                    style={marketStyles.fieldInput}
                  />
                </View>

                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Image URL</Text>
                  <TextInput
                    value={imageUrl}
                    onChangeText={setImageUrl}
                    placeholder="https://..."
                    placeholderTextColor="#9ca3af"
                    style={marketStyles.fieldInput}
                    autoCapitalize="none"
                  />
                </View>

                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Category</Text>
                  <View style={marketStyles.optionRow}>
                    {marketplaceCategories
                      .filter((item): item is typeof item & { id: Listing["category"] } => item.id !== "All")
                      .map((item) => (
                        <Pressable
                          key={item.id}
                          style={[marketStyles.optionChip, category === item.id ? marketStyles.optionChipActive : null]}
                          onPress={() => setCategory(item.id)}
                        >
                          <Text
                            style={[
                              marketStyles.optionChipText,
                              category === item.id ? marketStyles.optionChipTextActive : null,
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                  </View>
                </View>

                <View style={marketStyles.fieldGroup}>
                  <Text style={marketStyles.fieldLabel}>Condition</Text>
                  <View style={marketStyles.optionRow}>
                    {marketplaceConditions.map((item) => (
                      <Pressable
                        key={item}
                        style={[marketStyles.optionChip, condition === item ? marketStyles.optionChipActive : null]}
                        onPress={() => setCondition(item)}
                      >
                        <Text
                          style={[
                            marketStyles.optionChipText,
                            condition === item ? marketStyles.optionChipTextActive : null,
                          ]}
                        >
                          {item}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </ScrollView>

              <View style={marketStyles.modalFooterRow}>
                <Pressable style={marketStyles.secondaryButton} onPress={closeComposer} disabled={posting}>
                  <Text style={marketStyles.secondaryButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={marketStyles.primaryButton}
                  onPress={() => {
                    void submitListing();
                  }}
                  disabled={posting}
                >
                  <Text style={marketStyles.primaryButtonText}>
                    {posting ? "Posting..." : "Create Listing"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(selectedListing)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedListing(null)}
      >
        <View style={marketStyles.modalOverlay}>
          <Pressable style={marketStyles.modalBackdrop} onPress={() => setSelectedListing(null)} />
          <View style={[marketStyles.sheetCard, { paddingBottom: insets.bottom + 18 }]}>
            {selectedListing ? (
              <>
                <View style={marketStyles.sheetHeader}>
                  <View>
                    <Text style={marketStyles.sheetTitle}>{selectedListing.title}</Text>
                    <Text style={marketStyles.sheetSubtitle}>
                      {selectedListing.category} • {selectedListing.condition}
                    </Text>
                  </View>
                  <Pressable style={marketStyles.closeButton} onPress={() => setSelectedListing(null)}>
                    <Text style={marketStyles.closeButtonLabel}>×</Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={marketStyles.sheetScroll}
                  contentContainerStyle={marketStyles.sheetScrollContent}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={marketStyles.detailVisualWrap}>
                    {renderListingVisual(selectedListing, true)}
                  </View>
                  <View style={marketStyles.detailPriceRow}>
                    <Text style={marketStyles.detailPrice}>${selectedListing.price}</Text>
                    <View style={marketStyles.conditionBadgeMuted}>
                      <Text style={marketStyles.conditionBadgeMutedText}>
                        {getConditionBadgeLabel(selectedListing.condition)}
                      </Text>
                    </View>
                  </View>
                  <Text style={marketStyles.detailDescription}>{selectedListing.description}</Text>
                  <Text style={marketStyles.detailMeta}>
                    Seller: {selectedListing.seller.name} • {formatTimeAgo(selectedListing.createdAt)}
                  </Text>
                  {selectedListing.location ? (
                    <Text style={marketStyles.detailMeta}>Location: {selectedListing.location}</Text>
                  ) : null}
                </ScrollView>

                <View style={marketStyles.modalFooterRow}>
                  {selectedListingIsMine ? (
                    <>
                      <Pressable
                        style={marketStyles.secondaryButton}
                        onPress={() => {
                          void handleToggleSold(selectedListing);
                        }}
                        disabled={selectedListingBusy}
                      >
                        <Text style={marketStyles.secondaryButtonText}>
                          {selectedListing.status === "sold" ? "Mark Active" : "Mark Sold"}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={marketStyles.dangerButton}
                        onPress={() =>
                          Alert.alert("Delete listing", "Delete this listing?", [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => {
                                void handleDelete(selectedListing.id);
                              },
                            },
                          ])
                        }
                        disabled={selectedListingBusy}
                      >
                        <Text style={marketStyles.dangerButtonText}>Delete</Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      style={marketStyles.primaryButton}
                      onPress={() => {
                        void handleMessageSeller(selectedListing);
                      }}
                      disabled={selectedListingBusy}
                    >
                      <Text style={marketStyles.primaryButtonText}>Message Seller</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const marketStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f8f9fc",
  },
  container: {
    paddingHorizontal: 18,
    gap: 22,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  profileBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: "#b7c8ff",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  profileBubbleText: {
    color: "#273142",
    fontSize: 18,
    fontWeight: "800",
  },
  brandTitle: {
    color: "#1263ff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  searchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe2ef",
  },
  heroBlock: {
    paddingTop: 10,
  },
  heroTitle: {
    color: "#242c37",
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "800",
    letterSpacing: -1.4,
    maxWidth: 290,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    color: "#1d2530",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  sectionLink: {
    color: "#1263ff",
    fontSize: 14,
    fontWeight: "700",
  },
  categoriesRow: {
    gap: 14,
    paddingRight: 12,
  },
  categoryItem: {
    alignItems: "center",
    gap: 10,
    width: 82,
  },
  categoryCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#eceff4",
    alignItems: "center",
    justifyContent: "center",
  },
  categoryCircleActive: {
    backgroundColor: "#1263ff",
  },
  categoryLabel: {
    color: "#49515d",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 1,
  },
  searchBar: {
    height: 52,
    borderRadius: 26,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe2ef",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: "#1f2937",
    paddingVertical: 0,
  },
  errorBanner: {
    borderRadius: 18,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBannerText: {
    color: "#be123c",
    fontSize: 13,
    fontWeight: "600",
  },
  featuredRow: {
    gap: 14,
    paddingRight: 18,
  },
  featuredCard: {
    width: 250,
    borderRadius: 28,
    padding: 14,
    backgroundColor: "#0f172a",
    overflow: "hidden",
  },
  featuredTimerPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#f5d7e2",
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 1,
  },
  timerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef5c86",
  },
  featuredTimerText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  featuredVisualWrap: {
    marginTop: 16,
    marginBottom: 14,
    borderRadius: 22,
    overflow: "hidden",
  },
  featuredImage: {
    width: "100%",
    height: 140,
  },
  featuredFallback: {
    width: "100%",
    height: 140,
    backgroundColor: "#1b3359",
    alignItems: "center",
    justifyContent: "center",
  },
  featuredTitle: {
    color: "#ffffff",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  featuredSubtitle: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 13,
    marginTop: 4,
  },
  featuredFooter: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  featuredPrice: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  quickBidButton: {
    borderRadius: 999,
    backgroundColor: "#1263ff",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  quickBidText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  layoutToggleWrap: {
    flexDirection: "row",
    gap: 8,
  },
  layoutButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe2ef",
    alignItems: "center",
    justifyContent: "center",
  },
  layoutButtonActive: {
    borderColor: "#c7d7ff",
    backgroundColor: "#eef4ff",
  },
  recentGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  recentGridCard: {
    width: "47.8%",
    backgroundColor: "#ffffff",
    borderRadius: 26,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#e6ebf3",
    overflow: "hidden",
  },
  gridVisualWrap: {
    borderRadius: 20,
    overflow: "hidden",
    aspectRatio: 0.92,
    backgroundColor: "#eef2f7",
  },
  gridTopBadges: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  conditionBadge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#1263ff",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  conditionBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "800",
  },
  favoriteGhost: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6ebf3",
    alignItems: "center",
    justifyContent: "center",
  },
  gridTitle: {
    color: "#1f2937",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
    minHeight: 42,
  },
  gridMetaRow: {
    gap: 8,
  },
  sellerMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sellerAvatarSmall: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#d2e5ff",
    alignItems: "center",
    justifyContent: "center",
  },
  sellerAvatarText: {
    color: "#2154b3",
    fontSize: 11,
    fontWeight: "800",
  },
  gridSellerName: {
    color: "#6b7280",
    fontSize: 12,
    flex: 1,
  },
  gridTime: {
    color: "#6b7280",
    fontSize: 12,
  },
  gridPrice: {
    color: "#1263ff",
    fontSize: 24,
    fontWeight: "800",
  },
  recentList: {
    gap: 16,
  },
  recentListCard: {
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  listingThumbWrap: {
    width: 100,
    height: 100,
    borderRadius: 26,
    overflow: "hidden",
  },
  listingThumb: {
    width: "100%",
    height: "100%",
  },
  listingThumbFallback: {
    width: "100%",
    height: "100%",
    backgroundColor: "#1b2230",
    alignItems: "center",
    justifyContent: "center",
  },
  recentListContent: {
    flex: 1,
    gap: 8,
  },
  recentListTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  recentListTitle: {
    flex: 1,
    color: "#1f2937",
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  recentListPrice: {
    color: "#1263ff",
    fontSize: 18,
    fontWeight: "800",
  },
  recentListBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  conditionBadgeMuted: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#edf1ff",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  conditionBadgeMutedText: {
    color: "#265bf4",
    fontSize: 11,
    fontWeight: "800",
  },
  recentListTime: {
    color: "#6b7280",
    fontSize: 13,
  },
  recentSellerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentSellerName: {
    color: "#4b5563",
    fontSize: 13,
  },
  loadMoreButton: {
    alignSelf: "center",
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#dbe2ef",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  loadMoreText: {
    color: "#4b5563",
    fontSize: 15,
    fontWeight: "600",
  },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e6ebf3",
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: "center",
  },
  emptyCardText: {
    color: "#6b7280",
    fontSize: 15,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.34)",
  },
  sheetShell: {
    justifyContent: "flex-end",
  },
  sheetCard: {
    maxHeight: "88%",
    backgroundColor: "#fbfaf7",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  sheetTitle: {
    color: "#253040",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  sheetSubtitle: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonLabel: {
    color: "#4b5563",
    fontSize: 24,
    lineHeight: 24,
  },
  inlineError: {
    borderRadius: 18,
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  inlineErrorText: {
    color: "#be123c",
    fontSize: 13,
    fontWeight: "600",
  },
  sheetScroll: {
    flexGrow: 0,
  },
  sheetScrollContent: {
    gap: 16,
    paddingBottom: 18,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    color: "#6b7280",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  fieldInput: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: "#111827",
    fontSize: 15,
  },
  fieldTextarea: {
    minHeight: 110,
    textAlignVertical: "top",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  optionChip: {
    borderRadius: 999,
    backgroundColor: "#edf1f7",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  optionChipActive: {
    backgroundColor: "#1263ff",
  },
  optionChipText: {
    color: "#556070",
    fontSize: 13,
    fontWeight: "700",
  },
  optionChipTextActive: {
    color: "#ffffff",
  },
  modalFooterRow: {
    flexDirection: "row",
    gap: 12,
    paddingTop: 8,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d7deea",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: "#556070",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: "#1263ff",
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  dangerButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 18,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  dangerButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  detailVisualWrap: {
    borderRadius: 24,
    overflow: "hidden",
  },
  detailPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailPrice: {
    color: "#1263ff",
    fontSize: 30,
    fontWeight: "800",
  },
  detailDescription: {
    color: "#374151",
    fontSize: 16,
    lineHeight: 24,
  },
  detailMeta: {
    color: "#6b7280",
    fontSize: 14,
    lineHeight: 20,
  },
});
