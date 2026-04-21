import { useDeferredValue, useState, useTransition, type CSSProperties, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CandlestickChart,
  Clock3,
  Database,
  DollarSign,
  Eye,
  RefreshCw,
  ShieldAlert,
  Signal,
  TrendingUp,
  Waves,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { clsx } from 'clsx';
import { TOPIC_DEFINITIONS } from './config/topics';
import { filterMarketsForTopics } from './lib/analytics';
import {
  buildMarketUrl,
  formatCompactUsd,
  formatCount,
  formatDateTime,
  formatProbability,
  formatRelativeTime,
  formatSignedPercent,
  safeJson,
  shortAddress,
  sortHistory,
} from './lib/formatters';
import { usePolymarketDashboard } from './hooks/usePolymarketDashboard';
import type {
  HolderRecord,
  MarketTrade,
  OutcomeState,
  PriceHistoryPoint,
  TrackedMarket,
  WalletActivityItem,
  WalletDetail as WalletDetailData,
  WalletInsight,
  WalletPosition,
} from './types/polymarket';

function App() {
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>(
    TOPIC_DEFINITIONS.map((topic) => topic.id),
  );
  const [selectedMarketId, setSelectedMarketId] = useState<string>();
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string>();
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'oi' | 'freshness'>('volume');
  const [isPending, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(searchText);

  const {
    markets,
    wallets,
    selectedMarket,
    selectedWallet,
    selectedMarketTrades,
    selectedMarketHolders,
    selectedPriceHistory,
    selectedWalletDetail,
    loading,
    refreshing,
    error,
    lastRestSync,
    websocketStatus,
    websocketLog,
  } = usePolymarketDashboard(selectedMarketId, selectedWalletAddress);

  const activeTopicSet = new Set(selectedTopicIds);
  const filteredMarkets = filterMarketsForTopics(markets, activeTopicSet, deferredSearch).sort(
    (left, right) => {
      if (sortBy === 'oi') {
        return right.openInterest - left.openInterest;
      }

      if (sortBy === 'freshness') {
        const leftTimestamp = left.outcomes[0]?.book?.updatedAt ?? 0;
        const rightTimestamp = right.outcomes[0]?.book?.updatedAt ?? 0;
        return rightTimestamp - leftTimestamp;
      }

      return right.volume24hr - left.volume24hr;
    },
  );

  const effectiveSelectedMarket =
    filteredMarkets.find((market) => market.conditionId === selectedMarket?.conditionId) ??
    filteredMarkets[0];
  const effectiveSelectedWallet =
    wallets.find((wallet) => wallet.address === selectedWallet?.address) ?? wallets[0];

  const totalOpenInterest = filteredMarkets.reduce((sum, market) => sum + market.openInterest, 0);
  const totalVolume24hr = filteredMarkets.reduce((sum, market) => sum + market.volume24hr, 0);
  const eventCount = new Set(filteredMarkets.map((market) => market.eventSlug)).size;

  function toggleTopic(topicId: string) {
    startTransition(() => {
      setSelectedTopicIds((current) => {
        if (current.includes(topicId)) {
          if (current.length === 1) {
            return current;
          }

          return current.filter((item) => item !== topicId);
        }

        return [...current, topicId];
      });
    });
  }

  return (
    <div className="shell">
      <header className="hero">
        <div className="hero__copy">
          <div className="eyebrow">Polymarket Signal Desk</div>
          <h1>US-Iran, Hormuz, Trump, and Fed markets in one live operating picture.</h1>
          <p className="hero__lede">
            Gamma discovery, CLOB live order books, websocket event flow, and wallet anomaly
            tracking from the Data API.
          </p>
          <div className="hero__status">
            <StatusChip
              label="WebSocket"
              value={websocketStatus}
              tone={
                websocketStatus === 'live'
                  ? 'good'
                  : websocketStatus === 'connecting'
                    ? 'warn'
                    : 'bad'
              }
            />
            <StatusChip
              label="REST sync"
              value={lastRestSync ? formatRelativeTime(lastRestSync) : 'syncing'}
            />
            <StatusChip label="Filter latency" value={isPending ? 'updating' : 'stable'} />
          </div>
        </div>

        <div className="hero__radar">
          <div className="radar__ring radar__ring--one" />
          <div className="radar__ring radar__ring--two" />
          <div className="radar__node">
            <Signal size={22} />
            <span>{formatCount(filteredMarkets.length)} markets</span>
          </div>
          <div className="radar__node radar__node--wallet">
            <ShieldAlert size={20} />
            <span>{formatCount(wallets.length)} flagged wallets</span>
          </div>
        </div>
      </header>

      <section className="summary-grid">
        <MetricCard
          icon={<CandlestickChart size={18} />}
          label="Tracked markets"
          value={formatCount(filteredMarkets.length)}
        />
        <MetricCard
          icon={<Database size={18} />}
          label="Distinct events"
          value={formatCount(eventCount)}
        />
        <MetricCard
          icon={<DollarSign size={18} />}
          label="24h volume"
          value={formatCompactUsd(totalVolume24hr)}
        />
        <MetricCard
          icon={<TrendingUp size={18} />}
          label="Open interest"
          value={formatCompactUsd(totalOpenInterest)}
        />
        <MetricCard
          icon={<Activity size={18} />}
          label="Wallet anomalies"
          value={formatCount(wallets.length)}
        />
        <MetricCard
          icon={<RefreshCw size={18} />}
          label="Data status"
          value={refreshing ? 'Refreshing' : loading ? 'Loading' : 'Stable'}
        />
      </section>

      <section className="control-panel">
        <div className="topic-cluster">
          {TOPIC_DEFINITIONS.map((topic) => {
            const isActive = selectedTopicIds.includes(topic.id);

            return (
              <button
                key={topic.id}
                type="button"
                className={clsx('topic-card', isActive && 'topic-card--active')}
                style={
                  {
                    '--topic-accent': topic.accent,
                    '--topic-surface': topic.surface,
                  } as CSSProperties
                }
                onClick={() => toggleTopic(topic.id)}
              >
                <span className="topic-card__label">{topic.label}</span>
                <span className="topic-card__description">{topic.description}</span>
              </button>
            );
          })}
        </div>

        <div className="toolbar">
          <input
            className="toolbar__search"
            value={searchText}
            onChange={(event) => {
              const { value } = event.target;
              startTransition(() => setSearchText(value));
            }}
            placeholder="Filter markets by question, event, or slug"
          />

          <select
            className="toolbar__select"
            value={sortBy}
            onChange={(event) =>
              setSortBy(event.target.value as 'volume' | 'oi' | 'freshness')
            }
          >
            <option value="volume">Sort by 24h volume</option>
            <option value="oi">Sort by open interest</option>
            <option value="freshness">Sort by freshest flow</option>
          </select>
        </div>
      </section>

      {error ? (
        <section className="alert alert--error">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </section>
      ) : null}

      <main className="main-grid">
        <section className="panel">
          <div className="panel__header">
            <h2>Market Board</h2>
            <span className="panel__caption">
              Live website parity plus Gamma, CLOB, and websocket context.
            </span>
          </div>

          <div className="market-list">
            {filteredMarkets.map((market) => (
              <button
                key={market.conditionId}
                type="button"
                className={clsx(
                  'market-card',
                  effectiveSelectedMarket?.conditionId === market.conditionId &&
                    'market-card--active',
                )}
                onClick={() => setSelectedMarketId(market.conditionId)}
              >
                <div className="market-card__head">
                  <div>
                    <div className="market-card__topics">
                      {market.topics.map((topic) => {
                        const definition = TOPIC_DEFINITIONS.find(
                          (item) => item.id === topic.topicId,
                        );

                        return definition ? (
                          <span
                            key={topic.topicId}
                            className="topic-pill"
                            style={
                              {
                                '--topic-accent': definition.accent,
                                '--topic-surface': definition.surface,
                              } as CSSProperties
                            }
                          >
                            {definition.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                    <h3>{market.question}</h3>
                    <p>{market.eventTitle}</p>
                  </div>

                  <div className="market-card__timing">
                    <Clock3 size={14} />
                    <span>{market.endDate ? formatRelativeTime(market.endDate) : 'live'}</span>
                  </div>
                </div>

                <div className="market-card__pricing">
                  {market.outcomes.map((outcome) => (
                    <PriceBlock key={outcome.index} outcome={outcome} />
                  ))}
                </div>

                <div className="market-card__metrics">
                  <span>24h {formatCompactUsd(market.volume24hr)}</span>
                  <span>OI {formatCompactUsd(market.openInterest)}</span>
                  <span>Spread {formatProbability(market.outcomes[0]?.spread)}</span>
                  <span>{market.flaggedWalletAddresses.length} notable wallets</span>
                </div>
              </button>
            ))}

            {!filteredMarkets.length && !loading ? (
              <div className="empty-state">
                <Waves size={22} />
                <p>No markets match the current topic set and search filter.</p>
              </div>
            ) : null}
          </div>
        </section>

        <section className="panel panel--detail">
          <div className="panel__header">
            <h2>Selected Market</h2>
            <span className="panel__caption">
              Order book, trade tape, holder concentration, history, and raw payloads.
            </span>
          </div>

          {effectiveSelectedMarket ? (
            <MarketDetail
              market={effectiveSelectedMarket}
              trades={selectedMarketTrades}
              holders={selectedMarketHolders}
              history={selectedPriceHistory}
            />
          ) : (
            <div className="empty-state">
              <Eye size={22} />
              <p>Select a market to inspect the full live payload.</p>
            </div>
          )}
        </section>
      </main>

      <section className="panel wallet-panel">
        <div className="panel__header">
          <h2>Wallet Radar</h2>
          <span className="panel__caption">
            Abnormal or large trading clusters identified from the Data API trade stream.
          </span>
        </div>

        <div className="wallet-grid">
          <div className="wallet-list">
            {wallets.map((wallet) => (
              <button
                key={wallet.address}
                type="button"
                className={clsx(
                  'wallet-card',
                  effectiveSelectedWallet?.address === wallet.address &&
                    'wallet-card--active',
                )}
                onClick={() => setSelectedWalletAddress(wallet.address)}
              >
                <div className="wallet-card__row">
                  <strong>{wallet.displayName}</strong>
                  <span className="wallet-score">{wallet.anomalyScore}</span>
                </div>
                <div className="wallet-card__meta">
                  <span>{shortAddress(wallet.address)}</span>
                  <span>{formatRelativeTime(wallet.lastSeen)}</span>
                </div>
                <div className="wallet-card__meta">
                  <span>Notional {formatCompactUsd(wallet.totalNotional)}</span>
                  <span>Markets {wallet.marketsTraded}</span>
                </div>
                <div className="wallet-signals">
                  {wallet.signals.slice(0, 3).map((signal) => (
                    <span key={signal} className="signal-pill">
                      {signal}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="wallet-detail">
            {effectiveSelectedWallet ? (
              <WalletDetailPanel
                wallet={effectiveSelectedWallet}
                detail={selectedWalletDetail}
              />
            ) : (
              <div className="empty-state">
                <ShieldAlert size={22} />
                <p>No abnormal wallets detected in the current market set.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel stream-panel">
        <div className="panel__header">
          <h2>WebSocket Stream</h2>
          <span className="panel__caption">
            Last 120 market-channel events across all subscribed tokens.
          </span>
        </div>

        <div className="stream-list">
          {websocketLog.slice(0, 12).map((entry) => (
            <details key={entry.key} className="stream-item">
              <summary>
                <span className="stream-item__type">{entry.eventType}</span>
                <span>{entry.marketId || entry.assetId}</span>
                <span>{formatDateTime(entry.timestamp)}</span>
              </summary>
              <pre>{safeJson(entry.payload)}</pre>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric-card">
      <div className="metric-card__icon">{icon}</div>
      <div>
        <span className="metric-card__label">{label}</span>
        <strong className="metric-card__value">{value}</strong>
      </div>
    </div>
  );
}

function StatusChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  return (
    <span className={clsx('status-chip', `status-chip--${tone}`)}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function PriceBlock({ outcome }: { outcome: OutcomeState }) {
  const websiteRuleLabel =
    outcome.displayMode === 'midpoint'
      ? 'midpoint'
      : outcome.displayMode === 'last_trade'
        ? 'last trade'
        : 'gamma';

  return (
    <div className="price-block">
      <span className="price-block__label">{outcome.shortLabel}</span>
      <strong>{formatProbability(outcome.displayPrice)}</strong>
      <span className="price-block__meta">
        bid {formatProbability(outcome.bestBid)} / ask {formatProbability(outcome.bestAsk)}
      </span>
      <span className="price-block__meta">site rule: {websiteRuleLabel}</span>
    </div>
  );
}

function MarketDetail({
  market,
  trades,
  holders,
  history,
}: {
  market: TrackedMarket;
  trades: MarketTrade[];
  holders: Record<string, HolderRecord[]>;
  history: PriceHistoryPoint[];
}) {
  const chartData = sortHistory(history).map((point) => ({
    t: point.t * 1000,
    price: point.p,
  }));

  return (
    <div className="detail-stack">
      <div className="detail-hero">
        <div>
          <div className="market-card__topics">
            {market.topics.map((topic) => {
              const definition = TOPIC_DEFINITIONS.find((item) => item.id === topic.topicId);
              return definition ? (
                <span
                  key={topic.topicId}
                  className="topic-pill"
                  style={
                    {
                      '--topic-accent': definition.accent,
                      '--topic-surface': definition.surface,
                    } as CSSProperties
                  }
                >
                  {definition.label}
                </span>
              ) : null;
            })}
          </div>
          <h3>{market.question}</h3>
          <p>{market.eventTitle}</p>
        </div>
        <a
          className="link-button"
          href={buildMarketUrl(market.rawGamma)}
          target="_blank"
          rel="noreferrer"
        >
          Open on Polymarket
          <ArrowUpRight size={16} />
        </a>
      </div>

      <div className="detail-grid">
        <div className="metric-slab">
          <span>24h volume</span>
          <strong>{formatCompactUsd(market.volume24hr)}</strong>
        </div>
        <div className="metric-slab">
          <span>Open interest</span>
          <strong>{formatCompactUsd(market.openInterest)}</strong>
        </div>
        <div className="metric-slab">
          <span>Liquidity</span>
          <strong>{formatCompactUsd(market.liquidity)}</strong>
        </div>
        <div className="metric-slab">
          <span>Closes</span>
          <strong>{market.endDate ? formatDateTime(market.endDate) : 'n/a'}</strong>
        </div>
      </div>

      <div className="detail-grid detail-grid--pricing">
        {market.outcomes.map((outcome) => (
          <div key={outcome.index} className="detail-card">
            <div className="detail-card__header">
              <strong>{outcome.label}</strong>
              <span>{formatProbability(outcome.displayPrice)}</span>
            </div>
            <div className="detail-card__metrics">
              <span>Bid {formatProbability(outcome.bestBid)}</span>
              <span>Ask {formatProbability(outcome.bestAsk)}</span>
              <span>Spread {formatProbability(outcome.spread)}</span>
              <span>Last trade {formatProbability(outcome.lastTradePrice)}</span>
            </div>

            <div className="orderbook">
              <div>
                <span className="orderbook__label">Bids</span>
                {(outcome.book?.bids ?? []).slice(0, 5).map((level) => (
                  <div key={`${level.price}-bid`} className="orderbook__row">
                    <span>{formatProbability(Number(level.price))}</span>
                    <span>{level.size}</span>
                  </div>
                ))}
              </div>
              <div>
                <span className="orderbook__label">Asks</span>
                {(outcome.book?.asks ?? []).slice(0, 5).map((level) => (
                  <div key={`${level.price}-ask`} className="orderbook__row">
                    <span>{formatProbability(Number(level.price))}</span>
                    <span>{level.size}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="detail-card detail-card--chart">
        <div className="detail-card__header">
          <strong>Price history</strong>
          <span>Selected outcome, last 24h</span>
        </div>
        <div className="chart-shell">
          {chartData.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#ff7b54" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#ff7b54" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="rgba(255,255,255,0.06)"
                />
                <XAxis
                  dataKey="t"
                  tickFormatter={(value) =>
                    new Intl.DateTimeFormat('en-US', { hour: 'numeric' }).format(
                      new Date(value),
                    )
                  }
                  stroke="rgba(241, 233, 215, 0.55)"
                />
                <YAxis
                  tickFormatter={(value) => `${Math.round(value * 100)}%`}
                  stroke="rgba(241, 233, 215, 0.55)"
                />
                <Tooltip
                  contentStyle={{
                    background: '#181b1d',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 16,
                  }}
                  formatter={(value) =>
                    formatProbability(typeof value === 'number' ? value : Number(value))
                  }
                  labelFormatter={(value) => formatDateTime(value)}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="#ff7b54"
                  strokeWidth={2.5}
                  fill="url(#priceGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state">
              <TrendingUp size={20} />
              <p>History is loading or unavailable for this token.</p>
            </div>
          )}
        </div>
      </div>

      <div className="detail-grid detail-grid--split">
        <div className="detail-card">
          <div className="detail-card__header">
            <strong>Recent trades</strong>
            <span>{trades.length} records</span>
          </div>
          <div className="table">
            {sortTrades(trades)
              .slice(0, 10)
              .map((trade) => (
                <div
                  key={`${trade.transactionHash}-${trade.timestamp}`}
                  className="table__row"
                >
                  <span>
                    {trade.name || trade.pseudonym || shortAddress(trade.proxyWallet)}
                  </span>
                  <span>{trade.side}</span>
                  <span>{formatProbability(trade.price)}</span>
                  <span>{formatCompactUsd(trade.size * trade.price)}</span>
                  <span>{formatRelativeTime(trade.timestamp)}</span>
                </div>
              ))}
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card__header">
            <strong>Top holders</strong>
            <span>Data API holder snapshots by token</span>
          </div>
          <div className="holder-columns">
            {market.outcomes.map((outcome) => (
              <div key={outcome.index}>
                <span className="orderbook__label">{outcome.label}</span>
                {(holders[outcome.assetId || ''] ?? []).slice(0, 6).map((holder) => (
                  <div
                    key={`${holder.proxyWallet}-${holder.amount}`}
                    className="table__row"
                  >
                    <span>
                      {holder.name || holder.pseudonym || shortAddress(holder.proxyWallet)}
                    </span>
                    <span>{holder.amount}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="raw-card">
        <summary>Raw Gamma payload</summary>
        <pre>{safeJson(market.rawGamma)}</pre>
      </details>

      <details className="raw-card">
        <summary>Raw CLOB outcome state</summary>
        <pre>{safeJson(market.outcomes)}</pre>
      </details>
    </div>
  );
}

function WalletDetailPanel({
  wallet,
  detail,
}: {
  wallet: WalletInsight;
  detail?: WalletDetailData;
}) {
  return (
    <div className="detail-stack">
      <div className="detail-hero">
        <div>
          <h3>{wallet.displayName}</h3>
          <p>{shortAddress(wallet.address)}</p>
        </div>
        <div className="wallet-score wallet-score--hero">{wallet.anomalyScore}</div>
      </div>

      <div className="detail-grid">
        <div className="metric-slab">
          <span>Total notional</span>
          <strong>{formatCompactUsd(wallet.totalNotional)}</strong>
        </div>
        <div className="metric-slab">
          <span>Largest trade</span>
          <strong>{formatCompactUsd(wallet.largestTradeNotional)}</strong>
        </div>
        <div className="metric-slab">
          <span>Markets traded</span>
          <strong>{formatCount(wallet.marketsTraded)}</strong>
        </div>
        <div className="metric-slab">
          <span>OI impact</span>
          <strong>{formatSignedPercent(wallet.oiImpact)}</strong>
        </div>
      </div>

      <div className="wallet-signals wallet-signals--detail">
        {wallet.signals.map((signal) => (
          <span key={signal} className="signal-pill">
            {signal}
          </span>
        ))}
      </div>

      <div className="detail-grid detail-grid--split">
        <div className="detail-card">
          <div className="detail-card__header">
            <strong>Recent activity</strong>
            <span>{detail?.activity?.length ?? 0} actions</span>
          </div>
          <div className="table">
            {(detail?.activity ?? []).slice(0, 12).map((activity: WalletActivityItem) => (
              <div
                key={`${activity.transactionHash}-${activity.timestamp}`}
                className="table__row"
              >
                <span>{activity.type}</span>
                <span>{activity.outcome || 'n/a'}</span>
                <span>{activity.side || 'n/a'}</span>
                <span>
                  {activity.usdcSize ? formatCompactUsd(activity.usdcSize) : 'n/a'}
                </span>
                <span>{formatRelativeTime(activity.timestamp)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card__header">
            <strong>Tracked positions</strong>
            <span>{detail?.positions?.length ?? 0} open positions</span>
          </div>
          <div className="table">
            {(detail?.positions ?? []).slice(0, 10).map((position: WalletPosition) => (
              <div key={`${position.asset}-${position.conditionId}`} className="table__row">
                <span>{position.title}</span>
                <span>{position.outcome}</span>
                <span>{formatCompactUsd(position.currentValue)}</span>
                <span>{formatSignedPercent(position.percentPnl / 100)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <details className="raw-card">
        <summary>Raw wallet detail</summary>
        <pre>{safeJson(detail ?? wallet)}</pre>
      </details>
    </div>
  );
}

function sortTrades(trades: MarketTrade[]) {
  return [...trades].sort((left, right) => right.timestamp - left.timestamp);
}

export default App;
