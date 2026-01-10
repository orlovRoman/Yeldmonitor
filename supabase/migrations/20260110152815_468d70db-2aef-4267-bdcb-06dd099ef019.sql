-- Удалить алерты для истёкших пулов
DELETE FROM pendle_alerts 
WHERE pool_id IN (SELECT id FROM pendle_pools WHERE expiry < NOW());

-- Удалить историю ставок для истёкших пулов  
DELETE FROM pendle_rates_history 
WHERE pool_id IN (SELECT id FROM pendle_pools WHERE expiry < NOW());

-- Удалить истёкшие пулы
DELETE FROM pendle_pools WHERE expiry < NOW();