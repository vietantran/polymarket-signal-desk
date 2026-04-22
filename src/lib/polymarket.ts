import { buildMarketUrl, chunkArray, getMarketImage, getPrimaryEvent, parseJsonArray, toNumber } from './formatters';
import type {
  DetailCache,
  GammaMarket,
  HolderRecord,
  MarketTrade,
  OutcomeState,
  PriceHistoryPoint,
  TokenOrderBookLevel,
  TokenSnapshot,
  TopicMatch,
  TrackedMarket,
  WalletActivityItem,
  WalletPosition,
  WalletProfile,
  WebsocketLogEntry,
} from '../types/polymarket';

const API_BASES = {
  gamma: import.meta.env.VITE_GAMMA_API_BASE_URL || '/api/gamma',
  data: import.meta.env.VITE_DATA_API_BASE_URL || '/api/data',
  clob: import.meta.env.VITE_CLOB_API_BASE_URL || '/api/clob',
};

export const MARKET_WS_URL =
  import.meta.env.VITE_POLYMARKET_MARKET_WS_URL ||
  'wss://ws-subscriptions-clob.polymarket.com/ws/market';

const DISCOVERY_PAGE_SIZE = 200;
const DISCOVERY_MAX_PAGES = 8;
const ORDERBOOK_CONCURRENCY = 12;

async function fetchJson<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${message.slice(0, 180)}`);
  }

  return (await response.json()) as T;
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  limit: number,
  worker: (item: TInput) => Promise<TOutput>,
) {
  const results: TOutput[] = [];
  let nextIndex = 0;

  async function consume() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await worker(items[index]);
      results[index] = result;
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

export async function fetchRelevantGammaMarkets() {
  const markets: GammaMarket[] = [];

  for (let page = 0; page < DISCOVERY_MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      active: 'true',
      closed: 'false',
      limit: String(DISCOVERY_PAGE_SIZE),
      offset: String(page * DISCOVERY_PAGE_SIZE),
      order: 'volume24hr',
      ascending: 'false',
    });

    const batch = await fetchJson<GammaMarket[]>(`${API_BASES.gamma}/markets?${params.toString()}`);
    markets.push(...batch);

    if (batch.length < DISCOVERY_PAGE_SIZE) {
      break;
    }
  }

  return markets;
}

export function getMarketTokenIds(market: GammaMarket) {
  return parseJsonArray(market.clobTokenIds);
}

export function getMarketOutcomeLabels(market: GammaMarket) {
  const outcomes = parseJsonArray(market.outcomes);
  const shortOutcomes = parseJsonArray(market.shortOutcomes);

  return outcomes.map((label, index) => ({
    label,
    shortLabel: shortOutcomes[index] || label,
  }));
}

export function getMarketOutcomePrices(market: GammaMarket) {
  return parseJsonArray(market.outcomePrices).map((value) => Number(value));
}

export async function fetchOrderBooks(tokenIds: string[]) {
  const uniqueTokenIds = Array.from(new Set(tokenIds.filter(Boolean)));
  const snapshots = await mapWithConcurrency(uniqueTokenIds, ORDERBOOK_CONCURRENCY, async (tokenId) => {
    try {
      const params = new URLSearchParams({ token_id: tokenId });
      const response = await fetchJson<{
        market?: string;
        asset_id?: string;
        timestamp?: string;
        hash?: string;
        bids?: TokenOrderBookLevel[];
        asks?: TokenOrderBookLevel[];
        min_order_size?: string;
        tick_size?: string;
        neg_risk?: boolean;
        last_trade_price?: string;
      }>(`${API_BASES.clob}/book?${params.toString()}`);

      return [
        tokenId,
        {
          market: response.market,
          assetId: response.asset_id || tokenId,
          bids: response.bids ?? [],
          asks: response.asks ?? [],
          tickSize: response.tick_size,
          minOrderSize: response.min_order_size,
          negRisk: response.neg_risk,
          hash: response.hash,
          bestBid: response.bids?.[0]?.price,
          bestAsk: response.asks?.[0]?.price,
          lastTradePrice: response.last_trade_price,
          updatedAt: response.timestamp ? new Date(response.timestamp).getTime() : Date.now(),
        } satisfies TokenSnapshot,
      ] as const;
    } catch {
      return [tokenId, undefined] as const;
    }
  });

  return snapshots.reduce<Record<string, TokenSnapshot>>((collection, [tokenId, snapshot]) => {
    if (snapshot) {
      collection[tokenId] = snapshot;
    }

    return collection;
  }, {});
}

export async function fetchOpenInterest(conditionIds: string[]) {
  const openInterestByCondition: Record<string, number> = {};

  const chunks = chunkArray(conditionIds, 40);
  for (const chunk of chunks) {
    const params = new URLSearchParams();
    params.set('market', chunk.join(','));

    const response = await fetchJson<Array<{ market: string; value: number }>>(
      `${API_BASES.data}/oi?${params.toString()}`,
    );

    response.forEach((entry) => {
      openInterestByCondition[entry.market] = entry.value;
    });
  }

  return openInterestByCondition;
}

export async function fetchTradesForMarkets(conditionIds: string[]) {
  const allTrades: MarketTrade[] = [];
  const chunks = chunkArray(conditionIds, 10);

  for (const chunk of chunks) {
    const params = new URLSearchParams({
      limit: '500',
      offset: '0',
      market: chunk.join(','),
    });

    try {
      const response = await fetchJson<MarketTrade[]>(`${API_BASES.data}/trades?${params.toString()}`);
      allTrades.push(...response);
    } catch {
      continue;
    }
  }

  return allTrades;
}

export async function fetchTradesForSingleMarket(conditionId: string) {
  const params = new URLSearchParams({
    market: conditionId,
    limit: '150',
    offset: '0',
  });

  return fetchJson<MarketTrade[]>(`${API_BASES.data}/trades?${params.toString()}`);
}

export async function fetchHoldersForMarket(conditionId: string) {
  const params = new URLSearchParams({
    market: conditionId,
    limit: '20',
  });

  const response = await fetchJson<Array<{ token: string; holders: HolderRecord[] }>>(
    `${API_BASES.data}/holders?${params.toString()}`,
  );

  return response.reduce<Record<string, HolderRecord[]>>((collection, entry) => {
    collection[entry.token] = entry.holders ?? [];
    return collection;
  }, {});
}

export async function fetchPriceHistory(tokenId: string) {
  const params = new URLSearchParams({
    market: tokenId,
    interval: '1d',
    fidelity: '30',
  });

  const response = await fetchJson<{ history: PriceHistoryPoint[] }>(
    `${API_BASES.clob}/prices-history?${params.toString()}`,
  );

  return response.history ?? [];
}

export async function fetchWalletActivity(address: string, conditionIds: string[]) {
  const params = new URLSearchParams({
    user: address,
    limit: '120',
    offset: '0',
  });

  if (conditionIds.length && conditionIds.join(',').length < 1500) {
    params.set('market', conditionIds.join(','));
  }

  return fetchJson<WalletActivityItem[]>(`${API_BASES.data}/activity?${params.toString()}`);
}

export async function fetchWalletPositions(address: string, conditionIds: string[]) {
  const params = new URLSearchParams({
    user: address,
    limit: '100',
    offset: '0',
  });

  if (conditionIds.length && conditionIds.join(',').length < 1500) {
    params.set('market', conditionIds.join(','));
  }

  return fetchJson<WalletPosition[]>(`${API_BASES.data}/positions?${params.toString()}`);
}

export async function fetchWalletProfile(address: string) {
  try {
    const params = new URLSearchParams({ address });
    return await fetchJson<WalletProfile>(`${API_BASES.gamma}/public-profile?${params.toString()}`);
  } catch {
    return null;
  }
}

function updatePriceLevel(
  levels: TokenOrderBookLevel[],
  nextLevel: TokenOrderBookLevel,
  side: 'BUY' | 'SELL',
) {
  const nextPrice = Number(nextLevel.price);
  const nextSize = Number(nextLevel.size);
  const remainingLevels = levels.filter((level) => Number(level.price) !== nextPrice);

  if (nextSize > 0) {
    remainingLevels.push(nextLevel);
  }

  const sorted = remainingLevels.sort((left, right) => {
    const leftPrice = Number(left.price);
    const rightPrice = Number(right.price);
    return side === 'BUY' ? rightPrice - leftPrice : leftPrice - rightPrice;
  });

  return sorted.slice(0, 15);
}

export function applyWebsocketEvent(
  current: Record<string, TokenSnapshot>,
  message: Record<string, unknown>,
) {
  const eventType = String(message.event_type ?? '');
  const assetId = String(message.asset_id ?? '');

  if (!eventType || !assetId) {
    return current;
  }

  const existing = current[assetId] ?? {
    assetId,
    bids: [],
    asks: [],
  };

  if (eventType === 'book') {
    return {
      ...current,
      [assetId]: {
        ...existing,
        market: String(message.market ?? existing.market ?? ''),
        assetId,
        bids: (message.bids as TokenOrderBookLevel[]) ?? [],
        asks: (message.asks as TokenOrderBookLevel[]) ?? [],
        hash: typeof message.hash === 'string' ? message.hash : existing.hash,
        updatedAt: Number(message.timestamp ?? Date.now()),
      },
    };
  }

  if (eventType === 'price_change') {
    const updates = (message.price_changes as Array<Record<string, string>>) ?? [];
    const relevantUpdates = updates.filter((update) => String(update.asset_id) === assetId);

    if (!relevantUpdates.length) {
      return current;
    }

    let nextSnapshot = { ...existing };
    relevantUpdates.forEach((update) => {
      if (update.side === 'BUY') {
        nextSnapshot = {
          ...nextSnapshot,
          bids: updatePriceLevel(
            nextSnapshot.bids,
            { price: update.price, size: update.size },
            'BUY',
          ),
          bestBid: update.best_bid ?? nextSnapshot.bestBid,
          bestAsk: update.best_ask ?? nextSnapshot.bestAsk,
        };
      } else {
        nextSnapshot = {
          ...nextSnapshot,
          asks: updatePriceLevel(
            nextSnapshot.asks,
            { price: update.price, size: update.size },
            'SELL',
          ),
          bestBid: update.best_bid ?? nextSnapshot.bestBid,
          bestAsk: update.best_ask ?? nextSnapshot.bestAsk,
        };
      }
    });

    return {
      ...current,
      [assetId]: {
        ...nextSnapshot,
        updatedAt: Number(message.timestamp ?? Date.now()),
      },
    };
  }

  if (eventType === 'last_trade_price') {
    return {
      ...current,
      [assetId]: {
        ...existing,
        market: String(message.market ?? existing.market ?? ''),
        lastTradePrice: String(message.price ?? existing.lastTradePrice ?? ''),
        lastTradeSize: String(message.size ?? existing.lastTradeSize ?? ''),
        lastTradeSide:
          message.side === 'BUY' || message.side === 'SELL'
            ? (message.side as 'BUY' | 'SELL')
            : existing.lastTradeSide,
        lastTradeTimestamp: Number(message.timestamp ?? Date.now()),
        updatedAt: Number(message.timestamp ?? Date.now()),
      },
    };
  }

  if (eventType === 'tick_size_change') {
    return {
      ...current,
      [assetId]: {
        ...existing,
        tickSize: String(message.new_tick_size ?? existing.tickSize ?? ''),
        updatedAt: Number(message.timestamp ?? Date.now()),
      },
    };
  }

  if (eventType === 'best_bid_ask') {
    return {
      ...current,
      [assetId]: {
        ...existing,
        market: String(message.market ?? existing.market ?? ''),
        bestBid: String(message.best_bid ?? existing.bestBid ?? ''),
        bestAsk: String(message.best_ask ?? existing.bestAsk ?? ''),
        spread: String(message.spread ?? existing.spread ?? ''),
        updatedAt: Number(message.timestamp ?? Date.now()),
      },
    };
  }

  return current;
}

function deriveOutcomeState(
  label: string,
  shortLabel: string,
  index: number,
  assetId: string | undefined,
  gammaPrice: number,
  snapshot: TokenSnapshot | undefined,
): OutcomeState {
  const bestBid = toNumber(snapshot?.bestBid || snapshot?.bids?.[0]?.price);
  const bestAsk = toNumber(snapshot?.bestAsk || snapshot?.asks?.[0]?.price);
  const midpoint = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  const spread = bestBid && bestAsk ? bestAsk - bestBid : toNumber(snapshot?.spread);
  const lastTradePrice = toNumber(snapshot?.lastTradePrice);
  const gammaFallback = gammaPrice > 0 ? gammaPrice : undefined;

  let displayPrice = gammaFallback;
  let displayMode: OutcomeState['displayMode'] = 'gamma';

  if (midpoint && spread <= 0.1) {
    displayPrice = midpoint;
    displayMode = 'midpoint';
  } else if (lastTradePrice) {
    displayPrice = lastTradePrice;
    displayMode = 'last_trade';
  }

  return {
    index,
    label,
    shortLabel,
    assetId,
    gammaPrice: gammaFallback,
    book: snapshot,
    bestBid: bestBid || undefined,
    bestAsk: bestAsk || undefined,
    midpoint: midpoint || undefined,
    spread: spread || undefined,
    lastTradePrice: lastTradePrice || undefined,
    lastTradeSide: snapshot?.lastTradeSide,
    displayPrice,
    displayMode,
  };
}

export function buildTrackedMarkets(
  entries: Array<{ market: GammaMarket; topics: TopicMatch[] }>,
  tokenSnapshots: Record<string, TokenSnapshot>,
  openInterestByCondition: Record<string, number>,
  flaggedWalletsByCondition: Record<string, string[]>,
  websocketLogs: WebsocketLogEntry[],
) {
  return entries.map(({ market, topics }) => {
    const event = getPrimaryEvent(market);
    const image = getMarketImage(market);
    const tokenIds = getMarketTokenIds(market);
    const outcomeLabels = getMarketOutcomeLabels(market);
    const outcomePrices = getMarketOutcomePrices(market);
    const outcomes = outcomeLabels.map((outcome, index) =>
      deriveOutcomeState(
        outcome.label,
        outcome.shortLabel,
        index,
        tokenIds[index],
        outcomePrices[index],
        tokenIds[index] ? tokenSnapshots[tokenIds[index]] : undefined,
      ),
    );

    const marketLogs = websocketLogs.filter(
      (log) => log.marketId === market.conditionId || tokenIds.includes(log.assetId ?? ''),
    );

    return {
      id: market.id,
      conditionId: market.conditionId,
      question: market.question,
      slug: market.slug,
      description: market.description || '',
      category: event?.category || market.category || 'Politics',
      eventTitle: event?.title || market.question,
      eventSlug: event?.slug || market.slug,
      image,
      icon: image,
      endDate: market.endDateIso || market.endDate,
      startDate: market.startDateIso || market.startDate,
      volume24hr: toNumber(market.volume24hr),
      volume: toNumber(market.volumeNum || market.volume),
      liquidity: toNumber(market.liquidityNum || market.liquidity),
      openInterest: openInterestByCondition[market.conditionId] ?? 0,
      resolutionSource: market.resolutionSource || event?.resolutionSource,
      active: Boolean(market.active),
      closed: Boolean(market.closed),
      acceptingOrders: Boolean(market.acceptingOrders ?? market.active),
      enableOrderBook: Boolean(market.enableOrderBook),
      rawGamma: market,
      topics,
      outcomes,
      flaggedWalletAddresses: flaggedWalletsByCondition[market.conditionId] ?? [],
      wsEvents: marketLogs.slice(0, 10),
    } satisfies TrackedMarket;
  });
}

export function groupTradesByCondition(trades: MarketTrade[]) {
  return trades.reduce<Record<string, MarketTrade[]>>((collection, trade) => {
    const current = collection[trade.conditionId] ?? [];
    current.push(trade);
    collection[trade.conditionId] = current.sort((left, right) => right.timestamp - left.timestamp).slice(0, 120);
    return collection;
  }, {});
}

export function buildInitialTradeCache(
  trades: MarketTrade[],
): Record<string, DetailCache<MarketTrade[]>> {
  const grouped = groupTradesByCondition(trades);
  const now = Date.now();

  return Object.entries(grouped).reduce<Record<string, DetailCache<MarketTrade[]>>>(
    (collection, [conditionId, groupedTrades]) => {
      collection[conditionId] = {
        data: groupedTrades,
        fetchedAt: now,
      };
      return collection;
    },
    {},
  );
}

export function createWebsocketLog(message: Record<string, unknown>) {
  const eventType = String(message.event_type ?? 'unknown');
  const timestamp = Number(message.timestamp ?? Date.now());
  const assetId = typeof message.asset_id === 'string' ? message.asset_id : undefined;
  const marketId = typeof message.market === 'string' ? message.market : undefined;

  return {
    key: `${eventType}-${assetId ?? 'na'}-${timestamp}`,
    marketId,
    assetId,
    eventType,
    timestamp,
    payload: message,
  } satisfies WebsocketLogEntry;
}

export function marketHref(market: GammaMarket) {
  return buildMarketUrl(market);
}
