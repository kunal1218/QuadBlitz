import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import type { SessionProps } from "../../types/session";

const DEFAULT_WEB_APP_URL = "https://quadblitz.com";
const WEB_APP_BASE_URL =
  (process.env.EXPO_PUBLIC_WEB_APP_URL ?? DEFAULT_WEB_APP_URL).replace(/\/$/, "");
const MAP_EMBED_VERSION = "app-compact-v2";

export const MapTab = ({ token, user }: SessionProps) => {
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const mapUrl = useMemo(
    () => `${WEB_APP_BASE_URL}/map?embedded=1&mobile=1&compact=1&v=${MAP_EMBED_VERSION}`,
    []
  );
  const injectedScript = useMemo(() => {
    const payload = { token, user };
    const serializedPayload = JSON.stringify(payload);
    const escapedPayload = JSON.stringify(serializedPayload);
    return `
      (function() {
        var applyEmbeddedTweaks = function() {
          try {
            document.documentElement.style.margin = "0";
            document.documentElement.style.padding = "0";
            document.documentElement.style.height = "100%";
            document.documentElement.style.overflow = "hidden";
            document.body.style.margin = "0";
            document.body.style.padding = "0";
            document.body.style.height = "100%";
            document.body.style.overflow = "hidden";

            var header = document.querySelector("header");
            if (header) {
              header.style.display = "none";
            }

            var main = document.querySelector("main");
            if (main) {
              main.style.paddingTop = "0";
              main.style.marginTop = "0";
              main.style.height = "100%";
              main.style.minHeight = "100%";
              main.style.overflow = "hidden";
            }

            var appRoot = document.querySelector("body > div");
            if (appRoot) {
              appRoot.style.height = "100%";
              appRoot.style.minHeight = "100%";
              appRoot.style.overflow = "hidden";
            }

            var mapbox = document.querySelector(".mapboxgl-map");
            if (mapbox && mapbox.parentElement && mapbox.parentElement.parentElement) {
              var mapRoot = mapbox.parentElement.parentElement;
              mapRoot.style.position = "fixed";
              mapRoot.style.left = "0";
              mapRoot.style.top = "0";
              mapRoot.style.right = "0";
              mapRoot.style.bottom = "0";
              mapRoot.style.width = "100vw";
              mapRoot.style.height = "100vh";
              mapRoot.style.minHeight = "100vh";
              mapRoot.style.maxHeight = "100vh";
              mapRoot.style.margin = "0";
              mapRoot.style.padding = "0";
              mapRoot.style.overflow = "hidden";

              if (mapbox.parentElement) {
                mapbox.parentElement.style.position = "absolute";
                mapbox.parentElement.style.left = "0";
                mapbox.parentElement.style.top = "0";
                mapbox.parentElement.style.right = "0";
                mapbox.parentElement.style.bottom = "0";
                mapbox.parentElement.style.width = "100%";
                mapbox.parentElement.style.height = "100%";
              }

              mapbox.style.position = "absolute";
              mapbox.style.left = "0";
              mapbox.style.top = "0";
              mapbox.style.right = "0";
              mapbox.style.bottom = "0";
              mapbox.style.width = "100%";
              mapbox.style.height = "100%";

              var canvasWrap = mapbox.querySelector(".mapboxgl-canvas-container");
              if (canvasWrap) {
                canvasWrap.style.width = "100%";
                canvasWrap.style.height = "100%";
              }

              var canvas = mapbox.querySelector(".mapboxgl-canvas");
              if (canvas) {
                canvas.style.width = "100%";
                canvas.style.height = "100%";
              }
            }

            var topControls = document.querySelector('div[class*="pointer-events-none"][class*="absolute"][class*="z-20"][class*="top-"]');
            if (topControls) {
              topControls.style.top = "10px";
              topControls.style.right = "10px";
              topControls.style.width = "auto";
              topControls.style.gap = "8px";
              topControls.style.transform = "none";
              topControls.style.transformOrigin = "top right";
              topControls.style.overflow = "visible";
              topControls.style.height = "auto";
              topControls.style.maxHeight = "none";
            }

            var pickButtonByLabels = function(card, labels) {
              if (!card) {
                return null;
              }
              var buttons = card.querySelectorAll("button");
              for (var i = 0; i < buttons.length; i += 1) {
                var label = (buttons[i].textContent || "").trim().toLowerCase();
                if (labels.indexOf(label) !== -1) {
                  return buttons[i];
                }
              }
              return buttons.length ? buttons[0] : null;
            };

            var hideCardVisually = function(card) {
              if (!card) {
                return;
              }
              card.style.position = "absolute";
              card.style.left = "-10000px";
              card.style.top = "-10000px";
              card.style.width = "1px";
              card.style.height = "1px";
              card.style.maxWidth = "1px";
              card.style.maxHeight = "1px";
              card.style.opacity = "0";
              card.style.pointerEvents = "none";
              card.style.overflow = "hidden";
              card.style.padding = "0";
              card.style.margin = "0";
            };

            var shareCard = null;
            var ghostCard = null;
            var publicCard = null;
            var cards = document.querySelectorAll('div[class*="rounded-2xl"][class*="bg-white"]');
            cards.forEach(function(card) {
              var text = (card.textContent || "").trim();
              if (text.indexOf("Share my location") !== -1) {
                shareCard = card;
              } else if (text.indexOf("Go ghost") !== -1) {
                ghostCard = card;
              } else if (text.indexOf("Go public") !== -1) {
                publicCard = card;
              }
            });

            var shareToggle = shareCard ? shareCard.querySelector("button") : null;
            var ghostToggle = pickButtonByLabels(ghostCard, ["ghosted", "go ghost"]);
            var publicToggle = pickButtonByLabels(publicCard, ["public", "private"]);

            hideCardVisually(shareCard);
            hideCardVisually(ghostCard);
            hideCardVisually(publicCard);

            var toggleRow = document.getElementById("lockedin-mobile-map-toggles");
            if (!toggleRow) {
              toggleRow = document.createElement("div");
              toggleRow.id = "lockedin-mobile-map-toggles";
              toggleRow.style.position = "fixed";
              toggleRow.style.right = "12px";
              toggleRow.style.bottom = "164px";
              toggleRow.style.zIndex = "45";
              toggleRow.style.display = "flex";
              toggleRow.style.alignItems = "center";
              toggleRow.style.justifyContent = "flex-end";
              toggleRow.style.gap = "7px";
              toggleRow.style.pointerEvents = "auto";

              var shareBtn = document.createElement("button");
              shareBtn.id = "lockedin-mobile-toggle-share";
              shareBtn.type = "button";
              shareBtn.textContent = "📍";
              shareBtn.setAttribute("aria-label", "Share location");
              shareBtn.title = "Share location";

              var ghostBtn = document.createElement("button");
              ghostBtn.id = "lockedin-mobile-toggle-ghost";
              ghostBtn.type = "button";
              ghostBtn.textContent = "👻";
              ghostBtn.setAttribute("aria-label", "Ghost mode");
              ghostBtn.title = "Ghost mode";

              var publicBtn = document.createElement("button");
              publicBtn.id = "lockedin-mobile-toggle-public";
              publicBtn.type = "button";
              publicBtn.textContent = "🌐";
              publicBtn.setAttribute("aria-label", "Public mode");
              publicBtn.title = "Public mode";

              [shareBtn, ghostBtn, publicBtn].forEach(function(btn) {
                btn.style.width = "34px";
                btn.style.height = "34px";
                btn.style.borderRadius = "17px";
                btn.style.border = "1px solid rgba(17,24,39,0.16)";
                btn.style.background = "rgba(255,255,255,0.95)";
                btn.style.color = "#111827";
                btn.style.fontSize = "16px";
                btn.style.fontWeight = "700";
                btn.style.lineHeight = "16px";
                btn.style.cursor = "pointer";
                btn.style.display = "flex";
                btn.style.alignItems = "center";
                btn.style.justifyContent = "center";
                btn.style.padding = "0";
              });

              toggleRow.appendChild(shareBtn);
              toggleRow.appendChild(ghostBtn);
              toggleRow.appendChild(publicBtn);
              document.body.appendChild(toggleRow);
            }

            var shareToggleButton = document.getElementById("lockedin-mobile-toggle-share");
            var ghostToggleButton = document.getElementById("lockedin-mobile-toggle-ghost");
            var publicToggleButton = document.getElementById("lockedin-mobile-toggle-public");

            var setButtonState = function(button, active) {
              if (!button) {
                return;
              }
              if (active) {
                button.style.background = "#ff8557";
                button.style.borderColor = "#ff8557";
                button.style.color = "#ffffff";
              } else {
                button.style.background = "rgba(255,255,255,0.95)";
                button.style.borderColor = "rgba(17,24,39,0.16)";
                button.style.color = "#111827";
              }
            };

            var isShareActive = function() {
              if (!shareToggle) {
                return toggleRow && toggleRow.getAttribute("data-share-active") === "1";
              }
              var ariaChecked = shareToggle.getAttribute("aria-checked");
              if (ariaChecked === "true" || ariaChecked === "false") {
                return ariaChecked === "true";
              }
              var dataState = shareToggle.getAttribute("data-state");
              if (dataState === "checked" || dataState === "unchecked") {
                return dataState === "checked";
              }
              return toggleRow && toggleRow.getAttribute("data-share-active") === "1";
            };

            var isGhostActive = function() {
              if (!ghostToggle) {
                return toggleRow && toggleRow.getAttribute("data-ghost-active") === "1";
              }
              var label = (ghostToggle.textContent || "").trim().toLowerCase();
              if (label === "ghosted") {
                return true;
              }
              if (label === "go ghost") {
                return false;
              }
              return toggleRow && toggleRow.getAttribute("data-ghost-active") === "1";
            };

            var isPublicActive = function() {
              if (!publicToggle) {
                return toggleRow && toggleRow.getAttribute("data-public-active") === "1";
              }
              var label = (publicToggle.textContent || "").trim().toLowerCase();
              if (label === "public") {
                return true;
              }
              if (label === "private") {
                return false;
              }
              return toggleRow && toggleRow.getAttribute("data-public-active") === "1";
            };

            var syncToggleButtons = function() {
              var shareActive = isShareActive();
              var ghostActive = isGhostActive();
              var publicActive = isPublicActive();
              if (toggleRow) {
                toggleRow.setAttribute("data-share-active", shareActive ? "1" : "0");
                toggleRow.setAttribute("data-ghost-active", ghostActive ? "1" : "0");
                toggleRow.setAttribute("data-public-active", publicActive ? "1" : "0");
              }
              setButtonState(shareToggleButton, shareActive);
              setButtonState(ghostToggleButton, ghostActive);
              setButtonState(publicToggleButton, publicActive);
            };

            var confirmAction = function(message) {
              try {
                return window.confirm(message);
              } catch (error) {
                return true;
              }
            };

            var confirmPublicFromWebModal = function() {
              var attempt = function(remaining) {
                var modalConfirmButtons = document.querySelectorAll("button");
                for (var i = 0; i < modalConfirmButtons.length; i += 1) {
                  var label = (modalConfirmButtons[i].textContent || "").trim().toLowerCase();
                  if (label !== "go public") {
                    continue;
                  }
                  var scope = modalConfirmButtons[i].closest("div");
                  var scopeText = (scope && scope.textContent ? scope.textContent : "").toLowerCase();
                  if (scopeText.indexOf("going public lets anyone on campus see your location and profile.") !== -1) {
                    modalConfirmButtons[i].click();
                    return;
                  }
                }
                if (remaining > 0) {
                  setTimeout(function() {
                    attempt(remaining - 1);
                  }, 80);
                }
              };
              attempt(12);
            };

            if (shareToggleButton) {
              shareToggleButton.onclick = function() {
                var shareActive = isShareActive();
                var shareMessage = shareActive
                  ? "Stop sharing your location with friends?"
                  : "Share your location with friends?";
                if (!confirmAction(shareMessage)) {
                  return;
                }
                if (shareToggle) {
                  shareToggle.click();
                } else if (toggleRow) {
                  var next = toggleRow.getAttribute("data-share-active") === "1" ? "0" : "1";
                  toggleRow.setAttribute("data-share-active", next);
                }
                setTimeout(syncToggleButtons, 120);
              };
            }
            if (ghostToggleButton) {
              ghostToggleButton.onclick = function() {
                var ghostActive = isGhostActive();
                var ghostMessage = ghostActive
                  ? "Turn off ghost mode and become visible again?"
                  : "Turn on ghost mode and hide your location?";
                if (!confirmAction(ghostMessage)) {
                  return;
                }
                if (ghostToggle) {
                  ghostToggle.click();
                } else if (toggleRow) {
                  var next = toggleRow.getAttribute("data-ghost-active") === "1" ? "0" : "1";
                  toggleRow.setAttribute("data-ghost-active", next);
                }
                setTimeout(syncToggleButtons, 120);
              };
            }
            if (publicToggleButton) {
              publicToggleButton.onclick = function() {
                var publicActive = isPublicActive();
                var publicMessage = publicActive
                  ? "Turn off public mode?"
                  : "Go public and let anyone on campus see your location and profile?";
                if (!confirmAction(publicMessage)) {
                  return;
                }
                if (publicToggle) {
                  publicToggle.click();
                  if (!publicActive) {
                    confirmPublicFromWebModal();
                  }
                } else if (toggleRow) {
                  var next = toggleRow.getAttribute("data-public-active") === "1" ? "0" : "1";
                  toggleRow.setAttribute("data-public-active", next);
                }
                setTimeout(syncToggleButtons, 120);
                setTimeout(syncToggleButtons, 320);
              };
            }
            syncToggleButtons();

            var actionButtons = document.querySelectorAll("button");
            var addEventButton = null;
            actionButtons.forEach(function(button) {
              var label = (button.textContent || "").trim();
              var ariaLabel = (button.getAttribute("aria-label") || "").trim().toLowerCase();
              var isCreateByAria = ariaLabel === "create event" || ariaLabel === "cancel pin drop";
              var isZoomButton = ariaLabel === "zoom in" || ariaLabel === "zoom out";
              var isCreateBySymbol = (label === "+" || label === "×") && !isZoomButton;

              if (isCreateByAria || isCreateBySymbol) {
                addEventButton = button;
                button.setAttribute("data-lockedin-add-event", "1");
              }

              if (label === "+" || label === "×") {
                button.style.width = "40px";
                button.style.height = "40px";
                button.style.fontSize = "20px";
              }
              if (label.indexOf("View Events") === 0) {
                button.style.position = "absolute";
                button.style.left = "12px";
                button.style.bottom = "124px";
                button.style.padding = "8px 14px";
                button.style.fontSize = "12px";
              }
            });

            if (addEventButton) {
              addEventButton.style.position = "fixed";
              addEventButton.style.left = "12px";
              addEventButton.style.right = "auto";
              addEventButton.style.top = "auto";
              addEventButton.style.bottom = "98px";
              addEventButton.style.width = "40px";
              addEventButton.style.height = "40px";
              addEventButton.style.minHeight = "40px";
              addEventButton.style.padding = "0";
              addEventButton.style.fontSize = "20px";
              addEventButton.style.zIndex = "44";
            }

            var zoomInButton = document.querySelector('button[aria-label="Zoom in"]');
            var homeButton = document.querySelector(
              'button[aria-label="Go to my location"], button[aria-label="Go to campus"]'
            );
            var mapDock = zoomInButton
              ? zoomInButton.closest('div[class*="absolute"]')
              : homeButton
              ? homeButton.closest('div[class*="absolute"]')
              : null;
            if (mapDock) {
              mapDock.style.right = "12px";
              mapDock.style.bottom = "98px";
              mapDock.style.gap = "0";
              mapDock.style.height = "40px";
              mapDock.style.width = "40px";
              mapDock.style.overflow = "hidden";
              mapDock.style.pointerEvents = "auto";

              var dockButtons = mapDock.querySelectorAll("button");
              dockButtons.forEach(function(button) {
                button.style.width = "40px";
                button.style.height = "40px";
              });
            }

            var positionToggleRow = function() {
              if (!toggleRow) {
                return;
              }
              toggleRow.style.right = "12px";
              toggleRow.style.top = "56px";
              toggleRow.style.left = "auto";
              toggleRow.style.bottom = "auto";
            };
            positionToggleRow();

            window.dispatchEvent(new Event("resize"));
          } catch (error) {}
        };

        try {
          window.localStorage.setItem("lockedin_auth", ${escapedPayload});
        } catch (error) {}
        applyEmbeddedTweaks();
        window.addEventListener("load", applyEmbeddedTweaks);
        setTimeout(applyEmbeddedTweaks, 200);
        setTimeout(applyEmbeddedTweaks, 800);
        setTimeout(applyEmbeddedTweaks, 1600);
        var observer = new MutationObserver(function() {
          applyEmbeddedTweaks();
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
        true;
      })();
    `;
  }, [token, user]);

  return (
    <View style={mapStyles.root}>
      <WebView
        key={`${reloadKey}-${token}`}
        style={mapStyles.webview}
        source={{ uri: mapUrl }}
        javaScriptEnabled
        domStorageEnabled
        geolocationEnabled
        cacheEnabled={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        setSupportMultipleWindows={false}
        injectedJavaScriptBeforeContentLoaded={injectedScript}
        onLoadStart={() => {
          setLoading(true);
          setError(null);
        }}
        onLoadEnd={() => {
          setLoading(false);
        }}
        onError={(event) => {
          setLoading(false);
          setError(event.nativeEvent.description || "Failed to load map.");
        }}
        onHttpError={(event) => {
          setLoading(false);
          setError(`Map page failed to load (HTTP ${event.nativeEvent.statusCode}).`);
        }}
      />

      {isLoading ? (
        <View style={mapStyles.loadingOverlay}>
          <ActivityIndicator color="#ffffff" size="small" />
          <Text style={mapStyles.loadingText}>Loading map...</Text>
        </View>
      ) : null}

      {error ? (
        <View style={mapStyles.errorBanner}>
          <Text style={mapStyles.errorText}>{error}</Text>
          <Pressable
            style={mapStyles.retryButton}
            onPress={() => {
              setReloadKey((prev) => prev + 1);
            }}
          >
            <Text style={mapStyles.retryLabel}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
};

const mapStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  webview: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loadingOverlay: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    borderRadius: 12,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadingText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  errorBanner: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 12,
    backgroundColor: "rgba(127, 29, 29, 0.95)",
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.6)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  errorText: {
    color: "#fee2e2",
    fontSize: 12,
    fontWeight: "600",
  },
  retryButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#ffffff",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  retryLabel: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "700",
  },
});
