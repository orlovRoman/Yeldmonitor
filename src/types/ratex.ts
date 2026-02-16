export interface RateXPool {
    id: string;
    symbol: string;
    symbol_name: string;
    category_l1: string | null;
    category_l2: string | null;
    term: string | null;
    due_date: string | null;
    pt_mint: string | null;
    partners: string | null;
    partners_icon: string | null;
    partners_reward_boost: string | null;
    trade_commission: number;
    initial_lower_yield_range: number;
    initial_upper_yield_range: number;
    earn_w: number;
    ratex_id: number | null;
    created_at: string;
    updated_at: string;
}

export interface RateXRateHistory {
    id: string;
    pool_id: string;
    sum_price: number;
    lower_yield: number;
    upper_yield: number;
    earn_w: number;
    recorded_at: string;
}

export interface RateXAlert {
    id: string;
    pool_id: string;
    alert_type: 'price_spike';
    previous_value: number;
    current_value: number;
    change_percent: number;
    is_read: boolean;
    created_at: string;
    ratex_pools?: RateXPool;
}

export interface RateXPoolWithLatestRate extends RateXPool {
    latest_rate?: RateXRateHistory;
}
