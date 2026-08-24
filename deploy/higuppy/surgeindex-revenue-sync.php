<?php
/**
 * Read-only WooCommerce sales aggregate bridge for SurgeIndex.
 *
 * This file is executed by WP-CLI on the VPS, never loaded on a public page.
 * It sends only totals and timestamps; no order ids, customer data, or raw
 * commerce records leave WordPress.
 */

if (!defined('WP_CLI') || !WP_CLI) {
    fwrite(STDERR, "This bridge is only executable through WP-CLI.\n");
    exit(1);
}

$site_id = getenv('SURGEINDEX_HIGUPPY_SITE_ID');
$endpoint = getenv('SURGEINDEX_REVENUE_URL') ?: 'https://surgeindex.lol/api/internal/revenue';
$token = getenv('INTERNAL_SERVICE_TOKEN');
if (!$site_id || !$token) {
    WP_CLI::error('Revenue bridge environment is incomplete.');
}

if (!function_exists('wc_get_orders') || !function_exists('wc_get_order')) {
    WP_CLI::error('WooCommerce is not loaded; no sales aggregate was sent.');
}

$order_ids = wc_get_orders([
    'status' => ['processing', 'completed'],
    'limit' => -1,
    'return' => 'ids',
]);
$gross = 0.0;
$refunded = 0.0;
$order_count = 0;
$last_order_at = null;

foreach ($order_ids as $order_id) {
    $order = wc_get_order($order_id);
    if (!$order) {
        continue;
    }
    $gross += (float) $order->get_total();
    $refunded += (float) $order->get_total_refunded();
    $order_count++;
    $created = $order->get_date_created();
    if ($created) {
        $candidate = $created->date('c');
        if ($last_order_at === null || strtotime($candidate) > strtotime($last_order_at)) {
            $last_order_at = $candidate;
        }
    }
}

$currency = function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD';
$gross_cents = max(0, (int) round($gross * 100));
$refunded_cents = min($gross_cents, max(0, (int) round($refunded * 100)));
$body = [
    'siteId' => $site_id,
    'source' => 'woocommerce',
    'currency' => strtoupper((string) $currency),
    'grossAmountCents' => $gross_cents,
    'refundedAmountCents' => $refunded_cents,
    'orderCount' => $order_count,
    'lastOrderAt' => $last_order_at,
    'periodStart' => null,
    'periodEnd' => gmdate('c'),
    'status' => 'connected',
    // The public board is intentionally modelled after afford.bid: this site
    // has opted into showing its provider-reported net sales total.
    'publicVisible' => true,
    'providerDefinitionVersion' => 'woocommerce-orders-v1',
    'metadata' => [
        'siteDomain' => 'higuppy.com',
        'includedStatuses' => ['processing', 'completed'],
        'excludesCancelledAndOnHold' => true,
    ],
];

$response = wp_remote_post($endpoint, [
    'timeout' => 15,
    'headers' => [
        'Authorization' => 'Bearer ' . $token,
        'Content-Type' => 'application/json',
    ],
    'body' => wp_json_encode($body),
]);
if (is_wp_error($response)) {
    WP_CLI::error('SurgeIndex revenue endpoint failed: ' . $response->get_error_code());
}
$status = (int) wp_remote_retrieve_response_code($response);
if ($status < 200 || $status >= 300) {
    WP_CLI::error('SurgeIndex revenue endpoint returned HTTP ' . $status . '.');
}

WP_CLI::log(sprintf('Synced WooCommerce aggregate: %d orders, %s gross, %s refunded.', $order_count, $currency . ' ' . number_format($gross_cents / 100, 2), $currency . ' ' . number_format($refunded_cents / 100, 2)));
