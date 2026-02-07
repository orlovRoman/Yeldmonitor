export interface PendlePool {
  id: string;
  chain_id: number;
  market_address: string;
  name: string;
  underlying_asset: string | null;
  pt_address: string | null;
  yt_address: string | null;
  sy_address: string | null;
  expiry: string | null;
  created_at: string;
  updated_at: string;
}

export interface PendleRateHistory {
  id: string;
  pool_id: string;
  implied_apy: number;
  underlying_apy: number;
  liquidity: number;
  volume_24h: number;
  recorded_at: string;
}

export interface PendleAlert {
  id: string;
  pool_id: string;
  alert_type: 'implied_spike' | 'underlying_spike' | 'yield_divergence';
  previous_value: number;
  current_value: number;
  change_percent: number;
  ai_analysis: string | null;
  sources: string[] | null;
  status: 'new' | 'reviewed' | 'dismissed';
  created_at: string;
  pendle_pools?: PendlePool;
}

export interface PoolWithLatestRate extends PendlePool {
  latest_rate?: PendleRateHistory;
}

export const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  56: 'BNB Chain',
  10: 'Optimism',
  5000: 'Mantle',
  8453: 'Base',
  146: 'Sonic',
  999: 'Hyperliquid',
  21000000: 'Corn',
  80094: 'Berachain',
  14: 'Flare',
  43114: 'Avalanche',
  747474: 'Katana',
};

export const CHAIN_COLORS: Record<number, string> = {
  1: '#627EEA',
  42161: '#28A0F0',
  56: '#F0B90B',
  10: '#FF0420',
  5000: '#000000',
  8453: '#0052FF',
  146: '#19FB9B',
  999: '#50D5FF',
  21000000: '#FFD700',
  80094: '#FF6B35',
  14: '#E62058',
  43114: '#E84142',
  747474: '#8B5CF6',
};

export const CHAIN_SLUGS: Record<number, string> = {
  1: 'ethereum',
  42161: 'arbitrum',
  56: 'bsc',
  10: 'optimism',
  5000: 'mantle',
  8453: 'base',
  146: 'sonic',
  999: 'hyperliquid',
  21000000: 'corn',
  80094: 'berachain',
  14: 'flare',
  43114: 'avalanche',
  747474: 'katana',
};

// Spectra chain slugs for URL generation
export const SPECTRA_CHAIN_SLUGS: Record<number, string> = {
  1: 'eth',
  42161: 'arbitrum',
  10: 'op',
  8453: 'base',
  146: 'sonic',
  43114: 'avax',
  56: 'bsc',
  14: 'flare',
  747474: 'katana',
  999: 'hyperevm',
};

// Helper to check if a pool is from Spectra
export const isSpectraPool = (pool: { name?: string; market_address?: string } | null | undefined): boolean => {
  if (!pool) return false;
  return pool.name?.startsWith('[Spectra]') || pool.market_address?.startsWith('spectra-') || false;
};

// Helper to get platform name
export const getPlatformName = (pool: { name?: string; market_address?: string } | null | undefined): 'Spectra' | 'Pendle' => {
  return isSpectraPool(pool) ? 'Spectra' : 'Pendle';
};

// Helper to get market URL based on platform
export const getMarketUrl = (pool: { chain_id: number; market_address: string; name?: string } | null | undefined): string => {
  if (!pool) return '#';
  
  if (isSpectraPool(pool)) {
    // Spectra YT trading URL format: https://app.spectra.finance/trade-yield?network={chain}
    const chainSlug = SPECTRA_CHAIN_SLUGS[pool.chain_id] || 'eth';
    return `https://app.spectra.finance/trade-yield?network=${chainSlug}`;
  } else {
    // Pendle URL format
    const chainSlug = CHAIN_SLUGS[pool.chain_id] || 'ethereum';
    return `https://app.pendle.finance/trade/markets/${pool.market_address}?chain=${chainSlug}`;
  }
};

// Helper to get direction label based on change
export const getDirectionLabel = (changePercent: number): string => {
  return changePercent >= 0 ? 'Рост' : 'Падение';
};

export const ALERT_TYPE_LABELS_BASE: Record<string, string> = {
  'implied_spike': 'Implied APY (YT)',
  'underlying_spike': 'Underlying APY',
  'yield_divergence': 'Расхождение Implied vs Underlying',
};

export const getAlertTypeLabel = (alertType: string, changePercent: number | null): string => {
  if (alertType === 'yield_divergence') {
    return 'Расхождение Implied vs Underlying';
  }
  const direction = changePercent !== null ? getDirectionLabel(changePercent) : 'Изменение';
  const base = ALERT_TYPE_LABELS_BASE[alertType] || alertType;
  return `${direction} ${base}`;
};

// Legacy export for compatibility
export const ALERT_TYPE_LABELS: Record<string, string> = {
  'implied_spike': 'Изменение Implied APY (YT)',
  'underlying_spike': 'Изменение Underlying APY',
  'yield_divergence': 'Расхождение Implied vs Underlying',
};

export const ALERT_PARAM_LABELS: Record<string, { before: string; after: string }> = {
  'implied_spike': { before: 'Implied APY (было)', after: 'Implied APY (стало)' },
  'underlying_spike': { before: 'Underlying APY (было)', after: 'Underlying APY (стало)' },
  'yield_divergence': { before: 'Implied APY', after: 'Underlying APY' },
};

export const ALERT_TYPE_DESCRIPTIONS: Record<string, string> = {
  'implied_spike': 'Резкое изменение implied APY более чем на 20%',
  'underlying_spike': 'Резкое изменение underlying APY более чем на 20%',
  'yield_divergence': 'Фактическая доходность превышает подразумеваемую на 20%+',
};
