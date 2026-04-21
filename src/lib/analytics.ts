import { TOPIC_DEFINITIONS } from '../config/topics';
import { clamp, normalizeText } from './formatters';
import type {
  GammaMarket,
  HolderRecord,
  MarketTrade,
  TopicMatch,
  TrackedMarket,
  WalletInsight,
} from '../types/polymarket';

function buildSearchText(market: GammaMarket) {
  const eventText =
    market.events
      ?.map((event) =>
        [
          event.title,
          event.subtitle,
          event.description,
          event.slug,
          event.category,
          event.subcategory,
          ...(event.tags?.flatMap((tag) => [tag.label, tag.slug]) ?? []),
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join(' ') ?? '';

  return normalizeText(
    [
      market.question,
      market.description,
      market.slug,
      market.category,
      eventText,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

export function classifyMarket(market: GammaMarket): TopicMatch[] {
  const searchText = buildSearchText(market);
  const matches: TopicMatch[] = [];

  for (const topic of TOPIC_DEFINITIONS) {
    const hits = [...topic.keywords, ...topic.aliases].filter((keyword) =>
      searchText.includes(normalizeText(keyword)),
    );

    if (!hits.length) {
      continue;
    }

    const topicScore = hits.reduce((score, keyword) => score + (keyword.length > 8 ? 2 : 1), 0);
    matches.push({
      topicId: topic.id,
      score: topicScore,
      matches: Array.from(new Set(hits)).slice(0, 5),
    });
  }

  return matches.sort((left, right) => right.score - left.score);
}

function percentile(values: number[], ratio: number) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = clamp(ratio, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) {
    return sorted[lower];
  }

  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function scale(value: number, floor: number, ceiling: number) {
  if (ceiling <= floor) {
    return value > floor ? 1 : 0;
  }

  return clamp((value - floor) / (ceiling - floor), 0, 1);
}

export function scoreWallets(
  trades: MarketTrade[],
  openInterestByCondition: Record<string, number>,
  holderIndex: Record<string, HolderRecord[]>,
): WalletInsight[] {
  const tradesByWallet = new Map<string, MarketTrade[]>();
  const notionals = trades.map((trade) => trade.size * trade.price);

  for (const trade of trades) {
    const current = tradesByWallet.get(trade.proxyWallet) ?? [];
    current.push(trade);
    tradesByWallet.set(trade.proxyWallet, current);
  }

  const largeTradeThreshold = percentile(notionals, 0.95);
  const totalTradeThreshold = percentile(
    Array.from(tradesByWallet.values()).map((walletTrades) =>
      walletTrades.reduce((total, trade) => total + trade.size * trade.price, 0),
    ),
    0.9,
  );

  const holderAddresses = new Set<string>();
  Object.values(holderIndex).forEach((holders) => {
    holders.forEach((holder) => holderAddresses.add(holder.proxyWallet));
  });

  const insights: WalletInsight[] = [];

  for (const [address, walletTrades] of tradesByWallet.entries()) {
    const sortedTrades = [...walletTrades].sort((left, right) => right.timestamp - left.timestamp);
    const marketExposureIds = Array.from(new Set(sortedTrades.map((trade) => trade.conditionId)));
    const totalNotional = sortedTrades.reduce(
      (total, trade) => total + trade.size * trade.price,
      0,
    );
    const buyNotional = sortedTrades
      .filter((trade) => trade.side === 'BUY')
      .reduce((total, trade) => total + trade.size * trade.price, 0);
    const sellNotional = sortedTrades
      .filter((trade) => trade.side === 'SELL')
      .reduce((total, trade) => total + trade.size * trade.price, 0);
    const largestTradeNotional = Math.max(
      ...sortedTrades.map((trade) => trade.size * trade.price),
      0,
    );
    const oiImpact = sortedTrades.reduce((highest, trade) => {
      const tradeNotional = trade.size * trade.price;
      const openInterest = openInterestByCondition[trade.conditionId];

      if (!openInterest) {
        return highest;
      }

      return Math.max(highest, tradeNotional / openInterest);
    }, 0);

    const buckets = new Map<number, number>();
    sortedTrades.forEach((trade) => {
      const bucketKey = Math.floor(trade.timestamp / (15 * 60 * 1000));
      const currentValue = buckets.get(bucketKey) ?? 0;
      buckets.set(bucketKey, currentValue + trade.size * trade.price);
    });

    const maxBucket = Math.max(...buckets.values(), 0);
    const averageBucket = buckets.size ? totalNotional / buckets.size : totalNotional;
    const burstFactor = averageBucket ? maxBucket / averageBucket : 0;

    const score =
      scale(totalNotional, totalTradeThreshold * 0.5, totalTradeThreshold * 2.5) * 40 +
      scale(largestTradeNotional, largeTradeThreshold * 0.5, largeTradeThreshold * 2.5) * 30 +
      scale(oiImpact, 0.01, 0.15) * 20 +
      scale(marketExposureIds.length, 2, 8) * 5 +
      scale(burstFactor, 1.2, 4) * 5;

    const signals: string[] = [];

    if (largestTradeNotional >= largeTradeThreshold) {
      signals.push('large single print');
    }

    if (totalNotional >= totalTradeThreshold) {
      signals.push('high aggregate notional');
    }

    if (oiImpact >= 0.05) {
      signals.push('notable OI impact');
    }

    if (burstFactor >= 2) {
      signals.push('clustered burst activity');
    }

    if (holderAddresses.has(address)) {
      signals.push('appears in top holder set');
    }

    if (score < 35 && signals.length < 2) {
      continue;
    }

    const latestAction = sortedTrades[0];
    insights.push({
      address,
      displayName:
        latestAction.name || latestAction.pseudonym || `${address.slice(0, 6)}…${address.slice(-4)}`,
      avatar: latestAction.profileImageOptimized || latestAction.profileImage,
      anomalyScore: Math.round(score),
      totalNotional,
      largestTradeNotional,
      buyNotional,
      sellNotional,
      tradeCount: sortedTrades.length,
      marketsTraded: marketExposureIds.length,
      lastSeen: latestAction.timestamp,
      latestAction,
      marketExposureIds,
      signals,
      isTopHolder: holderAddresses.has(address),
      oiImpact,
      trades: sortedTrades,
    });
  }

  return insights.sort((left, right) => right.anomalyScore - left.anomalyScore);
}

export function buildHolderIndex(
  holdersByCondition: Record<string, Record<string, HolderRecord[]>>,
) {
  const holderIndex: Record<string, HolderRecord[]> = {};

  Object.values(holdersByCondition).forEach((tokenMap) => {
    Object.values(tokenMap).forEach((holders) => {
      holders.forEach((holder) => {
        const current = holderIndex[holder.proxyWallet] ?? [];
        current.push(holder);
        holderIndex[holder.proxyWallet] = current;
      });
    });
  });

  return holderIndex;
}

export function filterMarketsForTopics(markets: TrackedMarket[], topicIds: Set<string>, query: string) {
  const normalizedQuery = normalizeText(query);

  return markets.filter((market) => {
    const topicMatch = !topicIds.size || market.topics.some((topic) => topicIds.has(topic.topicId));

    if (!topicMatch) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const text = normalizeText(
      [market.question, market.description, market.eventTitle, market.slug].join(' '),
    );

    return text.includes(normalizedQuery);
  });
}
