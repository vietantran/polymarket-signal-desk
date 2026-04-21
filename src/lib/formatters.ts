import type { GammaEvent, GammaMarket, PriceHistoryPoint } from '../types/polymarket';

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const fullCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat('en-US');

export function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeText(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseJsonArray(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
  } catch {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function toNumber(value: number | string | undefined | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCompactUsd(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return '$0';
  }

  return compactCurrency.format(value);
}

export function formatUsd(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return '$0';
  }

  return fullCurrency.format(value);
}

export function formatProbability(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  return percentFormatter.format(clamp(value, 0, 1));
}

export function formatSignedPercent(value?: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }

  const prefix = value > 0 ? '+' : '';
  return `${prefix}${(value * 100).toFixed(1)}%`;
}

export function formatCount(value: number) {
  return integerFormatter.format(value);
}

export function formatRelativeTime(value?: number | string) {
  if (!value) {
    return '—';
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  const deltaMs = date.getTime() - Date.now();
  const absoluteMs = Math.abs(deltaMs);

  if (absoluteMs < 60_000) {
    return 'just now';
  }

  const minutes = Math.round(absoluteMs / 60_000);
  if (minutes < 60) {
    return deltaMs < 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return deltaMs < 0 ? `${hours}h ago` : `in ${hours}h`;
  }

  const days = Math.round(hours / 24);
  return deltaMs < 0 ? `${days}d ago` : `in ${days}d`;
}

export function formatDateTime(value?: string | number) {
  if (!value) {
    return '—';
  }

  const date = typeof value === 'number' ? new Date(value) : new Date(value);

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date);
}

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function buildMarketUrl(market: GammaMarket) {
  const primaryEvent = market.events?.[0];
  const slug = primaryEvent?.slug ?? market.slug;

  return slug ? `https://polymarket.com/event/${slug}` : 'https://polymarket.com';
}

export function getPrimaryEvent(market: GammaMarket): GammaEvent | undefined {
  return market.events?.[0];
}

export function getMarketImage(market: GammaMarket) {
  return (
    market.imageOptimized?.imageUrlOptimized ??
    market.iconOptimized?.imageUrlOptimized ??
    market.image ??
    market.icon ??
    ''
  );
}

export function safeJson(value: unknown) {
  return JSON.stringify(
    value,
    (_, currentValue) => {
      if (typeof currentValue === 'bigint') {
        return currentValue.toString();
      }

      return currentValue;
    },
    2,
  );
}

export function sortHistory(history: PriceHistoryPoint[]) {
  return [...history].sort((left, right) => left.t - right.t);
}
