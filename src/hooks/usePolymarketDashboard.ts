import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { buildHolderIndex, classifyMarket, scoreWallets } from '../lib/analytics';
import {
  MARKET_WS_URL,
  applyWebsocketEvent,
  buildInitialTradeCache,
  buildTrackedMarkets,
  createWebsocketLog,
  fetchHoldersForMarket,
  fetchOpenInterest,
  fetchOrderBooks,
  fetchPriceHistory,
  fetchRelevantGammaMarkets,
  fetchTradesForMarkets,
  fetchTradesForSingleMarket,
  fetchWalletActivity,
  fetchWalletPositions,
  fetchWalletProfile,
  getMarketTokenIds,
  groupTradesByCondition,
} from '../lib/polymarket';
import type {
  DetailCache,
  GammaMarket,
  HolderRecord,
  MarketTrade,
  PriceHistoryPoint,
  TokenSnapshot,
  TrackedMarket,
  WalletDetail,
  WalletInsight,
  WebsocketLogEntry,
} from '../types/polymarket';

interface DashboardState {
  markets: TrackedMarket[];
  wallets: WalletInsight[];
  selectedMarket?: TrackedMarket;
  selectedWallet?: WalletInsight;
  selectedMarketTrades: MarketTrade[];
  selectedMarketHolders: Record<string, HolderRecord[]>;
  selectedPriceHistory: PriceHistoryPoint[];
  selectedWalletDetail?: WalletDetail;
  loading: boolean;
  refreshing: boolean;
  error?: string;
  lastRestSync?: number;
  websocketStatus: 'connecting' | 'live' | 'reconnecting' | 'offline';
  websocketLog: WebsocketLogEntry[];
}

const DETAIL_TTL_MS = 90_000;
const REST_REFRESH_MS = 180_000;

export function usePolymarketDashboard(selectedMarketId?: string, selectedWalletAddress?: string): DashboardState {
  const [marketEntries, setMarketEntries] = useState<Array<{ market: GammaMarket; topics: ReturnType<typeof classifyMarket> }>>([]);
  const [tokenSnapshots, setTokenSnapshots] = useState<Record<string, TokenSnapshot>>({});
  const [openInterestByCondition, setOpenInterestByCondition] = useState<Record<string, number>>({});
  const [websocketLog, setWebsocketLog] = useState<WebsocketLogEntry[]>([]);
  const [marketTradesCache, setMarketTradesCache] = useState<Record<string, DetailCache<MarketTrade[]>>>({});
  const [holdersCache, setHoldersCache] = useState<Record<string, DetailCache<Record<string, HolderRecord[]>>>>({});
  const [historyCache, setHistoryCache] = useState<Record<string, DetailCache<PriceHistoryPoint[]>>>({});
  const [walletDetailCache, setWalletDetailCache] = useState<Record<string, DetailCache<WalletDetail>>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [lastRestSync, setLastRestSync] = useState<number>();
  const [websocketStatus, setWebsocketStatus] = useState<'connecting' | 'live' | 'reconnecting' | 'offline'>('connecting');
  const reconnectTimerRef = useRef<number | undefined>(undefined);

  const refreshDashboard = useEffectEvent(async (initial = false) => {
    try {
      if (initial) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const gammaMarkets = await fetchRelevantGammaMarkets();
      const relevantEntries = gammaMarkets
        .map((market) => ({
          market,
          topics: classifyMarket(market),
        }))
        .filter((entry) => entry.topics.length);

      const conditionIds = relevantEntries.map((entry) => entry.market.conditionId);
      const tokenIds = relevantEntries.flatMap((entry) => getMarketTokenIds(entry.market));

      const [nextTokenSnapshots, nextOpenInterest, nextTrades] = await Promise.all([
        fetchOrderBooks(tokenIds),
        fetchOpenInterest(conditionIds),
        fetchTradesForMarkets(conditionIds),
      ]);

      setMarketEntries(relevantEntries);
      setTokenSnapshots(nextTokenSnapshots);
      setOpenInterestByCondition(nextOpenInterest);
      setMarketTradesCache((current) => ({
        ...current,
        ...buildInitialTradeCache(nextTrades),
      }));
      setLastRestSync(Date.now());
      setError(undefined);
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Unable to load Polymarket data.';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  });

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refreshDashboard(true);
    }, 0);
    const timer = window.setInterval(() => {
      void refreshDashboard(false);
    }, REST_REFRESH_MS);

    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  const markets = buildTrackedMarkets(
    marketEntries,
    tokenSnapshots,
    openInterestByCondition,
    (() => {
      const grouped = groupTradesByCondition(
        Object.values(marketTradesCache).flatMap((cache) => cache.data),
      );
      const holderIndex = buildHolderIndex(
        Object.fromEntries(Object.entries(holdersCache).map(([key, cache]) => [key, cache.data])),
      );
      const wallets = scoreWallets(
        Object.values(grouped).flatMap((collection) => collection),
        openInterestByCondition,
        holderIndex,
      );

      return wallets.reduce<Record<string, string[]>>((collection, wallet) => {
        wallet.marketExposureIds.forEach((conditionId) => {
          const current = collection[conditionId] ?? [];
          current.push(wallet.address);
          collection[conditionId] = current;
        });
        return collection;
      }, {});
    })(),
    websocketLog,
  ).sort((left, right) => right.volume24hr - left.volume24hr);

  const wallets = scoreWallets(
    Object.values(marketTradesCache).flatMap((cache) => cache.data),
    openInterestByCondition,
    buildHolderIndex(
      Object.fromEntries(Object.entries(holdersCache).map(([key, cache]) => [key, cache.data])),
    ),
  );

  const selectedMarket =
    markets.find((market) => market.conditionId === selectedMarketId) ?? markets[0];
  const selectedWallet =
    wallets.find((wallet) => wallet.address === selectedWalletAddress) ?? wallets[0];

  const handleWebsocketMessage = useEffectEvent((payload: unknown) => {
    const messages = Array.isArray(payload) ? payload : [payload];

    messages.forEach((message) => {
      if (!message || typeof message !== 'object') {
        return;
      }

      const record = message as Record<string, unknown>;
      if (!record.event_type) {
        return;
      }

      setTokenSnapshots((current) => applyWebsocketEvent(current, record));
      setWebsocketLog((current) => [createWebsocketLog(record), ...current].slice(0, 120));
    });
  });

  useEffect(() => {
    const assetIds = Array.from(
      new Set(marketEntries.flatMap((entry) => getMarketTokenIds(entry.market)).filter(Boolean)),
    );

    if (!assetIds.length) {
      return undefined;
    }

    let socket: WebSocket | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) {
        return;
      }

      setWebsocketStatus((current) => (current === 'live' ? 'reconnecting' : 'connecting'));
      socket = new WebSocket(MARKET_WS_URL);

      socket.onopen = () => {
        setWebsocketStatus('live');
        socket?.send(
          JSON.stringify({
            type: 'market',
            assets_ids: assetIds,
            custom_feature_enabled: true,
          }),
        );
      };

      socket.onmessage = (event) => {
        setWebsocketStatus('live');
        try {
          handleWebsocketMessage(JSON.parse(event.data));
        } catch {
          return;
        }
      };

      socket.onerror = () => {
        setWebsocketStatus('offline');
      };

      socket.onclose = () => {
        setWebsocketStatus('offline');

        if (!cancelled) {
          reconnectTimerRef.current = window.setTimeout(connect, 3_000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimerRef.current);
      socket?.close();
    };
  }, [marketEntries]);

  useEffect(() => {
    if (!selectedMarket) {
      return;
    }

    const cachedTrades = marketTradesCache[selectedMarket.conditionId];
    const needsTrades = !cachedTrades || Date.now() - cachedTrades.fetchedAt > DETAIL_TTL_MS;
    const cachedHolders = holdersCache[selectedMarket.conditionId];
    const needsHolders = !cachedHolders || Date.now() - cachedHolders.fetchedAt > DETAIL_TTL_MS;
    const primaryTokenId = selectedMarket.outcomes[0]?.assetId;
    const cachedHistory = primaryTokenId ? historyCache[primaryTokenId] : undefined;
    const needsHistory =
      Boolean(primaryTokenId) && (!cachedHistory || Date.now() - cachedHistory.fetchedAt > DETAIL_TTL_MS);

    if (!needsTrades && !needsHolders && !needsHistory) {
      return;
    }

    let active = true;

    (async () => {
      const now = Date.now();
      const updates = await Promise.allSettled([
        needsTrades ? fetchTradesForSingleMarket(selectedMarket.conditionId) : Promise.resolve(undefined),
        needsHolders ? fetchHoldersForMarket(selectedMarket.conditionId) : Promise.resolve(undefined),
        needsHistory && primaryTokenId ? fetchPriceHistory(primaryTokenId) : Promise.resolve(undefined),
      ]);

      if (!active) {
        return;
      }

      const [tradeResult, holderResult, historyResult] = updates;

      const nextTrades =
        tradeResult.status === 'fulfilled' && Array.isArray(tradeResult.value)
          ? tradeResult.value
          : undefined;
      const nextHolders =
        holderResult.status === 'fulfilled' &&
        holderResult.value &&
        typeof holderResult.value === 'object'
          ? holderResult.value
          : undefined;
      const nextHistory =
        historyResult.status === 'fulfilled' && Array.isArray(historyResult.value)
          ? historyResult.value
          : undefined;

      if (nextTrades) {
        setMarketTradesCache((current) => ({
          ...current,
          [selectedMarket.conditionId]: {
            data: nextTrades,
            fetchedAt: now,
          },
        }));
      }

      if (nextHolders) {
        setHoldersCache((current) => ({
          ...current,
          [selectedMarket.conditionId]: {
            data: nextHolders,
            fetchedAt: now,
          },
        }));
      }

      if (nextHistory && primaryTokenId) {
        setHistoryCache((current) => ({
          ...current,
          [primaryTokenId]: {
            data: nextHistory,
            fetchedAt: now,
          },
        }));
      }
    })();

    return () => {
      active = false;
    };
  }, [historyCache, holdersCache, marketTradesCache, selectedMarket]);

  useEffect(() => {
    if (!selectedWallet) {
      return;
    }

    const cachedWallet = walletDetailCache[selectedWallet.address];
    if (cachedWallet && Date.now() - cachedWallet.fetchedAt <= DETAIL_TTL_MS) {
      return;
    }

    let active = true;
    const trackedConditions = markets.map((market) => market.conditionId);

    (async () => {
      const [profile, activity, positions] = await Promise.all([
        fetchWalletProfile(selectedWallet.address),
        fetchWalletActivity(selectedWallet.address, trackedConditions),
        fetchWalletPositions(selectedWallet.address, trackedConditions),
      ]);

      if (!active) {
        return;
      }

      setWalletDetailCache((current) => ({
        ...current,
        [selectedWallet.address]: {
          data: {
            profile,
            activity,
            positions,
          },
          fetchedAt: Date.now(),
        },
      }));
    })();

    return () => {
      active = false;
    };
  }, [markets, selectedWallet, walletDetailCache]);

  return {
    markets,
    wallets,
    selectedMarket,
    selectedWallet,
    selectedMarketTrades: selectedMarket ? marketTradesCache[selectedMarket.conditionId]?.data ?? [] : [],
    selectedMarketHolders: selectedMarket ? holdersCache[selectedMarket.conditionId]?.data ?? {} : {},
    selectedPriceHistory:
      selectedMarket?.outcomes[0]?.assetId
        ? historyCache[selectedMarket.outcomes[0].assetId]?.data ?? []
        : [],
    selectedWalletDetail: selectedWallet
      ? walletDetailCache[selectedWallet.address]?.data
      : undefined,
    loading,
    refreshing,
    error,
    lastRestSync,
    websocketStatus,
    websocketLog,
  };
}
