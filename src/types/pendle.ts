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
};

export const CHAIN_COLORS: Record<number, string> = {
  1: '#627EEA',
  42161: '#28A0F0',
  56: '#F0B90B',
  10: '#FF0420',
  5000: '#000000',
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  'implied_spike': 'Скачок подразумеваемой доходности',
  'underlying_spike': 'Скачок фактической доходности',
  'yield_divergence': 'Расхождение доходностей',
};

export const ALERT_TYPE_DESCRIPTIONS: Record<string, string> = {
  'implied_spike': 'Резкое изменение implied APY более чем на 20%',
  'underlying_spike': 'Резкое изменение underlying APY более чем на 20%',
  'yield_divergence': 'Фактическая доходность превышает подразумеваемую на 20%+',
};
