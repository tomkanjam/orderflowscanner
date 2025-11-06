SELECT 
    id,
    name,
    filter->>'code' as filter_code,
    filter->>'seriesCode' as series_code,
    filter->'indicators' as indicators,
    created_at
FROM traders 
WHERE name LIKE '%RSI%Oversold%'
ORDER BY created_at DESC 
LIMIT 1;
