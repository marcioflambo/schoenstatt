-- Mantem apenas registros com store_key contendo o GUID informado
-- GUID alvo: 9d733f95-c8ee-4122-b755-5f305db5cdb2

-- 1) Preview do que sera mantido
SELECT
    store_key,
    updated_at
FROM app_json_store
WHERE store_key ILIKE '%9d733f95-c8ee-4122-b755-5f305db5cdb2%'
ORDER BY updated_at DESC;

-- 2) Preview do que sera removido
SELECT
    store_key,
    updated_at
FROM app_json_store
WHERE store_key NOT ILIKE '%9d733f95-c8ee-4122-b755-5f305db5cdb2%'
ORDER BY updated_at DESC;

-- 3) Contagem antes de excluir
SELECT
    COUNT(*) FILTER (WHERE store_key ILIKE '%9d733f95-c8ee-4122-b755-5f305db5cdb2%') AS manter,
    COUNT(*) FILTER (WHERE store_key NOT ILIKE '%9d733f95-c8ee-4122-b755-5f305db5cdb2%') AS excluir
FROM app_json_store;

-- 4) Exclusao (descomente para executar)
-- BEGIN;
-- DELETE FROM app_json_store
-- WHERE store_key NOT ILIKE '%9d733f95-c8ee-4122-b755-5f305db5cdb2%';
-- COMMIT;

