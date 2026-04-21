export type TopicId = 'us-iran' | 'hormuz' | 'trump' | 'fed';

export interface GammaTag {
  id?: string | number;
  label?: string;
  slug?: string;
}

export interface GammaEvent {
  id?: string | number;
  title?: string;
  subtitle?: string;
  description?: string;
  slug?: string;
  category?: string;
  subcategory?: string;
  volume?: number;
  volume24hr?: number;
  liquidity?: number;
  openInterest?: number;
  image?: string;
  icon?: string;
  resolutionSource?: string;
  tags?: GammaTag[];
  [key: string]: unknown;
}

export interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  description?: string;
  category?: string;
  outcomes?: string | string[];
  outcomePrices?: string | string[];
  shortOutcomes?: string | string[];
  clobTokenIds?: string | string[];
  volume24hr?: number | string;
  volume?: number | string;
  volumeNum?: number;
  liquidity?: number | string;
  liquidityNum?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  image?: string;
  icon?: string;
  imageOptimized?: {
    imageUrlOptimized?: string;
  };
  iconOptimized?: {
    imageUrlOptimized?: string;
  };
  endDate?: string;
  startDate?: string;
  endDateIso?: string;
  startDateIso?: string;
  resolutionSource?: string;
  enableOrderBook?: boolean;
  orderPriceMinTickSize?: number;
  orderMinSize?: number;
  acceptingOrders?: boolean;
  events?: GammaEvent[];
  [key: string]: unknown;
}

export interface TopicDefinition {
  id: TopicId;
  label: string;
  description: string;
  accent: string;
  surface: string;
  keywords: string[];
  aliases: string[];
}

export interface TopicMatch {
  topicId: TopicId;
  score: number;
  matches: string[];
}

export interface TokenOrderBookLevel {
  price: string;
  size: string;
}

export interface TokenSnapshot {
  market?: string;
  assetId: string;
  bids: TokenOrderBookLevel[];
  asks: TokenOrderBookLevel[];
  tickSize?: string;
  minOrderSize?: string;
  negRisk?: boolean;
  hash?: string;
  bestBid?: string;
  bestAsk?: string;
  spread?: string;
  lastTradePrice?: string;
  lastTradeSide?: 'BUY' | 'SELL';
  lastTradeSize?: string;
  lastTradeTimestamp?: number;
  updatedAt?: number;
}

export interface MarketTrade {
  proxyWallet: string;
  side: 'BUY' | 'SELL';
  asset: string;
  conditionId: string;
  size: number;
  price: number;
  timestamp: number;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
  transactionHash?: string;
}

export interface HolderRecord {
  proxyWallet: string;
  bio?: string;
  asset?: string;
  pseudonym?: string;
  amount: number;
  displayUsernamePublic?: boolean;
  outcomeIndex?: number;
  name?: string;
  profileImage?: string;
  profileImageOptimized?: string;
}

export interface WalletActivityItem {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: string;
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
  price?: number;
  asset?: string;
  side?: 'BUY' | 'SELL';
  outcomeIndex?: number;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  name?: string;
  pseudonym?: string;
  bio?: string;
  profileImage?: string;
  profileImageOptimized?: string;
}

export interface WalletPosition {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size: number;
  avgPrice: number;
  initialValue: number;
  currentValue: number;
  cashPnl: number;
  percentPnl: number;
  totalBought: number;
  realizedPnl: number;
  percentRealizedPnl: number;
  curPrice: number;
  redeemable: boolean;
  mergeable: boolean;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
  negativeRisk?: boolean;
}

export interface WalletProfile {
  createdAt?: string | null;
  proxyWallet?: string | null;
  profileImage?: string | null;
  displayUsernamePublic?: boolean | null;
  bio?: string | null;
  pseudonym?: string | null;
  name?: string | null;
  xUsername?: string | null;
  verifiedBadge?: boolean | null;
}

export interface PriceHistoryPoint {
  t: number;
  p: number;
}

export interface WalletInsight {
  address: string;
  displayName: string;
  avatar?: string;
  anomalyScore: number;
  totalNotional: number;
  largestTradeNotional: number;
  buyNotional: number;
  sellNotional: number;
  tradeCount: number;
  marketsTraded: number;
  lastSeen: number;
  latestAction?: MarketTrade;
  marketExposureIds: string[];
  signals: string[];
  isTopHolder: boolean;
  oiImpact: number;
  trades: MarketTrade[];
}

export interface DetailCache<T> {
  data: T;
  fetchedAt: number;
}

export interface WalletDetail {
  profile: WalletProfile | null;
  activity: WalletActivityItem[];
  positions: WalletPosition[];
}

export interface WebsocketLogEntry {
  key: string;
  marketId?: string;
  assetId?: string;
  eventType: string;
  timestamp: number;
  payload: unknown;
}

export interface OutcomeState {
  index: number;
  label: string;
  shortLabel: string;
  assetId?: string;
  gammaPrice?: number;
  book?: TokenSnapshot;
  bestBid?: number;
  bestAsk?: number;
  midpoint?: number;
  spread?: number;
  lastTradePrice?: number;
  lastTradeSide?: 'BUY' | 'SELL';
  displayPrice?: number;
  displayMode: 'midpoint' | 'last_trade' | 'gamma';
}

export interface TrackedMarket {
  id: string;
  conditionId: string;
  question: string;
  slug: string;
  description: string;
  category: string;
  eventTitle: string;
  eventSlug: string;
  image: string;
  icon: string;
  endDate?: string;
  startDate?: string;
  volume24hr: number;
  volume: number;
  liquidity: number;
  openInterest: number;
  resolutionSource?: string;
  active: boolean;
  closed: boolean;
  acceptingOrders: boolean;
  enableOrderBook: boolean;
  rawGamma: GammaMarket;
  topics: TopicMatch[];
  outcomes: OutcomeState[];
  flaggedWalletAddresses: string[];
  wsEvents: WebsocketLogEntry[];
}
