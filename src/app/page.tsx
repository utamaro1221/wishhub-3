"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Star,
  CheckCircle2,
  Circle,
  ImageOff,
  X,
  Sparkles,
  ArrowUpDown,
  Filter,
  Wallet,
  ShoppingBag,
  Pencil,
  AlertCircle,
  FileEdit,
  Copy,
  Check,
  Tag,
  Smile,
  ChevronRight,
  Share2,
  Layers,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

interface WishItem {
  id: string;
  listId?: string;
  title: string;
  imageUrl: string;
  siteName: string;
  productUrl: string;
  price: number | null;
  priority: number;
  memo: string;
  category: string;
  isPurchased: boolean;
  reactions?: number;
}

interface ItemFormData {
  title: string;
  imageUrl: string;
  siteName: string;
  productUrl: string;
  price: string;
  priority: number;
  memo: string;
  category: string;
}

interface ListInfo {
  token: string;
  name: string;
  lastUpdated: number;
  isOwner: boolean;
  reactionCount: number;
}

type FilterType = "all" | "unpurchased" | "purchased";
type SortType = "newest" | "priority" | "price-asc" | "price-desc";
type MobileTab = "list" | "logs";

const STORAGE_KEY_ITEMS = "wishhub_items_v3";
const STORAGE_KEY_TOKEN = "wishhub_my_list_token";
const STORAGE_KEY_NAME = "wishhub_my_list_name";
const STORAGE_KEY_JOINED = "wishhub_joined_lists";

const CATEGORIES = [
  "すべて",
  "ガジェット",
  "ファッション",
  "日用品",
  "書籍",
  "ホビー",
  "その他",
];

const initialFormData: ItemFormData = {
  title: "",
  imageUrl: "",
  siteName: "",
  productUrl: "",
  price: "",
  priority: 3,
  memo: "",
  category: "その他",
};

const WHITELIST_DOMAINS = [
  "amazon.co.jp",
  "amazon.com",
  "amzn.asia",
  "amzn.to",
  "rakuten.co.jp",
  "yahoo.co.jp",
  "shopping.yahoo.co.jp",
  "zozo.jp",
  "zara.com",
  "uniqlo.com",
  "gu-global.com",
  "muji.com",
  "apple.com",
  "ankerjapan.com",
  "qoo10.jp",
  "mercari.com",
  "jp.mercari.com",
  "yodobashi.com",
  "biccamera.com",
];

function isWhitelistedDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return WHITELIST_DOMAINS.some(
    (domain) => host === domain || host.endsWith("." + domain)
  );
}

const BLOCKED_SHORT_DOMAINS = [
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "adf.ly",
  "bit.do",
  "shorturl.at",
];

function isBlockedShortDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return BLOCKED_SHORT_DOMAINS.some(
    (domain) => host === domain || host.endsWith("." + domain)
  );
}

function isIpAddress(hostname: string): boolean {
  const cleanHost = hostname.replace(/^\[/, "").replace(/\]$/, "");
  const ipv4Pattern = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  if (ipv4Pattern.test(cleanHost)) return true;
  if (cleanHost.includes(":") || cleanHost.startsWith("fe80") || cleanHost === "::1") return true;
  return false;
}

function sanitizeSafeUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "#";
  const trimmed = url.trim();
  if (!trimmed) return "#";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {}
  return "#";
}

function sanitizeImageUrl(url?: string | null): string {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {}
  return "";
}

function isSafeExternalUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function sanitizeInputText(input: string, maxLength = 1000): string {
  if (typeof input !== "string") return "";
  return input
    .replace(/\0/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .slice(0, maxLength);
}

export default function Home() {
  const [myToken, setMyToken] = useState("");
  const [myListName, setMyListName] = useState("マイリスト");
  const [joinedLists, setJoinedLists] = useState<ListInfo[]>([]);
  const [activeListToken, setActiveListToken] = useState("");

  const [items, setItems] = useState<WishItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<ItemFormData>(initialFormData);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSecurityError, setIsSecurityError] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");
  const [selectedCategory, setSelectedCategory] = useState<string>("すべて");
  const [sort, setSort] = useState<SortType>("newest");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isImageError, setIsImageError] = useState(false);

  const [mobileTab, setMobileTab] = useState<MobileTab>("list");
  const [isAddListModalOpen, setIsAddListModalOpen] = useState(false);
  const [joinInputUrl, setJoinInputUrl] = useState("");
  const [isEditingMyName, setIsEditingMyName] = useState(false);
  const [tempMyName, setTempMyName] = useState("");
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [myListLastUpdated, setMyListLastUpdated] = useState<number>(0);

  const formatRelativeTime = (timestamp: number) => {
    if (!mounted || !timestamp) return "たった今";
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return `${Math.max(1, diff)}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    return `${Math.floor(diff / 86400)}日前`;
  };

  const syncListNameToSupabase = async (token: string, name: string) => {
    const cleanName = sanitizeInputText(name, 100).trim();
    if (!token || !cleanName) return;
    try {
      const { data: existingMeta, error: selectError } = await supabase
        .from("wish_items")
        .select("id")
        .eq("list_id", token)
        .in("category", ["__LIST_META__", "__list_meta__"])
        .maybeSingle();

      if (selectError) {
        console.error("メタ取得エラー:", selectError.message);
      }

      if (existingMeta?.id) {
        const { error: updateError } = await supabase
          .from("wish_items")
          .update({
            title: cleanName,
            memo: cleanName,
            price: 0,
            category: "__LIST_META__",
          })
          .eq("id", existingMeta.id);
        if (updateError) {
          console.error("メタ更新エラー:", updateError.message);
        }
      } else {
        const { error: insertError } = await supabase.from("wish_items").insert({
          list_id: token,
          title: cleanName,
          image_url: "",
          site_name: "",
          product_url: "",
          price: 0,
          priority: 0,
          memo: cleanName,
          category: "__LIST_META__",
          is_purchased: false,
        });
        if (insertError) {
          console.error("メタ挿入エラー:", insertError.message);
        }
      }
    } catch (err) {
      console.error("メタ同期例外:", err);
    }
  };

  const fetchListItems = async (targetToken: string) => {
    if (!targetToken) return;
    try {
      const { data, error } = await supabase
        .from("wish_items")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("アイテム取得エラー:", error.message, JSON.stringify(error, null, 2));
        return;
      }

      if (data) {
        const currentLocalToken = localStorage.getItem(STORAGE_KEY_TOKEN) || myToken;
        const metaMap = new Map<string, string>();
        data.forEach((d: any) => {
          if (
            (d.category === "__LIST_META__" || d.category === "__list_meta__") &&
            d.list_id &&
            d.title
          ) {
            metaMap.set(d.list_id, sanitizeInputText(d.title, 100));
          }
        });

        if (metaMap.has(currentLocalToken)) {
          const syncedMyName = metaMap.get(currentLocalToken)!;
          if (syncedMyName && syncedMyName !== myListName) {
            setMyListName(syncedMyName);
            try {
              localStorage.setItem(STORAGE_KEY_NAME, syncedMyName);
            } catch {}
          }
        }

        if (metaMap.size > 0) {
          setJoinedLists((prev) => {
            let changed = false;
            let updated = prev.map((l) => {
              const remoteName = metaMap.get(l.token);
              if (remoteName && remoteName !== l.name) {
                changed = true;
                return { ...l, name: remoteName };
              }
              return l;
            });
            if (
              targetToken !== currentLocalToken &&
              metaMap.has(targetToken) &&
              !prev.some((l) => l.token === targetToken)
            ) {
              const newList: ListInfo = {
                token: targetToken,
                name: metaMap.get(targetToken)!,
                lastUpdated: Date.now(),
                isOwner: false,
                reactionCount: 1,
              };
              updated = [newList, ...updated];
              changed = true;
            }
            if (changed) {
              try {
                localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(updated));
              } catch {}
            }
            return changed ? updated : prev;
          });
        }

        const activeTokenName =
          targetToken === currentLocalToken
            ? metaMap.get(currentLocalToken) || myListName
            : metaMap.get(targetToken);

        if (activeTokenName) {
          try {
            const url = new URL(window.location.href);
            if (url.searchParams.get("name") !== activeTokenName) {
              url.searchParams.set("share", targetToken);
              url.searchParams.set("name", activeTokenName);
              window.history.replaceState({}, "", url.toString());
            }
          } catch {}
        }

        const mapped: WishItem[] = data
          .filter((d: any) => {
            const listId = d.list_id || targetToken;
            const isMeta =
              d.category === "__LIST_META__" || d.category === "__list_meta__";
            return listId === targetToken && !isMeta;
          })
          .map((d: any) => ({
            id: String(d.id),
            listId: String(d.list_id || targetToken),
            title: sanitizeInputText(d.title || "", 200),
            imageUrl: sanitizeImageUrl(d.image_url || ""),
            siteName: sanitizeInputText(d.site_name || "", 100),
            productUrl:
              sanitizeSafeUrl(d.product_url || "") === "#"
                ? ""
                : sanitizeSafeUrl(d.product_url || ""),
            price: d.price ?? null,
            priority: d.priority ?? 3,
            memo: sanitizeInputText(d.memo || "", 2000),
            category: sanitizeInputText(d.category || "その他", 50),
            isPurchased: Boolean(d.is_purchased),
            reactions: d.reactions || 0,
          }));

        setItems((prev) => {
          const others = prev.filter(
            (item) => (item.listId || targetToken) !== targetToken
          );
          return [...mapped, ...others];
        });
      }
    } catch (err) {
      console.error("アイテム取得例外:", err);
    } finally {
      setIsLoaded(true);
    }
  };

  useEffect(() => {
    setMounted(true);
    setMyListLastUpdated(Date.now());

    let token = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(STORAGE_KEY_TOKEN, token);
    }
    setMyToken(token);

    let name = localStorage.getItem(STORAGE_KEY_NAME) || "マイリスト";

    const searchParams = new URLSearchParams(window.location.search);
    const shareParam = searchParams.get("share");
    const nameParam = searchParams.get("name");

    if (shareParam && shareParam === token && nameParam) {
      name = sanitizeInputText(decodeURIComponent(nameParam), 100).trim();
      localStorage.setItem(STORAGE_KEY_NAME, name);
    }

    setMyListName(name);
    setTempMyName(name);

    let joined: ListInfo[] = [];
    try {
      const storedJoined = localStorage.getItem(STORAGE_KEY_JOINED);
      if (storedJoined) {
        joined = JSON.parse(storedJoined);
      }
    } catch {}

    let initialActive = token;

    if (shareParam && shareParam !== token) {
      const decodedShareName = nameParam
        ? sanitizeInputText(decodeURIComponent(nameParam), 100).trim()
        : "友達のログ";
      const existingIndex = joined.findIndex((l) => l.token === shareParam);
      if (existingIndex >= 0) {
        if (nameParam) {
          joined[existingIndex] = {
            ...joined[existingIndex],
            name: decodedShareName,
          };
          localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(joined));
        }
      } else {
        const newList: ListInfo = {
          token: shareParam,
          name: decodedShareName,
          lastUpdated: Date.now(),
          isOwner: false,
          reactionCount: 2,
        };
        joined = [newList, ...joined];
        localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(joined));
      }
      initialActive = shareParam;
    }

    setJoinedLists(joined);
    setActiveListToken(initialActive);

    const storedItems = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (storedItems) {
      try {
        const parsed = JSON.parse(storedItems);
        if (Array.isArray(parsed)) {
          setItems(
            parsed
              .filter(
                (item) =>
                  item.category !== "__LIST_META__" &&
                  item.category !== "__list_meta__"
              )
              .map((item) => ({
                ...item,
                listId: item.listId || token,
                category: item.category || "その他",
                reactions: item.reactions || 0,
              }))
          );
        }
      } catch {}
    }

    fetchListItems(initialActive);
  }, []);

  useEffect(() => {
    if (!activeListToken) return;

    fetchListItems(activeListToken);

    const channel = supabase
      .channel(`realtime_wish_items_${activeListToken}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "wish_items",
        },
        (payload: any) => {
          const rec = payload.new || payload.old;
          const isMeta =
            rec &&
            (rec.category === "__LIST_META__" ||
              rec.category === "__list_meta__");
          if (
            !rec ||
            !rec.list_id ||
            rec.list_id === activeListToken ||
            isMeta
          ) {
            fetchListItems(activeListToken);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeListToken]);

  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));
    } catch {}
  }, [items, isLoaded]);

  const isOwnerActive = activeListToken === myToken;

  const currentListName = useMemo(() => {
    if (isOwnerActive) return myListName;
    const found = joinedLists.find((l) => l.token === activeListToken);
    return found ? found.name : "共有ログ";
  }, [isOwnerActive, myListName, joinedLists, activeListToken]);

  const activeItems = useMemo(() => {
    const currentToken = activeListToken || myToken;
    return items.filter(
      (i) =>
        (i.listId || myToken) === currentToken &&
        i.category !== "__LIST_META__" &&
        i.category !== "__list_meta__"
    );
  }, [items, activeListToken, myToken]);

  const handleSaveMyName = async () => {
    const newName = sanitizeInputText(tempMyName, 100).trim();
    if (!newName) return;
    setMyListName(newName);
    localStorage.setItem(STORAGE_KEY_NAME, newName);
    setIsEditingMyName(false);

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("share", myToken);
      url.searchParams.set("name", newName);
      window.history.replaceState({}, "", url.toString());
    } catch {}

    await syncListNameToSupabase(myToken, newName);
  };

  const handleCopyMyShareUrl = () => {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const tokenToShare = activeListToken || myToken;
    const nameToShare = currentListName;
    const shareUrl = `${origin}${pathname}?share=${tokenToShare}&name=${encodeURIComponent(
      nameToShare
    )}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedShareUrl(true);
    setTimeout(() => setCopiedShareUrl(false), 2000);

    if (isOwnerActive) {
      syncListNameToSupabase(myToken, currentListName);
    }
  };

  const handleJoinList = () => {
    if (!joinInputUrl.trim()) return;
    let token = sanitizeInputText(joinInputUrl, 200).trim();
    let name = "友達のログ";

    try {
      if (token.includes("http")) {
        const urlObj = new URL(token);
        const pShare = urlObj.searchParams.get("share");
        const pName = urlObj.searchParams.get("name");
        if (pShare) {
          token = sanitizeInputText(pShare, 100).trim();
          if (pName) name = sanitizeInputText(decodeURIComponent(pName), 100).trim();
        }
      }
    } catch {}

    if (token === myToken) {
      alert("自分のリストURLです。");
      setIsAddListModalOpen(false);
      setJoinInputUrl("");
      setActiveListToken(myToken);
      return;
    }

    const existingIndex = joinedLists.findIndex((l) => l.token === token);
    if (existingIndex >= 0) {
      const updated = [...joinedLists];
      if (name && name !== "友達のログ") {
        updated[existingIndex] = { ...updated[existingIndex], name };
      }
      setJoinedLists(updated);
      localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(updated));
    } else {
      const newList: ListInfo = {
        token,
        name,
        lastUpdated: Date.now(),
        isOwner: false,
        reactionCount: 1,
      };
      const updated = [newList, ...joinedLists];
      setJoinedLists(updated);
      localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(updated));
    }

    setActiveListToken(token);
    setIsAddListModalOpen(false);
    setJoinInputUrl("");
    setMobileTab("list");
  };

  const handleRemoveJoinedList = (tokenToRemove: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("この共有ログを一覧から削除しますか？")) return;
    const updated = joinedLists.filter((l) => l.token !== tokenToRemove);
    setJoinedLists(updated);
    localStorage.setItem(STORAGE_KEY_JOINED, JSON.stringify(updated));
    if (activeListToken === tokenToRemove) {
      setActiveListToken(myToken);
    }
  };

  const handleAddReactionToItem = async (itemId: string) => {
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const nextReactions = (target.reactions || 0) + 1;

    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, reactions: nextReactions } : item
      )
    );

    try {
      await supabase
        .from("wish_items")
        .update({ reactions: nextReactions })
        .eq("id", itemId);
    } catch {}
  };

  const handleOpenExternalUrl = (e: React.MouseEvent, url: string) => {
    if (!url) return;
    try {
      const parsed = new URL(url);
      if (!isWhitelistedDomain(parsed.hostname)) {
        if (
          !confirm(
            "主要ECサイト以外の外部URL（" +
              parsed.hostname +
              "）を開こうとしています。フィッシングや詐欺サイトにご注意ください。移動しますか？"
          )
        ) {
          e.preventDefault();
        }
      }
    } catch {}
  };

  const handleScrape = async () => {
    if (!isOwnerActive) return;
    if (!inputUrl.trim()) {
      alert("URLを入力してください");
      return;
    }

    const trimmedInput = inputUrl.trim();
    if (!trimmedInput.toLowerCase().startsWith("https://")) {
      setIsSecurityError(true);
      setErrorMessage("https:// から始まる安全なURLを入力してください");
      alert("https:// から始まる安全なURLを入力してください");
      return;
    }

    let parsedInput: URL;
    try {
      parsedInput = new URL(trimmedInput);
    } catch {
      setIsSecurityError(true);
      setErrorMessage("https:// から始まる有効なURLを入力してください");
      alert("https:// から始まる有効なURLを入力してください");
      return;
    }

    if (parsedInput.protocol !== "https:") {
      setIsSecurityError(true);
      setErrorMessage("https:// から始まる安全なURLを入力してください");
      alert("https:// から始まる安全なURLを入力してください");
      return;
    }

    if (
      isIpAddress(parsedInput.hostname) ||
      isBlockedShortDomain(parsedInput.hostname)
    ) {
      setIsSecurityError(true);
      setErrorMessage("IPアドレスや短縮URLは安全のため登録できません");
      alert("IPアドレスや短縮URLは安全のため登録できません");
      return;
    }

    if (isLoading) return;

    setIsLoading(true);
    setErrorMessage("");
    setIsSecurityError(false);

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl.trim() }),
      });

      if (!res.ok) {
        let errorDetail = "サーバーエラー";
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errorDetail = errData.error;
          }
        } catch {}

        if (res.status === 400) {
          setIsSecurityError(true);
          setErrorMessage(errorDetail);
          alert(errorDetail);
          return;
        }

        setIsSecurityError(false);
        setErrorMessage(errorDetail);
        alert(errorDetail);

        let siteName = "";
        try {
          const parsed = new URL(inputUrl.trim());
          siteName = parsed.hostname.replace(/^www\./i, "");
        } catch {}

        setIsImageError(false);
        setFormData({
          title: "",
          imageUrl: "",
          siteName,
          productUrl: inputUrl.trim(),
          price: "",
          priority: 3,
          memo: "",
          category: "その他",
        });
        setEditingItemId(null);
        setIsModalOpen(true);
        return;
      }

      const data = await res.json();

      setIsImageError(false);
      setFormData({
        title: data.title || "",
        imageUrl: data.imageUrl || "",
        siteName: data.siteName || "",
        productUrl: data.productUrl || inputUrl.trim(),
        price:
          data.price !== null && data.price !== undefined
            ? String(data.price)
            : "",
        priority: 3,
        memo: "",
        category: "その他",
      });
      setEditingItemId(null);
      setIsModalOpen(true);
    } catch (err) {
      console.error("API呼び出し例外:", err);
      alert("通信エラーが発生しました: " + err);
      setErrorMessage(
        err instanceof Error ? err.message : "通信エラーが発生しました。"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenManualModal = () => {
    if (!isOwnerActive) return;
    let siteName = "";
    try {
      if (inputUrl.trim()) {
        const parsed = new URL(inputUrl.trim());
        siteName = parsed.hostname.replace(/^www\./i, "");
      }
    } catch {}

    setIsImageError(false);
    setFormData({
      title: "",
      imageUrl: "",
      siteName,
      productUrl: inputUrl.trim(),
      price: "",
      priority: 3,
      memo: "",
      category: "その他",
    });
    setEditingItemId(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (item: WishItem) => {
    if (!isOwnerActive) return;
    setIsImageError(false);
    setFormData({
      title: item.title,
      imageUrl: item.imageUrl,
      siteName: item.siteName,
      productUrl: item.productUrl,
      price: item.price !== null ? String(item.price) : "",
      priority: item.priority,
      memo: item.memo,
      category: item.category || "その他",
    });
    setEditingItemId(item.id);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItemId(null);
    setIsImageError(false);
    setFormData(initialFormData);
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerActive) return;

    if (formData.productUrl.trim()) {
      const pUrl = formData.productUrl.trim();
      if (!pUrl.toLowerCase().startsWith("https://")) {
        alert("https:// から始まる安全なURLを入力してください");
        return;
      }
      let parsed: URL;
      try {
        parsed = new URL(pUrl);
      } catch {
        alert("https:// から始まる有効なURLを入力してください");
        return;
      }
      if (parsed.protocol !== "https:") {
        alert("https:// から始まる安全なURLを入力してください");
        return;
      }
      if (
        isIpAddress(parsed.hostname) ||
        isBlockedShortDomain(parsed.hostname)
      ) {
        alert("IPアドレスや短縮URLは安全のため登録できません");
        return;
      }
      if (!isWhitelistedDomain(parsed.hostname)) {
        if (
          !confirm(
            "このURL（" +
              parsed.hostname +
              "）は主要ショッピングサイト一覧に含まれていません。信頼できるサイトであることを確認してください。登録を続行しますか？"
          )
        ) {
          return;
        }
      }
    }

    const parsedPrice =
      formData.price.trim() !== "" && !isNaN(Number(formData.price))
        ? Math.round(Number(formData.price))
        : null;

    let derivedSiteName = formData.siteName;
    if (!derivedSiteName && formData.productUrl.trim()) {
      try {
        const parsed = new URL(formData.productUrl.trim());
        derivedSiteName = parsed.hostname.replace(/^www\./i, "");
      } catch {}
    }

    const cleanTitle = sanitizeInputText(formData.title, 200).trim();
    if (!cleanTitle) {
      alert("商品名を入力してください");
      return;
    }

    const cleanMemo = sanitizeInputText(formData.memo, 2000);
    const cleanCategory = sanitizeInputText(formData.category, 50).trim() || "その他";
    const cleanSiteName = sanitizeInputText(derivedSiteName, 100).trim();
    const rawPUrl = formData.productUrl.trim();
    const cleanProductUrl = rawPUrl
      ? sanitizeSafeUrl(rawPUrl) === "#"
        ? ""
        : sanitizeSafeUrl(rawPUrl)
      : "";
    const cleanImageUrl = sanitizeImageUrl(formData.imageUrl.trim());

    if (editingItemId) {
      try {
        const { error } = await supabase
          .from("wish_items")
          .update({
            title: cleanTitle,
            image_url: cleanImageUrl,
            site_name: cleanSiteName,
            product_url: cleanProductUrl,
            price: parsedPrice,
            priority: formData.priority,
            memo: cleanMemo,
            category: cleanCategory,
          })
          .eq("id", editingItemId);

        if (error) {
          console.error("更新エラー:", error.message, JSON.stringify(error, null, 2));
        }
      } catch (err) {
        console.error("更新例外:", err);
      }

      setItems((prev) => {
        const updated = prev.map((item) =>
          item.id === editingItemId
            ? {
                ...item,
                title: cleanTitle,
                imageUrl: cleanImageUrl,
                siteName: cleanSiteName,
                productUrl: cleanProductUrl,
                price: parsedPrice,
                priority: formData.priority,
                memo: cleanMemo,
                category: cleanCategory,
              }
            : item
        );
        try {
          localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(updated));
        } catch {}
        return updated;
      });
      setMyListLastUpdated(Date.now());
    } else {
      const currentToken = activeListToken || myToken;
      const insertPayload = {
        list_id: currentToken,
        title: cleanTitle,
        image_url: cleanImageUrl,
        site_name: cleanSiteName,
        product_url: cleanProductUrl,
        price: parsedPrice,
        priority: formData.priority,
        memo: cleanMemo,
        category: cleanCategory,
        is_purchased: false,
      };

      try {
        const { data, error } = await supabase
          .from("wish_items")
          .insert(insertPayload)
          .select()
          .single();

        if (error) {
          console.error("追加エラー:", error.message, JSON.stringify(error, null, 2));
          const fallbackItem: WishItem = {
            id: crypto.randomUUID(),
            listId: currentToken,
            title: insertPayload.title,
            imageUrl: insertPayload.image_url,
            siteName: insertPayload.site_name,
            productUrl: insertPayload.product_url,
            price: insertPayload.price,
            priority: insertPayload.priority,
            memo: insertPayload.memo,
            category: insertPayload.category,
            isPurchased: false,
            reactions: 0,
          };
          setItems((prev) => [fallbackItem, ...prev]);
        } else if (data) {
          const savedItem: WishItem = {
            id: data.id,
            listId: data.list_id || currentToken,
            title: sanitizeInputText(data.title || "", 200),
            imageUrl: sanitizeImageUrl(data.image_url || ""),
            siteName: sanitizeInputText(data.site_name || "", 100),
            productUrl:
              sanitizeSafeUrl(data.product_url || "") === "#"
                ? ""
                : sanitizeSafeUrl(data.product_url || ""),
            price: data.price ?? null,
            priority: data.priority ?? 3,
            memo: sanitizeInputText(data.memo || "", 2000),
            category: sanitizeInputText(data.category || "その他", 50),
            isPurchased: Boolean(data.is_purchased),
            reactions: data.reactions || 0,
          };
          setItems((prev) => [savedItem, ...prev]);
        }
      } catch (err) {
        console.error("追加例外:", err);
        const fallbackItem: WishItem = {
          id: crypto.randomUUID(),
          listId: currentToken,
          title: insertPayload.title,
          imageUrl: insertPayload.image_url,
          siteName: insertPayload.site_name,
          productUrl: insertPayload.product_url,
          price: insertPayload.price,
          priority: insertPayload.priority,
          memo: insertPayload.memo,
          category: insertPayload.category,
          isPurchased: false,
          reactions: 0,
        };
        setItems((prev) => [fallbackItem, ...prev]);
      }

      setMyListLastUpdated(Date.now());
      setInputUrl("");
      setErrorMessage("");
      if (isOwnerActive) {
        syncListNameToSupabase(currentToken, currentListName);
      }
    }

    setInputUrl("");
    handleCloseModal();
  };

  const handleTogglePurchased = async (id: string) => {
    if (!isOwnerActive) return;
    const target = items.find((i) => i.id === id);
    if (!target) return;

    const nextState = !target.isPurchased;

    try {
      const { error } = await supabase
        .from("wish_items")
        .update({ is_purchased: nextState })
        .eq("id", id);
      if (error) {
        console.error("購入状態更新エラー:", error.message, JSON.stringify(error, null, 2));
      }
    } catch (err) {
      console.error("購入状態更新例外:", err);
    }

    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isPurchased: nextState } : item
      )
    );
  };

  const handleDeleteItem = async (id: string) => {
    if (!isOwnerActive) return;
    if (!confirm("本当にこのアイテムを削除しますか？")) return;

    try {
      const { error } = await supabase.from("wish_items").delete().eq("id", id);
      if (error) {
        console.error("削除エラー:", error.message, JSON.stringify(error, null, 2));
      }
    } catch (err) {
      console.error("削除例外:", err);
    }

    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleCopyUrl = (id: string, url: string) => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const displayedItems = useMemo(() => {
    let filtered = activeItems;

    if (filter === "unpurchased") {
      filtered = filtered.filter((i) => !i.isPurchased);
    } else if (filter === "purchased") {
      filtered = filtered.filter((i) => i.isPurchased);
    }

    if (selectedCategory !== "すべて") {
      filtered = filtered.filter((i) => i.category === selectedCategory);
    }

    return [...filtered].sort((a, b) => {
      if (sort === "priority") {
        return b.priority - a.priority;
      }
      if (sort === "price-asc") {
        const priceA = a.price ?? Number.MAX_SAFE_INTEGER;
        const priceB = b.price ?? Number.MAX_SAFE_INTEGER;
        return priceA - priceB;
      }
      if (sort === "price-desc") {
        const priceA = a.price ?? -1;
        const priceB = b.price ?? -1;
        return priceB - priceA;
      }
      return 0;
    });
  }, [activeItems, filter, selectedCategory, sort]);

  const stats = useMemo(() => {
    const validItems = activeItems.filter(
      (i) =>
        i.category !== "__LIST_META__" && i.category !== "__list_meta__"
    );
    const total = validItems.reduce((sum, item) => sum + (item.price ?? 0), 0);
    const unpurchasedTotal = validItems
      .filter((i) => !i.isPurchased)
      .reduce((sum, item) => sum + (item.price ?? 0), 0);
    const unpurchasedCount = validItems.filter((i) => !i.isPurchased).length;
    return { total, unpurchasedTotal, unpurchasedCount };
  }, [activeItems]);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col antialiased">
      <div className="flex-1 flex overflow-hidden">
        <aside
          className={`w-full lg:w-80 shrink-0 border-r border-zinc-800/80 bg-zinc-950 flex flex-col h-screen sticky top-0 ${
            mobileTab === "logs" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-xl bg-orange-600/90 text-white shadow-sm">
                <Layers className="w-5 h-5" />
              </div>
              <span className="font-bold tracking-tight text-base">ログ一覧</span>
            </div>
            <button
              type="button"
              onClick={() => setIsAddListModalOpen(true)}
              className="p-1.5 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white transition cursor-pointer"
              title="秘密のURLを追加"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 border-b border-zinc-800/60 bg-zinc-900/40">
            <button
              type="button"
              onClick={handleCopyMyShareUrl}
              className="w-full py-2.5 px-3 rounded-2xl bg-orange-600/20 hover:bg-orange-600/30 border border-orange-500/40 text-orange-400 font-semibold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
            >
              {copiedShareUrl ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>共有URLをコピーしました！</span>
                </>
              ) : (
                <>
                  <Share2 className="w-4 h-4" />
                  <span>秘密の共有URLをコピー</span>
                </>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
            <div
              onClick={() => {
                setActiveListToken(myToken);
                setMobileTab("list");
                try {
                  const url = new URL(window.location.href);
                  url.searchParams.set("share", myToken);
                  url.searchParams.set("name", myListName);
                  window.history.replaceState({}, "", url.toString());
                } catch {}
              }}
              className={`p-3.5 rounded-3xl border transition cursor-pointer flex items-center justify-between group ${
                activeListToken === myToken
                  ? "bg-zinc-900/90 border-orange-500/80 shadow-md ring-1 ring-orange-500/30"
                  : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
              }`}
            >
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-zinc-100 truncate">
                    {myListName}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-800 text-zinc-400 font-medium">
                    Owner
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingMyName(true);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-orange-400 transition"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="font-bold text-orange-500 text-[11px]">
                    new log
                  </span>
                  <span className="text-zinc-500 text-[11px]">
                    {formatRelativeTime(myListLastUpdated)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center -space-x-1.5">
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-zinc-300">
                    <Smile className="w-3.5 h-3.5" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-orange-400">
                    <Smile className="w-3.5 h-3.5" />
                  </div>
                </div>
                {activeListToken === myToken && (
                  <ChevronRight className="w-4 h-4 text-orange-500" />
                )}
              </div>
            </div>

            {joinedLists.map((list) => {
              const isSelected = activeListToken === list.token;
              return (
                <div
                  key={list.token}
                  onClick={() => {
                    setActiveListToken(list.token);
                    setMobileTab("list");
                    try {
                      const url = new URL(window.location.href);
                      url.searchParams.set("share", list.token);
                      url.searchParams.set("name", list.name);
                      window.history.replaceState({}, "", url.toString());
                    } catch {}
                  }}
                  className={`p-3.5 rounded-3xl border transition cursor-pointer flex items-center justify-between group ${
                    isSelected
                      ? "bg-zinc-900/90 border-orange-500/80 shadow-md ring-1 ring-orange-500/30"
                      : "bg-zinc-900/60 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
                  }`}
                >
                  <div className="flex flex-col gap-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-zinc-100 truncate">
                        {list.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveJoinedList(list.token, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-zinc-600 transition"
                        title="リストから削除"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-bold text-orange-500 text-[11px]">
                        new log
                      </span>
                      <span className="text-zinc-500 text-[11px]">
                        {formatRelativeTime(list.lastUpdated)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center -space-x-1.5">
                      <div className="w-7 h-7 rounded-full bg-zinc-800 border-2 border-zinc-950 flex items-center justify-center text-zinc-400">
                        <Smile className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    {isSelected && (
                      <ChevronRight className="w-4 h-4 text-orange-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <div
          className={`flex-1 flex flex-col min-w-0 bg-zinc-950 h-screen overflow-y-auto ${
            mobileTab === "list" ? "flex" : "hidden lg:flex"
          }`}
        >
          <header className="border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur sticky top-0 z-20">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-600 text-white shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    <span>{currentListName}</span>
                    {!isOwnerActive && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-orange-400 font-semibold border border-orange-500/30">
                        共有リスト
                      </span>
                    )}
                  </h1>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-xs sm:text-sm font-medium text-zinc-400">
                  <span>未購入 {stats.unpurchasedCount} 件</span>
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6 w-full flex-1 pb-24 lg:pb-8">
            {activeItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-sm flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-orange-600/20 text-orange-400 border border-orange-500/20">
                    <ShoppingBag className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400">
                      未購入の合計
                    </p>
                    <p className="text-2xl font-bold tracking-tight text-orange-400">
                      ¥{stats.unpurchasedTotal.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/90 border border-zinc-800/80 shadow-sm flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/20">
                    <Wallet className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-zinc-400">
                      全体の合計金額
                    </p>
                    <p className="text-2xl font-bold tracking-tight text-zinc-100">
                      ¥{stats.total.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isOwnerActive && (
              <section className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-5 sm:p-6 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-semibold text-zinc-100">
                    新しいアイテムを追加
                  </h2>
                  <button
                    type="button"
                    onClick={handleOpenManualModal}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 hover:underline cursor-pointer"
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>直接手動で登録</span>
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="url"
                      value={inputUrl}
                      disabled={isLoading}
                      onChange={(e) => {
                        setInputUrl(e.target.value);
                        if (errorMessage) setErrorMessage("");
                        if (isSecurityError) setIsSecurityError(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isLoading) {
                          e.preventDefault();
                          handleScrape();
                        }
                      }}
                      placeholder="商品ページのURLを入力 (例: https://www.amazon.co.jp/...)"
                      className="w-full px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800/60 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition text-sm disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleScrape}
                    disabled={isLoading || inputUrl.trim() === ""}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:bg-zinc-800 text-white font-medium text-sm transition shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-sm"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>取得中...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        <span>情報を取得</span>
                      </>
                    )}
                  </button>
                </div>

                {errorMessage && (
                  <div
                    className={`mt-4 p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isSecurityError
                        ? "bg-red-950/70 border-red-800/80 text-red-200 shadow-md ring-1 ring-red-500/30"
                        : "bg-red-950/40 border-red-900/50 text-red-400"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 text-sm font-medium">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{errorMessage}</span>
                    </div>
                    {!isSecurityError && (
                      <button
                        type="button"
                        onClick={handleOpenManualModal}
                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition shrink-0 cursor-pointer shadow-xs"
                      >
                        <FileEdit className="w-3.5 h-3.5" />
                        <span>手動で登録する</span>
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-zinc-100">
                  {currentListName} のリスト
                </h2>

                {activeItems.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                      <Filter className="w-3.5 h-3.5 ml-2 mr-1 text-zinc-500" />
                      <button
                        type="button"
                        onClick={() => setFilter("all")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          filter === "all"
                            ? "bg-zinc-800 text-orange-400 shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        すべて
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilter("unpurchased")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          filter === "unpurchased"
                            ? "bg-zinc-800 text-orange-400 shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        未購入
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilter("purchased")}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition cursor-pointer ${
                          filter === "purchased"
                            ? "bg-zinc-800 text-orange-400 shadow-xs"
                            : "text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        購入済み
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-xl border border-zinc-800">
                      <Tag className="w-3.5 h-3.5 text-zinc-500" />
                      <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer text-zinc-300 py-0.5"
                      >
                        {CATEGORIES.map((cat) => (
                          <option
                            key={cat}
                            value={cat}
                            className="bg-zinc-900 text-zinc-200"
                          >
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1.5 bg-zinc-900 px-2.5 py-1 rounded-xl border border-zinc-800">
                      <ArrowUpDown className="w-3.5 h-3.5 text-zinc-500" />
                      <select
                        value={sort}
                        onChange={(e) => setSort(e.target.value as SortType)}
                        className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer text-zinc-300 py-0.5"
                      >
                        <option value="newest" className="bg-zinc-900 text-zinc-200">
                          登録順
                        </option>
                        <option
                          value="priority"
                          className="bg-zinc-900 text-zinc-200"
                        >
                          優先度順
                        </option>
                        <option
                          value="price-asc"
                          className="bg-zinc-900 text-zinc-200"
                        >
                          価格が安い順
                        </option>
                        <option
                          value="price-desc"
                          className="bg-zinc-900 text-zinc-200"
                        >
                          価格が高い順
                        </option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {displayedItems.length === 0 ? (
                <div className="text-center py-16 px-4 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/30">
                  <p className="text-zinc-400 font-medium">
                    {activeItems.length === 0
                      ? "まだ登録されたアイテムがありません。"
                      : "該当するアイテムがありません。"}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    {activeItems.length === 0
                      ? isOwnerActive
                        ? "上のフォームから商品URLを入力して追加してみましょう。"
                        : "友達がアイテムを追加するのをお待ちください。"
                      : "フィルターやカテゴリの条件を変更してみてください。"}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {displayedItems.map((item) => (
                    <div
                      key={item.id}
                      className={`group relative flex flex-col justify-between bg-zinc-900/90 border rounded-3xl overflow-hidden transition-all duration-200 hover:shadow-lg ${
                        item.isPurchased
                          ? "border-zinc-800/80 opacity-60 bg-zinc-900/40"
                          : "border-zinc-800/80 hover:border-zinc-700 shadow-sm"
                      }`}
                    >
                      <div>
                        {sanitizeSafeUrl(item.productUrl) !== "#" ? (
                          <a
                            href={sanitizeSafeUrl(item.productUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => handleOpenExternalUrl(e, item.productUrl)}
                            className="block relative aspect-video w-full bg-zinc-950 overflow-hidden cursor-pointer"
                            title={`${item.title} の商品ページを開く`}
                          >
                            {sanitizeImageUrl(item.imageUrl) ? (
                              <img
                                src={sanitizeImageUrl(item.imageUrl)}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-600">
                                <ImageOff className="w-8 h-8" />
                                <span className="text-xs">No image</span>
                              </div>
                            )}
                            <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                              {item.siteName && (
                                <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-black/80 backdrop-blur text-white shadow-sm border border-zinc-800">
                                  {item.siteName}
                                </span>
                              )}
                              {item.category && item.category !== "その他" && (
                                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-orange-600/80 backdrop-blur text-white shadow-sm">
                                  {item.category}
                                </span>
                              )}
                            </div>
                          </a>
                        ) : (
                          <div className="relative aspect-video w-full bg-zinc-950 overflow-hidden flex items-center justify-center">
                            {sanitizeImageUrl(item.imageUrl) ? (
                              <img
                                src={sanitizeImageUrl(item.imageUrl)}
                                alt={item.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-zinc-600">
                                <ImageOff className="w-8 h-8" />
                                <span className="text-xs">No image</span>
                              </div>
                            )}
                            <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                              {item.siteName && (
                                <span className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-black/80 backdrop-blur text-white shadow-sm border border-zinc-800">
                                  {item.siteName}
                                </span>
                              )}
                              {item.category && item.category !== "その他" && (
                                <span className="px-2 py-0.5 text-[11px] font-semibold rounded-lg bg-orange-600/80 backdrop-blur text-white shadow-sm">
                                  {item.category}
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="p-4 flex flex-col gap-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`w-3.5 h-3.5 ${
                                    star <= item.priority
                                      ? "text-amber-400 fill-amber-400"
                                      : "text-zinc-700"
                                  }`}
                                />
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddReactionToItem(item.id)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition cursor-pointer"
                              title="いいね！"
                            >
                              <Smile className="w-3.5 h-3.5 text-orange-400" />
                              <span>{item.reactions || 0}</span>
                            </button>
                          </div>

                          <h3
                            className={`font-semibold text-sm line-clamp-2 ${
                              item.isPurchased
                                ? "line-through text-zinc-500"
                                : "text-zinc-100"
                            }`}
                            title={item.title}
                          >
                            {item.title || "無題のアイテム"}
                          </h3>

                          {item.price !== null && (
                            <div className="text-base font-bold text-orange-400">
                              ¥{item.price.toLocaleString()}
                            </div>
                          )}

                          {item.memo && (
                            <p className="text-xs text-zinc-400 bg-zinc-950/60 p-2.5 rounded-2xl border border-zinc-800 line-clamp-3 whitespace-pre-wrap">
                              {item.memo}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="p-4 pt-0 mt-auto flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-3">
                        {isOwnerActive ? (
                          <button
                            type="button"
                            onClick={() => handleTogglePurchased(item.id)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-xl border border-zinc-800 hover:bg-zinc-800 transition cursor-pointer text-zinc-300"
                          >
                            {item.isPurchased ? (
                              <>
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                <span>購入済み</span>
                              </>
                            ) : (
                              <>
                                <Circle className="w-4 h-4 text-zinc-500" />
                                <span>未購入</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div className="text-xs text-zinc-500 flex items-center gap-1">
                            {item.isPurchased ? (
                              <span className="text-emerald-500 font-medium">
                                ● 購入済み
                              </span>
                            ) : (
                              <span>○ 未購入</span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-1">
                          {item.productUrl && (
                            <button
                              type="button"
                              onClick={() =>
                                handleCopyUrl(item.id, item.productUrl)
                              }
                              className="inline-flex items-center justify-center p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                              title="URLをコピー"
                            >
                              {copiedId === item.id ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </button>
                          )}
                          {isOwnerActive && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(item)}
                              className="inline-flex items-center justify-center p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                              title="編集"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                          {sanitizeSafeUrl(item.productUrl) !== "#" ? (
                            <a
                              href={sanitizeSafeUrl(item.productUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => handleOpenExternalUrl(e, item.productUrl)}
                              className="inline-flex items-center justify-center p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                              title="商品を見る"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          ) : null}
                          {isOwnerActive && (
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="inline-flex items-center justify-center p-2 rounded-xl text-zinc-500 hover:text-red-400 hover:bg-red-950/30 transition cursor-pointer"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </main>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-zinc-900/90 border border-zinc-800 backdrop-blur-md p-1.5 rounded-full shadow-2xl flex items-center gap-1">
        <button
          type="button"
          onClick={() => setMobileTab("list")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition ${
            mobileTab === "list"
              ? "bg-orange-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>マイリスト</span>
        </button>
        <button
          type="button"
          onClick={() => setMobileTab("logs")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition ${
            mobileTab === "logs"
              ? "bg-orange-600 text-white shadow-sm"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>ログ ({1 + joinedLists.length})</span>
        </button>
      </div>

      {isEditingMyName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-5 shadow-2xl flex flex-col gap-4">
            <h3 className="font-bold text-base text-zinc-100">リスト名の変更</h3>
            <input
              type="text"
              value={tempMyName}
              onChange={(e) => setTempMyName(e.target.value)}
              placeholder="例: たろうの欲しいもの"
              className="w-full px-3.5 py-2 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsEditingMyName(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveMyName}
                className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddListModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-zinc-100">
                秘密の共有URLを追加
              </h3>
              <button
                type="button"
                onClick={() => setIsAddListModalOpen(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              友達から受け取った「秘密の共有URL」またはリストトークンを貼り付けてください。左側のログ一覧に追加されます。
            </p>
            <input
              type="text"
              value={joinInputUrl}
              onChange={(e) => setJoinInputUrl(e.target.value)}
              placeholder="https://.../?share=xxx&name=..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddListModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleJoinList}
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition"
              >
                追加する
              </button>
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between p-5 border-b border-zinc-800">
              <h3 className="font-bold text-lg text-zinc-100">
                {editingItemId ? "アイテムの編集" : "アイテムの確認・登録"}
              </h3>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitModal}
              className="p-5 overflow-y-auto flex flex-col gap-4 text-zinc-100"
            >
              <div className="flex gap-4 items-start">
                <div className="w-24 h-24 rounded-2xl bg-zinc-950 overflow-hidden shrink-0 flex items-center justify-center border border-zinc-800">
                  {sanitizeImageUrl(formData.imageUrl) && !isImageError ? (
                    <img
                      src={sanitizeImageUrl(formData.imageUrl)}
                      alt={formData.title || "thumbnail"}
                      onError={() => setIsImageError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <ImageOff className="w-6 h-6 text-zinc-600" />
                  )}
                </div>
                <div className="flex-1 flex flex-col gap-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold text-zinc-400">
                      商品名 <span className="text-red-500">*</span>
                    </label>
                    {formData.siteName && (
                      <span className="text-xs font-semibold text-orange-400">
                        {formData.siteName}
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    placeholder="商品名を入力"
                    required
                    className="font-semibold text-sm w-full px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-zinc-400">
                  商品ページURL（任意）
                </label>
                <input
                  type="url"
                  value={formData.productUrl}
                  onChange={(e) => {
                    const nextUrl = e.target.value;
                    let site = formData.siteName;
                    try {
                      if (nextUrl.trim()) {
                        site = new URL(nextUrl.trim()).hostname.replace(/^www\./i, "");
                      }
                    } catch {}
                    setFormData({
                      ...formData,
                      productUrl: nextUrl,
                      siteName: site,
                    });
                  }}
                  placeholder="https://www.amazon.co.jp/dp/..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-400">
                    カテゴリ
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) =>
                      setFormData({ ...formData, category: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition cursor-pointer"
                  >
                    {CATEGORIES.filter((c) => c !== "すべて").map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1 text-zinc-400">
                    価格（円）
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.price}
                    onChange={(e) =>
                      setFormData({ ...formData, price: e.target.value })
                    }
                    placeholder="例: 2980"
                    className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400">
                  画像URL（任意）
                </label>
                <p className="text-xs text-zinc-500 mt-0.5 mb-1.5 leading-relaxed">
                  ※商品ページの画像を右クリック（スマホは長押し）して「画像アドレスをコピー」したURLを貼り付けてください
                </p>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => {
                    setIsImageError(false);
                    setFormData({ ...formData, imageUrl: e.target.value });
                  }}
                  placeholder="https://...（画像のアドレス）"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-zinc-400">
                  優先度
                </label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, priority: star })
                      }
                      className="p-1 focus:outline-none cursor-pointer"
                    >
                      <Star
                        className={`w-6 h-6 transition ${
                          star <= formData.priority
                            ? "text-amber-400 fill-amber-400"
                            : "text-zinc-700"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-medium text-zinc-400 ml-2">
                    {formData.priority} / 5
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-zinc-400">
                  メモ
                </label>
                <textarea
                  rows={3}
                  value={formData.memo}
                  onChange={(e) =>
                    setFormData({ ...formData, memo: e.target.value })
                  }
                  placeholder="サイズ、欲しい理由、セール情報など"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-zinc-700 bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-orange-500 text-zinc-100 transition resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800 mt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium rounded-xl border border-zinc-700 hover:bg-zinc-800 transition cursor-pointer text-zinc-300"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-sm font-medium rounded-xl bg-orange-600 hover:bg-orange-700 text-white transition cursor-pointer"
                >
                  {editingItemId ? "変更を保存" : "リストに追加"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
